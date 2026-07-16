import hashlib
import uuid
from pathlib import Path

import chromadb
import pytest

from app.config import Settings
from app.retrieval import Retriever

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "mini_corpus"
_EMBED_DIM = 16


class StubEmbedder:
    """Deterministic, network-free embedder: hashes text to a fixed-dimension vector."""

    def embed(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode()).digest()
        return [byte / 255 for byte in digest[:_EMBED_DIM]]


@pytest.fixture
def embedder() -> StubEmbedder:
    return StubEmbedder()


@pytest.fixture
def retriever(embedder: StubEmbedder) -> Retriever:
    """A Retriever over an in-memory Chroma built from the mini corpus with the stub embedder."""
    # EphemeralClient shares in-memory state per process, so use a unique collection name per test to avoid collisions.
    client = chromadb.EphemeralClient()
    collection = client.create_collection(
        f"hfref-{uuid.uuid4().hex}",
        metadata={"embedding_model": "text-embedding-3-small"},
    )
    ids, docs, embeddings, metadatas = [], [], [], []
    for path in sorted(FIXTURE_DIR.glob("*.md")):
        text = path.read_text()
        audience = "patient" if path.name.startswith("education") else "clinician"
        ids.append(path.stem)
        docs.append(text)
        embeddings.append(embedder.embed(text))
        metadatas.append(
            {
                "source": path.stem,
                "section": "body",
                "audience": audience,
                "citation": f"Fixture: {path.stem}",
                "reading_level": "basic" if audience == "patient" else "plain",
            },
        )
    collection.add(ids=ids, documents=docs, embeddings=embeddings, metadatas=metadatas)
    settings = Settings(embedding_model="text-embedding-3-small")
    return Retriever(collection=collection, embedder=embedder, settings=settings)
