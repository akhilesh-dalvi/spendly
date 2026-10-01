# Spendly CLI Phase 8.9: Human CLI UX Polish

## Status

- Status: implementation complete, including `P8.10-F01` through
  `P8.10-F18`; affected real-terminal retest passed
- Last updated: 2026-09-29
- Depends on: Phase 8.8 guided interactive inputs
- Feeds: Phase 8.10 maintainer terminal verification, Phase 8.11 MCP reuse
  readiness, Phase 8.12 Raycast reuse readiness, the release-ready source
  baseline, and Phase 9 packaging and release
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

## Objective

Make Spendly feel calm, obvious, and trustworthy to a human using a terminal.
Phase 8.8 adds the required input controls; Phase 8.9 improves the complete
experience around those controls: discovery, orientation, loading feedback,
responsive output, pagination, previews, success states, errors, accessibility,
and recovery.

This phase must not change the versioned JSON contract, backend business rules,
stable IDs, exit-code meanings, agent safety workflow, or explicit flag
capabilities. The approved public command vocabulary uses Add/Edit instead of
Create/Update. `--interactive` remains opt-in and defaults to `false`.

## Audit Summary

The audit covered the installed help tree, all read and mutation commands,
authentication, prompt adapters, terminal renderers, errors, pagination,
Fumadocs examples, package verification, and the Phase 8.8 terminal feedback.

| Area | Current behavior | UX gap | Priority |
| --- | --- | --- | --- |
| Discovery | Root help lists commands; `--interactive` opens a launcher | Leaf help does not show the guided equivalent or examples; the launcher is one long flat list | P0 |
| Prompt focus | Selects have radio markers; multiselects now use `› ◻` and `› ◼` | Focus, selection, defaults, and disabled states need one shared visual language and PTY coverage | P0 |
| Wizard orientation | Prompts appear sequentially | Users cannot see progress, review all answers, or edit one answer before preview | P1 |
| Waiting states | Backend reads and previews can leave a blank terminal | No loading message, elapsed feedback, or cancellable wait is visible | P0 |
| Read output | Fixed-width tables include full IDs | Tables overflow narrow terminals, numeric columns are not aligned, and long text is not managed | P0 |
| Pagination | JSON metadata contains `hasMore` and `nextCursor` | Human output hides continuation information, so users may believe the first page is complete | P0 |
| Money | Most amounts use `CODE 0.00` | Grouping, signs, currency consistency, negative emphasis, and transaction currency are uneven | P0 |
| Dates | Raw ISO dates and exclusive end dates are shown | Human output exposes implementation language such as `END (EXCLUSIVE)` without a friendly range | P1 |
| Mutation preview | Server previews are correct but verbose | Full before/after records obscure the actual changes; dry-run status is easy to miss | P0 |
| Warnings | Warning codes are rendered as a comma-separated line | Financial warnings do not have enough hierarchy before confirmation | P0 |
| Success | Results print the updated resource | There is no concise success headline, action summary, or useful next command | P1 |
| Empty states | Most tables print `No results.` | The message does not distinguish no data from no filter matches or explain the next action | P0 |
| Errors | Human mode prints `Error: <message>` | Error code, field context, recovery action, and relevant help command are hidden | P0 |
| Authentication | Browser login is secure and functional | Waiting, success, expiry, already-signed-in, and signed-out states are developer-shaped | P1 |
| Accessibility | Color can be disabled and multiselect focus no longer relies on color | No explicit screen-reader/static mode, ASCII fallback contract, or narrow-terminal matrix exists | P0 |
| Shell ergonomics | Commands and flags are stable | No shell completion or typo suggestions; examples do not explicitly warn against typing Markdown backticks | P1 |

## Product Decisions

### Interactive Activation

- Keep `--interactive` defaulting to `false`.
- `spendly` without arguments continues to show help.
- `spendly --interactive` opens the guided launcher.
- With `--interactive`, a human TTY may prompt only for a missing required value
  without starting a complete wizard.
- A fully specified command never prompts unless `--interactive` is supplied,
  except for the existing human deletion confirmation.
- JSON, agent, non-interactive, piped, and non-TTY execution never prompts.

### Human and Machine Output

- Human output may improve its layout and wording without changing data or
  safety behavior.
- Versioned JSON field names, envelopes, warnings, pagination metadata, and
  error codes remain byte-structure compatible.
- Prompt controls and transient loading feedback stay on stderr. Final results
  stay on stdout.
- Redirected human output must contain no cursor-control sequences.
- Color and Unicode may reinforce meaning but never carry meaning alone.

### Scope Boundary

This is a polished command-line application, not a full-screen TUI. Do not add
persistent panels, mouse-only controls, background daemons, natural-language
parsing, or a second command contract.

## Workstream 1: Command Discovery and Help

### Root Help

- Group commands in task order: Quick start, Expenses, Accounts, Planning data,
  and Authentication.
- Put the most common human actions first: add expense, list expenses,
  account balances, summary, and transfer.
- Add one visible line near the top: `Guided mode: spendly --interactive`.
- Keep automation flags available but move their detailed explanation below
  the human starting path.
- State that Markdown backticks shown in prose are formatting and must not be
  typed around a shell command; fenced code blocks remain directly copyable.

### Group and Leaf Help

- Every applicable leaf command shows both forms:
  - `Guided: spendly expenses add --interactive`
  - `Flags: spendly expenses add --amount 18.75 --spent-on "Lunch"`
- Add one synthetic, non-destructive example per read command and one
  `--dry-run` example per mutation.
- Explain defaults next to the relevant option: local date, default account,
  automatic category inference, page size, and active-only resources.
- Mark advanced machine-only inputs such as revisions, idempotency keys,
  confirmation tokens, and cursors as automation controls.
- Surface inherited global options or add a consistent footer pointing to
  `spendly --help`; current leaf help must not make `--interactive` look
  unsupported.
- Add `See also` links between list/get/add/edit workflows.
- Preserve Commander-generated syntax as the source of truth and keep the docs
  validator checking every copyable example.

### Command Launcher

- Replace the flat 24-item chooser with task groups or a two-step resource and
  action chooser.
- Lead with recent/high-frequency actions without storing personal financial
  values or silently changing command behavior.
- Show short descriptions, not only action names.
- Keep type-to-search and stable command values.
- Provide `Exit` as a visible option in addition to Escape/Ctrl-C.
- Do not expose development-only authentication canaries.

### Spendly UI Vocabulary

The CLI uses the same action names as Spendly Web. These are the public command
names, not aliases for older vocabulary:

| Spendly action | CLI command |
| --- | --- |
| Add expense | `spendly expenses add` |
| Edit expense | `spendly expenses edit` |
| Delete expense | `spendly expenses delete` |
| Add account | `spendly accounts add` |
| Edit account | `spendly accounts edit` |
| Adjust balance | `spendly accounts adjust-balance` |
| Transfer | `spendly accounts transfer` |
| Make default | `spendly accounts set-default` |
| Archive account | `spendly accounts archive` |
| Reactivate account | `spendly accounts reactivate` |

Guided action labels, prompt headings, help descriptions, examples, shell
completion, public documentation, and the Spendly skill must use this
vocabulary. Do not expose `expenses create`, `expenses update`,
`accounts create`, or `accounts update` as compatibility aliases. Internal
backend operation names may continue to use create/update terminology.

### Shell Ergonomics

- Add generated completion for zsh, bash, and fish through a documented
  `spendly completion <shell>` command or equivalent install-time output.
- Complete command names and global option names locally; never fetch or expose
  user resource names during shell completion.
- Suggest close command/option spellings after a typo without automatically
  executing the suggestion.
- Preserve full long-form flags; short aliases are added only for universal,
  unambiguous operations such as help and version.

## Workstream 2: Prompt and Wizard Experience

### Shared Visual Grammar

- `›` always marks keyboard focus.
- `◻` means not selected and `◼` means selected; ASCII fallback uses `>` plus
  `[ ]` and `[x]`.
- Static single-select rows do not show `[ ]` or `[x]`; they use plain numbered
  rows and echo the accepted label. Reserve `[ ]` and `[x]` exclusively for
  static multiselects where checked state is meaningful.
- Static multiselects preserve their original non-redrawing list and append the
  accepted labels after number entry, for example
  `Selected: Essentials, Home`.
- Prompt renderers normalize terminal punctuation and never turn question copy
  into a doubled suffix such as `?:`.
- Radio/select focus remains structurally visible without color.
- Disabled choices show a reason such as `Archived` or `Different currency` if
  showing them is more informative than hiding them.
- Selected count is visible for long multiselects, including while searching.
- Instructions name the exact keys: arrows, Space, Enter, Escape, and typing to
  search.
- Focus appears before any selection and moves immediately with arrow keys.

### Orientation and Review

- Every second-level launcher action list includes a visible Back choice that
  returns to the group list without exiting guided mode. Escape continues to
  cancel the entire guided session.
- Guided mutations show lightweight progress, for example `Expense 2/6 · Date`.
- Prompt titles use the resource and action consistently.
- Show the applicable currency beside amount and balance prompts.
- Explain signed versus positive-only values at the input, not only after a
  validation error.
- Dates show the local timezone and default date.
- Default-account choices explain what Spendly will do; the server preview must
  show what was actually resolved. Category history inference is not exposed as
  a guided choice.
- Human previews show resolved resource names and semantic labels. Raw category,
  account, cycle, and tag IDs belong in explicit detail or machine output, not
  in the default human review screen.
- Optional text fields have explicit `Skip`/`None` language rather than relying
  on an unexplained blank value.
- Edit flows prefill current values and distinguish Keep, Change, and Clear.
- Before contacting the preview endpoint, show a compact answer review with
  `Continue`, `Edit answers`, and `Cancel`.
- `Edit answers` returns to a field chooser rather than forcing a complete
  restart. The exact reviewed values are the values sent to preview.
- Dry runs stop after the server preview and clearly state that nothing was
  saved.

### Search and Large Collections

- Account, expense, cycle, category, and tag search matches presentation labels
  while submitting stable IDs.
- Search is case-insensitive and preserves already selected multiselect values
  when the query changes.
- Show result counts and selected counts.
- Limit the visible viewport to the terminal height and keep the focused row in
  view.
- Expense selection keeps deterministic cursor pagination, shows page state,
  and preserves `Load more` plus manual-ID fallback.
- Duplicate names show useful non-ID context such as type, balance, date, and
  account. Human selectors do not expose shortened internal IDs.
- Do not fuzzy-submit typed text or silently choose the first match.

### Loading, Cancellation, and Failure

- Show a restrained spinner/status for authentication discovery, resource
  loading, preview generation, commits, and session refresh.
- After a few seconds, change the status to a plain message such as `Still
  waiting for Spendly…`; never imply that a write failed while its result is
  uncertain.
- Ctrl-C during local prompting cancels immediately and restores raw mode and
  the cursor.
- Ctrl-C during a network request aborts reads when safe. For an in-flight
  mutation, follow the existing uncertain-result rule and tell the user to
  verify state rather than retrying automatically.
- Cancellation prints one calm line and no stack trace.
- Validation errors remain inline and retain the user's input.

## Workstream 3: Responsive Read Output

### Shared Layout Engine

- Introduce one human-render context containing terminal width, color support,
  Unicode support, TTY state, locale, timezone, and output mode.
- Replace the fixed `padEnd` table helper with a width-aware renderer.
- At wide widths, use aligned tables. At narrow widths, switch to stacked
  records rather than horizontally scrolling or dropping essential data.
- Wrap or truncate descriptions and notes predictably, with an ellipsis and a
  way to inspect the full record.
- Right-align money and counts; keep dates and status markers stable.
- Never split ANSI sequences, Unicode graphemes, money values, or IDs while
  calculating width.
- Preserve full stable IDs in a readable detail line when compact tables cannot
  fit them. Do not add shortened internal IDs to interactive selector hints.
- Add headers only when they improve scanning; avoid decorative boxes that
  consume narrow terminal width.

### Money and Dates

- Use one human money formatter with grouping, explicit sign rules, two decimal
  places, and a currency code or unambiguous symbol.
- Include currency in summaries, category budgets, transaction amounts, balance
  deltas, and before/after values.
- Align decimal points where practical.
- Negative balances and overspending use both a word/symbol and optional color.
- Render human cycle ranges inclusively, for example `Sep 1–30, 2026`, while
  keeping exact ISO boundaries in JSON and verbose details.
- Label the effective local date and timezone when they affect a result.

### Lists and Pagination

- Distinguish `No expenses yet` from `No expenses match these filters`.
- Echo active filters above or below a filtered list in a compact form, using
  resolved resource names instead of raw cycle, category, account, or tag IDs.
- Show `Showing N` and whether more records exist.
- When another page exists, normal human output prints a safe, copyable
  continuation command; guided mode offers `Load next page`, `Change filters`,
  and `Done`.
- After guided-mode Done, show a concise stopped summary and omit the opaque
  cursor command. Retain the copyable cursor command for non-interactive human
  output.
- Preserve the existing opaque cursor contract and page-size limit.
- Never fetch every page without an explicit user choice; any future `--all`
  must have a documented safety cap.

### Command-Specific Read Improvements

| Command | Required human-output improvement |
| --- | --- |
| `context` | Lead with currency, effective date/timezone, current cycle, spend/account totals, and setup gaps; move internal user ID to verbose/debug output |
| `expenses list` | Compact date, description, category, account, and amount hierarchy; active-filter summary; responsive ID treatment; visible pagination |
| `expenses get` | Use a labeled detail card with account/category/tag status and a copyable full ID; de-emphasize revision for humans |
| `cycles list/current` | Show inclusive human date ranges and clearly mark the current cycle |
| `categories list` | Include currency on planned amounts, group or sort by type/order, and distinguish hidden categories without a yes/no text column when possible |
| `tags list` | Keep the compact list, distinguish duplicate names, and provide a useful empty state |
| `summary` | Lead with spent, planned, remaining, days remaining, and overspend state; add compact progress bars with text equivalents and group categories by type |
| `accounts list` | Lead with account name and balance, mark default and archived states visibly, separate archived records when included, and adapt IDs to width |
| `accounts get` | Lead with balance and status; move revision and full ID into a secondary details section |
| `accounts transactions` | Translate transaction type identifiers into human labels, include currency, wrap notes, show related-resource context, and expose pagination |
| `account-types list` | Explain balance nature in human language and use a purposeful empty state |

## Workstream 4: Mutation Preview, Confirmation, and Success

### Preview Hierarchy

- Every dry run begins with `PREVIEW ONLY — no changes were saved`.
- Every commit preview begins with the action and target in one line.
- Show changed fields as a focused diff instead of repeating complete Before and
  After records.
- Put balance and ledger effects directly after the change summary.
- Put warnings before the confirmation question and render each warning on its
  own line with human wording plus the stable warning code.
- Keep full IDs and revisions in a secondary `Details` section or verbose mode.
- The confirmation wording repeats the action, target, and amount where
  applicable.
- Destructive and financially surprising confirmations default to No and never
  accept a bare accidental Enter as approval.

### Success Hierarchy

- Begin with a concise success line such as `✓ Expense added successfully` or `✓ Transfer
  completed`; ASCII fallback uses `OK`.
- Repeat the target, amount, date, and resulting balance where relevant.
- Show the generated resource ID on its own copyable line.
- Suggest at most one useful next command, such as viewing the expense or
  account transactions.
- A successful replay with the same idempotency key says it was the same
  completed action, not a second write.
- Cancellation is not styled as an error and exits successfully before commit.
- Declining a destructive confirmation is cancellation, not a missing-input
  error: default No prints `Cancelled; no changes made` and exits 0. Reserve
  confirmation-required errors for non-interactive contract violations.

### Command-Specific Mutation Improvements

| Command | Required preview/success improvement |
| --- | --- |
| `expenses add` | Show resolved category and account names, source of each automatic choice, tags by name, balance effect, and the final ID |
| `expenses edit` | Show only changed expense fields plus account balance effects; make Keep/Clear outcomes explicit |
| `expenses delete` | Put `Permanent deletion` first, show the exact expense and restored balance, state expiry in local time, and keep default No |
| `accounts add` | Explain that the starting balance creates an opening ledger entry and show the resulting account state |
| `accounts edit` | Show only name/type changes rather than two full account records |
| `accounts archive` | Explain history preservation, inability to receive new activity, and default-account clearing when applicable |
| `accounts reactivate` | Explain that reactivation does not restore default status automatically |
| `accounts set-default` | Show the previous and new default accounts when available |
| `accounts adjust-balance` | Emphasize `desired final balance`, the computed delta, resulting balance, ledger entry, and negative warning |
| `accounts transfer` | Lead with `source → destination`, amount, both before/after balances, ledger effects, and prominent negative-source warning |

## Workstream 5: Errors, Empty States, and Recovery

### Human Error Template

Human errors use this hierarchy while JSON remains unchanged:

```text
Error [CATEGORY_CYCLE_MISMATCH]: Category "Food" is not available in September.
Try: choose a September category or clear the category.
Run: spendly expenses edit --interactive
```

- Always show the stable error code.
- Lead with what failed in user language.
- Add one specific recovery action when known.
- Add a relevant command only when it is safe and useful.
- Show `Run again with --debug` only for diagnostic failures where debug data
  can help.
- Never expose tokens, headers, OAuth URLs, credential paths, raw backend
  payloads, or personal data beyond the command's intended result.

### Recovery Mapping

| Error family | Human recovery |
| --- | --- |
| Authentication required/expired | `spendly auth login`, with a clear statement that no requested mutation ran |
| Account setup required | Open the configured Spendly Web setup page, then rerun the command |
| Invalid amount/balance/date/text | Name the field, show one valid example, retain input in guided mode |
| Resource not found | State the resource/filter and suggest the matching list or guided selector |
| Ambiguous exact name | Show concise candidates and suggest `--interactive` or the full stable ID |
| Category-cycle mismatch | Name the selected date/cycle and offer a valid category selector or Clear |
| Archived account | Suggest reactivation only when that is the user's intended action |
| Same-account/currency transfer conflict | Explain the eligible destination rule before asking again |
| Revision conflict | State that nothing was overwritten; fetch current state and review a new preview |
| Deletion confirmation expired/invalid | Generate a new preview; never reuse or silently refresh a token during commit |
| Network read failure | Explain retryability and retry reads only under the existing policy |
| Uncertain mutation result | Tell the user to inspect current state; never recommend a blind second write |
| Keychain unavailable | Explain secure OS-store recovery before mentioning the explicit file-storage fallback |
| Internal error | Provide the code, debug hint, support route, and redaction warning |

### Contextual Empty States

- No accounts: explain that an account can be added through guided mode and
  that expenses may remain unassigned.
- No active account types: direct the user to manage account types in Spendly
  Web; do not create one implicitly.
- No cycle for a date: show the date/timezone and direct planning setup to Web.
- In guided summary mode, a date with no cycle offers Change date, Choose
  another cycle, or Cancel in-place. Never suggest `--interactive` when that
  mode is already active.
- No categories: allow Uncategorized where the command supports it.
- No tags: continue without tags rather than treating it as an error.
- No expenses: distinguish an empty account from filters excluding results.
- No eligible transfer destination: explain active/same-currency/source
  exclusions.
- No transactions: explain whether the account simply has no ledger activity.

## Workstream 6: Authentication UX

- `auth login` announces that it is opening a browser and waiting for a
  same-computer callback without printing secrets.
- Show a spinner while discovering OAuth configuration and waiting for the
  browser, followed by a calm long-wait message.
- `--no-browser` prints one clearly delimited URL with same-computer and
  do-not-share guidance.
- Successful login says `Signed in to Spendly` and shows safe account context;
  internal identity IDs move to JSON or debug output.
- `auth status` uses friendly states: signed in, session refresh needed,
  authorization expired, or account setup required.
- Show the authorization expiry window in human terms when available.
- `auth logout` distinguishes `Signed out`, `Already signed out`, and `Local
  credentials removed; remote revocation unconfirmed`.
- Never add generic password, token, authorization-code, or secret prompts.

## Workstream 7: Accessibility and Terminal Compatibility

- Add an explicit `--accessible` flag and honor `ACCESSIBLE=1` for static,
  screen-reader-friendly prompts that do not redraw prior lines.
- Keep `--no-color` and `NO_COLOR`; verify that every status, focus, warning,
  difference, and error remains understandable without color.
- Detect limited Unicode terminals and use ASCII markers without changing
  semantics.
- Support 40-, 80-, and 120-column layouts and terminal-height-constrained
  selectors.
- Test light and dark themes, high contrast, Terminal.app, iTerm2, VS Code,
  common Linux terminals, and `TERM=dumb` fallback.
- Keep all questions, instructions, errors, and confirmations plain-text
  understandable.
- Never trap focus or leave the cursor hidden/raw mode enabled after success,
  validation failure, cancellation, thrown error, or signal termination.
- Avoid rapid spinner updates in accessible/static mode.

## Workstream 8: Performance and Perceived Responsiveness

- Render initial prompt structure before starting optional resource requests.
- Cache accounts, account types, cycles, categories, and tags only within one
  guided command; do not persist personal resource caches to disk.
- Parallelize independent read-only option requests where ordering is not
  required.
- Refresh date-scoped categories when the expense date changes.
- Avoid fetching archived or incompatible choices when they cannot be selected.
- Establish local targets: immediate keyboard response, visible loading feedback
  within 200 ms, and a long-wait message after 3 seconds.
- Preserve existing read retry rules and never automatically retry mutations.

## Workstream 9: Documentation and Support

- Make Quick start guided-first for humans while retaining an adjacent explicit
  flag example.
- Add one annotated terminal transcript covering focus, selection, dry run,
  edit, confirmation, success, and cancellation.
- Document marker semantics and all keyboard controls.
- Explain that shell commands are copied from fenced blocks without surrounding
  Markdown backticks.
- Document narrow-terminal, no-color, accessible, piped, and JSON behaviors.
- Add screenshots or recordings only as supplements; all instructions must work
  as text.
- Keep npm README, installed help, Fumadocs, troubleshooting, and the Spendly
  skill compatible with the same release candidate.
- Extend documentation validation to check guided examples, global options,
  help examples, continuation commands, and leakage boundaries.

## Deferred Enhancements

These are useful but do not block the initial release unless usability testing shows
they are required:

- an opt-in local preference for compact versus detailed human output;
- recent-command ordering that stores command names only, never resource IDs or
  financial values;
- configurable theme accents beyond color/no-color;
- an interactive `spendly doctor` that checks version, configuration,
  credential-store availability, authentication, and backend reachability with
  redacted output;
- a safe `--all` read mode with an explicit record cap;
- localized human dates and money beyond the user's Spendly currency and local
  timezone;
- richer terminal hyperlinks where supported, always with visible text fallback.

## Explicit Non-Goals

- Defaulting `--interactive` to true.
- Changing JSON schemas, exit codes, backend endpoints, or stable-ID rules for
  presentation convenience.
- Automatically confirming or committing a mutation.
- Fuzzy-selecting a resource without explicit user confirmation.
- Storing prompt answers, financial data, IDs, or tokens in shell history or a
  persistent local wizard cache.
- Replacing Spendly Web, adding natural-language parsing, or building a
  full-screen TUI.
- Adding permanent account deletion, transfer editing/deletion, bulk writes
  beyond the approved atomic guided Archive/Reactivate account selection, or
  unsupported planning-data mutations.

## Implementation Order

1. Freeze human-output snapshots and PTY fixtures for the current behavior.
2. Add the shared terminal capability and width-aware layout context.
3. Standardize prompt markers, viewport behavior, progress, review/edit, loading,
   cancellation, and accessible mode.
4. Add pagination/active-filter footers and contextual empty states.
5. Replace raw money/date/type formatting and fixed-width tables.
6. Redesign mutation previews as diffs with warning hierarchy and preview-only
   banners.
7. Add success headlines and mapped human error recovery while preserving JSON.
8. Improve root/group/leaf help, launcher grouping, examples, typo suggestions,
   and shell completion.
9. Improve authentication waiting/status/logout states.
10. Refresh npm/public/internal docs and validation fixtures.
11. Run the complete automated, PTY, accessibility, package, and human usability
    gates before freezing the release candidate.

## Verification Checklist

The definitive real-terminal evidence is in
[Phase 8.10](spendly-cli-phase-8.10.md). No additional Phase 8.9 manual checks
remain.

### Contract Safety

- [x] Every approved Add/Edit command and option is accepted; retired
      Create/Update command aliases are rejected.
- [x] Versioned JSON success/error envelopes and pagination metadata are
      unchanged.
- [x] Exit-code meanings and stdout/stderr separation are unchanged.
- [x] Agent, JSON, non-interactive, piped, and non-TTY executions never prompt.
- [x] Mutation preview, revision, idempotency, deletion-token, warning, ledger,
      and uncertain-result rules remain enforced.

### Prompt and Accessibility

- [x] Real-terminal focus, selection, date input, validation, review/edit, and
      cancellation passed the Phase 8.10 functional paths.
- [x] No-color, accessible/static, `TERM=dumb`, and VoiceOver presentation
      passed the recorded checks.

### Human Output

- [x] All read outputs pass at 40, 80, and 120 columns with no unintended
      horizontal overflow.
- [x] Representative human money, date, status, warning, ID, description, and
      transaction output was readable in the real terminal.
- [x] Pagination and active filters are visible in normal and guided modes.
- [x] Observed empty and no-match states described the result accurately.
- [x] Representative dry-run banners, mutation diffs, warnings,
      confirmations, success summaries, and next actions passed Phase 8.10.
- [x] Human errors show stable codes and safe, command-specific recovery.

### Help, Docs, and Packaging

- [x] Root, group, and leaf help expose guided and explicit paths with synthetic
      examples and accurate defaults.
- [x] Launcher grouping, typo suggestions, and zsh/bash/fish completion pass
      automated and local smoke checks.
- [x] npm README, Fumadocs, troubleshooting, Phase 8.10 manual checks, and skill
      references match the installed candidate.
- [x] CLI suite, focused Biome, production/development typechecks,
      docs/skill validation, dependency audit, production build, shrinkwrap,
      and isolated tarball verification pass.

### Human Usability Gate

- [x] Guided mode is discoverable from `spendly` help.
- [x] The user completed an Add expense dry run from guided prompts.
- [x] The user found and edited an expense, understood the proposed changes,
      edited an answer, and cancelled before commit.
- [x] The user can identify active filters and load the next expense/account
      transaction page.
- [x] The user distinguished desired balance from adjustment delta and
      understood both sides of a transfer.
- [x] Observed invalid-input, empty-resource, and no-cycle recovery paths
      worked; automated tests cover the remaining error and uncertain-result
      contracts.
- [x] Dry runs and cancelled confirmations saved nothing; the uncertainty
      contract remains covered by automated tests.

## Exit Criterion

Phase 8.9 is complete: the representative usability tasks, automated
implementation gates, and Phase 8.10 targeted real-terminal retest passed.
This does not replace the independent source-baseline gates before Phase 9 or
the publication-candidate freeze inside Phase 9.

## Implementation Progress

First implementation slice completed on 2026-09-14:

- added grouped root help, guided and flag-based leaf examples, a grouped
  searchable launcher with a visible Exit choice, and local zsh/bash/fish
  completion that never reads user resources;
- added a shared human renderer with grouped/right-aligned money, inclusive
  cycle ranges, 40-column stacked fallbacks, long-value wrapping, human status
  labels, contextual empty states, and terminal-width propagation;
- made expense and account-transaction pagination visible to humans with result
  counts and copyable continuation commands that preserve stable filters;
- added static numbered `--accessible`/`ACCESSIBLE=1` select, multiselect,
  confirm, date, and text prompts without cursor redraws, while retaining Clack
  as the default interactive experience;
- added visible multiselect focus, selected/result counts, complete keyboard
  instructions, TTY connection feedback, and narrow preview wrapping;
- added preview-only banners, focused expense/account diffs, desired-balance
  versus adjustment language, directional transfers, warning hierarchy, and
  concise mutation success headlines;
- added stable codes and recovery guidance to human errors and friendly login,
  status, logout, browser-waiting, and no-browser messages;
- revised npm/public documentation and troubleshooting, including explicit
  guidance not to type Markdown backticks or terminal output labels as shell
  commands.

Local evidence: production and development TypeScript checks pass; all 25 CLI
test files pass with 129 tests; focused Biome passes; the production and
development builds pass; installed root/leaf help and completion were inspected;
the default Clack and static accessible launchers both passed a real PTY Exit
smoke check; and public documentation validation passes with eight pages, 27
command paths, 69 examples, two JSON examples, links, and leakage boundaries.

Second implementation slice completed on 2026-09-15:

- added cancellable long-wait feedback after three seconds for human TTY reads
  and writes while keeping JSON output silent;
- mapped network failures to verify-current-state guidance so an uncertain
  mutation is never followed by a blind retry suggestion;
- added at most one safe, copyable next command to every successful expense and
  account mutation family;
- added guided expense pagination with `Load next page`, `Change filters`, and
  `Done`, plus guided account-transaction `Load next page` and `Done` choices;
- added an `Edit answers` loop to guided expense edits so a user can return to
  the field chooser after seeing the normalized preview;
- added automated no-overflow coverage for every read renderer at 40, 80, and
  120 columns, including consistent summary-header wrapping;
- made `TERM=dumb` automatically use the static ASCII prompt adapter and
  documented the behavior;
- enabled safe Commander spelling suggestions for close command and option
  typos without executing the suggestion;
- replaced color-only date-segment emphasis with a persistent bracketed focus
  such as `[2026]-09-15`, added `›` to every single-select focus row, and fixed
  UTC/local conversion so the selected calendar day cannot shift by timezone;
- stopped backend connection progress before entering an interactive prompt so
  asynchronous status output cannot corrupt Clack's redraw area;
- made adding an expense list the selected date's visible cycle categories
  followed by explicit Uncategorized, removed automatic history inference from
  the human wizard, and added an explanation for dates with no visible
  categories; backend inference remains available when scripts omit category
  input;
- added the onboarding currency directly to the guided expense amount prompt
  while avoiding the extra context read when `--amount` is already supplied;
- removed shortened internal IDs from account, account-type, cycle, category,
  tag, and expense selector hints while retaining stable IDs as submitted
  values and in explicit detail/machine output.
- aligned the public CLI vocabulary with Spendly Web by replacing the
  create/update commands and labels with add/edit, without compatibility
  aliases, and updated help, completion, docs, tests, and the Spendly skill.

Current checkout evidence includes all 30 CLI test files passing with 169 tests,
including guided page loading, expense-edit revision, long-wait status,
contextual next actions, static-terminal selection, the complete read-renderer
width matrix, and the Phase 8.11 core-operation compatibility suites. A macOS
PTY smoke check also passed for the `TERM=dumb` launcher/Exit path, and the
installed development build suggested `expenses` for `expenss` without
executing it.

Phase 8.10 exploratory verification on 2026-09-16 confirmed initial launcher
focus, non-duplicating arrow movement, Add/Edit help vocabulary, safe Add
expense cancellation, and static validation/date/numbered/multiselect inputs.
It found seventeen blocking UX gaps: the second-level launcher had no Back choice;
the Add expense human preview exposes raw tag IDs with ID-oriented
category/account/cycle labels; static single-selects use unchanged checkbox
markers without echoing the accepted choice; static multiselects do not echo
accepted labels; static question copy can render with `?:`; guided summary has
circular recovery when a date has no cycle; human filter summaries expose raw
resource IDs; and guided Done output exposes an opaque continuation command.
Declining the default-No expense deletion confirmation also exits as an error
instead of successful cancellation, and guided account money prompts omit the
configured currency. Guided Archive/Reactivate also need atomic multiselect
flows; balance and transfer prompts need resource-first ordering; lifecycle copy
needs action-specific Spendly vocabulary; and default human account mutation
previews and success results expose raw account or ledger IDs and internal
ledger labels. The Edit expense preview also uses and repeats a raw expense ID
instead of identifying the target with its date, description, and amount, and
Add account still uses Create in its confirmation and success headline after
the public vocabulary was aligned on Add. Supported Node.js 24 also renders the
legacy `Asia/Calcutta` alias in human output on a system configured for
`Asia/Kolkata`. These are tracked as `P8.10-F01` through `P8.10-F17` in the
Phase 8.10 verification log and were implemented on 2026-09-28 with focused
CLI and backend regression coverage.

The 2026-09-29 targeted retest exposed one additional pagination edge case:
guided filtered expense listing could offer another page with zero loaded
matches because filtering occurs after a backend cursor page is formed. This
is tracked as `P8.10-F18` and is implemented by silently advancing empty
intermediate pages in guided mode while preserving one-page machine contracts.

The targeted real-terminal retest of all 18 findings passed on 2026-09-29.
Independent release-candidate gates remain outside Phase 8.9.
