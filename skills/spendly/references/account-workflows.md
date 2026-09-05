# Account Workflows

Load this reference for account and ledger reads or account mutations. For
every mutation, also load `references/mutation-safety.md` directly from the
skill root.

Values beginning with `$` below are placeholders obtained from current Spendly
JSON or generated locally for one intent.

## Read

- Use `accounts list` to resolve active account IDs; include archived accounts
  only when history or lifecycle work requires them.
- Use `accounts get` for current balance, type, currency, default state,
  archived state, and revision.
- Use `accounts transactions` for cursor-paginated ledger history.
- Use `account-types list` to resolve an active type ID. Account types are
  read-only in the CLI.

## Create and update

Account creation requires a name, active account-type ID, and starting balance.
It inherits context currency and creates an immutable opening ledger entry.

```bash
spendly --json --non-interactive accounts create \
  --name "$ACCOUNT_NAME" \
  --account-type-id "$ACCOUNT_TYPE_ID" \
  --starting-balance "$STARTING_BALANCE" \
  --date "$DATE" \
  --dry-run
```

Commit the otherwise identical command with `--idempotency-key "$KEY"`.
Report the account ID, revision, default state, balances, currency, and opening
ledger reference.

Account update changes only its name or active type. Read the account, preview
with `--if-revision "$REVISION"`, then commit with the same revision and a fresh
key. Never edit opening balance, current balance, currency, or ledger history
through update.

## Lifecycle and default

Archive, reactivate, and set-default each require the account ID and current
revision, a dry run, and a keyed commit.

- Archive preserves all history. Archiving the default clears that preference.
- Reactivate restores eligibility for new expenses and transfers but does not
  restore default status.
- Set-default accepts only an active account.
- There is no permanent account-delete command. Never erase ledger history.

## Reconcile an absolute balance

`adjust-balance --balance` is the desired final balance, not a delta. The
backend calculates and records only the difference.

```bash
spendly --json --non-interactive accounts adjust-balance "$ACCOUNT_ID" \
  --balance "$DESIRED_BALANCE" \
  --date "$DATE" \
  --if-revision "$REVISION" \
  --dry-run
```

Check current balance, signed adjustment, resulting balance, currency, and
warnings. A zero adjustment is a successful no-op. A negative result is valid
but must be surfaced before commit. Commit the same values with a fresh key,
then report the new revision and ledger reference, if one was created.

## Transfer

Resolve two different active account IDs and both current revisions. Currencies
must match; never convert.

```bash
spendly --json --non-interactive accounts transfer \
  --from-account-id "$SOURCE_ACCOUNT_ID" \
  --to-account-id "$DESTINATION_ACCOUNT_ID" \
  --amount "$AMOUNT" \
  --date "$DATE" \
  --if-from-revision "$SOURCE_REVISION" \
  --if-to-revision "$DESTINATION_REVISION" \
  --dry-run
```

Check both resolved IDs, amount, currency, revisions, resulting balances, and
negative-source warning. Commit with a fresh key and otherwise identical
inputs. Report transfer ID, both balances and revisions, and both ledger
references. Transfers do not change expense-cycle spending.

Completed transfers cannot be edited or deleted. Use a separately authorized
compensating transfer when correction is intended.
