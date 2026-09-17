from dataclasses import dataclass


@dataclass(slots=True)
class TextChunk:
    content: str
    chunk_index: int
    metadata: dict[str, object]


def chunk_text(
    content: str,
    metadata: dict[str, object],
    max_chars: int = 900,
    overlap_chars: int = 120,
) -> list[TextChunk]:
    paragraphs = [part.strip() for part in content.split("\n\n") if part.strip()]
    chunks: list[TextChunk] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(_make_chunk(current, len(chunks), metadata))
            current = current[-overlap_chars:] if overlap_chars else ""
        if len(paragraph) > max_chars:
            for start in range(0, len(paragraph), max_chars - overlap_chars):
                piece = paragraph[start : start + max_chars].strip()
                if piece:
                    chunks.append(_make_chunk(piece, len(chunks), metadata))
            current = ""
        else:
            current = paragraph

    if current:
        chunks.append(_make_chunk(current, len(chunks), metadata))
    return chunks


def _make_chunk(content: str, index: int, metadata: dict[str, object]) -> TextChunk:
    chunk_metadata = dict(metadata)
    chunk_metadata["chunk_index"] = index
    return TextChunk(content=content, chunk_index=index, metadata=chunk_metadata)
