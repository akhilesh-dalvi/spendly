# Spendly Convex Backend

This directory contains the Convex schema, queries, mutations, and backend helpers that power Spendly.

## What Lives Here

- [`schema.ts`](./schema.ts): Convex table definitions
- [`users.ts`](./users.ts): user profile setup and preferences
- [`cycles.ts`](./cycles.ts): expense cycle CRUD and cycle-specific lookups
- [`categories.ts`](./categories.ts): category and category type logic
- [`expenses.ts`](./expenses.ts): expense CRUD and filtering
- [`tags.ts`](./tags.ts): tag management
- [`aggregations.ts`](./aggregations.ts): derived totals and summary-style queries
- [`helpers.ts`](./helpers.ts): shared backend utilities
- [`auth.config.ts`](./auth.config.ts): Clerk auth provider configuration
- [`convex.config.ts`](./convex.config.ts): Convex app configuration

## Current Tables

The Spendly app currently defines these tables:

- `users`
- `expense_cycles`
- `category_types`
- `categories`
- `tags`
- `expenses`

## Running The Backend

From the repo root:

```bash
pnpm dev:server
pnpm dev:setup
```

From `packages/backend` directly:

```bash
pnpm dev
pnpm dev:setup
```

## Auth And Environment

- Convex auth is configured for Clerk in [`auth.config.ts`](./auth.config.ts)
- Set `CLERK_JWT_ISSUER_DOMAIN` in your Convex dashboard
- Keep deployment-specific secrets and local env values in the backend workspace env files, not in this folder

## Working Notes

- `_generated/` contains Convex-generated files and should not be edited manually
- When you change the schema or backend functions, run the Convex dev process so generated types stay in sync
