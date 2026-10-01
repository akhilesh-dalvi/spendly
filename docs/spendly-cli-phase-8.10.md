# Spendly CLI Phase 8.10: Manual Interactive Terminal Verification

## Status

- Status: complete; `P8.10-F01` through `P8.10-F18` implemented and targeted
  real-terminal retest passed
- Owner: Spendly maintainer using a real local terminal
- Depends on: Phase 8.9 implementation and automated verification (complete)
- Feeds: Phase 8.11 MCP reuse readiness, Phase 8.12 Raycast reuse readiness,
  release-ready source handoff, and Phase 9
- Last updated: 2026-09-29

## Objective

Verify the parts of the guided CLI experience that automated tests cannot
fully prove: visible focus, keyboard feel, cursor redraw,
screen-reader/static presentation, real account choices, and human
understanding of previews and confirmations.

The primary manual sign-off is task completion: a user must be able to perform
every public read and mutation family successfully. Exhaustive width permutations
remain automated.

This phase does not add features. A failed check returns to Phase 8.9 for a
code or documentation correction, followed by the affected automated and
manual checks.

## Automated Baseline

Do not begin manual sign-off unless the current checkout passes:

```bash
pnpm --dir apps/cli test
pnpm --dir apps/cli build
pnpm --dir apps/cli build:development
pnpm --dir apps/web docs:validate
node skills/spendly/evals/validate.mjs
pnpm --dir apps/cli pack:verify
git diff --check
```

The implementation baseline is 30 CLI test files and 169 tests plus 3 backend
test files and 38 tests,
both CLI builds, eight public CLI documentation pages covering 27 command paths
through 71 checked examples and two JSON examples, 10 Spendly skill evaluations,
and isolated package verification.

## Verification Log

### 2026-09-16: Exploratory Batch 1

Environment: macOS terminal, zsh, Node.js 25.2.1. This is useful exploratory
evidence but does not replace the required final pass on supported Node.js 22
or 24.

Confirmed:

- Root, expense, account, and Add/Edit leaf help expose `--interactive`, use the
  approved Add/Edit vocabulary, and do not advertise Create/Update aliases.
- The launcher shows focus before input, and Up/Down moves focus without
  duplicating an option.
- The Add expense flow showed the configured INR currency, retained the chosen
  calendar date, allowed an explicit category, account, and tag choice, and
  placed connection output outside an active choice list.
- Choosing No at `Add this expense?` printed `Cancelled; no changes made`,
  returned exit code 0, and did not authorize a write.
- Choosing the launcher's explicit Exit row printed `Exited guided mode.`,
  restored the cursor, and returned exit code 0.
- Escape and Ctrl-C at the initial launcher prompt each printed
  `Cancelled; no changes made`, restored the cursor, and returned exit code 0.
- The misspelled `expenss` command suggested `expenses`, executed no command,
  and returned exit code 2.
- `ACCESSIBLE=1` rendered the launcher as a persistent numbered list with plain
  labels and hints; choosing Exit printed `Exited guided mode.` and returned
  exit code 0 without cursor redraw.
- `TERM=dumb` selected the same static numbered launcher presentation, accepted
  the Exit number, and printed `Exited guided mode.`. Its resulting exit code
  remains pending.
- The accessible Add expense dry run kept every prompt in the transcript,
  rejected an invalid decimal and impossible calendar date with an immediate
  re-prompt, accepted category and account numbers, accepted whitespace around
  comma-separated tag numbers, and ended with the preview-only banner without
  offering a commit confirmation.
- The no-cycle category state showed both the disabled
  `No visible categories for this date` row and its explanatory reason. Account
  choices showed names and balances without internal IDs.
- The accessible live Add expense flow displayed `Add this expense? [y/N]`;
  pressing Enter selected the safe No default and printed
  `Cancelled; no changes made`. Its resulting shell exit code remains pending.
- The normal no-color Edit expense dry run showed visible single-select and
  multiselect focus, toggled checkbox selection with Space, moved without
  duplicated rows, kept existing tag selections visible, and used bracketed
  year/month/day focus with segment-specific arrow changes. Its preview-only
  result performed no write.
- Expense search was not available for the current short selector page. This is
  expected because the implementation enables type-to-filter only when the page
  contains more than eight expenses; record the long-list search check as not
  applicable until suitable test data already exists.
- The first guided read batch passed for context, expense detail, current-cycle
  lookup, and category listing. Connection and delayed-wait messages did not
  interrupt active choices; the expense and cycle selectors used readable
  labels without shortened ID suffixes; a full expense ID appeared only in the
  selected record detail; and the no-cycle/no-categories states were clear.
- A naturally slow context request printed the three-second waiting message
  once and completed with an intact result.
- The second guided read batch passed for cycle, tag, account-list,
  account-detail, and account-type output. Cycles and tags returned directly;
  account and account-type listing asked only whether archived records should
  be included; account selection showed the full human name without an ID
  suffix; default, active, balance, type, and nature states were understandable;
  and full stable IDs appeared only in final list/detail output.
- Expense and account-transaction pagination with limit 1 waited for an
  explicit `Load next page` choice before every request, advanced the loaded
  count from one through three, preserved readable rows, and ended with
  `Showing 3. End of results.`. The no-filter selection and result count stayed
  visible. `Change filters` and early `Done` selection remain unverified because
  this run loaded through the end.
- Expense `Change filters` returned to the filter builder, accepted Account and
  Start date, and produced the correct no-match state. A valid August date and
  `Cycle containing the selected date` produced a readable August summary with
  currency, totals, status, days remaining, and a clear no-category-activity
  state. Account-transaction `Done` stopped further loading and accurately
  reported that more results remained.
- Expense deletion dry-run clearly identified permanent deletion, showed the
  exact expense and no account-balance effect, began with the preview-only
  banner, and performed no write. The live confirmation visibly defaulted to
  No and did not delete the expense, but incorrectly returned an error and exit
  code 6 instead of successful cancellation.

Supported-runtime timezone check:

- Node.js 25.2.1 and supported Node.js 24.21.0 report `Asia/Calcutta` through
  `Intl` even though macOS is configured with the modern equivalent
  `Asia/Kolkata`. Date calculation is correct. Normalize only the human-facing
  timezone label to the modern IANA name while preserving actual timezone and
  machine-output semantics. Node.js 22 still requires its final smoke pass.

The supported Node.js 24 manual pass and targeted real-terminal retest satisfy
this phase. The Node.js 22 and cross-platform runtime matrix remains an existing
automated release gate, not an additional Phase 8.10 manual check.

Phase 8.9 findings, implemented and targeted-retested:

- `P8.10-F01`: after choosing a launcher group, `Choose an action` has no Back
  choice. Escape cancels the entire guided session, so a user cannot correct the
  group choice without restarting.
- `P8.10-F02`: the Add expense human preview uses ID-oriented labels and exposes
  a raw stable tag ID, for example `Category ID`, `Account ID`, `Cycle ID`, and
  `Tag IDs`. The human preview must show resolved names such as
  `Category: Uncategorized`, `Account: Unassigned`, and `Tags: Home`; machine
  output may retain stable IDs.
- `P8.10-F03`: static single-select rows use the checkbox marker `[ ]`, and the
  marker does not change after a number is submitted. This is the current
  implementation but visually implies an unselected checkbox. Static
  single-select rows must not show `[ ]` or `[x]`; render plain numbered rows,
  such as `1) Quick actions - Common tasks`, and then echo the accepted label,
  such as `Selected: Exit`. Reserve `[ ]` and `[x]` exclusively for static
  multiselect choices.
- `P8.10-F04`: static multiselects correctly use checkbox markers and accept
  comma-separated numbers, but they do not append the resolved accepted labels;
  only the typed indexes remain visible. Keep the original static list and append
  feedback such as `Selected: Essentials, Home` without redrawing prior lines.
- `P8.10-F05`: the static text renderer blindly appends a colon to prompt copy
  that already ends in a question mark, producing
  `What was this spent on?:`. Normalize terminal punctuation so it renders as
  one natural prompt, not `?:`.
- `P8.10-F06`: guided summary accepted `Cycle containing the selected date` for
  a date with no cycle, then failed with `RESOURCE_NOT_FOUND` and suggested
  `use --interactive` even though the command was already interactive. Guided
  recovery must remain inside the flow by offering Change date, Choose another
  cycle, or Cancel; it must not recommend the mode already in use.
- `P8.10-F07`: the human expense-filter summary prints a raw account ID, for
  example `Filters: account: kh7...`, instead of the selected account name.
  Resolve resource-backed cycle, category, account, and tag filters to human
  names in human output while keeping stable IDs unchanged in requests, JSON,
  and copyable explicit commands.
- `P8.10-F08`: after the user chooses Done in guided pagination, transaction
  output prints a very long `Next page` command containing an opaque cursor and
  internal account ID. In guided mode, Done must end with a concise stopped
  summary and no opaque continuation command; retain the existing copyable
  command for non-interactive human output where it is the way to continue.
- `P8.10-F09`: pressing Enter on the default No for live expense deletion
  throws `DELETION_CONFIRMATION_REQUIRED` and exits with code 6. A human decline
  is a normal cancellation: print `Cancelled; no changes made` and return exit
  code 0. Preserve the confirmation-error code for genuinely missing required
  confirmation in non-interactive use.
- `P8.10-F10`: guided account money inputs omit the configured currency from
  their prompt titles. The observed `Starting balance` prompt accepted a number
  before revealing INR in the preview; source inspection shows the same issue
  for desired absolute balance and transfer amount. Show the resolved currency
  before input, for example `Starting balance (INR)`, without changing request
  or machine-output contracts.
- `P8.10-F11`: guided Archive and Reactivate accept only one account. The
  approved UX now uses an eligible-account multiselect, one combined preview,
  one default-No confirmation, per-account revision checks, and an atomic
  all-or-nothing commit. Keep the existing explicit single-account command and
  JSON contracts available for automation.
- `P8.10-F12`: Adjust balance asks for the desired balance/date/note before the
  account is chosen, and Transfer asks for amount/date/note before source and
  destination. Select the target account—or source then eligible destination—
  first so the following monetary prompt can show currency, current balance,
  and relevant context.
- `P8.10-F13`: lifecycle prompt and preview copy leaks implementation vocabulary
  or uses a generic action: `Choose an account to set-default`, `Edit account
  preview` for Archive/Reactivate, and an untitled final-account view for Make
  default. Use `Make default`, `Archive account preview`, `Reactivate account
  preview`, and focused status/default diffs consistently with Spendly Web.
- `P8.10-F14`: default human account mutation previews and success results
  expose stable account or ledger IDs inline or as primary rows, including
  Edit, lifecycle, balance adjustment, transfer From/To lines, and Add account's
  raw `opening_balance <ledger-id>` result. Keep human names, financial effects,
  and labels such as `Opening balance` primary; move full IDs to explicit
  detail/verbose output while preserving JSON and intentional copyable commands.
- `P8.10-F15`: the Edit expense human preview uses the raw stable expense ID as
  its title and repeats it in an `ID` row, while omitting a readable target
  summary. Identify the expense by date, description, and amount in the default
  review screen; keep the stable ID in explicit detail/verbose output and JSON.
- `P8.10-F16`: the Add account flow still uses `Create this account?` and
  `OK - Account created`, reintroducing the rejected Create vocabulary after
  commands, help, previews, and Spendly Web were aligned on Add. Use
  `Add this account?` and `OK - Account added`; default-No behavior and
  cancellation semantics stay unchanged.
- `P8.10-F17`: supported Node.js 24.21.0 renders the effective timezone as the
  legacy alias `Asia/Calcutta` on a system configured for `Asia/Kolkata`.
  Normalize the default human-facing label to the modern IANA name while
  preserving the correct date calculation, underlying timezone semantics, and
  machine-output contract.
- `P8.10-F18`: a filtered backend cursor page can contain zero matching
  expenses while still reporting another page. Guided mode rendered
  `More expenses are available (0 loaded)` and could finish with
  `Showing 0. More results are available.`. Guided pagination must silently
  advance through empty intermediate pages until it finds a match or reaches
  the true end; one-page JSON and non-interactive cursor contracts stay
  unchanged.

The affected terminal checks were repeated against the implementation candidate
on 2026-09-29, as recorded below.

### 2026-09-28 to 2026-09-29: P8.10 Finding Implementation

- `P8.10-F01` through `P8.10-F18` are implemented.
- Guided action menus now have Back navigation; static single and multiselect
  transcripts use distinct markers and echo accepted labels; static prompt
  punctuation is normalized.
- Expense previews and filter summaries resolve human names, expense Edit uses
  a readable target, guided pagination suppresses opaque continuation commands
  after Done, summary recovers from a date without a cycle, and declining live
  deletion is a successful cancellation.
- Account money prompts show currency and current context after resource
  selection. Archive and Reactivate use eligible-account multiselects, one
  combined preview, one default-No confirmation, per-account revisions, and a
  single atomic idempotent backend mutation. Explicit single-account and JSON
  command contracts remain available.
- Account lifecycle vocabulary is action-specific; default human mutation
  output removes incidental account and ledger IDs while intentional copyable
  Next commands retain stable IDs; Add vocabulary is consistent.
- Human context output maps the legacy `Asia/Calcutta` alias to
  `Asia/Kolkata`; structured machine output remains unchanged.
- Guided expense pagination skips empty filtered cursor pages without showing
  a zero-loaded continuation prompt; JSON and non-interactive pagination still
  return exactly one requested page.
- Automated verification passes: 169 CLI tests, 38 backend tests, CLI and
  backend TypeScript checks, focused Biome, production and development builds,
  public CLI documentation validation, Spendly skill evaluation validation,
  isolated package verification, and `git diff --check`. The real-terminal
  checks remain below.

Fast affected-path retest after rebuilding:

```bash
pnpm --dir apps/cli build:development

spendly_local --interactive --no-color
ACCESSIBLE=1 spendly_local expenses add --interactive --dry-run --no-color
spendly_local summary --interactive --no-color
spendly_local expenses list --interactive --limit 1 --no-color
spendly_local expenses delete --interactive --no-color
spendly_local expenses edit --interactive --dry-run --no-color

spendly_local accounts add --interactive --dry-run --no-color
spendly_local accounts archive --interactive --dry-run --no-color
spendly_local accounts reactivate --interactive --dry-run --no-color
spendly_local accounts set-default --interactive --dry-run --no-color
spendly_local accounts adjust-balance --interactive --dry-run --no-color
spendly_local accounts transfer --interactive --dry-run --no-color
spendly_local context --interactive --no-color
```

For Archive and Reactivate, select at least two eligible disposable accounts
when available. Dry-run must show one combined preview and save nothing. For
Delete, press Enter at the default No and verify cancellation plus exit code 0.
For the expense-list filter check, choose filters that produce an empty first
cursor page and verify the CLI either finds a later match or reports the true
end without a `0 loaded` pagination prompt.

### 2026-09-29: Targeted Real-Terminal Retest

- `P8.10-F01` through `P8.10-F17` passed in a rebuilt development CLI on
  macOS. The maintainer confirmed Back navigation, accessible selection labels
  and punctuation, readable expense and account previews, no-cycle summary
  recovery, filter names, deletion and Add account cancellation with exit code
  0, account-first currency prompts, and the modern timezone label.
- The first guided Archive and Reactivate batch previews failed because the
  development Convex deployment had not received the new functions. After a
  one-time development push, two-account Archive and Reactivate dry runs each
  showed one combined preview and saved nothing.
- `P8.10-F18` passed after rebuilding: Account and Tags filters with a page
  size of one returned `No expenses match these filters` and
  `Showing 0. End of results.` without a `0 loaded` continuation prompt.
- Automated release gates passed after the `P8.10-F18` fix: 169 CLI tests, 38
  backend tests, both CLI builds, TypeScript, focused Biome, documentation and
  skill validation, package verification, and `git diff --check`.

### 2026-09-19: Baseline Refresh

- All 30 CLI test files and 158 tests pass.
- Production and development builds, eight-page public documentation validation,
  10 Spendly skill evaluations, isolated package verification, and
  `git diff --check` pass.
- Current source inspection confirms `P8.10-F01` through `P8.10-F09` remain
  present. Do not spend maintainer time repeating those exact paths until their
  fixes land.
- Existing development data has active and archived accounts plus multiple
  same-currency transfer candidates, so the remaining account dry runs require
  no setup writes.

### 2026-09-23: Supported Node.js Manual Pass

- Node.js 24.21.0, the development build, CLI version 0.1.0, authentication,
  and INR context were confirmed.
- Add account dry-run accepted the name, balance, date, and active Savings type;
  its preview explained the opening ledger entry and saved nothing.
- Edit, Archive, Reactivate, Make default, Adjust balance, and Transfer dry runs
  all began with the preview-only banner and saved nothing. Edit limited changes
  to name/type; lifecycle selectors used eligible active/archived/non-default
  accounts; balance adjustment clearly separated current, desired, and computed
  values; transfer filtered to another active INR account and showed both
  before/after balances; and a negative source result displayed
  `NEGATIVE_SOURCE_BALANCE` with human wording.
- A second Adjust balance dry run set an active account's desired final balance
  to INR -1.00. The preview correctly showed the INR 195.00 current balance,
  INR -196.00 computed adjustment, and the human warning with stable
  `NEGATIVE_BALANCE` code; preview-only mode saved nothing.
- The live Edit expense review offered `Edit answers`, returned to the field
  chooser, replaced the first temporary description in the next preview, and
  then accepted Cancel. It printed `Cancelled; no changes made`, returned exit
  code 0, and saved nothing. The preview also exposed `P8.10-F15` by using and
  repeating the raw expense ID instead of a readable target summary.
- The live Add account review showed the account name, type, INR opening
  balance, opening-ledger explanation, date, and revision immediately before a
  default-No confirmation. Choosing No printed `Cancelled; no changes made`,
  returned exit code 0, and created nothing. Its `Create this account?` prompt
  exposed the remaining vocabulary mismatch recorded as `P8.10-F16`.
- The live Transfer review showed the named source and destination, INR amount,
  both before/after balances, date, note state, and warning state. Pressing
  Enter accepted the default No, printed `Cancelled; no changes made`, returned
  exit code 0, and transferred nothing. Together with Add account, this passed
  the representative account-confirmation cancellation check; its prompt
  order and raw IDs were already recorded as `P8.10-F12` and `P8.10-F14`.
- A Node.js 24.21.0 guided context read kept the explicit date correct but
  rendered `Asia/Calcutta` on the `Effective date` line. This confirms the
  supported-runtime human-label issue recorded as `P8.10-F17`.
- In the normal no-color Add expense prompt, invalid `abc` amount input stayed
  visible and editable beside its validation error. Correcting it to `10`
  advanced to the date prompt; cancelling there printed
  `Cancelled; no changes made` and returned exit code 0.
- With macOS VoiceOver enabled, the accessible no-color launcher announced the
  prompt, numbered option labels and explanations, numeric choice instruction,
  and exit result in an understandable order. Combined with the already
  verified persistent static Add expense transcript for disabled reasons,
  validation, and default-No confirmation, the screen-reader check passed.

### 2026-09-28: Functional Commit Journey

- The original default account was recorded as
  `Phase 8.6 Agent Primary 20260911` for restoration at the end of the journey.
- `Phase 8.10 Functional A 20260928` was committed once as an active Cash
  account with an INR 100.00 opening balance. The success result and immediate
  `accounts get` read matched on name, type, balance, opening balance, default
  state, active state, and revision; the read returned exit code 0.
- `Phase 8.10 Functional B 20260928` was committed once as an active Savings
  account with an INR 50.00 opening balance. Its immediate `accounts get` read
  matched the committed result and returned exit code 0. Its clean `Next:` line
  also showed that the earlier joined transcript line was a copy artifact, not
  a reproduced CLI rendering defect.
- The commit confirmed two existing presentation findings: `P8.10-F16` also
  applies to the `Account created` success headline, and `P8.10-F14` covers the
  raw `opening_balance` ledger token and stable ledger ID in default human
  success output.
- Both disposable accounts were then archived successfully, each advanced to
  revision 2, and `accounts list --include-archived` confirmed their Archived
  state. The original `Phase 8.6 Agent Primary 20260911` account remained the
  active default. Archive output repeated only the already-recorded generic
  preview-title and raw-ID findings; it introduced no new blocker.

## Safety and Test Data

- Use the development deployment and non-production test data only.
- Use `--dry-run` for mutation previews in Sections 1-6.
- Where a cancellation must be inspected, omit `--dry-run` but choose Cancel,
  No, or Escape.
- Do not repeat a successful mutation merely to duplicate evidence already
  provided by the automated commit suites and prior development end-to-end
  runs. The two `Phase 8.10 Functional` accounts created during verification
  are archived, so no additional cleanup write is required.
- Do not paste Markdown backticks around commands.
- Do not record credentials, OAuth URLs, tokens, environment values, or real
  financial data in verification notes.
- Prepare at least one expense, one active account, two active same-currency
  accounts for transfer selection, one archived account, and enough expenses or
  transactions to exercise pagination.
- If a required data state is missing, record the item as blocked rather than
  changing production data merely to satisfy the checklist.

## Local Setup

Use supported Node.js 22 or 24 for release sign-off. Newer non-LTS Node versions
may be used for exploratory testing but do not satisfy the release runtime
gate.

```bash
node --version
pnpm --dir apps/cli build:development

spendly_local() {
  node --env-file=apps/cli/.env.local \
    apps/cli/development-dist/development/index.js "$@"
}

spendly_local --version
spendly_local auth status
```

## 1. Discovery and Spendly Vocabulary

```bash
spendly_local --help
spendly_local expenses --help
spendly_local accounts --help
spendly_local expenses add --help
spendly_local expenses edit --help
spendly_local accounts add --help
spendly_local accounts edit --help
spendly_local --interactive
```

- [x] Root help visibly explains `spendly --interactive`.
- [x] The launcher groups Quick actions, Expenses, Accounts, Planning data, and
      Authentication and provides a visible Exit option.
- [x] Guided actions use the Spendly Web terms Add expense, Edit expense, Delete
      expense, Add account, Edit account, Adjust a balance, Transfer, Make
      default, Archive account, and Reactivate account.
- [x] Help and examples use `expenses add`, `expenses edit`, `accounts add`, and
      `accounts edit`; they do not present create/update compatibility commands.
- [x] Exiting restores the cursor, prints one calm exit line, performs no
      backend mutation, and returns exit code 0.

## 2. Focus, Selection, Date, and Cancellation

```bash
spendly_local --interactive --no-color
spendly_local expenses edit --interactive --dry-run --no-color
spendly_local context --interactive --no-color
```

- [x] Every single-select shows `›` on the focused row before any key is
      pressed, and Up/Down moves it immediately without duplicating an option.
- [x] Every multiselect shows `› ◻` for focused/unselected and `› ◼` for
      focused/selected; Space changes selection and Enter accepts it.
- [x] Focus and selection remain understandable with no color.
- [x] Date input always brackets the active segment, such as `[2026]-09-15`;
      Left/Right moves the brackets and Up/Down changes only that segment.
- [x] Escape and Ctrl-C each restore the cursor and terminal mode, print
      `Cancelled; no changes made`, return success, and perform no write.
- [x] Validation errors stay beside the current prompt and preserve the typed
      value for correction.

## 3. Static and Limited-Terminal Modes

```bash
ACCESSIBLE=1 spendly_local --interactive --no-color
TERM=dumb spendly_local --interactive --no-color
NO_COLOR=1 spendly_local expenses add --interactive --dry-run
```

- [x] `ACCESSIBLE=1` uses static numbered choices, comma-separated checkbox
      selection, plain date/text input, and yes/no confirmation without cursor
      redraw.
- [x] `TERM=dumb` automatically selects the same static ASCII behavior.
- [x] No-color output preserves every focus, selection, warning, preview, and
      error meaning.
- [x] A screen reader announces prompt titles, numbered options, disabled
      reasons, validation errors, and confirmations in a useful order.

## 4. Guided Read Commands

Run every guided read path:

```bash
spendly_local context --interactive
spendly_local expenses get --interactive
spendly_local expenses list --interactive
spendly_local cycles list
spendly_local cycles current --interactive
spendly_local categories list --interactive
spendly_local tags list
spendly_local summary --interactive
spendly_local accounts list --interactive
spendly_local accounts get --interactive
spendly_local accounts transactions --interactive --limit 1
spendly_local account-types list --interactive
```

- [x] Date, cycle, category, account, tag, filter, and include-archived prompts
      appear only where applicable.
- [x] Human selectors show useful names and context without shortened internal
      ID suffixes; the selected records are nevertheless correct.
- [x] Expense filters show the active filters and number of results.
- [x] With page size 1, expense pagination offers Load next page, Change
      filters, and Done; transaction pagination offers Load next page and Done.
- [x] No next page is fetched until Load next page is explicitly chosen.
- [x] Commands with no useful prompt, such as `cycles list` and `tags list`,
      return results directly.

## 5. Expense Workflows Without Saving

```bash
spendly_local expenses add --interactive --dry-run
spendly_local expenses edit --interactive --dry-run
spendly_local expenses delete --interactive --dry-run
```

- [x] Add expense shows the onboarding currency in the amount title, for
      example `Expense amount (INR)`.
- [x] The date remains the calendar day selected in the prompt.
- [x] For a date with no visible cycle categories, the disabled row says both
      `No visible categories for this date` and
      `The selected date has no cycle with visible categories`.
- [x] Account choices show names and balances without shortened IDs and explain
      automatic default-account and unassigned choices.
- [x] Every dry run begins with `PREVIEW ONLY - no changes were saved.` and
      performs no mutation.
- [x] Edit expense preselects the current values, clearly distinguishes keep,
      change, and clear choices, and shows only the resulting field changes and
      balance effects.
- [x] Delete expense clearly says permanent deletion, shows the exact target
      and restored balance effect, and performs no deletion in dry-run mode.

Inspect the live review controls without saving:

```bash
spendly_local expenses add --interactive
spendly_local expenses edit --interactive
spendly_local expenses delete --interactive
```

- [x] Add expense asks `Add this expense?`; choose No or Escape.
- [x] Edit expense offers Apply changes, Edit answers, and Cancel. Choose Edit
      answers, change one field, review the new preview, then choose Cancel.
- [x] Delete expense confirmation defaults to No. Press Enter without moving
      the choice and verify that nothing is deleted.

## 6. Account Workflows Without Saving

```bash
spendly_local accounts add --interactive --dry-run
spendly_local accounts edit --interactive --dry-run
spendly_local accounts archive --interactive --dry-run
spendly_local accounts reactivate --interactive --dry-run
spendly_local accounts set-default --interactive --dry-run
spendly_local accounts adjust-balance --interactive --dry-run
spendly_local accounts transfer --interactive --dry-run
```

- [x] Add account validates the name, signed starting balance, opening date, and
      active account type and explains the opening ledger entry.
- [x] Edit account offers only name and account-type fields and shows a focused
      diff.
- [x] Archive lists active accounts; Reactivate lists archived accounts; Make
      default excludes archived and already-default accounts.
- [x] Adjust balance clearly distinguishes desired final balance from computed
      adjustment and shows any negative-balance warning.
- [x] Transfer excludes the source from destination choices, filters to active
      same-currency accounts, and shows both before/after balances.
- [x] A negative source result shows the human warning and stable
      `NEGATIVE_SOURCE_BALANCE` code prominently.
- [x] No account, lifecycle, balance, transfer, or ledger write occurs during
      these dry runs.

For confirmation presentation, repeat representative commands without
`--dry-run`, then choose No, Cancel, or Escape:

```bash
spendly_local accounts add --interactive
spendly_local accounts edit --interactive
spendly_local accounts archive --interactive
spendly_local accounts adjust-balance --interactive
spendly_local accounts transfer --interactive
```

- [x] Each confirmation repeats enough target and financial context to make the
      choice understandable, defaults safely, and cancellation performs no
      write.

## 7. Functional Coverage Reconciliation

Do not rerun a function solely because its evidence came from an earlier phase.
Functional sign-off combines real-terminal usability, current automated commit
contracts, and existing development records:

- [x] Every public read family was exercised against the development deployment:
      context, summary, expenses, cycles, categories, tags, accounts, account
      transactions, and account types.
- [x] Every interactive mutation family reached a normalized server preview in
      the current candidate: expense Add/Edit/Delete and account
      Add/Edit/Archive/Reactivate/Make default/Adjust balance/Transfer.
- [x] Current automated tests commit a guided expense, account creation, balance
      adjustment, transfer, and confirmed deletion; they verify revisions,
      idempotency inputs, ledger references, and no retry after uncertain writes.
- [x] Existing Phase 8.6 and earlier development records and their read-backs
      demonstrate committed account creation, expenses, balance effects,
      transfers, default selection, archive/reactivate state, and ledger history
      through the same command/backend contracts.
- [x] Authentication login/status worked in the real terminal; logout,
      credential removal, refresh, browser callback, and shell completion have
      focused automated coverage.
- [x] The two 2026-09-28 Add account commits and immediate reads reconfirmed the
      current candidate's live commit/read-back path without duplication.
- [x] Archive `Phase 8.10 Functional A 20260928` and
      `Phase 8.10 Functional B 20260928` to clean up the disposable records.
- [x] After `P8.10-F01` through `P8.10-F18` are implemented, rerun only the affected
      interactive paths plus the automated release gates; do not repeat the
      unaffected functional matrix.

## 8. Loading and Recovery

Automated renderer coverage is responsible for the 40-, 80-, and 120-column
layout matrix.

- [x] `Connecting to Spendly...` appears before a prompt sequence, never between
      a question and its options.
- [x] If a request naturally exceeds three seconds, `Still waiting for Spendly.
      You can press Ctrl+C to cancel.` appears once and the final screen remains
      intact. Do not manufacture latency against production merely for this
      check; timer behavior also has automated coverage.

```bash
spendly_local expenss --no-color
echo $?
```

- [x] The typo suggests `expenses`, executes nothing, and returns exit code 2.

## Sign-off Record

The macOS/zsh real-terminal evidence above includes a supported Node.js 24.21.0
pass, guided reads, expense and account previews, safe cancellations,
accessible/static prompts, functional commit/read-back reconciliation, and the
2026-09-29 targeted retest of all 18 findings. The disposable test accounts were
archived. No Phase 8.10 blocking finding remains open.

## Exit Criterion

Phase 8.10 is complete: the applicable functional checks passed, no write
occurred during dry runs or cancelled confirmations, and all blocking findings
were fixed and reverified. Phase 8.11 follows, then Phase 8.12 preserves that
operation boundary for Raycast before Phase 9 starts.
