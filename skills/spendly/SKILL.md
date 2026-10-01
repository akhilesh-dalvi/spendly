---
name: spendly
description: Use the local Spendly CLI to read or manage expenses, accounts, balances, and transfers, including categorizing expenses, setting default accounts, and reconciling balances.
---

# Spendly CLI

Use `spendly` to work with the user's Spendly data from their local computer.

## Get started

```bash
spendly --version
spendly --agent --json --non-interactive auth status
spendly --agent --json --non-interactive auth login
spendly --agent --json --non-interactive context
```

`auth login` opens a browser when sign-in is needed. Context gives the currency,
local date, timezone, cycle, and default account for interpreting the request.

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
| Find cycles                            | `spendly --agent --json --non-interactive cycles --help`        |
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
accounts helps spot an existing account before creating another. Categories,
tags, account types, and cycles are currently read-only through the CLI and
can be managed in Spendly Web.

## Run an action

`--agent --json --non-interactive` declares agent use, gives structured output,
and disables prompts. List and get commands provide the IDs and revisions used
by write commands. `--dry-run`
previews a change; removing it applies the change. Several requested changes
can be handled as separate commands.

Apply only writes the user requested. Stop on ambiguity, a stale revision, an
unexpected warning, or a result that remains uncertain. Never retry a write
automatically; use the recovery procedure below only for the same explicitly
authorized action. Never inspect or reveal credentials, OAuth URLs or tokens,
environment variables, request headers, or local credential files.

Use the reference that fits the task:

- [Command basics](references/cli-contract.md): JSON, IDs, dates, pagination,
  previews, revisions, and idempotency keys.
- [Expenses](references/expense-workflows.md): list, add, edit, delete.
- [Accounts](references/account-workflows.md): add, edit, archive,
  reconcile, transfer, and inspect history.
- [Troubleshooting](references/troubleshooting.md): login, conflicts,
  confirmation tokens, and uncertain network results.

Summarize what changed and the resulting balances. Returned IDs and revisions
are useful for follow-up commands.
