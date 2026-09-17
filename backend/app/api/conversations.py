from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _rows(query: str, params: dict | None = None) -> list[dict]:
    try:
        with SessionLocal() as db:
            rows = db.execute(text(query), params or {}).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _serialize(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else (str(value) if value is not None else None)


@router.get("")
async def list_conversations(limit: int = 50, offset: int = 0) -> list[dict]:
    """Real conversations from the database, joined with any captured lead."""
    rows = _rows(
        """
        SELECT c.session_id, c.status, c.messages, c.lead_data, c.lead_score,
               c.created_at, c.updated_at,
               l.full_name AS lead_name, l.company_name, l.email AS lead_email,
               l.status AS lead_status, l.assigned_to
        FROM conversations c
        LEFT JOIN leads l ON l.session_id = c.session_id
        ORDER BY c.updated_at DESC
        LIMIT :limit OFFSET :offset
        """,
        {"limit": limit, "offset": offset},
    )
    conversations: list[dict] = []
    for row in rows:
        messages = row.get("messages") or []
        lead_data = row.get("lead_data") or {}
        last_message = messages[-1] if isinstance(messages, list) and messages else {}
        conversations.append(
            {
                "session_id": row.get("session_id"),
                "status": row.get("status") or "active",
                "message_count": len(messages) if isinstance(messages, list) else 0,
                "last_message": str(last_message.get("content", ""))[:160],
                "language": lead_data.get("language") if isinstance(lead_data, dict) else None,
                "lead_score": row.get("lead_score"),
                "lead_name": row.get("lead_name") or (lead_data.get("name") if isinstance(lead_data, dict) else None),
                "company_name": row.get("company_name") or (lead_data.get("company") if isinstance(lead_data, dict) else None),
                "lead_email": row.get("lead_email") or (lead_data.get("email") if isinstance(lead_data, dict) else None),
                "lead_status": row.get("lead_status"),
                "assigned_to": row.get("assigned_to"),
                "created_at": _serialize(row.get("created_at")),
                "updated_at": _serialize(row.get("updated_at")),
            }
        )
    return conversations


@router.get("/{session_id}")
async def get_conversation(session_id: str) -> dict:
    rows = _rows(
        """
        SELECT c.session_id, c.status, c.messages, c.lead_data, c.lead_score,
               c.created_at, c.updated_at,
               l.full_name AS lead_name, l.company_name, l.email AS lead_email,
               l.status AS lead_status, l.assigned_to
        FROM conversations c
        LEFT JOIN leads l ON l.session_id = c.session_id
        WHERE c.session_id = :session_id
        LIMIT 1
        """,
        {"session_id": session_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")
    row = rows[0]
    messages = row.get("messages") or []
    return {
        "session_id": row.get("session_id"),
        "status": row.get("status") or "active",
        "messages": [
            {"role": str(item.get("role", "user")), "content": str(item.get("content", ""))}
            for item in messages
            if isinstance(item, dict)
        ],
        "lead_data": row.get("lead_data") or {},
        "lead_score": row.get("lead_score"),
        "lead_name": row.get("lead_name"),
        "company_name": row.get("company_name"),
        "lead_email": row.get("lead_email"),
        "lead_status": row.get("lead_status"),
        "assigned_to": row.get("assigned_to"),
        "created_at": _serialize(row.get("created_at")),
        "updated_at": _serialize(row.get("updated_at")),
    }
