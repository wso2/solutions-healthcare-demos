# PDF-to-Markdown Service

Lightweight PDF-to-Markdown conversion service for the PA Policy Analyzer prior authorization demo. Built with [FastAPI](https://fastapi.tiangolo.com/) and [PyMuPDF4LLM](https://github.com/pymupdf/RAG).

Converts payer policy PDFs into clean Markdown so the BFF can feed them to Claude for structured extraction of coverage clauses and billing codes.

## What it does

Accepts a PDF file upload, converts it to Markdown in a temporary file, and returns the result without persisting anything.

Uses PyMuPDF4LLM under the hood, which produces LLM-friendly Markdown with good table and layout preservation.

## Prerequisites

- Python 3.13+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

## Setup

### 1. Install dependencies

```bash
uv sync
```

Or with pip:

```bash
pip install -e .
```

### 2. Run

```bash
uv run main.py
```

The service starts on **port 6093** and serves all endpoints under `/v1`.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/convert` | Convert an uploaded PDF file (multipart form: `file`) |

### POST `/v1/convert`

Converts an uploaded PDF to Markdown without persisting either file.

**Request:** multipart/form-data with a `file` field containing the PDF.

**Response:**

```json
{
  "markdown": "# Policy Document\n\n..."
}
```

## Project structure

```
pdf-md-service/
  main.py              FastAPI application with conversion endpoints
  pyproject.toml       Project metadata and dependencies
  .python-version      Python version pin (3.13)
```
