from app.knowledge.ingestion import grounded_answer
from app.knowledge.retriever import retriever


def search_knowledge_base(query: str, top_k: int = 5, threshold: float = 0.15) -> dict[str, object]:
    return grounded_answer(query, top_k=top_k, threshold=threshold)


def get_service_details(query: str) -> list[dict[str, object]]:
    results = retriever.search(query, top_k=5, filters={"page_type": "service"}, threshold=0.05)
    return [{"name": item.metadata.get("title"), "source_url": item.metadata.get("url"), "description": item.content[:300]} for item in results]


def request_human_handoff(conversation_id: str, reason: str) -> dict[str, object]:
    return {"conversation_id": conversation_id, "needs_human": True, "reason": reason}
