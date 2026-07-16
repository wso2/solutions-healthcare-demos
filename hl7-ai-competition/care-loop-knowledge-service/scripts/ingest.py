"""Build the Chroma vector store from the curated HFrEF corpus.

Each source is loaded from corpus/snapshot/<id>.json when present (committed, so ingestion is
reproducible offline), otherwise fetched (needs the ``ingest`` extra) and snapshotted. Chunks are
token-windowed with overlap, embedded with OpenAI (or fastembed via ``EMBED=local``), and written to
a persistent Chroma collection whose metadata records the embedding model for a startup check.

Run with ``make ingest`` (needs KNOWLEDGE_OPENAI_API_KEY or OPENAI_API_KEY, unless EMBED=local).
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
from collections.abc import Callable
from pathlib import Path

import tiktoken
from sources import SOURCES, Source

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_DIR = ROOT / "corpus" / "snapshot"

CHUNK_TOKENS = 600
CHUNK_OVERLAP = 100
ENCODING_NAME = "cl100k_base"
BATCH = 64

CHROMA_PATH = ROOT / os.environ.get("KNOWLEDGE_CHROMA_PATH", "data/chroma")
COLLECTION = os.environ.get("KNOWLEDGE_COLLECTION", "hfref")
EMBEDDING_MODEL = os.environ.get("KNOWLEDGE_EMBEDDING_MODEL", "text-embedding-3-small")
LOCAL_EMBEDDING_MODEL = os.environ.get("KNOWLEDGE_LOCAL_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
OPENAI_KEY = os.environ.get("KNOWLEDGE_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
BUILT_AT = os.environ.get("KNOWLEDGE_BUILT_AT", "unversioned")


def load_or_fetch(source: Source) -> str:
    """Return the source text from its committed snapshot, fetching and snapshotting if absent."""
    snapshot = SNAPSHOT_DIR / f"{source.id}.json"
    if snapshot.exists():
        return json.loads(snapshot.read_text())["text"]
    text = fetch(source)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    snapshot.write_text(
        json.dumps(
            {"id": source.id, "citation": source.citation, "audience": source.audience, "text": text},
            indent=2,
        ),
    )
    print(f"snapshotted {source.id} ({len(text)} chars)")
    return text


def fetch(source: Source) -> str:
    """Fetch and clean one source's text (HTML via trafilatura, PDF via PyMuPDF, markdown as-is)."""
    if source.kind == "markdown":
        return (ROOT / source.locator).read_text()
    if source.kind == "pdf":
        import fitz

        with fitz.open(ROOT / source.locator) as doc:
            # get_text("blocks") sorted by column then y keeps two-column reading order sane.
            return "\n".join(page.get_text("text") for page in doc)
    import httpx
    import trafilatura

    response = httpx.get(
        source.locator,
        headers={"User-Agent": "Mozilla/5.0 (CareLoopKnowledgeIngest)"},
        timeout=30,
        follow_redirects=True,
    )
    response.raise_for_status()
    extracted = trafilatura.extract(response.text, include_comments=False, include_tables=False)
    return extracted or response.text


def chunk_text(text: str, encoding: tiktoken.Encoding) -> list[str]:
    """Split text into ~CHUNK_TOKENS token windows with CHUNK_OVERLAP overlap."""
    tokens = encoding.encode(text)
    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_TOKENS, len(tokens))
        piece = encoding.decode(tokens[start:end]).strip()
        if piece:
            chunks.append(piece)
        if end == len(tokens):
            break
        start = end - CHUNK_OVERLAP
    return chunks


def reading_level(text: str) -> str:
    """Coarse readability band from average word length; patient sources skew shorter."""
    words = text.split()
    if not words:
        return "plain"
    avg = sum(len(w) for w in words) / len(words)
    return "basic" if avg < 5.2 else "plain"


def make_embedder() -> tuple[Callable[[list[str]], list[list[float]]], str]:
    """Return (embed_fn, model_name); OpenAI by default, fastembed when EMBED=local."""
    if os.environ.get("EMBED") == "local":
        from fastembed import TextEmbedding

        model = TextEmbedding(model_name=LOCAL_EMBEDDING_MODEL)
        return (lambda texts: [vector.tolist() for vector in model.embed(texts)]), LOCAL_EMBEDDING_MODEL

    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_KEY)

    def embed(texts: list[str]) -> list[list[float]]:
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
        return [item.embedding for item in response.data]

    return embed, EMBEDDING_MODEL


def main() -> None:
    """Fetch/snapshot the corpus, chunk + embed it, and (re)build the Chroma collection."""
    encoding = tiktoken.get_encoding(ENCODING_NAME)
    embed, embed_model = make_embedder()

    ids: list[str] = []
    docs: list[str] = []
    metadatas: list[dict] = []
    seen: set[str] = set()

    for source in SOURCES:
        text = load_or_fetch(source)
        kept = 0
        for index, piece in enumerate(chunk_text(text, encoding)):
            digest = hashlib.sha1(piece.lower().encode()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            ids.append(f"{source.id}-{index}")
            docs.append(piece)
            metadatas.append(
                {
                    "source": source.id,
                    "section": source.citation,
                    "audience": source.audience,
                    "citation": source.citation,
                    "reading_level": reading_level(piece),
                },
            )
            kept += 1
        print(f"{source.id}: {kept} chunks")

    if not docs:
        print("no documents to ingest")
        return

    embeddings: list[list[float]] = []
    for i in range(0, len(docs), BATCH):
        embeddings.extend(embed(docs[i : i + BATCH]))
        print(f"embedded {min(i + BATCH, len(docs))}/{len(docs)}")

    import chromadb

    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    with contextlib.suppress(Exception):
        client.delete_collection(COLLECTION)
    collection = client.create_collection(
        name=COLLECTION,
        metadata={"embedding_model": embed_model, "dim": len(embeddings[0]), "built_at": BUILT_AT},
    )
    collection.add(ids=ids, documents=docs, embeddings=embeddings, metadatas=metadatas)
    print(f"ingested {len(docs)} chunks into '{COLLECTION}' at {CHROMA_PATH}")


if __name__ == "__main__":
    main()
