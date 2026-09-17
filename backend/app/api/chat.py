import json
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.graph import agent_graph
from app.knowledge.ingestion import ingest_pages
from app.knowledge.retriever import retriever
from app.crawler.models import ParsedPage
from app.crawler.parser import classify_page
from app.services.conversation_service import load_history, save_history

router = APIRouter(prefix="/api", tags=["chat"])
logger = logging.getLogger(__name__)

PAGES_PATH = Path(__file__).resolve().parents[2] / "crawler" / "output" / "pages.json"


def _ensure_kb_loaded() -> None:
    if len(retriever._chunks) > 0:
        return
    if not PAGES_PATH.exists():
        return
    raw = json.loads(PAGES_PATH.read_text(encoding="utf-8"))
    pages = []
    for p in raw:
        try:
            url = p.get("url", "")
            title = p.get("title")
            headings = p.get("headings", []) or []
            content = p.get("body_text") or p.get("content", "")
            # Re-classify at load time: stored snapshots may predate classifier
            # fixes (e.g. policy pages previously mislabeled as product/service).
            page_type = classify_page(url, title, headings, content)
            page = ParsedPage(
                url=url,
                canonical_url=p.get("canonical_url") or url,
                title=title,
                headings=headings,
                content=content,
                links=p.get("links", []),
                pricing=p.get("pricing_info") or p.get("pricing", []),
                contacts=p.get("contact_info") or p.get("contacts", {}),
                forms=p.get("forms", []),
                page_type=page_type,
                js_heavy=p.get("js_heavy", False),
                summary=p.get("summary", ""),
            )
            pages.append(page)
        except Exception:
            continue
    try:
        ingest_pages(pages)
    except Exception as exc:  # noqa: BLE001 - KB loading must never break chat
        logger.warning(
            "Knowledge base ingestion failed; continuing without RAG context: %s", exc
        )


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    sources: list[dict[str, object]]
    lead_status: str | None = None
    needs_human: bool = False
    intent: str | None = None
    slots: list[dict[str, object]] = []
    booking: dict[str, object] = {}


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    _ensure_kb_loaded()
    conversation_id = request.conversation_id or str(uuid4())
    history = load_history(conversation_id)
    state = agent_graph.run(conversation_id, request.message, history)
    save_history(conversation_id, state.messages)
    return ChatResponse(
        conversation_id=conversation_id,
        message=state.response,
        sources=state.sources,
        lead_status="handoff" if state.needs_human else None,
        needs_human=state.needs_human,
        intent=state.intent,
        slots=state.slots,
        booking=state.booking,
    )