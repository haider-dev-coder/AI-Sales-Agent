from dataclasses import dataclass

from app.knowledge.embeddings import get_provider, cosine_similarity


@dataclass(slots=True)
class KnowledgeChunk:
    content: str
    embedding: list[float]
    metadata: dict[str, object]


@dataclass(slots=True)
class RetrievalResult:
    content: str
    score: float
    metadata: dict[str, object]


class InMemoryRetriever:
    def __init__(self, embedding_provider: object | None = None) -> None:
        # Use configured provider (OpenAI if key present) or fallback provider
        self.embedding_provider = embedding_provider or get_provider()
        self._chunks: list[KnowledgeChunk] = []

    def add(self, content: str, metadata: dict[str, object]) -> None:
        self._chunks.append(KnowledgeChunk(content=content, embedding=self.embedding_provider.embed(content), metadata=metadata))

    def clear(self) -> None:
        self._chunks.clear()

    def search(
        self,
        query: str,
        top_k: int = 5,
        filters: dict[str, object] | None = None,
        threshold: float = 0.15,
        boost: dict[str, float] | None = None,
    ) -> list[RetrievalResult]:
        query_embedding = self.embedding_provider.embed(query)
        results: list[RetrievalResult] = []
        for chunk in self._chunks:
            if filters and any(chunk.metadata.get(key) != value for key, value in filters.items()):
                continue
            score = cosine_similarity(query_embedding, chunk.embedding)
            if boost:
                factor = boost.get(str(chunk.metadata.get("page_type") or "").lower(), 1.0)
                score *= factor
            if score >= threshold:
                results.append(RetrievalResult(content=chunk.content, score=score, metadata=chunk.metadata))
        return sorted(results, key=lambda item: item.score, reverse=True)[:top_k]


retriever = InMemoryRetriever()
