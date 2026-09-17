from __future__ import annotations

import csv
import io
import re
from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/faqs", tags=["faqs"])

# Questions surfaced at least this many times are auto-promoted for review.
AUTO_SURFACE_THRESHOLD = 3

SELECT_COLUMNS = (
    "id, question, answer, category, is_active, frequency, last_asked, created_at"
)


def _ensure_columns() -> None:
    """Make the API resilient if the additive 010 migration has not run yet."""
    statements = [
        "ALTER TABLE faqs ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General'",
        "ALTER TABLE faqs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
    ]
    try:
        with SessionLocal() as db:
            for statement in statements:
                db.execute(text(statement))
            db.commit()
    except Exception:
        pass


def _rows(query: str, params: dict | None = None) -> list[dict]:
    try:
        with SessionLocal() as db:
            rows = db.execute(text(query), params or {}).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _exec(query: str, params: dict | None = None) -> None:
    try:
        with SessionLocal() as db:
            db.execute(text(query), params or {})
            db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


_ensure_columns()


class FAQIn(BaseModel):
    question: str
    answer: str | None = None
    category: str | None = "General"
    is_active: bool | None = True
    frequency: int | None = 1


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    is_active: bool | None = None


def _build_where(
    search: str | None,
    category: str | None,
    status: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, dict]:
    where = ["1=1"]
    params: dict = {}
    if search:
        where.append("(question ILIKE :search OR answer ILIKE :search)")
        params["search"] = f"%{search}%"
    if category and category not in ("All", ""):
        where.append("category = :category")
        params["category"] = category
    if status == "active":
        where.append("is_active = TRUE")
    elif status == "inactive":
        where.append("is_active = FALSE")
    elif status == "auto":
        where.append("frequency >= :auto_threshold")
        params["auto_threshold"] = AUTO_SURFACE_THRESHOLD
    if date_from:
        where.append("created_at >= CAST(:date_from AS timestamptz)")
        params["date_from"] = date_from
    if date_to:
        where.append("created_at <= CAST(:date_to AS timestamptz)")
        params["date_to"] = date_to
    return " AND ".join(where), params


@router.get("")
async def list_faqs(
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    where, params = _build_where(search, category, status, date_from, date_to)
    count_rows = _rows(f"SELECT COUNT(*) AS total FROM faqs WHERE {where}", params)
    total = int(count_rows[0]["total"]) if count_rows else 0

    params_page = {**params, "limit": limit, "offset": offset}
    items = _rows(
        f"""
        SELECT {SELECT_COLUMNS}
        FROM faqs
        WHERE {where}
        ORDER BY frequency DESC, last_asked DESC
        LIMIT :limit OFFSET :offset
        """,
        params_page,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/stats")
async def faq_stats() -> dict[str, int]:
    rows = _rows(
        """
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE is_active) AS active,
          COUNT(*) FILTER (WHERE NOT is_active) AS inactive,
          COUNT(*) FILTER (WHERE frequency >= :threshold) AS auto_surfaced,
          COALESCE(SUM(frequency), 0) AS total_asks
        FROM faqs
        """,
        {"threshold": AUTO_SURFACE_THRESHOLD},
    )
    row = rows[0] if rows else {}
    return {
        "total": int(row.get("total") or 0),
        "active": int(row.get("active") or 0),
        "inactive": int(row.get("inactive") or 0),
        "auto_surfaced": int(row.get("auto_surfaced") or 0),
        "total_asks": int(row.get("total_asks") or 0),
    }


@router.get("/categories")
async def faq_categories() -> list[str]:
    rows = _rows(
        "SELECT DISTINCT category FROM faqs WHERE category IS NOT NULL AND category <> '' ORDER BY category ASC"
    )
    return [str(row["category"]) for row in rows]


@router.get("/export")
async def export_faqs(
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> Response:
    where, params = _build_where(search, category, status, date_from, date_to)
    rows = _rows(
        f"SELECT {SELECT_COLUMNS} FROM faqs WHERE {where} ORDER BY frequency DESC, last_asked DESC",
        params,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "question", "answer", "category", "is_active", "frequency", "last_asked", "created_at"])
    for row in rows:
        writer.writerow(
            [
                row.get("id"),
                row.get("question"),
                row.get("answer"),
                row.get("category"),
                row.get("is_active"),
                row.get("frequency"),
                row.get("last_asked").isoformat() if row.get("last_asked") else "",
                row.get("created_at").isoformat() if row.get("created_at") else "",
            ]
        )
    filename = f"faqs_{datetime.utcnow().strftime('%Y%m%d')}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/auto-surface")
async def auto_surface() -> list[dict]:
    return _rows(
        f"SELECT {SELECT_COLUMNS} FROM faqs WHERE frequency >= :threshold ORDER BY frequency DESC",
        {"threshold": AUTO_SURFACE_THRESHOLD},
    )


def _normalize(text_value: str) -> str:
    cleaned = re.sub(r"\s+", " ", text_value.strip().lower())
    return cleaned.strip(" ?.!,")


@router.get("/detect")
async def detect_questions() -> list[dict]:
    """Scan real stored conversations for questions asked 3+ times."""
    rows = _rows("SELECT messages FROM conversations WHERE messages IS NOT NULL AND messages <> '[]'::jsonb")
    counter: Counter[str] = Counter()
    samples: dict[str, str] = {}
    for row in rows:
        messages = row.get("messages") or []
        if not isinstance(messages, list):
            continue
        for message in messages:
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = str(message.get("content") or "").strip()
            if len(content) < 6:
                continue
            key = _normalize(content)
            if not key:
                continue
            counter[key] += 1
            samples.setdefault(key, content)

    existing = {
        _normalize(str(item["question"]))
        for item in _rows("SELECT question FROM faqs")
    }
    return [
        {"question": samples[key], "count": count, "already_tracked": key in existing}
        for key, count in counter.most_common()
        if count >= AUTO_SURFACE_THRESHOLD
    ]


@router.post("", status_code=201)
async def create_faq(body: FAQIn) -> dict:
    rows = _rows(
        """
        INSERT INTO faqs (question, answer, category, is_active, frequency, last_asked, created_at)
        VALUES (:question, :answer, :category, :is_active, :frequency, NOW(), NOW())
        RETURNING id, question, answer, category, is_active, frequency, last_asked, created_at
        """,
        body.model_dump(),
    )
    return rows[0]


@router.post("/import", status_code=201)
async def import_faqs(body: list[FAQIn]) -> dict[str, int]:
    """Bulk-insert FAQs; matching questions (case-insensitive) bump frequency instead of duplicating."""
    inserted = 0
    for faq in body:
        existing = _rows(
            "SELECT id FROM faqs WHERE LOWER(question) = LOWER(:question)",
            {"question": faq.question},
        )
        if existing:
            _exec(
                "UPDATE faqs SET frequency = frequency + 1 WHERE id = CAST(:id AS uuid)",
                {"id": existing[0]["id"]},
            )
        else:
            _rows(
                """
                INSERT INTO faqs (question, answer, category, is_active, frequency, last_asked, created_at)
                VALUES (:question, :answer, :category, :is_active, :frequency, NOW(), NOW())
                RETURNING id
                """,
                faq.model_dump(),
            )
            inserted += 1
    return {"inserted": inserted, "matched": len(body) - inserted}


@router.patch("/{faq_id}")
async def update_faq(faq_id: str, body: FAQUpdate) -> dict:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        rows = _rows(f"SELECT {SELECT_COLUMNS} FROM faqs WHERE id = CAST(:id AS uuid)", {"id": faq_id})
        if not rows:
            raise HTTPException(status_code=404, detail="FAQ not found")
        return rows[0]
    assignments = ", ".join(f"{key} = :{key}" for key in updates)
    rows = _rows(
        f"""
        UPDATE faqs SET {assignments}
        WHERE id = CAST(:id AS uuid)
        RETURNING id, question, answer, category, is_active, frequency, last_asked, created_at
        """,
        {**updates, "id": faq_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return rows[0]


@router.patch("/{faq_id}/toggle")
async def toggle_faq(faq_id: str) -> dict:
    rows = _rows(
        """
        UPDATE faqs SET is_active = NOT is_active
        WHERE id = CAST(:id AS uuid)
        RETURNING id, question, answer, category, is_active, frequency, last_asked, created_at
        """,
        {"id": faq_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return rows[0]


@router.delete("/{faq_id}", status_code=204, response_class=Response)
async def delete_faq(faq_id: str):
    _exec("DELETE FROM faqs WHERE id = CAST(:id AS uuid)", {"id": faq_id})
    return Response(status_code=204)
