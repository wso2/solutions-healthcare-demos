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

Start the backing services first:

```bash
docker compose up postgres fhir-server fhir-mcp
```

Then run the UI outside Docker with the Compose service endpoints supplied as
environment variables:

```bash
pnpm install
FHIR_SERVER_BASE_URL=http://localhost:9090/fhir/r4 FHIR_MCP_URL=http://localhost:8000/mcp/ pnpm dev
```

## Commands

```bash
pnpm dev       # Start the development server
pnpm build     # Create a production build
pnpm start     # Start the production server
pnpm lint      # Run ESLint
pnpm test      # Run the test suite
```
