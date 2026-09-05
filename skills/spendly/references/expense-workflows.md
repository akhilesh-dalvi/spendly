# Expense Workflows

Load this reference for expense reads and mutations. For every mutation, also
load `references/mutation-safety.md` directly from the skill root.

Values beginning with `$` below are placeholders obtained from current Spendly
JSON or generated locally for one intent.

## Read

Use `expenses get` when the ID is known. Use `expenses list` for discovery and
apply the narrowest available filters: cycle, category, uncategorized, account,
unassigned, tags, or inclusive date bounds. Follow pagination only as far as the
request needs.

## Create

Creation requires an amount. Omitted tags remain empty. Omitted category uses
only backend history inference. Omitted account uses the active default or
remains unassigned.

```bash
spendly --json --non-interactive expenses create \
  --amount "$AMOUNT" \
  --date "$DATE" \
  --spent-on "$DESCRIPTION" \
  --category-id "$CATEGORY_ID" \
  --account-id "$ACCOUNT_ID" \
  --dry-run
```

Check normalized amount, date, currency, category and account sources, IDs, and
balance effect. Commit the otherwise identical command without `--dry-run` and
with `--idempotency-key "$KEY"`. Report expense ID, revision, and any ledger
effect.

Omit optional flags the user did not supply. Use the explicit no-account option
only when unassignment is intended; confirm its current spelling through
`expenses create --help`.

## Update

Read the exact expense and use its current revision. Omitted fields stay
unchanged. Use explicit clear flags instead of empty strings:

- `--clear-category`
- `--clear-account`
- `--clear-spent-on`
- `--clear-tags`

```bash
spendly --json --non-interactive expenses update "$EXPENSE_ID" \
  --amount "$NEW_AMOUNT" \
  --if-revision "$REVISION" \
  --dry-run
```

Commit the same update with `--idempotency-key "$KEY"`. Report before and
after values and all account effects. Moving or clearing an account reverses
the old effect before applying any new one.

If a date change returns `CATEGORY_CYCLE_MISMATCH`, stop. Show the old and new
cycles and safe candidate IDs, then require an explicit new category ID or
`--clear-category`.

## Delete permanently

Deletion has no trash or restore path. First resolve one exact expense and get
the server-backed preview:

```bash
spendly --json --non-interactive expenses delete "$EXPENSE_ID" --dry-run
```

Surface the exact expense, revision, permanent effect, and any account balance
restoration. Commit only under the authorization rules in the safety reference:

```bash
spendly --json --non-interactive expenses delete "$EXPENSE_ID" \
  --confirmation-token "$CONFIRMATION_TOKEN" \
  --if-revision "$REVISION" \
  --idempotency-key "$KEY"
```

The token is single-use, bound to the displayed expense and revision, and valid
for five minutes. If it expires or the resource changes, obtain a new preview
and authorization for the new state.
