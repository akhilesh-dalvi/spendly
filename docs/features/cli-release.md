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

## Remaining handoff and operator inputs

- The source baseline still needs review. Hosted macOS/Linux CI passed on
  Node.js 22 and 24; the optional Convex CLI OAuth fix is awaiting fresh hosted
  checks and a successful Vercel preview. All 44 backend tests pass locally.
- Draft PR: https://github.com/akhilesh-dalvi/spendly/pull/9. The existing CLI
  work has been checkpointed and `master`'s documentation conflicts resolved.
- The GitHub repository currently has no CLI workflows on its default branch
  and no `cli-release` environment. The release runbook requires that
  environment to exist before running the candidate or publish workflow.
- Production authentication needs the approved Clerk OAuth public client ID.
  The compiled configuration still has `authReady: false` and `clientId: null`.
- The worktree now includes `master`'s approved AGPL-3.0-only root license;
  public npm metadata still needs to be finalized.
- Complete the protected environment, publication workflow, public docs,
  npm account checks, and final candidate freeze from the Part 0 checklist.

Delete this temporary note when the CLI release ships.
