# FHIR Explorer

FHIR Explorer is a feature-rich client for the WSO2 FHIR Server. It supports
inspecting capabilities, searching and reading resources, creating and modifying
data, and invoking FHIR operations. FHIR Chat queries the same server through one
standalone WSO2 FHIR MCP Server.

![FHIR Explorer](../../assets/fhir-explorer.png)

## Prerequisites

- Node.js 22 or later
- pnpm 11 or later
- An OpenAI-compatible API key for the assistant

## Setup

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`. Set `OPENAI_BASE_URL` when using an OpenAI-compatible
gateway instead of the default OpenAI endpoint.

`/api/*` accepts browser requests only from the Explorer's own origin by default.
Set `EXPLORER_ALLOWED_ORIGINS` to a comma-separated list when a first-party frontend
uses a different origin. This browser protection does not replace authentication for
direct API clients.

Start the complete stack:

```bash
docker compose up --build
```

Open `http://localhost:3000` in a browser. The WSO2 FHIR Server is available at
`http://localhost:9090/fhir/r4` and the MCP endpoint at `http://localhost:8000/mcp/`.
Set `FHIR_EXPLORER_HOST_PORT` or `FHIR_MCP_HOST_PORT` before starting Compose to use
different host ports.

To stop the stack while retaining FHIR data:

```bash
docker compose down
```

To remove the persisted PostgreSQL and implementation-guide data as well:

```bash
docker compose down -v
```

## Local UI development

Run the Explorer and its backing services in development mode:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Explorer runs with `next dev` and reloads when files in this directory change.
The source directory is mounted into the container, while dependencies and Next's
build cache stay in Docker volumes.

To run the UI outside Docker instead, start the backing services:

```bash
docker compose up postgres fhir-server fhir-mcp
pnpm install
FHIR_SERVER_BASE_URL=http://localhost:9090/fhir/r4 FHIR_MCP_URL=http://localhost:8000/mcp/ pnpm dev
```

## Caching

The Capability tab reads the server's CapabilityStatement (`GET /metadata`).
Anonymous capability requests are cached in the Explorer's Node process for 15
minutes and answered with `Cache-Control: public, max-age=0, must-revalidate,
s-maxage=900, stale-while-revalidate=300`. Requests that carry an `Authorization`
header are never cached and answer `Cache-Control: private, no-store`. Every other
FHIR request bypasses the cache.

The in-process cache is per replica. Cloudflare does not cache JSON by default, so
the `Cache-Control` header only takes effect at the edge once a Cache Rule marks
the capability request as eligible. Create a Cache Rule with the expression:

```
(http.request.uri.path eq "/api/fhir") and (http.request.uri.query contains "metadata")
```

Set Cache eligibility to Eligible for cache and leave the edge TTL origin-controlled
so the `s-maxage` above is honored. Do not widen the rule to all of `/api/fhir`: it
would cache clinical reads and searches across callers.

## Commands

```bash
pnpm dev       # Start the development server
pnpm build     # Create a production build
pnpm start     # Start the production server
pnpm lint      # Run ESLint
pnpm test      # Run the test suite
```
