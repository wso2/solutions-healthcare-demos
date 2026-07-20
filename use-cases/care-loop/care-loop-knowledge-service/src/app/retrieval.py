"""Vector retrieval over the HFrEF knowledge base.

A single Chroma collection holds both clinician-facing guideline chunks and
patient-facing education chunks, distinguished by an ``audience`` metadata field.
The embedder is injectable so tests can supply a deterministic, network-free stub.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

import tiktoken
from loguru import logger

from app.config import Settings, get_settings

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection

# Defensive cap on returned chunk length so a mis-ingested giant chunk cannot flood the agent context.
MAX_CHUNK_TOKENS = 800
_ENCODING_NAME = "cl100k_base"


@runtime_checkable
class Embedder(Protocol):
    """Anything that turns query text into a fixed-dimension embedding vector."""

    def embed(self, text: str) -> list[float]:
        """Return the embedding vector for ``text``."""
        ...


class OpenAIEmbedder:
    """Embeds query text with the OpenAI embeddings API."""

    def __init__(self, api_key: str, model: str) -> None:
        """Create an OpenAI client for the given key and embedding model."""
        from openai import OpenAI  # noqa: PLC0415 - lazy: keep the openai import off the import path

        if not api_key:
            logger.warning(
                "KNOWLEDGE_OPENAI_API_KEY is empty; query embedding will fail until it is set.",
            )
        self._client = OpenAI(api_key=api_key or None)
        self._model = model

    def embed(self, text: str) -> list[float]:
        """Embed ``text`` with the configured OpenAI model."""
        response = self._client.embeddings.create(model=self._model, input=text)
        return response.data[0].embedding


class LocalEmbedder:
    """Embeds query text with a local fastembed model (offline fallback)."""

    def __init__(self, model_name: str) -> None:
        """Load the local fastembed model (installed via the embed-local extra)."""
        from fastembed import TextEmbedding  # noqa: PLC0415 - lazy: fastembed is an optional extra

        self._model = TextEmbedding(model_name=model_name)

    def embed(self, text: str) -> list[float]:
        """Embed ``text`` locally with fastembed."""
        return next(iter(self._model.embed([text]))).tolist()


def build_embedder(settings: Settings) -> Embedder:
    """Construct the embedder implied by ``settings.embedding_provider``."""
    if settings.embedding_provider == "local":
        return LocalEmbedder(settings.local_embedding_model)
    return OpenAIEmbedder(api_key=settings.openai_api_key, model=settings.embedding_model)


def active_embedding_model(settings: Settings) -> str:
    """Return the embedding model name used for query-time vectors."""
    if settings.embedding_provider == "local":
        return settings.local_embedding_model
    return settings.embedding_model


def _truncate_tokens(text: str, max_tokens: int = MAX_CHUNK_TOKENS) -> str:
    """Truncate ``text`` to at most ``max_tokens`` cl100k tokens, defensively."""
    encoding = tiktoken.get_encoding(_ENCODING_NAME)
    tokens = encoding.encode(text)
    if len(tokens) <= max_tokens:
        return text
    return encoding.decode(tokens[:max_tokens])


def _score_from_distance(distance: float | None) -> float:
    """Map a Chroma cosine distance to a [0, 1] similarity score."""
    if distance is None:
        return 0.0
    return max(0.0, min(1.0, 1.0 - distance))


class Retriever:
    """Embeds queries and searches the HFrEF Chroma collection."""

    def __init__(self, collection: Collection, embedder: Embedder, settings: Settings | None = None) -> None:
        """Wrap a Chroma collection and an embedder, verifying the collection on construction."""
        self._collection = collection
        self._embedder = embedder
        self._settings = settings or get_settings()
        self._verify_collection()

    def _verify_collection(self) -> None:
        """Warn (never crash) if the collection is empty or built with a different embedding model."""
        try:
            count = self._collection.count()
        except Exception as exc:  # noqa: BLE001 - a broken store must not take the demo down
            logger.warning("Could not read the '{}' collection: {}", self._settings.collection, exc)
            return
        if count == 0:
            logger.warning(
                "The '{}' collection is empty; run `make ingest` to build it before serving.",
                self._settings.collection,
            )
            return
        built_model = (self._collection.metadata or {}).get("embedding_model")
        configured_model = active_embedding_model(self._settings)
        if built_model and built_model != configured_model:
            logger.warning(
                "Collection was built with embedding_model='{}' but the service is configured for '{}'; "
                "query and index vectors may be incompatible.",
                built_model,
                configured_model,
            )

    def embed_query(self, text: str) -> list[float]:
        """Embed a query string into a vector."""
        return self._embedder.embed(text)

    def search(
        self,
        query: str,
        k: int | None = None,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Embed ``query`` and return the ``k`` nearest chunks, optionally filtered by ``where``."""
        n_results = k or self._settings.default_k
        embedding = self.embed_query(query)
        result = self._collection.query(
            query_embeddings=[embedding],
            n_results=n_results,
            where=where,
        )
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        hits: list[dict[str, Any]] = []
        for text, metadata, distance in zip(documents, metadatas, distances, strict=False):
            meta = dict(metadata or {})
            hits.append(
                {
                    "text": _truncate_tokens(text or ""),
                    "source": str(meta.get("source", "")),
                    "section": str(meta.get("section", "")),
                    "citation": str(meta.get("citation", "")),
                    "audience": str(meta.get("audience", "")),
                    "reading_level": str(meta.get("reading_level", "plain")),
                    "score": _score_from_distance(distance),
                },
            )
        return hits


def build_retriever(settings: Settings | None = None) -> Retriever:
    """Build a Retriever backed by the persistent Chroma store described by ``settings``."""
    import chromadb  # noqa: PLC0415 - lazy: chromadb is heavy; keep it off the import path for tests

    settings = settings or get_settings()
    client = chromadb.PersistentClient(path=str(settings.chroma_path))
    collection = client.get_or_create_collection(name=settings.collection)
    return Retriever(collection=collection, embedder=build_embedder(settings), settings=settings)
