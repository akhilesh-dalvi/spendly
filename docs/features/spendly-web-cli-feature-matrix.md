# Spendly Web vs CLI feature matrix

Based on [Spendly web features and actions](spendly-web-action-inventory.md), with CLI availability checked against current command registrations, interactive flows, response schemas, and backend handlers.

**Legend:** ✅ = supported; ❌ = no built-in action on that surface. Compare user outcomes, not identical interfaces. CLI support means a Spendly command, not custom scripts, direct backend calls, or opening the web app. Existing limitations in the web inventory still apply. Availability is a source-level snapshot, not live verification. Priorities below are proposed implementation sequencing, not delivery commitments.

**Overall:** Web (122/149) · CLI (79/149). Counts show supported feature rows out of rows available on at least one surface; table headers show section counts. The 17 rows in Unsupported on both are excluded from overall counts. Rows include product actions and surface-specific controls, so these counts are a checklist, not a weighted feature-parity score.

**Implementation priorities:** **P1** = first (core entry/editing, assignment correctness, and essential CLI creation); **P2** = next (reporting, lifecycle management, workflow improvements, and broader feature coverage); **P3** = last (polish, advanced/destructive operations, integrations, and monetization). Within each priority, implement Web gaps before CLI gaps: **P1 Web → P1 CLI → P2 Web → P2 CLI → P3 Web → P3 CLI**. Existing features use **—**; **N/A** means an intentionally surface-specific control, not a proposed implementation gap. Availability counts still reflect the original ✅/❌ markers, including N/A rows.

Priorities reflect user value and financial-data safety, not effort estimates. Cross-surface work may require shared backend changes first. Grouped feature rows retain one coarse priority; split them into individually scoped tasks before implementation. Potentially destructive balance/ledger changes require a separate safety design; assigning P3 does not endorse deleting audit history.

## Implementation priority summary

Counts include only missing features assigned P1–P3, including Unsupported on both; existing features (—) and surface-specific controls (N/A) are excluded.

| Priority | Web | CLI | Total |
| --- | ---: | ---: | ---: |
| P1 | 5 | 9 | 14 |
| P2 | 9 | 41 | 50 |
| P3 | 12 | 15 | 27 |
| **Total** | **26** | **65** | **91** |

A feature missing on both surfaces counts once per surface; Total counts implementation gaps, not unique features.

## Dashboard and comparison

| Feature | Web (11/11) | CLI (5/11) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| View current or selected cycle totals: spent, planned, remaining, days remaining | ✅ | ✅ | — | — |
| View category spending, plans, and remaining amounts | ✅ | ✅ | — | — |
| View spending and plans grouped by category type | ✅ | ✅ | — | — |
| View current account balances and default account | ✅ | ✅ | — | — |
| Browse recent expenses across cycles | ✅ | ✅ | — | — |
| Save grouped-by-type vs simple-list view preference | ✅ | ❌ | — | P3 |
| Expand/collapse category groups and sort dashboard categories | ✅ | ❌ | — | P3 |
| Compare 2–5 cycles side by side, including category plans and spending | ✅ | ❌ | — | P2 |
| Share and restore a comparison selection through a URL | ✅ | ❌ | — | N/A |
| Search the comparison cycle picker by name or dates | ✅ | ❌ | — | N/A |
| Expand a category's cross-cycle comparison details | ✅ | ❌ | — | N/A |

## Expenses

| Feature | Web (21/28) | CLI (19/28) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List expenses and view an individual expense | ✅ | ✅ | — | — |
| Filter by cycle, category, or Uncategorized | ✅ | ✅ | — | — |
| Filter by account, including archived accounts | ✅ | ✅ | — | — |
| Filter by multiple tags, requiring all selected tags | ✅ | ✅ | — | — |
| Filter specifically for expenses without an account | ❌ | ✅ | P1 | — |
| Filter by an explicit date range | ❌ | ✅ | P1 | — |
| Search expense table text across displayed columns | ✅ | ❌ | — | P2 |
| Find an expense by partial description/date text within loaded results | ✅ | ✅ | — | — |
| Sort expenses by date or amount using a dedicated control | ✅ | ❌ | — | P2 |
| Paginate expense history | ✅ | ✅ | — | — |
| Read the number of loaded/listed expenses | ✅ | ✅ | — | — |
| View a filtered expense total directly (within the Web fetch cap) | ✅ | ❌ | — | P2 |
| Remove individual expense filter pills or clear all filters/search | ✅ | ❌ | — | N/A |
| Open account-filtered or Uncategorized history through a URL | ✅ | ❌ | — | N/A |
| Search account/category/tag selectors while entering an expense | ✅ | ✅ | — | — |
| Create an expense with amount, date, note, category, account, and existing tags | ✅ | ✅ | — | — |
| Edit expense amount, date, note, category, account, and tags | ✅ | ✅ | — | — |
| Clear an existing category, account assignment, or all tags | ✅ | ✅ | — | — |
| Clear an existing note | ❌ | ✅ | P1 | — |
| Explicitly prevent default-account assignment when creating an expense | ❌ | ✅ | P1 | — |
| Create an expense without a cycle for its date | ❌ | ✅ | P2 | — |
| Preview a normalized expense and its projected account-balance effects before saving | ❌ | ✅ | P2 | — |
| Read whether creation used an explicit/default account or explicit/history-inferred category | ❌ | ✅ | P3 | — |
| Create a new tag inline while entering/editing an expense | ✅ | ❌ | — | P1 |
| Keep entering expenses with retained form selections using Add another | ✅ | ❌ | — | P2 |
| Delete an expense, refunding its account and retaining compensating ledger history | ✅ | ✅ | — | — |
| Read non-web change/provenance information | ✅ | ❌ | — | P2 |
| Inspect CLI vs AI-agent origin through hover/keyboard-focus tooltips | ✅ | ❌ | — | N/A |

## Expense cycles

| Feature | Web (15/16) | CLI (11/16) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List cycles and read cycle names/dates | ✅ | ✅ | — | — |
| Resolve the cycle containing today or a chosen date | ✅ | ✅ | — | — |
| Search a cycle selector by name (not a cycle-list filter) | ✅ | ✅ | — | — |
| Filter cycle list by Current/Upcoming/History or budget presence | ✅ | ❌ | — | P2 |
| Sort cycle list newest/oldest using a dedicated control | ✅ | ❌ | — | P2 |
| Create a cycle with name and date range | ✅ | ✅ | — | — |
| Copy category configuration from another cycle during creation | ✅ | ✅ | — | — |
| Select which source categories to copy | ✅ | ✅ | — | — |
| Copy or override planned amounts during cycle creation | ✅ | ✅ | — | — |
| Explicitly copy no categories even when a source cycle is supplied | ❌ | ✅ | P1 | — |
| Explicitly clear an individual copied plan during creation | ✅ | ✅ | — | — |
| Edit cycle name and dates | ✅ | ✅ | — | — |
| Delete an eligible empty cycle and its categories | ✅ | ✅ | — | — |
| View previous-cycle actual spending alongside category plans | ✅ | ❌ | — | P2 |
| Switch cycle Overview/Plan/Activity tabs through URL-backed state | ✅ | ❌ | — | N/A |
| Move to the previous/next cycle while preserving the selected tab | ✅ | ❌ | — | N/A |

## Categories

| Feature | Web (11/11) | CLI (4/11) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List a cycle's categories, including names, icons, types, plans, and hidden state | ✅ | ✅ | — | — |
| View a category's expenses | ✅ | ✅ | — | — |
| View category spending, planned, remaining, and utilization metrics | ✅ | ✅ | — | — |
| Create standalone categories, individually or with multiple draft rows | ✅ | ❌ | — | P1 |
| Edit an existing category's name, icon, type, or plan | ✅ | ❌ | — | P1 |
| Fill a category plan from previous-cycle actual spending | ✅ | ❌ | — | P2 |
| Populate new category drafts from previous-cycle suggestions | ✅ | ❌ | — | P3 |
| Hide or restore a category | ✅ | ❌ | — | P2 |
| Delete a category while retaining its expenses as uncategorized | ✅ | ❌ | — | P2 |
| Read category-type names/colors attached to categories | ✅ | ✅ | — | — |
| Choose category icons through a searchable emoji picker | ✅ | ❌ | — | N/A |

## Category types

| Feature | Web (7/7) | CLI (1/7) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Read all category-type names, including unused types | ✅ | ✅ | — | — |
| View category-type usage counts across all cycles | ✅ | ❌ | — | P2 |
| Create a category type, including inline creation | ✅ | ❌ | — | P1 |
| Edit a category type's name or color | ✅ | ❌ | — | P2 |
| Delete a category type while retaining categories and expenses | ✅ | ❌ | — | P2 |
| Search category-type names and filter to types in use | ✅ | ❌ | — | P2 |
| Sort and paginate category types on desktop | ✅ | ❌ | — | N/A |

## Financial accounts

| Feature | Web (12/13) | CLI (12/13) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List active and archived accounts | ✅ | ✅ | — | — |
| View account details, balance, type, currency, and default status | ✅ | ✅ | — | — |
| View balances grouped by currency | ✅ | ✅ | — | — |
| View paginated account ledger history | ✅ | ✅ | — | — |
| Read non-web provenance on accounts and individual ledger entries | ✅ | ❌ | — | P2 |
| Create an account with name, type, and opening balance | ✅ | ✅ | — | — |
| Choose the opening ledger date when creating an account | ❌ | ✅ | P2 | — |
| Edit account name or type | ✅ | ✅ | — | — |
| Set an active account as default | ✅ | ✅ | — | — |
| Archive or reactivate an account | ✅ | ✅ | — | — |
| Adjust an account to an actual balance with date and optional note | ✅ | ✅ | — | — |
| Record a same-currency transfer with date and optional note | ✅ | ✅ | — | — |
| Filter expense history to an account | ✅ | ✅ | — | — |

## Account types

| Feature | Web (9/9) | CLI (2/9) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List active and archived account types | ✅ | ✅ | — | — |
| Read account-type name, icon, color, and asset/liability nature | ✅ | ✅ | — | — |
| View account usage counts and deletion eligibility for account types | ✅ | ❌ | — | P2 |
| Create an account type | ✅ | ❌ | — | P1 |
| Edit account-type name, icon, color, or eligible asset/liability nature | ✅ | ❌ | — | P1 |
| Clear custom account-type icon or color | ✅ | ❌ | — | P3 |
| Archive or reactivate an account type | ✅ | ❌ | — | P2 |
| Delete an unused account type | ✅ | ❌ | — | P2 |
| Restore missing default account types | ✅ | ❌ | — | P2 |

## Tags

| Feature | Web (8/8) | CLI (2/8) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| List tags with names and creation dates | ✅ | ✅ | — | — |
| View tag usage counts and In use/Unused status | ✅ | ❌ | — | P2 |
| Search/filter/sort the tag-management list (not an expense tag selector) | ✅ | ❌ | — | P2 |
| Paginate tags on desktop | ✅ | ❌ | — | N/A |
| Create a tag | ✅ | ❌ | — | P1 |
| Rename a tag | ✅ | ❌ | — | P1 |
| Delete a tag and detach it from expenses | ✅ | ❌ | — | P2 |
| Assign or remove existing tags through expense editing | ✅ | ✅ | — | — |

## Settings

| Feature | Web (3/3) | CLI (1/3) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Read preferred currency | ✅ | ✅ | — | — |
| Change preferred currency | ✅ | ❌ | — | P1 |
| Choose Light/Dark/System web theme | ✅ | ❌ | — | N/A |

## Onboarding

| Feature | Web (11/11) | CLI (1/11) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Choose Free vs Plan tracking path | ✅ | ❌ | — | P2 |
| Complete guided cycle/category/account onboarding | ✅ | ❌ | — | P2 |
| Read optional account-setup status/reminders | ✅ | ✅ | — | — |
| Choose Monthly/Pay period/Custom cycle presets during eligible onboarding | ✅ | ❌ | — | P2 |
| Add/remove onboarding category draft rows and undo removals | ✅ | ❌ | — | P2 |
| Review onboarding category draft totals, counts, and type shares | ✅ | ❌ | — | P2 |
| Save onboarding category row order | ✅ | ❌ | — | P2 |
| Remove existing categories through onboarding (delete unused or hide used) | ✅ | ❌ | — | P2 |
| Skip optional category/account setup or resume the setup wizard | ✅ | ❌ | — | P2 |
| Dismiss the account-setup reminder persistently | ✅ | ❌ | — | P2 |
| Clear an existing category type or plan through onboarding | ✅ | ❌ | — | P2 |

## Authentication and profile

| Feature | Web (4/7) | CLI (5/7) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Manage profile/security through Clerk's profile interface | ✅ | ❌ | — | N/A |
| Sign in | ✅ | ✅ | — | — |
| Sign out of the surface's session | ✅ | ✅ | — | — |
| Open a dedicated sign-up flow | ✅ | ❌ | — | P2 |
| Check stored CLI session status | ❌ | ✅ | N/A | — |
| Request a same-machine login URL without automatically opening the browser | ❌ | ✅ | N/A | — |
| Opt into local plaintext credential fallback when the OS keychain is unavailable | ❌ | ✅ | N/A | — |

## Navigation and recovery

| Feature | Web (5/5) | CLI (1/5) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Close web dialogs/route modals without submitting their drafts | ✅ | ❌ | — | N/A |
| Cancel a destructive confirmation before committing | ✅ | ✅ | — | — |
| Toggle sidebar/mobile navigation, including Ctrl/Cmd+B | ✅ | ❌ | — | N/A |
| Retry a failed screen through root or account-type error-boundary controls | ✅ | ❌ | — | N/A |
| Return to Dashboard from the global error fallback or shared 404 screen | ✅ | ❌ | — | N/A |

## Help and documentation

| Feature | Web (5/6) | CLI (1/6) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Browse product information, FAQs, pricing, and terms | ✅ | ❌ | — | N/A |
| Browse/search the published CLI documentation | ✅ | ❌ | — | N/A |
| Copy documentation command blocks to the clipboard | ✅ | ❌ | — | N/A |
| Switch npm/pnpm/yarn/bun documentation examples and retain the selection | ✅ | ❌ | — | N/A |
| Enlarge product screenshots and expand FAQ answers | ✅ | ❌ | — | N/A |
| Read built-in command help or installed CLI version | ❌ | ✅ | N/A | — |

## CLI automation and terminal controls

| Feature | Web (0/14) | CLI (14/14) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Generate bash/zsh/fish shell-completion scripts | ❌ | ✅ | N/A | — |
| Open the terminal action launcher and use guided prompts | ❌ | ✅ | N/A | — |
| Use static numbered terminal prompts for screen readers | ❌ | ✅ | N/A | — |
| Choose expense filters/page size through terminal prompts and load further pages | ❌ | ✅ | N/A | — |
| Review an expense-edit preview, then edit answers before committing | ❌ | ✅ | N/A | — |
| Run supported commands non-interactively using arguments/flags | ❌ | ✅ | N/A | — |
| Preview supported mutations without changing financial records (dry run) | ❌ | ✅ | N/A | — |
| Supply revision preconditions and idempotency keys for supported mutations | ❌ | ✅ | N/A | — |
| Guard cycle category copying against changes since its preview | ❌ | ✅ | N/A | — |
| Inspect expense/account/cycle revisions for subsequent commands | ❌ | ✅ | N/A | — |
| Mark committed mutations as AI-agent initiated | ❌ | ✅ | N/A | — |
| Produce structured JSON command output | ❌ | ✅ | N/A | — |
| Disable terminal colors or automatic read retries | ❌ | ✅ | N/A | — |
| Request redacted CLI diagnostics on stderr | ❌ | ✅ | N/A | — |

## Unsupported on both

| Feature | Web (0/17) | CLI (0/17) | Web priority | CLI priority |
| --- | :---: | :---: | :---: | :---: |
| Bulk edit, delete, or categorize expenses | ❌ | ❌ | P2 | P2 |
| Upload receipts, schedule recurring expenses, or split/duplicate expenses | ❌ | ❌ | P2 | P2 |
| Move existing expenses automatically when changing cycle dates | ❌ | ❌ | P2 | P2 |
| Archive cycles | ❌ | ❌ | P3 | P3 |
| Merge or move categories between cycles | ❌ | ❌ | P3 | P3 |
| Manually reorder categories outside onboarding | ❌ | ❌ | P3 | P3 |
| Explicitly choose an account currency in the creation form/command | ❌ | ❌ | P2 | P2 |
| Permanently delete an account | ❌ | ❌ | P3 | P3 |
| Edit opening balance or account currency after creation | ❌ | ❌ | P3 | P3 |
| Edit/delete ledger entries or reverse a transfer directly | ❌ | ❌ | P3 | P3 |
| Execute bank payments or cross-currency transfers | ❌ | ❌ | P3 | P3 |
| Merge or archive tags | ❌ | ❌ | P3 | P3 |
| General financial-data import/export workflow | ❌ | ❌ | P2 | P2 |
| Bank synchronization or currency conversion | ❌ | ❌ | P3 | P3 |
| Arbitrary-period reporting with daily series, trend deltas, or averages | ❌ | ❌ | P2 | P2 |
| Change timezone preference | ❌ | ❌ | P3 | P3 |
| Paid checkout/subscription or donation transaction | ❌ | ❌ | P3 | P3 |

## Scope notes and sources

- A CLI tick for viewing data may require `--json`; it does not imply a graphical dashboard. `summary` exposes category spending/plans/differences; its JSON also exposes utilization and per-type totals/categories. For any available cycle being summarized, JSON `types` includes every user category type, even unused ones, but no global usage count or type color. Colors are available on types attached to `categories list` results. There is no dedicated category-type command.
- `summary --date` selects a cycle and/or changes the reference date for days remaining; it does **not** restrict spending to that date. Hidden categories and uncategorized spending are included. CLI summaries fail rather than truncate above 10,000 cycle expenses or 1,000 categories/types. Resource lists/context have their own caps, including 1,000 cycles/tags/accounts; ticks do not imply unlimited reads.
- CLI expense/ledger pagination uses `--limit` (1–100, default 50) and `--cursor`; JSON arrays are in `data`, with `hasMore`, `nextCursor`, and `pageSize` in `meta`. Human output reports the loaded count, not an all-results count or expense sum. Guided lists can load more pages; non-guided output provides a continuation command. Web expense-table pagination only pages an already capped fetch, whereas Web account-ledger pagination fetches more records. CLI expense filters other than date range are applied after each backend page, so a page can contain fewer matches or even none while `hasMore` is true; guided listing skips empty intermediate pages.
- Category copying through `cycles add` is supported, but there are no standalone CLI category mutations. Copies preserve name/type/icon/hidden state/order, not expenses. Both surfaces can clear a selected copied plan: blank its Web input, or use CLI `--clear-planned-amount`/the guided clear choice. Web empty source selection still copies all; CLI `--without-categories` explicitly copies none. CLI `--if-copy-snapshot` guards the copied configuration against changes since dry run.
- CLI expense tag options select existing tags; they do not create tags. CLI tag and account-type commands are read-only.
- CLI read schemas expose no action-source/provenance fields. Recording CLI/agent origin on writes is not the same as reading that origin back. Expense creation previews/results do expose `accountSource` (explicit/default/none), `categorySource` (explicit/history/none), and projected/applied account effects; those explain assignment choices, not who made the change.
- CLI guided selectors really do support local, case-insensitive substring search, not just exact-name flags. Expense account/category selectors enable it above 10 choices (including special choices); tags and shared account/cycle/expense selectors above 8 resources. Search matches labels, not hints: for example, the expense chooser searches date/description, not the account/amount hint. It searches one loaded 50-expense page at a time and offers Load more or Enter an expense ID. Static accessible prompts use numbers, not search. Web comparison search also matches cycle dates; CLI cycle-selector search matches the name only.
- Web filter pills/Clear all and table search/sort are distinct from CLI controls. Guided expense listing has a Change filters choice while more pages remain, but it reuses prior options rather than providing a general clear-all/reset. A new CLI invocation can supply a different filter set. Exact-name flags are separate from interactive search; `--non-interactive` selectors require stable IDs.
- Creation and editing are distinct: Web blank notes do not clear saved notes; CLI edits have `--clear-spent-on`. Both creation paths can infer a category from history when no category is supplied (even the guided CLI Uncategorized choice); explicit clearing on edit does not infer. CLI can create cycle-less expenses and explicitly leave an account unassigned; Web requires a date-matching cycle and its No account selection can still use the default.
- Canceling a CLI confirmation applies to guided interactive flows; it does not undo an already committed command. Onboarding row order is saved from the draft, not managed with a general-purpose drag/reorder control.
- CLI sign-in uses browser-based authentication and requires an initialized Spendly user; if absent, it asks the user to open Web once. `auth login --no-browser` prints a same-machine authorization URL, not a device-code/headless login, and cannot combine with `--json`. Login rejects `--non-interactive`. `auth status` verifies/refreshes the stored session, not just local file presence. Logout removes local credentials and reports whether remote revocation was confirmed; it is not a Web-session logout.
- CLI has no onboarding wizard/path/currency mutation, but can create ordinary cycles/accounts. `context` reads optional account-setup status; `accounts add` marks that account step completed without completing the whole Web wizard. Web onboarding-only category clearing/order/removal capabilities should not be inferred for ordinary category editors.
- `--json` emits one versioned success/error document; it is not a dedicated export workflow or arbitrary field/CSV formatter. `--agent` marks committed writes but does not imply JSON. Agent, JSON, and non-interactive modes never prompt; `--interactive` conflicts with them. `--accessible` (or `ACCESSIBLE=1`, or `TERM=dumb`) selects static prompts; `--no-color`/`NO_COLOR`, `--no-retry`, and `--debug` control terminal output/read retries/diagnostics. Plaintext credential fallback requires explicit `--allow-file-storage`; it does not force bypassing a working keychain.
- CLI delete dry runs do not delete financial records, but mint confirmation tokens. Non-interactive expense/cycle deletion requires the token, revision, and idempotency key; supported edits require revision preconditions in that mode. Running multiple commands and post-processing results does not count as built-in comparison, bulk editing, or reporting support. Completion scripts offer static words, not live account/category completion. Development-only auth canaries are excluded from this user-facing matrix.
- Web source: [full action inventory](spendly-web-action-inventory.md), including its limitations and review coverage.
- CLI sources: `apps/cli/src/commands/` registrations and `*-actions.ts`, especially `read-actions.ts` and `interactive-support.ts`; `apps/cli/src/input/prompts.ts`, `accessible-prompts.ts`, `apps/cli/src/cli.ts`, `options.ts`, `domain/read-schemas.ts`, and `output/`.
- Backend cross-checks: `packages/backend/convex/cli/v1/resources.ts`, `context.ts`, `expenses.ts`, `accounts.ts`, `cycles.ts`, and `packages/backend/convex/domain/cycleOperations.ts`, `expenseOperations.ts`, `accountOperations.ts`. These are source findings, not live financial-data tests.
