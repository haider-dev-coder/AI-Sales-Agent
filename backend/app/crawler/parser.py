import re

from bs4 import BeautifulSoup

from app.crawler.models import ParsedPage
from app.crawler.url_manager import normalize_url

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
PRICE_RE = re.compile(r"(?:[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|GBP|PKR))", re.IGNORECASE)


def parse_html(html: str, url: str) -> ParsedPage:
    soup = BeautifulSoup(html, "html.parser")
    for selector in ["script", "style", "noscript", "svg", "iframe", "nav", "header"]:
        for tag in soup.select(selector):
            tag.decompose()

    title = soup.title.get_text(" ", strip=True) if soup.title else None
    headings = [tag.get_text(" ", strip=True) for tag in soup.find_all(["h1", "h2", "h3"]) if tag.get_text(strip=True)]

    content_root = soup.find("main") or soup.find("article") or soup.body or soup
    for noisy in content_root.select("[class*=cookie], [id*=cookie], footer"):
        noisy.decompose()

    text_parts = [part.strip() for part in content_root.stripped_strings]
    content = "\n".join(dict.fromkeys(part for part in text_parts if len(part) > 1))
    links = [
        normalize_url(anchor["href"], url)
        for anchor in soup.find_all("a", href=True)
        if not anchor["href"].startswith(("mailto:", "tel:", "javascript:"))
    ]
    forms = [form.get("action") or "" for form in soup.find_all("form")]
    pricing = [price.rstrip(".,;:") for price in PRICE_RE.findall(content)]
    contacts = {
        "emails": sorted(set(email.rstrip(".,;:") for email in EMAIL_RE.findall(content))),
        "phones": sorted(set(match.strip() for match in PHONE_RE.findall(content))),
    }
    canonical_url = _canonical_url(soup, url)
    page_type = classify_page(url, title, headings, content)
    js_heavy = _is_js_heavy(html, content)
    summary = " ".join(content.split())[:300]

    return ParsedPage(
        url=url,
        canonical_url=canonical_url,
        title=title,
        headings=headings,
        content=content,
        links=links,
        pricing=pricing,
        contacts=contacts,
        forms=forms,
        page_type=page_type,
        js_heavy=js_heavy,
        summary=summary,
    )


# Site plumbing / legal pages. They exist for compliance, not to sell anything,
# and must never be surfaced as sales knowledge (the KB skips these page types).
LEGAL_PATH_NEEDLES = [
    "privacy", "terms", "refund", "returns", "return-policy", "shipping",
    "policy", "policies", "legal", "conditions", "cookies",
]
ACCOUNT_PATH_NEEDLES = [
    "account", "login", "log-in", "signin", "sign-in", "register",
    "password", "wishlist", "orders",
]
CART_PATH_NEEDLES = ["cart", "checkout", "basket"]


def classify_page(url: str, title: str | None, headings: list[str], content: str) -> str:
    path = url.lower()
    # Legal / account / cart pages are checked first so that, for example,
    # "/policies/privacy-policy" is not misclassified as a product/service page.
    if any(needle in path for needle in LEGAL_PATH_NEEDLES):
        return "legal"
    if any(needle in path for needle in ACCOUNT_PATH_NEEDLES):
        return "account"
    if any(needle in path for needle in CART_PATH_NEEDLES):
        return "cart"
    path_checks = [
        ("pricing", ["pricing", "prices", "plans"]),
        ("contact", ["contact"]),
        ("about", ["about"]),
        ("blog", ["blog", "article", "news"]),
        ("case_study", ["case-study", "case_study"]),
        ("portfolio", ["portfolio", "work", "projects"]),
        ("service", ["service", "services", "solutions"]),
        ("product", ["product", "products"]),
    ]
    for page_type, needles in path_checks:
        if any(needle in path for needle in needles):
            return page_type

    haystack = " ".join([url, title or "", *headings, content[:500]]).lower()
    checks = [
        ("legal", ["privacy policy", "terms of service", "refund policy", "return policy", "shipping policy"]),
        ("contact", ["contact", "email", "phone", "get in touch"]),
        ("about", ["about", "our story", "team"]),
        ("blog", ["blog", "article", "news"]),
        ("case_study", ["case study", "case-study", "results"]),
        ("portfolio", ["portfolio", "work", "projects"]),
        ("service", ["service", "services", "solutions", "what we do"]),
        ("product", ["product", "products"]),
        ("pricing", ["pricing", "price", "plans", "packages"]),
    ]
    if url.rstrip("/").count("/") <= 2:
        return "home"
    for page_type, needles in checks:
        if any(needle in haystack for needle in needles):
            return page_type
    return "other"


def _canonical_url(soup: BeautifulSoup, url: str) -> str:
    canonical = soup.find("link", rel=lambda value: value and "canonical" in value)
    href = canonical.get("href") if canonical else None
    return normalize_url(str(href), url) if href else normalize_url(url)


def _is_js_heavy(html: str, content: str) -> bool:
    script_count = html.lower().count("<script")
    return script_count >= 5 and len(content.strip()) < 500
