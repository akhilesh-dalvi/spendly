# Contributing

## Setup

Use Node.js 20.19+ on the 20.x line or 22.12+; CLI development requires Node.js
22+. Use the pnpm version pinned in `package.json`, plus Convex and Clerk accounts.

```bash
pnpm install
pnpm dev:setup
cp apps/web/.env.example apps/web/.env.local
```

`dev:setup` selects or creates a Convex deployment. Environment files belong to
each workspace; never commit populated files.

- Web: set `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and
  `CLERK_SECRET_KEY`. `NEXT_PUBLIC_SITE_URL` optionally sets the canonical URL.
- Backend: Convex manages deployment values in `packages/backend/.env.local`.
  Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex dashboard. CLI authentication also
  requires the approved public client ID in `CLERK_CLI_OAUTH_CLIENT_ID`;
  leaving it unset disables CLI OAuth.

Root dev and live E2E commands load Infisical `dev` and `e2e` settings
automatically; install the Infisical CLI and run `infisical login` first. CI reuses
OIDC-injected secrets instead. Lint and unit tests need no Infisical login.

Keep workspace `.env.example` files synchronized with configuration changes.

```bash
pnpm dev          # All development tasks; web at http://localhost:3001
pnpm dev:web      # Web only
pnpm dev:server   # Convex only
pnpm dev:cli      # CLI
```

Keep Convex dev running after schema or function changes to update
`packages/backend/convex/_generated/`; never edit generated files manually.

## Verification

Run checks proportional to the change and report what actually ran:

```bash
pnpm dlx ultracite check   # Use fix for formatting and safe lint fixes
pnpm check-types
pnpm hooks:test
pnpm knip:check
pnpm test:coverage
pnpm build
```

CLI-only checks: `pnpm check-types:cli`, `pnpm test:cli`, and `pnpm pack:cli`.
Workspace scripts in `package.json` provide focused checks. Web typechecks
generate route types and need public Convex/Clerk settings from the environment.

### Hooks and unused code

`pnpm install` installs worktree-specific Lefthook hooks; repair with
`pnpm hooks:install`. Install separately in each worktree. Installation skips CI,
production installs, source archives without Git, and `LEFTHOOK=0`.

- Pre-commit formats/lints staged JS, TS, JSON, and CSS with Biome, preserving
  unstaged edits. Markdown/MDX are not processed.
- Pre-push checks affected workspaces, including coverage. Backend changes check
  consumers; shared configuration changes check all workspaces. Knip scans the
  full repository when relevant files change.
- CI additionally checks production builds, dependency audits, and packages.

See `lefthook.yml` for triggers. A deliberate `LEFTHOOK=0` bypass does not
remove the obligation to verify before merging.

`pnpm knip:check` fails on unused code/dependencies and stale configuration hints.
`pnpm knip:report` reports findings without failing, but still fails on execution
errors. `pnpm knip:production` is supplementary: check the full graph before
removing anything used only by tests/tooling. Keep exceptions narrow and justified
in `knip.jsonc`.

### Tests and coverage

Coverage gates and scopes live in each workspace's `vitest.config.mts`.
Use `pnpm test:coverage` for all gates or `pnpm --dir <workspace> test:coverage`.
Reports are written to `coverage/`; CI retains `coverage-reports` for 14 days,
including failures.

Fix missing behavioral coverage rather than lowering thresholds or excluding
production code. Scope/threshold changes require an explicit PR rationale.
Web DOM tests opt into jsdom with `// @vitest-environment jsdom` and use React
Testing Library/user-event. Mock auth and Convex; test visible behavior,
validation, transitions, and mutation payloads. DOM tests do not replace
production builds or browser checks.

### Build constraints

Web production builds use Webpack. Preserve the memory-optimized compilation
worker settings in `apps/web/next.config.ts`: MDX/Sentry wrappers disable automatic
worker selection. Keep production typechecking enabled. Google Fonts access is
required by `next/font/google`.

### Web and CLI end-to-end tests

The private `packages/e2e` workspace owns authenticated browser and process E2E
tooling, separate from the secret-free production browser smoke in CLI release CI:

- **Web:** Playwright Test with Clerk testing helpers.
- **CLI:** Vitest launches the built development CLI using Node `child_process`.
- **Cross-surface:** Playwright drives Web while a subprocess helper executes CLI
  commands; no runner is nested inside another runner.

Ordinary application/unit test commands do not collect live E2E specs. Run the
secret-free runner checks with `pnpm test:e2e:tooling`. Package installation,
help/version, JSON and exit-code smoke checks remain in the existing
`pnpm --dir apps/cli pack:verify` gate. Live tests must **never** target the packed
production CLI or a production database.

#### Dedicated environment setup

1. Create a dedicated **Convex dev deployment** and **Clerk development instance**.
   Enable email/password authentication without mandatory MFA for synthetic users,
   and register a public CLI OAuth client
   with the loopback redirect behavior required by Spendly's existing PKCE flow.
2. Configure `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_CLI_OAUTH_CLIENT_ID` in that
   dedicated test deployment; configure Clerk's `convex` JWT template for Web.
   The guarded live launcher deploys this checkout's backend before running
   journeys, so old remotely deployed functions cannot silently stand in for
   the code under test. Do not run an ordinary unqualified `convex deploy`.
3. In that test deployment only, set the backend environment variable
   `SPENDLY_E2E_ENABLED=true`. The internal `e2eFixtures:removeUser` mutation needs
   this flag and matching deployment URL before it can remove an exact synthetic
   fixture user's records. There is no public reset endpoint or user-auth bypass.
   **Leave this flag unset in every production deployment.**
4. Copy `packages/e2e/.env.example` to `packages/e2e/.env.local` and populate the
   E2E-specific values. The Convex key must be a development deploy key matching
   the URL (`dev:<deployment>|...`); production/project keys are rejected. The
   Clerk keys must be test keys and the publishable key must match the issuer.
   Never use the normal development or production user's credentials.
5. Leave localhost port 3001 unused. Each live runner starts its own Web server
   with the test settings and refuses to reuse an existing server.

E2E tooling requires a POSIX host (Linux/macOS), Python 3.9+ for the real
controlling-terminal bridge, and Node 24 (the CI version) or Node 22.18+ with
native TypeScript stripping. CI installs Python 3.12 explicitly. The bridge
executes argument arrays without a shell and reaps owned terminal processes;
no additional npm/native PTY dependency is needed. Windows PTY/ACL and real OS
keychain coverage are not implemented; the live CLI uses isolated development
file credentials, never a developer keychain. The launchers do not automatically
read `.env.local`. Load the E2E file explicitly, without sourcing shell syntax
containing deploy-key pipes:

```bash
pnpm --dir packages/e2e browsers:install
# Offline validation only: no subprocess, connection, deployment or server.
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs validate
# Critical-path regression during development / before a PR:
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs smoke
# Every existing journey before a release or for broader verification:
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs full
```

Use `pnpm test:e2e:smoke` for critical paths and `pnpm test:e2e:full` for the
complete suite; root commands automatically load Infisical's `e2e` environment.

Smoke selects representative auth/onboarding, expense lifecycle, account/transfer,
ownership, totals and cross-surface journeys. Web tests use Playwright's `@smoke`
tag; CLI test titles end with `@smoke`. The executable specs define membership.
Smoke runs on Chromium. Full runs every Web and CLI journey in the suite,
including smoke. Both tiers use genuine authentication and persisted financial
state.

Both tiers validate configuration first, run offline tooling tests and typechecks,
deploy the current backend, build the development CLI once, then run Web and CLI
as sibling runners. A Web failure still runs CLI and the final result fails if
either fails. Configuration, offline-check, deployment or build failures stop
live execution. Suite commands use fixed selections, and summaries identify
the selected tier.

Individual `web` and `cli` launcher actions also validate, deploy the checkout
and build the development CLI before their selected surface. They accept runner
arguments for focused local diagnosis. Use `pnpm --dir packages/e2e check-types`
for offline test-tooling typechecks. The launcher explicitly forwards file-loaded
settings to pnpm; avoid Node's `--run`, which can drop those variables.

Backend-only commands (after the same complete safety validation) are:

```bash
# Online deployment and typecheck dry-run.
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs backend --check
# Actually update ONLY the dedicated development deployment to this checkout.
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs backend
```

The launcher uses the installed Convex CLI's `deploy --env-file` with an exact
`dev:<deployment>|...` key and typechecking enabled. That deployment-specific key
selects its development deployment despite `deploy` normally defaulting to
production. A short-lived owner-only file supplies the validated key; argv and
logs never contain it. Normal backend `.env` files, ambient Convex selection/auth
overrides and saved global credentials are not used. Raw deployment output is
withheld; only the failed step/exit code is reported. The file is removed on
normal success/failure. An abrupt kill can leave local temporary state; use only
a trusted machine and disposable CI runners. Recheck CLI selection semantics
when updating Convex. This flow intentionally changes the dedicated backend, not
production, and does not configure remote Clerk/Convex settings for you.

Web tests run headless by default, so no browser window opens. Add `--headed`
to the Web launcher command to watch the browser. Extra Playwright arguments,
including a spec filename, are forwarded by the launcher. Wait for the current
run to finish before starting another; each run owns port 3001. Failed tests
print their detailed errors in the final summary.

Chromium runs the full Web suite by default. To add Firefox, WebKit and narrow
Chromium, install those browsers with
`pnpm --dir packages/e2e exec playwright install` and set
`E2E_EXTENDED_BROWSERS=true` in the E2E environment file. Those optional projects
run tests tagged `@compatibility`.
These projects apply to full/focused Web runs; smoke always uses Chromium only.
Both surfaces run serially. Do not run suites concurrently on the same local port
or against the same dedicated backend, including from separate local checkouts.

#### Fixture lifecycle and evidence

Tests allocate fresh synthetic Clerk users, sign in through the Web UI and wait
for the app's own profile synchronization, then obtain genuine CLI OAuth sessions
and seed financial fixtures through authenticated public Convex operations.
Clerk setup disables dotenv discovery, pins the official management API and
obtains a fresh testing token rather than accepting ambient instance state. Reads
verify persisted records and balances independently of the initiating command.
The CLI uses a development-only explicit credential file under an owner-only
temporary directory. Production ignores this injection and keeps its normal
keychain policy; `--allow-file-storage` still permits fallback rather than forcing
file storage. Browser login exercises the real authorization/callback/exchange,
not an injected token. Credential journeys force refresh by aging local expiry
metadata while retaining genuine signed tokens, then check renewed persistence,
identity, permissions, expiration and logout isolation. Terminal journeys exercise
real arrow/selection input, dry-run, confirmed creation, declined confirmation
and Ctrl+C, with independent financial-state checks.

Teardown closes the fixture page before deleting its Clerk user and matching
backend records, then removes temporary credentials. Stopping the page first and
cleaning backend records last prevents in-flight Web profile sync from recreating
an already-cleaned profile. Local journals under ignored
`packages/e2e/.e2e/users/` record creation intent before Clerk allocation and retain
IDs/emails, matching test targets and owned temporary directories when cleanup
fails. Recovery resolves ambiguous allocation by exact synthetic email and removes
journals only after remote and local cleanup succeed. Recover journaled
users older than two hours with:

```bash
node --env-file=packages/e2e/.env.local packages/e2e/run.mjs cleanup
```

Do not delete a failed-cleanup journal until recovery succeeds. An abruptly killed
or discarded CI runner can lose its local journals; inspect the dedicated test
instance for orphaned `spendly-e2e-...+clerk_test@example.com` users after canceled
runs. There is no automatic broad remote-user sweep.

OAuth URLs, credential files, saved browser auth and full environment files must
never be logged or uploaded. Automatic Playwright traces/screenshots/videos are
disabled because even synthetic-session requests contain bearer credentials.
For local diagnosis, deliberately enable capture only with restricted storage,
review and redaction; never attach an unreviewed trace to a public PR.

#### CI execution

The **E2E regression** workflow runs secret-free tooling tests and typechecks on
all PRs (including forks), pushes to `master`, and manual dispatches. Existing
application/backend/unit/package gates remain automatic in CLI release CI.
Trusted pushes to `master` additionally run the full guarded live regression.
Same-repository PRs run live **smoke** only after setting the **repository**
variable `E2E_PR_ENABLED=true`. Manual dispatch offers a `suite` choice of smoke
or full, defaulting to full. Fork PRs never enter the live job, even with that
opt-in. There is no `pull_request_target` trigger.

Live CI fetches `E2E_*` settings from Infisical project `spendly`, environment
`e2e`, using GitHub OIDC. Set `INFISICAL_IDENTITY_ID` in GitHub's protected `e2e`
environment; no duplicated credentials or client secret are needed in GitHub.
See `packages/e2e/.env.example` for required settings.

Keep required reviewers enabled. Both OIDC trust and environment branch rules
currently allow only `master`; PR opt-in does not override them. Never broaden
access to untrusted code or log credentials. Infisical's free-plan read-only role
is project-wide: use a separate project for production secrets.

All live jobs share one repository-wide concurrency group, independent of branch,
with cancellation disabled during execution. The lock covers deployment, both
surfaces and teardown. GitHub can supersede older pending jobs; cancellation is
not a pass. Local commands are not protected by this CI lock: coordinate them or
use a different dedicated deployment.

Require **Quality and contract gates** for the parallel static, coverage, workflow
validation and public browser-smoke checks, plus the CLI platform checks. For E2E,
use **E2E policy gate**, not the conditional live job alone. It requires successful
offline checks and, for events that require live execution under the trust policy,
an actual successful result for the
requested tier (PR smoke, master full, manual choice). Skipped, canceled or
failed required runs fail the gate. Forks and PRs without live opt-in receive
secret-free verification, identified in the summary. Live verification of a fork
change requires a separately reviewed trusted run.
Configure branch protection only after operational verification of this policy.

Live summaries list executed steps and classify configuration/deployment/build
prerequisites separately from surface failures. No authentication artifacts or
raw deployment logs are uploaded. A passing offline suite, a configuration
validation or a backend dry-run is **not** evidence that live journeys passed.
The harness is regression protection, not proof that every environment, browser,
credential store or user configuration universally works.

## Web error monitoring

Sentry defaults to `akhilesh-rl/spendly-web`; its embedded public DSN is not a
secret. Override with `NEXT_PUBLIC_SENTRY_DSN`. Only Next.js reports to Sentry;
backend stacks remain in Convex logs and the CLI has no telemetry.

Production reporting is on; preview/local reporting is off.
`NEXT_PUBLIC_SENTRY_ENABLED=true|false` overrides this.
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` overrides `VERCEL_ENV`, otherwise
`development` is used, including local production builds. Configure non-Vercel
production hosting explicitly.

Privacy filters in `apps/web/src/lib/sentry-options.ts` and `sentry-privacy.ts`
strip identity, request/financial payloads, raw messages, breadcrumbs, and
arbitrary span attributes; errors use a non-routable IP to prevent geolocation.
Stacks, route templates, safe operation tags, and Convex request IDs remain.
Use `reportError` for caught failures without form values. Web tests verify these
boundaries. Sampling and enabled integrations are defined in those files.

For readable browser stacks, set build-only `SENTRY_AUTH_TOKEN` with
`org:read` and `project:releases` permissions. Never prefix it with `NEXT_PUBLIC_`
or commit it. `SENTRY_ORG`/`SENTRY_PROJECT` override defaults. Uploads require the
token; uploaded client maps are removed from build output.

Release precedence: `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_RELEASE`,
`VERCEL_GIT_COMMIT_SHA`, Git SHA. Supply `SENTRY_RELEASE` for source archives.
Web builds bypass Turbo caching so release IDs and uploads stay current.
After deployment, verify a controlled error has readable stacks and no personal
or financial data.

## Dependencies

Renovate proposes weekly routine updates and separate major updates; merging is
manual after CI. Security fixes bypass its schedule and ordinary limits.
Dependabot alerts, dependency review, and production audits remain release gates.

pnpm enforces a seven-day release age, including security fixes. For an urgent
reviewed fix, add only required exact versions to `minimumReleaseAgeExclude` in
`pnpm-workspace.yaml`, reinstall, and run both production audits. Remove temporary
exceptions after seven days. Keep the general policy enabled.

Workspace membership belongs only in `pnpm-workspace.yaml`, not npm's
`workspaces` field. After manual CLI dependency changes:

```bash
pnpm --dir apps/cli shrinkwrap:generate
pnpm --dir apps/cli release:check
```

Keep manifests, `pnpm-lock.yaml`, and the CLI `npm-shrinkwrap.json` consistent.
The published shrinkwrap must contain production dependencies and optional
platform bindings only. Use the generator's production-only manifest:
`npm install --omit=dev` against the source manifest still records dev metadata.
Review regeneration diffs for newly resolved transitive versions.

Renovate pins npm in `renovate.json` because npm 12.2.0 creates a second lockfile,
causing artifact updates to fail with `dest already exists`. Before changing the
pin, verify in-place shrinkwrap updates and run the CLI release check.
Validate Renovate with the version pinned in CI; keep that validator at least
seven days old.

Review flagged code and runtime reachability before replacing dependencies.
Retain reproducible shrinkwrap installs and OS-keychain credential storage.

## Workflow

Source, schemas, types, and tests define shipped behavior. GitHub Issues hold
requirements/decisions; one GitHub Project holds status; PRs record implementation
and verification. Keep permanent docs for enduring context, not file inventories,
copied contracts, or a second backlog.

Meaningful, user-visible, researched, or multi-session work should have an issue;
tiny immediately verifiable fixes need not. Search before creating one.
**Agents may create or modify issues only when explicitly asked.**

Project statuses: **Inbox** (unreviewed), **Planned** (worth doing), **Ready**
(prepared), **In Progress** (active), **Done** (complete). Keep at most one major
issue in progress and roughly three to five ready. Use type, area, and priority
metadata only when useful.

Issues describe one outcome: problem, desired result, scope/exclusions,
observable acceptance criteria, and relevant constraints/links. Research issues
end with a decision; track implementation separately.

1. Continue active work or select a ready issue; confirm acceptance criteria.
2. Create a short-lived branch from `master`, e.g. `feature/42-recurring-expenses`.
   Keep the main checkout on deployable `master`.
3. For major multi-session work, use a dedicated worktree:
   `git worktree add ../<name> -b feature/<name> master`.
   Each worktree needs its own dependencies and environment files.
4. Keep temporary feature notes in `docs/features/<name>.md`, following
   `docs/README.md`. Inspect current code before trusting old notes.
5. Implement one coherent outcome; verify proportionally. Keep branches current
   with `master` and open one PR per feature, stating why, key decisions, checks,
   and deferred work. Use `Closes #42` only for fully resolved issues.
6. Merge after acceptance criteria and checks pass; delete shipped feature notes.

Keep authorized issue updates concise: material discoveries, completed criteria,
and what is needed to resume. Paused work returns to Planned/Ready, not In Progress.
Review Inbox periodically and close ideas that no longer matter.
