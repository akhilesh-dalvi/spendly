# Spendly CLI Phase 1: CLI Foundation

## Status

- Phase: Code complete; production OAuth client ID pending
- Last updated: 2026-08-31
- Branch: `feature/spendly-cli`
- Package and binary: `spendly@0.1.0`
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

## Implemented

- Added the Node.js ESM package, executable entry, TypeScript builds, Vitest
  suite, and workspace development/build/typecheck/test/pack scripts.
- Added Commander 14 routing whose command implementations load only when their
  action runs. Help and version do not load authentication configuration.
- Added versioned JSON success and error schemas, shared terminal rendering,
  redacted debug diagnostics, and the approved exit-code mapping from `0` to
  `7`.
- Added `--json`, `--non-interactive`, `--debug`, `--no-color`, and `--no-retry`.
  `NO_COLOR` is respected. JSON help, version, successes, and failures each emit
  exactly one JSON document.
- Kept the Phase 0 keychain and forced-refresh canaries available only from the
  source-development entry. They are absent from production help.
- Compiled the public production Clerk issuer, Convex URL, and Spendly Web URL
  into the production entry. Development values are loaded only by the separate
  source entry from ignored `apps/cli/.env.local`.
- Added clean builds so deleted source files cannot remain in `dist` and enter a
  tarball.
- Added an automated tarball check that installs the package in a fresh
  temporary consumer outside the repository, then verifies version, help, JSON,
  exit codes, production configuration, and absence of development files.

## Remaining External Prerequisite

No approved production Clerk OAuth client ID is available in the checkout or
project documentation, so one has not been compiled. Production auth commands
therefore return `CONFIGURATION_ERROR` before making a network request. This
avoids silently using development auth or shipping a misleading client
identifier.

To close the final Phase 1 checkbox:

1. Supply the production public Clerk OAuth client ID, or create the application
   with the approved PKCE, scopes, consent, and loopback callback settings.
2. Add its exact client ID to the production CLI constant and set `authReady` to
   `true`.
3. Add the matching strict Convex `customJwt` provider for production and repeat
   the Phase 0 identity proof during Phase 2.

No Clerk secret, deploy key, token, or development endpoint belongs in the
package.

## Verification

Passed on 2026-08-31:

```text
pnpm exec biome check <Phase 0 and Phase 1 CLI files>
pnpm -C apps/cli check-types
pnpm -C apps/cli check-types:development
pnpm -C apps/cli build
pnpm -C apps/cli test
pnpm -C apps/cli pack:verify
git diff --check
```

Results:

- 9 test files and 30 tests passed, including the random-port loopback suite.
- The production and source-development TypeScript builds passed.
- `spendly-0.1.0.tgz` installed and ran outside the repository.
- The packed CLI exposed production endpoints only and no source-development
  configuration or commands.
