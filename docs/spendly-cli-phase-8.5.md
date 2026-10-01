# Spendly CLI Phase 8.5: Manual Development Verification

## Status

- Status: complete.
- Environment: source-only development CLI, development Clerk application, and
  configured development Convex deployment.
- Exit criterion: the agent completes the JSON `--non-interactive` suite, the
  user completes the interactive CLI and browser checks below, and the agent
  removes or archives every synthetic record.

## Responsibility Split

The user runs only the commands under [Your Interactive Commands](#your-interactive-commands).
They intentionally omit `--json` and `--non-interactive` so prompts and
human-readable output can be inspected.

The agent owns:

- all JSON `--non-interactive` commands;
- stable-ID selection, dry-run comparison, explicit revisions, idempotency, and
  exit-code assertions;
- creation of two uniquely named synthetic accounts for the interactive checks;
- cleanup and restoration of the original default account.

The exact account names and cycle-valid date for this run are recorded below.

## Automated Preflight

Completed before live verification:

- [x] CLI, Web, Clerk, and backend development configuration align.
- [x] Current backend functions are synced to development Convex.
- [x] Backend tests pass: 35 tests across 3 files.
- [x] CLI tests pass: 100 tests across 19 files.
- [x] CLI production and development TypeScript checks pass.
- [x] Focused Biome checks pass across backend and CLI sources.
- [x] Development and production CLI builds pass.
- [x] Package verification and `pnpm pack:cli` pass.
- [x] CLI documentation validation passes: 8 pages, 57 commands, and 2 JSON
      examples.
- [x] This runbook's Bash command blocks parse with `bash -n`.
- [x] Logged-out `auth status --json --non-interactive` returns structured
      `AUTHENTICATION_REQUIRED` output and exits `3` without prompting.
- [x] `git diff --check` passes.

## Data Impact

This phase uses only synthetic development data:

- the agent creates two uniquely named accounts, transfers a small amount,
  creates and deletes one temporary expense, restores the original default, and
  archives both accounts;
- the user creates and deletes one separate temporary expense;
- no existing expense is edited or deleted;
- no existing account balance is adjusted;
- account records are archived rather than deleted so ledger history remains
  valid.

## Agent-Owned Non-Interactive Suite

The agent runs this suite after browser authentication and records the result in
the checklist below. The full commands are intentionally omitted from the user
runbook because they include generated IDs, revisions, preview tokens, and
idempotency keys that must be captured and checked programmatically.

Coverage:

- authentication, context, cycles, categories, tags, account types, accounts,
  account history, expenses, and current summary reads;
- account add preview/commit/replay, default selection, absolute balance
  adjustment, zero-delta preview, negative-balance warning, transfer
  preview/commit/replay, rename, archive, archived-write rejection, and
  reactivate;
- expense add preview/commit/replay, edit, move, clear/reassign account,
  stale-revision rejection, confirmed delete, missing-resource behavior, and
  consumed-token rejection;
- exit codes `2`, `3`, `4`, `5`, and `6` where applicable;
- restoration of the original default and archival of all synthetic accounts.

Result on 2026-09-09: all scenarios passed against development
Convex. This included exit codes `2`, `4`, `5`, and `6`, exact-key replay,
revision conflicts, balance and ledger effects, archived-write protection, and
opaque cursor pagination. Exit code `3` was verified before login. Spendly Web
matched the CLI before and after cleanup. Both synthetic accounts are archived,
their ledger balances are preserved, no test expense remains, and no default
account is set.

The one Next.js development overlay message was a browser-extension hydration
attribute (`cz-shortcut-listen`) added to `<body>`, not an application runtime
failure.

## Your Interactive Commands

### 1. Log In Through the Browser

Run from the repository root:

~~~bash
cd /Users/akhilesh/dev/projects/spendly-cli
pnpm --dir apps/cli dev auth login
~~~

Complete the Clerk browser flow. Do not paste the callback URL, token, or
credential files into chat. Reply `resume` after the terminal reports success;
the agent will then run the non-interactive suite and provide the two test
account names.

If resuming after an early logout in the same terminal, authenticate the
already-built CLI without rebuilding:

~~~bash
spendly_local auth login
~~~

### 2. Build One Reusable Local CLI

Open a terminal at the repository root and run:

~~~bash
cd /Users/akhilesh/dev/projects/spendly-cli
pnpm --dir apps/cli build:development

spendly_local() {
  node --env-file=apps/cli/.env.local \
    apps/cli/development-dist/development/index.js "$@"
}
~~~

This avoids rebuilding the CLI for every command. Keep this terminal open
because the function and variables exist only in the current shell.

### 3. Set the Test Names and Cycle Date

Copy these exact values for the current development verification run:

~~~bash
TEST_ACCOUNT_NAME="CLI Manual Primary 20260909-A Verified"
TEST_DESTINATION_NAME="CLI Manual Destination 20260909-A"
VERIFY_DATE="2026-08-15"
~~~

### 4. Check Human-Readable Reads

~~~bash
spendly_local auth status
spendly_local context
spendly_local context --date "$VERIFY_DATE"
spendly_local cycles list
spendly_local tags list
spendly_local account-types list
spendly_local accounts list
spendly_local accounts get "$TEST_ACCOUNT_NAME"
spendly_local accounts transactions "$TEST_ACCOUNT_NAME" --limit 10
spendly_local expenses list --limit 5
spendly_local summary --date "$VERIFY_DATE"
~~~

Check that output is readable, contains no JSON envelope, and that exact account
names resolve to the synthetic accounts. The undated context has no current
cycle because today's date is outside the available August cycle; the dated
context and summary must resolve August 2026 successfully.

### 5. Check Interactive Account Previews

These commands do not write:

~~~bash
spendly_local accounts adjust-balance "$TEST_ACCOUNT_NAME" \
  --balance 90 --dry-run

spendly_local accounts transfer \
  --from-account "$TEST_ACCOUNT_NAME" \
  --to-account "$TEST_DESTINATION_NAME" \
  --amount 1 --dry-run
~~~

Check that each preview clearly identifies the affected account or accounts,
the amount, and the expected balance effect. At handoff, the primary balance is
`80` and the destination balance is `60`; the adjustment preview should show
the primary becoming `90`, while the transfer preview should show `79` and
`61` without persisting either preview.

### 6. Add and Edit a Synthetic Expense

Choose a unique description, preview the add, and repeat the same inputs
without `--dry-run`:

~~~bash
INTERACTIVE_DESCRIPTION="CLI interactive verification $(date +%Y%m%d%H%M%S)"

spendly_local expenses add \
  --amount 4.56 \
  --date "$VERIFY_DATE" \
  --spent-on "$INTERACTIVE_DESCRIPTION" \
  --account "$TEST_ACCOUNT_NAME" \
  --dry-run

spendly_local expenses add \
  --amount 4.56 \
  --date "$VERIFY_DATE" \
  --spent-on "$INTERACTIVE_DESCRIPTION" \
  --account "$TEST_ACCOUNT_NAME"
~~~

Check that the committed result matches the preview. The committed output uses
the format `Expense: <id>`; copy only the ID beginning with `jh`, never the
instruction text. For the current verification run, the created expense is:

~~~bash
INTERACTIVE_EXPENSE_ID="jh7f7005gdw29zfphkq6xnqyas8e3br6"

spendly_local expenses get "$INTERACTIVE_EXPENSE_ID"

spendly_local expenses edit "$INTERACTIVE_EXPENSE_ID" \
  --amount 5.67 --clear-account --dry-run

spendly_local expenses edit "$INTERACTIVE_EXPENSE_ID" \
  --amount 5.67 --clear-account
~~~

Check that interactive mode obtains the current revision and generates mutation
keys without asking you to provide either value.

### 7. Cross-Check Spendly Web

Open the development Web app and inspect:

- `http://localhost:3001/accounts`
- `http://localhost:3001/expenses`

Confirm that the two test accounts, balances, ledger entries, and updated
synthetic expense match the CLI. If the Web app is not already running, use:

~~~bash
pnpm --dir apps/web dev --port 3001
~~~

### 8. Check the Destructive Confirmation Prompt

Run the delete command without `--json`, `--non-interactive`, or a confirmation
token:

~~~bash
spendly_local expenses delete "$INTERACTIVE_EXPENSE_ID"
~~~

The prompt must show the exact synthetic expense, permanence, and balance effect
before asking for confirmation. Approve only this synthetic expense. Then run:

~~~bash
spendly_local expenses get "$INTERACTIVE_EXPENSE_ID"
~~~

The final command should report that the deleted expense was not found. Confirm
that it is also absent from Spendly Web.

### 9. Optionally Check Archive and Reactivate

These commands write only to the synthetic destination account and immediately
reverse the state:

~~~bash
spendly_local accounts archive "$TEST_DESTINATION_NAME" --dry-run
spendly_local accounts archive "$TEST_DESTINATION_NAME"
spendly_local accounts reactivate "$TEST_DESTINATION_NAME" --dry-run
spendly_local accounts reactivate "$TEST_DESTINATION_NAME"
~~~

Check that the account disappears from the active list after archive and
returns after reactivate.

Stop here and tell the agent when the interactive expense deletion and Web
checks are complete. Stay authenticated so the agent can perform final cleanup;
do not run the logout section until the agent confirms that both synthetic
accounts are archived.

### 10. Verify Logout After Agent Cleanup

Run only after the agent confirms cleanup:

~~~bash
spendly_local auth logout
spendly_local auth status
echo $?
~~~

The status command must report that authentication is required, and `echo $?`
must print `3`.

Result on 2026-09-09: logout removed local credentials, confirmed remote
revocation, and the following unauthenticated status command exited `3`.

## Completion Checklist

- [x] User: browser login succeeds.
- [x] Agent: all JSON `--non-interactive` reads return valid development data.
- [x] Agent: account previews match commits; replay, revision, conflict, warning,
      and archived-write scenarios behave as documented.
- [x] Agent: expense previews match commits; replay, edit, move, clearing,
      stale-revision, confirmed-delete, missing-resource, and token-consumption
      scenarios behave as documented.
- [x] Agent: expected non-interactive error paths perform no unintended write
      and return their documented exit codes.
- [x] User: human-readable output and exact-name selectors behave as documented.
- [x] User: account and transfer previews are clear and perform no write.
- [x] User: interactive expense add/edit generates internal mutation
      inputs and matches its previews.
- [x] User: the expense deletion prompt is complete and deletes only the
      synthetic expense after approval.
- [x] User and agent: Spendly Web matches the CLI state before and after cleanup.
- [x] User: interactive account archive/reactivate behaves as documented.
- [x] Agent: original default state is restored and all synthetic accounts are
      archived.
- [x] User: final logout removes local authentication and status exits `3`.
