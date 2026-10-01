# Spendly CLI Phase 8.7: Pre-release Hardening and Release Readiness

## Status

- Status: In progress; repository hardening, Phase 8.8 guided interactive
  inputs, Phase 8.9 human CLI UX polish, Phase 8.10 maintainer terminal
  verification, Phase 8.11 MCP reuse readiness, and Phase 8.12 Raycast reuse
  readiness are complete; the hosted CI matrix and release-ready source handoff
  remain release gates; independent agent response evaluations are optional;
  Phase 9 owns production configuration and the immutable publication artifact
- Last updated: 2026-10-01
- Branch: `feature/spendly-cli`
- Depends on: completed Phases 0-6, the Phase 7 skill candidate, and completed
  Phases 8, 8.5, and 8.6
- Blocks: final Phase 8.8 validation, Phase 8.9 implementation, Phase 8.10
  manual verification, Phase 8.11 MCP reuse readiness, Phase 8.12 Raycast reuse
  readiness, and Phase 9 packaging, production deployment, and npm publication
- Exit criterion: the release candidate, documentation, supported-runtime
  policy, dependency strategy, production runbooks, publishing controls, and
  recovery procedures are internally consistent and verified without deploying
  to production or publishing to npm

## Boundary

Phase 8.7 closes work that should not be discovered while a production release
is already in progress. It may change code, tests, package metadata, CI, internal
documentation, and release-preview public documentation.

It does not:

- create or publish an npm version;
- assign an npm dist-tag;
- deploy the Convex backend or Spendly Web to production;
- enable the production Clerk OAuth application; or
- run mutations against a production Spendly user.

Those external release actions remain in Phase 9.

Phase 8.8 adds the reviewed interactive prompt dependency and human input
layer. Phase 8.9 may change human help, rendering, prompt presentation, errors,
and terminal dependencies before the candidate is frozen. Phase 8.10 verifies
the combined experience in a real terminal. Every affected Phase 8.7 gate must
be repeated after all three phases are complete.

## Checklist

### Runtime and Package Reproducibility

- [x] Replace the Node.js 20 baseline with supported LTS releases. Set the CLI
      engine and user documentation to Node.js 22 or newer, test Node.js 22 and
      24, and use a release runner that meets npm trusted-publishing requirements.
- [x] Choose and implement one reproducible production-dependency strategy:
      exact runtime versions, a published lock such as `npm-shrinkwrap.json`, or
      a reviewed bundle. Do not claim exact dependency locking while installed
      users can resolve unreviewed caret-range updates.
- [x] Extend tarball verification to inspect the final packed `package.json`,
      dependency tree, executable mode, package size, and file list; reject
      `workspace:`, `catalog:`, local paths, development configuration, secrets,
      and unintended internal-package metadata.
- [x] Make the CLI version single-source or add an automated equality check for
      `apps/cli/package.json`, `CLI_VERSION`, generated help/JSON, the tarball
      filename, release tag, and release notes.

### Production and Recovery Runbooks

- [x] Document the exact production authentication sequence: create the public
      Clerk OAuth client, configure its approved callbacks and scopes, set
      `CLERK_CLI_OAUTH_CLIENT_ID` for production Convex, compile the same public
      client ID into the CLI, and repeat strict issuer, audience, subject,
      refresh, and revocation proofs.
- [x] Document the backward-compatible production deployment order for Convex,
      Spendly Web, public documentation, and the CLI, including a compatibility
      check for every already-published `cli/v1` client.
- [x] Add a resumable production migration checklist for expense revisions,
      account revisions, and normalized expense-search fields. Require every
      cursor to reach `isDone: true`, record counts without personal data, and
      verify the expired-capability cleanup cron after deployment.
- [x] Define release recovery before publishing: Web/backend rollback order,
      npm dist-tag rollback, package deprecation criteria, credential or
      provenance incident handling, and the rule that a published npm version
      is immutable and every correction receives a new SemVer version.
- [x] Define a dedicated production smoke-test user, synthetic records, allowed
      mutations, reconciliation evidence, and cleanup/archive procedure so
      release testing never alters a maintainer's personal financial history.

### npm and Release Controls

- [x] Approve the npm publication design: trusted publishing through OIDC from
      a protected hosted CI environment, narrowly scoped workflow permissions,
      maintainer 2FA, no long-lived publish token, an explicit first-publication
      bootstrap, and staged approval for later releases when available.
- [x] Define the exact release source and artifact flow: reviewed commit on
      `master`, immutable Git tag, GitHub Release and notes, one verified tarball
      built in CI, npm provenance, registry integrity checks, and
      `npm audit signatures` verification after installation.
- [x] Clarify the freeze boundary: Phase 8.7 through Phase 8.12 hand a reviewed
      source baseline to Phase 9; Phase 9 adds only approved production
      identifiers, public package metadata, documentation, and the publication
      workflow, reruns all affected gates, and then freezes the immutable
      publication candidate.
- [x] Add CI that enforces frozen dependency installation, focused
      CLI/backend/Web typechecks, format and lint checks, automated tests,
      production builds, documentation and skill validation, dependency and
      leakage audits, version equality, and tarball inspection before Phase 9.

### Contract and Documentation Alignment

- [x] Update every normative AI-agent workflow to use
      `--agent --json --non-interactive`, while preserving clearly labeled
      historical human or direct-CLI evidence where provenance was not part of
      the tested phase.
- [x] Refresh Phase 7 for the current 99-line skill and troubleshooting
      reference, automated bundle validation, and installation evidence.
- [x] Clarify Phase 8 as locally verified documentation implementation whose
      public production deployment remains a Phase 9 gate; do not describe a
      local route as an already-public release.
- [x] Add missing Phase 0 and Phase 1 evidence links, distinguish
      development-complete phases from production acceptance, and correct the
      main-plan reference that currently labels the feature-spec scratch README
      as the Spendly documentation index.
- [x] Update the root README for `apps/cli`, the pinned pnpm version, current
      project focus, CLI development commands, and links to the public CLI docs.
- [x] Prepare separate verification and default-channel user copy:
      `spendly@next` during verification, default `spendly` after the same
      package reaches `latest`, supported platforms and Node versions,
      upgrades and uninstall, skills installer telemetry and
      `DISABLE_TELEMETRY=1`, public issue reporting, and a private security
      reporting route.
- [x] Define how the npm package, Git release, default-branch Spendly skill,
      skills.sh cache, installed help, and public documentation remain on a
      compatible contract throughout `0.x` fixes and channel promotion.

### Final Readiness Gate

- [ ] Pass the complete non-production source-baseline suite and record the
      commit and artifact hashes: CLI/backend/Web checks, development
      authentication and workflows, docs validation, skill validation, package
      installation, and `git diff --check`.
- [ ] Confirm every Phase 8.7 item and the Phase 8.8, 8.9, and 8.10 human CLI
      checklists are complete, then hand one reviewed source baseline to Phase 9.
      Phase 9 must return here if production preparation changes the command,
      operation, safety, or user-facing contract rather than only the approved
      release metadata and production identifiers.

## Implementation Evidence

Repository hardening completed on 2026-09-13 without deploying production
services, publishing an npm package, or mutating a production Spendly account:

- The CLI now requires Node.js 22 or newer, and CI defines Node.js 22 and 24
  checks on Ubuntu and macOS.
- Runtime dependencies use exact versions and a generated
  `npm-shrinkwrap.json`. Release metadata validation rejects dependency drift,
  local protocols, internal package references, and version mismatches.
- The package verifier builds and packs once, audits the packed manifest and
  dependency lock, enforces a file and size allowlist, installs the tarball in
  isolation, and checks its executable, version, help, JSON, and exit-code
  behavior.
- The protected release-candidate workflow records the source commit and
  tarball checksum while the release runbook defines authentication,
  deployment, migration, smoke-test, npm publishing, and rollback procedures.
- Web release dependencies were upgraded to remove all high and critical
  production audit findings. The root production audit retains one moderate
  and one low finding; the isolated CLI production audit reports zero known
  vulnerabilities.
- Focused formatting and lint checks, CLI/backend/Web typechecks, 101 CLI
  tests, 37 backend tests, documentation validation, skill validation, the Web
  production build, and isolated tarball verification passed.
- All ten plan-only Codex response evaluations passed manual review against the
  frozen skill bundle with SHA-256
  `9494e956ceb3ddb64a6eafaef0029dd78e13f83ffbd9331dfb4193a65c83ca6f`.
  Responses contained no unsafe write instructions, retry violations, invented
  Spendly data, or credential and personal-data leakage detected during review.

The Claude Code executable was not available for the recorded evaluation.
Independent agent response evaluations are optional and do not block release.
Phases 8.9 through 8.12 now record completed local and terminal checks. The
hosted CI matrix, reviewed source-baseline commit, and recorded baseline artifact
hash remain mandatory gates before Phase 9 begins.

## Phase 8.8 through Phase 9 Handoff

Phase 8.8 adds the guided human input layer and repeats the affected hardening
checks. Phase 8.9 polishes discovery, prompt orientation, responsive output,
pagination, mutation feedback, errors, recovery, accessibility, and shell
ergonomics. Phase 8.10 verifies that experience in a real terminal. Phase 9 may
begin only after Phase 8.11 extracts and proves the shared headless operation
boundary, Phase 8.12 records the Raycast reuse boundary, and all
release-readiness checklists are complete. Phase 9 owns final public package and
production configuration, the immutable publication candidate, production
deployment and migrations, macOS/Linux release evidence, npm publication,
clean-user production verification, initial-release support, and promotion to
the default npm channel.
