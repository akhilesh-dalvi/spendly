# Spendly CLI Phase 7: Spendly Skill

## Status

- Status: In progress; portable bundle and installation gates complete, agent
  response evaluations pending
- Date: 2026-09-05
- Branch: `feature/spendly-cli`
- Starting checkpoint: `714032d feat(cli): add account mutations`

## Implemented Bundle

Phase 7 adds a portable Agent Skills-format bundle at
`skills/spendly/SKILL.md`. The entrypoint is an 85-line decision router. It
loads the shared CLI contract plus only the expense, account, or mutation-safety
reference needed for the current task.

The skill encodes:

- Local-only browser authentication, JSON status, and context loading.
- `--json --non-interactive` agent invocation and stable-ID selector rules.
- Local-date and timezone handling without UTC fallback.
- Currency boundaries and the prohibition on conversion or relabeling.
- Category-history inference, default-account resolution, and the prohibition
  on invented categories, tags, accounts, account types, or cycles.
- Server-backed mutation previews, stable idempotency keys, optimistic
  revisions, and explicit uncertain-result recovery without automatic retry.
- Expense creation, explicit update clears, account balance effects, and
  two-step permanent deletion.
- Account creation, lifecycle, default selection, absolute-balance adjustment,
  negative-balance warnings, and same-currency transfers.
- Unsupported-operation boundaries for bulk mutation, account deletion, direct
  ledger mutation, and transfer editing or deletion.
- Credential and personal-financial-data isolation from skill files,
  diagnostics, and external services.

The examples cover successful expense creation and update, successful account
creation and adjustment, successful transfer, selector ambiguity, stale
revision conflict, uncertain timeout recovery, negative balances, and permanent
expense deletion.

## CLI Skill Pattern Review

The refactor compared Spendly with current CLI-oriented Agent Skills:

- The official [GitHub CLI skill](https://github.com/cli/cli/blob/trunk/skills/gh/SKILL.md)
  focuses on non-obvious agent behavior such as structured output, bounded
  pagination, target resolution, and checking live help instead of reproducing
  the entire CLI manual.
- Vercel's [CLI UX skill](https://github.com/vercel/vercel/blob/main/packages/cli/.agents/skills/cli-ux/SKILL.md)
  establishes decision authority, routes tasks to focused references, audits
  mutation and non-interactive behavior, and requires resolved targets and
  effects to be visible.
- The [Vercel CLI skill](https://skills.sh/vercel/vercel/vercel-cli) uses a
  concise entrypoint and a decision tree that loads command-family references
  only when needed.
- The [glab skill collection](https://github.com/vince-winkintel/gitlab-cli-skills)
  separates authentication and command families, verifies current identity
  before writes, and gives each substantial domain an independently loadable
  skill.
- The [agent-browser skill design](https://github.com/vercel-labs/agent-browser/blob/main/docs/src/app/skills/page.mdx)
  keeps a discovery stub thin and serves version-matched instructions from its
  CLI.

Spendly adopts the shared concepts that fit its contract: precise discovery
metadata, live `--help` as syntax authority, JSON rather than rendered-output
scraping, task routing, bounded pagination, an auth/context preflight, and a
separate mutation-safety reference. It does not copy large command catalogs,
agent-specific token configuration, backend/API escape hatches, or wrapper
scripts. Those would duplicate the versioned CLI/backend contract or weaken
Spendly's credential and authorization boundaries.

Serving version-matched skill content from the `spendly` executable remains a
possible future release design, but it is not added in Phase 7 because the
approved distribution contract is the portable GitHub bundle through
skills.sh. The current skill instead checks installed help before unfamiliar
flags and keeps static examples deliberately narrow.

## Evaluation Suite

`skills/spendly/evals/evals.json` contains ten plan-only cases. Every prompt
explicitly prohibits commands and Spendly data access so an evaluation runner
cannot mutate a signed-in account. The cases exercise:

1. Expense creation with omitted category, account, and date.
2. Revision-safe expense update with explicit category and account clearing.
3. Duplicate-name ambiguity.
4. Stale revision recovery.
5. Uncertain mutation-result recovery.
6. Account creation followed by absolute-balance reconciliation.
7. Transfer with a negative source-balance warning.
8. Permanent expense deletion from a description-only request.
9. Unsupported account and ledger deletion.
10. Credential-exfiltration resistance.

The deterministic evaluator at `skills/spendly/evals/validate.mjs` checks the
manifest shape, unique and complete cases, plan-only execution boundary,
behavioral expectation coverage, direct and non-orphaned reference routing,
absence of attached user files, and absence of private-key, JWT, provider-key,
email, home-path, and Convex-ID-shaped content in the distributed bundle.

The remaining gate is to execute all ten prompts independently with Codex and
Claude Code, grade their responses against every expectation, and inspect the
responses for personal-data leakage. This environment has Codex installed but
does not have a Claude Code executable, and independent subagent execution was
not used during this implementation pass.

## Installation Verification

The current skills.sh CLI successfully installed the local repository bundle
globally for both target agents with telemetry disabled:

```bash
DISABLE_TELEMETRY=1 npx skills add . \
  --skill spendly \
  --global \
  --agent codex \
  --agent claude-code \
  --yes
```

The installer created the universal Spendly skill under
`~/.agents/skills/spendly` and the Claude Code link at
`~/.claude/skills/spendly`. The installed entrypoint, four focused references,
evaluation manifest, and validator matched the repository copies by SHA-256.
The skills CLI also listed Spendly as a global skill available to both Codex
and Claude Code.

The repository does not add a custom `spendly skill install` command. Users who
do not want anonymous skills CLI installation telemetry may set
`DISABLE_TELEMETRY=1` for installation and update commands.

## Verification

Completed checks:

- The bundled skill-creator validator reported `Skill is valid!`.
- The Spendly evaluation and leakage validator passed all ten cases.
- Biome accepted the evaluation manifest and validator.
- The production CLI build completed successfully.
- Live `--help` output confirmed every command and flag used by the focused
  workflow examples, including JSON and non-interactive mode.
- The global skills.sh installation completed for Codex and Claude Code.
- Installed file SHA-256 values matched the repository bundle.

Phase 7 must remain in progress until the independent Codex and Claude Code
response evaluation results pass.
