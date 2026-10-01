# Accounts and Transfers

The variables below represent values from the request or CLI output. See
[command basics](cli-contract.md) for JSON, revisions, and saving a preview.

## Find accounts and history

```bash
spendly --agent --json --non-interactive accounts list --include-archived
spendly --agent --json --non-interactive accounts get "$ACCOUNT_ID"
spendly --agent --json --non-interactive accounts transactions "$ACCOUNT_ID" --limit 25
spendly --agent --json --non-interactive account-types list
```

`accounts get` returns balance, currency, type, default status, archived status,
and revision. Existing accounts and types may already fit the request.

## Add or edit an account

```bash
spendly --agent --json --non-interactive accounts add \
  --name "$ACCOUNT_NAME" \
  --account-type-id "$ACCOUNT_TYPE_ID" \
  --starting-balance "$STARTING_BALANCE" \
  --date "$DATE" \
  --dry-run
```

Creation needs a name, active account type, and starting balance. It uses the
context currency and records an opening ledger entry. Remove `--dry-run` and
add `--idempotency-key "$KEY"` to save.

`accounts edit "$ACCOUNT_ID"` changes the name with `--name` or type with
`--account-type-id`. It accepts `--if-revision "$REVISION"`, `--dry-run`, and
`--idempotency-key "$KEY"`. Balance changes use `adjust-balance` instead.

## Default and archive status

`accounts set-default`, `accounts archive`, and `accounts reactivate` each take
an account ID, `--if-revision`, and `--idempotency-key`; `--dry-run` previews them.

Archiving preserves history and clears the default if applicable. Reactivation
allows new activity again; `set-default` selects an active account as default.
Permanent account deletion and direct ledger editing are unavailable in the CLI.

## Set a balance

```bash
spendly --agent --json --non-interactive accounts adjust-balance "$ACCOUNT_ID" \
  --balance "$DESIRED_BALANCE" \
  --date "$DATE" \
  --if-revision "$REVISION" \
  --dry-run
```

`--balance` is the desired final balance. The CLI calculates the adjustment;
for example, setting 100 to 125 records +25. A zero adjustment is a no-op.
Negative balances are supported and appear in preview warnings. Remove
`--dry-run` and add `--idempotency-key "$KEY"` to save.

## Transfer funds

Get both accounts for their IDs and current revisions. Transfers work between
two different active accounts with the same currency:

```bash
spendly --agent --json --non-interactive accounts transfer \
  --from-account-id "$SOURCE_ACCOUNT_ID" \
  --to-account-id "$DESTINATION_ACCOUNT_ID" \
  --amount "$AMOUNT" \
  --date "$DATE" \
  --if-from-revision "$SOURCE_REVISION" \
  --if-to-revision "$DESTINATION_REVISION" \
  --dry-run
```

The preview shows both resulting balances. Remove `--dry-run` and add
`--idempotency-key "$KEY"` to save. Transfers affect account balances without
changing expense-cycle spending. Completed transfers have no edit or delete
command. Surface a `NEGATIVE_SOURCE_BALANCE` preview warning and do not decide
for the user whether to proceed. A separate reverse transfer is a new write and
requires the user's explicit authorization.
