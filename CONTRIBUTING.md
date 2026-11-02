# Contributing to Spendly

Spendly uses a deliberately small GitHub workflow. The goal is to keep the
work visible and understandable without turning project management into a
second project.

## Local development

### Prerequisites

- Node.js 20.19 or newer in the 20.x line, or Node.js 22.12 or newer
- pnpm 11.21.0, as pinned by the `packageManager` field in `package.json`
- A Convex account and project
- A Clerk application

### Initial setup

Install the workspace dependencies from the repository root:

```bash
pnpm install
```

Connect the backend workspace to a Convex deployment:

```bash
pnpm dev:setup
```

This runs `convex dev --configure --until-success` in `packages/backend` and
walks through selecting or creating a deployment.

### Environment variables

Each application or workspace owns its environment file. Do not copy one
shared file throughout the monorepo or commit populated environment files.

Start the web environment from its checked-in example:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Populate it with the Convex deployment URL and Clerk credentials for the local
application. The web environment validator requires:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

The Clerk integration also reads `CLERK_SECRET_KEY` from the web environment.
`NEXT_PUBLIC_SITE_URL` is optional and can be used when an explicit canonical
site URL is needed.

Convex setup manages deployment values such as `CONVEX_DEPLOYMENT` and
`CONVEX_URL` in `packages/backend/.env.local`. Configure
`CLERK_JWT_ISSUER_DOMAIN` in the Convex dashboard so backend authentication can
verify Clerk-issued tokens.

`CLERK_CLI_OAUTH_CLIENT_ID` is optional in Convex deployments that only serve
the Web app. Configure it with the approved Clerk OAuth public client ID before
enabling CLI authentication; an unset value leaves the CLI OAuth provider disabled.

Keep `apps/web/.env.example` and `packages/backend/.env.example` synchronized
with the environment requirements when configuration changes.

### Web error monitoring

Spendly uses the `spendly-web` Sentry project in the `akhilesh-rl` organization.
`apps/web/next.config.ts` embeds its public DSN; it is an ingestion identifier,
not an authentication secret. Set `NEXT_PUBLIC_SENTRY_DSN` to override the project.
This integration runs in Next.js only and does not require Convex Pro or add
telemetry to the published CLI. Backend stack traces remain in Convex logs.

Production reporting is enabled by default. Preview and local reporting are off
unless `NEXT_PUBLIC_SENTRY_ENABLED=true`; set it to `false` to disable reporting
in any environment. `NEXT_PUBLIC_SENTRY_ENVIRONMENT` overrides the environment
otherwise derived from `VERCEL_ENV`, with `development` as the local default
even for `next build` and `next start`. For production hosting outside Vercel,
set the environment explicitly or enable reporting with the flag above.
Error sampling is 100% and tracing is 10%; Replay, profiling, logs, and custom
metrics are disabled.

Collection and outbound filters in `apps/web/src/lib/sentry-options.ts` and
`sentry-privacy.ts` exclude identity, cookies, headers, bodies, financial payloads,
raw error messages, breadcrumbs, and arbitrary span attributes. An explicit
non-routable IP prevents connection-based geolocation for errors. Error stacks,
route templates, safe operation tags, and available Convex request IDs remain.
Expected domain failures are filtered explicitly; unknown failures still report.
Use `reportError` for caught application failures without attaching form values.
`pnpm --dir apps/web test` verifies these privacy and classification boundaries.

For readable production browser stacks, configure `SENTRY_AUTH_TOKEN` as a
**build-only secret** in the hosting environment, using Sentry's source-map upload
permissions (`org:read` and `project:releases`). Never prefix it with
`NEXT_PUBLIC_` or commit it. The defaults for `SENTRY_ORG` and `SENTRY_PROJECT`
match the project above and can be overridden. Source-map uploads run only when
the token exists; uploaded client maps are deleted from the build output.

Releases use `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_RELEASE`,
`VERCEL_GIT_COMMIT_SHA`, or the checkout's Git SHA, in that order. For a build from
a source archive without Git, supply `SENTRY_RELEASE`. Turbo tracks the public
settings and release inputs and passes the upload token only to the web build.
The web build bypasses Turbo caching so each build uses the current checkout's
release and performs any configured source-map upload.
After deploying, verify a controlled error in Sentry has readable file/line
locations and contains no personal or financial data.

### Running the project

Start all current development tasks:

```bash
pnpm dev
```

The web app is available at [http://localhost:3001](http://localhost:3001).
Run an individual surface when full monorepo development is unnecessary:

```bash
pnpm dev:web
pnpm dev:server
```

After changing the Convex schema or backend functions, keep the Convex dev
process running so files under `packages/backend/convex/_generated/` remain in
sync. Never edit generated Convex files by hand.

## Verification

### Local Git hooks

`pnpm install` installs Lefthook's pre-commit and pre-push hooks for the current
checkout. Run it separately in each new worktree. To repair an existing
installation, run `pnpm hooks:install`.

Pre-commit runs lint-staged with the installed Biome binary and the repository's
Ultracite presets. It formats and lints staged JavaScript, TypeScript, JSON, and
CSS files, preserving unstaged changes in partially staged files. Markdown and
MDX are outside Biome's supported formats and are not processed by this hook.

Pre-push runs checks for affected workspaces in parallel: web and environment
typechecks, backend typechecks and tests, and CLI production/development
typechecks and tests. Backend changes also check its web and CLI consumers;
shared configuration and dependency changes check all workspaces. The rules
live in `lefthook.yml`. A Knip job checks unused code, exports, dependencies,
and import declarations across the whole repository when source, tooling, or
configuration files change.
Production builds, dependency audits, and package verification remain in CI.
Web checks generate Next.js route types and require
the public Convex and Clerk settings from `apps/web/.env.local` or the shell.

Installation uses worktree-specific Git configuration and generates ignored
hooks in `.lefthook-hooks/`. It preserves other checkouts' hook paths and skips
CI, production installs, source archives without `.git`, and `LEFTHOOK=0`.
The package's automatic installer is disabled so the root installer owns this
worktree setup. Use `LEFTHOOK=0` for a deliberate one-command bypass, for example
`LEFTHOOK=0 git commit`, and still run the relevant checks before merging.

### Unused code and dependency analysis

Knip is pinned at the repository root. Its built-in plugins automatically detect
Next.js, Convex, Fumadocs, Vitest, TypeScript, Biome, Lefthook, lint-staged,
GitHub Actions, pnpm, and the other supported tools already in the workspace.
There are no separate plugin packages to install. `knip.jsonc` adds the CLI's
development source entry, standalone evaluation scripts, and the backend's
nested TypeScript configuration.

Run `pnpm knip:check` for the full analysis enforced by pre-push and CI: unused
files, exports, types, dependencies, duplicate exports, unlisted dependencies,
unresolved imports, missing command binaries, unused catalog entries, and
unresolved catalog references. Stale configuration hints also fail this command.
The hook's file patterns decide whether to run; analysis still covers the entire
repository. Pre-commit keeps using Biome and lint-staged.

Run `pnpm knip:report` to inspect the same findings without a failing exit code.
Configuration and execution errors still fail the report command. CI publishes
both the enforced checks and the report as GitHub annotations.

`pnpm knip` runs the full analysis with a failing exit code for findings.
`pnpm knip:production` adds a separate view of shipped code; it does not replace
the default analysis of tests and tooling. It can flag release scripts and
exports referenced only by tests, so check the full repository graph before
removing them. Keep the full report clean by resolving findings or documenting
narrow, intentional exceptions. Avoid blanket ignores and automatic deletion of
files or dependencies without review.

### Automated dependency updates

Renovate checks routine npm dependency and GitHub Actions updates weekly. It
groups npm patch and minor updates separately, limits open update pull requests,
and waits seven days after npm package releases before proposing routine
updates. Major updates remain separate pull requests. Updates are never merged
automatically; review the diff and require the repository CI checks before
merging.

pnpm also enforces a seven-day minimum release age for newly resolved
dependencies, including transitive dependencies. Exact-version exceptions in
`pnpm-workspace.yaml` apply only to the listed releases. Keep the shared
`pnpm-lock.yaml` and the CLI's generated `npm-shrinkwrap.json` consistent with
their manifests; CLI release checks validate the published dependency metadata.

Workspace membership is defined only in `pnpm-workspace.yaml`;
keep npm's `workspaces` field out of the root manifest so Renovate can update
the CLI shrinkwrap without npm resolving the pnpm-only `catalog:` and
`workspace:` protocols. For manual CLI dependency updates, run
`pnpm --dir apps/cli shrinkwrap:generate` after updating the manifest and
workspace lockfile, then run `pnpm --dir apps/cli release:check`.

Renovate's npm tool is pinned to 11.19.0 in `renovate.json` to keep CLI
shrinkwrap updates working. With npm 12.2.0, the artifact update creates a
`package-lock.json` alongside the existing `npm-shrinkwrap.json`, and Renovate
fails when renaming it with `dest already exists`. Before changing this pin,
verify that npm updates the existing shrinkwrap without creating a second lock
file, then rerun the CLI release metadata check.

GitHub Dependabot alerts provide vulnerability notifications. Renovate uses
those alerts to create fix pull requests. The existing CI dependency-review
check blocks pull requests that introduce known vulnerabilities. Production
dependency audits remain active as separate release gates.
Security-fix pull requests bypass Renovate's weekly schedule, release-age delay,
and ordinary pull-request limit. pnpm's release-age policy still applies in CI.
For an urgent fix released less than seven days ago, review the advisory and
release, add only the required exact versions to `minimumReleaseAgeExclude`,
and rerun installation and both production audits. Remove temporary exceptions
once those releases are seven days old; keep the general policy enabled.

CI validates `renovate.json` in strict repository mode. Keep the validator pin
on a release at least seven days old so it satisfies the installation policy.
Run the same check locally using the pinned pnpm version:

```bash
pnpm --package=renovate@44.115.13 dlx renovate-config-validator --strict --no-global renovate.json
```

### Manual checks

Run checks proportional to the change. The main repository checks are:

```bash
pnpm dlx ultracite check
pnpm check-types
pnpm hooks:test
pnpm knip:check
pnpm knip:report
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm exec tsc --noEmit -p packages/backend/convex/tsconfig.json
pnpm exec tsc --noEmit -p packages/env/tsconfig.json
pnpm --dir packages/backend test:once
pnpm build
```

Use `pnpm dlx ultracite fix` to apply automatic formatting and safe lint fixes
before rerunning the checks. A focused documentation or isolated code change
does not always require every command, but the pull request must state what was
actually verified.

Production builds load the Geist fonts through `next/font/google`. If a local
build fails while fetching fonts, confirm that the environment can reach Google
Fonts before treating it as an application failure.

### Web and CLI end-to-end tests

The private `packages/e2e` workspace owns browser and process E2E tooling:

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

With the E2E environment already exported, use `pnpm test:e2e:smoke` for
critical paths and `pnpm test:e2e:full` for the complete suite.

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

Before live execution, create and protect the GitHub **`e2e` environment** with
required reviewers and an explicit trusted deployment branch policy. Merely
naming an environment in YAML does not install those protections. Configure its
variables `E2E_CONVEX_URL`, `E2E_CLERK_ISSUER`, `E2E_CLERK_PUBLISHABLE_KEY`,
`E2E_CLERK_OAUTH_CLIENT_ID`, and secrets `E2E_CONVEX_DEPLOY_KEY`,
`E2E_CLERK_SECRET_KEY`. Approve only reviewed trusted checkout code, including
workflow, install scripts and dependencies; never dispatch untrusted branches.
Do not relax environment protections just to make a PR run. Setup and synthetic
user/OAuth configuration above are still required; absent settings fail trusted
runs rather than silently skipping them.

All live jobs share one repository-wide concurrency group, independent of branch,
with cancellation disabled during execution. The lock covers deployment, both
surfaces and teardown. GitHub can supersede older pending jobs; cancellation is
not a pass. Local commands are not protected by this CI lock: coordinate them or
use a different dedicated deployment.

For a required repository check, use **E2E policy gate**, not the conditional live
job alone. It requires successful offline checks and, for events that require
live execution under the trust policy, an actual successful result for the
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

## Repository conventions

- [`apps/web`](apps/web) contains the Next.js application.
- [`packages/backend/convex/schema.ts`](packages/backend/convex/schema.ts) is the
  source of truth for the data model, tables, indexes, and relationships.
- Backend behavior lives in the corresponding modules under
  [`packages/backend/convex`](packages/backend/convex), with `*.test.ts` files
  recording expected behavior.
- [`packages/backend/convex/auth.config.ts`](packages/backend/convex/auth.config.ts)
  and
  [`packages/backend/convex/convex.config.ts`](packages/backend/convex/convex.config.ts)
  define authentication and Convex configuration.
- [`packages/env`](packages/env) contains shared environment validation.
- [`packages/config`](packages/config) contains shared TypeScript configuration.

Keep implementation details in code, types, and tests instead of maintaining
file inventories, schema copies, or API descriptions in Markdown. Documentation
should point contributors to the authoritative code when that code already
expresses the contract clearly.

## Source of truth

- Source code, schemas, types, and tests define shipped application behavior.
- GitHub Issues track meaningful work, bugs, research, and product decisions.
- One GitHub Project provides the planning view.
- Pull requests contain the implementation and verification record.
- Repository documentation records contributor workflow and enduring context
  that cannot be expressed clearly in code.
- `docs/features/` is temporary scratch space for active, multi-session feature
  work. Follow `docs/README.md` and delete the feature file when the work ships.

Do not maintain the same backlog in another tool.

## When to create an issue

Create or identify an issue before starting work that:

- will take more than a small, immediate edit;
- needs research or a product decision;
- will span more than one development session;
- produces a user-visible outcome; or
- should remain discoverable after today.

An issue is optional for a tiny fix that can be completed and verified
immediately. Search existing issues before creating a new one.

## Project workflow

Use these statuses in the Spendly GitHub Project:

| Status | Meaning |
| --- | --- |
| Inbox | An unreviewed idea, bug, or request. |
| Planned | Worth doing, but not yet prepared for implementation. |
| Ready | Understood well enough to start. |
| In Progress | Actively being implemented. |
| Done | Shipped or otherwise completed. |

Keep at most one major issue in **In Progress**. Keep **Ready** small, ideally
three to five issues, so it represents an actual next-up queue rather than a
second backlog.

Use metadata sparingly:

- Type: `bug`, `feature`, `improvement`, `research`, or `documentation`
- Area: `web`, `backend`, `mobile`, `cli`, or `integrations`
- Priority: `high`, `normal`, or `low`

Do not add story points, sprint ceremonies, assignees for a solo maintainer, or
due dates unless they answer a real planning question.

## Writing an issue

An issue should describe one outcome. Keep early ideas short while they are in
**Inbox**, and add detail only when the work is being prepared.

Use this structure for planned work:

```md
## Problem

What is difficult, missing, or incorrect?

## Outcome

What should become possible from the user's perspective?

## Scope

- Included change

## Out of scope

- Related work deliberately excluded

## Acceptance criteria

- [ ] Observable requirement
- [ ] Important edge case
- [ ] Relevant checks pass
- [ ] Documentation is updated when necessary

## Notes

Relevant decisions, links, constraints, and files.
```

For research, state the decision that must be made, the requirements, the
options being considered, and the final decision. Create separate
implementation issues after the decision instead of growing one issue
indefinitely.

## Documentation boundaries

Use the following rule when deciding where information belongs:

| Location | Purpose |
| --- | --- |
| Issue | Why the work exists and how completion will be judged. |
| Issue comment | A material discovery or change in direction. |
| `docs/features/<name>.md` | Temporary detail for active, multi-session work. |
| Permanent documentation | Shipped behavior or an enduring decision. |
| Pull request | The exact implementation and verification performed. |

Do not use issues as a permanent manual, and do not commit speculative product
documentation as though it describes shipped behavior.

## Development flow

1. Choose an issue from **Ready** and confirm its acceptance criteria.
2. Move it to **In Progress**.
3. Create a short-lived branch from `master`. Include the issue number when one
   exists, for example `feature/42-recurring-expenses`.
4. For major work spanning multiple sessions, use a dedicated worktree and a
   temporary `docs/features/<name>.md` file as described in `AGENTS.md`.
5. Implement the smallest complete outcome and run checks proportional to the
   change.
6. Open a focused pull request. Include `Closes #42` when the pull request fully
   resolves the issue.
7. Merge only after the acceptance criteria and relevant checks pass.
8. Delete temporary feature notes and allow the closed issue to move to
   **Done**.

If work is paused, move it back to **Planned** or **Ready** and leave one short
comment explaining what remains. Do not leave inactive work in **In Progress**.

## Pull requests

Keep one coherent outcome per pull request. A pull request should explain:

- what changed and why;
- important design or compatibility decisions;
- how the change was verified; and
- any intentionally deferred work.

Follow the coding, branching, worktree, and testing standards in `AGENTS.md`.
Do not mix unrelated cleanup into a feature pull request.

## Lightweight maintenance routine

At the start of a development session:

1. Continue the issue in **In Progress**.
2. If there is none, select one issue from **Ready**.

At the end of a session:

1. Update acceptance criteria that are genuinely complete.
2. Record only information needed to resume the work.
3. Make the issue status match reality.

Once a week, spend a few minutes reviewing **Inbox**, closing ideas that no
longer matter, and selecting only the next few credible items for **Ready**.
Closing an issue as not planned is normal backlog maintenance.

## Guidance for coding agents

Agents must follow this workflow without creating extra process:

- Treat the assigned issue and any linked feature document as the requirements.
- Inspect current code and repository state before relying on stale issue notes.
- Keep changes within the issue's stated outcome and acceptance criteria.
- Do not create, modify, close, or reprioritize GitHub issues unless the user
  explicitly asks for that external action.
- Report verification and remaining work clearly so the issue or pull request
  can be updated accurately.
