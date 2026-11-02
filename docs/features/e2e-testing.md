# Web and CLI E2E testing

**Status:** in progress. Runner configurations, fail-closed safety guards,
fixtures, Web/CLI journeys and trusted live CI integration are implemented in
`packages/e2e`. Sequential `smoke` and `full` launchers validate, check offline
tooling, deploy this checkout to the dedicated development backend, build the
CLI once, then run Web/cross-surface and CLI as sibling runners. Smoke selects
`@smoke` critical paths on Chromium; full runs every journey in the suite and
optional `@compatibility` browser projects.

Runner and discovery tests verify tier selection. Live execution uses a dedicated
Clerk/Convex development environment. CI runs use the protected GitHub `e2e`
environment. See `CONTRIBUTING.md` for commands and setup. Executable specs define
the implemented journey coverage.

This is temporary implementation guidance, not a second backlog. Track future
implementation in GitHub only when authorized. Delete this file when the feature
ships; move enduring contributor instructions into `CONTRIBUTING.md` and keep
coverage requirements in executable tests.

## Goal and scope

Verify representative user journeys through the running Web app and the actual
CLI process, including authentication and persisted financial state. Keep existing
unit and backend tests for exhaustive domain rules; browser/process E2E tests
should prove that the layers work together, not duplicate every unit case.

In scope: current Web and CLI surfaces, a dedicated Clerk development instance,
a dedicated Convex test deployment, and a small cross-surface suite.

Out of scope: native mobile, production mutation tests, paid testing platforms,
AI judgments as correctness gates, and broad visual snapshot coverage.

## Tools

| Surface | Primary tools | Purpose |
| --- | --- | --- |
| Web | Playwright Test + `@clerk/testing` | Browser journeys, isolated sessions, exact assertions and failure traces |
| CLI | Existing Vitest + Node `child_process.spawn()` | Execute built CLI in separate processes; inspect stdout, stderr, exit status and persisted results |
| CLI interactive mode | POSIX/Python PTY bridge | Real TTY prompts, arrow keys, cancellation and terminal rendering |
| Cross-surface and CLI OAuth | Playwright Test + subprocess helper | Drive the browser while controlling the CLI process |

Playwright is preferred for mature Chromium/Firefox/WebKit coverage, official
Clerk helpers, TypeScript fixtures and debugging evidence. Vitest already exists
in Spendly, so no dedicated CLI framework is needed. Deterministic runs need no
AI subscription. Local runners are free; CI compute, Clerk and Convex usage remain
subject to their own limits.

TesterArmy `e2e` can be evaluated separately for exploration later. It is not a
prerequisite or replacement for exact financial assertions.

## Current baseline

- Web is Next.js with Clerk authentication and Convex persistence. Local Web dev
  uses port 3001; do not assume the production start command uses that port.
- CLI tests already use Vitest, including in-process command, auth and output tests.
- [`verify-package.mjs`](../../apps/cli/scripts/verify-package.mjs) already packs
  and installs the production CLI outside the repository, checking package
  contents, executable installation, help, version, JSON and exit codes.
- [`cli-ci.yml`](../../.github/workflows/cli-ci.yml) runs existing checks and a
  Linux/macOS, Node 22/24 CLI matrix. Its synthetic Clerk/Convex settings cannot
  authenticate against a live deployment.
- The source-only [`development entry`](../../apps/cli/development/index.ts)
  accepts development configuration. The packed production CLI is bound to
  production configuration; do not use it for live mutation tests.

## Shared environment and isolation

1. Configure Web and the development CLI against the **same dedicated test**
   Clerk instance and Convex deployment. Verify Convex accepts the intended Clerk
   issuer and approved CLI OAuth client.
2. Keep credentials in ignored environment files or CI secrets. Use the existing
   [Web environment example](../../apps/web/.env.example) and
   [CLI development example](../../apps/cli/.env.local.example); do not invent a
   shared production environment file.
3. Fail closed before authentication, seeding or mutations if the target is not
   the explicitly approved test deployment/issuer. Do not default to production.
4. Use synthetic identities and financial data. Give each run/worker its own
   records and, where practical, user identity. Reserve fresh users for onboarding.
   Names alone do not isolate default accounts, currency or onboarding state.
5. Seed currency, account types, accounts, cycles, categories and tags through
   authenticated existing operations or narrowly scoped test-deployment tooling.
   Never ship a public reset endpoint or authentication bypass. Setup/cleanup may
   use privileged tooling, but assertions about user access must not.
6. Use explicit cycle dates, amounts and timezone. Include separate date-boundary
   tests instead of relying on today's date. Fix UI clock where needed without
   changing real OAuth token-validation time.
7. Await confirmed persistence and reactive UI updates. Use retrying assertions or
   bounded polling, not arbitrary sleeps. Do not rely on `networkidle` for Convex's
   long-lived connections.
8. Clean up in `finally`/fixture teardown. Handle canceled jobs with scoped stale
   fixture cleanup. Never remove records belonging to another run or real user.
9. Start serially for shared identity/keychain journeys; parallelize only after
   fixture and credential isolation are proven.

### Authentication and credentials

**Web:** use Clerk's project-based setup and testing-token helpers to bypass bot
protection in the development instance. Keep one real sign-in/sign-out journey;
reuse setup authentication state for unrelated tests. Use separate browser
contexts for different users and treat saved auth state as a secret. A testing
token is not a user session and is not the CLI's OAuth token.

**CLI:** test the actual PKCE flow at least once:

1. Start the development CLI with `auth login --no-browser` (without `--json` or
   `--non-interactive`).
2. Collect its same-machine authorization URL using the stream emitted by the
   current implementation; consume output incrementally while the process waits.
3. Open the URL using Playwright, authenticate the dedicated test user and allow
   the real localhost callback and token exchange to complete.
4. Verify CLI completion and identity, then run subsequent commands as fresh
   processes to prove session persistence.
5. Exercise logout and confirm a later protected command cannot use the removed
   local session. Check the reported remote-revocation outcome separately.

A Clerk user alone may not have a Spendly backend profile: provision it through
Web onboarding or scoped fixtures for financial journeys; separately test the
CLI's account-setup-required outcome for a missing backend user.

CLI credentials prefer the OS keychain. Changing `HOME` only isolates file
storage, **not the keychain**. `--allow-file-storage` permits fallback; it does
not force file storage. Use disposable runners and dedicated test OAuth
namespaces, serialize shared-keychain tests, and avoid developers' normal
credentials. Resolve headless Linux keychain/file-fallback setup before CI gates
are enabled. If an additional test seam is necessary, confine it to development
and keep production credential protections unchanged.

## Web flows: Playwright

**Core** is the initial regression gate; **extended** follows once the harness is
stable. These labels indicate coverage order, not project status.

| Priority | Journey | Required evidence |
| --- | --- | --- |
| Core | Signed-out access, sign-in and sign-out | Protected routes reject unauthenticated access; correct user reaches the app; sign-out removes access |
| Core | Free onboarding | Currency and first cycle persist; account creation or skip completes setup; dashboard is reachable after reload |
| Core | Planned onboarding | Cycle, categories and optional planned amounts persist; going back/resuming does not duplicate records; blank and explicit zero remain distinct |
| Core | Add expense | Amount, date, description, category, tags and account persist after reload; exactly one expense and correct ledger/balance/summary effects |
| Core | Edit expense | Amount/date/category changes persist; switching or clearing account reverses the old effect and applies the new effect once |
| Core | Delete expense | Cancel preserves the record; confirm removes it and reverses its financial effect |
| Core | Accounts and defaults | Add/edit account; opening balance/ledger agree; default account is used appropriately; archive/reactivate preserves history and archived accounts cannot receive new writes |
| Core | Transfer and balance adjustment | Correct paired transfer entries and balances; adjustment records the delta; invalid same-account transfer has no partial effects |
| Core | User isolation | User B cannot view User A's records through lists or direct record URLs; representative unauthorized mutation is rejected by the live backend |
| Extended | Account balance nature | Representative asset and liability journeys follow the domain contract, including negative-balance warnings rather than an invented insufficient-funds restriction |
| Extended | Cycles and categories | Create/edit cycle and category; planned totals update; date changes resolve the correct cycle/category without stale selections |
| Extended | Filtering and reports | Expense filters, tags, dashboard and comparison views match known fixtures, including empty results and cycle-boundary dates |
| Extended | Defaults and settings | Currency/view preferences persist; configured default, recent-account fallback and explicit unassigned behavior remain correct |
| Extended | Navigation and responsive Web | Expense detail modal/direct URL, browser back/forward, narrow viewport, keyboard form/dialog interactions and readable validation |
| Extended | Failed operation recovery | Controlled disconnect/rejected operation yields useful UI; retry does not create duplicate financial records |
| Extended | Public pages and CLI docs | Representative marketing/docs routes render; important internal navigation resolves |

Use role/label locators first and stable test IDs only when needed. Assert actual
records, amounts and formatted totals, not just toasts or screenshots. Cover
Chromium first; add Firefox/WebKit and a narrow Chromium viewport without
multiplying every test across every configuration.

Controlled network failures are resilience tests, not evidence of an unmocked
happy path. Keep deterministic protocol failures in lower-level tests when browser
interception would obscure Convex behavior.

## CLI flows: Vitest + child_process

Build once, then run the actual development entry via `process.execPath` with an
argument array and `shell: false`. Each invocation is a fresh process; assertions
must not substitute a call to `runCli()` or mock the live Convex client.

The helper should return stdout, stderr, exit code and signal, handle spawn
errors, support a bounded timeout/output limit, and terminate/reap children on
failure or cancellation. Treat nonzero exits as assertion data, not automatic
helper exceptions. Pass a deliberately constructed environment and temporary
working directory; do not inherit production credentials accidentally.

Use `--json --non-interactive --no-color` for financial commands. Authenticate
separately because browser login is interactive. Parse exactly one JSON document;
check the envelope and semantic fields rather than brittle full-text snapshots.
Normal JSON output should not leak progress/warnings to stderr; test `--debug`
separately because diagnostic stderr is intentional.

| Priority | Journey | Required evidence |
| --- | --- | --- |
| Core | Packed production executable | Retain existing installation/help/version/JSON/error checks; no authenticated production mutation |
| Core | Login/status/logout | Real OAuth; identity matches Convex; fresh process restores credentials; protected command fails after logout |
| Core | Add/get/list expense | Stable returned ID, correct normalized fields, independent persisted read and expected financial effects |
| Core | Edit expense | Expected revision succeeds; amount/account change updates balances once; old revision fails without mutation |
| Core | Confirmed deletion | `delete --dry-run` returns confirmation; missing/invalid token rejects; valid confirmation removes expense and reverses balance; stale confirmation after edit rejects |
| Core | Account lifecycle | Add/get/edit, opening ledger, set-default, archive/reactivate and default handling match live state |
| Core | Transfers and adjustments | Correct balances and ledger entries; same-account/archived-account rejection has no partial writes |
| Core | Dry run | Financial records and balances unchanged; preview matches the eventual committed result |
| Core | Idempotency | Same key/payload across fresh processes creates one mutation; changed payload with same key rejects without a second effect |
| Core | Read contracts | Context, current cycle, categories, tags, account types and summary match fixtures |
| Core | Authentication/user isolation | Missing session and User B access to User A IDs return expected errors; protected writes have no effects |
| Extended | Filters and cursor pagination | Multi-page results have no omissions/duplicates; filters and invalid cursors follow the contract; include ledger pagination |
| Extended | Input and selectors | Invalid dates/amounts, conflicting flags, ambiguous names, unknown IDs and missing non-interactive input have correct structured errors and exit codes |
| Extended | Credential lifecycle | Real refresh journey; missing backend profile; file fallback permissions and keychain behavior on supported platforms |
| Extended | Conflicts and confirmation expiry | Representative concurrent/stale writes and expired confirmation reject safely; use scoped fixture tooling rather than long sleeps |
| Extended | Human output and diagnostics | Useful human output, no-color behavior, debug redaction and no credentials in logs |
| Extended | Interactive terminal | Add-expense dry-run, selection navigation, confirmation/cancel and Ctrl+C; only these need a PTY |

Deletion preview may write confirmation bookkeeping. "Dry run" means no financial
mutation, not necessarily zero database writes. Similarly, idempotency records
are implementation bookkeeping, not duplicate expenses or ledger entries.

Assert exit codes against [`errors.ts`](../../apps/cli/src/errors.ts), not a
second copied error-code table. Keep exhaustive retry, token-expiry and terminal
formatting combinations in existing lower-level tests; use selected E2E proofs.

## Small cross-surface suite

Playwright Test owns the browser and calls a reusable subprocess helper; do not
nest a Vitest runner inside a Playwright test.

| Journey | Required evidence |
| --- | --- |
| CLI add -> Web read/edit -> CLI read | Same expense ID; edited fields and account balances agree after fresh CLI reads and Web reload |
| Web add -> CLI confirmed delete -> Web read | Expense disappears and summary/balance effects reverse once |
| CLI transfer -> Web accounts/history | Both balances and ledger entries agree; transfer is not counted as a new expense |
| Web default-account change -> CLI add without account flag | CLI resolves the current default; explicit unassigned flag overrides it |

## Proposed layout and CI

The initial implementation centralizes shared test-only tooling in the private
`packages/e2e` workspace rather than duplicating it in the application packages:

- `packages/e2e/web/` and `playwright.config.ts`: Web and cross-surface journeys.
- `packages/e2e/cli/` and `vitest.live.config.ts`: live subprocess journeys.
- `packages/e2e/src/` and `vitest.config.ts`: shared fixtures and offline tooling
  tests. Root `test:e2e:smoke` selects critical paths; `test:e2e:full` runs every
  existing journey. `test:e2e:web` and `test:e2e:cli`
  are focused live surfaces. `test:e2e:tooling` stays secret-free.
- `run.mjs validate` is entirely offline. `backend --check` is an **online**
  deployment/typecheck dry-run; `backend` deploys the current checkout. All live
  actions validate first. The backend deploy uses an isolated owner-only
  `--env-file` containing only a matching development deployment key, never a
  default production selection, ambient Convex auth override, or a secret in argv.
  Convex output is withheld; summaries expose only step names and statuses.
- Explicitly exclude live E2E specs from the existing default Vitest command.
  Running unit tests must never silently contact a live backend. Missing live
  configuration should fail the explicit E2E job, not produce a green skipped run.
- Keep assertions inside `test()`/`it()` blocks; do not commit `.only`/`.skip`.

| Trigger | Implemented runner policy |
| --- | --- |
| All PRs | Secret-free tooling/typechecks plus existing offline/unit/backend/package gates |
| Same-repository PRs | Chromium + CLI smoke only with repository `E2E_PR_ENABLED=true` and protected `e2e` environment approval |
| `master` push | Trusted full regression through protected `e2e`; missing configuration fails |
| Manual dispatch | Explicit smoke/full choice, default full, through protected `e2e` |
| Fork PRs | Secret-free checks only, regardless of PR opt-in |

The full local command is
`node --env-file=packages/e2e/.env.local packages/e2e/run.mjs full`.
Use `smoke` for critical paths. Both tiers use fixed selections. Individual
Web/CLI actions forward runner arguments for focused diagnosis; both still validate and deploy first. An independent
CLI run follows Web failures, but failed offline checks, deployment or CLI build
stop both live surfaces. Compatibility coverage is opt-in locally and does not
expand the default CI Chromium matrix.

Do not use `pull_request_target` to execute untrusted checkout code with secrets.
Environment reviewer/branch protection must be configured by the repository owner;
YAML alone does not provide it. One constant live-job concurrency group serializes
shared backend deployment and suites across **all** branches. Local invocations
need separate coordination. Canceled or superseded runs are not successful runs.

Use `E2E policy gate` if configuring a required check, not a conditional live job
whose skip can appear green. It rejects skipped/canceled/failed live results when
live is expected by the event policy, and clearly identifies offline-only events
without claiming live success. It does not require live proof for untrusted forks.
Secrets-protected jobs summarize configuration/deployment/build prerequisites
separately from auth/infrastructure/journey failures; do not retry away product
failures. Enable required merge enforcement only after repeatable runs and
cleanup are operationally demonstrated.

Automatic traces, screenshots and videos are currently disabled to avoid leaking
authentication requests. Enable local diagnostic capture only after reviewing its
secret exposure; retain bounded, sanitized CLI diagnostics. Never
upload auth state, credential files, raw OAuth URLs/tokens or full environment
files. Browser traces/screenshots can contain headers and financial data: use only
synthetic data, restricted artifact access and short retention. Redact secrets
before output leaves the runner, including setup/cleanup errors.

## Implementation order and unresolved decisions

1. Approve dedicated test Clerk/Convex configuration and fail-closed target guards.
2. Establish fixture seed/read/cleanup and credential isolation.
3. Add separate Playwright and Vitest E2E configurations and one real OAuth proof.
4. Implement core expense/account journeys with exact independent state checks.
5. Add cross-surface proofs, then extended browsers/PTY/platform coverage.
6. Document runnable commands and required secrets in `CONTRIBUTING.md` once
   implemented; remove this proposal when the feature ships.

The initial implementation uses fresh UUID-based users, a local Next.js dev
server and isolated development-only file credentials. Creation-intent journals
support scoped recovery, including ambiguous Clerk allocation failures. Web
profile creation is exercised through the app's real sign-in and synchronization.
Successful local full and smoke runs have exercised current-checkout backend
deployment, real OAuth, Web/cross-surface and CLI journeys, and fixture cleanup.
CI execution uses the protected GitHub `e2e` environment described in
`CONTRIBUTING.md`.
Interactive PTY coverage now uses a shell-free POSIX/Python 3.9+ bridge, with
offline tests of the real prompt renderer and live financial assertions. Genuine
OAuth credential journeys cover metadata-triggered refresh and isolated file
permissions/expiration. These live journeys still require environment validation;
Windows PTY/ACL, preview execution and real platform keychain coverage remain
unimplemented and require their own verification;
preview authentication bypass secrets require the same protection as auth tokens.

## References

- [Playwright](https://playwright.dev/docs/intro)
- [Clerk Playwright testing](https://clerk.com/docs/testing/playwright/overview)
- [Node child_process](https://nodejs.org/api/child_process.html)
- [Vitest](https://vitest.dev/guide/)
- [Contributor workflow](../../CONTRIBUTING.md)
