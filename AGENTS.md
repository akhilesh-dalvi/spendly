# Repository guidance

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification, GitHub workflow,
and branching. Do not create or modify GitHub issues without explicit user
authorization.

## Code standards

Ultracite/Biome enforces formatting and lint rules:

```bash
pnpm dlx ultracite fix
pnpm dlx ultracite check
```

- Prefer type narrowing and `unknown` over assertions and `any`.
- Use React 19 ref props, Next.js Image, App Router metadata, and Server
  Components for server-side data fetching.
- Keep components at module scope and use semantic, keyboard-accessible HTML.
- Avoid barrel re-exports and spread accumulators in loops.
- Validate input and keep credentials and financial data out of diagnostics.
- Test behavior and edge cases; use async/await rather than done callbacks.
  Keep assertions inside tests and commit no `.only` or `.skip`.
- Keep implementation contracts in code, types, and tests rather than Markdown.
