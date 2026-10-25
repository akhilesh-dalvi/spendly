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
