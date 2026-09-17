from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.config import ROOT_DIR, get_settings
from app.database.session import SessionLocal

# NOTE: ``gspread`` and ``google-auth`` are optional runtime dependencies. They are
# imported lazily inside the client so a missing package degrades the Sheets
# integration (reported via /api/sheets/status) instead of failing backend boot.

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sheets", tags=["sheets"])

SHEET_COLUMNS = [
    "id",
    "name",
    "company",
    "email",
    "phone",
    "website",
    "industry",
    "services",
    "score",
    "status",
    "assigned_to",
    "follow_up",
    "conversation_id",
    "created_at",
]


def normalize_lead(lead: dict[str, Any]) -> dict[str, str]:
    """Map either the API shape or the lead-capture shape onto sheet columns."""
    services = lead.get("services")
    if services is None:
        services = lead.get("required_services")
    if isinstance(services, str):
        service_list = [part.strip() for part in services.split(",") if part.strip()]
    elif isinstance(services, (list, tuple)):
        service_list = [str(item).strip() for item in services if str(item).strip()]
    else:
        service_list = []
    return {
        "id": str(lead.get("id") or ""),
        "name": str(lead.get("name") or lead.get("full_name") or ""),
        "company": str(lead.get("company") or lead.get("company_name") or ""),
        "email": str(lead.get("email") or ""),
        "phone": str(lead.get("phone") or ""),
        "website": str(lead.get("website") or lead.get("website_url") or ""),
        "industry": str(lead.get("industry") or ""),
        "services": ", ".join(service_list),
        "score": str(lead.get("score") or lead.get("lead_score") or "0"),
        "status": str(lead.get("status") or "new"),
        "assigned_to": str(lead.get("assigned_to") or ""),
        "follow_up": str(lead.get("follow_up") or lead.get("follow_up_date") or ""),
        "conversation_id": str(lead.get("conversation_id") or lead.get("session_id") or ""),
        "created_at": str(lead.get("created_at") or ""),
    }


class GoogleSheetsClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _credential_path(self) -> Path:
        """Locate the service-account JSON across the known configuration keys.

        ``GOOGLE_SERVICE_ACCOUNT_JSON`` may point at a file that was never created
        while the real key sits at ``GOOGLE_APPLICATION_CREDENTIALS`` (or the
        conventional ``google-credentials.json`` at the repo root). Try each in
        order so a single stale env var cannot break the integration.
        """
        candidates: list[Path] = []
        if self.settings.google_service_account_json:
            candidates.append(Path(self.settings.google_service_account_json))
        env_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if env_path:
            candidates.append(Path(env_path))
        candidates.append(ROOT_DIR / "google-credentials.json")
        for candidate in candidates:
            resolved = candidate if candidate.is_absolute() else (ROOT_DIR / candidate).resolve()
            if resolved.exists():
                return resolved
        raise FileNotFoundError(
            "No Google service account JSON found. Checked: "
            + ", ".join(str(item) for item in candidates)
        )

    def _require_config(self) -> None:
        if not self.settings.google_sheet_id:
            raise RuntimeError("GOOGLE_SHEET_ID is not configured.")

    def _worksheet(self):
        self._require_config()
        try:
            import gspread
            from google.oauth2.service_account import Credentials
        except ModuleNotFoundError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError(
                "Google Sheets libraries are not installed. Run: pip install gspread google-auth"
            ) from exc
        service_account_path = self._credential_path()
        scopes = ["https://www.googleapis.com/auth/spreadsheets"]
        credentials = Credentials.from_service_account_file(str(service_account_path), scopes=scopes)
        client = gspread.authorize(credentials)
        return client.open_by_key(self.settings.google_sheet_id).sheet1

    async def upsert_lead(self, lead: dict[str, Any]) -> dict[str, str]:
        self._require_config()
        worksheet = self._worksheet()
        row_lead = normalize_lead(lead)

        rows = worksheet.get_all_values()
        if not rows or not rows[0] or [cell.strip() for cell in rows[0]] != SHEET_COLUMNS:
            # Fresh sheet (or drifted header row): guarantee a known column order.
            if not rows:
                worksheet.append_row(SHEET_COLUMNS)
            else:
                worksheet.insert_row(SHEET_COLUMNS, 1)
            rows = worksheet.get_all_values()

        email = row_lead["email"].strip().lower()
        row_values = [row_lead[column] for column in SHEET_COLUMNS]

        target_index: int | None = None
        if email:
            for index, row in enumerate(rows[1:], start=2):
                if len(row) > 3 and row[3].strip().lower() == email:
                    target_index = index
                    break
        if target_index is None:
            worksheet.append_row(row_values)
            return {"status": "synced", "mode": "inserted"}
        worksheet.update(f"A{target_index}:N{target_index}", [row_values])
        return {"status": "synced", "mode": "updated"}


class SheetSyncRequest(BaseModel):
    lead_id: str | None = None
    lead: dict[str, Any] | None = None


def _fetch_lead(lead_id: str) -> dict[str, Any] | None:
    with SessionLocal() as db:
        row = db.execute(
            text(
                """
                SELECT id, full_name, company_name, email, phone, website_url, industry,
                       required_services, lead_score, status, assigned_to, created_at
                FROM leads WHERE id = CAST(:id AS uuid) LIMIT 1
                """
            ),
            {"id": lead_id},
        ).fetchone()
    return dict(row._mapping) if row is not None else None


def _fetch_all_leads() -> list[dict[str, Any]]:
    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT id, full_name, company_name, email, phone, website_url, industry,
                       required_services, lead_score, status, assigned_to, created_at
                FROM leads ORDER BY created_at DESC
                """
            )
        ).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/status")
async def sheets_status() -> dict[str, Any]:
    """Report whether the Google Sheets integration can actually connect."""
    client = GoogleSheetsClient()
    try:
        worksheet = client._worksheet()
        return {
            "configured": True,
            "connected": True,
            "sheet_id": client.settings.google_sheet_id,
            "title": worksheet.spreadsheet.title,
            "worksheet": worksheet.title,
        }
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator console
        logger.warning("sheets_status_failed: %s", exc)
        return {
            "configured": bool(client.settings.google_sheet_id),
            "connected": False,
            "sheet_id": client.settings.google_sheet_id,
            "error": str(exc),
        }


@router.post("/sync")
async def sync_single(payload: SheetSyncRequest) -> dict[str, Any]:
    """Upsert one lead (by id or explicit payload) into the Google Sheet."""
    lead = payload.lead
    if lead is None and payload.lead_id:
        lead = _fetch_lead(payload.lead_id)
    if lead is None:
        raise HTTPException(status_code=400, detail="Provide 'lead' or a valid 'lead_id'.")
    try:
        result = await GoogleSheetsClient().upsert_lead(lead)
    except Exception as exc:  # noqa: BLE001
        logger.warning("sheets_sync_failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {**result, "lead_id": normalize_lead(lead)["id"]}


@router.post("/sync-all")
async def sync_all() -> dict[str, Any]:
    """Push every stored lead to the Google Sheet (idempotent upsert)."""
    client = GoogleSheetsClient()
    leads = _fetch_all_leads()
    synced = 0
    failed: list[dict[str, str]] = []
    for lead in leads:
        try:
            await client.upsert_lead(lead)
            synced += 1
        except Exception as exc:  # noqa: BLE001 - report per-lead failures
            logger.warning("sheets_sync_failed for %s: %s", lead.get("id"), exc)
            failed.append({"id": str(lead.get("id")), "error": str(exc)})
    return {"total": len(leads), "synced": synced, "failed": failed}
