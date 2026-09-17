import json
from pathlib import Path

from app.crawler.models import ParsedPage

OUTPUT_DIR = Path(__file__).resolve().parents[2] / "crawler" / "output"

def build_sitemap(pages: list[ParsedPage], parents: dict[str, str | None], depths: dict[str, int]) -> list[dict[str, object]]:
    # Deduplicate by URL: a page can be reached via multiple paths, and repeated
    # entries produce duplicate React keys in the sitemap tree view.
    sitemap: list[dict[str, object]] = []
    seen: set[str] = set()
    for page in pages:
        url = page.canonical_url or page.url
        if url in seen:
            continue
        seen.add(url)
        sitemap.append(
            {
                "url": url,
                "title": page.title,
                "type": page.page_type,
                "parent": parents.get(page.url),
                "depth": depths.get(page.url, 0),
                "summary": page.summary,
            }
        )
    return sitemap


def write_sitemap(sitemap: list[dict[str, object]], path: str | Path | None = None) -> None:
    output = Path(path) if path else OUTPUT_DIR / "sitemap.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(sitemap, indent=2), encoding="utf-8")
    write_sitemap_markdown(sitemap, output.with_suffix(".md"))


def write_sitemap_markdown(sitemap: list[dict[str, object]], path: str | Path) -> None:
    lines = ["# Crawled Sitemap", ""]
    for page in sorted(sitemap, key=lambda item: (int(item.get("depth", 0)), str(item.get("url", "")))):
        indent = "  " * int(page.get("depth", 0))
        title = page.get("title") or page.get("url")
        lines.append(f"{indent}- [{page.get('type')}] {title} - {page.get('url')}")
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8")
