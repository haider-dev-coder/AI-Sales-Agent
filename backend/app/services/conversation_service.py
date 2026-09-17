"""Conversation storage: fast in-memory cache backed by the real database."""

from __future__ import annotations

import json
import logging

from sqlalchemy import text

from app.agent.state import ChatMessage
from app.database.session import SessionLocal

logger = logging.getLogger(__name__)

_history: dict[str, list[ChatMessage]] = {}


def load_history(conversation_id: str) -> list[ChatMessage]:
    if conversation_id in _history:
        return list(_history[conversation_id])
    try:
        with SessionLocal() as db:
            row = (
                db.execute(
                    text("SELECT messages FROM conversations WHERE session_id = :session_id"),
                    {"session_id": conversation_id},
                )
                .mappings()
                .first()
            )
    except Exception:
        logger.warning("conversation history load failed", exc_info=True)
        return []
    if not row:
        return []
    messages = [
        ChatMessage(role=str(item.get("role", "user")), content=str(item.get("content", "")))
        for item in (row.get("messages") or [])
        if isinstance(item, dict)
    ]
    _history[conversation_id] = messages
    return list(messages)


def save_history(conversation_id: str, messages: list[ChatMessage]) -> None:
    _history[conversation_id] = list(messages)
    persist_conversation(conversation_id, messages)


def persist_conversation(conversation_id: str, messages: list[ChatMessage]) -> None:
    """Upsert the full conversation into the real database."""
    payload = [{"role": message.role, "content": message.content} for message in messages]
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    """
                    INSERT INTO conversations (session_id, messages, status, created_at, updated_at)
                    VALUES (:session_id, CAST(:messages AS jsonb), 'active', NOW(), NOW())
                    ON CONFLICT (session_id)
                    DO UPDATE SET messages = CAST(:messages AS jsonb), updated_at = NOW()
                    """
                ),
                {"session_id": conversation_id, "messages": json.dumps(payload)},
            )
            db.commit()
    except Exception:
        logger.warning("conversation persist failed for %s", conversation_id, exc_info=True)
