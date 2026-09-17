from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.config import get_settings
from app.database.session import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])

settings = get_settings()


def _safe_count(query: str, params: dict[str, object] | None = None) -> int:
    try:
        with SessionLocal() as db:
            result = db.execute(text(query), params or {}).fetchone()
            return int(result[0]) if result else 0
    except Exception as exc:  # noqa: BLE001 - analytics must not 500 the dashboard
        logger.warning("analytics_count_failed: %s | query=%s", exc, " ".join(query.split())[:160])
        return 0


def _safe_rows(query: str, params: dict[str, object] | None = None) -> list[dict[str, object]]:
    try:
        with SessionLocal() as db:
            rows = db.execute(text(query), params or {}).fetchall()
        return [dict(row._mapping) for row in rows]
    except Exception as exc:  # noqa: BLE001 - analytics must not 500 the dashboard
        logger.warning("analytics_rows_failed: %s | query=%s", exc, " ".join(query.split())[:160])
        return []


def _pct_change(current: int | float, previous: int | float) -> float:
    if not previous:
        return 100.0 if current else 0.0
    return round(((current - previous) / previous) * 100, 1)


def _window(days: int) -> datetime:
    """Start of the reporting window, ``days`` back from now."""
    return datetime.utcnow() - timedelta(days=days)


def _temperature_from_score(raw: object) -> str:
    """Normalize a lead score into Hot/Warm/Cold.

    The ``leads.lead_score`` column stores the temperature label for rows
    captured by the chat agent, but older/imported rows may hold a number.
    Both representations are handled so the dashboard never invents data.
    """
    value = str(raw or "").strip().lower()
    if value.startswith("hot"):
        return "hot"
    if value.startswith("warm"):
        return "warm"
    if value.startswith("cold"):
        return "cold"
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return "cold"
    if numeric >= 6:
        return "hot"
    if numeric >= 3:
        return "warm"
    return "cold"


@router.get("/dashboard/overview")
async def overview() -> dict[str, int]:
    return {
        "conversations": _safe_count("SELECT COUNT(*) FROM conversations"),
        "leads": _safe_count("SELECT COUNT(*) FROM leads"),
        "meetings": _safe_count("SELECT COUNT(*) FROM appointments"),
    }


@router.get("/analytics/overview")
async def analytics_overview(
    days: int = Query(default=30, ge=1, le=365),
) -> dict[str, float | int | dict[str, float] | dict[str, int]]:
    now = datetime.utcnow()
    current_start = now - timedelta(days=days)
    previous_start = now - timedelta(days=days * 2)
    conversations = _safe_count("SELECT COUNT(*) FROM conversations WHERE created_at >= :start", {"start": current_start})
    previous_conversations = _safe_count(
        "SELECT COUNT(*) FROM conversations WHERE created_at >= :start AND created_at < :end",
        {"start": previous_start, "end": current_start},
    )
    leads = _safe_count("SELECT COUNT(*) FROM leads WHERE created_at >= :start", {"start": current_start})
    previous_leads = _safe_count(
        "SELECT COUNT(*) FROM leads WHERE created_at >= :start AND created_at < :end",
        {"start": previous_start, "end": current_start},
    )
    meetings = _safe_count("SELECT COUNT(*) FROM appointments WHERE created_at >= :start AND status IN ('confirmed','booked','accepted')", {"start": current_start})
    previous_meetings = _safe_count(
        "SELECT COUNT(*) FROM appointments WHERE created_at >= :start AND created_at < :end AND status IN ('confirmed','booked','accepted')",
        {"start": previous_start, "end": current_start},
    )
    conversion_rate = round((leads / conversations * 100) if conversations else 0.0, 2)
    previous_conversion_rate = round((previous_leads / previous_conversations * 100) if previous_conversations else 0.0, 2)
    revenue_pipeline = 0.0
    trends = {
        "conversations_pct": _pct_change(conversations, previous_conversations),
        "leads_pct": _pct_change(leads, previous_leads),
        "conversion_pct": _pct_change(conversion_rate, previous_conversion_rate),
        "meetings_pct": _pct_change(meetings, previous_meetings),
        "revenue_pct": 0.0,
    }
    return {
        "conversations": conversations,
        "leads": leads,
        "conversion_rate": conversion_rate,
        "meetings_booked": meetings,
        "revenue_pipeline": revenue_pipeline,
        "trends": trends,
    }


@router.get("/analytics/conversations")
async def analytics_conversations() -> list[dict[str, object]]:
    query = """
        SELECT session_id, COALESCE(lead_data->>'status', 'open') AS lead_status,
               COALESCE(lead_data->>'language', 'en') AS language,
               created_at
        FROM conversations
        ORDER BY created_at DESC
        LIMIT 50
    """
    results = _safe_rows(query)
    return [
        {
            "session_id": row.get("session_id"),
            "lead_status": row.get("lead_status") or "open",
            "language": row.get("language") or "en",
            "created_at": row.get("created_at"),
        }
        for row in results
    ]


@router.get("/analytics/leads-by-temp")
async def analytics_leads_by_temp(
    days: int = Query(default=30, ge=1, le=365),
) -> dict[str, int]:
    """Lead temperature split derived from the real ``lead_score`` column.

    The live ``leads`` table has no ``lead_temperature`` column; the chat agent
    writes the Hot/Warm/Cold label into ``lead_score`` instead.
    """
    rows = _safe_rows(
        """
        SELECT COALESCE(lead_score, '') AS score, COUNT(*) AS count
        FROM leads
        WHERE created_at >= :start
        GROUP BY 1
        """,
        {"start": _window(days)},
    )
    mapping = {"hot": 0, "warm": 0, "cold": 0}
    for row in rows:
        mapping[_temperature_from_score(row.get("score"))] += int(row.get("count") or 0)
    total = sum(mapping.values())
    return {**mapping, "total": total}


@router.get("/analytics/services")
async def analytics_services(
    days: int = Query(default=30, ge=1, le=365),
) -> list[dict[str, object]]:
    query = """
        WITH service_counts AS (
            SELECT UNNEST(required_services) AS service, COUNT(*) AS count
            FROM leads
            WHERE required_services IS NOT NULL AND created_at >= :start
            GROUP BY service
        )
        SELECT service, count, ROUND((count * 100.0 / NULLIF(SUM(count) OVER (), 0))::numeric, 1) AS percentage
        FROM service_counts
        ORDER BY count DESC
        LIMIT 8
    """
    rows = _safe_rows(query, {"start": _window(days)})
    return [
        {
            "service": str(row.get("service") or "Unknown"),
            "count": int(row.get("count") or 0),
            "percentage": float(row.get("percentage") or 0),
        }
        for row in rows
    ]


@router.get("/analytics/timeline")
async def analytics_timeline(
    days: int = Query(default=30, ge=1, le=365),
) -> list[dict[str, object]]:
    """Daily conversations/leads for the window, zero-filled across every day.

    Note: ``CAST(:start AS timestamptz)`` is used instead of ``:start::date``
    because SQLAlchemy's ``text()`` treats the ``:`` in ``::`` as a bind
    parameter and the statement fails to parse.
    """
    start = _window(days)
    query = """
        WITH days AS (
          SELECT generate_series(CAST(:start AS timestamptz), NOW(), interval '1 day')::date AS day
        ),
        conversation_counts AS (
          SELECT created_at::date AS day, COUNT(*) AS count
          FROM conversations
          WHERE created_at >= :start
          GROUP BY 1
        ),
        lead_counts AS (
          SELECT created_at::date AS day, COUNT(*) AS count
          FROM leads
          WHERE created_at >= :start
          GROUP BY 1
        )
        SELECT days.day,
               COALESCE(conversation_counts.count, 0) AS conversations,
               COALESCE(lead_counts.count, 0) AS leads
        FROM days
        LEFT JOIN conversation_counts ON conversation_counts.day = days.day
        LEFT JOIN lead_counts ON lead_counts.day = days.day
        ORDER BY days.day ASC
    """
    rows = _safe_rows(query, {"start": start})
    return [
        {
            "date": str(row.get("day")),
            "conversations": int(row.get("conversations") or 0),
            "leads": int(row.get("leads") or 0),
        }
        for row in rows
    ]


def _iso(value: object) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value or "")


@router.get("/analytics/recent-activity")
async def analytics_recent_activity(
    days: int = Query(default=30, ge=1, le=365),
) -> list[dict[str, object]]:
    """Most recent real activity, sourced from persisted rows only.

    Falls back through analytics_events -> leads -> conversations so the panel
    always reflects actual stored records (never placeholder content).
    """
    start = _window(days)
    rows = _safe_rows(
        """
        SELECT event_type AS type, payload, created_at
        FROM analytics_events
        WHERE created_at >= :start
        ORDER BY created_at DESC
        LIMIT 10
        """,
        {"start": start},
    )
    if rows:
        return [
            {
                "type": str(row.get("type") or "event"),
                "description": str(
                    (row.get("payload") or {}).get("description")
                    if isinstance(row.get("payload"), dict)
                    else row.get("type") or "Activity"
                ),
                "name": str(
                    (row.get("payload") or {}).get("name")
                    if isinstance(row.get("payload"), dict)
                    else ""
                ),
                "time": _iso(row.get("created_at")),
            }
            for row in rows
        ]

    lead_rows = _safe_rows(
        """
        SELECT full_name, company_name, created_at
        FROM leads
        WHERE created_at >= :start
        ORDER BY created_at DESC
        LIMIT 10
        """,
        {"start": start},
    )
    if lead_rows:
        return [
            {
                "type": "lead_created",
                "description": "New lead generated",
                "name": str(row.get("full_name") or row.get("company_name") or ""),
                "time": _iso(row.get("created_at")),
            }
            for row in lead_rows
        ]

    conversation_rows = _safe_rows(
        """
        SELECT session_id, COALESCE(jsonb_array_length(messages), 0) AS message_count, created_at
        FROM conversations
        WHERE created_at >= :start
        ORDER BY created_at DESC
        LIMIT 10
        """,
        {"start": start},
    )
    return [
        {
            "type": "conversation",
            "description": f"{int(row.get('message_count') or 0)} messages",
            "name": str(row.get("session_id") or "")[:8],
            "time": _iso(row.get("created_at")),
        }
        for row in conversation_rows
    ]


@router.get("/integrations/status")
async def integrations_status() -> dict[str, bool]:
    return {
        "calcom": bool(settings.calcom_api_key and settings.calcom_event_type_id),
        "mailjet": bool(settings.mailjet_api_key and settings.mailjet_secret_key and settings.mailjet_from_email),
        "sheets": bool(settings.google_service_account_json and settings.google_sheet_id),
        "supabase": bool(settings.database_url),
    }


@router.get("/analytics/visitors")
async def analytics_visitors(
    days: int = Query(default=30, ge=1, le=365),
) -> dict[str, object]:
    """Real visitor/session analytics aggregated from the conversations table.

    Traffic-source and geo data are not tracked by this system, so those
    collections are intentionally empty (the UI renders an empty state).
    """
    start = _window(days)
    total_sessions = _safe_count("SELECT COUNT(DISTINCT session_id) FROM conversations")
    total_conversations = _safe_count("SELECT COUNT(*) FROM conversations")
    total_messages = _safe_count("SELECT COALESCE(SUM(jsonb_array_length(messages)), 0) FROM conversations")
    leads_captured = _safe_count("SELECT COUNT(*) FROM leads")

    timeline_rows = _safe_rows(
        """
        WITH days AS (
          SELECT generate_series(CAST(:start AS timestamptz), NOW(), interval '1 day')::date AS day
        )
        SELECT days.day, COUNT(DISTINCT c.session_id) AS visitors
        FROM days
        LEFT JOIN conversations c
          ON date_trunc('day', c.created_at)::date = days.day
        GROUP BY days.day
        ORDER BY days.day ASC
        """,
        {"start": start},
    )
    language_rows = _safe_rows(
        """
        SELECT COALESCE(lead_data->>'language', 'unknown') AS language, COUNT(*) AS count
        FROM conversations
        GROUP BY 1
        ORDER BY count DESC
        """
    )
    status_rows = _safe_rows(
        "SELECT COALESCE(status, 'active') AS status, COUNT(*) AS count FROM conversations GROUP BY 1"
    )
    avg_messages = round(total_messages / total_conversations, 1) if total_conversations else 0.0
    return {
        "total_visitors": total_sessions,
        "total_conversations": total_conversations,
        "total_messages": total_messages,
        "leads_captured": leads_captured,
        "avg_messages_per_conversation": avg_messages,
        "timeline": [
            {"date": str(row.get("day")), "visitors": int(row.get("visitors") or 0)} for row in timeline_rows
        ],
        "languages": [
            {"language": str(row.get("language") or "unknown"), "count": int(row.get("count") or 0)}
            for row in language_rows
        ],
        "by_status": [
            {"status": str(row.get("status") or "active"), "count": int(row.get("count") or 0)}
            for row in status_rows
        ],
        # Not tracked anywhere in the system:
        "sources": [],
        "countries": [],
        "top_pages": [],
    }


@router.get("/analytics/questions")
async def analytics_questions() -> dict[str, list[dict[str, object]]]:
    return {"most_asked": []}


@router.get("/analytics/leads")
async def analytics_leads() -> dict[str, list[dict[str, object]]]:
    return {"by_status_over_time": []}


@router.get("/analytics/agent-performance")
async def analytics_agent_performance() -> dict[str, float | int]:
    return {"avg_response_time": 0, "sessions": _safe_count("SELECT COUNT(*) FROM conversations"), "handovers": 0}
