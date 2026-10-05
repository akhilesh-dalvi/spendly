# Feature: CLI production release

**Status:** initial macOS read smoke complete; broader validation deferred

## Goal

Record the practical macOS acceptance evidence for published `spendly@0.1.2`
and retain the maintainer-deferred validation as unverified follow-up work.
The `v0.1.0`, `v0.1.1`, and `v0.1.2` tags and published bytes remain immutable.
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

## Published 0.1.2 and publishing cleanup (2026-10-04)

[PR #18](https://github.com/akhilesh-dalvi/spendly/pull/18) merged as
`11c239d36b5b5d06bed42ac84e02ad863fe90972`. The exact master commit passed
[hosted readiness run 37208727405](https://github.com/akhilesh-dalvi/spendly/actions/runs/37208727405),
including the macOS/Linux Node.js 22/24 matrix. Deployed signed-out quick-start
and troubleshooting pages returned 200 and described `0.1.2`.

- [Candidate run 37208868121](https://github.com/akhilesh-dalvi/spendly/actions/runs/37208868121)
  passed both protected jobs and created immutable `v0.1.2` at that commit.
- Tarball: `spendly-0.1.2.tgz`; SHA-256:
  `1fb9a5be9bf1fed6fa4cef77fdb348d222783f3e64e2c64086e004379a66d3e7`.
- Downloaded artifact identity, checksum, manifest, shrinkwrap, isolated install,
  installed version, JSON help, production configuration, and native macOS
  credential-store canary passed. Authentication files were byte-identical to
  the previous candidate; the maintainer's prior authentication waiver applies.
- [Publication run 37218324799](https://github.com/akhilesh-dalvi/spendly/actions/runs/37218324799)
  published those unchanged bytes with `--tag next`, public access, and signed
  provenance. Registry SHA-256 and integrity matched the frozen tarball.
  Provenance matched the source commit, repository, workflow, and publication
  run; `npm audit signatures` verified 53 registry signatures and 46 attestations.
  A clean global registry installation, version, JSON help, and all installed
  nested dependency versions against the shrinkwrap passed.
- npm maintainer identity: `akhileshdalvi`; interactive access, verified email,
  and 2FA passed. The protected GitHub `NPM_TOKEN` secret was removed; a fresh
  environment-secret listing was empty. The `spendly-first-publication` npm
  token was revoked through native npm CLI, and a fresh token listing confirmed
  no matching token remains. No credential values are retained in this record.
- Native `npm trust github` creation succeeded with repository
  `akhilesh-dalvi/spendly`, workflow `cli-publish.yml`, environment `cli-release`,
  and stage-only permission. `npm access set mfa=publish spendly` succeeded
  with maintainer 2FA, requiring 2FA without token overrides. The next actual
  release must prove OIDC staging; configuration alone does not prove it.
- The [GitHub Release](https://github.com/akhilesh-dalvi/spendly/releases/tag/v0.1.2)
  preserves the frozen assets and publication verification record.

npm assigned both `next` and `latest` to `0.1.2` despite `--tag next`. The
maintainer requested `next` until acceptance is complete. A native authenticated
`npm dist-tag rm spendly latest` attempt returned HTTP 400; both tags remain.
[npm's contributor confirms the initial dual-tag behavior](https://github.com/npm/cli/issues/8490).
This registry state is not release acceptance. The published README and help
retain their frozen preview wording; PR #19 corrected the source and deployed
Web docs for the published state without replacing the `0.1.2` tarball or tags.
Carry packaged wording corrections into the next planned version.

## Checklist audit (2026-10-05)

PR #19 merged at `04b1492f3e18ef1a51f8592cebca42ec3c60d38e`; its six required
checks, Vercel deployment, and five post-merge readiness jobs passed. The public
docs correction is deployed. The maintainer approved macOS-only initial release
acceptance; native Linux proof moves to the gate for advertising Linux support.

Fresh verification against the published package and public surfaces passed:

- Registry `next` and `latest` still resolve to `0.1.2`. The downloaded tarball
  matches the frozen SHA-256 above and registry SHA-512 integrity.
- A default registry install into a clean global prefix outside the monorepo on
  the existing Mac, using Node.js 24.21.0, returned `0.1.2`. Human/JSON help,
  nested agent help, and invalid-command JSON/exit code 2 passed. This is not a
  fresh operating-system or account test.
- Installed-package production `auth status`, `context`, `accounts list`,
  `expenses list --limit 1`, and `summary --current` passed with
  `--agent --json --non-interactive`. Only pass/fail evidence was retained;
  no financial writes, credential changes, or personal values were recorded.
- The public skills installer installed matching Spendly skill copies and all
  four references into clean project-scoped Codex and Claude Code layouts.
  The pinned CLI command and agent contract passed inspection. All ten static
  skill evaluation definitions passed validation; actual agent execution remains
  unverified.
- All eight production CLI docs pages returned HTTP 200 without authentication;
  six legacy redirects returned their expected destinations. Browser search for
  `KEYCHAIN_UNAVAILABLE` reached Troubleshooting's Sign-in and storage section.
  Published-package and skill documentation/reporting links resolved.
- Fresh production dependency audits found zero CLI vulnerabilities and one low
  repository finding, with no moderate, high, or critical production findings.
- The protected `cli-release` environment still has no npm token secret. The
  prior trusted-publisher creation, 2FA policy, bootstrap-token revocation, and
  signature/provenance results remain accepted evidence for unchanged bytes.

The checklist separates completed publication work, the maintainer-approved
practical initial scope, deferred validation, and recurring later releases.
Duplicate installs and full workflow reruns, a real 30-day wait, repeated accepted authentication, another
initial `latest` mutation, and a dummy OIDC-test release are unnecessary.

## Actual skill use and scope decision (2026-10-05)

The maintainer explicitly requested using the local `$spendly` skill for whatever
could be viewed, chose not to require exhaustive verification now, and will
address later findings as they arise. This Codex session loaded the user-selected
skill and read references, discovered installed command help, and used only the
local `spendly@0.1.2` CLI with `--agent --json --non-interactive`.

Ten distinct read commands passed: authentication status, context, accounts,
cycles, categories selected by current cycle ID, tags, account types,
current-cycle expenses, expense detail selected by a returned ID, and summary.
Identity matching, expense detail/list amount and revision, cycle/category ID
consistency, and the complete current-cycle expense page versus summary total
passed. The summary correctly includes an uncategorized bucket even when the
category list is empty. Categories without an explicit cycle correctly returned
`NON_INTERACTIVE_INPUT_REQUIRED` and exit 2; the ID-selected command succeeded.
No bug was found in the exercised read scope. Only pass/fail evidence is retained;
no personal values or identifiers, credentials, or financial writes were recorded.

This establishes actual Codex read-only skill use with the signed-in account.
It does not establish fresh-session or Claude Code execution, mutation previews
or commits, account detail/ledger behavior without an account, fresh-user setup,
or production administrative state. The maintainer chose to proceed with initial
macOS availability on this practical evidence and defer the following exercises;
no unchecked exercise is represented as passed.

## Deferred validation

- Fresh-user `ACCOUNT_SETUP_REQUIRED` using an identity without Spendly Web setup.
- Aggregate completion evidence for all three production migrations and live
  cleanup-cron state; this is an evidence gap, not proof migrations are unnecessary.
- Synthetic financial mutations and Web reconciliation of balances, ledger, and
  CLI/agent provenance; account detail/ledger reads had no active account to select.
- Skill-driven mutation previews and actual fresh Claude Code skill use.

Before advertising Linux support, obtain native Secret Service, authentication,
and clean-user installation evidence; hosted matrix results do not establish
native desktop storage. On the next actual `0.x` release, prove OIDC staging
without an npm write token, inspect scans and bytes, approve with maintainer 2FA,
and explicitly promote to `latest` after affected checks and acceptance. Neither
requires an additional publication for initial macOS availability.

Delete this temporary note when the release audit ships.
