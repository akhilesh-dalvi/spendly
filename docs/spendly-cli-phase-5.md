# Spendly CLI Phase 5: Expense Mutations

## Status

- Phase: Complete for the configured development environment
- Last updated: 2026-09-04
- Branch: `feature/spendly-cli`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

The Phase 5 backend is published to the configured development Convex
deployment. The authenticated CLI passed a reversible add, edit, clear,
move, conflict, delete, and idempotent-replay lifecycle without leaving a test
expense behind.

## Implemented

- Added expense add and server-backed dry run with strict ordinary-decimal
  amount parsing, local-calendar date resolution, exact selectors, optional
  tags, explicit unassignment, default-account fallback, and normalized source
  reporting.
- Added expense edit and dry run with omitted-field preservation and explicit
  clear flags for category, account, description, and tags. Non-interactive
  edits require an expected revision; human commands obtain it transparently.
- Added permanent deletion through a five-minute, single-use, user- and
  revision-bound confirmation token. Human mode prompts after the server
  preview; non-interactive mode requires the token, revision, and idempotency
  key explicitly.
- Added generated keys for human commits and caller-supplied key enforcement for
  non-interactive commits. Mutation transport failures are never automatically
  retried and report an uncertain outcome with the recovery key.
- Added exact indexed category-history inference using normalized `spentOn`
  values. A paginated migration initialized the new search field on existing
  expenses.
- Added account balance effects to add, edit, and delete previews and
  results. Account moves report the reversal and application separately, and
  account clears report the reversal.
- Preserved the Web expense response shape while maintaining the internal
  normalized search field.

## Command Surface

```text
spendly expenses add --amount <amount> [inputs] [--dry-run]
spendly expenses edit <expense-id> [changes] [--dry-run]
spendly expenses delete <expense-id> [--dry-run]
```

Run `spendly expenses <command> --help` for the full selector, clear,
revision, confirmation, and idempotency options.

## Verification

Passed on 2026-09-04:

```text
pnpm exec convex codegen
pnpm exec convex dev --once
pnpm exec convex run cli/v1/maintenance:initializeExpenseSearchFields '{}'
pnpm exec biome check packages/backend/convex apps/cli/src apps/cli/test
pnpm exec tsc --noEmit -p packages/backend/convex/tsconfig.json
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm -C apps/cli check-types
pnpm -C apps/cli check-types:development
pnpm -C packages/backend test:once
pnpm -C apps/cli test
pnpm pack:cli
git diff --check
```

Results:

- Three backend test files and 32 tests passed. The façade suite covers
  ownership, dry-run parity, source reporting, inference beyond 500 unrelated
  records, revisions, idempotent replay, confirmation expiry, and exact ledger
  deltas for add, same-account edit, account move, account clear, and delete.
- The complete CLI suite passed: 18 files and 88 tests, including 11 Phase 5
  command tests for selector resolution, clear flags, key and revision rules,
  deletion confirmation, uncertain transport recovery, and scientific-notation
  rejection.
- Backend, Web, and both CLI TypeScript configurations passed.
- Biome checked 98 backend and CLI source and fixture files with no issues.
- Package verification installed the generated `spendly-0.1.0.tgz` in a clean
  temporary consumer and passed version, help, JSON, and exit-code checks.

## Live Development Proof

Passed against the configured development Clerk and Convex projects:

- Published the reviewed backend bundle and initialized six existing expense
  search records; the migration completed without a continuation cursor.
- Confirmed the authenticated user's expense list was empty before the test.
- Previewed and created one unassigned INR expense with explicit date and
  idempotency key. The commit returned `accountSource: "none"`,
  `categorySource: "none"`, revision 1, and no account balance effects.
- Previewed and committed an amount/date move into the historical August cycle
  while exercising all four explicit clear flags. The result advanced to
  revision 2 and matched a subsequent read.
- Proved an edit using revision 1 failed with
  `EXPENSE_REVISION_CONFLICT` and made no write.
- Previewed permanent deletion, committed it with the confirmation token,
  revision, and stable key, then replayed the same request and received the
  original success.
- Confirmed the final expense list was empty. No temporary expense remains.

No additional manual verification is required for Phase 5.
