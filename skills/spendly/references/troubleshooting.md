# Troubleshooting

Use the JSON `error.code` and details to find the relevant next step.

| Situation                       | Next step                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `spendly` is not found          | `command -v spendly` checks availability; installation is covered in Spendly's CLI docs.                                           |
| Login required or expired       | Run `spendly --agent --json --non-interactive auth login` for browser sign-in on the same computer, then rerun status and context. |
| `ACCOUNT_SETUP_REQUIRED`        | Open Spendly Web once while signed in, then rerun `spendly context`.                                                               |
| `KEYCHAIN_UNAVAILABLE`          | Restore access to the OS credential store. The CLI also has an opt-in plaintext fallback described by `spendly --help`.            |
| Multiple matching names         | List the candidates and use the intended record's ID; ask which one if unclear.                                                    |
| `REVISION_CONFLICT`             | Get the latest record, compare the change, and preview updated input with its current revision and a new key.                      |
| `CATEGORY_CYCLE_MISMATCH`       | List categories in the new date's cycle; use a category from that cycle or `--clear-category`.                                     |
| Idempotency conflict            | The key was used with different input. Check the original operation; a distinct write takes a new key.                             |
| Expired or stale deletion token | Run the deletion preview again for a current token and revision.                                                                   |
| Archived account                | Archived accounts remain readable; `accounts reactivate` makes them available for new activity.                                    |
| Transfer currency conflict      | Transfers need accounts with matching currencies.                                                                                  |

## Connection lost while saving

A timeout may occur after a write has saved. Read the affected record or account
history to check the outcome. Do not retry a write automatically. If the user
explicitly asks to recover the same intended write and the result is still
uncertain, repeat the identical command with its original idempotency key; this
lets the CLI replay an existing result without duplicating the write. If that
retry also has no result, stop and report the outcome as unknown.

Read commands have bounded retries; `--no-retry` disables them. Write commands
have no automatic retries. `--debug` adds redacted diagnostics on stderr.

After browser sign-in, confirm the session and reload defaults with:

```bash
spendly --agent --json --non-interactive auth status
spendly --agent --json --non-interactive context
```
