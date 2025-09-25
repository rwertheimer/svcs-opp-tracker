# Contributor Guide

This document explains how the Services Opportunity Tracker is organized, the principles it follows, and the workflow expected for any contribution. Keep updates concise, behavior-focused, and well-tested.

## System Snapshot
- **Frontend**: Vite + React 18 + TypeScript. Responsible for the pipeline grid, opportunity detail experience, saved view management, advanced filter builder, org chart explorer, and toast notifications.
- **Backend**: Express + TypeScript executed via `ts-node`. Routes are declared in `backend/server.ts` and supporting modules. Nodemon watches `.ts` files during local development.
- **Data**:
  - **Postgres** (primary store): opportunities, action_items, users, saved_views. The server bootstraps required indexes and constraints on startup.
  - **BigQuery** (read-only enrichments): used when building the opportunity list payload.
- **Shared contracts**: `types.ts` provides the canonical interfaces for both layers. When the backend response changes, update these types first.

## Guiding Principles
1. **Behavior-first development**: Frame work through end-user goals. Keep interfaces predictable and data transformations correct.
2. **Optimistic UX**: Apply immediate UI updates for action plans and dispositions; reconcile with API responses and surface toasts for success, conflicts (409), or unexpected errors.
3. **Traceability**: Saved views, filters, and org-chart generated clauses should carry explicit metadata (`origin`, `org-` prefixes) for easy auditability.
4. **Small, composable helpers**: Complex conditionals or reducers should live in isolated functions under `services/` or module-level helpers to enable targeted tests.
5. **Guardrails over abstraction**: Prefer local component state, context, and straightforward Express routing rather than introducing additional frameworks.

## Workflows
### Daily Development
1. **Install dependencies**: `npm install`
2. **Start backend**: `npm run start:server`
3. **Start frontend**: `npm run dev:frontend`
4. **Seed data (optional but recommended)**:
   - Postgres: `npm run seed:postgres`
   - Firestore fixtures (legacy analytics): `npm run seed:firestore`
5. **Environment**:
   - Backend expects `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`, and Google Cloud credentials for BigQuery.
   - Frontend reads `.env.local` (e.g., `GEMINI_API_KEY` when Gemini integrations are enabled) and proxies API traffic to the Express server.

### Testing & Quality
- **Primary command**: `npm run test` (Vitest + React Testing Library + MSW, single run).
- **Watch mode**: `npm run test:watch`.
- **Testing scope**:
  - Core flows: loading spinner vs list, navigating between pipeline and detail, saved view CRUD, disposition/action plan optimistic updates.
  - Data transforms: support/history summaries, filter evaluation, date math, aggregation logic.
  - API contracts: 200/409/500 paths for action plans, saved views, and opportunity fetching.
  - Regressions: add targeted tests when bugs are fixed or BigQuery/Postgres mappings change.
- **What to avoid**: brittle visual snapshots, tests that hit live services, or redundant coverage on presentational components.

### Code Hygiene Checklist
- Update `types.ts` whenever API shapes shift.
- Keep toast messaging accurate and user-friendly; no stray `console.error` noise in production code.
- Align Saved View and filter metadata between client and server.
- Document notable behavior or architectural shifts in both `README.md` and this guide.

## Deployment Notes
- Backend default port is `8080`; override with the `PORT` env variable if deploying alongside other services.
- Postgres schema migrations live in `backend/migrations/`. Use `npx ts-node <path>` to execute them (e.g., removal of legacy action item notes).
- Saved views persistence relies on the `saved_views` table and related indexes (`ux_saved_views_user_lower_name`, `ux_saved_views_one_default_per_user`). Ensure migrations run before deploying.

## Documentation Updates
Follow these guardrails whenever work requires guidance updates:

- **README.md** should be updated when project-wide onboarding or runtime expectations change. Examples include new setup steps, additional services that must be running, shifts in tech stack/tooling, or changes to how the app is launched, tested, or deployed.
- **AGENTS.md** should capture workflow or decision-making guardrails for future contributors. Update it when processes, coding standards, architectural principles, or testing requirements change, or when you add new subsystems that require explicit guidance.
- **Both README.md and AGENTS.md** must be revised together when a change impacts both onboarding instructions and contributor workflows (e.g., introducing a new mandatory service plus new coding conventions around its usage).
- If your change does not alter contributor expectations or project setup, avoid touching these documents; prefer inline comments or feature-specific docs instead.

## Support
Questions about product behavior, data definitions (e.g., stage mappings, ticket status classification), or roadmap priorities should go to the product owner before implementation.
