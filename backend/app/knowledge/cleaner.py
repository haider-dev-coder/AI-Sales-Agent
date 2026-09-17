import re


def clean_content(content: str) -> str:
    normalized = re.sub(r"\r\n?", "\n", content)
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()
