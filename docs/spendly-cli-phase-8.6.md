# Spendly CLI Phase 8.6: Action Provenance in Spendly Web

## Status

- Status: Complete; automated gates passed, and authenticated direct-CLI and
  AI-agent provenance passed desktop, light/dark-theme, and 375px responsive
  browser verification
- Last updated: 2026-09-11
- Branch: `feature/spendly-cli`
- Depends on: completed CLI expense/account mutations, the Spendly skill, and
  Phase 8.5 live Web/CLI verification
- Blocks: Phase 8.7 pre-release hardening and Phase 8.8 guided interactive
  inputs; Phase 9 then owns production packaging and publication
- Exit criterion: every committed CLI mutation records whether it came from a
  human CLI user or an AI agent, and Spendly Web presents that provenance on the
  relevant expense, account, or account-activity surface without adding visual
  noise or changing the versioned CLI output contract

## Product Decision

Add a small, lightly colored provenance indicator to the existing UI instead
of a new table column, banner, or notification stream:

- Use Lucide's violet `Bot` icon for an AI agent using the Spendly CLI.
- Use Lucide's blue `SquareTerminal` icon for a direct human CLI action.
- Do not add an icon for Web actions or historical rows with unknown provenance.
- Render the icon at 14-16px with color on the glyph only, without a badge or
  background. It must not compete with amounts, account names, categories, or
  account status.
- Give every icon a keyboard-accessible tooltip and screen-reader label. Use
  plain copy such as `Added by an AI agent via Spendly CLI`, `Last edited by an
AI agent via Spendly CLI`, or `Recorded via Spendly CLI`.

This is an informational source marker, not a security identity or audit
attestation. Spendly continues to authorize the signed-in user; it does not
claim to identify a particular model, agent product, or conversation.

## Why the Agent Signal Must Be Explicit

Do not infer AI usage from `--json` or `--non-interactive`. Humans, shell
scripts, and other automation can legitimately use either flag.

Add a global `--agent` flag. The Spendly skill must include it on every agent
invocation:

```text
spendly --agent --json --non-interactive ...
```

The relevant backend entrypoint records committed mutations as one of these
sources:

```text
web        Spendly Web mutation
cli        Spendly CLI without --agent
cli_agent  Spendly CLI with --agent
```

Reads, authentication commands, help, previews, and dry runs do not persist
provenance. The `--agent` flag is a source declaration for display purposes; it
does not grant permissions or weaken normal confirmation, revision,
idempotency, or ownership checks.

## Action Coverage

| CLI action                 | Persisted provenance                                                                 | Web indication                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Expense add                | Expense create/last-change source; linked account and ledger source                  | Expense list, dashboard recent activity, expense detail, and affected account/detail activity |
| Expense edit               | Expense last-change source; source on affected accounts and resulting ledger entries | Expense list, dashboard recent activity, expense detail, and affected account/detail activity |
| Expense delete             | Source on the affected account and reversal ledger entry when account-backed         | Account/detail activity only; the deleted expense itself no longer exists                     |
| Account add                | Account create/last-change source and opening-ledger source                          | Account list/detail and opening activity                                                      |
| Account edit               | Account last-change source                                                           | Account list/detail                                                                           |
| Account archive/reactivate | Account last-change source                                                           | Account list/detail wherever the current archived state is visible                            |
| Account set-default        | Account last-change source only when the preference changes                          | Account list/detail beside the current account state                                          |
| Balance adjustment         | Account last-change and ledger-entry source when the balance actually changes        | Account list/detail and activity                                                              |
| Transfer                   | Both accounts' last-change source, transfer source, and both ledger-entry sources    | Both account list/detail and activity views                                                   |

No icon is needed for context, list, get, summary, cycle, category, tag, or
account-type reads. The CLI has no cycle/category/tag/account-type mutations in
the initial release.

An unassigned expense deletion intentionally leaves no UI marker because the
expense is permanently removed and no ledger entry exists. Do not introduce a
general audit table or deletion tombstone solely for this phase. If complete
historical action auditing becomes a product requirement, design it separately
with retention and privacy rules.

## Data Contract

Define one shared validator and TypeScript type for the three source values.
Use optional fields so deployed rows remain valid without a migration:

- `expenses.createdSource` and `expenses.lastModifiedSource`
- `accounts.createdSource` and `accounts.lastModifiedSource`
- `account_transactions.source`
- `account_transfers.source`

Historical missing values mean `unknown/legacy`, not `web`, and remain
unlabeled. New Web mutations must explicitly write `web`; otherwise a later Web
edit could leave an older CLI marker visible and become misleading.

Rules:

- Create initializes both create and last-modified source fields.
- Update/lifecycle mutations change only the last-modified field.
- Balance changes stamp each affected account plus the immutable transaction
  that explains the change.
- A zero-delta balance adjustment creates no transaction and therefore no
  provenance marker.
- Transfers stamp the transfer plus both immutable transaction entries.
- Expense add/edit/delete stamps every ledger entry produced by that
  operation with the same source.
- Idempotent replay returns the original result and never rewrites provenance.
- Include the declared source in the idempotency request fingerprint so the
  same key cannot silently relabel an earlier mutation.

Keep provenance out of the stable CLI v1 response payloads for this phase. It
is mutation input and Web presentation metadata, not a new agent-facing output
requirement.

## Backend and CLI Design

1. Add the shared source validator/type near the domain operation helpers.
2. Extend the four tables with the optional fields above and regenerate Convex
   types.
3. Require a source in shared Web/CLI commit helpers, while preview helpers stay
   source-free.
4. Pass `web` from existing Web mutation entrypoints.
5. Add `--agent` to global CLI options.
6. Centralize injection of an `agent: true` declaration in a commit-only
   mutation helper so no agent command can accidentally omit it and
   mutation-backed previews receive no extra argument.
7. Add an optional `agent` boolean to every `cli/v1` commit validator. Keeping
   it optional preserves compatibility with an older installed `0.x` release during a
   rolling backend/package deployment; each CLI facade entrypoint maps `true`
   to `cli_agent` and false/absence to `cli`.
8. Update the Spendly skill and public AI-agent documentation so agent examples
   use `--agent --json --non-interactive`.

The backend facade, not arbitrary client input, determines the channel. The
client only declares whether the CLI invocation is agent-driven.

## Web Presentation

Create one reusable `ActionSourceIndicator` component rather than duplicating
icon and tooltip behavior.

Place it on these existing surfaces:

- Expense table: inline with the note/description, avoiding a dedicated
  provenance column.
- Dashboard recent activity: beside the expense description.
- Expense detail: in the small metadata line under the page title.
- Account list/card and account detail header: beside the account name/status,
  representing the latest persisted account change, including balance changes.
- Account detail activity: in the transaction metadata line, representing that
  immutable ledger event.

For mutable expenses and accounts, show `lastModifiedSource` when present and
fall back to `createdSource`. Tooltip wording must distinguish `Added` from
`Last edited` where the data can do so. For immutable transactions, use
`Recorded`.

The indicator must:

- be focusable without making the containing row harder to click;
- expose the complete meaning through `aria-label` rather than icon shape or
  color alone;
- work in light/dark themes and at 390px width;
- avoid a colored AI badge, glow, animation, or persistent explanatory copy;
- never display raw values such as `cli_agent` to users.

## Out of Scope

- Naming the specific agent, model, provider, device, or conversation.
- Treating the marker as verified authorship or an authorization boundary.
- A global activity feed, notification center, or general audit log.
- Backfilling historical records as Web-created.
- Filtering or sorting expenses/accounts by source.
- Adding provenance to read commands, dry runs, failed mutations, or auth.
- Analytics or telemetry for agent usage.

## Implementation Sequence

1. Add source validators, optional schema fields, and focused domain tests.
2. Thread `web` through current Web mutations and CLI source through all commit
   facade paths.
3. Add the global `--agent` option and update CLI option/action tests.
4. Add the shared Web indicator and expose source fields from Web queries.
5. Place the indicator on expense, account, recent-activity, and ledger views.
6. Update the Spendly skill, public CLI docs, examples, and documentation
   validation.
7. Run backend, Web, CLI, package, docs, and responsive browser verification.
8. Repeat the Phase 8.5 development proof with one agent-tagged expense and one
   agent-tagged account transfer, then verify both icons in Spendly Web.

## Verification Checklist

- [x] Existing rows without source fields load and show no marker.
- [x] New Web writes record `web` and show no marker.
- [x] Direct CLI commits record `cli` and show the terminal indicator.
- [x] Agent CLI commits with `--agent` record `cli_agent` and show the bot
      indicator.
- [x] `--json --non-interactive` without `--agent` is never labeled as AI.
- [x] Dry runs, failed commits, and zero-delta adjustments create no source
      evidence.
- [x] Expense add/edit and every associated ledger entry share one source.
- [x] Account add/edit/archive/reactivate/default actions retain accurate
      current-state provenance.
- [x] Adjustments and both sides of a transfer show the correct immutable
      ledger provenance.
- [x] Account-backed deletion shows provenance only on its reversal ledger
      entry; unassigned deletion creates no tombstone.
- [x] Web edits replace an earlier CLI last-modified marker with `web`.
- [x] Idempotent replay preserves the original source; changing source with the
      same key returns the existing idempotency conflict.
- [x] The CLI JSON schemas and successful result envelopes remain unchanged.
- [x] Tooltips work with pointer and keyboard, include accessible labels, and
      remain readable in both themes and mobile layout.
- [x] No credential, prompt, model, conversation, or personal-data metadata is
      stored with provenance.

## Required Checks

```text
pnpm exec convex codegen
pnpm exec biome check <changed backend, CLI, Web, skill, and docs files>
pnpm exec tsc --noEmit -p packages/backend/convex/tsconfig.json
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm --dir apps/cli check-types
pnpm --dir apps/cli check-types:development
pnpm --dir packages/backend test:once
pnpm --dir apps/cli test
pnpm --dir apps/web docs:validate
pnpm pack:cli
git diff --check
```

Browser verification must cover the expense table, dashboard recent activity,
expense detail, account list/detail, and account activity at desktop and 390px
mobile widths, including pointer tooltip, keyboard focus, light/dark themes,
row click behavior, and zero horizontal overflow.

## Implementation Evidence

- Convex code generation, backend/Web/CLI typechecks, the production Web build,
  documentation validation, and Spendly skill evaluation validation passed.
- All 37 backend tests and 101 CLI tests passed. Focused provenance coverage
  includes direct CLI, AI-agent, and Web writes; expense edit/delete ledger
  entries; account lifecycle/default/adjustment/transfer paths; zero-delta
  adjustments; replay/conflict behavior; and unassigned deletion.
- The packed `spendly-0.1.0.tgz` passed isolated install, version, help, JSON,
  and exit-code verification.
- Authenticated agent proof passed with two agent-created accounts, one
  account-backed expense, and one transfer. Spendly Web showed bot markers on
  dashboard recent activity, expense list/detail, account list/detail, and the
  opening, expense, and transfer ledger entries. Keyboard focus exposed the
  complete tooltip; the icon no longer activates its containing expense row,
  while clicking the rest of the row still opens the expense.
- Authenticated direct-CLI proof passed with a direct-CLI account and expense;
  Spendly Web showed blue terminal markers distinct from violet agent markers.
- Pointer hover and keyboard focus exposed the complete tooltip, and both
  marker colors remained readable in light and dark themes.
- Responsive verification passed at 375px, which is stricter than the planned
  390px viewport, across the expense list/detail, dashboard recent activity,
  account list/detail, and account ledger. Every route retained zero page-level
  horizontal overflow. The dashboard grid required `min-w-0` on its children
  so empty chart cards could shrink within the mobile viewport.

All Phase 8.6 verification criteria are satisfied.
