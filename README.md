# Spendly

Spendly is a personal expense tracking monorepo built around custom expense cycles, categories, tags, and comparison views. The web app and Convex backend are the main active parts of the project today, with the native Expo app present in the repo for later work.

## Stack

- Next.js 16 + React 19 for the web app
- Convex for backend functions, schema, and realtime data
- Clerk for authentication
- Expo + React Native for the native app workspace
- Tailwind CSS 4 and shadcn/ui for UI
- Turborepo + pnpm workspaces for the monorepo
- Biome via Ultracite for formatting and linting

## Repo Layout

```text
spendly/
├── apps/
│   ├── web/                 # Next.js web app
│   └── native/              # Expo / React Native app
├── packages/
│   ├── backend/             # Convex workspace
│   │   └── convex/          # Convex schema, queries, and mutations
│   └── env/                 # Shared env validation/helpers
├── README.md
└── turbo.json
```

## Requirements

- Node.js 20+
- pnpm 10+
- A Convex account/project
- A Clerk application

## Getting Started

Install dependencies:

```bash
pnpm install
```

Configure Convex for this repo:

```bash
pnpm dev:setup
```

That command runs `convex dev --configure --until-success` in the backend workspace and walks you through connecting a deployment.

## Environment Setup

Spendly uses separate environment files per app/workspace. Set up the files you actually need instead of copying one env file into every package.

Typical setup:

- `apps/web/.env.local`
- `apps/native/.env`
- `packages/backend/.env.local`

Clerk + Convex notes:

- Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex dashboard
- Set the appropriate Clerk publishable key in the web/native app env files
- Keep the Convex deployment values in the app env files that talk to the backend

## Running The Project

Start everything in dev mode:

```bash
pnpm dev
```

Useful scoped commands:

```bash
pnpm dev:web
pnpm dev:server
pnpm dev:native
pnpm build
pnpm check-types
```

Default local app entry points:

- Web: [http://localhost:3001](http://localhost:3001)
- Native: Expo dev server via `pnpm dev:native`

## Code Quality

Format and auto-fix issues:

```bash
pnpm dlx ultracite fix
```

Check formatting and lint issues:

```bash
pnpm dlx ultracite check
```

Typecheck the workspaces:

```bash
pnpm check-types
```

## Current Project Focus

- `apps/web` and `packages/backend` are the primary active surfaces
- `apps/native` exists in the monorepo but is intentionally a later phase
- The current backend schema includes:
  - `users`
  - `expense_cycles`
  - `category_types`
  - `categories`
  - `tags`
  - `expenses`

## Notes

- Convex generated files under `packages/backend/convex/_generated/` are local/generated artifacts and should not be edited by hand
- If production web builds fail locally because fonts cannot be fetched, check network access for Google Fonts used by the app shell
