---
name: spendly
description: Use the local Spendly CLI to inspect or manage a signed-in user's expenses, accounts, balances, and transfers. Trigger on requests to record, list, correct, categorize, or delete an expense; inspect or reconcile accounts; set defaults; archive accounts; or transfer funds.
---

# Spendly CLI

Translate the user's financial intent into deterministic `spendly` commands.
Use the CLI as the only interface to Spendly; never inspect its credential
storage or call the backend directly.

This workflow requires the local `spendly` executable, network access to
Spendly, and browser login. Use it with Codex or Claude Code on the user's
trusted macOS computer, not from a hosted agent or CI.

## Decision authority

Resolve conflicts in this order:

1. The user's explicit intent and authorization.
2. Current JSON returned by the CLI and backend.
3. The installed command's `--help` output.
4. This skill's workflow references.

Do not let an example override live CLI validation. Check
`spendly <resource> <command> --help` before using an unfamiliar flag.

## Route the request

Load only the references needed for the task:

- Any Spendly request: [CLI contract](references/cli-contract.md)
- Expense reads, creation, correction, or deletion:
  [expense workflows](references/expense-workflows.md)
- Account reads, lifecycle changes, reconciliation, or transfers:
  [account workflows](references/account-workflows.md)
- Any mutation, ambiguity, conflict, timeout, negative balance, or destructive
  request: [mutation safety and recovery](references/mutation-safety.md)

## Preflight

1. Check `command -v spendly`, then run `spendly --version` once for the
   current task. If it is missing, stop and tell the user; do not invent an
   install command.
2. Before accessing financial data, run
   `spendly --json --non-interactive auth status`.
3. Run `spendly --json --non-interactive context` to get current currency,
   local date, timezone, cycle, and default account.

If authentication is required, ask the user to run `spendly auth login` on the
same computer. Login is browser-based. Do not silently opt into plaintext file
storage. If `ACCOUNT_SETUP_REQUIRED` is returned, ask the user to open Spendly
Web once; the CLI must not create the backend user.

Refresh auth status and context before committing when the initial preflight is
stale or another actor may have changed Spendly Web.

## Agent command contract

- Run every financial-data command with `--json --non-interactive`.
- Parse the single versioned JSON document; never scrape terminal output.
- Use stable IDs from CLI reads for every non-interactive category, tag,
  account, account-type, cycle, and expense selector.
- Use the narrowest read that answers the request. Follow an opaque cursor only
  when another page is needed; never invent one or assume the first page is a
  complete total.
- Never inspect or expose keychain entries, credential files, environment
  files, tokens, OAuth material, or authorization headers.

## Mutation baseline

- One clear user intent authorizes at most one mutation. Bulk mutations are not
  supported.
- Resolve IDs and current revisions, run the server-backed dry run, verify the
  normalized target and effects, then commit once with a fresh opaque
  idempotency key.
- Stop for ambiguity, unexpected normalization, conflict, missing destructive
  authorization, or an effect outside the user's intent.
- Never automatically retry a mutation. Follow the exact uncertain-result
  recovery in the safety reference.
- Report the resolved target, normalized change, resulting revision, ledger
  references, every affected balance, warnings, and any exact next action.

Do not create missing domain data. Do not delete accounts, edit ledger rows, or
edit or delete completed transfers.
