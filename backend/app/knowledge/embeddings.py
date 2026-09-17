import hashlib
import math
import logging
import os
import re
from typing import Protocol

logger = logging.getLogger(__name__)

TOKEN_RE = re.compile(r"[a-z0-9]+")


class EmbeddingProvider(Protocol):
    def embed(self, text: str) -> list[float]:
        ...


class HashEmbeddingProvider:
    """Deterministic local embeddings for tests and no-key development."""

    def __init__(self, dimensions: int = 128) -> None:
        self.dimensions = dimensions

    def embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for token in TOKEN_RE.findall(text.lower()):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimensions
            vector[index] += 1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


class OpenAIEmbeddingProvider:
    """Wrapper around OpenAI Embeddings API (openai>=1.0.0)."""

    def __init__(self, model: str | None = None) -> None:
        try:
            from openai import OpenAI
        except Exception as exc:
            raise RuntimeError("openai package not available") from exc
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        self._client = OpenAI(api_key=api_key)
        self.model = model or os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    def embed(self, text: str) -> list[float]:
        resp = self._client.embeddings.create(model=self.model, input=text)
        return list(resp.data[0].embedding)


class GeminiEmbeddingProvider:
    """Wrapper around Google GenAI SDK (google-genai)."""

    def __init__(self, model: str | None = None, api_key: str | None = None) -> None:
        try:
            from google import genai  # type: ignore
        except Exception as exc:
            raise RuntimeError("google-genai package not available") from exc
        self._genai = genai
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise RuntimeError("Google/Gemini API key not set")
        self._client = genai.Client(api_key=self.api_key)
        self.model = model or os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")

    def embed(self, text: str) -> list[float]:
        result = self._client.models.embed_content(model=self.model, contents=text)
        embeddings = getattr(result, "embeddings", None)
        if embeddings and len(embeddings) > 0:
            vals = getattr(embeddings[0], "values", None)
            if vals:
                return list(vals)
        if isinstance(result, dict):
            data = result.get("embeddings") or result.get("data")
            if data and isinstance(data, list) and len(data) > 0:
                emb = data[0].get("embedding") or data[0].get("values")
                if emb:
                    return list(emb)
        raise RuntimeError("Unexpected Gemini embedding response")


def _select_provider() -> EmbeddingProvider:
    """Select embedding provider at runtime (called lazily, after .env is loaded)."""
    # Try OpenAI first
    if os.getenv("OPENAI_API_KEY"):
        try:
            provider = OpenAIEmbeddingProvider()
            provider.embed("test")
            logger.info("Using OpenAIEmbeddingProvider")
            return provider
        except Exception as exc:
            logger.warning("OpenAI embeddings failed; trying Gemini: %s", exc)

    # Try Gemini
    if os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"):
        candidate_models = [
            "models/gemini-embedding-001",
            "models/gemini-embedding-2-preview",
            "models/gemini-embedding-2",
        ]
        for m in candidate_models:
            try:
                provider = GeminiEmbeddingProvider(model=m)
                provider.embed("test")
                logger.info("Using GeminiEmbeddingProvider (model=%s)", m)
                return provider
            except Exception as exc:
                # Check if it's a quota/rate limit error
                error_str = str(exc).lower()
                if "429" in error_str or "quota" in error_str or "rate limit" in error_str or "resource_exhausted" in error_str:
                    logger.warning("Gemini model %s quota exhausted, trying next model: %s", m, exc)
                    continue
                logger.warning("Gemini model %s failed: %s", m, exc)
                continue
        logger.warning("All Gemini models failed or quota exhausted; falling back to HashEmbeddingProvider")

    logger.warning(
        "GEMINI_API_KEY / GOOGLE_API_KEY not set or all models quota exhausted — using HashEmbeddingProvider. "
        "RAG will not work correctly. Set a key in .env and restart."
    )
    return HashEmbeddingProvider()


# -----------------------------------------------------------------
# LAZY singleton — not created at import time.
# Call init_provider() once from app startup (lifespan/on_startup).
# get_provider() raises if called before init.
# -----------------------------------------------------------------
_provider: EmbeddingProvider | None = None


def init_provider() -> EmbeddingProvider:
    """Call once at application startup (after env vars are loaded)."""
    global _provider
    _provider = _select_provider()
    return _provider


def get_provider() -> EmbeddingProvider:
    global _provider
    if _provider is None:
        # Auto-init on first use — handles cases where init_provider() was skipped
        logger.warning("get_provider() called before init_provider(); initialising now.")
        _provider = _select_provider()
    return _provider


def reset_provider() -> None:
    """Force re-selection (useful after env vars change in tests)."""
    global _provider
    _provider = None


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=True))
