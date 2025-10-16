# Call Center AI Agent — User Interface

## Overview
This project is a React and TypeScript-based web application designed to assist call center agents in managing patient interactions. It integrates with a FHIR server using the `/Patient/$match` endpoint to locate patients, displays patient details, and provides a chat interface powered by an AI agent. The AI agent leverages contextual information about patients and agents through an MCP server. Authentication is managed via Asgardeo.

## Quick Start
1. Clone the repository.
2. Create a `.env` file in the project root (refer to `.env.example` for guidance).
3. Install dependencies:
    ```bash
    npm install
    ```
4. Start the development server:
    ```bash
    npm run dev
    ```

### Required Environment Variables
Copy and paste the following into a new `.env` file at the project root, then adjust values as needed:

```bash
# ==============================
# Backend endpoints & proxies
# ==============================
# Note: These URLs are proxied in vite.config.ts. You only need to provide the base URLs here.
# Eg: You don't need to include /Patient/$match or /$everything here.

# MPI (Master Patient Index API) URL (proxied at /mpi)
VITE_MPI_SERVICE_URL=http://localhost:8081
# Data Aggregator (FHIR Server) URL (proxied at /data)
VITE_DATA_AGGREGATOR_URL=http://localhost:8000

# Call Center AI Agent base URL (proxied at /api)
VITE_CALL_CENTER_AI_AGENT_URL=http://localhost:9090

# ==============================
# Patient $match defaults
# ==============================
VITE_PATIENT_MATCH_COUNT=1
VITE_PATIENT_MATCH_ONLY_SINGLE_MATCH=true
VITE_PATIENT_MATCH_ONLY_CERTAIN_MATCH=true

# ==============================
# Asgardeo Authentication
# ==============================
# Redirect URL you configured in Asgardeo (add this exact URL there too) 
# This is optional to configure. If not set, defaults to window.location.origin
VITE_REACT_APP_REDIRECT_URL=http://localhost:8080

# Your Asgardeo application credentials
VITE_REACT_APP_ASGARDEO_CLIENT_ID=your-client-id-here
VITE_REACT_APP_ASGARDEO_CLIENT_SECRET=your-client-secret-here
VITE_REACT_APP_ASGARDEO_BASE_URL=https://api.asgardeo.io/t/your-organization-name
```

## Key Features
- Patient matching using the FHIR `/Patient/$match` endpoint
- Display of patient details and contextual information for agents
- Chat interface integrated with an AI agent and MCP server for contextual responses
- Authentication and session management powered by Asgardeo. Client credentials grant flow is used for secure backend communication.

## Tech Stack
- **Vite** — Build tool for fast development
- **TypeScript** — Strongly typed JavaScript
- **React** — UI library for building user interfaces
- **Tailwind CSS** — Utility-first CSS framework
- **shadcn-ui** — Component library for consistent UI
