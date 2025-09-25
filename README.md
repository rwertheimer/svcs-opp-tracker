# Services Opportunity Tracker

A full-stack application for tracking services opportunities, action plans, and sales workflows. The app pairs a Vite/React frontend with an Express + TypeScript backend backed by Postgres for stateful data and BigQuery for read-only analytics. This README captures the architecture, guiding principles, and daily workflow for the repository.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Guiding Principles](#guiding-principles)
4. [Local Environment Setup](#local-environment-setup)
5. [Running the App](#running-the-app)
6. [Testing](#testing)
7. [Data Sources](#data-sources)
8. [Troubleshooting & Support](#troubleshooting--support)

## Architecture Overview
- **Frontend**: React 18 + TypeScript served by Vite. Responsible for the pipeline view, opportunity detail surfaces, saved view modals, org-chart filter builder, and toast notifications.
- **Backend**: Express server written in TypeScript (executed via `ts-node`). Routes live in `backend/server.ts` and supporting modules. Provides REST endpoints for opportunities, saved views, and action plan CRUD.
- **State management**: Local React state + context, optimistic UI updates for disposition and action items with server reconciliation.
- **Data stores**:
  - **Postgres** (primary): opportunities, action_items, users, and saved_views (multi-user persistence enforced with unique constraints and schema bootstrap at server startup).
  - **BigQuery** (read-only): analytics joins referenced by the backend when enriching opportunity data.
- **Types**: `types.ts` is the single source of truth for shared interfaces across the frontend and backend.

## Project Structure
```
├── App.tsx                # Root shell, routing, and modal orchestration
├── components/            # Feature components (lists, detail views, filter builder, org chart, toasts)
├── services/              # API clients, data mappers, and optimistic update helpers
├── backend/               # Express server, routes, migrations, and seed scripts
├── test/                  # Vitest suites, MSW handlers, and fixture factories
├── types.ts               # Shared domain models
└── AGENTS.md              # Contributor guide (design principles, testing expectations)
```

## Guiding Principles
- **Behavior-first**: Prioritise user-visible outcomes and data integrity over implementation detail.
- **Traceability**: Saved views, filters, and org-chart generated segments carry explicit metadata so users understand provenance.
- **Optimistic UX**: Update the UI instantly for action plans and dispositions, then reconcile with the backend (showing toasts for success/errors).
- **Small, testable helpers**: Extract complex transforms into pure functions to keep Vitest suites focused and fast.
- **Guardrails over frameworks**: Prefer straightforward React state and simple Express routing instead of heavy abstractions.

## Local Environment Setup
1. **Install dependencies**: `npm install`
2. **Configure environment variables**:
   - Create `.env.local` for frontend credentials (e.g., `GEMINI_API_KEY` if you surface Gemini features).
   - Create `.env` (or export variables) for backend connectivity: `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`, and any Google Cloud credentials required for BigQuery access.
3. **Prepare data** (optional but recommended):
   - Seed Postgres: `npm run seed:postgres`
   - Seed Firestore (legacy datasets, only if needed): `npm run seed:firestore`

## Running the App
- **Frontend**: `npm run dev:frontend` (Vite dev server at http://localhost:5173 by default).
- **Backend**: `npm run start:server` (nodemon + ts-node on port 8080 unless overridden by `PORT`).
- Ensure the frontend `.env.local` proxies API calls to the Express server if running on a non-default port.

## Logging
- Backend logs are emitted through a shared Pino instance (`backend/logger.ts`) so Cloud Run receives structured JSON entries.
- Control backend verbosity with `LOG_LEVEL` (defaults to `debug` locally and `info` in production) and set `SERVICE_NAME` to label entries in Google Cloud Logging.
- During local development logs are prettified automatically via `pino-pretty`; Cloud environments continue to emit newline-delimited JSON.
- Frontend modules use `clientLogger` (`services/logger.ts`) to silence debug noise in production builds while still surfacing warnings and errors during the pilot.

## Testing
- Single run: `npm run test`
- Watch mode: `npm run test:watch`
- Tests rely on Vitest + React Testing Library + MSW. Keep them isolated (no live network/db calls) and focus on behavior, transforms, and API contract coverage.

## Data Sources
- **Postgres**: Primary system of record for opportunities, users, saved views, and action plans. Indexes are created for performant access (`action_items` and saved view constraints).
- **BigQuery**: Provides supplemental analytics attributes when fetching opportunities. Requires configured service account credentials (`GOOGLE_APPLICATION_CREDENTIALS` or inline JSON config).

## Troubleshooting & Support
- Verify environment variables when connection errors occur (Postgres or BigQuery credentials are the most common culprit).
- Review backend logs for SQL or BigQuery failures (`npm run start:server` surfaces warnings and schema bootstrap issues).
- For design or workflow questions, consult `AGENTS.md` or reach out to the product owner.
