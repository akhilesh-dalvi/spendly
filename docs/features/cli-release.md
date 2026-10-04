# Feature: CLI production release

**Status:** in progress

## Goal

Complete Phase 9 Part 0's source handoff, production configuration, public
package metadata, and replacement publication candidate for `spendly@0.1.2`.
The superseded `v0.1.0` and `v0.1.1` tags must remain unchanged.
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

This historical evidence verifies the October 1 source configuration, not a
frozen publication artifact. Repeat authentication against the replacement candidate;
the separate production `ACCOUNT_SETUP_REQUIRED` user check is still pending.

## Part 0 repository preparation (2026-10-02)

Production authentication is merged into `master` through PR
https://github.com/akhilesh-dalvi/spendly/pull/10 at
`80655a5d2ab7470bf80b966d7a39491214e25751`; its hosted CLI readiness workflow
passed. The earlier note that authentication still needed merging is resolved.

The October 2 repository preparation, subsequently merged into `master`, included:

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

Local verification passed on that preparation branch:

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

These were local source checks from that preparation pass. No
production login, financial mutation, GitHub settings change, deployment, npm
publication, or final candidate freeze was performed in this preparation pass.

## Frozen 0.1.0 candidate and supersession (2026-10-03)

- The protected `cli-release` environment exists, allows `master` and `v*`,
  and requires the maintainer's approval. The publication and automatic tagging
  workflows are on `master`. The candidate packaging-path fix shipped in
  [PR #15](https://github.com/akhilesh-dalvi/spendly/pull/15).
- [Candidate run 37050681992](https://github.com/akhilesh-dalvi/spendly/actions/runs/37050681992)
  passed both build and tagging jobs. Source and unchanged `v0.1.0` tag:
  `73b593f7345caaa55399b1f74785b463205709e9`.
- Retained artifact: `spendly-0.1.0.tgz`; SHA-256:
  `60bdcbfcaeaa04a99fcb132e59aec70489bd3963e1a27b21222da5257258b469`.
  Downloaded checksum, embedded metadata, source record, isolated installation,
  installed `0.1.0` version, and help were verified. Public `/docs/cli` loaded
  while signed out.
- Tests imported the installed artifact's unchanged authentication modules on
  macOS with Node.js 24.21.0 and isolated native Keychain entries. Browser login,
  PKCE flow, invalid callback state rejection, wrong issuer/audience/nonce
  rejection, forced refresh, Clerk-to-Convex identity matching, logout,
  provider revocation, revoked-refresh rejection, and local cleanup passed.
- A simulated 30-day clock boundary required login, removed local credentials,
  and revoked the refresh token. This was not a 30-day elapsed test.
- The attempted fresh-account login resolved to the existing identity. The
  maintainer confirmed only that account is available. `ACCOUNT_SETUP_REQUIRED`
  remains unverified; no missing-user pass is claimed. Authentication checks
  created no financial records. Test sessions were revoked and removed.
- Temporary raw test files were cleared before resume; the authentication
  results above were recovered from captured command output. The artifact was
  downloaded and its identity verified again afterward.
- [PR #16](https://github.com/akhilesh-dalvi/spendly/pull/16) advanced `master` to
  `36d42b8034c913f7101b12e75fbe4be2dfbd6316`, including CLI source changes.
  The source-drift guard therefore blocks publishing the old candidate.
  No GitHub Release or npm publication was created.

The approved replacement is `0.1.1`, including its manifest, shrinkwrap,
versioned installation guidance, and first-publication guard. Keep `v0.1.0`
where it is. The old test results are historical evidence and do not certify
`0.1.1`; its source commit, candidate run, checksum, and production results
will be recorded only after the new gates pass.

## Replacement preparation verification (2026-10-03)

Local checks on Node.js 24.21.0 passed: CLI production and development
typechecks, all 220 tests (including 16 publication-mode cases), isolated
`spendly-0.1.1.tgz` installation and command contracts, full Knip, focused Biome,
and `git diff --check`. CLI production dependency audit reported zero
vulnerabilities. The docs validator checked 8 pages, 27 command paths, 71
examples, and 2 JSON examples; skill validation covered 10 evaluations.
Both release workflows passed actionlint 1.7.12 with optional ShellCheck
integration disabled. Hosted macOS/Linux and Node.js 22/24 checks, post-merge
CI, the protected candidate freeze, and production acceptance are still pending.

## Frozen 0.1.1 candidate and publication-path failure (2026-10-04)

[PR #17](https://github.com/akhilesh-dalvi/spendly/pull/17) merged as
`fd38265ec3d52046b4510adc9deaf887510a9f24`. All seven PR checks and the
post-merge CLI readiness suite passed. Production Web documentation deployed.
[Candidate run 37134077156](https://github.com/akhilesh-dalvi/spendly/actions/runs/37134077156)
passed both protected jobs and created immutable `v0.1.1` at that commit.

- Tarball: `spendly-0.1.1.tgz`; SHA-256:
  `bfceb0f72e880866c90fa98a54b8dfba907d9dba843f13c6c49294cd59ba1b63`.
- Downloaded artifact identity, checksum, embedded metadata, isolated install,
  installed version, JSON help, production configuration, and native macOS
  credential-store canary passed.
- The maintainer accepted prior `0.1.0` authentication evidence and waived a
  repeat after source review found only unused-export removals, with unchanged
  authentication runtime logic. Fresh-user and native Linux credential-store
  checks remain unverified.
- The matching GitHub Release was published. The maintainer confirmed verified
  npm email and 2FA and added `NPM_TOKEN` to the protected environment.
- [Publication run 37207697687](https://github.com/akhilesh-dalvi/spendly/actions/runs/37207697687)
  passed source and artifact checks, then failed before registry publication:
  npm interpreted `release-artifacts/spendly-0.1.1.tgz` as a GitHub repository.
  npm requires an explicit `./` prefix for a relative tarball path. The registry
  still returned 404 for `spendly` after the failure.

The recovery fixes both bootstrap and staged tarball paths. The source-drift
and immutable-tag checks remain intact, so the next candidate is `0.1.2`.
Bootstrap is restricted to this replacement; both old versions are rejected.
CLI authentication runtime logic and dependencies remain unchanged.

Local recovery checks passed on Node.js 24.21.0: all 224 CLI tests (including
an actual npm dry run using the workflow's bootstrap argument), both CLI
typechecks, packed installation and command contracts, full Knip, focused
Ultracite, actionlint, documentation and skill validators, and `git diff --check`.
A separate dry run with the pinned npm 11.15.0 confirmed local tarball resolution.
No registry publication occurred during these checks.

## Remaining handoff and operator inputs

1. Merge the publication-path recovery, wait for hosted readiness on its exact
   `master` commit, and verify deployed `0.1.2` installation instructions.
2. Freeze `0.1.2` through the protected candidate workflow, preserve its source
   and checksum records, verify its automatic tag, and create its GitHub Release.
   Avoid merging further changes between freeze and publication.
3. Publish that unchanged tarball on `next` through the protected workflow.
   Verify registry integrity and provenance, then remove the GitHub bootstrap
   secret and revoke the npm token. Configure the runbook's trusted publisher.
4. Complete remaining fresh-user, native Linux, production smoke and migration,
   and clean-user acceptance evidence before declaring the entire release
   accepted or promoting it to `latest`.

Delete this temporary note when the CLI release ships.
