from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.database.session import SessionLocal

router = APIRouter(prefix="/api/services", tags=["services"])


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


class ServiceIn(BaseModel):
    name: str
    description: str | None = None
    status: str | None = "Active"
    source_url: str | None = None


@router.get("")
async def list_services() -> list[dict]:
    return _rows(
        """
        SELECT id, name, description, status, source_url, created_at, updated_at
        FROM service_catalog
        ORDER BY name ASC
        """
    )


@router.post("", status_code=201)
async def create_service(body: ServiceIn) -> dict:
    rows = _rows(
        """
        INSERT INTO service_catalog (name, description, status, source_url, created_at, updated_at)
        VALUES (:name, :description, :status, :source_url, NOW(), NOW())
        RETURNING id, name, description, status, source_url, created_at, updated_at
        """,
        body.model_dump(),
    )
    return rows[0]


@router.patch("/{service_id}")
async def update_service(service_id: str, body: ServiceIn) -> dict:
    rows = _rows(
        """
        UPDATE service_catalog SET name=:name, description=:description, status=:status, source_url=:source_url, updated_at=NOW()
        WHERE id=CAST(:id AS uuid)
        RETURNING id, name, description, status, source_url, created_at, updated_at
        """,
        {**body.model_dump(), "id": service_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Service not found")
    return rows[0]


@router.delete("/{service_id}", status_code=204, response_class=Response)
async def delete_service(service_id: str):
    _exec("DELETE FROM service_catalog WHERE id=CAST(:id AS uuid)", {"id": service_id})
    return Response(status_code=204)