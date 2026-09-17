from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

TRACKING_PREFIXES = ("utm_",)
TRACKING_PARAMS = {
    "fbclid",
    "gclid",
    "gbraid",
    "wbraid",
    "mc_cid",
    "mc_eid",
    "msclkid",
}


def normalize_url(url: str, base_url: str | None = None) -> str:
    absolute = urljoin(base_url, url) if base_url else url
    parsed = urlparse(absolute)
    scheme = parsed.scheme.lower() or "https"
    netloc = parsed.netloc.lower()
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    if netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]

    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")

    kept_params = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in TRACKING_PARAMS or lowered.startswith(TRACKING_PREFIXES):
            continue
        kept_params.append((key, value))
    query = urlencode(sorted(kept_params))
    return urlunparse((scheme, netloc, path, "", query, ""))


def get_domain(url: str) -> str:
    return urlparse(url).netloc.lower()


def is_same_domain(url: str, base_url: str) -> bool:
    return get_domain(normalize_url(url)) == get_domain(normalize_url(base_url))


class UrlFrontier:
    def __init__(self, base_url: str) -> None:
        self.base_url = normalize_url(base_url)
        self._queued: list[tuple[str, int, str | None]] = []
        self._seen: set[str] = set()

    def add(self, url: str, depth: int = 0, parent: str | None = None) -> bool:
        normalized = normalize_url(url, self.base_url)
        if normalized in self._seen or not is_same_domain(normalized, self.base_url):
            return False
        self._seen.add(normalized)
        self._queued.append((normalized, depth, parent))
        return True

    def pop(self) -> tuple[str, int, str | None] | None:
        if not self._queued:
            return None
        return self._queued.pop(0)

    def __len__(self) -> int:
        return len(self._queued)
