from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import text

from app.config import get_settings
from app.crawler.crawler import WebsiteCrawler
from app.database.session import SessionLocal
from app.knowledge.ingestion import ingest_pages
from app.knowledge.retriever import retriever

router = APIRouter(prefix="/api/kb", tags=["knowledge"])
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "crawler" / "output"


def _ensure_status_column() -> None:
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    "ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'indexed'"
                )
            )
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


_ensure_status_column()


def _build_where(
    search: str | None,
    url: str | None,
    status: str | None,
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, dict]:
    where = ["1=1"]
    params: dict = {}
    if search:
        where.append("(chunk_text ILIKE :search OR page_title ILIKE :search)")
        params["search"] = f"%{search}%"
    if url and url not in ("All", ""):
        where.append("url = :url")
        params["url"] = url
    if status and status not in ("All", ""):
        where.append("status = :status")
        params["status"] = status
    if date_from:
        where.append("crawled_at >= CAST(:date_from AS timestamptz)")
        params["date_from"] = date_from
    if date_to:
        where.append("crawled_at <= CAST(:date_to AS timestamptz)")
        params["date_to"] = date_to
    return " AND ".join(where), params


@router.post("/build")
async def build_kb() -> dict[str, int]:
    settings = get_settings()
    if not settings.target_website_url:
        raise HTTPException(status_code=400, detail="TARGET_WEBSITE_URL is not configured")
    result = await WebsiteCrawler().crawl(str(settings.target_website_url), recrawl=True)
    chunks = ingest_pages(result.pages)
    return {"page_count": len(result.pages), "chunk_count": len(chunks)}


@router.get("/search")
async def search_kb(q: str = Query(min_length=1)) -> dict[str, object]:
    settings = get_settings()
    results = retriever.search(q, top_k=settings.rag_top_k, threshold=settings.rag_similarity_threshold)
    return {
        "query": q,
        "results": [
            {
                "chunk_text": item.content,
                "score": item.score,
                "source_url": item.metadata.get("url"),
                "page_type": item.metadata.get("page_type"),
                "page_title": item.metadata.get("title"),
            }
            for item in results
        ],
        "source_urls": sorted({str(item.metadata.get("url")) for item in results if item.metadata.get("url")}),
    }


@router.get("/chunks")
async def list_chunks(
    search: str | None = None,
    url: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    where, params = _build_where(search, url, status, date_from, date_to)
    count_rows = _rows(f"SELECT COUNT(*) AS total FROM knowledge_chunks WHERE {where}", params)
    total = int(count_rows[0]["total"]) if count_rows else 0

    items = _rows(
        f"""
        SELECT id, url, page_type, page_title, chunk_index, chunk_text, status, crawled_at
        FROM knowledge_chunks
        WHERE {where}
        ORDER BY crawled_at DESC, url ASC, chunk_index ASC
        LIMIT :limit OFFSET :offset
        """,
        {**params, "limit": limit, "offset": offset},
    )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/chunks/{chunk_id}")
async def get_chunk(chunk_id: int) -> dict:
    rows = _rows(
        """
        SELECT id, url, page_type, page_title, chunk_index, chunk_text, status, crawled_at
        FROM knowledge_chunks WHERE id = :id
        """,
        {"id": chunk_id},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return rows[0]


@router.get("/urls")
async def list_urls() -> list[dict]:
    return _rows(
        """
        SELECT url, COUNT(*) AS chunk_count, MAX(crawled_at) AS last_crawled
        FROM knowledge_chunks
        GROUP BY url
        ORDER BY url ASC
        """
    )


@router.get("/stats")
async def kb_stats() -> dict[str, object]:
    rows = _rows(
        """
        SELECT COUNT(*) AS chunk_count,
               COUNT(DISTINCT url) AS page_count,
               COUNT(DISTINCT page_type) AS type_count,
               MAX(crawled_at) AS last_crawled
        FROM knowledge_chunks
        """
    )
    row = rows[0] if rows else {}
    coverage: dict[str, int] = {
        str(r["page_type"]): int(r["chunk_count"])
        for r in _rows(
            "SELECT page_type, COUNT(*) AS chunk_count FROM knowledge_chunks GROUP BY page_type"
        )
    }
    # Fall back to pages.json when the DB has nothing indexed yet.
    if not coverage:
        pages_path = OUTPUT_DIR / "pages.json"
        if pages_path.exists():
            for page in json.loads(pages_path.read_text(encoding="utf-8")):
                page_type = str(page.get("page_type", "other"))
                coverage[page_type] = coverage.get(page_type, 0) + 1
    last_crawled = row.get("last_crawled")
    return {
        "chunk_count": int(row.get("chunk_count") or len(retriever._chunks)),
        "page_count": int(row.get("page_count") or 0),
        "type_count": int(row.get("type_count") or 0),
        "last_crawled": last_crawled.isoformat() if last_crawled else None,
        "coverage_by_page_type": coverage,
    }


@router.delete("/chunks/{chunk_id}", status_code=204, response_class=Response)
async def delete_chunk(chunk_id: int):
    _exec("DELETE FROM knowledge_chunks WHERE id = :id", {"id": chunk_id})
    return Response(status_code=204)


@router.post("/reindex")
async def reindex_kb() -> dict[str, object]:
    """Rebuild the in-memory retriever from the persisted knowledge_chunks rows."""
    rows = _rows(
        "SELECT url, page_type, page_title, chunk_index, chunk_text FROM knowledge_chunks ORDER BY url, chunk_index"
    )
    missing = [row for row in rows if not row.get("chunk_text")]
    retriever.clear()
    for row in rows:
        if not row.get("chunk_text"):
            continue
        retriever.add(
            str(row["chunk_text"]),
            {
                "url": row.get("url"),
                "page_type": row.get("page_type"),
                "title": row.get("page_title"),
                "chunk_index": row.get("chunk_index"),
            },
        )
    return {"indexed": len(retriever._chunks), "skipped": len(missing)}


@router.post("/recrawl")
async def recrawl_page(url: str = Query(min_length=1)) -> dict[str, object]:
    """Re-crawl a single source URL and refresh its chunks."""
    settings = get_settings()
    result = await WebsiteCrawler().crawl(url, recrawl=True)
    chunks = ingest_pages(result.pages)
    return {"url": url, "pages": len(result.pages), "chunks": len(chunks), "errors": len(result.errors)}
