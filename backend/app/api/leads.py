from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/leads", tags=["leads"])


def _rows(query: str, params: dict | None = None) -> list[dict]:
    try:
        with SessionLocal() as db:
            rows = db.execute(text(query), params or {}).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _exec(query: str, params: dict | None = None) -> None:
    with SessionLocal() as db:
        db.execute(text(query), params or {})
        db.commit()


class LeadIn(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    company_name: str | None = None
    website_url: str | None = None
    industry: str | None = None
    lead_temperature: str | None = "Cold"
    lead_score: str | None = "0"
    assigned_to: str | None = None
    status: str | None = "new"
    notes: str | None = None


@router.get("")
async def list_leads(
    source: str | None = None,
    temperature: str | None = None,
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    where = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if temperature and temperature != "All":
        where.append("lead_score = :temperature")
        params["temperature"] = temperature
    if search:
        where.append("(full_name ILIKE :search OR email ILIKE :search OR company_name ILIKE :search)")
        params["search"] = f"%{search}%"
    query = f"""
        SELECT id, full_name, email, phone, company_name, website_url, industry,
               required_services, lead_score, assigned_to, status, notes, created_at
        FROM leads
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """
    return _rows(query, params)


@router.post("", status_code=201)
async def create_lead(body: LeadIn) -> dict:
    data = body.model_dump()
    rows = _rows(
        """
        INSERT INTO leads (full_name, email, phone, company_name, website_url, industry,
                           lead_score, assigned_to, status, notes, created_at, updated_at)
        VALUES (:full_name, :email, :phone, :company_name, :website_url, :industry,
                :lead_score, :assigned_to, :status, :notes, NOW(), NOW())
        RETURNING id, full_name, email, phone, company_name, website_url, industry,
                  lead_score, assigned_to, status, notes, created_at
        """,
        data,
    )
    return rows[0]


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, body: LeadIn) -> dict:
    data = body.model_dump()
    rows = _rows(
        """
        UPDATE leads SET full_name=:full_name, email=:email, phone=:phone,
               company_name=:company_name, website_url=:website_url, industry=:industry,
               lead_score=:lead_score, assigned_to=:assigned_to, status=:status,
               notes=:notes, updated_at=NOW()
        WHERE id=CAST(:id AS uuid)
        RETURNING id, full_name, email, phone, company_name, website_url, industry,
                  lead_score, assigned_to, status, notes, created_at
        """,
        {**data, "id": lead_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    return rows[0]


@router.get("/{lead_id}")
async def get_lead(lead_id: str) -> dict:
    rows = _rows(
        """
        SELECT l.*, c.messages as conversation_history
        FROM leads l
        LEFT JOIN conversations c ON c.session_id = l.session_id
        WHERE l.id = CAST(:id AS uuid)
        LIMIT 1
        """,
        {"id": lead_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    row = rows[0]
    history = row.get("conversation_history") or []
    return {
        **row,
        "conversation_history": [
            {"role": str(item.get("role", "user")), "content": str(item.get("content", "")), "created_at": item.get("created_at", "")}
            for item in history
            if isinstance(item, dict)
        ],
    }


@router.delete("/{lead_id}", status_code=204, response_class=Response)
async def delete_lead(lead_id: str):
    _exec("DELETE FROM leads WHERE id=CAST(:id AS uuid)", {"id": lead_id})
    return Response(status_code=204)