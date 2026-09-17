from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256


@dataclass(slots=True)
class CacheEntry:
    url: str
    status_code: int
    content: str
    content_hash: str
    fetched_at: datetime
    headers: dict[str, str]


class CrawlCache:
    def __init__(self) -> None:
        self._entries: dict[str, CacheEntry] = {}

    def get(self, url: str) -> CacheEntry | None:
        return self._entries.get(url)

    def set(self, url: str, status_code: int, content: str, headers: dict[str, str] | None = None) -> CacheEntry:
        entry = CacheEntry(
            url=url,
            status_code=status_code,
            content=content,
            content_hash=sha256(content.encode("utf-8")).hexdigest(),
            fetched_at=datetime.now(timezone.utc),
            headers=headers or {},
        )
        self._entries[url] = entry
        return entry

    def clear(self) -> None:
        self._entries.clear()
