---
name: spendly
description: Use the local Spendly CLI to track and categorize expenses, manage cycles and accounts, reconcile balances, record transfers, or change preferred currency.
---

# Spendly CLI

Use `spendly` to work with the user's Spendly data from their local computer.

## Get started

Public documentation: [Spendly CLI](https://spendly.akhileshdalvi.com/docs/cli).
Install or update to the latest release with `npm install --global spendly@latest`
on Node.js 22 or newer. macOS is the currently verified platform. Production
authentication and Codex read-only skill use are verified; broader workflows
remain subject to ongoing validation. If npm cannot find the package, report the installation
failure; do not substitute an unrelated package.

```bash
spendly --version
spendly --agent --json --non-interactive auth status
spendly --agent --json --non-interactive context
```

If sign-in is required, ask the user to run `spendly auth login` on this
computer and finish in the browser before you rerun status and context.
Context gives the currency, local date, timezone, cycle, and default account
for interpreting the request.

## Find commands and flags

Start with `spendly --help`, then open help for the relevant group or operation.
Installed help reflects the available CLI version and works without login.
Before using or proposing an operation, include its specific `--help` lookup.
For recovery, name the JSON `error.code` before selecting the next step; for
example, `REVISION_CONFLICT` requires a fresh read rather than a blind retry.

| Task                                   | Help command                                                    |
| -------------------------------------- | --------------------------------------------------------------- |
| Sign in, session status, sign out      | `spendly --agent --json --non-interactive auth --help`          |
| Currency, date, cycle, default account | `spendly --agent --json --non-interactive context --help`       |
| Spending summary                       | `spendly --agent --json --non-interactive summary --help`       |
| List, add, edit, delete expenses       | `spendly --agent --json --non-interactive expenses --help`      |
| Accounts, balances, history, transfers | `spendly --agent --json --non-interactive accounts --help`      |
| List, add, edit, delete cycles         | `spendly --agent --json --non-interactive cycles --help`        |
| Find categories                        | `spendly --agent --json --non-interactive categories --help`    |
| Find tags                              | `spendly --agent --json --non-interactive tags --help`          |
| Find account types                     | `spendly --agent --json --non-interactive account-types --help` |

Examples of help for a specific action:

```bash
spendly --agent --json --non-interactive expenses list --help
spendly --agent --json --non-interactive expenses add --help
spendly --agent --json --non-interactive expenses edit --help
spendly --agent --json --non-interactive expenses delete --help
spendly --agent --json --non-interactive accounts add --help
spendly --agent --json --non-interactive accounts adjust-balance --help
spendly --agent --json --non-interactive accounts transfer --help
```

## Find existing data

Look up existing categories, tags, and accounts before assigning them or
considering new ones. Reuse a suitable existing match by its returned ID.
For example, an existing "Food" category may already cover a request for
"Meals". Suggest the alternative when the intended match is unclear.

```bash
spendly --agent --json --non-interactive cycles current --date "$DATE"
spendly --agent --json --non-interactive categories list --cycle-id "$CYCLE_ID"
spendly --agent --json --non-interactive tags list
spendly --agent --json --non-interactive accounts list --include-archived
spendly --agent --json --non-interactive account-types list
```

Categories belong to a cycle; resolve and use the expense date's cycle. Including archived
accounts helps spot an existing account before creating another. If the user asks
for a new category, check installed `categories add --help`; otherwise use an
existing category ID. If the user needs a new type, check
`category-types add --help`: type creation is a separate save that persists
even if the category save is canceled. Cycle writes require a version that
advertises them in `cycles --help`.

## Run an action

`--agent --json --non-interactive` declares agent use, gives structured output,
and disables prompts. List and get commands provide stable IDs. Preview with
`--dry-run`; commit only after approval, using the same inputs, a fresh
idempotency key, and the guards shown in installed help. Account-type and
category edits and tag renames use the preview's `data.editSnapshot` with
`--if-edit-snapshot`, not a revision. See
[Accounts](https://spendly.akhileshdalvi.com/docs/cli/accounts),
[Categories](https://spendly.akhileshdalvi.com/docs/cli/categories), or
[Tags](https://spendly.akhileshdalvi.com/docs/cli/tags) for the relevant save.
For cycle-copy snapshot guards and replay, follow [Cycles](references/cycle-workflows.md).
For a currency change, check `settings set-currency --help` and follow
[Preferred currency](https://spendly.akhileshdalvi.com/docs/cli/settings).
For separately reviewed financial saves with `--if-preferred-currency`, use
`data.preferredCurrency` from the preview, not the transaction currency.
For account creation, also pass preview `data.currencyMode` as
`--if-account-currency-mode` and `data.accountType.balanceNature` as
`--if-balance-nature`. If a needed guard or preview value is missing, stop and
suggest an update or completing the operation in Spendly Web. On conflict,
get approval for a fresh preview.

Apply only writes the user requested. Stop on ambiguity, a stale revision, an
unexpected warning, or a result that remains uncertain. Never retry a write
automatically; use the recovery procedure below only for the same explicitly
authorized action. Never inspect or reveal credentials, OAuth URLs or tokens,
environment variables, request headers, or local credential files.

Use the reference that fits the task:

- [Command basics](references/cli-contract.md): JSON, IDs, dates, pagination,
  previews, revisions, and idempotency keys.
- [Expenses](references/expense-workflows.md): list, add, edit, delete.
- [Cycles](references/cycle-workflows.md): create/copy category plans, inspect,
  change dates, or delete a cycle and its categories.
- [Accounts](references/account-workflows.md): add, edit, archive,
  reconcile, transfer, and inspect history.
- [Troubleshooting](references/troubleshooting.md): login, conflicts,
  confirmation tokens, expense save references, and uncertain writes.

Summarize what changed and the resulting balances. Returned IDs and revisions
are useful for follow-up commands.
