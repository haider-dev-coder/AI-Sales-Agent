from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/follow-ups", tags=["follow_ups"])

SELECT_COLUMNS = (
    "f.id, f.lead_id, f.rep_id, f.scheduled_at, f.status, f.notes, f.created_at, "
    "l.full_name AS lead_name, l.company_name AS lead_company, "
    "s.name AS rep_name"
)


def _rows(query: str, params: dict | None = None) -> list[dict]:
    try:
        with SessionLocal() as db:
            rows = db.execute(text(query), params or {}).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _exec(query: str, params: dict | None = None) -> None:
    with SessionLocal() as db:
        db.execute(text(query), params or {})
        db.commit()


class FollowUpIn(BaseModel):
    lead_id: str
    scheduled_at: str
    notes: str | None = None
    status: str | None = "pending"
    rep_id: str | None = None


@router.get("")
async def list_follow_ups(
    status: str | None = None,
    lead_id: str | None = None,
    rep_id: str | None = None,
    search: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> dict:
    where = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if status and status not in ("All", ""):
        where.append("f.status = :status")
        params["status"] = status
    if lead_id:
        where.append("f.lead_id = CAST(:lead_id AS uuid)")
        params["lead_id"] = lead_id
    if rep_id:
        where.append("f.rep_id = CAST(:rep_id AS uuid)")
        params["rep_id"] = rep_id
    if search:
        where.append("(l.full_name ILIKE :search OR l.company_name ILIKE :search OR f.notes ILIKE :search)")
        params["search"] = f"%{search}%"

    count_rows = _rows(
        f"""
        SELECT COUNT(*) AS total
        FROM follow_ups f
        LEFT JOIN leads l ON l.id = f.lead_id
        WHERE {' AND '.join(where)}
        """,
        params,
    )
    total = int(count_rows[0]["total"]) if count_rows else 0

    items = _rows(
        f"""
        SELECT {SELECT_COLUMNS}
        FROM follow_ups f
        LEFT JOIN leads l ON l.id = f.lead_id
        LEFT JOIN sales_reps s ON s.id = f.rep_id
        WHERE {' AND '.join(where)}
        ORDER BY f.scheduled_at ASC
        LIMIT :limit OFFSET :offset
        """,
        params,
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/stats")
async def follow_up_stats() -> dict[str, int]:
    rows = _rows(
        """
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'done') AS done,
          COUNT(*) FILTER (WHERE status = 'pending' AND scheduled_at < NOW()) AS overdue
        FROM follow_ups
        """
    )
    row = rows[0] if rows else {}
    return {
        "total": int(row.get("total") or 0),
        "pending": int(row.get("pending") or 0),
        "done": int(row.get("done") or 0),
        "overdue": int(row.get("overdue") or 0),
    }


@router.post("", status_code=201)
async def create_follow_up(body: FollowUpIn) -> dict:
    rows = _rows(
        f"""
        INSERT INTO follow_ups (lead_id, rep_id, scheduled_at, notes, status, created_at)
        VALUES (CAST(:lead_id AS uuid), CAST(:rep_id AS uuid), CAST(:scheduled_at AS timestamptz),
                :notes, :status, NOW())
        RETURNING id, lead_id, rep_id, scheduled_at, notes, status, created_at
        """,
        body.model_dump(),
    )
    return rows[0]


@router.patch("/{fu_id}")
async def update_follow_up(fu_id: str, body: FollowUpIn) -> dict:
    rows = _rows(
        f"""
        UPDATE follow_ups SET lead_id=CAST(:lead_id AS uuid), rep_id=CAST(:rep_id AS uuid),
               scheduled_at=CAST(:scheduled_at AS timestamptz), notes=:notes, status=:status
        WHERE id=CAST(:id AS uuid)
        RETURNING id, lead_id, rep_id, scheduled_at, notes, status, created_at
        """,
        {**body.model_dump(), "id": fu_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return rows[0]


@router.patch("/{fu_id}/done")
async def mark_done(fu_id: str) -> dict:
    rows = _rows(
        "UPDATE follow_ups SET status='done' WHERE id=CAST(:id AS uuid) RETURNING id, status",
        {"id": fu_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    return rows[0]


@router.delete("/{fu_id}", status_code=204, response_class=Response)
async def delete_follow_up(fu_id: str):
    _exec("DELETE FROM follow_ups WHERE id=CAST(:id AS uuid)", {"id": fu_id})
    return Response(status_code=204)
