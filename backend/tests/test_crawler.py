import asyncio
from urllib.robotparser import RobotFileParser

import httpx
import pytest

from app.config import Settings
from app.crawler import sitemap
from app.crawler.crawler import WebsiteCrawler
from app.crawler.parser import parse_html
from app.crawler.url_manager import UrlFrontier, is_same_domain, normalize_url


def test_url_normalization_removes_fragments_tracking_and_trailing_slash() -> None:
    assert normalize_url("https://Example.com/path/?utm_source=x&a=1#top") == "https://example.com/path?a=1"
    assert normalize_url("https://example.com") == "https://example.com/"


def test_domain_filtering_rejects_subdomains() -> None:
    assert is_same_domain("https://example.com/about", "https://example.com")
    assert not is_same_domain("https://blog.example.com/about", "https://example.com")


def test_duplicate_detection() -> None:
    frontier = UrlFrontier("https://example.com")
    assert frontier.add("https://example.com/about/")
    assert not frontier.add("https://example.com/about#team")


def test_parser_extracts_useful_content() -> None:
    parsed = parse_html(
        """
        <html><head><title>Services</title></head>
        <body><nav>Ignore</nav><main><h1>Web Design</h1>
        <p>Packages start at $500. Email hello@example.com.</p>
        <a href="/contact">Contact</a></main></body></html>
        """,
        "https://example.com/services",
    )
    assert parsed.title == "Services"
    assert parsed.headings == ["Web Design"]
    assert "$500" in parsed.pricing
    assert parsed.contacts["emails"] == ["hello@example.com"]
    assert parsed.links == ["https://example.com/contact"]
    assert parsed.page_type == "service"


def test_timeout_handling_and_continuation(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    # Keep test crawl artifacts out of the real crawler output directory
    monkeypatch.setattr(sitemap, "OUTPUT_DIR", tmp_path)

    async def run_test() -> None:
        async def robots(_: str) -> RobotFileParser:
            parser = RobotFileParser()
            parser.parse([])
            return parser

        async def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/slow":
                raise httpx.TimeoutException("slow")
            html = '<main><h1>Home</h1><a href="/slow">Slow</a><a href="/ok">OK</a></main>'
            if request.url.path == "/ok":
                html = "<main><h1>Service</h1><p>Useful service content.</p></main>"
            return httpx.Response(200, text=html, headers={"content-type": "text/html"})

        settings = Settings(crawl_max_pages=5, crawl_request_delay=0, crawl_timeout=1)
        crawler = WebsiteCrawler(settings=settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        monkeypatch.setattr(crawler, "_robots", robots)

        result = await crawler.crawl("https://example.com")

        assert len(result.pages) == 2
        assert any(error.error == "Timeout" for error in result.errors)

    asyncio.run(run_test())
