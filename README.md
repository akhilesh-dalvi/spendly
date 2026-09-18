# Spendly

Spendly is a personal expense tracker built around custom expense cycles,
categories, accounts, tags, and comparison views. The Next.js web app and
Convex backend are the active parts of the project.

## Product principles

- No income tracking — observe spending, not earnings
- Cycles over calendar months — use personal time buckets such as pay periods
- Planning is optional — track freely or add planned amounts when ready
- No enforcement — overspending is data, not an error
- Historical data is editable — mistakes are part of the process
- Comparison is observational, not judgmental

## Stack

- Next.js 16 and React 19 for the web app
- Convex for backend functions, schema, and realtime data
- Clerk for authentication
- Tailwind CSS 4 and shadcn/ui for the interface
- Turborepo and pnpm workspaces for the monorepo
- Biome via Ultracite for formatting and linting

## Repository layout

```text
spendly/
├── apps/
│   └── web/                 # Next.js web app
├── packages/
│   ├── backend/             # Convex workspace
│   │   └── convex/          # Schema, queries, and mutations
│   ├── config/              # Shared TypeScript configuration
│   └── env/                 # Shared environment validation
├── docs/
│   └── features/            # Temporary specs for in-flight work
├── CONTRIBUTING.md
├── README.md
└── turbo.json
```

## Development

Install dependencies, connect a Convex deployment, and start the development
setup:

```bash
pnpm install
pnpm dev:setup
```

Configure the local environment as described in
[CONTRIBUTING.md](CONTRIBUTING.md), then start the development servers:

```bash
pnpm dev
```

The web app runs at [http://localhost:3001](http://localhost:3001).

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, environment setup,
scoped development commands, verification, and the GitHub contribution
workflow.
