from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.config import get_settings
from app.database.models import Lead
from app.database.session import SessionLocal
from app.integrations.google_sheets import GoogleSheetsClient

router = APIRouter(prefix="/api", tags=["crm"])


class LeadCreateRequest(BaseModel):
    name: str | None = None
    company: str | None = None
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    industry: str | None = None
    services: list[str] | None = None
    score: int | None = None
    status: str | None = None
    assigned_to: str | None = None
    follow_up: str | None = None
    conversation_id: str | None = None


class LeadUpdateRequest(LeadCreateRequest):
    pass


settings = get_settings()
_lead_assign_index = 0


def _normalize_services(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [str(item).strip() for item in value if str(item).strip()]


def _get_sales_rep() -> str:
    global _lead_assign_index
    reps = settings.sales_reps_list or ["John Smith", "Jane Doe"]
    rep = reps[_lead_assign_index % len(reps)]
    _lead_assign_index += 1
    return rep


def _serialize_lead(row: Lead) -> dict[str, object]:
    assigned_to = getattr(row, "assigned_to", None) or getattr(row, "assigned_sales_rep", None)
    follow_up = getattr(row, "follow_up_date", None) or getattr(row, "follow_up_at", None)
    temperature = getattr(row, "lead_temperature", None)
    return {
        "id": str(row.id),
        "name": row.full_name,
        "company": row.company_name,
        "email": row.email,
        "phone": row.phone,
        "website": row.website_url,
        "industry": row.industry,
        "services": row.required_services or [],
        "score": row.lead_score or 0,
        "status": row.status,
        "assigned_to": assigned_to,
        "follow_up": follow_up.isoformat() if hasattr(follow_up, "isoformat") else follow_up,
        "conversation_id": str(getattr(row, "conversation_id", None) or getattr(row, "session_id", "") or "") or None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "lead_temperature": temperature or _temperature_from_score(row.lead_score),
    }


def _temperature_from_score(score: int | str | None) -> str:
    try:
        numeric = int(score or 0)
    except Exception:
        numeric = 0
    if numeric >= 70:
        return "Hot"
    if numeric >= 40:
        return "Warm"
    return "Cold"


async def _sync_sheet(lead: dict[str, object]) -> None:
    try:
        await GoogleSheetsClient().upsert_lead(lead)
    except Exception:
        pass


def create_lead_record(payload: dict[str, object]) -> dict[str, object]:
    name = str(payload.get("name") or payload.get("full_name") or "").strip()
    company = str(payload.get("company") or payload.get("company_name") or "").strip()
    email = str(payload.get("email") or "").strip()
    phone = str(payload.get("phone") or "").strip()
    website = str(payload.get("website") or payload.get("website_url") or "").strip()
    industry = str(payload.get("industry") or "").strip()
    services = _normalize_services(payload.get("services"))
    score = int(payload.get("score") or 0)
    status = str(payload.get("status") or "open")
    conversation_id = payload.get("conversation_id")
    follow_up = payload.get("follow_up")
    with SessionLocal() as db:
        existing = db.execute(text("SELECT * FROM leads WHERE email = :email LIMIT 1"), {"email": email}).fetchone() if email else None
        if existing:
            lead_id = existing.id
            db.execute(
                text(
                    "UPDATE leads SET full_name=:name, company_name=:company, phone=:phone, website_url=:website, industry=:industry, required_services=:services, lead_score=:score, lead_temperature=:temperature, status=:status, assigned_to=:assigned_to, follow_up_date=:follow_up, updated_at=NOW() WHERE id=:id"
                ),
                {
                    "id": lead_id,
                    "name": name or existing.full_name,
                    "company": company or existing.company_name,
                    "phone": phone or existing.phone,
                    "website": website or existing.website_url,
                    "industry": industry or existing.industry,
                    "services": services or existing.required_services,
                    "score": score or existing.lead_score,
                    "temperature": _temperature_from_score(score or existing.lead_score),
                    "status": status,
                    "assigned_to": getattr(existing, "assigned_to", None) or getattr(existing, "assigned_sales_rep", None) or _get_sales_rep(),
                    "follow_up": follow_up or getattr(existing, "follow_up_date", None) or getattr(existing, "follow_up_at", None),
                },
            )
            db.commit()
            row = db.execute(text("SELECT * FROM leads WHERE id=:id"), {"id": lead_id}).fetchone()
            lead = _serialize_lead(row)
            lead["lead_temperature"] = _temperature_from_score(lead.get("score"))
            return lead

        lead_id = uuid.uuid4()
        lead_row = {
            "id": str(lead_id),
            "full_name": name,
            "company_name": company,
            "email": email,
            "phone": phone,
            "website_url": website,
            "industry": industry,
            "required_services": services,
            "lead_score": score,
            "lead_temperature": _temperature_from_score(score),
            "status": status,
            "assigned_to": payload.get("assigned_to") or _get_sales_rep(),
            "follow_up_date": follow_up or (datetime.utcnow() + timedelta(days=2)).isoformat(),
            "conversation_id": conversation_id,
            "created_at": datetime.utcnow().isoformat(),
        }
        db.execute(
            text(
                "INSERT INTO leads (id, full_name, company_name, email, phone, website_url, industry, required_services, lead_score, lead_temperature, status, assigned_to, follow_up_date, conversation_id, created_at, updated_at) VALUES (:id, :full_name, :company_name, :email, :phone, :website_url, :industry, :required_services, :lead_score, :lead_temperature, :status, :assigned_to, :follow_up_date, :conversation_id, :created_at, NOW())"
            ),
            {
                **lead_row,
                "required_services": services,
                "follow_up_date": follow_up or (datetime.utcnow() + timedelta(days=2)).isoformat(),
                "conversation_id": conversation_id,
            },
        )
        db.commit()
        result = {
            "id": str(lead_id),
            "name": name,
            "company": company,
            "email": email,
            "phone": phone,
            "website": website,
            "industry": industry,
            "services": services,
            "score": score,
            "status": status,
            "assigned_to": lead_row["assigned_to"],
            "follow_up": lead_row["follow_up_date"],
            "conversation_id": conversation_id,
            "created_at": lead_row["created_at"],
            "lead_temperature": lead_row["lead_temperature"],
        }
        return result


@router.get("/leads")
async def list_leads(
    status: str | None = Query(default=None),
    assigned_to: str | None = Query(default=None),
    email: str | None = Query(default=None),
) -> list[dict[str, object]]:
    with SessionLocal() as db:
        query = "SELECT * FROM leads"
        clauses: list[str] = []
        params: dict[str, object] = {}
        if status:
            clauses.append("status = :status")
            params["status"] = status
        if assigned_to:
            clauses.append("assigned_to = :assigned_to")
            params["assigned_to"] = assigned_to
        if email:
            clauses.append("email = :email")
            params["email"] = email
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC LIMIT 100"
        rows = db.execute(text(query), params).fetchall()
    return [_serialize_lead(row) for row in rows]


@router.post("/leads")
async def create_lead(payload: LeadCreateRequest) -> dict[str, object]:
    result = create_lead_record(payload.model_dump(exclude_none=True))
    await _sync_sheet(result)
    return result


@router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdateRequest) -> dict[str, object]:
    data = payload.model_dump(exclude_none=True)
    with SessionLocal() as db:
        row = db.execute(text("SELECT * FROM leads WHERE id = CAST(:id AS uuid) LIMIT 1"), {"id": lead_id}).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        updates: list[str] = []
        params: dict[str, object] = {"id": lead_id}
        for key, value in data.items():
            if key == "name":
                updates.append("full_name = :name")
                params["name"] = value
            elif key == "company":
                updates.append("company_name = :company")
                params["company"] = value
            elif key == "email":
                updates.append("email = :email")
                params["email"] = value
            elif key == "phone":
                updates.append("phone = :phone")
                params["phone"] = value
            elif key == "website":
                updates.append("website_url = :website")
                params["website"] = value
            elif key == "industry":
                updates.append("industry = :industry")
                params["industry"] = value
            elif key == "services":
                updates.append("required_services = :services")
                params["services"] = _normalize_services(value)
            elif key == "score":
                updates.append("lead_score = :score")
                params["score"] = value
            elif key == "status":
                updates.append("status = :status")
                params["status"] = value
            elif key == "assigned_to":
                updates.append("assigned_to = :assigned_to")
                params["assigned_to"] = value
            elif key == "follow_up":
                updates.append("follow_up_date = :follow_up")
                params["follow_up"] = value
            elif key == "conversation_id":
                updates.append("conversation_id = :conversation_id")
                params["conversation_id"] = value
        if not updates:
            return _serialize_lead(row)
        updates.append("updated_at = NOW()")
        db.execute(text(f"UPDATE leads SET {', '.join(updates)} WHERE id = CAST(:id AS uuid)"), params)
        db.commit()
        updated = db.execute(text("SELECT * FROM leads WHERE id = :id::uuid LIMIT 1"), {"id": lead_id}).fetchone()
    result = _serialize_lead(updated)
    await _sync_sheet(result)
    return result


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str) -> dict[str, object]:
    with SessionLocal() as db:
        row = db.execute(text("SELECT * FROM leads WHERE id = CAST(:id AS uuid) LIMIT 1"), {"id": lead_id}).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        return _serialize_lead(row)


@router.get("/leads/{lead_id}/conversation")
async def get_lead_conversation(lead_id: str) -> dict[str, object]:
    with SessionLocal() as db:
        row = db.execute(text("SELECT conversation_id, conversation_history FROM leads WHERE id = CAST(:id AS uuid) LIMIT 1"), {"id": lead_id}).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Lead not found")
        conversation = row.conversation_history or []
        return {"lead_id": lead_id, "conversation": conversation}
