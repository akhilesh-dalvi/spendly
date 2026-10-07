# Command Basics

## Structured output

Place global flags before the command:

```bash
spendly --agent --json --non-interactive expenses list --limit 25
```

`--agent` declares agent operation so committed changes can be identified in
Spendly Web. `--json` returns one document with `schemaVersion`, `data`, and
`meta` on success, or `error.code`, `error.message`, `error.retryable`, and
optional details on failure. `--non-interactive` disables prompts. Diagnostics
go to stderr. `spendly --json expenses add --help` returns help text in
`data.help`.

## IDs, dates, and pages

Non-interactive mutation selectors use IDs returned by list or get commands.
Human name matching trims whitespace and compares exact text case-insensitively;
never use fuzzy matching or choose the first ambiguous result. For an expense
category, resolve the cycle containing the expense date:

```bash
spendly --agent --json --non-interactive cycles current --date "$DATE"
spendly --agent --json --non-interactive categories list --cycle-id "$CYCLE_ID"
```

Dates use `YYYY-MM-DD`; an omitted expense/context date defaults to the computer's
local date. Cycle creation requires explicit start and exclusive-end dates.
Context supplies the local date and detected IANA timezone for interpreting
"today" or "yesterday"; use an explicit date if timezone detection fails.
Amounts use decimal notation such as `24.50`. Expense and transfer amounts are
positive; account balances can be zero or negative. Currency comes from Spendly
data; the CLI has no currency-conversion operation.

Expense lists and account transaction history are paginated. Pass a returned
opaque `nextCursor` unchanged as `--cursor` to continue; never decode or invent
one. A non-null cursor means more results exist; `summary` provides cycle totals
without adding up expense pages.

## Preview and save

`--dry-run` returns the resolved values and balance effects without saving.
To save, remove `--dry-run` and supply `--idempotency-key "$KEY"`.
Generate a key for each new write, for example:

```bash
KEY=$(uuidgen)
```

The key identifies that write so repeating identical input with the same key
can return its result without applying it twice. A different write uses a new
key. Edit, lifecycle, and balance commands also take `--if-revision` from the
current record; transfers take both account revisions. These values let the CLI
detect changes made since the record was read.

### Cycle-copy guard

`cli/v1/cycles:previewCreate` returns optional `copySnapshot` when
`copyFromCycleId` is supplied. It is a 64-character lowercase hex SHA256 binding
the source ID and all effective persisted category-copy fields: selected category
IDs, names, types, plans, icons, hidden state, and order—not the source cycle
revision. Explicit copy-none with a source guards the empty effective selection.
`cli/v1/cycles:create` requires `expectedCopySnapshot` with a source and requires
it to be absent otherwise. Invalid or missing guards yield `INVALID_INPUT`
(exit 2); a mismatch yields stable `CYCLE_COPY_CONFLICT` (exit 5).

The CLI automatically obtains and commits the same snapshot for guided, human,
and direct copying writes. For separate preview approval, capture
`data.copySnapshot` and pass `--if-copy-snapshot HASH` on commit with identical
source, selection, and plan inputs. The flag requires `--copy-from-cycle-id` and
cannot accompany `--dry-run`. No-source/no-copy behavior is unchanged.

On a stale-copy failure, stop and obtain fresh preview approval before a new
commit; do not blindly retry or change the payload. For an explicitly authorized
uncertain-write replay, retain the original payload, snapshot, idempotency key,
and agent mode. With an explicit snapshot and `--non-interactive`, no new
preview/source read is made; backend idempotency returns a saved result before
checking the guard, even if the source later changed or was deleted.

In these examples, `$AMOUNT`, `$DATE`, and similar variables stand for values
from the request or current CLI output. The CLI returns resolved values,
warnings, IDs, revisions, and any balance or ledger effects in its result.
