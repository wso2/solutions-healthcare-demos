import tiktoken

from app.retrieval import MAX_CHUNK_TOKENS, Retriever, _truncate_tokens


def test_search_filters_by_audience(retriever: Retriever) -> None:
    hits = retriever.search("shortness of breath", k=5, where={"audience": "patient"})
    assert hits
    assert all(hit["audience"] == "patient" for hit in hits)


def test_search_clinician_audience(retriever: Retriever) -> None:
    hits = retriever.search("guideline directed therapy", k=5, where={"audience": "clinician"})
    assert hits
    assert all(hit["audience"] == "clinician" for hit in hits)


def test_search_hit_shape_and_citation(retriever: Retriever) -> None:
    hits = retriever.search("weight gain", k=5, where={"audience": "clinician"})
    assert hits
    hit = hits[0]
    for key in ("text", "source", "section", "citation", "score"):
        assert key in hit
    assert hit["citation"].startswith("Fixture:")
    assert 0.0 <= hit["score"] <= 1.0


def test_truncate_caps_token_length() -> None:
    long_text = "congestion " * 4000
    truncated = _truncate_tokens(long_text)
    encoding = tiktoken.get_encoding("cl100k_base")
    assert len(encoding.encode(truncated)) <= MAX_CHUNK_TOKENS
