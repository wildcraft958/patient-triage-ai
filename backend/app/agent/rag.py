"""Retrieval over the ESI v4 Implementation Handbook.

BM25 keyword retrieval over ~1200-char page chunks - deliberately simple:
fully offline, deterministic, and auditable (each excerpt cites its page).
Chunks are extracted once and cached under data/cache/.
"""

import json
import re
from functools import lru_cache

from rank_bm25 import BM25Okapi

from app.data_io import DATA_DIR

HANDBOOK_PDF = DATA_DIR / "esi_handbook" / "ESI_Handbook.pdf"
CHUNK_CACHE = DATA_DIR / "cache" / "esi_chunks.json"
CHUNK_CHARS = 1200


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def build_chunks() -> list[dict]:
    from pypdf import PdfReader

    if not HANDBOOK_PDF.exists():
        raise FileNotFoundError(f"{HANDBOOK_PDF} missing - run scripts/fetch_data.py first")
    chunks = []
    for page_no, page in enumerate(PdfReader(HANDBOOK_PDF).pages, start=1):
        text = re.sub(r"\s+", " ", page.extract_text() or "").strip()
        for i in range(0, len(text), CHUNK_CHARS):
            piece = text[i : i + CHUNK_CHARS]
            if len(piece) > 200:  # skip near-empty page tails
                chunks.append({"page": page_no, "text": piece})
    CHUNK_CACHE.parent.mkdir(parents=True, exist_ok=True)
    CHUNK_CACHE.write_text(json.dumps(chunks))
    return chunks


@lru_cache(maxsize=1)
def _index() -> tuple[list[dict], BM25Okapi]:
    if CHUNK_CACHE.exists():
        chunks = json.loads(CHUNK_CACHE.read_text())
    else:
        chunks = build_chunks()
    return chunks, BM25Okapi([_tokenize(c["text"]) for c in chunks])


def retrieve(query: str, k: int = 3) -> list[dict]:
    chunks, bm25 = _index()
    scores = bm25.get_scores(_tokenize(query))
    top = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)[:k]
    return [chunks[i] for i in top if scores[i] > 0]
