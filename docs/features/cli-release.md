# Feature: CLI production release

**Status:** in progress

## Goal

Complete Phase 9 Part 0's source handoff, production configuration, public
package metadata, and immutable publication candidate for `spendly@0.1.0`.
Follow `docs/spendly-cli-release-runbook.md` for the operator sequence.

## Current evidence

Local source-baseline checks on 2026-10-01 passed:

- CLI production typecheck and all 169 tests on Node.js 22.23.2 and 24.21.0.
- CLI development typecheck, backend and environment typechecks, and all 38
  backend tests on Node.js 24.
- Web production build on Node.js 24, including its TypeScript check.
- Release metadata, focused Ultracite/Biome, and `git diff --check`.
- Isolated CLI tarball installation and command-contract verification.
- CLI production dependency audit: zero vulnerabilities.
- Repository production audit: one low finding, no moderate, high, or critical
  findings after upgrading Next.js to 16.3.6 for GHSA-vcvr-r3jv-pc5j.

Independent agent response evaluations are optional. The existing Phase 8.10
and Phase 8.11 documents retain the maintainer's terminal evidence.

## Production authentication evidence

Verified on 2026-10-01; only public identifiers and pass/fail evidence are
recorded here.

- Source baseline PR https://github.com/akhilesh-dalvi/spendly/pull/9 merged
  as `a1a165b1bf628bce5e2e63234294ea5dcfd0ad08`. Its quality gate, macOS/Linux
  Node.js 22/24 matrix, and Vercel preview passed.
- Production Clerk OAuth app `Spendly CLI` uses public client ID
  `T99oHEemr0oToUZU`, consent, required PKCE S256, and only `openid`, `profile`,
  `email`, and `offline_access`. The registered loopback callback is
  `http://127.0.0.1/callback`; the actual random-port callback passed.
- Approved issuer: `https://clerk.spendly.akhileshdalvi.com`. Approved Convex
  deployment: `https://successful-donkey-782.convex.cloud`. Approved Web URL:
  `https://spendly.akhileshdalvi.com`. Public `/docs/cli` returned HTTP 200
  while signed out.
- Set and read back `CLERK_CLI_OAUTH_CLIENT_ID` in that production Convex
  deployment. Deployed the unchanged, reviewed baseline backend successfully
  with explicit typechecking; the Web audience remains configured.
- The CLI now compiles `authReady: true` and the approved public client ID.
  Production typechecks, all 169 CLI tests, and isolated tarball verification
  passed on Node.js 22 and 24. The installed-package verifier checks the client
  ID and rejects development configuration and secret-shaped contents.
- CLI development and backend typechecks, all 44 backend tests, focused
  Ultracite/Biome, and `git diff --check` passed on Node.js 24.
- Live production authentication passed with native macOS Keychain storage:
  browser login, exact issuer/audience validation, Convex subject-to-user
  matching, forced refresh, logout with confirmed provider revocation, revoked
  refresh-token rejection, and local credential removal.
- A simulated 30-day authorization expiry required fresh login and cleared
  local credentials. This was a clock-based expiry check, not 30 elapsed days.
  No financial data was created and the test credentials were removed.

This verifies the current source configuration, not a frozen publication
artifact. Repeat the required authentication checks against the final candidate;
the separate production `ACCOUNT_SETUP_REQUIRED` user check is still pending.

## Remaining handoff and operator inputs

- The production CLI configuration change needs review and merge.
- CLI CI and candidate workflows are now on the default branch. Create the
  `cli-release` environment before running the candidate or publish workflow;
  the publication workflow is still pending.
- The worktree now includes `master`'s approved AGPL-3.0-only root license;
  public npm metadata still needs to be finalized.
- Complete the protected environment, publication workflow, public docs,
  npm account checks, and final candidate freeze from the Part 0 checklist.

Delete this temporary note when the CLI release ships.
