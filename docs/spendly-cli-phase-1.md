# Spendly CLI Phase 1: CLI Foundation

## Status

- Phase: complete; production configuration was finalized in Phase 9
- Last updated: 2026-10-05
- Original branch: `feature/spendly-cli`
- Historical verification package: `spendly@0.1.0`; published release: `0.1.2`
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

## Production Prerequisite Resolved

The production Clerk OAuth public client was provisioned and compiled with
`authReady: true` during Phase 9. The strict production Convex provider and
browser authentication proof passed, and `spendly@0.1.2` is published. The
[Phase 9 release record](spendly-cli-requirements-and-implementation-plan.md#phase-9-packaging-and-release)
closes the earlier external prerequisite; no Phase 1 setup task remains.

No Clerk secret, deploy key, token, or development endpoint belongs in the
package. The verification below records the original development-phase result.

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
