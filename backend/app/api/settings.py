from __future__ import annotations

import json

from fastapi import APIRouter
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Keys whose values are secrets and should be masked when read back.
SECRET_KEYS = {
    "gemini_api_key",
    "calcom_api_key",
    "mailjet_api_key",
    "mailjet_secret",
    "google_sheets_credentials",
    "google_application_credentials",
    "openai_api_key",
    "supabase_key",
}
MASK = "••••••••••••"

DEFAULT_SETTINGS: dict[str, dict[str, object]] = {
    "general": {
        "site_name": "AI Sales Agent",
        "timezone": "UTC",
        "language": "English",
    },
    "ai_agent": {
        "gemini_api_key": "",
        "model": "gemini-flash-latest",
        "agent_name": "Ava",
        "temperature": 0.4,
        "system_prompt": "",
        "rag_top_k": 5,
        "similarity_threshold": 0.15,
    },
    "integrations": {
        "calcom_api_key": "",
        "calcom_event_type": "",
        "mailjet_api_key": "",
        "mailjet_secret": "",
        "google_sheets_credentials": "",
        "supabase_url": "",
        "supabase_key": "",
    },
    "notifications": {
        "new_lead_alert": "Email",
        "meeting_booked": "Email",
        "follow_up_reminder": "Email",
    },
    "advanced": {
        "crawler_max_pages": 20,
        "crawl_delay": 0.5,
        "crawl_timeout": 30,
        "cache_ttl": 3600,
    },
}


def _ensure_settings_table() -> None:
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS app_settings (
                      key         TEXT        PRIMARY KEY,
                      value       JSONB       NOT NULL DEFAULT '{}'::jsonb,
                      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
            )
            db.commit()
    except Exception:
        pass


def _load_section(key: str) -> dict[str, object]:
    try:
        with SessionLocal() as db:
            row = db.execute(
                text("SELECT value FROM app_settings WHERE key = :key"), {"key": key}
            ).fetchone()
        if row and row[0]:
            return dict(row[0])
    except Exception:
        pass
    return dict(DEFAULT_SETTINGS.get(key, {}))


def _mask(value: object, key: str) -> object:
    if key in SECRET_KEYS and isinstance(value, str) and value:
        return MASK
    return value


_ensure_settings_table()


@router.get("")
async def get_settings() -> dict[str, dict[str, object]]:
    return {
        section: {k: _mask(v, k) for k, v in _load_section(section).items()}
        for section in DEFAULT_SETTINGS
    }


@router.put("")
async def save_settings(payload: dict[str, dict[str, object]]) -> dict[str, object]:
    saved: list[str] = []
    for section, values in payload.items():
        if section not in DEFAULT_SETTINGS or not isinstance(values, dict):
            continue
        merged = _load_section(section)
        for key, value in values.items():
            if isinstance(value, str) and value == MASK:
                # Masked secrets were not edited — keep the stored value.
                continue
            merged[key] = value
        try:
            with SessionLocal() as db:
                db.execute(
                    text(
                        """
                        INSERT INTO app_settings (key, value, updated_at)
                        VALUES (:key, CAST(:value AS jsonb), now())
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                        """
                    ),
                    {"key": section, "value": json.dumps(merged)},
                )
                db.commit()
            saved.append(section)
        except Exception:
            continue
    return {"saved": len(saved), "sections": saved}
