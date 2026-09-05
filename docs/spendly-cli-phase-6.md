# Spendly CLI Phase 6: Account Mutations

## Status

- Phase: Complete for the configured development environment
- Last updated: 2026-09-05
- Branch: `feature/spendly-cli`
- Phase 5 checkpoint: `84c9da4`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

The Phase 6 backend is published to the configured development Convex
deployment. The authenticated CLI passed account creation, update, archive,
reactivation, default selection, balance adjustment, transfer, and an
account-backed expense lifecycle.

## Implemented

- Added account create and server-backed dry run with required exact account
  type selection, signed opening balance, local ledger date, normalized name,
  inherited currency, first-account default behavior, and opening-ledger ID.
- Added account update and dry run for name and active account-type changes.
  Opening/current balances, currency, and ledger history cannot be edited
  through update.
- Added archive, reactivate, and set-default previews and commits. Archiving a
  default account clears the preference; reactivation does not restore it.
- Added absolute balance adjustment with signed decimal input, exact delta,
  negative-balance warning, ledger reference, and a successful zero-delta
  result with no ledger entry.
- Added atomic same-currency transfer with independent source/destination
  revisions, negative-source warning, final balances, transfer ID, and both
  ledger-entry IDs.
- Added transparent human revision lookup and exact trimmed,
  case-insensitive selectors. Non-interactive commands require stable IDs,
  expected revisions, and caller-supplied idempotency keys.
- Reused the mutation transport policy from Phase 5: commits and mutation-backed
  previews are never automatically retried, and uncertain results report the
  recovery key.
- Changed account dry runs from queries to no-write mutations so preview
  timestamps and default local dates do not introduce nondeterministic Convex
  queries.
- Preserved the existing Spendly Web API response shapes while enriching the
  versioned CLI façade with ledger references.

## Command Surface

```text
spendly accounts create --name <name> --account-type-id <id> --starting-balance <balance> [--date YYYY-MM-DD] [--dry-run]
spendly accounts update <account-id-or-name> [--name <name>] [--account-type-id <id>] [--dry-run]
spendly accounts archive <account-id-or-name> [--dry-run]
spendly accounts reactivate <account-id-or-name> [--dry-run]
spendly accounts set-default <account-id-or-name> [--dry-run]
spendly accounts adjust-balance <account-id-or-name> --balance <balance> [--date YYYY-MM-DD] [--note <text>] [--dry-run]
spendly accounts transfer --from-account-id <id> --to-account-id <id> --amount <amount> [--date YYYY-MM-DD] [--note <text>] [--dry-run]
```

Humans may replace account and account-type IDs with the exact name options
shown by each command's help. Agents use `--json --non-interactive` with stable
IDs, revisions, and idempotency keys.

## Verification

Passed on 2026-09-05:

```text
pnpm exec convex codegen
pnpm exec convex dev --once
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

- Three backend test files and 35 tests passed. Coverage includes ownership,
  active-type enforcement, archive/reactivate/default transitions, default
  clearing, negative and zero-delta adjustments, same-account and cross-account
  expense effects, cross-currency transfer rejection, two-account revision
  conflicts, idempotent replay, and every emitted ledger reference.
- The complete CLI suite passed: 19 files and 100 tests. Twelve Phase 6 command
  tests cover signed balances, exact and ambiguous selectors, transparent and
  required revisions, lifecycle routing, negative warnings, ledger IDs,
  transfer inputs, and uncertain-result handling without retries.
- Backend, Web, and both CLI TypeScript configurations passed.
- Biome checked 105 backend and CLI source and fixture files with no issues.
- Package verification installed the generated `spendly-0.1.0.tgz` in a clean
  temporary consumer and passed version, help, JSON, and exit-code checks.

## Live Development Proof

Passed against the configured development Clerk and Convex projects:

- Started with no accounts, no expenses, no default account, and account
  onboarding marked `skipped`.
- Previewed and created two INR accounts with distinct active account types and
  opening balances. Commits returned the opening-ledger IDs, and replaying the
  first creation key returned the original account and ledger entry.
- Previewed and committed account rename, archive, reactivate, and set-default
  transitions with revisions 1 through 5.
- Previewed and committed an absolute balance adjustment from INR 1,000 to INR
  900. The result returned delta -100 and its ledger ID.
- Previewed and committed an INR 200 transfer. Source/destination balances
  became INR 700 and INR 300, revisions advanced independently, and the result
  returned the transfer plus both ledger IDs.
- Created an expense through default-account resolution, then moved it to the
  destination account with a changed amount. The preview and commit reported
  both account effects, and confirmed deletion restored the destination balance.
- Verified the final account revisions and complete ledgers: source revision 9
  at INR 700 and destination revision 4 at INR 300 before final archival.
- Archived both verification accounts, clearing the default. Active account and
  expense lists are empty.
- Removed the temporary cleanup-only function from source and redeployed the
  backend without it.

The recoverable archived verification accounts remain in development because
permanent remote deletion was not authorized:

- `Phase 6 E2E Primary` (`kh7cqepx0fc57w8ayngvt440vd8dr7w8`), revision 10.
- `Phase 6 E2E Destination` (`kh7ce605pt0a2zw2t81zfr20w18ds7q0`), revision 5.

Creating the first account changed `accountsOnboardingStatus` from `skipped` to
`completed`; active/default state is otherwise restored. Removing these exact
records and restoring the flag requires explicit destructive-cleanup approval.
No manual functional verification is required.
