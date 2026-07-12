# PA Policy Analyzer UI

Frontend for the PA Policy Analyzer prior authorization demo. Built with React 19, TypeScript, and [Oxygen UI](https://github.com/wso2/oxygen-ui).

Provides a clinical workspace where users can browse patient records from a Cerner FHIR R4 EMR, view payer coverage policies, and run AI-powered prior-auth evaluations that match patient evidence against policy clauses.

## Pages

| Page | Purpose |
|------|---------|
| **Evaluations** | List, search, and filter prior-auth evaluations by status |
| **Evaluation Detail** | Three-panel view: clause tree, gap analysis with evidence cards, and patient chart |
| **New Evaluation** | Wizard to select patient, payer, and CPT code, then kick off an AI evaluation with live progress |
| **Policies** | Browse payers, drill into CPT/HCPCS codes, and inspect coverage clause trees |
| **Patients** | Split-pane patient browser with tabbed clinical resources (documents, medications, procedures, coverage) |
| **Payer Onboarding** | Multi-step workflow to ingest a new payer's policy PDFs and track conversion progress |

## Prerequisites

- Node.js 20+
- The [PA Policy Analyzer BFF](../bff) running on port 6091

## Setup

```bash
npm install
npm run dev
```

The dev server starts on **http://localhost:5173** and proxies API calls to the BFF at `localhost:6091`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Architecture

**Routing** -- State-based navigation via `useState<PageState>` rather than a URL router. A `navigate(pageName, params)` callback is threaded through all pages.

**Data fetching** -- All API calls go through a thin client in `src/api/bff.ts` that talks to the BFF at `/v1`. FHIR bundles are mapped to UI-friendly models in `src/api/fhirMappers.ts`. No global state library; pages manage their own data with `useState` and `useEffect`.

**UI framework** -- Oxygen UI (WSO2's Material Design component library) with built-in light/dark mode toggle. All styling uses the MUI `sx` prop.

## Project structure

```
demo-ui/
  src/
    main.tsx                  Entry point
    App.tsx                   Shell layout, sidebar nav, state-based router
    api/
      bff.ts                  Base HTTP client (apiFetch, apiPost, binary proxy)
      patients.ts             Patient list, summary, and resource queries
      evaluations.ts          Evaluation CRUD and status mappers
      policies.ts             Payer, policy, and clause queries
      payerOnboarding.ts      Onboarding and resync workflows
      fhirMappers.ts          FHIR R4 bundle -> UI model mappers
    pages/
      EvaluationsPage.tsx     Evaluation list with search and status filters
      EvaluationDetailPage.tsx  Three-panel clause/gap/chart detail view
      NewEvaluationPage.tsx   Evaluation creation wizard with progress polling
      PoliciesPage.tsx        Multi-view payer and policy browser
      PatientsPage.tsx        Split-pane patient list and chart viewer
      PayerOnboardingPage.tsx Multi-step payer ingestion flow
    components/
      StatusChip.tsx          Colored status badges for clauses and evaluations
      ClauseTree.tsx          Recursive policy clause tree with status indicators
      PatientPanel.tsx        Tabbed patient chart (documents, meds, procedures, coverage)
    data/
      types.ts                Shared TypeScript interfaces (Patient, Policy, Evaluation, etc.)
```
