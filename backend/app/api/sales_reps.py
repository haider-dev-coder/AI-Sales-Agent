from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/sales-reps", tags=["sales_reps"])

SELECT_COLUMNS = "id, name, email, status, created_at"


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


class SalesRepIn(BaseModel):
    name: str
    email: str
    status: str | None = "active"


@router.get("")
async def list_reps() -> list[dict]:
    return _rows(
        f"SELECT {SELECT_COLUMNS} FROM sales_reps ORDER BY name ASC"
    )


@router.post("", status_code=201)
async def create_rep(body: SalesRepIn) -> dict:
    rows = _rows(
        f"""
        INSERT INTO sales_reps (name, email, status, created_at)
        VALUES (:name, :email, :status, NOW())
        RETURNING {SELECT_COLUMNS}
        """,
        body.model_dump(),
    )
    return rows[0]


@router.patch("/{rep_id}")
async def update_rep(rep_id: str, body: SalesRepIn) -> dict:
    rows = _rows(
        f"""
        UPDATE sales_reps SET name=:name, email=:email, status=:status
        WHERE id=CAST(:id AS uuid)
        RETURNING {SELECT_COLUMNS}
        """,
        {**body.model_dump(), "id": rep_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Sales rep not found")
    return rows[0]


@router.delete("/{rep_id}", status_code=204, response_class=Response)
async def delete_rep(rep_id: str):
    _exec("DELETE FROM sales_reps WHERE id=CAST(:id AS uuid)", {"id": rep_id})
    return Response(status_code=204)
