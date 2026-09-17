from app.config import Settings, get_settings
from app.crawler.models import ParsedPage
from app.knowledge.chunker import TextChunk, chunk_text
from app.knowledge.cleaner import clean_content
from app.knowledge.retriever import InMemoryRetriever, retriever
from datetime import UTC, datetime


def _persist_chunks(all_chunks: list[TextChunk]) -> None:
    """Persist chunk rows to the knowledge_chunks table (best-effort upsert).

    The table has a UNIQUE (url, chunk_index) constraint, so re-crawls
    overwrite existing rows instead of duplicating them.
    """
    if not all_chunks:
        return
    try:
        from sqlalchemy import text

        from app.database.session import SessionLocal

        with SessionLocal() as db:
            for chunk in all_chunks:
                url = str(chunk.metadata.get("url") or "")
                page_title = chunk.metadata.get("title")
                page_type = str(chunk.metadata.get("page_type") or "other")
                db.execute(
                    text(
                        """
                        INSERT INTO knowledge_chunks (url, page_type, page_title, chunk_index, chunk_text, crawled_at)
                        VALUES (:url, :page_type, :page_title, :chunk_index, :chunk_text, NOW())
                        ON CONFLICT (url, chunk_index) DO UPDATE SET
                          page_type = EXCLUDED.page_type,
                          page_title = EXCLUDED.page_title,
                          chunk_text = EXCLUDED.chunk_text,
                          crawled_at = NOW()
                        """
                    ),
                    {
                        "url": url,
                        "page_type": page_type,
                        "page_title": page_title,
                        "chunk_index": chunk.chunk_index,
                        "chunk_text": chunk.content,
                    },
                )
            db.commit()
    except Exception:
        # Persistence is best-effort; in-memory retriever remains authoritative.
        pass


# Page types that are site plumbing or compliance text, not sales knowledge.
# Indexing them causes privacy/refund/terms boilerplate (or empty cart/login
# pages) to be retrieved and echoed as if it were product/service information.
EXCLUDED_PAGE_TYPES = {"legal", "account", "cart"}


def ingest_pages(
    pages: list[ParsedPage],
    website_id: str = "default",
    target: InMemoryRetriever | None = None,
    settings: Settings | None = None,
) -> list[TextChunk]:
    settings = settings or get_settings()
    target = target or retriever
    target.clear()
    all_chunks: list[TextChunk] = []
    crawl_timestamp = datetime.now(UTC).isoformat()
    for page in pages:
        if (page.page_type or "").lower() in EXCLUDED_PAGE_TYPES:
            continue
        cleaned = clean_content(page.content)
        # Calculate approximate token count (rough: 1 token ≈ 4 characters)
        token_count = max(1, len(cleaned) // 4)
        metadata = {
            "website_id": website_id,
            "page_id": page.canonical_url,
            "url": page.canonical_url,
            "title": page.title,
            "page_type": page.page_type,
            "token_count": token_count,
            "crawl_timestamp": crawl_timestamp,
        }
        chunks = chunk_text(cleaned, metadata, settings.chunk_max_chars, settings.chunk_overlap_chars)
        for chunk in chunks:
            target.add(chunk.content, chunk.metadata)
        all_chunks.extend(chunks)
    _persist_chunks(all_chunks)
    return all_chunks


# Sales questions should surface what the business sells, not generic contact
# blurb. Nudge product/service/about pages up and contact/home pages down.
_PAGE_TYPE_BOOST = {"product": 1.25, "service": 1.25, "pricing": 1.2, "about": 1.1, "home": 0.85, "contact": 0.9}


def grounded_answer(question: str, top_k: int = 5, threshold: float = 0.15) -> dict[str, object]:
    results = retriever.search(question, top_k=top_k, threshold=threshold, boost=_PAGE_TYPE_BOOST)
    if not results:
        return {
            "answer": "I couldn't find enough information on the website to answer that accurately. I can connect you with someone from the team.",
            "sources": [],
            "context": "",
            "grounded": False,
        }
    sources = [{"url": item.metadata.get("url"), "title": item.metadata.get("title"), "score": item.score} for item in results]
    context = " ".join(item.content for item in results)
    answer = context[:700].strip()
    return {"answer": answer, "sources": sources, "context": context, "grounded": True}
