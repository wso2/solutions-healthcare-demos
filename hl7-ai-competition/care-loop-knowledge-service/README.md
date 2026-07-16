# care-loop-knowledge-service

A FastMCP RAG server that exposes a curated HFrEF (heart failure with reduced ejection fraction)
knowledge base as MCP tools for the Care Loop agents. Python 3.13 + the official `mcp` SDK
(FastMCP) + embedded Chroma, managed with uv.

It speaks streamable-HTTP at `/mcp` with the same `json_response` + `stateless_http` configuration as
the `wso2/fhir-mcp-server` the stack already consumes, so `care-loop-ai-service`'s Ballerina
`ai:McpToolKit` connects to it the same way.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_guidelines(query, k=4, source_filter?)` | Clinician-facing guideline thresholds/recommendations, each with a paste-ready `citation`. |
| `search_patient_education(query, k=4)` | Plain-language, 65+-friendly wording for a symptom, with a coarse `reading_level`. |
| `get_feature_definition(feature_name)` | Static lookup of one of the 11 Kaggle heart-risk features (exact name or alias). |

## Corpus

The corpus is built from open, redistributable equivalents (see `scripts/sources.py`):

- StatPearls chapters (NCBI Bookshelf, CC BY-NC-ND).
- MedlinePlus and NHLBI patient/clinician pages (US-gov public domain).
- An open-access PMC article summarizing the 2022 AHA/ACC/HFSA guideline thresholds.
- `corpus/feature_glossary.md`, a hand-written glossary of the model's features.

Licensed guideline PDFs can be dropped into the gitignored `corpus/raw/` and registered in
`scripts/sources.py` as `kind="pdf"`.

## Build the vector store

The Chroma store is a build artifact (like the heart-risk ONNX model) and is not committed. Build it
with:

```sh
make ingest    # fetches/snapshots the corpus, embeds it, writes data/chroma/
```

`make ingest` needs `KNOWLEDGE_OPENAI_API_KEY` (or `OPENAI_API_KEY`) to embed with
`text-embedding-3-small`. For a keyless, offline build use a local embedder:

```sh
EMBED=local make ingest    # uses fastembed (installs the embed-local extra)
```

On first run each source is fetched and written to `corpus/snapshot/<id>.json`; commit those
snapshots to make ingestion reproducible without re-fetching. The running container needs a
query-time embedder that matches the Chroma store. The compose stack defaults
`KNOWLEDGE_EMBEDDING_PROVIDER=local` so an Anthropic-backed AI service can run without an OpenAI key.
Set `KNOWLEDGE_EMBEDDING_PROVIDER=openai` plus `OPENAI_API_KEY` if the store was built with OpenAI
embeddings. Anthropic does not provide a compatible embeddings API for this vector store.

## Run

```sh
make run       # streamable-http MCP server on :8000/mcp, health on :8000/health
```

In the stack it is published on host port 8006 (see the root `docker-compose.yml`).

## Develop

```sh
make sync          # install deps (main + dev)
make test          # pytest (uses a stub embedder + in-memory Chroma; no key or network)
make lint          # ruff check
make format        # ruff format
```

Verify the transport by hand:

```sh
curl http://localhost:8006/health
curl -s http://localhost:8006/mcp -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
