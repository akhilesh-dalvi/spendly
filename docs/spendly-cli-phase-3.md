# Spendly CLI Phase 3: Versioned Backend Facade

## Status

- Phase: Complete for the configured development environment
- Last updated: 2026-09-02
- Branch: `feature/spendly-cli`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

The Phase 3 functions and schema are published to the configured development
Convex deployment. Production deployment remains separate from this phase and
still depends on the approved production authentication configuration recorded
in Phase 1.

## Implemented

- Added a versioned `cli/v1` Convex facade for aggregated context, expenses,
  accounts, account transactions, and read-only account types. Public responses
  use explicit validators, stable public IDs, ISO timestamps, resolved metadata,
  and nullable fields instead of returning raw database documents.
- Added a stable CLI error taxonomy. Authentication, setup, ownership,
  validation, revision, idempotency, deletion, archived-account, and transfer
  failures are normalized without exposing internal messages or cross-user
  resource existence.
- Extracted shared expense, account, balance, transfer, and ledger operations.
  Existing Web mutations and new CLI mutations now use the same normalization,
  ownership, cycle, account-type, archived-state, and balance rules.
- Added expense and account revisions. All direct and indirect Web expense
  writes, including tag and category removal, advance the expense revision.
  Account changes and ledger-backed balance changes advance account revisions.
- Added paginated internal migrations for legacy revisions. The development
  migration initialized six expenses; all existing accounts already had a
  revision or there were no legacy account rows requiring an update.
- Added server-side create and update previews for expenses and accounts, plus
  archive, reactivate, set-default, balance-adjustment, and transfer previews.
  Preview and commit paths share their preparation logic.
- Added 30-day idempotency records keyed by user and caller key. Requests use a
  canonical SHA-256 fingerprint; identical replays return the stored result,
  while operation or input changes return an idempotency conflict.
- Added five-minute expense-deletion capabilities bound to the user, current
  deployment, expense ID, and revision. Capabilities are single-use, expire on
  the server, and successful deletion remains replayable through idempotency.
- Added an hourly internal cleanup job for expired idempotency and deletion
  records, with bounded batches.
- Added deterministic cursor pagination for expenses and account transactions,
  backed by date and creation-time indexes. Expense filters validate ownership,
  dates, ranges, incompatible options, limits, and tag counts.
- Added category-history inference for expense creation only: the three most
  recent matching descriptions in the prior year must resolve to one category
  name, and the target cycle must contain exactly one visible category with that
  name. Tags are never inferred or created.

## Security and Best-Practices Review

- Every public `cli/v1` function resolves the authenticated Spendly user before
  accessing user data.
- Resource IDs and filter IDs are checked for ownership. Cross-user and missing
  IDs share the same public `RESOURCE_NOT_FOUND` response.
- Public functions define argument and return validators; error responses do
  not pass through arbitrary server messages.
- CLI list paths are cursor-paginated or explicitly bounded. History inference,
  context resources, account lists, migrations, and cleanup jobs all have fixed
  limits.
- Financial mutations execute atomically inside Convex mutations. The CLI never
  writes cached balances or ledger entries directly.
- Idempotency records store a request fingerprint rather than the raw request,
  expire after 30 days, and are not exposed by public queries.
- Deletion capabilities and maintenance functions are internal records and
  functions. A stale, expired, foreign, or already-used capability cannot
  delete an expense.
- Archived accounts remain readable but reject new expenses, adjustments, and
  transfers. Existing expenses can still be corrected or deleted while keeping
  their historical account balance synchronized.

## Verification

Passed on 2026-09-02:

```text
pnpm exec convex codegen
pnpm exec convex dev --once
pnpm exec biome check packages/backend/convex
pnpm exec tsc --noEmit -p packages/backend/convex/tsconfig.json
pnpm -C packages/backend test:once
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm -C apps/cli check-types
pnpm -C apps/cli test
git diff --check
```

Results:

- Three backend test files and 30 tests passed.
- Tests cover authentication, cross-user reads, dry-run parity, ownership,
  idempotent replay and conflict, 30-day expiry, five-minute deletion expiry,
  single-use deletion, stale previews, concurrent revision conflicts, transfer
  atomicity, migrations, category inference, indirect Web edits, context, and
  cursor pagination.
- The complete CLI regression suite passed: 13 files and 58 tests, including
  the loopback OAuth suite with local socket permission.
- Backend, Web, and CLI TypeScript checks passed, and all Convex source passed
  Biome.
- Convex code generation and a one-shot development push passed. Both revision
  migration cursors reached `isDone: true`, and the cleanup function ran
  successfully.

No manual verification remains for Phase 3 in the configured development
environment.
