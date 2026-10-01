# Spendly CLI Phase 8.8: Guided Interactive Inputs

## Status

- Status: implementation complete; local automated gates pass; human terminal
  verification and release-ready source handoff remain
- Last updated: 2026-09-14
- Depends on: the implemented Phase 1-6 command surface and Phase 8.7 repository
  hardening
- Blocks: Phase 8.9 human CLI UX polish, Phase 8.10 maintainer terminal
  verification, Phase 8.11 MCP reuse readiness, Phase 8.12 Raycast reuse
  readiness, then the release-ready source handoff and Phase 9
- Detailed contract:
  [Spendly CLI Requirements and Implementation Plan](spendly-cli-requirements-and-implementation-plan.md)

This document adds a human-friendly interactive layer to the existing CLI. It
does not change the stable flags, JSON envelopes, backend facade, business
rules, or agent workflow.

## Objective

Make direct human use feel like a guided terminal application when choosing
Spendly resources or building a mutation, while keeping every existing command
usable through explicit arguments and flags.

The completed phase must provide proper terminal-native inputs where they are
materially safer or easier than typing a name or ID:

- single-choice selects for accounts, account types, cycles, categories, and
  mutually exclusive actions;
- searchable selects for long resource lists;
- multiselects with checkbox semantics for tags, filters, and edit fields;
- confirm prompts with radio semantics for previewed commits and destructive
  actions;
- validated text and date inputs for names, amounts, balances, descriptions,
  notes, and local calendar dates.

## Baseline Audit

Before this phase, the CLI was implemented with Commander 14 and was primarily
flag-driven:

- required values are Commander arguments or options;
- account, account-type, cycle, category, and tag names are resolved only by an
  exact trimmed, case-insensitive match;
- ambiguous names return candidates and stop instead of offering a menu;
- multiple tags are accepted only by repeating `--tag` or `--tag-id`;
- mutually exclusive states such as categorized/uncategorized and
  assigned/unassigned are represented by conflicting flags;
- human revisions and idempotency keys are resolved automatically;
- permanent expense deletion is the only terminal prompt, and it is currently
  a plain readline `[y/N]` question;
- `apps/cli` had no direct interactive-prompt dependency.

This means the CLI supports the data shapes required for select and
multiselect inputs, but does not currently render those inputs.

## Library Decision

The implementation adds `@clack/prompts` 1.8.1 and its matching
`@clack/core` 1.5.1 renderer API as pinned direct runtime dependencies of
`apps/cli`. The core renderer supplies a visible, color-independent focus
marker for multiselect rows. Commander remains the command and flag parser.

`@clack/prompts` is selected because its maintained high-level API supplies the
required `text`, `date`, `confirm`, `select`, `autocomplete`, `multiselect`, and
grouped prompt primitives, supports cancellation and custom input/output
streams, and includes TypeScript declarations.

Do not add separate radio-button or checkbox libraries:

- `select` or `autocomplete` is the terminal equivalent of a radio group: one
  value is selected from a known set;
- `multiselect` or searchable multiple selection is the terminal equivalent of
  a checkbox group: zero or more values are selected;
- `confirm` is the correct two-choice control for yes/no decisions.

The implementation must pin and audit the selected version, regenerate the
release shrinkwrap, and include it in the existing dependency and tarball
verification. A transitive workspace copy is not a substitute for declaring
the CLI dependency directly.

Official library documentation:
[Clack prompts](https://bomb.sh/docs/clack/packages/prompts/).

## Compatibility and Activation Contract

Interactive prompts are an additive human interface, not a new backend or
machine contract.

1. Add a global `--interactive` option for an explicitly guided session.
2. `spendly --interactive` opens a command chooser. A command-specific
   invocation such as `spendly expenses add --interactive` opens only that
   command's guided form.
3. A human TTY invocation that omits a required promptable argument may ask for
   only the missing required value. A fully specified invocation does not start
   a wizard unless `--interactive` is present, except for the existing expense
   deletion confirmation.
4. Values supplied through arguments or flags remain authoritative and are not
   silently replaced by prompt answers. Existing conflicts must be validated
   before prompting.
5. `--interactive` conflicts with `--json`, `--non-interactive`, and `--agent`.
   JSON, agent, non-interactive, piped-stdin, and non-TTY execution must never
   import, render, or wait on a prompt.
6. If a required value is unresolved when prompting is prohibited, preserve
   the current structured error and exit-code behavior.
7. Prompt rendering goes to stderr through the runtime's injected streams.
   Final human command output remains on stdout. This keeps prompt control
   sequences away from redirected command results.
8. `--no-color` and `NO_COLOR` apply to prompts as well as final output.
9. Escape or Ctrl-C before a commit prints `Cancelled; no changes made`, exits
   without a backend write, and does not print a stack trace.
10. Existing explicit flags, exact-name handling, `--dry-run`, revisions,
    idempotency, JSON schemas, and process exit codes remain compatible.

Commander options currently marked as required must move to the shared
validation layer only when necessary to allow a human prompt. Non-interactive
validation must remain local and occur before unnecessary backend access.

## Prompt Vocabulary

| Input primitive | Spendly use | Requirements |
| --- | --- | --- |
| `text` | amount, balance, name, description, note, manual ID fallback | Reuse the existing parsers and empty-string rules; never maintain separate validation logic |
| `date` | local expense, opening-ledger, adjustment, transfer, context, or summary date | Display and return `YYYY-MM-DD`; convert with local calendar fields and never through a UTC `toISOString()` round trip |
| `select` | short account-type, mode, or mutually exclusive choice lists | No hidden preselection when the first choice could change financial data |
| `autocomplete` | accounts, expenses, cycles, and large category lists | Search labels only; submit stable IDs; do not silently fuzzy-resolve typed text |
| `multiselect` | tags, enabled expense filters, fields to edit | Show keyboard instructions and allow an explicit empty selection where the domain permits it |
| `confirm` | committing a server preview or accepting a destructive action | Show the target and effect first; permanent/destructive choices default to No |

Prompt labels are presentation only. Every selected resource value passed to
the existing action layer must be its stable ID.

Every multiselect row uses a separate visible focus marker and checkbox state:
`› ◻` is focused but not selected, `› ◼` is focused and selected, and an
unfocused row begins with spaces. Focus must remain visible without color and
must move immediately with the arrow keys; it cannot rely on selection state.

## Resource Option Rules

- Fetch only resources owned by the authenticated user through the existing
  `cli/v1` facade.
- Label choices with enough context to prevent wrong-target selection. For
  example, an account option includes name, type, currency, balance, and
  archived state when relevant, without a shortened internal ID.
- Category labels include their cycle when a cross-cycle choice is possible.
  Category choices for an expense are limited to the expense date's cycle.
- Tag and category names are not assumed unique. Duplicate labels use useful
  non-ID context where available while distinct stable IDs remain the submitted
  values.
- Archived resources remain readable where history allows, but are absent or
  visibly disabled for new expense assignment, adjustment, transfer, and
  account-type reassignment.
- Transfer destination choices exclude the source account and incompatible
  currencies before submission. The backend still revalidates them.
- Expense selection uses deterministic cursor pages. Each option includes date,
  amount/currency, description fallback, and account summary without a shortened
  ID suffix. Provide `Load more` and `Enter an expense ID` choices instead of
  fetching every expense silently.
- Empty states explain the required setup or valid alternative. They must not
  create accounts, account types, cycles, categories, or tags implicitly.
- A prompt never selects the first ambiguous or invalid resource automatically.

## Command Coverage

### Global and Authentication

| Command | Interactive treatment |
| --- | --- |
| `spendly --interactive` | Single-select command launcher grouped into expenses, accounts, supporting reads, and authentication |
| `spendly` | Keep current help output; do not launch a wizard implicitly |
| `auth login` | Keep the browser/URL flow and Clerk consent screen; no password, token, or credential prompt |
| `auth status` | No prompt |
| `auth logout` | Keep explicit command behavior; no extra confirmation because it removes only this CLI session and is recoverable by logging in again |
| Development auth canaries | No new prompts and never expose them in the production build |

Credential values, authorization codes, tokens, PKCE material, and file-store
contents must never be accepted through a generic text or password prompt.

### Read Commands

| Command | Interactive treatment |
| --- | --- |
| `context` | No prompt by default; guided mode may offer a validated local date |
| `expenses get` | Searchable, cursor-paginated expense select when the ID is omitted in a human TTY |
| `expenses list` | Guided mode uses a checkbox-style filter chooser, then cycle/category/account single choices, tag multiselect, optional date range, and page size |
| `cycles list` | No prompt |
| `cycles current` | No prompt by default; guided mode may offer a local date |
| `categories list` | Cycle select when neither `--cycle-id` nor `--cycle` is supplied |
| `tags list` | No prompt |
| `summary` | Guided single choice between the current date's cycle and a selected cycle, plus an optional date |
| `accounts list` | No prompt by default; guided mode may toggle inclusion of archived accounts |
| `accounts get` | Searchable account select when the selector is omitted |
| `accounts transactions` | Searchable account select when the selector is omitted; retain explicit cursor pagination |
| `account-types list` | No prompt by default; guided mode may toggle inclusion of archived types |

The list filter builder is opt-in through `--interactive`; an ordinary
`expenses list` must continue to list immediately with current defaults.

### Expense Mutations

| Command | Interactive treatment |
| --- | --- |
| `expenses add` | Validated amount with onboarding currency, date, optional description, visible categories from the selected date's cycle followed by `Uncategorized`, account mode select (`automatic default`, `unassigned`, or an active account), and tag multiselect |
| `expenses edit` | Paginated expense select when ID is omitted; checkbox-style field chooser; validated amount/date/text inputs; category and account selects with explicit `Keep current` and `Clear` states; tag multiselect preselected with current tags |
| `expenses delete` | Paginated expense select when ID is omitted; keep the server-issued deletion preview and replace the raw `[y/N]` readline prompt with a target-specific Clack confirmation defaulting to No |

For edit, choosing a new date refreshes the category choices for the new cycle
before preview. Selecting no edit fields cancels without a request. `Keep
current`, `Clear`, automatic default, and explicit resource IDs are represented
as distinct typed values rather than overloaded empty strings. Category-history
inference remains available only to explicit commands that omit a category; it
is not a guided choice.

### Account Mutations

| Command | Interactive treatment |
| --- | --- |
| `accounts add` | Validated name and signed starting balance, active account-type select, and local opening date |
| `accounts edit` | Searchable account select; checkbox-style field chooser for name and account type; active account-type select when chosen |
| `accounts archive` | Active-account select, server preview, and target-specific confirmation defaulting to No; explain default-account clearing when applicable |
| `accounts reactivate` | Archived-account select, server preview, and confirmation |
| `accounts set-default` | Active non-default account select, server preview, and confirmation |
| `accounts adjust-balance` | Active-account select, signed absolute-balance input, local date, optional note, delta preview, and confirmation; emphasize that the value is not a delta |
| `accounts transfer` | Active source-account select, filtered same-currency destination select, positive amount, local date, optional note, two-account preview, and confirmation |

Transfer and balance confirmations must display the currency, before/after
balances, ledger effect, and any negative-balance warning. Completed transfers
remain immutable; the wizard must not imply edit or delete support.

### Deliberately Unchanged or Out of Scope

- Global flags such as `--json`, `--agent`, `--debug`, `--no-retry`,
  `--no-color`, and `--allow-file-storage` remain flags rather than prompts.
- Revisions, idempotency keys, and deletion tokens remain automatically managed
  for humans and explicit for `--non-interactive` callers.
- Cursor tokens remain explicit machine inputs; guided pagination exposes
  `Load more` without displaying or asking users to type the cursor.
- Natural-language dates, currency conversion, and changing user currency stay
  out of scope.
- Mutations for cycles, categories, category types, tags, and account types stay
  out of scope.
- Permanent account deletion, transfer editing/deletion, bulk mutations,
  import/export, an MCP server, and a full-screen TUI stay out of scope.

## Guided Mutation Safety Flow

Every fully guided mutation follows one shared sequence:

1. Resolve any explicit flags and fetch only the resources required for missing
   choices.
2. Collect and locally validate prompt answers.
3. Convert prompt answers to the same stable-ID input accepted by the existing
   action and domain layers.
4. Run the existing server-backed dry-run/preview operation.
5. Render the normalized target, cycle, category/account assignment, revisions,
   balance or ledger effects, and warnings.
6. If the user requested `--dry-run`, stop successfully without asking to
   commit.
7. Otherwise ask a target-specific confirmation. Destructive or financially
   surprising operations default to No.
8. Commit the exact previewed input with the preview revision or revisions and
   a generated human idempotency key.
9. If a revision changed, stop with the existing conflict guidance. Never
   silently re-preview and commit a new state.
10. Render the existing human result. Do not change JSON response schemas.

Prompt cancellation, validation failure, an empty required resource list, and
preview rejection all happen before the commit request.

## Implementation Architecture

- Add a small prompt adapter under `apps/cli/src/input/` that owns Clack imports,
  I/O streams, cancellation, `NO_COLOR`, and conversion to typed answers.
- Extend `CliRuntime` with an injectable prompt adapter. Command and domain
  tests must not read real stdin or enable raw terminal mode.
- Keep resource fetching and option construction separate from rendering so it
  can be unit tested without ANSI snapshots.
- Reuse `parseAmount`, `parseBalance`, `parseDate`, selector rules, and mutation
  text validation. Prompt validation may call these functions but must not copy
  their rules.
- Lazy-load the prompt module only after eligibility and invocation checks.
- Keep Commander responsible for routing, explicit option conflicts, help, and
  version behavior.
- Replace `input/confirm.ts` through the adapter rather than retaining two
  visually inconsistent confirmation systems.
- Add the pinned dependency to the production package and regenerate
  `npm-shrinkwrap.json` through the approved release script.
- Refresh installed help, the npm README, Fumadocs human examples, and the manual
  verification runbook. Agent and JSON examples remain flag-based.

## Verification Checklist

### Contract and Unit Tests

- [x] Fully specified existing commands behave identically without
      `--interactive`.
- [x] `--interactive` conflicts with `--json`, `--non-interactive`, and
      `--agent` before backend access.
- [x] JSON, non-interactive, agent, piped, and non-TTY tests prove zero prompt
      calls.
- [x] Missing required input still produces the existing structured error when
      a prompt is unavailable.
- [x] Prompt answers pass through the same amount, balance, date, text, and
      selector validation as explicit flags.
- [ ] Duplicate names remain distinct ID-valued choices and no first match is
      silently selected.
- [ ] Empty, archived, cross-cycle, same-account, and cross-currency option sets
      are filtered or disabled correctly and still rejected by the backend.
- [ ] Cancellation at every prompt performs no commit and leaves the terminal
      cursor and raw mode restored.
- [x] Prompt output uses stderr; final human output uses stdout; JSON output is
      one document with no ANSI or prompt fragments.
- [ ] `--no-color`, `NO_COLOR`, narrow terminals, and keyboard instructions are
      covered.

### Command Coverage Tests

- [x] Command launcher and command-specific guided entry points.
- [ ] Expense selection pagination and manual-ID fallback.
- [x] Expense-list filter, tri-state category/account, and tag-multiselect
      behavior.
- [x] Expense add date-scoped category/Uncategorized and
      automatic-default/unassigned/explicit account modes.
- [x] Expense edit field selection, keep/clear states, date-cycle category
      refresh, and preselected tags.
- [ ] Permanent expense deletion preview, default-No confirmation, expiry,
      cancellation, and stale-revision conflict.
- [x] Account add/edit selection and active-type enforcement.
- [ ] Active/archived/default account filtering for lifecycle commands.
- [ ] Absolute-balance and transfer previews, negative warnings, confirmation,
      revisions, idempotency, and ledger parity.
- [ ] Read-command selectors and guided filter defaults.

### Package and Manual Verification

- [x] Typecheck and focused Biome checks pass for production and development
      CLI builds.
- [x] The complete CLI and backend suites pass with no regression to the
      versioned facade.
- [x] Dependency audit, generated shrinkwrap, production build, `npm pack`, and
      isolated tarball verification include the prompt dependency and no
      development-only files.
- [ ] Interactive smoke tests pass in Node.js 22 and 24 on supported macOS and
      Linux terminals, including cancellation and redirected I/O.
- [ ] A screen-reader-oriented review confirms every prompt has a plain-text
      question, visible instructions, unambiguous choice labels, and a
      non-interactive flag equivalent.
- [x] Public docs, installed help, npm README, Phase 8.10 manual verification,
      and command-validation fixtures reflect the guided human path without
      changing the agent contract.
- [x] Hand the implemented Phase 8.8 interaction baseline to Phase 8.9. Final
      supported-terminal and screen-reader verification remains in Phase 8.10.

## Local Implementation Evidence

Verified on 2026-09-14 before requesting human terminal review:

- production and development TypeScript checks passed;
- focused Biome checks passed with no suppressions;
- all 21 CLI test files passed, covering 111 tests;
- all 3 backend test files passed, covering 37 tests;
- a real PTY displayed the searchable launcher and restored the cursor after
  Ctrl-C with `Cancelled; no changes made`;
- redirected stdin failed immediately with exit code 2 and no stdout;
- `--interactive --json` returned one structured JSON error with no stderr;
- the production dependency audit reported zero vulnerabilities;
- release metadata, generated shrinkwrap, production build, and isolated packed
  install verification passed.

## Human Terminal Verification

The earlier partial manual script has been consolidated into the complete,
maintainer-owned
[Phase 8.10 manual terminal verification](spendly-cli-phase-8.10.md). Use that
single checklist for all selectors, guided reads and mutations, accessibility,
terminal-width, cancellation, and no-write confirmation checks.

## Exit Criterion

The phase is complete when a human can discover and use the guided command
launcher, selectors, tag and field multiselects, date/text inputs, previews,
and confirmations across every applicable shipped CLI feature; every prompt
has an equivalent explicit flag path; machine and agent execution provably
never prompts; all mutation safety rules remain server-enforced; and the packed
candidate passes the complete CLI, backend, documentation, and dependency gates
before Phase 8.9 begins, the Phase 8.10 terminal gates, and the affected manual
rechecks required after Phase 8.11 plus the Phase 8.12 reuse gate before Phase 9.

## Phase 8.9 and Phase 8.10 Handoff

Phase 8.8 owns correct input types, stable-ID selection, validation, preview,
confirmation, and non-interactive isolation. Phase 8.9 owns the complete human
experience around that baseline: discovery, progress, loading, responsive
output, visible pagination, focused diffs, recovery, accessibility, and shell
ergonomics. Phase 8.10 owns final real-terminal verification of that combined
experience. Hand the reviewed source baseline to Phase 9 only after both the
[Phase 8.9 checklist](spendly-cli-phase-8.9.md) and
[Phase 8.10 checklist](spendly-cli-phase-8.10.md) are complete and Phase 8.11
has proven the shared headless operation boundary, with Phase 8.12 recording
the Raycast adapter and distribution boundary. Phase 9 adds production and
public-package configuration, reruns the affected gates, and freezes the
immutable publication candidate.
