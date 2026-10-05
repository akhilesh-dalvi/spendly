# Spendly CLI Release Runbook

## Scope and Release Identity

This runbook prepares and releases the CLI without mixing repository checks
with production changes. Phases 8.7, 8.8, 8.9, 8.10, 8.11, and 8.12 may build
and retain a non-production artifact. Phase 9 alone may configure production,
deploy, publish to npm, or write synthetic production data.

Every release starts from a reviewed commit on `master`. The package version,
tag (`v<VERSION>`), GitHub Release, tarball name, and release notes must use the
same exact SemVer. Build one tarball in the protected `cli-release` GitHub
environment, record its SHA-256 and source commit, and publish that artifact
without rebuilding it. A published version is immutable.

The initial public version is exactly `spendly@0.1.2`, with no prerelease
suffix. It was published with `--tag next`. npm also assigned `latest` on the
first publication, and an authenticated removal attempt returned HTTP 400.
On 2026-10-05 the maintainer accepted practical macOS installation,
authentication, production reads, and actual Codex `$spendly` read-only skill
use, choosing to defer broader validation and address later findings as they
arise. Deferred exercises remain unverified in Phase 9 Part 2; this scope decision
does not prove every workflow. Later candidates require affected checks and
explicit acceptance before moving the unchanged package to `latest`. Continue
with `0.1.x` fixes and later `0.x` feature or contract releases. Phase 9 does not
publish `1.0.0`; that milestone requires a later decision supported by real user adoption and contract
stability.

The original `0.1.0` candidate was frozen but never published to npm. Its
`v0.1.0` tag remains at `73b593f7345caaa55399b1f74785b463205709e9`.
After `master` advanced, the source-drift guard invalidated it for publication.
The `0.1.1` replacement was frozen at
`fd38265ec3d52046b4510adc9deaf887510a9f24`, but its publication failed before
reaching npm: the tarball argument lacked the explicit `./` prefix and npm
interpreted it as a GitHub repository. The corrected workflow requires a new
source freeze, so the first-publication target was `0.1.2`. Its bootstrap
publication succeeded in [run 37218324799](https://github.com/akhilesh-dalvi/spendly/actions/runs/37218324799).
Trusted publishing is now configured for stage-only releases, and the temporary
publishing secret and npm token have been removed. Never move `v0.1.0`,
`v0.1.1`, or `v0.1.2`.

The maintainer accepted the successful `0.1.0` production authentication
results after review confirmed unchanged authentication runtime logic, and
waived repeating those tests. This does not establish the separate fresh-user
check, which remains unverified. Initial acceptance is macOS-only, as approved
by the maintainer on 2026-10-05. Native Linux credential storage, authentication,
and clean-user installation remain required before Linux support is advertised;
keep the hosted Linux Node.js 22/24 matrix as an automated release gate.

## Phase 8.7 through Phase 8.12 Source Baseline Gate

1. Run `.github/workflows/cli-ci.yml` on Node.js 22 and 24 for macOS and Linux.
2. Run `.github/workflows/cli-release-candidate.yml` with the exact package
   version as a non-production reproducibility check. Preserve its
   `SHA256SUMS` and `SOURCE_COMMIT` as baseline evidence; Phase 9 will create a
   new final artifact after production configuration and package finalization.
3. Confirm `apps/cli/package.json`, `npm-shrinkwrap.json`, installed
   `spendly --version`, the tarball name, tag, and release notes agree.
4. Confirm the working tree and candidate commit are unchanged after the gate.
5. Confirm the Phase 8.8 guided-input suite, redirected-I/O checks, prompt
   dependency audit, and supported-terminal smoke tests passed before recording
   the candidate.
6. Confirm the Phase 8.9 help, prompt, responsive-output, pagination, preview,
   error-recovery, accessibility, and shell-completion automated gates passed.
7. Confirm the maintainer completed the Phase 8.10 no-write interactive terminal
   checklist and sign-off record against this exact candidate.
8. Confirm Phase 8.11 extracted the headless operation boundary, passed its
   non-shipping MCP v2 compatibility harness, excluded MCP dependencies from
   the CLI tarball, and repeated every affected Phase 8.10 manual check.
9. Confirm Phase 8.12 recorded the Raycast reuse, separate OAuth, native UI,
   and public Store packaging boundaries; accepted the `raycast` provenance
   origin; and added no Raycast dependency or entrypoint to the CLI tarball.

The historical baseline candidate runs above are non-production evidence. The
current candidate workflow is restricted to reviewed `master` with successful
CLI release CI and now freezes the production publication candidate.

Phases 8.7 through 8.12 hand off a reviewed source baseline, not the publishable
tarball. Phase 9 may make only the production-configuration, public-package,
documentation, and publication-workflow changes listed below. Those changes
require the complete affected gates to run again before the publication
candidate is frozen. Changing the source selected for publication requires a
new candidate run and version; the recorded artifact and tags stay immutable.
Post-publication documentation changes do not replace the published package.

## Phase 9 Release Preparation

Complete this section before production deployment or npm publication. The
GitHub and npm website steps are maintainer actions because they change external
security and publishing state.

### Production Configuration and Public Package Metadata

1. Select and approve the public software license. Add the root license file and
   the matching `license` field in `apps/cli/package.json`.
2. Remove `private: true` from `apps/cli/package.json`. Extend `release:check` so
   a private or unlicensed package cannot reach a release workflow.
3. Confirm the npm README, repository, homepage, bugs URL, keywords, Node engine,
   `files`, `bin`, and `publishConfig` values describe the public package.
4. Run `npm pack --dry-run` and the repository package verifier. Confirm the
   tarball contains the license, README, `package.json`, shrinkwrap, executable,
   and production output, with no source-only configuration or secrets.
5. Create the production Clerk OAuth public client and confirm the approved
   production Convex, Clerk, Web, and documentation endpoints. Compile only
   public identifiers into the CLI, set `authReady` to `true`, and ensure no
   development selector, endpoint, credential, or secret enters `dist` or the
   tarball.
6. Put the stable production `/docs/cli` URL and exact initial-release
   instructions in the npm README, installed CLI help, default-branch skill,
   and public Web documentation.
7. Create `.github/workflows/cli-publish.yml` on `master`. The publish job must:
   - run on a GitHub-hosted Ubuntu runner with Node.js 24 and npm 11.15 or newer;
   - use `contents: read` and `id-token: write` only;
   - use the `cli-release` environment;
   - accept the recorded candidate workflow run, source commit, version, tarball
     filename, and SHA-256 as explicit inputs;
   - download the candidate artifact, verify its hash and embedded version, and
     publish that tarball without running a build or changing tracked files; and
   - use a temporary `NPM_TOKEN` fallback only for the first publication, then
     use npm trusted-publisher OIDC for later releases.

The publish workflow has two jobs. `prepare` has `contents: read` and
`actions: read` to verify the successful candidate run and download its artifact.
It uploads the verified bytes as a same-run artifact. The protected `publish`
job has only `contents: read` and `id-token: write`; it downloads those bytes,
rechecks their hash, embedded metadata, current `master`, and release tag after
approval, and never builds or installs the candidate. Only the bootstrap publish
step receives `NPM_TOKEN` through `NODE_AUTH_TOKEN`.

Dispatch `cli-publish.yml` from `master` with these recorded inputs:

| Input | Value |
| --- | --- |
| `candidate_run` | Successful `cli-release-candidate.yml` run ID |
| `source_commit` | Full reviewed `master` commit SHA, also in `SOURCE_COMMIT` |
| `version` | `0.1.2` for the initial release |
| `tarball` | `spendly-0.1.2.tgz` for the initial release |
| `sha256` | Exact lowercase SHA-256 from `SHA256SUMS` |
| `bootstrap` | `true` only for first publication; `false` for later `0.x` releases |

Both release workflows must run from `master`. A successful CLI readiness
push run on that same commit is required; a passing PR run alone is insufficient.
The publish workflow also requires `v<VERSION>` to identify that commit and a
published GitHub Release with release notes. If `master` changes, prepare and
review a new candidate before proceeding. Never dispatch publication merely to
test the workflow: bootstrap publication and OIDC staging change npm state.

### Protected GitHub Environment

1. In `akhilesh-dalvi/spendly`, open **Settings → Environments** and create the
   exact environment `cli-release` before running a workflow that references it.
2. Restrict deployments to `master` and approved `v*` release tags. Add a
   trusted required reviewer when another authorized maintainer is available;
   do not enable a self-review restriction that makes a sole-maintainer release
   impossible.
3. Do not store an npm token yet. The bootstrap token is created only after the
   final artifact passes review and is revoked immediately after publication.

### Publication Candidate Freeze

1. Run the complete CLI, backend, Web, documentation, skill, dependency,
   leakage, package, macOS, hosted Linux, Node.js 22, and Node.js 24 gates against
   the production-configured source. Native Linux acceptance is required before
   advertising Linux support, separately from initial macOS acceptance.
2. Review and merge that exact commit to `master` and wait for its complete
   CLI readiness suite to pass.
3. Run `.github/workflows/cli-release-candidate.yml` with version `0.1.2` from
   the reviewed commit and approve its protected jobs. After the artifact is
   verified and uploaded, a separate job automatically creates `v0.1.2` at that
   exact commit. Download the artifact and preserve its `SHA256SUMS` and
   `SOURCE_COMMIT`. Create the GitHub Release and release notes using that
   existing tag (`gh release create v0.1.2 --verify-tag`); do not publish npm yet.
4. Confirm the embedded package version, installed `spendly --version`, tarball
   filename, tag, release notes, source commit, and hashes agree. This artifact
   is the immutable publication candidate.
5. Keep the candidate tarball, `SHA256SUMS`, and `SOURCE_COMMIT` together. Stop
   if the publish-workflow input, current `master`, tag, GitHub Release, package
   version, or recorded hash disagrees.

Every later release follows the same naming rule: package `0.1.2` produces
`v0.1.2`, package `0.2.0` produces `v0.2.0`, and so on within the approved `0.x`
release policy. Update the package and shrinkwrap versions together before
merging; the workflow checks that its version input matches the package.
Only the separate tagging job has `contents: write`. Build and npm publication
jobs retain their existing permissions, and the tagging job installs no
package dependencies or npm credentials.

Rerunning the candidate workflow reuses an existing tag only if it resolves to
the same commit, including annotated tags. A tag at a different commit stops
the workflow; select a new version instead of moving or deleting the tag.
The tag identifies the frozen source candidate and can therefore exist before
npm publication or staging approval. Failed candidate builds create no tag,
and a successful candidate run now requires successful tagging. The publish
workflow still verifies that tag against the recorded source before publishing.

### npm Maintainer Account

1. Sign in to npmjs.com, verify the account email, enable account 2FA, and store
   recovery information outside the repository. Do not record recovery codes or
   authentication material in release evidence.
2. Run `npm login` and `npm whoami` interactively. Record only the expected npm
   username and pass/fail state.
3. Immediately before first publication, run `npm view spendly`. A `404` shows
   only that no public package is visible at that moment; it does not reserve the
   name. Stop if the name is owned by someone else.

## Production Authentication

Perform these steps in Phase 9 and record only identifiers and pass/fail
results that are safe to share. Never record tokens, secrets, authorization
URLs, headers, credential-store contents, or personal financial data.

1. Verify the production Clerk OAuth application is a public client with
   Authorization Code, PKCE S256, consent, refresh tokens, only the approved
   identity scopes, and loopback callbacks on `127.0.0.1` with the CLI's
   random-port callback path. Confirm there is no client secret.
2. Set the same public client ID as `CLERK_CLI_OAUTH_CLIENT_ID` in the
   production Convex deployment. Keep the existing production Clerk issuer.
3. Confirm the frozen candidate contains that public client ID, has `authReady`
   set to `true`, uses only approved production endpoints, and contains no
   development selector or credential. Do not rebuild the candidate here.
4. Repeat the Phase 0 proof against production: state and PKCE validation,
   exact issuer and audience, subject-to-Spendly-user mapping, refresh inside
   the 30-day authorization window, forced browser login after expiry,
   provider revocation, and local credential removal on logout.
5. Verify `ACCOUNT_SETUP_REQUIRED` with a separate user who has not completed
   Spendly Web setup. Do not weaken issuer or audience validation to fix an
   integration failure.

## Backward-compatible Deployment

1. Confirm every existing `cli/v1` query and mutation remains compatible with
   the oldest supported `0.x` release. Add fields as optional and add endpoints
   before any client depends on them. Do not rename or remove a live contract.
2. Deploy the additive Convex backend first and run its generated/type checks.
3. Complete the resumable migrations below and verify the cleanup cron.
4. Deploy Spendly Web and verify direct-CLI and AI-agent provenance surfaces.
5. Deploy `/docs/cli` and verify signed-out access, search, redirects, and the
   exact release-preview instructions.
6. Re-run the candidate checks against the deployed compatible services.
7. Publish the already-verified CLI artifact last.

For a breaking future contract, add a new facade version and keep `cli/v1`
available until every supported package version has been retired.

## Resumable Production Migrations

Run one page at a time from the reviewed source checkout. For the first page,
pass `{}`. For each later page, pass the returned opaque cursor as
`{"cursor":"<continueCursor>"}`. Never edit or infer a cursor. Record the
function name, timestamp, source commit, per-page `updated` count, total count,
and final `isDone: true`; do not record row contents or identifiers.

```bash
pnpm --dir packages/backend exec convex run --prod cli/v1/maintenance:initializeExpenseRevisions '{}'
pnpm --dir packages/backend exec convex run --prod cli/v1/maintenance:initializeExpenseSearchFields '{}'
pnpm --dir packages/backend exec convex run --prod cli/v1/maintenance:initializeAccountRevisions '{}'
```

The mutations are idempotent, so an interrupted migration resumes from its
last recorded cursor. After all three report `isDone: true`, confirm the
hourly `clean expired CLI capabilities` cron is scheduled. Run
`cli/v1/maintenance:cleanupExpired` once only if the release operator has
approved the cleanup check; record aggregate deletion counts only.

## Production Smoke-test Account

Use a dedicated release account with no maintainer history. Name synthetic
records with the version and run date, for example `CLI RC 0.1.2 checking` and
`CLI RC 0.1.2 lunch`. Use small non-sensitive amounts in one currency.

Allowed smoke mutations are one expense add/edit/delete, one account
add/edit/archive/reactivate/default change, one balance adjustment, and
one same-currency transfer. Preview every destructive or balance-affecting
command, use fresh idempotency keys, and reconcile the resulting account
balances and ledger entries in Spendly Web. Verify direct CLI and
`--agent --json --non-interactive` provenance separately.

Delete the synthetic expense through its confirmation flow. Because accounts
and ledger history are retained, archive synthetic accounts after reconciling
them instead of trying to erase history. Keep only aggregate pass/fail evidence.

## npm Publication Controls

### First Publication Bootstrap

The initial `spendly@0.1.2` publish cannot use npm trusted publishing or staged
publishing because the package does not exist yet. The publication-mode guard
permits bootstrap only for `0.1.2`, rejects superseded `0.1.0` and `0.1.1`, and requires
the registry to return 404. Bootstrap it once from the approved GitHub-hosted
workflow so the first package still receives provenance.

1. On npmjs.com, open **Profile → Access Tokens → Generate New Token** and use:
   - name: `spendly-first-publication`;
   - expiration: one day;
   - packages and scopes: `Read and write (publish and stage)`;
   - package selection: all packages, because `spendly` is not selectable yet;
   - organizations: no access; and
   - bypass 2FA: enabled for this one non-interactive direct publication.
2. Copy the token once into the `cli-release` environment secret `NPM_TOKEN`.
   Never place it in a file, shell history, workflow input, output, artifact, or
   release record. In the first-publication step only, expose that secret to npm
   using `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. Do not expose it to build,
   test, inspection, or artifact-upload steps.
3. Approve the protected workflow only after independently checking the source
   commit, tarball SHA-256, package name and version, npm account, and current
   package-name availability.
4. Publish the downloaded tarball, not the package directory:

   ```bash
   npm publish "./release-artifacts/spendly-0.1.2.tgz" \
     --tag next \
     --access public \
     --provenance
   ```

5. Verify `spendly@0.1.2`, the `next` tag, public access, repository link,
   provenance, integrity, tarball files, README, and clean global installation.
   Run `npm audit signatures` from the clean installed package.
6. Record all observed dist-tags. npm's first publication receives `latest` as
   well as the requested tag, as confirmed in [npm/cli #8490](https://github.com/npm/cli/issues/8490).
   For `0.1.2`, removing `latest` with maintainer 2FA returned HTTP 400. Do not
   infer release acceptance from this registry state or unpublish the immutable
   package to simulate a `next`-only first release. The initial macOS scope
   decision and deferred validation are recorded in Phase 9 Part 2; later
   candidates use `next` before explicit promotion.

### Trusted Publisher and Token Removal

After the first package page exists, configure the permanent release identity
on npmjs.com under **Packages → spendly → Settings → Trusted publishing**:

| npm field | Exact value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `akhilesh-dalvi` |
| Repository | `spendly` |
| Workflow filename | `cli-publish.yml` |
| Environment name | `cli-release` |
| Allowed actions | `npm stage publish` only |

The browser form does not validate these values when saved. Compare spelling,
case, and the workflow extension against the committed default-branch file.
Alternatively, npm 11.15 or newer supports native CLI configuration with
interactive maintainer 2FA:

```bash
npm trust github spendly --file cli-publish.yml \
  --repo akhilesh-dalvi/spendly --env cli-release \
  --allow-stage-publish --no-allow-publish --yes
```

The CLI validates configuration fields; its successful response must name the
expected identity and stage-only permission. Do not create a second connection
if the correct one already exists. The first real later release must still prove
OIDC staging end to end. See [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
and [trusted publishing](https://docs.npmjs.com/trusted-publishers/).

Then complete all of these steps in the same maintenance window:

1. Under **Settings → Publishing access**, select **Require two-factor
   authentication and disallow tokens**, then save with interactive 2FA. The
   CLI equivalent is `npm access set mfa=publish spendly`; `automation` would
   allow token overrides and is not the selected policy.
2. Delete `NPM_TOKEN` from the GitHub `cli-release` environment.
3. Revoke `spendly-first-publication` from npm **Access Tokens**.
4. Confirm no repository, environment, organization, or personal write token
   remains for routine publishing. The next real `0.x` release will be the first
   end-to-end validation of the saved OIDC identity; a mismatch must fail closed
   and be corrected on npmjs.com rather than bypassed with another token.

### Later `0.x` Releases

1. Build and record one immutable candidate with the same candidate gate.
2. Run `cli-publish.yml` without `NPM_TOKEN`. The workflow must use OIDC and:

   ```bash
   npm stage publish "./release-artifacts/spendly-<VERSION>.tgz" --tag next
   ```

3. On npmjs.com, open the staged-package view, wait for scanning to complete,
   inspect or download the exact tarball, and approve or reject it with
   maintainer 2FA.
4. Verify the published version, provenance, signatures, `next` tag, package
   contents, clean installation, and affected product workflows.

### Promote the Validated Package to `latest`

This runbook configures the trusted publisher for staging only, without direct
publication or dist-tag permissions. npm already assigned `latest` to the
initial `0.1.2` publication; its presence is not user-availability evidence.
The maintainer's practical macOS acceptance and deferred broader checks are
recorded in Phase 9 Part 2. No further tag mutation is needed for `0.1.2`.
For later candidates, use an interactive maintainer session with
2FA to promote the exact validated version. Substitute that later version for
`0.1.2` in the example below:

```bash
npm login
npm dist-tag add spendly@0.1.2 latest
npm dist-tag ls spendly
```

Confirm both `next` and `latest` resolve to `0.1.2`, then verify a clean default
`npm install --global spendly`. Do not rebuild or republish the package during
promotion. For later releases, substitute the exact validated `0.x` version.

The default-branch skill, skills.sh cache, public docs, installed help, and npm
README must describe commands supported by the published CLI. Contract-changing
`0.x` fixes require a new package version and a coordinated docs/skill update.

## Recovery

Stop rollout immediately on authentication, ownership, data-integrity,
provenance, or credential leakage findings.

1. Move `next` back to the last known-good version. Do not overwrite or
   unpublish the faulty version; deprecate it with a concise upgrade message
   when users could be harmed by installing it.
2. Roll Spendly Web back first if the UI is incompatible. Roll the backend back
   only to a revision that remains compatible with all published `cli/v1`
   clients and the additive schema. Never reverse completed data migrations by
   deleting migrated fields during incident response.
3. For a publisher or provenance incident, disable the trusted-publisher
   configuration, revoke bootstrap or automation credentials, rotate affected
   credentials, and preserve the workflow logs and artifact hashes.
4. For a public OAuth-client incident, disable or replace the client, revoke
   affected grants, update Convex and the CLI together, and publish a new
   SemVer version. A public client ID is not a secret, but tokens and grants are.
5. Correct documentation and the default-branch skill immediately when they
   could lead users to unsafe behavior. Re-run the affected Phase 8.7, Phase
   8.8, Phase 8.9, Phase 8.10, Phase 8.11, Phase 8.12, and Phase 9 checks before
   restoring `next` or promoting `latest`.

## npm Operational References

- [Creating and publishing unscoped public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)
- [Creating and viewing granular access tokens](https://docs.npmjs.com/creating-and-viewing-access-tokens/)
- [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/)
- [Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements/)
- [Staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
- [Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/)
- [Managing npm dist-tags](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/)
