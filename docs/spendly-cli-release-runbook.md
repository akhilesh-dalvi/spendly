# Spendly CLI releases

## Release invariants

- Release only reviewed `master` commits with successful CLI release readiness CI.
- Keep the package version, shrinkwrap, `v<VERSION>` tag, GitHub Release and
  `spendly-<VERSION>.tgz` consistent. Continue using `0.x` versions until a
  separate stability decision approves `1.0.0`.
- Build once, record the source commit and SHA-256, and publish those exact bytes.
  Never move release tags, overwrite published versions or rebuild for promotion.
- Keep published `cli/v1` clients compatible. Deploy additive backend changes
  before Web/docs and publish the CLI last. Use a new facade version for breaking
  contracts rather than removing a supported endpoint.
- Never record tokens, authorization URLs, credentials or financial data in
  release evidence. Use synthetic records only for explicitly approved smoke tests.

## Prepare and freeze

1. Update `apps/cli/package.json` and regenerate the production-only shrinkwrap
   with `pnpm --dir apps/cli shrinkwrap:generate`. Follow
   [contributor verification](../CONTRIBUTING.md#verification), including
   `pnpm --dir apps/cli release:check` and package verification.
2. Verify affected authentication, ownership, ledger, interactive and JSON-output
   behavior. Keep public docs, npm README, installed help and the Spendly skill
   consistent with the published contract. Do not infer native Linux credential
   support from hosted CI; verify it before advertising that support.
3. Deploy compatible backend/Web changes only with explicit approval. Complete
   required migrations using reviewed maintenance functions and their returned
   cursors; record aggregate results, not row contents. Verify production OAuth
   configuration and the expired-capability cleanup cron when affected.
4. Merge the reviewed source and wait for its successful `master` readiness run.
   Dispatch [CLI release candidate](../.github/workflows/cli-release-candidate.yml)
   from `master`, supplying the exact package version.
5. Retain the tarball, `SHA256SUMS` and `SOURCE_COMMIT` together. Verify the
   automatically created `v<VERSION>` tag identifies that source. Create a GitHub
   Release with release notes using the existing tag (`--verify-tag`).
6. If `master`, package metadata, source, tag or hash changes or disagrees, stop
   and prepare a new candidate/version. Do not repair a frozen artifact in place.

## Publish and promote

The protected GitHub environment is `cli-release`. Restrict it to approved
release refs and use reviewer approval where available. npm trusted publishing
must identify `akhilesh-dalvi/spendly`, workflow `cli-publish.yml`, environment
`cli-release`, with stage-publish permission only. Keep npm publishing access
set to require 2FA and disallow tokens; routine releases need no `NPM_TOKEN`.

1. Dispatch [CLI publish](../.github/workflows/cli-publish.yml) from `master`:

   | Input | Value |
   | --- | --- |
   | `candidate_run` | Successful candidate workflow run ID |
   | `source_commit` | Full reviewed SHA from `SOURCE_COMMIT` |
   | `version` | Exact package version |
   | `tarball` | Recorded `spendly-<VERSION>.tgz` filename |
   | `sha256` | Lowercase hash from `SHA256SUMS` |
   | `bootstrap` | `false`; first-publication bootstrap is historical only |

2. Approve only after reviewing the source and artifact identity. The workflow
   downloads and verifies the candidate without rebuilding, then uses npm OIDC
   to stage the unchanged tarball with the `next` tag.
3. Inspect the staged package and scan results on npm, then approve or reject
   with maintainer 2FA. Verify provenance, signatures, package contents and clean
   installation of the exact version.
4. Perform approved affected smoke tests with a dedicated synthetic account.
   Preview destructive/balance-affecting operations, use fresh idempotency keys,
   and reconcile balances and ledger effects in Web. Delete synthetic expenses
   through confirmation; archive synthetic accounts after reconciliation.
5. After explicit acceptance, promote the exact version using an interactive
   maintainer session with 2FA: `npm dist-tag add spendly@<VERSION> latest`.
   Verify `npm dist-tag ls spendly` and a clean default global installation.
   Promotion does not rebuild or republish the package.

## Recovery

Stop rollout on authentication, ownership, data-integrity, provenance or
credential-leakage findings. Restore `next` to a known-good version and review
`latest` if the faulty version was promoted. Deprecate a harmful version with
upgrade guidance; do not unpublish or overwrite it.

Roll Web back first if needed. Backend rollback must remain compatible with
published clients and additive schema; never delete migrated data as a rollback.
For publishing incidents, disable the trusted publisher, revoke affected tokens,
rotate credentials and retain workflow logs/artifact hashes. For OAuth incidents,
revoke affected grants and coordinate the public-client configuration across
Clerk, Convex and a new CLI version.

Correct unsafe docs/skill instructions immediately and repeat affected checks
before restoring release channels.
