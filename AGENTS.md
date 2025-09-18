# Agents Guide: Architecture, Principles, and Testing Strategy

This document is a practical guide for contributors (human or agent) working on this app. It covers architecture, design principles, testing strategy, and a short roadmap.

## Overview
- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript (Postgres via `pg`, BigQuery via `@google-cloud/bigquery`)
- Database: Postgres (primary app state), BigQuery (read-only analytics sources)
- State highlights:
  - Optimistic updates for Disposition and Action Items
  - Org‑chart driven filtering flows appended to Advanced Filter Builder
  - Local Saved Views (with metadata), manageable via a modal

## Architecture & Data Flow
- `backend/server.ts`: Express routes serve app data (opportunities, account details) and write user data (disposition, action items).
- `types.ts`: Single source of truth for frontend data shapes (also reflected in server output via field aliases).
- `App.tsx`: Shell + routing between Opportunities list and My Tasks, orchestration for modals (Filter Builder, Org Chart, Manage Views).
- `components/OpportunityList.tsx`: Pipeline table + search + Saved Views controls and Forecast Summary.
- `components/OpportunityDetail.tsx`: Detail view with sections (Usage, Support, History, Services, Disposition/Action Plan). Includes:
  - SupportSummaryTiles + SupportTickets table
  - HistorySummaryTiles + Opportunity History table
  - DispositionForm (staged defaults for Action Plan)
  - ActionItemsManager (persisted CRUD)
- `components/SalesOrgChart.tsx`: Manager→Owner visualization, supports multi-select and search; builds OR subgroup filters.
- `components/AdvancedFilterBuilder.tsx`: Nested AND/OR rules; shows an “Org Chart” badge for org‑generated subgroups.

## Key Design Principles
- Behavior first: Tests and implementation focus on user‑visible outcomes and stable data transforms.
- Small, testable helpers: Put conditionals/logic into small functions (parsing, reducers) to make testing easy.
- Optimistic UX: Update UI immediately; reconcile with server on success/error (with toasts and safe rollback).
- Traceability: Mark org‑generated filters (id prefix `org-`) and show a badge in the builder; Saved Views store `origin`.
- Guardrails over heavy frameworks: Keep things simple (local state + context), add only what’s needed.

## Error Handling & UX Conventions
- Toaster notifications for saves, conflicts, and failures (`components/Toast.tsx`).
- Show a full‑page spinner only on initial data load; otherwise show a light “Updating …” badge.
- Unsaved‑changes banner for Saved Views when active view criteria differ from current filters (actions: Open Builder / Revert / Save As / Save Changes).

## Performance Notes
- Postgres index created at server startup for `action_items(opportunity_id, due_date)` to speed aggregation.
- Future candidate: Remove Action Items aggregation from `/opportunities` and fetch lazily in detail to reduce first‑paint latency.

## Security & Data Integrity
- Disposition updates use optimistic locking (versioned JSONB).
- Server validates required fields and returns 409 on version conflicts.
- Avoid leaking secrets; `.env` used for DB credentials.

## Testing Strategy (Vitest + React Testing Library + MSW)
Keep tests fast and focused on behavior. Prefer unit/integration tests in jsdom; don’t call real networks.

### What to Test by Default
- Core flows (smoke): initial load spinner vs list; navigation to detail; basic rendering.
- Critical data transforms:
  - Date parsing and windows (e.g., last 6 months in SupportSummaryTiles)
  - Summations/averages/percentages (Support + History tiles)
  - Filter evaluation (operators, AND/OR groups)
- API contracts (with MSW): happy paths + key errors (e.g., 409 optimistic lock).
- Regressions: add a test whenever a bug is fixed (e.g., BigQuery `{ value: 'YYYY-MM-DD' }` date parsing; strict ‘closed & won’ rule).

### What Not to Over‑Test
- Pure visual details; snapshot dumps; one‑off presentational components with trivial logic.

### Coverage Goals
- 40–60% overall; >80% on helpers and reducers.

### Patterns & Tools
- MSW for API mocks in tests; per‑test handlers returning fixtures and error cases.
- Factories for data fixtures (e.g., `ticket()`, `opp()` inside tests).
- `vi.useFakeTimers()` / `vi.setSystemTime()` for time‑based logic.
- Polyfills for jsdom (IntersectionObserver, smooth scroll) in `test/setup.ts`.

### How to Run
- `npm run test` (single run)
- `npm run test:watch` (watch mode)

## Saved Views (Design)
- Stored locally (localStorage) with metadata: `createdAt`, `updatedAt`, `origin`, `isDefault`.
- Name uniqueness enforced (case‑insensitive). On conflict:
  - Prompt to Replace or Save As… (suggest “(copy)”).
- Manage modal supports Apply / Rename / Set Default / Delete; default is auto‑applied at startup.
- Active view + unsaved changes: banner with Open Builder / Revert / Save As / Save Changes.
- Future (optional): Persist to Postgres per user with uniqueness `(user_id, lower(name))` and sharing flags.

## Org‑Chart Driven Filters
- Multi‑select managers and owners; search by manager email or owner name.
- “Build Filters” appends an OR subgroup (owners + managers equals) to current filters; opens Advanced Filter Builder pre‑populated.
- Subgroup id prefixed with `org-`, shown with “Org Chart” badge in the builder.

## Opportunity Detail Summaries (Current Defaults)
- Support Summary:
  - Open tickets: status not containing [closed, resolved, solved, done]
  - Last 6 months: count by created date; Avg/month = count/6
  - Escalated in last 6 months: `tickets_is_escalated === 'Yes'`
  - Priority breakdown (last 6 months): normalize to Urgent / High / Normal / Low
- Opportunity History:
  - Lifetime Value: sum of `opportunities_amount` across non‑expansion `Closed`/`Won` stages (case‑insensitive contains OR)
  - Total Years as Customer: segments of non‑expansion won opps; if gap > 365 days, new segment (churn). Report latest segment length (start→today), 1 decimal.

## Roadmap / TODOs
- Deep‑link scroll reliability for Disposition/Action Plan (routing anchor or layout‑ready signal).
- Optimize initial load latency by lazily fetching Action Items in detail.
- Saved Views persistence in Postgres (per user); MSW + UI integration tests.
- History metrics enhancements (pro‑rated contract terms; weighted LTV if available).
- De‑dupe org subgroups when appending repeatedly (optional polish).

## Developer Workflow
- Frontend dev: `npm run dev:frontend`
- Backend dev: `npm run start:server`
- Seed Postgres: `npm run seed:postgres`
- Tests: `npm run test` | `npm run test:watch`

## PR Checklist (Lightweight)
- [ ] Tests added/updated for any new transforms or critical flows
- [ ] No accidental console errors; toasts used for user‑visible errors
- [ ] Types updated in `types.ts` if shapes changed
- [ ] User flows verified (spinner vs list, navigation, save flows)
- [ ] Docs updated here if behavior/design principles changed

---

If any of the above needs clarification (e.g., stage name variants, ticket status definitions, or Saved Views persistence schema), ask the product owner before implementing.

