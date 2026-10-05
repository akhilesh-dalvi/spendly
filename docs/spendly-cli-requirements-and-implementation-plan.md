# Spendly CLI Requirements and Implementation Plan

## Document Status

- Status: Phases 0-6 complete; Phase 7 implementation and installation verified;
  independent agent response evaluations are optional; Phases 8, 8.5, and 8.6
  complete; Phase 8.7 repository hardening complete with hosted CI,
  remaining source-handoff sign-off unverified and deferred from the narrowed
  initial scope; Phase 8.8 guided
  interactive input implementation and local gates complete; Phase 8.9 human CLI UX
  implementation and targeted real-terminal retest complete with current
  automated local gates passing; Phase 8.10 manual interactive verification
  complete, including findings F01-F18; Phase 8.11 MCP reuse readiness and its
  post-refactor local integration check are complete; Phase 8.12 Raycast reuse
  readiness is complete; Phase 9 publication and practical macOS/Codex
  read-only acceptance are recorded, with broader validation deferred
- Last updated: 2026-10-05
- Target branch: `master` through short-lived reviewed branches
- Package location: `apps/cli`
- npm package and executable: `spendly`
- Initial release: immutable `spendly@0.1.2`, published with `--tag next`;
  npm assigned both `next` and `latest` on first publication
- Version policy: continue with `0.1.x`, `0.2.x`, and later `0.x` releases until
  real user adoption proves the CLI contract is ready for `1.0.0`

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

The initial release lets users add, view, edit, and delete individual expenses, supports
account-aware expense tracking, and provides the account operations already
supported by Spendly Web: add, edit, archive, reactivate, make default, adjust
balance, and transfer. It also
provides read-only account activity and account-type context. It does not
provides no bulk mutations except the approved guided atomic Archive/Reactivate
account selection, and no mutation commands for cycles, categories, category
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
- Prevent stale edits and deletions from overwriting newer changes.
- Make every mutation previewable through the same input contract used to
  commit it.
- Require a server-backed, short-lived confirmation capability for deletion.
- Keep expense and account balances synchronized when an expense is added,
  edited, moved, unassigned, or deleted.
- Establish a backend contract that can later be reused by an MCP server.
- Publish searchable, task-oriented CLI documentation alongside Spendly Web.
- Show users when a committed change came from the CLI and distinguish an
  explicitly declared AI-agent invocation from direct human CLI use.

## 3. Non-Goals for the Initial Release

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
- A general persistent mutation audit table. The initial release stores only bounded
  source provenance on the affected expense, account, transfer, and ledger
  records; it does not claim a complete historical audit trail.
- Treating public documentation as a substitute for live CLI help, versioned
  JSON schemas, or backend validation.

## 4. Supported Users and Platforms

### 4.1 Local AI Agent

Initial release acceptance is scoped to a trusted macOS computer. Linux is
planned; native credential-store and packaged-install validation is required
before advertising Linux support. The agent follows the Spendly skill and always
invokes the CLI with `--agent`, `--json`, and `--non-interactive`.

### 4.2 Human CLI User

The user invokes the same commands directly. Human-readable output is the
default; JSON is opt-in.

### 4.3 Runtime

- Node.js 22 or newer. Release CI covers Node.js 22 and 24 on macOS and Linux.
- macOS is the verified platform and the initial release acceptance scope.
- Linux is planned. Its native credential-store and packaged-install gates must
  pass before Linux support is advertised; they do not block macOS acceptance.
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
11. **Visible provenance:** committed CLI changes identify direct CLI versus
    explicitly declared AI-agent use in Spendly Web without implying verified
    agent identity.

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
- Human prompt layer: `@clack/prompts`, introduced in Phase 8.8 without changing
  the Commander flag or JSON contracts.
- Build: `tsc` producing Node.js ESM.
- Test runner: Vitest using its Node environment.
- Formatting and linting: repository Ultracite/Biome standards.

### 7.3 Release Strategy

1. Publish the exact `spendly@0.1.2` version, with no prerelease suffix, using
   the npm `next` tag after all local development gates pass.
2. Test that installed package outside the monorepo on macOS. Validate native
   Linux storage and installation separately before advertising Linux support.
3. Resolve release-blocking findings. Because npm versions are immutable, any
   code change requires a higher `0.x` version and a new candidate.
4. Record default-channel acceptance for the unchanged, validated package.
   npm already assigned `latest` to the first publication; no additional tag
   change is needed for `0.1.2`. Later releases require explicit promotion after
   acceptance. Do not rebuild or republish an accepted version.
5. Publish compatible fixes as `0.1.x` and substantial or contract-changing
   releases as `0.2.0`, `0.3.0`, and later `0.x` versions.
6. Consider `1.0.0` only after real-world usage shows that the CLI command and
   machine-readable contracts are dependable enough for a deliberate stability
   commitment.

There is no production release allowlist because Spendly currently has very few
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
  headless login, or CI login in the initial release.

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
data in the initial release.

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
macOS-scoped Phase 0. Linux Secret Service validation is deferred until before
Linux support is advertised and has not been claimed as passing.

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
- AI agents must also pass `--agent`. Do not infer AI use from JSON or
  non-interactive mode; direct scripts remain identified as CLI use.
- Do not automatically switch output contracts based on TTY detection.
- `--non-interactive` prohibits prompts and fails when required input is
  unresolved.
- Phase 8.8 may add explicit `--interactive` guided input for human TTY use.
  It must conflict with `--json`, `--non-interactive`, and `--agent`; fully
  specified commands remain non-prompting except for permanent expense
  deletion.
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
spendly expenses add [inputs] [--dry-run]
spendly expenses edit <expense-id> [inputs] [--dry-run]
spendly expenses delete <expense-id> [--dry-run]
```

There are no separate `preview-add`, `preview-edit`, or `preview-delete`
commands.

### 13.2 Dry Run

- Use exactly the same inputs as the corresponding commit command.
- Run server-side ownership, normalization, selector, cycle, revision, and
  validation logic.
- Perform no expense write.
- Add and edit dry runs return the normalized proposed resource; edit
  also returns before and after values.
- Delete dry run returns the exact expense, its revision, and a deletion
  confirmation token.
- A clear user instruction authorizes one add or edit; the skill previews
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

- Every new expense starts with a revision, and every Web or CLI edit
  increments it.
- Reads and dry runs return the revision.
- Edit and delete commit only if the expected revision still matches.
- A mismatch returns a conflict and performs no write.
- Humans may have revision handling performed transparently by the CLI.
- Non-interactive agents must receive and submit the revision explicitly, for
  example through `--if-revision`.

### 13.5 Add

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

### 13.6 Edit

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

Deletion is permanent and has no trash or restore command in the initial release.

Non-interactive flow:

1. Run
   `spendly --agent --json --non-interactive expenses delete <id> --dry-run`.
2. Receive the exact expense, revision, and confirmation token.
3. Commit with the token, expected revision, and idempotency key:

```bash
spendly --agent --json --non-interactive expenses delete <id> \
  --confirmation-token <token> \
  --if-revision <revision> \
  --idempotency-key <key>
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
spendly accounts add [inputs] [--dry-run]
spendly accounts edit <account-id> [inputs] [--dry-run]
spendly accounts archive <account-id> [--dry-run]
spendly accounts reactivate <account-id> [--dry-run]
spendly accounts set-default <account-id> [--dry-run]
spendly accounts adjust-balance <account-id> [inputs] [--dry-run]
spendly accounts transfer [inputs] [--dry-run]
```

Every account mutation uses the shared dry-run, idempotency, output, retry, and
ownership rules. Non-interactive commits require a stable idempotency key. An
edit, archive, reactivate, set-default, or balance adjustment requires the
expected account revision; a transfer requires expected revisions for both
accounts.

### 14.2 Add and Edit

- Add requires `--name`, `--account-type-id` or one exact
  `--account-type`, and `--starting-balance`.
- The name is trimmed and cannot be empty. Account names are not required to be
  unique, so an ambiguous human name selector fails with candidates.
- Opening balance must be finite and may be zero or negative. It creates both
  the account and its immutable `opening_balance` ledger entry.
- New accounts inherit the user's current currency. The CLI does not accept a
  currency override and never converts balances.
- The first created account becomes the default and marks pending account setup
  as completed.
- Edit may change name or select another active account type. Opening balance,
  current balance, currency, and ledger entries are not changed through edit.
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
- These commands are lifecycle mutations, not permanent deletion. The initial release
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
- Transfers do not affect expense-cycle spending. The initial release does not edit or
  delete completed transfers; corrections use an explicit compensating
  transfer.

## 15. Domain Rules

### 15.1 Amount and Currency

- Mirror Spendly Web's current numeric amount model in the initial release.
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

When category is omitted while adding, assign one only when every condition holds:

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
- Omitted tags mean no tags when adding and no change when editing.
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
- Adding an expense subtracts the amount from the selected account. Editing it
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
- The CLI does not automatically retry mutations in the initial release.
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
tested in the initial release.

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

1. Verify `spendly --version` and
   `spendly --agent --json --non-interactive auth status`.
2. Load `spendly --agent --json --non-interactive context`.
3. Resolve user intent without inventing dates, currencies, categories, tags,
   accounts, account types, balances, or transfer endpoints.
4. Generate a stable idempotency key for each intended mutation and reuse it
   only for retries of that same intent.
5. Run the mutation with `--agent --dry-run --json --non-interactive`.
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

The initial-release documentation must include:

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
- Treat Web, CLI, and explicitly declared AI-agent source labels as
  informational, never as verified identity or an authorization boundary.

## 20. Testing Requirements

### 20.1 Unit Tests

- Commander parsing and local validation.
- Explicit `--agent` parsing and commit-only provenance injection.
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
- Web, direct-CLI, and agent-CLI provenance across expenses, accounts,
  transfers, and generated ledger entries, including legacy missing fields.
- Dry-run and commit normalization parity.
- Idempotent add, edit, and delete replay.
- Conflict when a key is reused with different input.
- Thirty-day idempotency expiry behavior.
- Revision conflicts under concurrent updates.
- Five-minute, single-use deletion token behavior.
- Category-cycle mismatch and category inference.
- Cursor pagination without duplicates or omissions.
- Inclusive CLI date filters and exclusive cycle boundaries.
- Account and account-type ownership enforcement.
- Account add/edit/archive/reactivate/default lifecycle.
- Opening, expense, manual-adjustment, transfer-out, and transfer-in ledger
  entries with cached-balance parity.
- Expense add, edit, move, clear, and delete balance synchronization.
- Archived-account, archived-type, same-account, and cross-currency guards.
- Idempotent account mutation replay and stale account/transfer revision
  conflicts.

### 20.3 Integration and End-to-End Tests

- Browser login through a random loopback port.
- Token refresh within 30 days and reauthentication after 30 days.
- Correct keychain namespace and explicit file fallback.
- Agent-tagged expense and transfer commits displaying accessible bot
  indicators in the matching reactive Web views.
- `ACCOUNT_SETUP_REQUIRED` for an authenticated Clerk user missing in Spendly.
- Context returns the same user and currency as Web.
- Context and account reads return the same active accounts, default, type
  metadata, currency-grouped totals, and balances as Web.
- Complete dry-run and commit for add and edit.
- Complete account add, edit, default, adjustment, transfer, archive, and
  reactivate lifecycle with ledger verification.
- Account-aware expense add, move, clear, and delete with balance
  verification.
- Explicit mutation rerun using the same idempotency key after a simulated
  uncertain response.
- Enforced deletion preview token and permanent delete.
- Logout revocation and local removal.
- Human output and JSON stdout/stderr separation.
- Packaged CLI installation outside the monorepo on macOS for initial acceptance;
  native Linux storage and installation before advertising Linux support.
- Codex and Claude Code skill evaluations.

## 21. Implementation Plan

Checked phase items below mean their repository or development scope is
complete. They do not imply production acceptance. Production OAuth,
deployment, migration, npm publication, clean-user verification, and stable
promotion remain gated by Phases 8.7 through 8.12 and Phase 9.

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
- [x] Approve an unsuffixed `0.x` release (originally `0.1.0`; replacement
      `0.1.1` after source drift, then `0.1.2` after the publication-path fix):
      verify it on `next`, promote the
      unchanged package to `latest`, and remain below `1.0.0` until real usage
      proves the CLI contract is stable.
- [x] Defer persistent audit storage and future Sentry/PostHog design.
- [x] Create the development Clerk public OAuth application.
- [x] Add the matching strict development Convex auth provider.
- [x] Prototype and execute browser login, refresh, and logout.
- [x] Verify the token resolves the same Spendly user as Web.
- [x] Select `@napi-rs/keyring` and pass the native macOS canary.
- [x] Defer the native Linux Secret Service canary until before advertising
      Linux support; the initial release acceptance scope is macOS-only.
- [x] Complete a security review of the authentication spike.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 0: Decisions and Technical Spikes](spendly-cli-phase-0.md).

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

Implementation and verification evidence is recorded in
[Spendly CLI Phase 1: CLI Foundation](spendly-cli-phase-1.md).

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
- [x] Add server-backed add and edit dry runs.
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

- [x] Implement add and `add --dry-run`.
- [x] Implement edit, explicit clear flags, and `edit --dry-run`.
- [x] Implement delete dry run and confirmed permanent delete.
- [x] Implement local-date resolution and category-history inference.
- [x] Implement interactive key generation and non-interactive key requirement.
- [x] Implement revision handling and conflict guidance.
- [x] Implement account selection, default-account resolution, unassigned
      expenses, and the account expense filter.
- [x] Verify expense add, edit, move, clear, and delete ledger effects.
- [x] Implement uncertain-result recovery without automatic mutation retry.
- [x] Pass the complete expense lifecycle end to end on development.

Implementation and verification evidence is recorded in
[Spendly CLI Phase 5: Expense Mutations](spendly-cli-phase-5.md).

### Phase 6: Account Mutations

- [x] Implement account add and edit with active account-type validation.
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
- [x] Run the automated agent evaluation suite and review for personal-data
      leakage.

Implementation and current verification evidence is recorded in
[Spendly CLI Phase 7: Spendly Skill](spendly-cli-phase-7.md).

### Phase 8: Fumadocs CLI Documentation

Exit criterion: `/docs/cli` is a public, searchable, responsive Fumadocs site
whose copyable commands match the production CLI build and whose examples
contain only synthetic data.

- [x] Add compatible Fumadocs Core, UI, and MDX packages to `apps/web`.
- [x] Configure the Fumadocs MDX source, Next.js integration, shared provider,
      and styles without regressing existing Web routes.
- [x] Add the public `/docs/cli` layout, page route, navigation tree, table of
      contents, and search endpoint.
- [x] Create the approved eight-page task-oriented navigation covering Quick
      start, AI agents and the machine contract, expenses, accounts and
      transfers, cycles, categories, tags, privacy, and troubleshooting.
- [x] Add command-reference generation or validation against the production CLI
      build and versioned JSON schemas.
- [x] Ensure every public example uses synthetic data and no development or
      credential material is included in the generated site.
- [x] Add documentation metadata, canonical URLs, sitemap entries, and links
      from the Spendly marketing navigation.
- [x] Verify the production Web build, search, keyboard navigation, responsive
      layout, copy buttons, internal links, and representative command examples.

All Phase 8 repository implementation and local verification items are
complete. The production documentation deployment and verification of its npm
README, installed CLI help, and skills.sh links remain under Phase 9.

The approved implementation design and verification checklist are recorded in
[Spendly CLI Phase 8: Fumadocs Documentation](spendly-cli-phase-8.md).

### Phase 8.5: Manual Development Verification

Exit criterion: every safe live scenario is completed against the configured
development Clerk and Convex environment, independently confirmed through CLI
reads and Spendly Web, and cleaned up without deleting account history.

- [x] Verify CLI, Web, Clerk, and backend development configuration alignment.
- [x] Sync current backend functions to the development Convex deployment.
- [x] Pass backend and CLI lint, type, test, package, and documentation gates.
- [x] User completes browser login for the source-only development CLI.
- [x] Agent completes JSON `--non-interactive` reads, account workflows, expense
      workflows, replay, conflict, and error-code scenarios.
- [x] User completes human-readable output, exact-name, automatic mutation
      input, browser-state, confirmation-prompt, and logout checks.
- [x] Agent restores the original default state and archives all test accounts.

Exact commands, data-impact boundaries, cleanup, and the manual result checklist
are recorded in
[Spendly CLI Phase 8.5: Manual Development Verification](spendly-cli-phase-8.5.md).

### Phase 8.6: Action Provenance in Spendly Web

Exit criterion: every committed CLI mutation records direct CLI or explicitly
declared AI-agent provenance, and Spendly Web displays a compact, accessible
source indicator on the relevant expense, account, or ledger surface without
changing the versioned CLI output contract.

- [x] Add a global `--agent` flag; never infer agent use from `--json` or
      `--non-interactive`.
- [x] Store optional create/last-change provenance on expenses and accounts and
      immutable provenance on account transfers and account transactions.
- [x] Pass `web`, `cli`, or `cli_agent` through every shared commit path while
      leaving reads, previews, failed writes, and historical records unlabeled.
- [x] Include provenance in idempotency fingerprints and preserve it on replay.
- [x] Add a shared accessible Web indicator using `Bot` for agent CLI writes
      and `SquareTerminal` for direct CLI writes.
- [x] Show the indicator in expense list/detail/recent activity, account
      list/detail, and account ledger activity without adding a table column.
- [x] Update the Spendly skill and public AI-agent docs to use
      `--agent --json --non-interactive`.
- [x] Pass backend, CLI, Web, packaging, documentation, accessibility,
      responsive-browser, and live development provenance checks.

The approved data contract, action matrix, UI placement, edge cases, and
verification plan are recorded in
[Spendly CLI Phase 8.6: Action Provenance in Spendly Web](spendly-cli-phase-8.6.md).

### Phase 8.7: Pre-release Hardening and Release Readiness

Exit criterion: the exact release candidate, supported-runtime policy,
dependency strategy, production runbooks, publishing controls, recovery plan,
skill evaluation, and documentation are internally consistent and verified
before any production deployment or npm publication begins.

- [x] Move the supported CLI runtime from end-of-life Node.js 20 to Node.js 22
      or newer and verify the supported LTS matrix.
- [x] Make installed production dependencies and the packed manifest
      reproducible, and enforce one synchronized CLI/package/release version.
- [x] Define production authentication, backward-compatible deployment,
      resumable migration, cleanup-cron verification, rollback, and synthetic
      smoke-test runbooks.
- [x] Approve protected npm trusted publishing, first-publication bootstrap,
      later staged approval, provenance, signature verification, Git tagging,
      and release-note controls.
- [x] Add the complete non-production release CI and tarball gates before Phase
      9 performs external release actions.
- [x] Align normative agent instructions on
      `--agent --json --non-interactive` and refresh stale Phase 7, Phase 8,
      main-plan, root README, telemetry, support, and release-channel copy.
- [x] Keep the npm package, Git release, default-branch skill, skills.sh bundle,
      installed help, and public documentation on one compatible contract.

The complete boundary, decisions, and verification checklist are recorded in
[Spendly CLI Phase 8.7: Pre-release Hardening and Release Readiness](spendly-cli-phase-8.7.md).
Production execution and recovery procedures are defined in the
[Spendly CLI release runbook](spendly-cli-release-runbook.md).

### Phase 8.8: Guided Interactive Inputs

Exit criterion: every applicable human CLI workflow has a discoverable,
terminal-native guided path using stable-ID selects, tag and field
multiselects, validated text/date inputs, server previews, and safe
confirmations, while all existing flags remain compatible and JSON,
`--non-interactive`, and `--agent` execution provably never prompt.

- [x] Add pinned direct `@clack/prompts` and matching `@clack/core` runtime
      dependencies while retaining Commander for routing and the stable
      explicit-flag contract.
- [x] Add an explicit `--interactive` command launcher and command-specific
      guided mode with strict TTY, stream, color, cancellation, and incompatible
      global-option handling.
- [x] Add stable-ID single and searchable selects for expense, account,
      account-type, cycle, and category selectors, with scoped active/archived,
      cycle, and currency eligibility.
- [x] Add checkbox-style multiselects for tags, expense filters, and fields to
      update, including preselected current values and explicit keep/clear
      states.
- [x] Add validated text and local-date inputs for amounts, balances, names,
      descriptions, notes, and dates by reusing the existing domain parsers.
- [x] Route every fully guided mutation through its existing server preview,
      display normalized targets and balance/ledger effects, and confirm the
      exact preview before commit; permanent or destructive choices default to
      No.
- [x] Preserve explicit flags, name ambiguity errors, revisions, idempotency,
      deletion tokens, JSON schemas, exit codes, and backend enforcement.
- [x] Add injected prompt-adapter tests, package and dependency verification,
      and refreshed human documentation without changing the Spendly agent
      contract.
- [x] Hand the implemented Phase 8.8 interaction baseline to Phase 8.9; final
      human terminal verification is consolidated in Phase 8.10.

The current input audit, approved prompt semantics, complete command matrix,
safety boundaries, implementation architecture, and verification plan are
recorded in
[Spendly CLI Phase 8.8: Guided Interactive Inputs](spendly-cli-phase-8.8.md).

### Phase 8.9: Human CLI UX Polish

Exit criterion: the implemented CLI lets a first-time human discover guided
mode, navigate prompts
without relying on color, understand responsive results and pagination,
distinguish previews from saved mutations, and recover from common errors while
the versioned JSON/backend contract remains unchanged and the public command
vocabulary matches Spendly Web.

- [x] Finish the approved Add/Edit Spendly Web vocabulary, including
      `Add this account?` confirmation; preserve JSON envelopes,
      exit-code meanings, stdout/stderr boundaries, stable-ID rules, mutation
      safety invariants, and opt-in `--interactive` behavior.
- [x] Improve root, group, and leaf help with grouped discovery, guided and
      flag-based examples, accurate defaults, safe typo suggestions, and
      zsh/bash/fish completion.
- [x] Standardize select, radio, multiselect, checkbox, disabled, and search
      states with non-color focus; add second-level launcher Back navigation,
      static single-select rows without checkbox markers plus accepted-label
      feedback, static multiselect accepted-label feedback, normalized prompt
      punctuation, progress, review/edit, loading, cancellation, selected
      counts, and large-list viewport behavior.
- [x] Replace fixed-width human tables with responsive 40-, 80-, and 120-column
      layouts; consistently format money, dates, status, IDs, descriptions, and
      transaction types.
- [x] Normalize legacy timezone aliases such as `Asia/Calcutta` to the modern
      `Asia/Kolkata` name in default human output without changing date
      calculations, timezone semantics, or machine output.
- [x] Make active filters, result counts, continuation state, cursors, and
      contextual empty states visible in human list output and guided flows.
- [x] Resolve resource-backed filters to human names in human output, and omit
      opaque cursor continuation commands after guided-mode Done while
      preserving stable IDs and cursors in machine and non-interactive output.
- [x] Redesign mutation output around a prominent preview-only banner, focused
      field diff, balance/ledger effects, one-warning-per-line hierarchy, safe
      confirmations, concise success summaries, and one useful next action.
- [x] Replace raw resource IDs, internal ledger tokens, and ID-oriented labels
      in default human mutation previews and success results with readable
      expense targets, financial effects, and resolved category, account,
      cycle, tag, and ledger labels; retain stable IDs in machine,
      explicit-detail, and intentional copyable-command output.
- [x] Treat a human default-No/declined destructive confirmation as successful
      cancellation with no write and exit code 0; retain confirmation-required
      errors for non-interactive contract violations.
- [x] Show the resolved currency in guided starting-balance, desired-balance,
      and transfer-amount prompt titles before accepting monetary input.
- [x] Add guided Archive/Reactivate account multiselect with one combined
      preview, per-account revision validation, one default-No confirmation, and
      an atomic all-or-nothing commit; preserve explicit single-account and JSON
      contracts.
- [x] Select account/source/destination before guided balance or transfer money
      inputs, use action-specific Make default/Archive/Reactivate copy and
      focused diffs, and move stable IDs out of default human account previews.
- [x] Show stable error codes with field-aware recovery, including in-flow
      Change date/Choose another cycle/Cancel handling for a guided summary date
      with no cycle; improve authentication
      waiting/status/logout states, and preserve the uncertain-mutation rule.
- [x] Add screen-reader/static mode, ASCII and `TERM=dumb` fallbacks, robust
      `--no-color` behavior, terminal-height handling, and cursor/raw-mode
      restoration coverage.
- [x] Refresh installed help, npm README, public docs, troubleshooting, and
      validators; pass automated, PTY, accessibility, package, and
      representative first-time-user checks.

The complete audit, decisions, per-command improvements, implementation order,
and verification matrix are recorded in
[Spendly CLI Phase 8.9: Human CLI UX Polish](spendly-cli-phase-8.9.md).

### Phase 8.10: Manual Interactive Terminal Verification

Exit criterion met: the maintainer reconciled every public command family
against real-terminal usability, existing development end-to-end evidence, and
current automated commit contracts; cleaned up disposable test state; recorded
non-sensitive evidence; and reverified all 18 corrected findings.

- [x] Verify root discovery and the Add/Edit Spendly Web vocabulary in help and
      the guided launcher.
- [x] Verify visible focus before selection, arrow/Space/Enter behavior,
      date-segment focus, validation, Escape, and prompt cancellation.
- [x] Verify no-color, static `--accessible`/`ACCESSIBLE=1`, `TERM=dumb`, and
      screen-reader behavior in a real terminal.
- [x] Exercise every guided read command, resource selector, filter builder,
      include-archived choice, and user-controlled pagination path.
- [x] Exercise expense add/edit/delete dry runs and cancel their live
      confirmations, including the no-cycle category explanation,
      onboarding currency, ID-free selector hints, and readable human preview
      targets instead of raw stable IDs.
- [x] Exercise account add/edit/lifecycle/adjustment/transfer dry runs and
      cancel representative live confirmations, including eligibility and
      warning states.
- [x] Reconcile every public function against current manual prompt/preview/read
      evidence, earlier committed development records, and focused automated
      commit tests; do not repeat successful mutations solely to duplicate
      evidence. Archive any disposable accounts created during verification.
- [x] Confirm real-terminal authentication login/status and automated coverage
      for logout, refresh, browser callback, credential removal, and shell
      completion; retain the automated suite as the 40/80/120-column layout gate.
- [x] Inspect loading, delayed-request feedback, typo recovery, no-color output,
      and terminal cleanup.
- [x] Record the supported-runtime manual pass, functional reconciliation,
      targeted retest, and resolution of all blocking findings.

The exact commands, expected behavior, no-write safety boundary, and evidence
record are in
[Spendly CLI Phase 8.10: Manual Interactive Terminal Verification](spendly-cli-phase-8.10.md).

### Phase 8.11: MCP Reuse Readiness

Exit criterion: every CLI read, preview, and commit is called through a typed,
headless operation layer that is also exercised by a non-shipping MCP
`2026-07-28` TypeScript SDK v2 compatibility harness, without changing the
released CLI contract or shipping an MCP server.

- [x] Extract structured operations from Commander, Clack, CLI authentication,
      progress, rendering, and process streams.
- [x] Inject an authenticated backend gateway, optional abort signal, progress
      sink, and adapter-owned invocation origin; keep local-date and
      idempotency-key generation in the invoking adapter.
- [x] Share Zod input/output schemas, domain parsing, and typed errors without
      coupling the core to either the CLI or MCP SDK.
- [x] Keep `cli/v1` backward compatible while extracting backend wrapper logic
      that a future MCP namespace can call without importing CLI-specific code.
- [x] Prove representative paginated read, resource read, mutation preview, and
      commit handlers reuse the exact same operations through an MCP v2
      compatibility harness excluded from the production package.
- [x] Verify MCP JSON Schema 2020-12 structured results, tool-error mapping,
      private financial caching, stdout purity, and practical cancellation.
- [x] Preserve dry-run/commit parity, revisions, idempotency, deletion handles,
      ledger effects, stable IDs, CLI output, and accurate provenance.
- [x] Re-run local CLI/backend/Web integration gates and the affected Phase 8.10
      terminal paths against the current post-refactor checkout; the Phase 9
      publication-candidate freeze remains separate.

The protocol research, reuse audit, target architecture, implementation order,
and verification matrix are recorded in
[Spendly CLI Phase 8.11: MCP Reuse Readiness](spendly-cli-phase-8.11.md).

### Phase 8.12: Raycast Reuse Readiness

Exit criterion: the same headless operation service can be invoked from a
Raycast-owned adapter, with a separate native UI and OAuth boundary, without
adding Raycast code or dependencies to the CLI artifact.

- [x] Review the current Raycast manifest, managed Node/TypeScript runtime,
      native React UI, pagination, OAuth, encrypted storage, Store review, and
      publication model.
- [x] Audit every major CLI layer and identify the operation, schema, gateway,
      cancellation, provenance, UI, authentication, and packaging boundaries.
- [x] Add a trusted `raycast` invocation origin and prove commit decoration does
      not alter preview inputs or couple the core to CLI provenance.
- [x] Map the initial overview, expense, and account commands to native List,
      Detail, Form, ActionPanel, Alert, and Toast surfaces.
- [x] Define a separate Clerk public-client and Raycast PKCE/token-storage
      design; prohibit the CLI loopback callback and native keyring in the
      extension.
- [x] Record the public Store packaging decision gate: publish a versioned
      shared package, generate a hash-verified source snapshot, or prove a
      private-store workspace package. Reject direct `apps/cli` imports,
      `workspace:*` in a public extension, hand-maintained forks, and spawning
      the CLI.
- [x] Keep Raycast dependencies, entrypoints, UI, OAuth, and publication out of
      the initial CLI release.
- [x] Run focused operation tests, CLI typecheck, formatting, and diff checks.

The research, reuse audit, command mapping, authentication design, packaging
gate, and future implementation order are recorded in
[Spendly CLI Phase 8.12: Raycast Reuse Readiness](spendly-cli-phase-8.12.md).

### Phase 9: Packaging and Release

Phase 9 has two explicit gates. Part 1 ends when the unsuffixed `0.1.2` package
is published on `next` from a reproducible, production-only release. Part 2
records the maintainer-approved practical macOS install, authentication,
production-read, and Codex skill scope, with broader validation deferred. npm assigned
`latest` automatically on the initial publication; later releases require
explicit promotion of the validated package.

The Phase 9 source baseline contains the reviewed work from Phases 8.7, 8.8,
8.9, 8.10, 8.11, and 8.12: the guided input layer,
maintainer-verified human CLI UX, the proven headless operation boundary, and
the recorded MCP and Raycast reuse contracts. Phase 9 adds the approved public
package metadata and production identifiers, reruns every affected gate, and
then freezes the immutable publication candidate. The selected source commit,
artifact bytes, and release tag remain immutable. Later source changes require
a new candidate/version for another publication;
post-publication documentation updates do not replace the frozen package.

The detailed operator sequence, including the one-time first-publication
bootstrap and exact npmjs.com settings, is authoritative in the
[Spendly CLI release runbook](spendly-cli-release-runbook.md). No npm version,
dist-tag, package setting, token, GitHub environment, production deployment, or
production test data may be created before the applicable checklist item below
is ready and reviewed.

#### Part 0: Production Configuration and Publication Candidate Freeze

- [ ] Finish any still-unrecorded Phase 8.7 through Phase 8.12 source-handoff
      and human-terminal sign-off. This legacy evidence gap is deferred from the
      maintainer's narrowed initial scope; it is not an unfinished artifact freeze.
      Existing targeted terminal evidence remains in its phase documents.
- [x] Provision the production Clerk OAuth public client and approved Convex,
      Clerk, Web, and documentation endpoints. Compile only public production
      identifiers into the CLI, set `authReady` to `true`, and prove that no
      development selector, endpoint, credential, or secret enters the build.
- [x] Select and approve the public software license, add the root license file
      and npm `license` metadata, remove `private: true`, and make release
      metadata validation reject a private or unlicensed package.
- [x] Put the stable production `/docs/cli` URL and original `0.1.0` preview
      instructions in the npm README, installed CLI help, default-branch skill,
      and public Web documentation.
- [x] Merge and deploy matching `0.1.2` preview instructions across those
      surfaces, then reverify them before the replacement candidate freeze.
- [x] Create `.github/workflows/cli-publish.yml` on the default branch. It must
      use a GitHub-hosted runner, Node.js 24, npm 11.15 or newer,
      `contents: read`, `id-token: write`, and the `cli-release` environment;
      it must download and publish the recorded candidate tarball without
      rebuilding it.
- [x] On GitHub, create the `cli-release` environment before either release
      workflow runs. Restrict deployment to `master` and approved `v*` release
      tags, configure an available trusted reviewer where practical, and keep
      every publish secret scoped to this environment only.
- [x] Run the automated release suite and affected production-configuration,
      manifest, documentation, and workflow gates. Review and merge the release
      commit to `master`, freeze the candidate, and record commit, `0.1.2`, run,
      tarball, `SOURCE_COMMIT`, and SHA-256. Master readiness run `37208727405`
      and candidate run `37208868121` passed for
      `11c239d36b5b5d06bed42ac84e02ad863fe90972`. The candidate freeze is complete;
      it is separate from the remaining human sign-off above.
- [x] Confirm the npm maintainer account has a verified email, account 2FA and
      recoverable second-factor setup, and working interactive access. Record
      only the `npm whoami` username and pass/fail state.

The documentation links, publication workflow, and protected environment are
already in place. Candidate `0.1.0` was frozen successfully in run
[37050681992](https://github.com/akhilesh-dalvi/spendly/actions/runs/37050681992)
at `73b593f7345caaa55399b1f74785b463205709e9`, and `v0.1.0` remains immutable.
It was never published to npm. `master` subsequently advanced and `0.1.1` was
frozen in run [37134077156](https://github.com/akhilesh-dalvi/spendly/actions/runs/37134077156)
at `fd38265ec3d52046b4510adc9deaf887510a9f24`. Its publication failed before
reaching npm because the tarball path lacked `./`. Both tags remain unchanged;
the corrected workflow published `0.1.2` from master commit
`11c239d36b5b5d06bed42ac84e02ad863fe90972` after hosted readiness passed.
[Candidate run 37208868121](https://github.com/akhilesh-dalvi/spendly/actions/runs/37208868121)
froze `v0.1.2`; [publication run 37218324799](https://github.com/akhilesh-dalvi/spendly/actions/runs/37218324799)
published its unchanged tarball. SHA-256:
`1fb9a5be9bf1fed6fa4cef77fdb348d222783f3e64e2c64086e004379a66d3e7`.
Remaining source-handoff sign-off is unverified and deferred from the narrowed
initial scope. Passing hosted checks and publication establish the technical
candidate freeze; they do not supply missing human evidence.

The old artifact passed macOS production authentication, refresh, revocation,
and simulated 30-day expiry checks. The maintainer accepted those results and
waived repeating authentication after review confirmed unchanged runtime logic.
The separate missing-backend-user check, native Linux credential-store proof,
production migrations and smoke evidence remain unverified. The maintainer
confirmed verified npm email and 2FA. Registry integrity, provenance, signatures,
and clean macOS installation passed. Stage-only trusted publishing is configured;
the package requires 2FA without token overrides, the temporary GitHub secret
is gone, and bootstrap-token revocation was independently verified.

Both `next` and `latest` point to `0.1.2`; npm assigned both on the first
publication. The maintainer requested `next` until remaining acceptance is
complete, but removal of `latest` with 2FA returned HTTP 400. See
[npm/cli #8490](https://github.com/npm/cli/issues/8490) and
`docs/features/cli-release.md`. On 2026-10-05 the maintainer chose to proceed
with the practical macOS CLI/skill read smoke below and defer broader validation;
this records a scope decision, not proof that every product workflow passed.
The frozen npm README and help retain preview wording; updated source and Web
docs record the published state without altering the immutable package.

#### Part 1: Package and Release

Publication and packaging are complete for `spendly@0.1.2`. This establishes a
reproducible public package with verified identity, production configuration,
and automated release evidence. It does not close the live production and
user-availability gates in Part 2.

- [x] Verify the frozen public manifest, license, README, repository, homepage,
      bugs URL, keywords, Node engine, publish guardrails, shrinkwrap, and packed
      file allowlist.
- [x] Freeze the reviewed source commit, package version, tarball, SHA-256,
      `SOURCE_COMMIT`, candidate run, matching immutable `v0.1.2` tag, and GitHub
      Release. Verify the registry tarball is byte-identical to that candidate.
- [x] Pass the release CI gates for formatting, linting, explicit
      CLI/backend/Web typechecks, automated tests, production builds,
      documentation validation, dependency audit, and tarball inspection.
- [x] Pass hosted Node.js 22/24 checks on macOS and Linux, including isolated
      tarball installation. These automated Linux results do not establish
      native desktop Secret Service support.
- [x] Verify native macOS Keychain round trip and cleanup with the installed
      candidate. Native Linux storage is a later support gate below.
- [x] Deploy the release-compatible Convex backend and Spendly Web. Prior
      backend deployment/authentication evidence and current production CLI
      reads establish facade access; Web production deployment and post-merge
      readiness passed after [PR #19](https://github.com/akhilesh-dalvi/spendly/pull/19).
      Migration completion, live cron state, and mutation reconciliation remain
      Part 2 gates.
- [x] Verify all eight production CLI docs pages without authentication, all six
      documented redirects, and browser search. Search for
      `KEYCHAIN_UNAVAILABLE` opens Troubleshooting's Sign-in and storage section.
- [x] Verify the published README, installed help, public skill, and Web docs
      retain the correct CLI version, commands, and working public links.
      The immutable npm README/help retain cosmetic pre-publication wording;
      the public docs and default-branch source correct it. Update packaged
      wording in the next planned version rather than rewriting `0.1.2`.
- [x] Verify npm maintainer identity (`akhileshdalvi`), interactive access,
      verified email, 2FA, approved workflow/environment, and publication controls.
- [x] Check the unclaimed package name immediately before bootstrap publication;
      the successful publish subsequently claimed it. This historical check is
      not repeated for an existing package.
- [x] Use the one-day granular bootstrap token only in the protected
      `cli-release` environment for the first publication, with its reviewed
      scope and provenance controls.
- [x] Publish the recorded `spendly-0.1.2.tgz` from the approved GitHub-hosted
      workflow with `--tag next`, public access, and provenance, without
      rebuilding it.
- [x] Verify registry version, dist-tags, integrity, provenance source/workflow/run
      identity, package contents, and `npm audit signatures` (53 signatures and
      46 attestations).
- [x] Configure stage-only trusted publishing for `akhilesh-dalvi/spendly`,
      `cli-publish.yml`, and `cli-release`. Native `npm trust github` creation
      confirmed the exact identity and permission; actual OIDC staging is a
      first-later-release gate, not a result of bootstrap publishing.
- [x] Require publishing 2FA without token overrides, remove the GitHub
      `NPM_TOKEN` secret, revoke `spendly-first-publication`, and independently
      confirm the named npm token is absent. No credential values are recorded.

Verification refresh on 2026-10-05: the registry tarball still matches SHA-256
`1fb9a5be9bf1fed6fa4cef77fdb348d222783f3e64e2c64086e004379a66d3e7`, and
both `next` and `latest` still resolve to `0.1.2`. All public docs pages and
redirects passed; browser search reached the expected section. See the
[release evidence](features/cli-release.md) for prior artifact, authentication,
and publishing-cleanup results.

#### Part 2: User Availability and Default-Channel Promotion

Initial scope: install and use the published CLI on the maintainer's trusted
macOS computer, with accepted authentication evidence and actual Codex skill use
for production reads. On 2026-10-05 the maintainer requested this practical
`$spendly` check and explicitly deferred exhaustive validation, choosing to fix
later findings as they arise. Linux is planned and Windows is unsupported.
This limited acceptance does not establish untested financial mutations,
fresh-user behavior, production administrative state, or Claude Code execution.

- [x] Install the default `spendly` package into a fresh global prefix outside the
      monorepo on macOS with Node.js 24.21.0. Verify `0.1.2`, human and JSON help,
      nested agent-mode help, one JSON error document, and exit code 2 for
      `INVALID_COMMAND`. This is an isolated package install on the existing
      Mac, not a fresh operating-system or account test.
- [x] Accept the maintainer-approved prior production browser login, identity
      matching, refresh, provider revocation, local cleanup, and simulated
      30-day expiry evidence after unchanged authentication runtime review.
      Current installed `0.1.2` authentication status also passed. A real
      30-day wait or duplicate browser login is not required by this release.
- [x] Verify installed `0.1.2` production `auth status`, `context`,
      `accounts list`, `expenses list --limit 1`, and `summary --current` with
      `--agent --json --non-interactive`. All returned successful schema-version
      1 documents; only pass/fail evidence was retained.
- [x] Install the public Spendly skill through the skills installer into clean
      project-scoped Codex and Claude Code layouts. Verify both copies and all
      four references, the pinned published CLI command, and the
      `--agent --json --non-interactive` contract. Installation alone does not
      prove execution by either agent.
- [x] Use the user-selected local `$spendly` skill in this Codex session against
      installed `0.1.2`: authenticate, read context, accounts, cycles, categories,
      tags, account types, current-cycle expenses, expense detail, and summary.
      Select the cycle and expense by IDs from CLI responses. Verify expense
      detail amount/revision matches its list row, current-cycle/category IDs
      agree, and the complete current-cycle expense page matches summary total.
      Missing cycle input returns `NON_INTERACTIVE_INPUT_REQUIRED` with exit 2;
      supplying the current cycle ID succeeds. Empty accounts/tags/account-type
      lists are valid responses. No financial data was changed. This proves
      Codex read-only skill use, not a fresh Claude session or mutation safety.
- [x] Publish and verify the pinned live install/sign-in quick start, platform
      and Node guidance, privacy boundary, troubleshooting, issue/security
      reporting, upgrades, and uninstall instructions. [PR #19](https://github.com/akhilesh-dalvi/spendly/pull/19)
      is deployed; its frozen-package wording limitation is recorded in Part 1.
- [x] Verify the current default npm install selects `0.1.2` and both registry
      tags resolve to that version. An authenticated `latest` removal was
      rejected with HTTP 400. No additional tag mutation or republish is needed
      for this initial version.
- [x] Record the maintainer's decision to proceed with initial macOS availability
      based on these practical checks and defer the broader validation below.
      npm's pre-existing `latest` tag is registry state, not the evidence for
      this acceptance decision. No bug was found in the exercised read scope.

**Deferred validation:** the maintainer chose not to block initial macOS
availability on these exercises. Keep them visibly unverified for later work;
do not treat the scope decision as a passing result.

- [ ] Verify live `ACCOUNT_SETUP_REQUIRED` with a different identity that has
      never completed Spendly Web setup. The maintainer currently has only the
      existing account available.
- [ ] Verify all three production revision/search migrations to final
      `isDone: true`, retaining only aggregate completion evidence, and the
      live hourly `clean expired CLI capabilities` cron. Source configuration
      and working read endpoints do not prove these states. This defers evidence
      collection; it does not establish that migration work is unnecessary.
- [ ] Use a dedicated synthetic release account for representative expense and
      account mutations, balance adjustment, and same-currency transfer.
      Reconcile balances, ledger entries, and direct-CLI versus AI-agent
      provenance in Spendly Web; preview destructive/balance-affecting actions
      and remove or archive only the synthetic test records as documented.
      Account detail/ledger reads were not exercised because the signed-in
      account returned no active accounts.
- [ ] Observe mutation previews through the skill and a fresh Claude Code
      session using the public skill. Full committed mutation matrices need not
      be repeated through both agents; the preceding CLI/Web reconciliation
      exercise covers committed behavior.

Triage later findings and rerun affected checks. A runtime fix requires a higher
immutable `0.x` candidate; do not rewrite `0.1.2` or repeat unchanged full suites
solely to fill checklist boxes. Native Linux testing is deferred to the Linux
support gate under Later Phases. Hosted Linux CI remains required automated
evidence and does not prove native desktop Secret Service support.

#### Later `0.x` Publications

These are recurring release procedures, not unfinished publications required
for `0.1.2` acceptance. Do not create a dummy version solely to test them.

- [x] Implement candidate hashing/tagging, unchanged-artifact publication,
      protected GitHub environment approval, and stage-only OIDC configuration.
      Automated artifact, source-drift, tag, and publication-mode guard tests
      passed. The bootstrap publish does not prove the OIDC path end to end.
- [ ] On the next actual `0.x` release, prove OIDC staging from
      `cli-publish.yml` without `NPM_TOKEN`, inspect the staged bytes and scan
      state, approve with maintainer 2FA, and verify registry identity and clean
      installation. Retain this one live validation gate until that run succeeds.

For each later release:

1. Choose `0.1.x` for compatible fixes and a later `0.x` minor for substantial
   features or contract changes. Update package and shrinkwrap versions
   together, carry the corrected README/help wording into the next planned
   package, and review affected contracts and docs.
2. Pass affected checks and freeze one candidate from reviewed `master`, with
   matching version, source commit, SHA-256, `v<VERSION>` tag, and GitHub Release.
   Every published version and existing tag remains immutable.
3. Publish through `cli-publish.yml` with `bootstrap=false` and stage-only OIDC:
   `npm stage publish --tag next` for the recorded tarball. Do not restore an npm
   write token. Inspect contents and malware-scan state before maintainer 2FA
   approval; verify provenance, signatures, bytes, and affected user workflows.
4. After acceptance, promote that exact version to `latest` through the
   interactively authenticated maintainer path configured by the runbook, then
   verify the default installation and tags. The current stage-only trusted
   publisher has no dist-tag permission.

### Later Phases

- [ ] Before advertising Linux support, verify native Secret Service round trip
      and cleanup, browser login/refresh/logout, and clean-user packaged
      installation on the selected Linux distribution/runtime matrix. Hosted
      Linux CI alone does not close this support gate.
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
- [ ] Implement and release the MCP server from the Phase 8.11 shared operation
      boundary and the then-current MCP specification.
- [ ] Implement and release the Spendly Raycast extension from the Phase 8.12
      boundary, beginning with a read-only native prototype and separate Clerk
      public-client proof.
- [ ] Design a product-wide trash system only if both Web and CLI adopt it.

## 22. Initial Release Acceptance Criteria

The criteria below define the complete product contract. Phase 9 Parts 1 and 2
record audited evidence, the maintainer-approved practical initial scope, and
deferred validation. Unchecked criteria are not all current initial-release
blockers; the scope decision does not mark untested behavior as passing. Do not
repeat accepted checks solely because they also appear here. Initial platform
acceptance is macOS-only; native Linux proof is a later support gate.

- [ ] A source checkout authenticates against Clerk and Convex development
      without weakening issuer or audience checks.
- [ ] A user who has opened Spendly Web can install the package and complete
      production browser login without copying a secret.
- [ ] A missing Spendly backend user receives `ACCOUNT_SETUP_REQUIRED`.
- [ ] Humans receive readable output by default; JSON requires `--json`.
- [ ] Humans can use guided stable-ID selects, tag and field multiselects,
      validated text/date inputs, and preview-backed confirmations for every
      applicable command without removing the equivalent explicit flags.
- [ ] Human help exposes both guided and flag-based paths, and guided prompts
      make focus, selection, progress, loading, cancellation, and review/edit
      state understandable without relying on color.
- [ ] Human lists remain readable at supported terminal widths and visibly
      report active filters, result counts, continuation state, and contextual
      empty states.
- [ ] Human mutation output clearly separates preview from commit, emphasizes
      changed fields and balance effects, and renders warnings, success, stable
      error codes, and safe recovery actions consistently.
- [ ] JSON, `--non-interactive`, `--agent`, piped, and non-TTY execution never
      renders or waits on an interactive prompt.
- [ ] JSON stdout contains exactly one parseable versioned document.
- [ ] Agents use `--agent --json --non-interactive` and stable IDs.
- [ ] Agent mutations also use `--agent`; direct CLI and AI-agent commits show
      distinct accessible provenance indicators in Spendly Web.
- [ ] Omitted dates resolve to the computer's local date and report timezone.
- [ ] Category inference occurs only under the approved history rule.
- [ ] Tags are never inferred or created.
- [ ] An agent can list, get, add, edit, and permanently delete one expense.
- [ ] An agent can list and inspect accounts, account transactions, and account
      types.
- [ ] An agent can add, edit, archive, reactivate, and make an account
      default without mutating account types or deleting history.
- [ ] Balance adjustment records only the difference between cached and desired
      balances; same-currency transfer updates both accounts atomically.
- [ ] Account-backed expense add, edit, move, clear, and delete keep cached
      balances and ledger history synchronized.
- [ ] Archived accounts remain readable but reject new expenses, adjustments,
      and transfers.
- [ ] Dry run and commit share normalization and validation.
- [ ] Reusing an idempotency key cannot create a duplicate within 30 days.
- [ ] A stale edit or delete cannot overwrite a newer revision.
- [ ] A non-interactive delete cannot commit without a valid short-lived token.
- [ ] Cross-user IDs cannot be read or mutated.
- [ ] Mutation transport failures are not automatically retried.
- [ ] Logout removes local access and attempts provider revocation.
- [ ] The npm tarball exposes production only and contains no secrets or
      development configuration.
- [x] The package installs and runs outside the monorepo on macOS; isolated
      registry installation and hosted Node.js 22/24 checks passed. Native
      Linux acceptance is deferred until Linux support is advertised.
- [ ] `/docs/cli` is public, searchable, responsive, and accessible without a
      Spendly account.
- [ ] Public command examples and flags pass automated checks against the
      production CLI build and contain only synthetic data.
- [ ] The npm package, CLI help, and Spendly skill link to the stable CLI
      documentation URL.
- [ ] Every CLI read, preview, and commit uses the typed headless operation
      boundary proven by the non-shipping MCP v2 compatibility harness.
- [ ] The MCP compatibility harness and SDK remain outside the production CLI
      tarball and dependency graph, while affected Phase 8.10 checks pass after
      the extraction.

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
- The eventual local STDIO versus remote Streamable HTTP MCP deployment model,
  authorization scopes, and MCP-specific provenance presentation.

Any discovery that requires weakening the approved authentication, ownership,
idempotency, revision, deletion, privacy, or environment boundaries requires a
new product decision.

## 24. Risks and Mitigations

| Risk                                             | Impact                                             | Mitigation                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| OAuth token audience is incompatible with Convex | CLI cannot authenticate safely                     | Make the real development proof a merge gate; never weaken audience checks                                 |
| Agent retry creates a duplicate                  | Incorrect financial history                        | Require server idempotency and explicit same-key retry                                                     |
| Web edit races with an agent                     | Newer data is overwritten                          | Increment and require expense revisions across Web and CLI                                                 |
| Deletion targets stale data                      | Permanent data loss                                | Require a five-minute single-use token bound to ID and revision                                            |
| Duplicate names resolve incorrectly              | Misclassified expense                              | Require IDs for agents and one exact scoped match for humans                                               |
| Machine timezone differs from user intent        | Wrong date or cycle                                | Report local timezone and stop when wording or detection is uncertain                                      |
| Currency is interpreted as conversion            | Historical values appear incorrect                 | Mirror Web's user-level display model and never convert                                                    |
| Expense or adjustment bypasses the ledger        | Cached balance and history diverge                 | Share ledger helpers across Web and CLI and test cached-balance parity                                     |
| Transfer targets the wrong or stale account      | Two balances are corrupted                         | Require IDs for agents, dry run, idempotency, and both account revisions                                   |
| Archived account receives new activity           | Closed financial history changes unexpectedly      | Reject new expense assignment, adjustment, and transfer server-side                                        |
| Tokens leak through files or output              | Account compromise                                 | Use keychain, explicit secure fallback, redaction, and leakage tests                                       |
| Published package reaches development            | Data or auth isolation failure                     | Bake production configuration into releases and keep dev source-only                                       |
| Skill and CLI contracts drift                    | Agent performs unsafe or invalid calls             | Version JSON, release together, and run Codex/Claude evaluations                                           |
| Public CLI documentation drifts from the binary  | Users run invalid or unsafe commands               | Validate documented commands against the production CLI build in CI                                        |
| Documentation exposes private configuration      | Credentials or internal endpoints leak             | Use synthetic fixtures and scan generated output before deployment                                         |
| A prompt selects the wrong financial resource    | Expense or account history is changed incorrectly  | Submit stable IDs, show disambiguating context, preview mutations, and never auto-select ambiguous targets |
| Interactive prompts break scripts or JSON output | Automation hangs or stdout becomes unparsable      | Gate on explicit human TTY eligibility and prove machine modes never prompt                                |
| CLI orchestration cannot be reused by MCP        | Future MCP work duplicates safety logic and drifts | Extract a typed headless operation layer and prove it with a non-shipping MCP v2 harness before release    |

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
- [Clack prompts](https://bomb.sh/docs/clack/packages/prompts/)
- [MCP `2026-07-28` specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP `2026-07-28` changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Spendly repository README](../README.md)
- [Spendly backend documentation](../packages/backend/convex/README.md)
