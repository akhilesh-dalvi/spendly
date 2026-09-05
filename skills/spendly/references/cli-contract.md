# CLI Contract

Read this reference for every Spendly task.

## Command discovery

The installed CLI is the command-syntax authority:

```bash
spendly --help
spendly expenses --help
spendly expenses create --help
spendly accounts transfer --help
```

Use help for the relevant command rather than guessing flags from examples.
Do not substitute a direct backend request when the CLI lacks a command; that
operation is unsupported by the skill.

## Authentication and context

Financial reads and writes require a verified local session:

```bash
spendly --json --non-interactive auth status
spendly --json --non-interactive context
```

Context supplies the user currency, computer-local date and timezone, active
cycle, and default account. Refresh it when a long-running task or concurrent
Web activity could make it stale.

Browser login is a user-present flow. Ask the user to run
`spendly auth login` when needed. Never request, read, paste, or print a token.
Do not pass `--allow-file-storage` unless the user separately chooses the
documented plaintext fallback after seeing its path and risk.

## JSON and failures

Pass both global flags before the resource command:

```bash
spendly --json --non-interactive <resource> <command>
```

Success contains `schemaVersion`, `data`, and `meta`. Failure contains a stable
`error.code`, message, retryability, and optional details. Branch on the stable
code and structured details, not message text. Keep stdout as one JSON document
and do not enable debug output unless diagnosis is necessary; diagnostics are
redacted but still belong on stderr.

Read-only commands may perform their documented bounded retries. Add
`--no-retry` when the caller requires a single read attempt. Mutation commands
do not automatically retry.

## Selectors and pagination

- Agents use IDs. Names are for interactive humans only.
- Never fuzzy-match, select the first duplicate, or infer IDs from formatting.
- Obtain IDs through the narrowest relevant list or get command.
- Lists are cursor-paginated and bounded. Use the returned cursor only when the
  next page is needed. A missing resource on page one is not proof that it does
  not exist when another cursor is present.
- JSON includes IDs and display names; report names for clarity but retain IDs
  for subsequent commands.

## Dates, amounts, and currency

- CLI date input is `YYYY-MM-DD`. Resolve natural-language dates against
  context's local date and timezone. If the user omits a date, let the CLI use
  the computer's local date. If timezone detection fails, require a date; do
  not substitute UTC.
- Use ordinary base-10 decimals. Expense and transfer amounts are positive.
  Account starting and desired balances may be zero or negative. Never use
  scientific notation.
- If the user names a currency different from context, stop. Spendly CLI does
  not convert currency or relabel an amount. Never sum balances across
  currencies.

## Inference boundaries

- Never create missing categories, tags, accounts, account types, or cycles.
- Never infer or create tags.
- An omitted expense category may be inferred only by the backend's exact
  history rule; otherwise the expense is uncategorized. Report
  `categorySource`.
- An omitted expense account may use the active default or remain unassigned.
  Use the explicit no-account option for requested unassignment and report
  `accountSource`.
