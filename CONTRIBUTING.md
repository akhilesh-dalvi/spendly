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

Keep `apps/web/.env.example` and `packages/backend/.env.example` synchronized
with the environment requirements when configuration changes.

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

Run checks proportional to the change. The main repository checks are:

```bash
pnpm dlx ultracite check
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
