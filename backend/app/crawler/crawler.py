import asyncio
import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.config import Settings, get_settings
from app.crawler.cache import CrawlCache
from app.crawler.models import CrawlError, CrawlResult, FetchedPage, ParsedPage
from app.crawler import sitemap
from app.crawler.parser import parse_html
from app.crawler.sitemap import build_sitemap, write_sitemap
from app.crawler.url_manager import UrlFrontier, is_same_domain, normalize_url

logger = logging.getLogger(__name__)


class WebsiteCrawler:
    def __init__(
        self,
        settings: Settings | None = None,
        client: httpx.AsyncClient | None = None,
        cache: CrawlCache | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.client = client
        self.cache = cache or CrawlCache()

    async def crawl(self, base_url: str, recrawl: bool = False) -> CrawlResult:
        base_url = normalize_url(base_url)
        self._validate_url(base_url)
        if recrawl:
            self.cache.clear()

        logger.info("crawl_started", extra={"base_url": base_url})
        result = CrawlResult(base_url=base_url)
        frontier = UrlFrontier(base_url)
        frontier.add(base_url)
        await self._add_sitemap_urls(base_url, frontier)
        robots = await self._robots(base_url)
        parents: dict[str, str | None] = {}
        depths: dict[str, int] = {}

        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(
            follow_redirects=True,
            timeout=self.settings.crawl_timeout,
            headers={"User-Agent": self.settings.crawl_user_agent},
        )
        try:
            while len(frontier) and len(result.pages) < self.settings.crawl_max_pages:
                item = frontier.pop()
                if item is None:
                    break
                url, depth, parent = item
                parents[url] = parent
                depths[url] = depth
                if not self._allowed(robots, url):
                    result.errors.append(CrawlError(url=url, error="Blocked by robots.txt"))
                    continue

                fetched = await self._fetch(client, url)
                if fetched.error or not fetched.html or not fetched.status_code or fetched.status_code >= 400:
                    result.errors.append(CrawlError(url=url, error=fetched.error or "HTTP failure", status_code=fetched.status_code))
                    continue

                parsed = parse_html(fetched.html, fetched.final_url)
                result.pages.append(parsed)
                for link in parsed.links:
                    if is_same_domain(link, base_url):
                        frontier.add(link, depth + 1, parsed.url)
                await asyncio.sleep(self.settings.crawl_request_delay)
        finally:
            if owns_client:
                await client.aclose()

        sitemap = build_sitemap(result.pages, parents, depths)
        write_sitemap(sitemap)
        self._write_pages(result.pages, parents, depths)
        result.service_candidates = extract_service_candidates(result.pages)
        logger.info("crawl_completed", extra={"base_url": base_url, "pages": len(result.pages), "errors": len(result.errors)})
        return result

    async def _fetch(self, client: httpx.AsyncClient, url: str) -> FetchedPage:
        cached = self.cache.get(url)
        if cached:
            return FetchedPage(url=url, final_url=url, status_code=cached.status_code, html=cached.content, from_cache=True)
        try:
            response = await client.get(url)
            html = response.text if "text/html" in response.headers.get("content-type", "text/html") else ""
            self.cache.set(url, response.status_code, html, dict(response.headers))
            return FetchedPage(url=url, final_url=normalize_url(str(response.url)), status_code=response.status_code, html=html)
        except httpx.TimeoutException:
            return FetchedPage(url=url, final_url=url, status_code=None, html=None, error="Timeout")
        except httpx.HTTPError as exc:
            return FetchedPage(url=url, final_url=url, status_code=None, html=None, error=str(exc))

    async def _add_sitemap_urls(self, base_url: str, frontier: UrlFrontier) -> None:
        sitemap_url = urljoin(base_url, "/sitemap.xml")
        try:
            async with httpx.AsyncClient(timeout=self.settings.crawl_timeout, headers={"User-Agent": self.settings.crawl_user_agent}) as client:
                response = await client.get(sitemap_url)
                if response.status_code != 200:
                    return
                for raw in response.text.split("<loc>")[1:]:
                    loc = raw.split("</loc>", 1)[0].strip()
                    if loc and is_same_domain(loc, base_url):
                        frontier.add(loc, 0, None)
        except httpx.HTTPError:
            return

    async def _robots(self, base_url: str) -> RobotFileParser:
        parser = RobotFileParser()
        parser.set_url(urljoin(base_url, "/robots.txt"))
        try:
            async with httpx.AsyncClient(timeout=self.settings.crawl_timeout, headers={"User-Agent": self.settings.crawl_user_agent}) as client:
                response = await client.get(parser.url)
                parser.parse(response.text.splitlines() if response.status_code == 200 else [])
        except httpx.HTTPError:
            parser.parse([])
        return parser

    def _allowed(self, robots: RobotFileParser, url: str) -> bool:
        return robots.can_fetch(self.settings.crawl_user_agent, url)

    def _validate_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("base_url must be a valid http(s) URL")

    def _write_pages(self, pages: list[ParsedPage], parents: dict[str, str | None], depths: dict[str, int]) -> None:
        output = sitemap.OUTPUT_DIR / "pages.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        crawled_at = datetime.now(UTC).isoformat()
        payload = []
        for page in pages:
            data = asdict(page)
            payload.append(
                {
                    "url": page.canonical_url,
                    "title": page.title,
                    "page_type": page.page_type if page.page_type != "case_study" else "portfolio",
                    "depth": depths.get(page.url, 0),
                    "parent_url": parents.get(page.url),
                    "section": _section(page.canonical_url),
                    "headings": page.headings,
                    "body_text": page.content,
                    "pricing_info": page.pricing,
                    "contact_info": page.contacts,
                    "form_fields": data.get("forms", []),
                    "crawled_at": crawled_at,
                }
            )
        output.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _section(url: str) -> str:
    path = urlparse(url).path.strip("/")
    return path.split("/", 1)[0] if path else "home"


def extract_service_candidates(pages: list[ParsedPage]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    for page in pages:
        if page.page_type not in {"service", "product", "pricing"}:
            continue
        name = page.headings[0] if page.headings else page.title
        if not name:
            continue
        candidates.append({"name": name, "description": page.summary, "source_url": page.canonical_url})
    return candidates
