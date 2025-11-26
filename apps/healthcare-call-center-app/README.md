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

### Required Configuration
Configure the following settings in your application by adding them to a `config.js` file or embedding them directly into your HTML before loading the main application script:

```bash
window.config = {
    mpiServiceURL: '<MPI_SERVICE_URL>',
    dataAggregatorURL: '<DATA_AGGREGATOR_URL>',
    agentChatServiceURL: '<AGENT_CHAT_SERVICE_URL>',
    asgardeo: {
        clientId: '<ASGARDEO_CLIENT_ID>',
        clientSecret: '<ASGARDEO_CLIENT_SECRET>',
        baseUrl: '<ASGARDEO_BASE_URL>',
    },
    patientMatch: {
        count: <NUMBER_OF_MATCHES>,
        onlySingleMatch: true,
        onlyCertainMatches: true
    }
}
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
