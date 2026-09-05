# Spendly CLI Requirements and Implementation Plan

## Document Status

- Status: Phases 0-6 complete; Phase 7 implementation verified with external
  cross-agent evaluation pending; Phase 8 in progress
- Last updated: 2026-09-05
- Target branch: `feature/spendly-cli`
- Package location: `apps/cli`
- npm package and executable: `spendly`
- Initial release: `spendly@0.1.0` on the npm `next` tag
- Stable release target: `spendly@1.0.0` on the npm `latest` tag

## 1. Executive Summary

Spendly CLI is a deterministic command-line interface for reading and managing
a user's Spendly expenses. Its primary consumer is a first-party AI agent
running on the user's trusted computer and following the Spendly skill. The
same commands must remain clear and useful to a human in a terminal.

The intended path is:

```text
User -> AI agent -> Spendly skill -> Spendly CLI -> CLI v1 Convex facade
```

The skill interprets user intent and applies behavioral safety rules. The CLI
validates structured input, authenticates the user, previews and commits
operations, and emits a stable machine contract. The backend remains the final
authority for ownership, normalization, idempotency, concurrency, and deletion
confirmation.

Version 1 provides full CRUD for individual expenses, account-aware expense
tracking, and the account operations already supported by Spendly Web: create,
edit, archive, reactivate, set default, adjust balance, and transfer. It also
provides read-only account activity and account-type context. It does not
provide bulk mutations or mutation commands for cycles, categories, category
types, account types, or tags.

## 2. Goals

- Let a user ask a local AI agent to record, inspect, correct, or remove an
  expense.
- Let the user inspect where money is held or owed, keep balances reconciled,
  move money between compatible accounts, and preserve a complete ledger.
- Support humans through the same command surface with readable default output.
- Keep Convex as the source of truth and preserve existing Spendly Web behavior.
- Make machine output, errors, exit codes, and pagination deterministic.
- Prevent duplicate mutations when agents explicitly retry a request.
- Prevent stale updates and deletions from overwriting newer changes.
- Make every mutation previewable through the same input contract used to
  commit it.
- Require a server-backed, short-lived confirmation capability for deletion.
- Keep expense and account balances synchronized when an expense is created,
  edited, moved, unassigned, or deleted.
- Establish a backend contract that can later be reused by an MCP server.
- Publish searchable, task-oriented CLI documentation alongside Spendly Web.

## 3. Non-Goals for Version 1

- Replacing Spendly Web or reproducing its visual planning experience.
- Natural-language parsing inside the CLI.
- Bulk expense mutations.
- Creating, updating, or deleting cycles, categories, category types, or tags.
- Creating, updating, archiving, or deleting account types.
- Automatically creating missing domain data.
- Per-expense currency, currency conversion, or changing currency from the CLI.
- Permanently deleting accounts, directly editing ledger entries, or editing or
  deleting a completed transfer.
- Hosted agents, CI authentication, device authorization, third-party delegated
  agents, or machine-to-machine access.
- Windows support.
- An MCP server.
- A persistent mutation audit table. Sentry and PostHog may be designed later
  as observability systems, but version 1 does not claim a durable audit trail.
- Treating public documentation as a substitute for live CLI help, versioned
  JSON schemas, or backend validation.

## 4. Supported Users and Platforms

### 4.1 Local AI Agent

The Phase 0 verified user runs Codex or Claude Code on a trusted macOS
computer. Linux remains a version 1 target pending native credential-store and
packaged-install validation. The agent follows the Spendly skill and always
invokes the CLI with `--json` and `--non-interactive`.

### 4.2 Human CLI User

The user invokes the same commands directly. Human-readable output is the
default; JSON is opt-in.

### 4.3 Runtime

- Node.js 20 or newer.
- macOS is the currently verified platform.
- Linux remains a version 1 target, but support must not be claimed until its
  native credential-store and packaged-install gates pass.
- Windows is deferred until Credential Manager, browser callback, filesystem,
  packaging, and agent tests exist.

## 5. Product Principles

1. **Backend authority:** ownership, validation, cycle assignment, account
   balance changes, idempotency, revisions, and deletion confirmation are
   server-enforced.
2. **One mutation contract:** `--dry-run` and commit use identical inputs and
   backend normalization.
3. **Safe ambiguity handling:** no fuzzy selector resolution or silent choice
   among multiple matches.
4. **Explicit destructive intent:** deletion is an enforced two-step flow.
5. **Stable agent contract:** JSON and process exit codes are versioned.
6. **Human clarity:** readable output is concise and reports normalized values.
7. **No hidden creation:** missing accounts, account types, categories, tags,
   and cycles are never created implicitly.
8. **Production isolation:** the published package exposes production only;
   development configuration is source-checkout-only.
9. **Privacy:** credentials and financial payloads never enter logs,
   diagnostics, skill files, or future telemetry.
10. **Documentation authority:** public examples are checked against the built
    CLI; installed `--help`, versioned JSON schemas, and backend validation
    remain authoritative.

## 6. Current Spendly Baseline

The worktree was created from local `master` at commit `6c2bedc` and synchronized
with `origin/master` at commit `d897bcb` on 2026-08-30.

The backend currently contains users, expense cycles, category types,
cycle-scoped categories, tags, account types, accounts, account transfers,
account transactions, expenses, and aggregation functions. Important baseline
behavior includes:

- Authentication uses Clerk identities in Convex.
- New users default to `USD` and may change their user-level currency in Web.
- Expenses store JavaScript numbers and do not store a currency.
- Changing the user currency changes display formatting; it does not convert
  historical amounts.
- Expenses may optionally reference an account. Account-backed expense create,
  update, move, clear, and delete operations update the account's cached balance
  and append ledger entries.
- New users receive six editable account types: Cash, Checking, Savings, Credit
  Card, Wallet, and Other. Types are user-owned, and accounts resolve their
  current type metadata on reads.
- Accounts support zero or negative balances, archive/reactivate, a default
  preference, manual balance reconciliation, same-currency transfers, and
  paginated transaction history.
- Account setup is optional during Web onboarding. Free mode follows currency,
  cycle, account, dashboard; plan mode inserts categories before account. A
  skip is persisted, while later account creation marks account onboarding
  completed and the dashboard and expense form retain discovery paths.
- Archived accounts remain available for history but cannot receive new
  expenses or transfers. There is no merged permanent account-delete mutation.
- Expenses may exist outside a cycle.
- Cycle ranges are canonically start-inclusive and end-exclusive.
- Categories are cycle-scoped and names need not be unique.
- Tags are user-scoped and names need not be unique.
- Existing expense mutations have no public idempotency or revision contract.
- Existing expense list code uses offset pagination and collects too much data
  for a public agent contract.
- Several Web cycle-status comparisons incorrectly treat `endDate` as
  inclusive; those are existing Web bugs and should be fixed separately.
- A Spendly backend user is created when the user first opens Spendly Web after
  Clerk sign-in.

## 7. Package, Toolchain, and Release

### 7.1 Package Identity

- Publish the unscoped npm package `spendly`.
- Expose the executable `spendly`.
- Do not use `@spendly/cli`; the project does not control the `@spendly` npm
  scope.
- No npm organization is required.

### 7.2 Implementation Toolchain

- Location: `apps/cli` in the pnpm workspace.
- Language: TypeScript.
- Command parser: Commander 14.
- Build: `tsc` producing Node.js ESM.
- Test runner: Vitest using its Node environment.
- Formatting and linting: repository Ultracite/Biome standards.

### 7.3 Release Strategy

1. Publish `spendly@0.1.0` using npm tag `next` after all local development
   gates pass.
2. Test the installed package outside the monorepo on macOS and Linux.
3. Resolve beta findings.
4. Publish `spendly@1.0.0` using npm tag `latest` only after authentication and
   mutation-safety acceptance criteria pass.

There is no production beta allowlist because Spendly currently has very few
users. Backend authorization and ownership checks still apply to every user.

## 8. Authentication and Environment Requirements

### 8.1 Commands

```text
spendly auth login
spendly auth status
spendly auth logout
```

### 8.2 Login

- Use OAuth Authorization Code with PKCE S256 through a public Clerk OAuth
  application.
- Bind a one-request callback server to `127.0.0.1` on a random OS-assigned
  port.
- Open the system browser. If automatic opening fails, print a URL that the
  user can open on the same computer.
- Validate OAuth `state`, the PKCE verifier, redirect URI, issuer, audience,
  subject, and token expiry.
- Time out the callback after five minutes.
- Keep the Clerk consent screen enabled.
- Do not support device flow, pasted tokens, client secrets, deploy keys,
  headless login, or CI login in version 1.

### 8.3 Session Lifetime

- CLI authorization lasts at most 30 days from login.
- Refresh access automatically within that window.
- Require browser reauthentication after 30 days, even if the provider refresh
  token could remain valid longer.
- Namespace stored credentials by issuer and OAuth client ID.

### 8.4 Credential Storage

- Use the operating-system keychain as the primary store.
- Do not silently fall back to a plaintext file.
- File storage requires explicit opt-in, for example
  `--allow-file-storage`.
- The CLI must display the fallback path and a security warning.
- The file must use owner-only permissions; fail if those permissions cannot be
  enforced.
- The same 30-day authorization limit applies to either store.
- Tokens, authorization codes, PKCE material, and authorization headers must
  never enter normal output, debug output, errors, stack traces, or telemetry.

### 8.5 Logout

- Revoke the CLI refresh token when possible.
- Remove local credentials even if remote revocation fails, and report that
  revocation could not be confirmed.
- Affect only this CLI installation, not Web sessions or other computers.
- Global logout across all sessions is deferred.

### 8.6 Account Setup

The user must have opened Spendly Web at least once. If Clerk authentication
succeeds but no Spendly backend user exists, return `ACCOUNT_SETUP_REQUIRED`
and the production Web URL. The CLI does not bootstrap users or onboarding
data in version 1.

### 8.7 Production and Development Isolation

- The published package contains only production issuer, OAuth client, and
  Convex deployment configuration.
- Normal users do not see profiles or environment selectors.
- A source checkout may use a development-only workspace command and ignored
  local configuration for the Clerk development instance and Convex
  development deployment.
- Development and production credentials must be separately namespaced.
- A real end-to-end development login and expense lifecycle must pass before
  merge or npm publication.

### 8.8 Authentication Proof Gate

Before implementing the remaining authenticated commands:

1. Create a development Clerk public OAuth application with PKCE required.
2. Register `http://127.0.0.1/callback`; use Clerk's dynamic loopback-port
   behavior at runtime.
3. Add a matching development Convex auth provider whose `applicationID`
   equals the OAuth client ID.
4. Complete browser login and token refresh.
5. Authenticate `ConvexHttpClient` with the returned OIDC token.
6. Verify `ctx.auth.getUserIdentity().subject` resolves the same Spendly user as
   Web.
7. Verify logout revocation and local credential removal.

Direct Convex access is approved, but remains contingent on this proof. Do not
weaken issuer or audience validation if the proof fails.

#### Phase 0 Proof Result (Revalidated 2026-08-30)

The proof passed against development Clerk and Convex. Clerk's OIDC ID token
carried the exact CLI client ID in a one-item `aud` array. Convex's OIDC provider
path rejected that representation, so the CLI entry uses Convex's official
`customJwt` provider with the exact `applicationID`, exact issuer, issuer JWKS,
and `RS256`. The existing Web provider remains unchanged.

Live login and `ConvexHttpClient` authentication resolved the same backend user
as Web. A forced refresh repeated the identity proof. Logout confirmed remote
revocation and local keychain removal, and a subsequent status check failed with
the documented authentication-required exit code. This completes the current
macOS-scoped Phase 0. Linux Secret Service validation is deliberately deferred
to the pre-release platform gates in this plan and has not been claimed as
passing.

The original Phase 0 proof used a temporary copy of the accounts backend because
the feature worktree initially predated those schema changes. After the
2026-08-30 master synchronization, this branch contains the current accounts
schema and no longer needs that staging workaround.

The post-merge proof initially exposed development deployment drift: a later
deployment had replaced the CLI auth provider. Deploying the merged branch with
`convex dev --once` restored it, after which two complete login, status, and
forced-refresh sequences resolved the same Clerk subject and Spendly backend
user. The final logout confirmed remote grant revocation and local keychain
removal.

## 9. CLI and Backend Architecture

### 9.1 Request Path

```text
CLI command
  -> local argument validation
  -> authenticated session provider
  -> ConvexHttpClient
  -> dedicated cli/v1 Convex query or mutation
  -> stable response mapper
  -> terminal or JSON renderer
```

The CLI must not call the existing Web mutations as its public contract.

### 9.2 Versioned CLI Facade

Create a dedicated Convex facade under a versioned namespace such as
`cli/v1`. It owns:

- Stable validators and response shapes.
- Context and paginated read queries.
- Server-backed dry runs.
- Idempotency records.
- Expense revisions and conflict checks.
- Account revisions and conflict checks for lifecycle and balance mutations.
- Deletion confirmation capabilities.
- Stable domain error codes.

Web functions and the CLI facade should call shared internal business-logic
helpers so their expense rules do not drift.

### 9.3 Proposed CLI Layout

```text
apps/cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── auth.ts
│   │   ├── context.ts
│   │   ├── expenses.ts
│   │   ├── accounts.ts
│   │   ├── account-types.ts
│   │   ├── cycles.ts
│   │   ├── categories.ts
│   │   ├── tags.ts
│   │   └── summary.ts
│   ├── auth/
│   │   ├── oauth.ts
│   │   ├── session.ts
│   │   └── token-store.ts
│   ├── client/
│   │   ├── convex-client.ts
│   │   └── errors.ts
│   ├── output/
│   │   ├── json.ts
│   │   └── terminal.ts
│   └── domain/
│       ├── schemas.ts
│       └── selectors.ts
└── tests/

skills/
└── spendly/
    └── SKILL.md
```

Import files directly; do not add barrel files solely for re-exports.

## 10. Global Command Behavior

- Human-readable output is the default for every command.
- JSON is enabled only with explicit `--json`.
- Agents and scripts must pass both `--json` and `--non-interactive`.
- Do not automatically switch output contracts based on TTY detection.
- `--non-interactive` prohibits prompts and fails when required input is
  unresolved.
- Support `--no-color` and respect `NO_COLOR`.
- Unknown options and malformed values fail before a network request.
- `--help` and `--version` work without authentication.
- The published CLI has no user-facing `--profile` or environment selection.

## 11. JSON and Process Contracts

### 11.1 Successful JSON

```json
{
  "schemaVersion": 1,
  "data": {},
  "meta": {}
}
```

### 11.2 Failed JSON

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "EXPENSE_NOT_FOUND",
    "message": "Expense not found",
    "retryable": false,
    "details": {}
  }
}
```

Requirements:

- Stdout contains exactly one JSON document in JSON mode.
- No prompts, progress, colors, banners, or warnings appear outside the JSON
  document.
- Diagnostic details may go to stderr only with explicit `--debug` and must be
  redacted.
- Raw Convex documents and provider errors are never the public contract.
- Dates use `YYYY-MM-DD`; timestamps use ISO 8601 UTC.
- Public IDs are stable and accepted by subsequent commands.
- Breaking JSON changes require compatibility review and a schema or CLI major
  version change.

### 11.3 Exit Codes

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| `0`  | Success                                             |
| `1`  | Unexpected internal failure                         |
| `2`  | Invalid command, input, or unresolved selector      |
| `3`  | Authentication required, expired, or denied         |
| `4`  | Resource not found                                  |
| `5`  | Revision, idempotency, or domain conflict           |
| `6`  | Deletion confirmation required, invalid, or expired |
| `7`  | Temporary network, service, or rate-limit failure   |

JSON error codes provide finer-grained recovery information than process exit
codes.

## 12. Read Commands

### 12.1 Context

```text
spendly context [--date YYYY-MM-DD]
```

Return:

- Authenticated Spendly user ID and current user-level currency.
- Effective date, date source, and detected timezone.
- Current cycle or `null`.
- Visible categories for the cycle, including IDs and names.
- Available tags, including IDs and names.
- Active accounts with resolved type metadata, current balance, currency, and
  default-account status.
- Account onboarding status and currency-grouped active-account totals.
- CLI capabilities and schema version.
- Relevant warnings.

Do not return unnecessary Clerk profile data or secrets.

### 12.2 Expense Reads

```text
spendly expenses get <expense-id>
spendly expenses list [filters]
```

List contract:

- Default page size: 50.
- Maximum page size: 100.
- Pagination: opaque `--cursor`.
- Stable order: expense date descending, creation time descending, then ID.
- JSON metadata: `nextCursor` and `hasMore`.
- Never fetch every page silently.
- Each expense includes its account ID, name, and resolved account-type metadata
  when assigned, or explicit `null` account fields when unassigned.

Filters:

```text
--cycle-id <id>
--category-id <id>
--uncategorized
--account-id <id>
--unassigned
--tag-id <id>        repeatable; all specified tags must match
--from YYYY-MM-DD    inclusive
--to YYYY-MM-DD      inclusive
--limit <number>
--cursor <opaque>
```

All filters combine with AND. `--category-id` and `--uncategorized` are
mutually exclusive; `--account-id` and `--unassigned` are mutually exclusive.
Description search is deferred until it supports indexed, cursor-stable
pagination.

### 12.3 Supporting Read Commands

```text
spendly cycles list
spendly cycles current [--date YYYY-MM-DD]
spendly categories list --cycle-id <id>
spendly tags list
spendly summary [--cycle-id <id> | --current] [--date YYYY-MM-DD]
```

Mutations for these resources are deferred.

### 12.4 Account Reads

```text
spendly accounts list [--include-archived]
spendly accounts get <account-id>
spendly accounts transactions <account-id> [--limit <number>] [--cursor <opaque>]
spendly account-types list [--include-archived]
```

- Account list defaults to active accounts and sorts by name. When archived
  accounts are included, active accounts come first.
- Account responses include name, type ID and resolved type metadata, opening
  and current balances, resolved currency, archived state, default state,
  timestamps, and CLI revision.
- Transaction history is newest first, defaults to 50, has a maximum page size
  of 100, and uses opaque cursor pagination.
- Transaction entries expose type, signed amount, balance after, date, note,
  and related expense or transfer ID when present.
- Account-type reads expose the user-owned name, asset/liability balance nature,
  optional icon and color, order, and archived state. The CLI never seeds,
  creates, edits, archives, or deletes account types.

## 13. Expense Mutation Contract

### 13.1 Commands

```text
spendly expenses create [inputs] [--dry-run]
spendly expenses update <expense-id> [inputs] [--dry-run]
spendly expenses delete <expense-id> [--dry-run]
```

There are no separate `preview-create`, `preview-update`, or `preview-delete`
commands.

### 13.2 Dry Run

- Use exactly the same inputs as the corresponding commit command.
- Run server-side ownership, normalization, selector, cycle, revision, and
  validation logic.
- Perform no expense write.
- Create and update dry runs return the normalized proposed resource; update
  also returns before and after values.
- Delete dry run returns the exact expense, its revision, and a deletion
  confirmation token.
- A clear user instruction authorizes one create or update; the skill previews
  internally, commits, and reports the result.
- Stop for ambiguity, unexpected normalization, bulk intent, or deletion.

### 13.3 Idempotency

- Human interactive commits automatically generate an idempotency key.
- `--non-interactive` commits require a caller-supplied stable
  `--idempotency-key`.
- Never derive an idempotency key from expense content.
- Store records for 30 days from the first request.
- The same key and identical normalized request return the original result.
- The same key with different input returns an idempotency conflict.
- Successful deletion replays return the original success during retention.
- After 30 days, replay protection is no longer guaranteed.

The idempotency table is a correctness mechanism, not an audit log.

### 13.4 Optimistic Concurrency

- Every new expense starts with a revision, and every Web or CLI update
  increments it.
- Reads and dry runs return the revision.
- Update and delete commit only if the expected revision still matches.
- A mismatch returns a conflict and performs no write.
- Humans may have revision handling performed transparently by the CLI.
- Non-interactive agents must receive and submit the revision explicitly, for
  example through `--if-revision`.

### 13.5 Create

- Required: `--amount`.
- Optional: `--date`, `--spent-on`, `--category-id`, `--category`,
  `--account-id`, `--account`, `--no-account`, `--tag-id`, and `--tag`.
- Omitted date resolves to the computer's current local calendar date.
- Omitted category uses the inference policy in section 15 or saves the
  expense uncategorized.
- Omitted tags create an expense with no tags.
- `--account-id`, `--account`, and `--no-account` are mutually exclusive. An
  omitted account uses the active user default when one exists; otherwise the
  expense remains unassigned. Return `accountSource` as `explicit`,
  `user_default`, or `none`.
- Return normalized values, currency, category source, tag IDs, cycle, revision,
  account assignment and source, account balance effect, and expense ID.

### 13.6 Update

- Require an expense ID.
- Omitted fields remain unchanged.
- Explicit clearing uses:

```text
--clear-category
--clear-account
--clear-spent-on
--clear-tags
```

- A setter and its corresponding clearer are mutually exclusive.
- Reject empty strings as an implicit clear operation.
- Amount and date cannot be cleared.
- Assigning a different account reverses the old account effect before applying
  the new one. Clearing the account reverses the old effect and leaves the
  expense unassigned.
- If a new date makes the existing category invalid, fail with
  `CATEGORY_CYCLE_MISMATCH`; show the old and new cycles and any exact
  same-name candidates. Require `--category-id` or `--clear-category`.

### 13.7 Delete

Deletion is permanent and has no trash or restore command in version 1.

Non-interactive flow:

1. Run `spendly expenses delete <id> --dry-run --json --non-interactive`.
2. Receive the exact expense, revision, and confirmation token.
3. Commit with the token, expected revision, and idempotency key:

```bash
spendly expenses delete <id> \
  --confirmation-token <token> \
  --if-revision <revision> \
  --idempotency-key <key> \
  --json \
  --non-interactive
```

The confirmation token must be:

- Valid for five minutes.
- Single-use.
- Bound to the authenticated user, configured deployment, expense ID, and
  revision. The configured deployment is production in the published package.
- Invalid if the expense changes.

Human mode performs the same server-backed preview and displays an interactive
confirmation. The backend hard-deletes only after successful confirmation.

## 14. Account Mutation Contract

### 14.1 Commands

```text
spendly accounts create [inputs] [--dry-run]
spendly accounts update <account-id> [inputs] [--dry-run]
spendly accounts archive <account-id> [--dry-run]
spendly accounts reactivate <account-id> [--dry-run]
spendly accounts set-default <account-id> [--dry-run]
spendly accounts adjust-balance <account-id> [inputs] [--dry-run]
spendly accounts transfer [inputs] [--dry-run]
```

Every account mutation uses the shared dry-run, idempotency, output, retry, and
ownership rules. Non-interactive commits require a stable idempotency key. An
update, archive, reactivate, set-default, or balance adjustment requires the
expected account revision; a transfer requires expected revisions for both
accounts.

### 14.2 Create and Update

- Create requires `--name`, `--account-type-id` or one exact
  `--account-type`, and `--starting-balance`.
- The name is trimmed and cannot be empty. Account names are not required to be
  unique, so an ambiguous human name selector fails with candidates.
- Opening balance must be finite and may be zero or negative. It creates both
  the account and its immutable `opening_balance` ledger entry.
- New accounts inherit the user's current currency. The CLI does not accept a
  currency override and never converts balances.
- The first created account becomes the default and marks pending account setup
  as completed.
- Update may change name or select another active account type. Opening balance,
  current balance, currency, and ledger entries are not edited through update.
- An archived type remains visible on existing accounts but cannot be assigned
  to a new account or selected during reassignment.

### 14.3 Archive, Reactivate, and Default

- Archive hides an account from new-expense selectors, transfers, dashboard
  totals, and default account reads while preserving the account and its full
  history.
- Archiving the default account clears the user's default preference.
- Reactivate makes the account eligible for new expenses and same-currency
  transfers again; it does not automatically make it default.
- `set-default` accepts only an active account owned by the authenticated user.
- These commands are lifecycle mutations, not permanent deletion. Version 1
  exposes no account delete command because the merged backend has no safe
  account-delete contract.

### 14.4 Balance Adjustment

- Require `--balance`; optional inputs are `--date` and `--note`.
- `--balance` is the desired absolute balance, not a delta. It must be finite
  and may be zero or negative.
- The backend calculates `desiredBalance - currentBalance` and appends one
  `manual_adjustment` ledger entry. A zero difference is a successful no-op.
- The default date is the computer's current local calendar date under the same
  timezone rules as expenses.
- Archived accounts cannot be adjusted.
- Dry run returns current balance, adjustment amount, resulting balance,
  currency, revision, and a warning when the result is negative.

### 14.5 Transfer

- Require source account, destination account, and `--amount`; optional inputs
  are `--date` and `--note`.
- Non-interactive agents use `--from-account-id` and `--to-account-id`. Humans
  may use exact unique names.
- Source and destination must be different active accounts owned by the user
  and must resolve to the same currency.
- Amount must be finite and greater than zero. Spendly permits the source to
  become negative but the dry run must warn before commit.
- Commit atomically creates one transfer record, a negative `transfer_out`
  ledger entry, and a positive `transfer_in` entry.
- Transfers do not affect expense-cycle spending. Version 1 does not edit or
  delete completed transfers; corrections use an explicit compensating
  transfer.

## 15. Domain Rules

### 15.1 Amount and Currency

- Mirror Spendly Web's current numeric amount model in version 1.
- Parse ordinary base-10 decimal input.
- Require an amount of at least `0.01`.
- Reject zero, negatives, `NaN`, infinity, and scientific notation.
- Do not enforce two decimal places and do not migrate to minor units in version
  1.
- JSON returns `amount` as a number and `currency` separately.
- Currency is the user's current Web preference, defaulting to `USD`.
- The CLI cannot change currency.
- Changing currency in Web immediately changes CLI display formatting and does
  not convert stored amounts.
- If user intent explicitly names a different currency, stop rather than
  converting or silently relabeling it.

### 15.2 Date and Timezone

- Accept only `YYYY-MM-DD` at the CLI boundary.
- When omitted, use the computer's current local calendar date in human and
  agent modes.
- Return the resolved date, `dateSource`, and detected IANA timezone.
- If timezone detection fails, require an explicit date rather than using UTC.
- The skill may interpret natural-language dates, but the CLI parser does not.
- Hosted-agent timezone support is deferred until Spendly stores a user IANA
  timezone.

### 15.3 Cycle Boundaries

- The canonical range is `startDate <= date < endDate`.
- JSON names the exclusive boundary `endDateExclusive`.
- An expense outside all cycles remains valid with a `null` cycle.
- A category is valid only when its cycle contains the expense date.

### 15.4 Selector Resolution

- Agents in `--non-interactive` mode use stable IDs for category, tag, account,
  and account-type mutation inputs.
- Humans may use exact names.
- Name matching trims surrounding whitespace and compares case-insensitively.
- Exactly one valid match is required.
- Ambiguity returns candidates and performs no write.
- Never use fuzzy matching or choose the first result.
- JSON always includes both IDs and display names.

### 15.5 Category Inference

When category is omitted on create, assign one only when every condition holds:

1. `spentOn` is present.
2. Matching uses trimmed, case-insensitive exact text.
3. At least three matching expenses exist in the previous 12 months.
4. The three most recent matches all have the same category name.
5. Exactly one visible category with that name exists in the resolved cycle.

Report `categorySource: "history"` when inferred. Otherwise save the expense
uncategorized and report that result. Never classify from general-world
knowledge.

### 15.6 Tags

- Never infer or automatically create tags.
- Omitted tags mean no tags on create and no change on update.
- Unknown or ambiguous tags stop the mutation.
- Historical tags are not copied automatically.

### 15.7 Account and Ledger Rules

- Account type `balanceNature` is either `asset` or `liability`. It controls
  presentation; the current ledger applies signed deltas uniformly to both.
- Account-type names are unique per user after trimming and case normalization.
  Archived types remain visible in history but cannot be assigned; types in use
  cannot be deleted or change balance nature in Web.
- Resolved account currency is the stored legacy account currency when present,
  otherwise the user's current currency, defaulting to `USD`.
- Current balance is a denormalized cache maintained only through ledger-backed
  mutations. The CLI never writes it or a ledger row directly.
- Expense create subtracts the amount from the selected account. Expense update
  applies only the balance delta or reverses the old account before applying the
  new one. Expense delete restores the amount, including for an archived
  historical account.
- An existing expense may remain on an archived account and may be corrected in
  place. A new assignment or move to an archived account is rejected.
- Account totals are grouped by currency; values in different currencies are
  never summed or converted.

## 16. Retry and Failure Policy

- Read-only commands may retry temporary network or service failures up to
  three attempts with bounded exponential backoff.
- `--no-retry` disables read retries.
- The CLI does not automatically retry mutations in version 1.
- Convex may internally retry deterministic queries and mutations.
- If a mutation has an uncertain transport result, return a retryable error.
  The caller may explicitly repeat the command with the same idempotency key.
- Never retry validation, authentication, revision, idempotency, or deletion
  confirmation failures.
- Include `retryAfterMs` only when the backend actually supplies it.

## 17. Spendly Agent Skill

### 17.1 Supported Agents

- Codex.
- Claude Code.

Other agents may use the documented JSON contract but are not officially
tested in version 1.

### 17.2 Distribution

Store the portable Agent Skills-format bundle at:

```text
skills/spendly/SKILL.md
```

Distribute it from the public GitHub repository through skills.sh:

```bash
npx skills add akhilesh-dalvi/spendly \
  --skill spendly \
  --global \
  --agent codex \
  --agent claude-code
```

Use `npx skills update spendly -g` for updates. Do not add custom
`spendly skill install` commands.

The skills CLI collects anonymous installation telemetry by default. Document
that users may set `DISABLE_TELEMETRY=1` when installing. The Spendly skill
contains no credentials or user financial data.

### 17.3 Required Workflow

1. Verify `spendly --version` and `spendly auth status --json`.
2. Load `spendly context --json`.
3. Resolve user intent without inventing dates, currencies, categories, tags,
   accounts, account types, balances, or transfer endpoints.
4. Generate a stable idempotency key for each intended mutation and reuse it
   only for retries of that same intent.
5. Run the mutation with `--dry-run --json --non-interactive`.
6. Stop for ambiguity, conflict, unexpected normalization, or deletion without
   explicit user intent.
7. Commit the expense or account mutation and report the normalized result,
   including every account balance affected.
8. For expense delete, obtain the short-lived confirmation token and perform the
   separate confirmed commit.

## 18. Public CLI Documentation

### 18.1 Architecture and Location

- Add Fumadocs to the existing `apps/web` Next.js application instead of
  creating and operating a separate documentation application.
- Serve the documentation publicly at `/docs/cli`; it must not require Clerk
  authentication or expose signed-in Spendly data.
- Store public MDX under `apps/web/content/docs/cli` and keep the internal
  phase, implementation, and verification records under the repository-level
  `docs/` directory.
- Use Fumadocs MDX as the content source and Fumadocs UI for the page tree,
  sidebar, table of contents, code blocks, and search experience.
- Integrate the docs with Spendly's existing typography, colors, navigation,
  metadata, sitemap, and responsive behavior rather than presenting an
  unrelated default theme.

### 18.2 Required Information Architecture

The version 1 documentation must include:

1. Overview and supported use cases.
2. Installation, update, version, and uninstall instructions.
3. Browser authentication, logout, credential storage, and account-setup
   requirements.
4. Global flags, human output, JSON envelopes, exit codes, pagination, dates,
   currencies, and selector rules.
5. Expense read and mutation workflows.
6. Account, balance-adjustment, transaction-history, and transfer workflows.
7. Dry-run, idempotency, revisions, deletion confirmation, ambiguity, and
   uncertain-result recovery.
8. Codex and Claude Code Spendly skill installation and safe agent usage.
9. Privacy, security boundaries, and troubleshooting.

Pages should teach complete tasks first and link to concise command reference
material when exact flags or response fields are needed.

### 18.3 Accuracy and Privacy Gates

- Installed `spendly <resource> <command> --help` output and versioned JSON
  schemas are the command-reference source of truth.
- Validate documented commands and flags against a production CLI build in CI.
- Run copyable command examples in a parser-only or isolated fixture mode; docs
  verification must never access a user's live Spendly data.
- Use synthetic IDs, names, balances, dates, tokens, and JSON responses in all
  public examples.
- Do not publish development endpoints, Clerk configuration, Convex deploy
  keys, credential paths, real financial payloads, or internal implementation
  notes.
- Link the npm package README and CLI help output to the stable documentation
  URL once it is deployed.

## 19. Security Requirements

- Embed no Clerk secret, Convex deploy key, backend secret, or personal token in
  the npm package or skill.
- Bind callback servers only to `127.0.0.1`.
- Validate issuer, audience, state, PKCE, subject, expiry, and redirect URI.
- Derive the user only from verified authentication.
- Enforce ownership for every queried or mutated resource.
- Return not found or a safe authorization error without leaking cross-user
  data.
- Redact credentials and authorization headers from all diagnostics.
- Require exact dependency locks, package-content review, provenance, and npm
  account verification before publish.
- Do not send expense payloads, tokens, or credentials to future Sentry or
  PostHog integrations.
- Treat source labels such as interactive or non-interactive as informational,
  never as an authorization boundary.

## 20. Testing Requirements

### 20.1 Unit Tests

- Commander parsing and local validation.
- Amount, date, and timezone normalization.
- JSON envelopes and exit-code mapping.
- Selector normalization and ambiguity.
- Secret redaction.
- Keychain and explicit file-storage behavior.
- Idempotency request fingerprinting.
- Category-history inference.
- Account selector ambiguity, default-account resolution, balance-adjustment
  math, transfer validation, and negative-balance warnings.

### 20.2 Backend Tests

- Missing-user and authentication behavior.
- Cross-user ownership enforcement.
- Web and CLI revision increments.
- Dry-run and commit normalization parity.
- Idempotent create, update, and delete replay.
- Conflict when a key is reused with different input.
- Thirty-day idempotency expiry behavior.
- Revision conflicts under concurrent updates.
- Five-minute, single-use deletion token behavior.
- Category-cycle mismatch and category inference.
- Cursor pagination without duplicates or omissions.
- Inclusive CLI date filters and exclusive cycle boundaries.
- Account and account-type ownership enforcement.
- Account create/update/archive/reactivate/default lifecycle.
- Opening, expense, manual-adjustment, transfer-out, and transfer-in ledger
  entries with cached-balance parity.
- Expense create, update, move, clear, and delete balance synchronization.
- Archived-account, archived-type, same-account, and cross-currency guards.
- Idempotent account mutation replay and stale account/transfer revision
  conflicts.

### 20.3 Integration and End-to-End Tests

- Browser login through a random loopback port.
- Token refresh within 30 days and reauthentication after 30 days.
- Correct keychain namespace and explicit file fallback.
- `ACCOUNT_SETUP_REQUIRED` for an authenticated Clerk user missing in Spendly.
- Context returns the same user and currency as Web.
- Context and account reads return the same active accounts, default, type
  metadata, currency-grouped totals, and balances as Web.
- Complete dry-run and commit for create and update.
- Complete account create, edit, default, adjustment, transfer, archive, and
  reactivate lifecycle with ledger verification.
- Account-aware expense create, move, clear, and delete with balance
  verification.
- Explicit mutation rerun using the same idempotency key after a simulated
  uncertain response.
- Enforced deletion preview token and permanent delete.
- Logout revocation and local removal.
- Human output and JSON stdout/stderr separation.
- Packaged CLI installation outside the monorepo on macOS and Linux.
- Codex and Claude Code skill evaluations.

## 21. Implementation Plan

### Phase 0: Decisions and Authentication Spike

Exit criterion: the approved contract is documented and a development Clerk
token authenticates the correct Spendly user through `ConvexHttpClient`.

- [x] Approve audience, platforms, runtime, toolchain, and package name.
- [x] Approve production-only published configuration and source-only
      development verification.
- [x] Approve authentication, credential storage, 30-day authorization, and
      logout policies.
- [x] Approve direct Convex access through a dedicated `cli/v1` facade.
- [x] Approve JSON envelope, exit codes, retry behavior, and pagination.
- [x] Document full individual-expense CRUD, account-aware expenses, account
      lifecycle and balance mutations, and read-only supporting resources.
- [x] Approve dry-run, idempotency, revisions, and deletion confirmation.
- [x] Approve currency, amount, date, cycle, selector, inference, and tag rules.
- [x] Approve Codex and Claude Code skill distribution through skills.sh.
- [x] Approve `0.1.0`/`next` beta and `1.0.0`/`latest` stable strategy.
- [x] Defer persistent audit storage and future Sentry/PostHog design.
- [x] Create the development Clerk public OAuth application.
- [x] Add the matching strict development Convex auth provider.
- [x] Prototype and execute browser login, refresh, and logout.
- [x] Verify the token resolves the same Spendly user as Web.
- [x] Select `@napi-rs/keyring` and pass the native macOS canary.
- [x] Defer the native Linux Secret Service canary to pre-release platform
      validation; do not claim Linux support until it passes.
- [x] Complete a security review of the authentication spike.

### Phase 1: CLI Foundation

- [x] Add `apps/cli/package.json`, binary entry, TypeScript config, and build.
- [x] Add workspace scripts for development, build, typecheck, test, and pack.
- [x] Implement lazy command routing with Commander 14.
- [x] Implement shared schemas, terminal rendering, JSON rendering, and errors.
- [x] Implement the approved process exit codes.
- [ ] Implement production constants and ignored source-only development config.
      Production issuer, Convex, Web, and source-development isolation are complete;
      the production Clerk OAuth client ID still requires external provisioning.
- [x] Add redacted `--debug`, `--json`, `--non-interactive`, `--no-color`,
      `--no-retry`, help, and version behavior.
- [x] Verify a packed tarball outside the repository.

### Phase 2: Authentication

- [x] Implement PKCE, OAuth state, nonce, and token validation.
- [x] Implement the random-port one-request loopback server and five-minute
      timeout.
- [x] Implement browser opening and same-machine URL fallback.
- [x] Implement keychain storage and explicit owner-only file fallback.
- [x] Implement 30-day session enforcement and token refresh.
- [x] Implement login, status, logout, and provider revocation.
- [x] Implement `ACCOUNT_SETUP_REQUIRED`.
- [x] Add credential leakage and namespace tests.
- [x] Pass a real development end-to-end login.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 2: Authentication](spendly-cli-phase-2.md).

### Phase 3: Versioned Backend Facade

- [x] Add `cli/v1` validators, stable response types, and error taxonomy.
- [x] Extract shared Web/CLI expense, account, transfer, and ledger business
      logic.
- [x] Initialize expense revisions and increment them from every Web and CLI
      update.
- [x] Add account revisions and bind transfer previews to both account
      revisions.
- [x] Add the 30-day idempotency table and cleanup job.
- [x] Add server-backed create and update dry runs.
- [x] Add five-minute single-use deletion confirmation capabilities.
- [x] Add deterministic cursor pagination and required indexes.
- [x] Add the aggregated context query.
- [x] Add cursor-paginated account transaction reads and account summary
      responses.
- [x] Add backend ownership, conflict, replay, expiry, and concurrency tests.
- [x] Perform a Convex security and best-practices review.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 3: Versioned Backend Facade](spendly-cli-phase-3.md).

### Phase 4: Read Commands

- [x] Implement `context`.
- [x] Implement expense get and cursor-paginated list.
- [x] Implement the approved expense filters.
- [x] Implement cycle, category, tag, and summary reads.
- [x] Implement account list, get, transactions, and read-only account-type
      commands.
- [x] Implement exact human-name resolution and agent ID requirements.
- [x] Add JSON fixtures and stdout/stderr compatibility tests.

Implementation and local verification evidence is recorded in
[Spendly CLI Phase 4: Read Commands](spendly-cli-phase-4.md).

### Phase 5: Expense Mutations

- [x] Implement create and `create --dry-run`.
- [x] Implement update, explicit clear flags, and `update --dry-run`.
- [x] Implement delete dry run and confirmed permanent delete.
- [x] Implement local-date resolution and category-history inference.
- [x] Implement interactive key generation and non-interactive key requirement.
- [x] Implement revision handling and conflict guidance.
- [x] Implement account selection, default-account resolution, unassigned
      expenses, and the account expense filter.
- [x] Verify expense create, edit, move, clear, and delete ledger effects.
- [x] Implement uncertain-result recovery without automatic mutation retry.
- [x] Pass the complete expense lifecycle end to end on development.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 5: Expense Mutations](spendly-cli-phase-5.md).

### Phase 6: Account Mutations

- [x] Implement account create and update with active account-type validation.
- [x] Implement archive, reactivate, and set-default.
- [x] Implement absolute-balance adjustment with delta preview and ledger entry.
- [x] Implement same-currency transfer with two-account revision checks.
- [x] Return all affected balances and ledger references from mutation results.
- [x] Add archived-account, ambiguity, cross-currency, negative-balance,
      idempotency, and stale-preview tests.
- [x] Pass the complete account and account-backed expense lifecycle end to end
      on development.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 6: Account Mutations](spendly-cli-phase-6.md).

### Phase 7: Spendly Skill

- [x] Add `skills/spendly/SKILL.md` in portable Agent Skills format.
- [x] Encode auth, context, date, selector, account, balance, transfer,
      inference, dry-run, idempotency, revision, and deletion workflows.
- [x] Add expense and account success, ambiguity, conflict, timeout, negative
      balance, and deletion examples.
- [x] Test global skills.sh installation for Codex and Claude Code.
- [ ] Run the agent evaluation suite and review for personal-data leakage.

Implementation and current verification evidence is recorded in
[Spendly CLI Phase 7: Spendly Skill](spendly-cli-phase-7.md).

### Phase 8: Fumadocs CLI Documentation

Exit criterion: `/docs/cli` is a public, searchable, responsive Fumadocs site
whose copyable commands match the production CLI build and whose examples
contain only synthetic data.

- [ ] Add compatible Fumadocs Core, UI, and MDX packages to `apps/web`.
- [ ] Configure the Fumadocs MDX source, Next.js integration, shared provider,
      and styles without regressing existing Web routes.
- [ ] Add the public `/docs/cli` layout, page route, navigation tree, table of
      contents, and search endpoint.
- [ ] Create the approved overview, installation, authentication, CLI contract,
      expense, account, transfer, agent-skill, privacy, and troubleshooting
      pages.
- [ ] Add command-reference generation or validation against the production CLI
      build and versioned JSON schemas.
- [ ] Ensure every public example uses synthetic data and no development or
      credential material is included in the generated site.
- [ ] Add documentation metadata, canonical URLs, sitemap entries, and links
      from the Spendly marketing navigation, npm README, and CLI help.
- [ ] Verify the production Web build, search, keyboard navigation, responsive
      layout, copy buttons, internal links, and representative command examples.

The approved implementation design and verification checklist are recorded in
[Spendly CLI Phase 8: Fumadocs Documentation](spendly-cli-phase-8.md).

### Phase 9: Packaging and Release

- [ ] Add CI for format, lint, typecheck, tests, package build, and tarball
      inspection.
- [ ] Add macOS and Linux test coverage.
- [ ] Verify `npm whoami` and package availability immediately before publish.
- [ ] Generate npm provenance and dependency-audit results.
- [ ] Verify development end-to-end gates before merge.
- [ ] Deploy `/docs/cli` and verify its stable production URL.
- [ ] Publish `spendly@0.1.0` with tag `next`.
- [ ] Verify clean global installation and production login.
- [ ] Verify the published package, CLI help, and skills.sh bundle link to the
      production documentation.
- [ ] Resolve beta findings before publishing `1.0.0` with tag `latest`.

### Later Phases

- [ ] Add Sentry and PostHog with an explicit privacy design.
- [ ] Store user IANA timezone before hosted-agent support.
- [ ] Design scoped delegated authorization for third-party agents.
- [ ] Add device or other headless authentication only when Clerk support and
      product requirements justify it.
- [ ] Add Windows support.
- [ ] Design account-type mutation commands if Web parity is needed.
- [ ] Add permanent account deletion only after the backend defines eligibility,
      history preservation, confirmation, and recovery behavior.
- [ ] Design safe mutations for cycles, categories, category types, and tags.
- [ ] Evaluate export and MCP surfaces that reuse `cli/v1`.
- [ ] Design a product-wide trash system only if both Web and CLI adopt it.

## 22. Version 1 Acceptance Criteria

- [ ] A source checkout authenticates against Clerk and Convex development
      without weakening issuer or audience checks.
- [ ] A user who has opened Spendly Web can install the package and complete
      production browser login without copying a secret.
- [ ] A missing Spendly backend user receives `ACCOUNT_SETUP_REQUIRED`.
- [ ] Humans receive readable output by default; JSON requires `--json`.
- [ ] JSON stdout contains exactly one parseable versioned document.
- [ ] Agents use `--json --non-interactive` and stable IDs.
- [ ] Omitted dates resolve to the computer's local date and report timezone.
- [ ] Category inference occurs only under the approved history rule.
- [ ] Tags are never inferred or created.
- [ ] An agent can list, get, create, update, and permanently delete one expense.
- [ ] An agent can list and inspect accounts, account transactions, and account
      types.
- [ ] An agent can create, edit, archive, reactivate, and make an account
      default without mutating account types or deleting history.
- [ ] Balance adjustment records only the difference between cached and desired
      balances; same-currency transfer updates both accounts atomically.
- [ ] Account-backed expense create, update, move, clear, and delete keep cached
      balances and ledger history synchronized.
- [ ] Archived accounts remain readable but reject new expenses, adjustments,
      and transfers.
- [ ] Dry run and commit share normalization and validation.
- [ ] Reusing an idempotency key cannot create a duplicate within 30 days.
- [ ] A stale update or delete cannot overwrite a newer revision.
- [ ] A non-interactive delete cannot commit without a valid short-lived token.
- [ ] Cross-user IDs cannot be read or mutated.
- [ ] Mutation transport failures are not automatically retried.
- [ ] Logout removes local access and attempts provider revocation.
- [ ] The npm tarball exposes production only and contains no secrets or
      development configuration.
- [ ] The package works outside the monorepo on macOS and Linux.
- [ ] The skills.sh-installed skill passes Codex and Claude Code evaluations.
- [ ] `/docs/cli` is public, searchable, responsive, and accessible without a
      Spendly account.
- [ ] Public command examples and flags pass automated checks against the
      production CLI build and contain only synthetic data.
- [ ] The npm package, CLI help, and Spendly skill link to the stable CLI
      documentation URL.

## 23. Remaining Technical Decisions

The product behavior is approved. The following implementation selections may
be made during their phase and validated with tests:

- The Linux Secret Service validation environment and supported Linux
  distribution/runtime matrix.
- The concrete module and function names under the `cli/v1` facade.
- The internal schema used for idempotency and deletion capabilities.
- The account revision representation and the exact two-account transfer
  fingerprint stored by the CLI facade.
- The exact backoff constants for safe read retries.
- The package provenance and CI provider configuration.

Any discovery that requires weakening the approved authentication, ownership,
idempotency, revision, deletion, privacy, or environment boundaries requires a
new product decision.

## 24. Risks and Mitigations

| Risk                                             | Impact                                        | Mitigation                                                                 |
| ------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------- |
| OAuth token audience is incompatible with Convex | CLI cannot authenticate safely                | Make the real development proof a merge gate; never weaken audience checks |
| Agent retry creates a duplicate                  | Incorrect financial history                   | Require server idempotency and explicit same-key retry                     |
| Web edit races with an agent                     | Newer data is overwritten                     | Increment and require expense revisions across Web and CLI                 |
| Deletion targets stale data                      | Permanent data loss                           | Require a five-minute single-use token bound to ID and revision            |
| Duplicate names resolve incorrectly              | Misclassified expense                         | Require IDs for agents and one exact scoped match for humans               |
| Machine timezone differs from user intent        | Wrong date or cycle                           | Report local timezone and stop when wording or detection is uncertain      |
| Currency is interpreted as conversion            | Historical values appear incorrect            | Mirror Web's user-level display model and never convert                    |
| Expense or adjustment bypasses the ledger        | Cached balance and history diverge            | Share ledger helpers across Web and CLI and test cached-balance parity     |
| Transfer targets the wrong or stale account      | Two balances are corrupted                    | Require IDs for agents, dry run, idempotency, and both account revisions   |
| Archived account receives new activity           | Closed financial history changes unexpectedly | Reject new expense assignment, adjustment, and transfer server-side        |
| Tokens leak through files or output              | Account compromise                            | Use keychain, explicit secure fallback, redaction, and leakage tests       |
| Published package reaches development            | Data or auth isolation failure                | Bake production configuration into releases and keep dev source-only       |
| Skill and CLI contracts drift                    | Agent performs unsafe or invalid calls        | Version JSON, release together, and run Codex/Claude evaluations           |
| Public CLI documentation drifts from the binary  | Users run invalid or unsafe commands          | Validate documented commands against the production CLI build in CI        |
| Documentation exposes private configuration      | Credentials or internal endpoints leak        | Use synthetic fixtures and scan generated output before deployment         |

## 25. References

- [Convex `ConvexHttpClient` API](https://docs.convex.dev/api/classes/browser.ConvexHttpClient.html)
- [Convex error handling and retries](https://docs.convex.dev/functions/error-handling/)
- [Convex mutation transactions](https://docs.convex.dev/functions/mutation-functions)
- [Convex custom OIDC providers](https://docs.convex.dev/auth/advanced/custom-auth)
- [Convex custom JWT providers](https://docs.convex.dev/auth/advanced/custom-jwt)
- [Clerk: Adding authentication to a CLI](https://clerk.com/blog/adding-clerk-auth-to-your-cli)
- [Clerk OAuth public clients and PKCE](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [skills.sh CLI reference](https://www.skills.sh/docs/cli)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
- [Fumadocs quick start](https://www.fumadocs.dev/docs)
- [Fumadocs Next.js installation](https://www.fumadocs.dev/docs/manual-installation/next)
- [Fumadocs search](https://www.fumadocs.dev/docs/search)
- [Spendly documentation index](README.md)
- [Spendly backend documentation](../packages/backend/convex/README.md)
