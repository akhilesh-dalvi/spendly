# Spendly CLI Phase 0: Decisions and Technical Spikes

## Status

- Phase: Complete for the current macOS scope; Linux validation deferred
- Last updated: 2026-08-30
- Branch: `feature/spendly-cli`
- Package: `spendly`
- Binary: `spendly`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

## 1. Phase 0 Exit Criterion

Phase 0 is complete when:

1. The approved product and security decisions are documented.
2. A source-built CLI completes Clerk login against the development instance.
3. The resulting token authenticates `ConvexHttpClient` against the development
   deployment without weakening issuer or audience checks.
4. Convex resolves the same Spendly user as the Web application.
5. Refresh, 30-day authorization enforcement, logout revocation, and credential
   removal are proven.
6. The selected credential-store library passes a focused security review and
   its native macOS canary succeeds. Linux validation is a later release gate.

No CLI code should be merged or published until the technical proof passes.

## 2. Approved Product Decisions

### 2.1 Audience and Scope

- Version 1 is local-agent-first and remains usable by humans.
- Official agent support: Codex and Claude Code.
- Version 1 provides full CRUD for individual expenses.
- Bulk mutations are excluded.
- Accounts can be listed, inspected, created, edited, archived, reactivated,
  made default, reconciled through balance adjustments, and used in transfers.
- Account activity and account types are read-only; permanent account deletion
  and direct ledger editing are excluded.
- Expenses can be assigned to an active account, moved between accounts, or
  explicitly left unassigned. Account-backed expense mutations must preserve
  the balance ledger.
- Cycles, categories, category types, tags, and summaries are read-only.
- Hosted agents, CI agents, third-party delegated clients, and MCP are deferred.
- A user must have opened Spendly Web at least once. Otherwise the CLI returns
  `ACCOUNT_SETUP_REQUIRED` and does not create onboarding data.

### 2.2 Platforms and Toolchain

- Node.js 20 or newer.
- macOS is verified for Phase 0.
- Linux remains a version 1 target, but its native credential-store and package
  validation are deferred and must pass before Linux support is claimed.
- Windows deferred.
- Commander 14.
- TypeScript compiled to Node.js ESM with `tsc`.
- Vitest in its Node environment.
- Existing pnpm workspace and Ultracite/Biome standards.

### 2.3 Package and Release

- Unscoped npm package: `spendly`.
- Executable: `spendly`.
- Do not use `@spendly/cli`; the project does not control the `@spendly` scope.
- No npm organization is required.
- First release: `spendly@0.1.0` with npm tag `next`.
- Stable target: `spendly@1.0.0` with npm tag `latest`.
- No production beta allowlist is needed because there are currently almost no
  users.

### 2.4 Agent Skill Distribution

- Store one portable skill at `skills/spendly/SKILL.md`.
- Distribute it from the public `akhilesh-dalvi/spendly` GitHub repository
  through skills.sh.
- Do not implement custom `spendly skill install` commands.
- Test the skill with Codex and Claude Code.

Install command:

```bash
npx skills add akhilesh-dalvi/spendly \
  --skill spendly \
  --global \
  --agent codex \
  --agent claude-code
```

The skills CLI has anonymous installation telemetry enabled by default. Users
may set `DISABLE_TELEMETRY=1` when installing.

## 3. Approved Authentication Decisions

### 3.1 Browser Login

- Public Clerk OAuth application.
- Authorization Code with PKCE S256.
- One-shot callback on `127.0.0.1` using a random port.
- System browser by default; print a same-machine URL if opening fails.
- Five-minute callback timeout.
- Validate OAuth state, PKCE, redirect URI, issuer, audience, subject, and
  expiry.
- Keep the Clerk consent screen enabled.
- No device flow, pasted tokens, client secrets, deploy keys, or headless login
  in version 1.

### 3.2 Authorization Lifetime

- Authorization expires 30 days after browser login.
- Refresh automatically inside the 30-day window.
- Require browser reauthentication after 30 days.
- Namespace credentials by issuer and OAuth client ID.

### 3.3 Credential Storage

- Use the OS keychain first.
- Plain file fallback is never automatic.
- Require explicit opt-in such as `--allow-file-storage`.
- Display the path and a warning.
- Enforce owner-only permissions or fail.
- Apply the same 30-day lifetime to fallback credentials.

The selected library is `@napi-rs/keyring@1.3.0`:

- It is a native Node binding to Rust `keyring`, with packaged macOS and Linux
  targets and no runtime JavaScript dependency chain beyond the matching native
  binary package.
- Spendly never silently falls back when the native store is unavailable.
- The explicit file fallback uses a `0700` directory, a `0600` file, an atomic
  replacement, and a warning that includes the path.
- Credential account names are SHA-256 namespaces of the exact issuer and OAuth
  client ID, so development and production cannot collide.
- A native macOS write/read/constant-time-compare/delete canary passed.
- The equivalent Linux Secret Service canary is deferred to pre-release
  platform validation and is not part of the current Phase 0 exit gate.

### 3.4 Logout

- Revoke the CLI refresh token when possible.
- Always remove local credentials.
- Warn if remote revocation cannot be confirmed.
- Affect only the current CLI installation.
- Do not log out Web or other computers.

### 3.5 Environment Isolation

- Published npm packages expose production only.
- Normal users receive no environment profiles or selectors.
- A source checkout uses ignored development configuration for local testing.
- Development and production credentials are separately namespaced.
- A full development environment verification is mandatory before merge and
  publish.

## 4. Authentication Compatibility Finding

### 4.1 Existing Convex Contract

The current Convex auth configuration accepts a Clerk OIDC token whose issuer
matches `CLERK_JWT_ISSUER_DOMAIN` and whose audience matches the configured
`applicationID`.

The Web provider currently uses `applicationID: "convex"`.

### 4.2 Clerk Capability

The configured Clerk instance's public metadata supports:

- Authorization-code grant.
- Refresh-token grant.
- Public OAuth clients.
- PKCE S256.
- `openid` and `offline_access`.
- RS256-signed ID tokens.
- Subject and audience claims.

At the time of investigation, the Clerk instance contained no OAuth
applications.

### 4.3 Direct Convex Decision

Direct `ConvexHttpClient` access is approved through a dedicated, versioned
`cli/v1` facade. The CLI must not use existing Web mutations as its stable
public contract.

The live Clerk ID token uses the OAuth client ID as its audience, represented as
a standards-valid one-item `aud` array. Convex's OIDC provider path rejected
that representation. The CLI provider therefore uses Convex's official
`customJwt` provider mode with all checks retained:

- `applicationID` is the exact development CLI OAuth client ID;
- `issuer` is the exact Clerk issuer;
- `jwks` is the issuer's `/.well-known/jwks.json` endpoint; and
- `algorithm` is restricted to `RS256`.

The Web provider remains unchanged with `applicationID: "convex"`. This is not
an audience-validation bypass: Convex still requires the CLI client ID in the
token's `aud` claim.

If direct authentication fails, do not weaken issuer or audience validation.
Return to product review before adding a token exchange or API boundary.

## 5. Authentication Proof Procedure

This spike changes external development configuration and requires explicit
authorization when executed.

1. Create a development Clerk OAuth application named `Spendly CLI`.
2. Make it a public client and require PKCE.
3. Register `http://127.0.0.1/callback`; use a random runtime port.
4. Request the minimum required OIDC and refresh scopes.
5. Add the OAuth client ID as a second provider in development Convex auth.
6. Implement a minimal loopback login proof.
7. Validate the ID token locally.
8. Authenticate `ConvexHttpClient`.
9. Call the minimum development query needed to resolve the Spendly user.
10. Verify the subject equals the Clerk user ID used by Web.
11. Refresh the token and repeat the query.
12. Attempt revocation, remove local test credentials, and verify access stops.

Success requires:

- No embedded or locally pasted secret.
- Exact issuer and audience validation.
- Correct Spendly user resolution.
- Working refresh inside the approved window.
- Local credential removal and attempted provider revocation.
- No token material in output or logs.

### 5.1 Executed Proof and Evidence

The development proof ran on 2026-08-25 and was revalidated after the master
sync on 2026-08-30 against the Clerk development instance and Convex development
deployment:

- Created the public `Spendly CLI` OAuth application with PKCE, consent, the
  `openid profile email offline_access` scopes, and the loopback callback.
- Deployed the Web provider plus the strict CLI `customJwt` provider and the
  read-only `cli/v1/auth:identity` query.
- The original proof used a temporary copy of the accounts backend because the
  feature worktree initially predated those schema changes. The branch was
  synchronized with `origin/master` at `d897bcb` on 2026-08-30, so the current
  worktree now contains the accounts schema.
- A later development deployment temporarily replaced the CLI auth provider and
  caused `Convex rejected the authenticated identity proof`. Deploying the
  current merged branch with `convex dev --once` restored the strict provider.
  Two subsequent login, status, and forced-refresh sequences resolved the same
  Clerk subject and Spendly backend user. The final post-merge logout returned
  `remoteRevocation: "confirmed"` and `localCredentialsRemoved: true`.
- Completed Google sign-in, Clerk consent, authorization-code exchange, local
  ID-token validation, and the random-port loopback callback.
- `auth status` returned `authenticated: true` and
  `subjectMatchesBackendUser: true` for the existing Web-created user.
- `auth refresh-test` forced a real refresh-token exchange and returned
  `refreshConfirmed: true` with the same Convex identity.
- `auth logout` returned `remoteRevocation: "confirmed"` and
  `localCredentialsRemoved: true`.
- A post-logout `auth status` returned `AUTHENTICATION_REQUIRED` with exit code
  `3`.
- The macOS native keychain canary returned `roundTrip: true` and
  `cleanup: true`.
- Unit tests prove the exact 30-day boundary, callback timeout/state handling,
  PKCE, credential namespace and permissions, and secret redaction. All 12 tests
  pass.
- CLI typecheck, build, focused Biome checks, backend typecheck, and the
  development Convex deployment pass.
- A production dependency audit found no known advisory affecting the CLI's
  dependency path. Existing Web-workspace advisories remain outside this spike.

No token, authorization code, PKCE verifier, refresh credential, or Clerk
secret is recorded in this document or normal command output.

### 5.2 Deferred Linux Validation (Not a Phase 0 Gate)

Before claiming Linux support, run this from the repository in a Linux desktop
session with an unlocked Secret Service implementation (for example GNOME
Keyring):

```bash
pnpm install
pnpm --dir apps/cli build
node apps/cli/dist/index.js --json auth keychain-test
```

Expected result:

```json
{
  "schemaVersion": 1,
  "data": {
    "cleanup": true,
    "platform": "linux",
    "roundTrip": true
  },
  "meta": {}
}
```

Headless containers without a user D-Bus session do not constitute this test.
This must pass before Linux is advertised as supported, but it does not block
completion of the current macOS-scoped Phase 0.

## 6. Approved CLI Contract

### 6.1 Output Modes

- Human-readable output is always the default.
- JSON requires explicit `--json`.
- Agents use `--json --non-interactive`.
- Do not infer machine mode from TTY state.
- JSON stdout contains exactly one document.
- Redacted debug diagnostics may use stderr only with `--debug`.

Success:

```json
{
  "schemaVersion": 1,
  "data": {},
  "meta": {}
}
```

Failure:

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

### 6.2 Exit Codes

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

### 6.3 Preview and Mutation Authority

- Use the real mutation command with `--dry-run`; do not create separate
  preview commands.
- A clear user instruction authorizes one create or update.
- The skill performs a server-backed dry run internally, commits, and reports.
- Stop for ambiguity, unexpected normalization, bulk intent, or deletion.
- Expense deletion always requires a separate explicit confirmation flow.

## 7. Approved Mutation-Safety Decisions

### 7.1 Idempotency

- Human interactive mutations generate a key automatically.
- Non-interactive mutations require a stable caller-supplied key.
- Never derive the key from financial content.
- Keep records for 30 days.
- Same key and request return the original result.
- Same key with different input return a conflict.
- Idempotency is correctness storage, not an audit system.

### 7.2 Revisions

- Add an expense revision.
- Every Web and CLI update increments it.
- Update and delete require the expected revision.
- Stale operations fail without writing.
- The CLI facade must also expose account revisions for account edits, archive
  state, balance adjustments, defaults, and transfers. A transfer preview is
  bound to both account revisions.

### 7.3 Deletion

- Delete dry run returns the exact resource, revision, and confirmation token.
- Token lifetime: five minutes.
- Token is single-use and bound to user, configured deployment, expense ID, and
  revision. The configured deployment is production in the published package.
- A changed expense invalidates the token.
- Deletion is permanent in version 1; there is no trash or restore command.

### 7.4 Retries

- Read-only commands may retry temporary failures up to three times.
- `--no-retry` disables read retries.
- The CLI does not automatically retry mutations.
- For an uncertain mutation result, return a retryable error and let the caller
  explicitly repeat the command with the same idempotency key.
- Include `retryAfterMs` only when the backend supplies it.

## 8. Approved Financial Domain Decisions

### 8.1 Amount and Currency

- Match Web's JavaScript-number storage in version 1.
- Accept ordinary base-10 decimal input of at least `0.01`.
- Reject zero, negatives, non-finite values, and scientific notation.
- Do not enforce two fractional digits.
- Currency is the user's current Web preference; expenses have no currency
  field.
- Web may change currency at any time without conversion.
- CLI reads and displays currency but cannot change it.

### 8.2 Date and Timezone

- Omitted date means the computer's current local calendar date.
- Report date, `dateSource`, and detected IANA timezone.
- Require an explicit date if timezone detection fails.
- Hosted-agent timezone handling is deferred until the user model stores an
  IANA timezone.

### 8.3 Cycles

- Canonical interval: `startDate <= date < endDate`.
- JSON uses `endDateExclusive`.
- Expenses outside cycles remain valid.
- Categories must belong to the expense date's cycle.
- Inclusive Web comparisons on `endDate` are existing bugs to fix separately.

### 8.4 Categories

- Non-interactive agents use IDs.
- Humans may use a trimmed, case-insensitive exact name only when one match
  exists.
- Never fuzzy-match or choose the first candidate.
- Omitted category may be inferred only when:
  - `spentOn` exists;
  - at least three exact normalized matches exist in the previous 12 months;
  - the three newest matches use the same category name; and
  - exactly one visible same-name category exists in the resolved cycle.
- Otherwise save the expense uncategorized and report it.
- Never infer from general-world knowledge.

### 8.5 Tags

- Never infer or create tags.
- Non-interactive agents use IDs.
- Humans may use one exact unique name.
- Omitted tags mean none on create and unchanged on update.

### 8.6 Updates

- Omitted fields remain unchanged.
- Use `--clear-category`, `--clear-account`, `--clear-spent-on`, and
  `--clear-tags` for explicit removal.
- Reject empty strings as implicit clearing.
- Fail rather than automatically remapping a category when a changed date moves
  the expense to another cycle.

### 8.7 Listing

- Default 50, maximum 100.
- Opaque cursor pagination.
- Sort by date descending, creation time descending, then ID.
- Filters: cycle ID, category ID, uncategorized, account ID, unassigned account,
  repeatable tag IDs, inclusive `--from`, and inclusive `--to`.
- Multiple tags require all selected tags.
- Text search is deferred until indexed pagination exists.

### 8.8 Accounts and Ledger Behavior

- Account types are user-owned records. New users receive editable Cash,
  Checking, Savings, Credit Card, Wallet, and Other types.
- Account creation requires a non-empty name, an active account type, and a
  finite opening balance. New accounts inherit the user's currency.
- The first account becomes the user's default account. Archiving the default
  account clears that preference.
- Starting balance is an immutable snapshot. Current balance is a cached value
  maintained by append-only opening, expense, adjustment, and transfer ledger
  entries.
- Balance adjustment accepts the desired absolute balance and records only the
  difference as a manual adjustment. Zero and negative balances are valid.
- Transfers require different active accounts, a positive finite amount, and
  matching currencies. They atomically append transfer-out and transfer-in
  entries and do not affect expense-cycle spending.
- New expenses may use only active accounts. Updating or deleting an expense
  reverses its previous account effect before applying the new one; historical
  expenses may remain linked to archived accounts.
- Account names need not be unique. Non-interactive agents use IDs; humans may
  use an exact name only when it resolves to one account.
- Archive and reactivate preserve history. Version 1 has no permanent account
  delete, transfer edit/delete, or direct ledger-entry mutation command.

## 9. Observability Decision

Do not build a persistent mutation audit table in version 1. Remove claims that
the release provides a durable audit trail.

Sentry and PostHog may be added later. Their future design must not send expense
amounts, descriptions, tokens, authorization headers, or other financial
payloads. Provider observability does not replace idempotency or authorization.

## 10. Threat Model

### 10.1 Protected Assets

- Expense, account, balance, transfer, and planning data.
- Clerk access, ID, and refresh tokens.
- Spendly user identity.
- Integrity of idempotency, revision, and deletion-confirmation records.

### 10.2 Primary Threats

- A local process reads stored credentials.
- Secrets appear in output, errors, package files, or agent transcripts.
- An authorization code is intercepted or a callback is forged.
- A token for another issuer or audience is accepted.
- A retry creates a duplicate expense.
- A stale agent overwrites a newer Web edit.
- An ambiguous selector misclassifies an expense.
- An ambiguous account selector charges the wrong balance.
- A stale preview applies an unexpected balance adjustment or transfer.
- An agent permanently deletes the wrong expense.
- A cross-user ID leaks or mutates another user's data.
- Development configuration reaches the public package.
- A compromised dependency or skill exfiltrates credentials.

### 10.3 Required Mitigations

- PKCE S256, OAuth state, nonce, exact redirect validation, and loopback-only
  callback.
- Exact issuer and audience validation.
- OS keychain with explicit restrictive file fallback.
- Backend ownership enforcement.
- Thirty-day idempotency records.
- Expense and account revisions across Web and CLI.
- Five-minute, single-use deletion confirmation.
- Atomic ledger-backed expense, adjustment, and transfer mutations.
- Production-only published configuration.
- Locked dependencies, package inspection, provenance, and agent-skill review.

## 11. Phase 0 Checklist

### Completed Decisions

- [x] Confirm package name and registry availability.
- [x] Confirm runtime, supported platforms, toolchain, and package layout.
- [x] Confirm local-agent and human audiences.
- [x] Confirm full individual-expense CRUD and no bulk mutations.
- [x] Document account management, ledger reads, expense assignment, balance
      adjustment, and transfer scope after the accounts backend merge.
- [x] Document account types as read-only and account deletion as excluded from
      version 1.
- [x] Confirm browser PKCE login and five-minute random loopback callback.
- [x] Confirm 30-day authorization and logout scope.
- [x] Confirm keychain-first and explicit secure file fallback.
- [x] Confirm production-only publication and source-only development testing.
- [x] Confirm dedicated direct-Convex `cli/v1` facade.
- [x] Confirm JSON envelope, exit codes, and output-mode behavior.
- [x] Confirm dry-run, idempotency, revisions, deletion token, and retry policy.
- [x] Confirm currency, amount, date, cycle, selector, category, and tag rules.
- [x] Confirm no persistent audit table in version 1.
- [x] Confirm Codex and Claude Code skill distribution through skills.sh.
- [x] Confirm npm `next` beta followed by `latest` stable.
- [x] Confirm no production beta allowlist.
- [x] Confirm Web-first backend-user setup.

### Technical Proof

- [x] Create the development Clerk OAuth application.
- [x] Add the matching strict development Convex auth provider.
- [x] Build and execute the minimal browser login proof.
- [x] Verify `ConvexHttpClient` authentication and Spendly user identity.
- [x] Verify a forced refresh and repeat the identity proof.
- [x] Verify remote logout revocation and local credential removal.
- [x] Select `@napi-rs/keyring` and test the native store on macOS.
- [x] Defer the native Linux Secret Service canary to pre-release platform
      validation; do not claim Linux support until it passes.
- [x] Verify no secret material enters normal output or logs.
- [x] Complete the focused authentication and credential-storage security
      review.

## 12. References

- [npm scopes](https://docs.npmjs.com/using-npm/scope.html/)
- [Commander releases](https://github.com/tj/commander.js/releases)
- [Clerk: Adding authentication to a CLI](https://clerk.com/blog/adding-clerk-auth-to-your-cli)
- [Clerk OAuth implementation](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [Convex custom OIDC providers](https://docs.convex.dev/auth/advanced/custom-auth)
- [Convex custom JWT providers](https://docs.convex.dev/auth/advanced/custom-jwt)
- [Convex `ConvexHttpClient`](https://docs.convex.dev/api/classes/browser.ConvexHttpClient.html)
- [Convex error handling](https://docs.convex.dev/functions/error-handling/)
- [skills.sh CLI reference](https://www.skills.sh/docs/cli)
- [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
