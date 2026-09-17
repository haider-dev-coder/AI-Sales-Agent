import asyncio
import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Response
from pydantic import AnyHttpUrl, BaseModel
from sqlalchemy import text

from app.config import get_settings
from app.crawler.crawler import WebsiteCrawler
from app.database.models import Website
from app.database.session import SessionLocal
from app.knowledge.ingestion import ingest_pages
from app.knowledge.retriever import retriever

router = APIRouter(prefix="/api", tags=["crawl"])
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "crawler" / "output"
JOBS: dict[str, dict[str, object]] = {}

_CRAWL_JOBS_DDL = """
CREATE TABLE IF NOT EXISTS crawl_jobs (
    job_id TEXT PRIMARY KEY,
    website_url TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    progress INTEGER NOT NULL DEFAULT 0,
    pages_found INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
)
"""


def _ensure_crawl_jobs_table() -> None:
    try:
        with SessionLocal() as db:
            db.execute(text(_CRAWL_JOBS_DDL))
            db.commit()
    except Exception:
        import logging

        logging.getLogger(__name__).warning("crawl_jobs table unavailable", exc_info=True)


def _record_job_start(job_id: str, website_url: str) -> None:
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    "INSERT INTO crawl_jobs (job_id, website_url, status, progress, pages_found, errors) "
                    "VALUES (:job_id, :website_url, 'running', 0, 0, '[]'::jsonb)"
                ),
                {"job_id": job_id, "website_url": website_url},
            )
            db.commit()
    except Exception:
        _ensure_crawl_jobs_table()


def _record_job_end(job_id: str, status: str, pages_found: int, errors: list) -> None:
    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    "UPDATE crawl_jobs SET status = :status, progress = 100, pages_found = :pages_found, "
                    "errors = CAST(:errors AS jsonb), completed_at = NOW() WHERE job_id = :job_id"
                ),
                {
                    "job_id": job_id,
                    "status": status,
                    "pages_found": pages_found,
                    "errors": json.dumps(errors, default=str),
                },
            )
            db.commit()
    except Exception:
        import logging

        logging.getLogger(__name__).warning("failed to persist crawl job %s", job_id, exc_info=True)


def _get_website_from_db() -> tuple[str | None, str | None, str | None]:
    """Get website URL, name, and description from the database."""
    try:
        with SessionLocal() as db:
            website = db.query(Website).first()
            if website and website.url:
                return website.url, website.name, website.description
    except Exception:
        pass
    return None, None, None


_ensure_crawl_jobs_table()


class CrawlRequest(BaseModel):
    website_url: AnyHttpUrl
    recrawl: bool = False


class CrawlResponse(BaseModel):
    base_url: str
    page_count: int
    error_count: int
    service_candidates: list[dict[str, str]]


@router.post("/crawl", response_model=CrawlResponse)
async def crawl_site(request: CrawlRequest) -> CrawlResponse:
    try:
        result = await WebsiteCrawler().crawl(str(request.website_url), recrawl=request.recrawl)
        ingest_pages(result.pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CrawlResponse(
        base_url=result.base_url,
        page_count=len(result.pages),
        error_count=len(result.errors),
        service_candidates=result.service_candidates,
    )


@router.get("/crawler/config")
async def crawler_config() -> dict[str, object]:
    """Get the current crawler configuration from database."""
    website_url, website_name, website_description = _get_website_from_db()
    settings = get_settings()
    return {
        "website_url": website_url,
        "website_name": website_name,
        "website_description": website_description,
        "max_pages": settings.crawl_max_pages,
        "request_delay": settings.crawl_request_delay,
        "timeout": settings.crawl_timeout,
        "user_agent": settings.crawl_user_agent,
    }


@router.put("/crawler/config")
async def update_crawler_config(
    website_url: str | None = None,
    website_name: str | None = None,
    website_description: str | None = None,
) -> dict[str, object]:
    """Update the crawler configuration in the database."""
    try:
        with SessionLocal() as db:
            website = db.query(Website).first()
            if not website:
                website = Website()
                db.add(website)
            if website_url:
                website.url = website_url
                from urllib.parse import urlparse
                website.domain = urlparse(website_url).netloc
            if website_name:
                website.name = website_name
            if website_description:
                website.description = website_description
            db.commit()
            db.refresh(website)
            return {
                "website_url": website.url,
                "website_name": website.name,
                "website_description": website.description,
            }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update configuration: {exc}") from exc


@router.post("/crawler/start")
async def start_crawler() -> dict[str, str]:
    website_url, _, _ = _get_website_from_db()
    if not website_url:
        raise HTTPException(status_code=400, detail="Target website is not configured in Settings. Please configure it first.")
    job_id = str(uuid4())
    JOBS[job_id] = {"progress": 0, "pages_found": 0, "errors": [], "status": "running"}
    _record_job_start(job_id, website_url)
    asyncio.create_task(_run_crawl_job(job_id, website_url, recrawl=True))
    return {"job_id": job_id}


@router.get("/crawler/jobs")
async def crawler_jobs() -> list[dict[str, object]]:
    """Real crawl job history, newest first, persisted in the database."""
    try:
        with SessionLocal() as db:
            rows = db.execute(
                text(
                    "SELECT job_id, website_url, status, progress, pages_found, errors, created_at, completed_at "
                    "FROM crawl_jobs ORDER BY created_at DESC LIMIT 50"
                )
            ).fetchall()
    except Exception:
        return []
    jobs: list[dict[str, object]] = []
    for row in rows:
        record = dict(row._mapping)
        jobs.append(
            {
                "job_id": record.get("job_id"),
                "website_url": record.get("website_url"),
                "status": record.get("status"),
                "progress": record.get("progress") or 0,
                "pages_found": record.get("pages_found") or 0,
                "errors": record.get("errors") or [],
                "created_at": record["created_at"].isoformat() if record.get("created_at") else None,
                "completed_at": record["completed_at"].isoformat() if record.get("completed_at") else None,
            }
        )
    # Merge still-running in-memory jobs that are newer than anything in the DB
    known = {str(job["job_id"]) for job in jobs}
    for job_id, payload in JOBS.items():
        if job_id not in known:
            jobs.insert(0, {"job_id": job_id, "website_url": None, "created_at": None, "completed_at": None, **payload})
    return jobs


@router.get("/crawler/status/{job_id}")
async def crawler_status(job_id: str) -> dict[str, object]:
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Unknown crawler job")
    return JOBS[job_id]


@router.get("/crawler/sitemap")
async def crawler_sitemap() -> object:
    path = OUTPUT_DIR / "sitemap.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sitemap has not been generated. Run a crawl first.")
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        return entries
    # Deduplicate by URL so the UI never receives repeated entries (duplicate
    # URLs otherwise become duplicate React keys in the sitemap tree).
    seen: set[str] = set()
    unique: list[object] = []
    for entry in entries:
        url = entry.get("url") if isinstance(entry, dict) else None
        if url and url in seen:
            continue
        if url:
            seen.add(url)
        unique.append(entry)
    return unique


@router.get("/crawler/sitemap.xml")
async def crawler_sitemap_xml() -> Response:
    """Export sitemap as XML format."""
    path = OUTPUT_DIR / "sitemap.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sitemap has not been generated. Run a crawl first.")
    sitemap_data = json.loads(path.read_text(encoding="utf-8"))
    
    # Generate XML sitemap
    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    
    for entry in sitemap_data:
        url = entry.get("url", "")
        if not url:
            continue
        # Get lastmod from crawled_at or use current date
        lastmod = entry.get("crawled_at", "")
        if lastmod:
            # Truncate to date only
            lastmod = lastmod[:10]
        else:
            from datetime import datetime
            lastmod = datetime.now().strftime("%Y-%m-%d")
        
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{url}</loc>")
        xml_parts.append(f"    <lastmod>{lastmod}</lastmod>")
        xml_parts.append("    <changefreq>weekly</changefreq>")
        xml_parts.append("    <priority>0.8</priority>")
        xml_parts.append("  </url>")
    
    xml_parts.append("</urlset>")
    xml_content = "\n".join(xml_parts)
    
    return Response(content=xml_content, media_type="application/xml")


@router.get("/crawler/pages")
async def crawler_pages() -> list[dict[str, object]]:
    """Real crawled pages from the latest crawl run."""
    path = OUTPUT_DIR / "pages.json"
    if not path.exists():
        return []
    try:
        pages = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return [
        {
            "url": page.get("url"),
            "title": page.get("title"),
            "page_type": page.get("page_type", "other"),
            "depth": page.get("depth", 0),
            "parent_url": page.get("parent_url"),
            "section": page.get("section"),
            "crawled_at": page.get("crawled_at"),
        }
        for page in pages
    ]


@router.get("/crawler/site-summary")
async def crawler_site_summary() -> dict[str, object]:
    """Summary of the configured website and its real crawl state."""
    settings = get_settings()
    website_url, website_name, website_description = _get_website_from_db()
    pages_path = OUTPUT_DIR / "pages.json"
    pages: list[dict[str, object]] = []
    last_crawled_at: str | None = None
    coverage: dict[str, int] = {}
    if pages_path.exists():
        try:
            pages = json.loads(pages_path.read_text(encoding="utf-8"))
        except Exception:
            pages = []
    for page in pages:
        page_type = str(page.get("page_type") or "other")
        coverage[page_type] = coverage.get(page_type, 0) + 1
        crawled_at = page.get("crawled_at")
        if crawled_at and (last_crawled_at is None or str(crawled_at) > last_crawled_at):
            last_crawled_at = str(crawled_at)
    return {
        "website_url": website_url,
        "website_name": website_name,
        "website_description": website_description,
        "pages_crawled": len(pages),
        "coverage_by_page_type": coverage,
        "kb_chunk_count": len(retriever._chunks),
        "sitemap_available": (OUTPUT_DIR / "sitemap.json").exists(),
        "last_crawled_at": last_crawled_at,
        "crawl_settings": {
            "max_pages": settings.crawl_max_pages,
            "request_delay": settings.crawl_request_delay,
            "timeout": settings.crawl_timeout,
        },
    }


@router.post("/crawler/rebuild-kb")
async def rebuild_kb() -> dict[str, object]:
    website_url, _, _ = _get_website_from_db()
    if not website_url:
        raise HTTPException(status_code=400, detail="Target website is not configured in Settings. Please configure it first.")
    result = await WebsiteCrawler().crawl(website_url, recrawl=True)
    chunks = ingest_pages(result.pages)
    return {"pages": len(result.pages), "errors": len(result.errors), "chunks": len(chunks)}


async def _run_crawl_job(job_id: str, website_url: str, recrawl: bool) -> None:
    try:
        result = await WebsiteCrawler().crawl(website_url, recrawl=recrawl)
        ingest_pages(result.pages)
        errors = [asdict(error) for error in result.errors]
        JOBS[job_id] = {
            "progress": 100,
            "pages_found": len(result.pages),
            "errors": errors,
            "status": "completed",
        }
        _record_job_end(job_id, "completed", len(result.pages), errors)
    except Exception as exc:  # pragma: no cover - defensive job boundary
        JOBS[job_id] = {"progress": 100, "pages_found": 0, "errors": [str(exc)], "status": "failed"}
        _record_job_end(job_id, "failed", 0, [str(exc)])
