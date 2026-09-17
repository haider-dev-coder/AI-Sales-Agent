import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, crawl, dashboard, kb, websocket
from app.api.conversations import router as conversations_router
from app.api.leads import router as leads_router
from app.api.faqs import router as faqs_router
from app.api.sales_reps import router as sales_reps_router
from app.api.follow_ups import router as follow_ups_router
from app.api.services import router as services_router
from app.api.settings import router as settings_router
from app.config import get_settings
from app.integrations.calcom import router as calcom_router
from app.integrations.mailjet import router as mailjet_router
from app.integrations.sheets import router as sheets_router
from app.logging import configure_logging

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


STARTUP_MIGRATIONS = (
    "010_page_enhancements.sql",
    "011_create_appointments.sql",
)


def _apply_startup_migrations() -> None:
    """Apply additive schema migrations (idempotent).

    Each file is executed independently so one failure cannot block the rest.
    """
    from pathlib import Path

    from sqlalchemy import text

    from app.database.session import SessionLocal

    migrations_dir = Path(__file__).resolve().parents[1] / "db" / "migrations"
    for name in STARTUP_MIGRATIONS:
        migration = migrations_dir / name
        if not migration.exists():
            logger.warning("startup_migration_missing: %s", name)
            continue
        try:
            with SessionLocal() as db:
                db.execute(text(migration.read_text(encoding="utf-8")))
                db.commit()
            logger.info("startup_migrations_applied: %s", name)
        except Exception as exc:  # pragma: no cover - best-effort schema bootstrap
            logger.warning("startup_migrations_skipped: %s (%s)", name, exc)


def _ensure_lead_constraints() -> None:
    """Add the unique email index lead deduplication relies on (idempotent).

    The live ``leads`` table may predate the unique email constraint, which makes
    ``ON CONFLICT (email)`` upserts fail. Lead capture itself is written
    defensively, but the index keeps the operator console free of duplicates.
    """
    from sqlalchemy import text

    from app.database.session import SessionLocal

    try:
        with SessionLocal() as db:
            db.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS leads_email_key "
                    "ON leads (lower(email)) WHERE email IS NOT NULL"
                )
            )
            db.commit()
        logger.info("startup_migrations_applied: leads_email_key index")
    except Exception as exc:  # pragma: no cover - best-effort schema bootstrap
        logger.warning("lead_index_skipped: %s", exc)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    from app.knowledge.embeddings import init_provider
    from app.knowledge.retriever import retriever

    _apply_startup_migrations()
    _ensure_lead_constraints()
    provider = init_provider()
    retriever.embedding_provider = provider
    logger.info("embedding_provider_ready: %s", type(provider).__name__)
    logger.info("backend_started", extra={"app_env": settings.app_env})
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

dev_allow_all = settings.app_env == "development"
cors_allow_origins = ["*"] if dev_allow_all else settings.cors_origins
cors_allow_credentials = False if dev_allow_all else True

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(crawl.router)
app.include_router(dashboard.router)
app.include_router(kb.router)
app.include_router(conversations_router)
app.include_router(leads_router)
app.include_router(faqs_router)
app.include_router(sales_reps_router)
app.include_router(follow_ups_router)
app.include_router(services_router)
app.include_router(settings_router)
app.include_router(calcom_router)
app.include_router(mailjet_router)
app.include_router(sheets_router)
app.include_router(websocket.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-sales-agent"}