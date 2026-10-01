# Expenses

The variables below represent values from the request or CLI output. See
[command basics](cli-contract.md) for JSON, revisions, and saving a preview.

## Find expenses

```bash
spendly --agent --json --non-interactive expenses list --limit 25
spendly --agent --json --non-interactive expenses get "$EXPENSE_ID"
```

`expenses list --help` shows filters for cycle, category, account, tags, and
date range, plus uncategorized and unassigned expenses.

## Add an expense

```bash
spendly --agent --json --non-interactive expenses add \
  --amount "$AMOUNT" \
  --date "$DATE" \
  --spent-on "$DESCRIPTION" \
  --category-id "$CATEGORY_ID" \
  --account-id "$ACCOUNT_ID" \
  --dry-run
```

Amount is required. Category and account IDs come from existing-data lookups.
Resolve a supplied date's cycle before listing categories:

```bash
spendly --agent --json --non-interactive cycles current --date "$DATE"
spendly --agent --json --non-interactive categories list --cycle-id "$CYCLE_ID"
```

Optional flags can be omitted: date defaults to today, category uses matching
description history or stays uncategorized, and account uses the active default
or stays unassigned. Tags stay empty unless supplied. `--no-account` explicitly
leaves an expense unassigned. The preview reports `categorySource` and
`accountSource` so the resolved defaults are visible.

To save the previewed expense, remove `--dry-run` and add
`--idempotency-key "$KEY"`.

## Edit an expense

Get the expense to obtain its current revision, then preview the changed fields:

```bash
spendly --agent --json --non-interactive expenses edit --help
spendly --agent --json --non-interactive expenses edit "$EXPENSE_ID" \
  --amount "$NEW_AMOUNT" \
  --if-revision "$REVISION" \
  --dry-run
```

Omitted fields stay unchanged. `--clear-category`, `--clear-account`,
`--clear-spent-on`, and `--clear-tags` remove existing values. Clearing an
account reverses its old balance effect. Moving an expense between accounts
reverses the old account effect before applying the new one.
Save by removing `--dry-run` and adding `--idempotency-key "$KEY"`.

## Delete an expense

Deletion is permanent. Its preview returns a confirmation token and revision:

```bash
spendly --agent --json --non-interactive expenses delete "$EXPENSE_ID" --dry-run
```

Use those values to apply the deletion:

```bash
spendly --agent --json --non-interactive expenses delete "$EXPENSE_ID" \
  --confirmation-token "$CONFIRMATION_TOKEN" \
  --if-revision "$REVISION" \
  --idempotency-key "$KEY"
```

The token is single-use, bound to the expense and revision, and valid for five
minutes. Deleting an account-backed expense restores its amount to the account.
