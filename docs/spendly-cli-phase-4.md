# Spendly CLI Phase 4: Read Commands

## Status

- Phase: Complete for the configured development environment
- Last updated: 2026-09-04
- Branch: `feature/spendly-cli`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

The Phase 4 functions are published to the configured development Convex
deployment. A fresh browser login matched the Clerk identity to the Spendly
backend user, and the deployed read commands passed the live checks below.

## Implemented

- Added authenticated `context` output with the effective local date, date
  source, detected timezone, current cycle, visible categories, tags, active
  accounts, account totals, onboarding state, and versioned capabilities.
- Added expense get and cursor-paginated list commands. List filters cover
  cycle, category or uncategorized state, account or unassigned state, repeated
  tag IDs, inclusive date bounds, page size, and opaque cursor.
- Added cycle list/current, category list, tag list, and cycle summary commands.
  Summary calculations receive the CLI-resolved local date explicitly, keeping
  Convex queries deterministic and making days-remaining calculations
  timezone-aware.
- Added account list/get, cursor-paginated account transactions, and read-only
  account-type commands. Account reads expose resolved type metadata, current
  balance, currency, archive/default state, timestamps, and revision.
- Added trimmed, case-insensitive exact-name selectors for interactive human
  use. Ambiguous names return candidates without choosing one; non-interactive
  calls reject names and require stable IDs.
- Added an authenticated Convex client that reads the stored session, validates
  every backend response with Zod, normalizes domain and transport errors, and
  retries only retryable read-only network failures with a bounded delay.
- Added explicit resource-limit failures to bounded supporting reads so large
  result sets never appear complete after silent truncation.
- Added human-readable terminal renderers and stable schema-versioned JSON.
  Successful JSON writes one document to stdout; expected JSON errors also stay
  on stdout, leaving stderr for debug diagnostics.
- Added checked-in JSON fixtures for context, expense pages, supporting
  resources, accounts, transactions, and account types.

## Command Surface

```text
spendly context [--date YYYY-MM-DD]
spendly expenses get <expense-id>
spendly expenses list [filters]
spendly cycles list
spendly cycles current [--date YYYY-MM-DD]
spendly categories list --cycle-id <id>
spendly tags list
spendly summary [--cycle-id <id> | --current] [--date YYYY-MM-DD]
spendly accounts list [--include-archived]
spendly accounts get <account-id-or-exact-name>
spendly accounts transactions <account-id-or-exact-name> [--limit <number>] [--cursor <opaque>]
spendly account-types list [--include-archived]
```

Expense, cycle, category, tag, and account read commands also accept the exact
human-name options documented in their command help. Scripts and agents use
`--json --non-interactive` with stable IDs.

## Verification

Passed on 2026-09-03:

```text
pnpm exec convex codegen
pnpm exec biome check packages/backend/convex apps/cli/src apps/cli/test
pnpm exec tsc --noEmit -p packages/backend/convex/tsconfig.json
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm -C apps/cli check-types
pnpm -C apps/cli check-types:development
pnpm -C packages/backend test:once -- convex/cli/v1/facade.test.ts
pnpm -C apps/cli test
pnpm pack:cli
git diff --check
```

Results:

- Three backend test files and 32 tests passed, including authentication,
  ownership, current-cycle exclusive boundaries, supporting resource reads,
  summary aggregation, and local-default context dates.
- The complete CLI regression suite passed: 17 files and 77 tests, including
  the loopback OAuth suite with local socket permission.
- Nineteen focused Phase 4 client, date, selector, and read-command tests passed.
- Backend, Web, and both CLI TypeScript configurations passed.
- Biome checked 90 backend and CLI source/fixture files with no issues.
- Package verification installed the generated `spendly-0.1.0.tgz` in a clean
  temporary consumer and passed version, help, JSON, and exit-code checks.

## Live Development Proof

Passed on 2026-09-04 against the configured development Clerk and Convex
projects:

- The current backend bundle published successfully and reported all Convex
  functions ready.
- Browser PKCE login completed, persisted the keychain session, matched the
  Clerk subject to the Spendly backend user, and resolved currency `INR`.
- `context --json --non-interactive` returned one versioned JSON document with
  the local date, `Asia/Calcutta` timezone, tags, capabilities, onboarding
  state, and no warnings.
- Cycle list/current, category list, tag list, summary, account list, account
  type list, and empty cursor-paginated expense list calls all succeeded.
- An explicit historical date resolved the expected exclusive-boundary cycle.
  The same date produced a deterministic one-day-remaining summary.
- A trimmed, case-insensitive human cycle name resolved correctly.
- Non-interactive name input and an invalid calendar date returned structured
  `NON_INTERACTIVE_INPUT_REQUIRED` and `INVALID_INPUT` errors with exit code 2.
- The development user currently has no expenses or accounts, so non-empty
  expense pages, expense get, account get, and account transactions remain
  covered by the backend and fixture-driven CLI suites rather than persistent
  live test records.

No additional manual verification is required for Phase 4.
