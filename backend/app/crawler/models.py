from dataclasses import dataclass, field


@dataclass(slots=True)
class ParsedPage:
    url: str
    canonical_url: str
    title: str | None
    headings: list[str]
    content: str
    links: list[str]
    pricing: list[str]
    contacts: dict[str, list[str]]
    forms: list[str]
    page_type: str
    js_heavy: bool
    summary: str


@dataclass(slots=True)
class FetchedPage:
    url: str
    final_url: str
    status_code: int | None
    html: str | None
    error: str | None = None
    from_cache: bool = False


@dataclass(slots=True)
class CrawlError:
    url: str
    error: str
    status_code: int | None = None


@dataclass(slots=True)
class CrawlResult:
    base_url: str
    pages: list[ParsedPage] = field(default_factory=list)
    errors: list[CrawlError] = field(default_factory=list)
    service_candidates: list[dict[str, str]] = field(default_factory=list)
