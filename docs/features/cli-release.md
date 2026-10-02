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

## Part 0 repository preparation (2026-10-02)

Production authentication is merged into `master` through PR
https://github.com/akhilesh-dalvi/spendly/pull/10 at
`80655a5d2ab7470bf80b966d7a39491214e25751`; its hosted CLI readiness workflow
passed. The earlier note that authentication still needed merging is resolved.

The working branch now includes:

- Public `spendly@0.1.0` package metadata with `AGPL-3.0-only`, a packaged copy
  of the approved root license, and checks rejecting private, unlicensed, or
  inconsistent packages. Dependency versions are unchanged.
- Exact-version installation instructions and the production documentation URL
  in the npm README, installed help, skill, and Web docs. Publication remains
  described as pending.
- `cli-publish.yml`, which verifies the candidate run, source commit, release
  tag, GitHub Release, tarball name, SHA-256, and embedded package metadata.
  Its protected job publishes the existing tarball without rebuilding it.
  Bootstrap credentials are available only to the first-publication step;
  later versions use stage-only OIDC.
- A candidate workflow restricted to `master` after successful hosted release
  CI, with checks rejecting a moved source commit.

Local verification passed on this working branch:

- CLI production typecheck, all 194 tests, and isolated tarball installation
  on macOS with Node.js 22.23.2 and 24.21.0. The 25 added regression cases cover
  artifact tampering, mismatched metadata, source drift, candidate-run identity,
  and public manifest requirements.
- CLI development, backend, and environment typechecks; all 44 backend tests.
- Web production build with the same synthetic public configuration used in CI.
- Documentation validation: 8 pages, 27 command paths, 71 examples, and 2 JSON
  examples. Skill evaluation manifest, reference routing, leakage validation,
  and skill structure checks passed.
- Release metadata, package dry run, actual tarball verification, focused
  Biome, and `git diff --check`.
- Both release workflows passed actionlint 1.7.12 (without optional ShellCheck).
- CLI production dependency audit: zero vulnerabilities. Repository production
  audit: one low finding and no moderate, high, or critical findings.

These are local source checks, not hosted CI evidence for this new diff. No
production login, financial mutation, GitHub settings change, deployment, npm
publication, or final candidate freeze was performed in this preparation pass.

## Remaining handoff and operator inputs

1. Review and merge the repository preparation changes into `master`. Wait for
   the full hosted CLI readiness suite, including macOS/Linux and Node.js 22/24,
   and verify the deployed public docs. Complete the source-handoff acceptance
   against the recorded Phase 8.10/8.11 terminal evidence; do not treat old
   evidence as final-candidate verification.
2. Create the GitHub `cli-release` environment with `master` and approved `v*`
   deployment rules and an available trusted reviewer where practical. Keep npm
   secrets environment-scoped; do not create the bootstrap token yet.
3. Verify your npm email, enable account 2FA, retain recoverable second-factor
   access, and complete interactive `npm login` / `npm whoami`. Record only the
   username and pass/fail state, never credentials or recovery codes.
4. Follow the runbook to create the matching `v0.1.0` Git tag and GitHub Release
   for the reviewed commit. Run `cli-release-candidate.yml` from that unchanged
   `master` with version `0.1.0`; download and retain the tarball, `SHA256SUMS`,
   and `SOURCE_COMMIT` together and record its workflow run ID.
5. Part 1 then verifies the frozen artifact against production, including the
   pending `ACCOUNT_SETUP_REQUIRED` fresh-user check and native Linux credential
   storage. Only after the applicable gates pass should the short-lived
   bootstrap token be created and the publish workflow approved. Continue with
   token removal, trusted-publisher setup, clean-user checks, and promotion as
   specified in the runbook.

Delete this temporary note when the CLI release ships.
