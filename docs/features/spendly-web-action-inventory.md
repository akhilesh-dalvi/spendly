# Spendly web features and actions

A page-by-page inventory of what users can view and do in the Spendly web app. Actions available from multiple pages are noted in each relevant section.

**Reviewed:** 2026-11-12 against `origin/master` at `5c6a6b4`. Based on committed source and regression-test inspection, not a signed-in browser test. Known limitations and configuration-dependent behavior are called out separately.

**Labels:** **R** = read/view data; **W** = create or change saved Spendly data, including deletion; **R/W** = both. Navigation, draft-only controls, and explanatory notes are left unlabelled.

## At a glance

| Area | What users can do |
| --- | --- |
| Dashboard | Review spending, plans, account balances, and recent expenses; manage categories and create cycles |
| Comparison | Compare spending and category plans across 2–5 cycles |
| Expenses | Browse/filter expenses; create, edit, and delete expenses; manage their tags and account assignment |
| Expense cycles | Browse cycles; create, edit, copy category configuration, and delete eligible cycles |
| Categories | Create/edit categories and plans; review their expenses; hide/show or delete categories |
| Category types | Create/edit/delete shared category classifications and inspect usage |
| Financial accounts | Track balances and ledger history; create/edit accounts; set default; archive/reactivate; adjust balances and record transfers |
| Account types | Manage account classifications, appearance, asset/liability nature, and defaults |
| Tags | Browse usage; create, rename, and delete tags |
| Settings | Change currency/theme; open profile management |
| Onboarding | Choose tracking style/currency; set up cycle, categories, and optional account |
| Authentication | Sign up, sign in, manage profile, and sign out through Clerk |
| Marketing and help | Read product information, FAQs, terms, and documentation |

## Contents

1. [Dashboard and comparison](#1-dashboard-and-comparison)
2. [Expenses](#2-expenses)
3. [Expense cycles](#3-expense-cycles)
4. [Categories](#4-categories)
5. [Category types](#5-category-types)
6. [Financial accounts](#6-financial-accounts)
7. [Account types](#7-account-types)
8. [Tags](#8-tags)
9. [Settings](#9-settings)
10. [Onboarding](#10-onboarding)
11. [Authentication and shared navigation](#11-authentication-and-shared-navigation)
12. [Marketing and help pages](#12-marketing-and-help-pages)
13. [Features not available on the web](#13-features-not-available-on-the-web)
14. [Review coverage and sources](#14-review-coverage-and-sources)

## 1. Dashboard and comparison

### `/dashboard`

**View**
- **R:** Current or selected cycle: name, dates, status, days remaining, spent, planned, remaining/over-budget amounts, and progress.
- **R:** Spending by category type, including percentage share and planned amounts.
- **R:** Categories with their spending, plans, remaining amounts, icons, and type grouping.
- **R:** Current active-account balances grouped by currency, account/currency counts, and default account.
- **R:** Up to five recent expenses across all cycles, grouped by expense date, with relative dates, amounts, notes, categories, account/type information, and non-web provenance.
- **R:** Incomplete setup and optional account-setup reminders.

**Actions**
- Select a cycle from Current/Upcoming/History or move to an adjacent cycle. Initially uses the current cycle, otherwise the first listed cycle; selection is local, not URL-backed or saved.
- **W:** Switch between Grouped by Type and Simple List; this preference is saved.
- Expand/collapse groups and sort categories by spending, plan, remaining amount, or name.
- **W:** Hide a category or restore a hidden category.
- **W:** Edit a category's name, icon, type, and planned amount.
- **W:** Create a category type from the Allocation section or category editor.
- **W:** Create a cycle in a dialog, optionally selecting source categories, prefilling plans, and overriding plans. Success closes the dialog and selects the new cycle.
- Open category details, an expense editor, or full expense history.
- Start adding an expense, category, or account; resume setup. Category menus offer Add Expense with `?categoryId=...`, without setting a date in the selected cycle.
- **W:** Dismiss the account-setup reminder with Not now; this choice is saved.

**Notes**
- Account balances are current, not historical balances for the selected cycle.
- Recent expenses and the Uncategorized/history links are not restricted to the selected cycle. Add Expense does not pass that cycle's dates.
- Hidden categories still contribute to totals and allocations.
- The category editor can show No type incorrectly for a typed category. Selecting No type or clearing a plan does not clear existing saved values; zero updates a plan.
- Dashboard cycle grouping/status treats the end date as inclusive, unlike backend membership.
- Allocation shows only types with positive spending, omitting planned-only types. Without positive spending it offers Add Expense.
- With no cycles, the dashboard shows account summary/Create Cycle instead of category/allocation/activity sections.
- Spending totals do not separate currencies. Account summary can be capped at 1,000 accounts without a visible truncation warning.
- No direct category deletion, cycle edit/delete, expense deletion, or account archive/default/adjustment/transfer control here.

### `/compare`

**View**
- **R:** Aggregate count of compared cycles, total spent, total planned, and net remaining.
- **R:** Each cycle's name/dates, spending, plan, remaining amount, and progress.
- **R:** A category-name matrix with spending, plans, and utilization for each cycle.
- **R:** Expanded category details: spent, planned, difference, utilization, and missing-data states.

**Actions**
- Search the cycle picker by name or start/end date.
- Select 2–5 cycles; remove selections. Additional choices are disabled at five.
- Open/share a selection using `?cycles=id1,id2,...`; duplicate/unknown IDs are removed and only five valid IDs retained.
- Selection changes update browser history; reload and Back/Forward restore URL-backed selections. The picker stays open for successive choices; fewer than two selections show instructions rather than results.
- Expand one category at a time and horizontally scroll the comparison.
- Return to dashboard or start cycle creation when no cycles exist.

**Notes**
- Matching uses exact category names, not shared IDs. Duplicate names within one cycle merge.
- Totals include uncategorized expenses, but category breakdown omits them. Hidden categories remain included.
- Displayed utilization is capped at 100%; absent/nonpositive plans use no-plan states.
- No currency conversion, daily series, trend deltas, averages, account comparison, export, or data edits.
- The Retry panel does not handle ordinary thrown backend errors locally.

## 2. Expenses

### `/expenses`

**View and filter**
- **R:** Expense history: date, amount, category, account/type, note, tags, and non-web change information. Cycle context comes from the filter, not a per-row cycle column.
- **R:** Filter by cycle, a category within that cycle, Uncategorized, or account, including archived accounts.
- **R:** Filter by tags: an expense must match **all selected tags**.
- **R:** Review filtered expense count/total and the table's search-filtered total.

**Actions**
- Search the table using Search description; it actually searches multiple table columns, not tags.
- Sort by Date or Amount.
- Choose 5/10/20/50 rows per page; use Previous/Next.
- Remove filter pills or Clear all. Clear all also clears table search and account/category query parameters, preserving unrelated parameters. Selecting/clearing an account updates `?account=...`; removing a category pill removes `?category=...`. Quick Tags offers five unselected tags at a time.
- Open an expense to edit; start Add Expense.
- **W:** Delete from the row-trash confirmation. Linked account is refunded and a compensating ledger entry retained.
- Open account-filtered links with `?account=...` or Uncategorized with `?category=uncategorized`.
- Return to dashboard.

**Notes**
- At most 500 expenses are fetched before further filtering; table pages/search/totals can therefore omit older history.
- Header count/total does not change with table search; the table footer does.
- Removing a cycle can leave an invisible Uncategorized restriction. Changing cycle can retain a category from the previous cycle.
- An invalid account link can apply no account filter. Named category/cycle/tag/search/sort/page URL initialization is not generally supported.
- No date-range widget or bulk edit/delete/categorize controls.

### `/expenses/new`

**Form fields**

| Field | Available choices |
| --- | --- |
| Amount | Positive amount, minimum 0.01; up to two typed decimal places |
| Date | Calendar; defaults to today; determines the cycle/categories |
| Account | Search by name/type; active accounts or No account selected |
| Category | Search/group by type; category or Uncategorized |
| Note | Optional single-line description |
| Tags | Searchable multiple selection; remove selected tags or create a tag inline |

**Actions and defaults**
- **R/W:** Review the cycle containing the selected date and create an expense.
- Account defaults to active user default, then the single latest expense's active account.
- Category can prefill from `?categoryId=...` or the latest expense.
- **W:** Create a tag immediately and select it; it remains saved even if the expense is abandoned.
- Use Add another expense to keep entering expenses; amount/note reset while other selections are retained.
- Follow links to create an account, category, or missing cycle.
- Creating an account-linked expense subtracts its amount and records a ledger entry.
- Warnings, not blocks: amount above 10,000, date over 90 days old, or over 30 days ahead.

**Notes**
- Web submission requires a cycle for the date, although the underlying operation supports cycle-less expenses.
- Once the date's cycle/categories load, incompatible categories are cleared. Latest-expense category defaults apply only once and only within that cycle; explicit Uncategorized is preserved. Saving is disabled while cycle/categories are unavailable.
- No account selected can still use/debit the default account. Uncategorized can trigger historical category inference.
- No currency/exchange-rate field; account amounts may use the user's currency formatter. Expenses have no currency snapshot.
- Normal page success resets the form and stays here; date-related query state may not reset consistently. Modal success closes/returns unless Add another is enabled.

### `/expenses/[id]`

**Actions**
- **R/W:** View the expense and edit the same amount/date/account/category/note/tag fields as creation.
- **W:** Clear its account assignment, refunding the previous account; remove all tags.
- **W:** Create/select a tag independently of saving the expense.
- **W:** Delete after confirmation; refund the linked account, including an archived account.
- Save/delete returns to `/expenses`; modal variant closes/returns. No Add another switch.

**Notes**
- Date changes resolve the cycle; category must match it. Amount/account changes create compensating balance entries.
- An existing archived account can remain assigned; switching to another archived account is rejected.
- **W:** Selecting Uncategorized clears an existing category. Changing dates into another cycle clears an incompatible category and can save in the new cycle. Unlike creation, explicit category clearing does not invoke historical inference.
- Blank note still does not clear an existing note.
- Created on displays the expense date, not its creation timestamp. Normal page shows non-web change information; modal omits it.
- Web saves do not require a revision precondition, and missing/unowned records have no page-specific recovery screen.

## 3. Expense cycles

### `/cycles`

**Actions**
- **R:** View cycle names/dates, current/upcoming/history status, spending/plans, and budget progress.
- **R:** Review current-cycle metrics and cycle counts.
- Filter All/Current/Upcoming/History; sort newest/oldest; show only cycles with budget; Reset Filters.
- Open a cycle, create a new/first cycle, or return to dashboard.

**Notes**
- No cycle-name search, pagination, selection, or bulk actions on this page.
- Highest planned and Highest spent options currently sort by newest date instead.
- Budget-only can hide cards without updating section counts/empty states.
- The page can treat the end date as current, unlike the backend's exclusive end date.

### `/cycles/new`

**Actions**
- **W:** Enter cycle name and start/end date range; create the cycle.
- Optionally choose any existing cycle to copy category configuration from, or Do not copy.
- Select/deselect source categories, toggle prefilled plans, and override each selected plan.
- Use the two-month calendar; go back or view all cycles. Success opens the new cycle.

**Rules and effects**
- Nonblank name, valid dates, start before exclusive end, and no overlap.
- Changing the start date rewrites the create-mode name to month/year.
- Copy creates new categories with name/type/icon/hidden state/order/plans, never expenses.
- Cycle plans are category plans added together; there is no separate cycle-budget field.

**Notes**
- Calendar defaults/display look inclusive, but the selected end is stored unchanged as an exclusive boundary.
- Deselecting every source category currently copies all, not none.
- Copy-plan fields show ₹ regardless of preferred currency and accept extra decimal precision.
- Calendar does not disable overlapping dates before submission.

### `/cycles/[id]`

**View**
- **R:** Overview: cycle totals, progress, category-type allocation, categories, and quick expense activity.
- **R:** Plan: all categories, including hidden ones, with plans/current spending/prior-cycle actual spending.
- **R:** Activity: cycle expenses and count; Quick Activity uses the first five returned expenses.

**Actions**
- Switch Overview/Plan/Activity using `?tab=`; previous/next cycle preserves the tab.
- **W:** Switch saved grouped/simple category view, expand groups, and sort displayed categories.
- **W:** Hide/restore categories or edit their name/icon/type/plan.
- **W:** Create one/multiple categories in Plan; use previous-cycle suggestions or create a type inline.
- **W:** Use Last Cycle to fill a category plan with previous actual spending, then save.
- **W:** Delete a category from Plan after confirmation; expenses remain but become uncategorized.
- **W:** Delete the cycle after confirmation, **only if no expense references it or any contained category**. Deletes contained categories too.
- Open category/expense details, start adding category/expense, open full history, edit cycle, or return to cycles.

**Notes**
- Prior spending matches exact category names; it is not a cross-cycle category-ID relationship.
- Activity lists at most 500 expenses without fetching additional pages. Full-history/Uncategorized links omit cycle filtering.
- Overview has the same category-type editor prefill issue as dashboard. Plan's category editor uses the correct type.
- No persistent category reorder or cycle archive. Plan cards do not link to category detail.

### `/cycles/[id]/edit`

**Actions**
- **R/W:** Read/edit name and date range; Save returns to cycle detail.
- **W:** Delete from danger zone after confirmation, with the same linked-expense restrictions as detail.
- Use range calendar or browser Back; no copy controls.

**Notes**
- Name is retained when dates change. Dates must be valid, ordered, and nonoverlapping.
- **Changing dates does not move existing expenses between cycles**, despite explanatory text suggesting otherwise. Existing expense references remain unchanged.
- No expense migration, reconciliation, cycle archive, or bulk operation.

## 4. Categories

There is no standalone `/categories` list page. Category lists and management appear in dashboard, cycle pages, forms, and onboarding.

### `/categories/new`

**Actions**
- **W:** For the cycle supplied by `?id=<cycleId>`, create one/multiple categories.
- Enter name, searchable emoji icon (default 📦), optional type, and optional nonnegative plan; typed plans allow two decimal places.
- Add/remove draft rows; populate them from unused previous-cycle suggestions.
- Copy suggested name/type/icon/**planned amount**. This differs from Use Last Cycle, which uses previous actual spending.
- **W:** Create a category type inside the selector and select it immediately.
- Save returns to dashboard; modal save/close returns to previous page; inline cycle form stays on cycle.

**Notes**
- No cycle selector. Missing cycle ID redirects on normal page and renders nothing in modal.
- Each category is saved separately; multi-create can partially succeed.
- An inline-created type survives cancelling the category draft.
- Names need not be unique. Ordinary category validation is less strict than onboarding/cycle-copy validation.
- No category move, archive, hide, or reorder field here.

### `/categories/[id]`

**View**
- **R:** Name/icon/type/cycle, expense count, spent/planned/remaining/over amounts, utilization, and previous-cycle spending.
- **R:** Expenses belonging to the category.

**Actions**
- **W:** Edit name/icon/type/plan; use previous-cycle actual spending to fill plan.
- **W:** Hide/show on dashboard-style views; category remains accessible and contributes to totals.
- **W:** Add an expense in a modal prefilled with this category; shared expense fields/inline tag creation apply.
- **W:** Delete category after confirmation; unlink it from expenses, retain their amounts/balances, report affected count, return to dashboard.
- Search expense table; sort Date/Amount; use 5/10/20/50 rows and Previous/Next.
- **W:** Edit an expense from its menu. **Menu Delete executes immediately without confirmation.**
- Return to dashboard; cycle name is display-only.

**Notes**
- Totals use the capped expense list, not an uncapped aggregate.
- Add Expense defaults today, not necessarily a date in this category's cycle.
- Selecting No type or blank plan cannot clear existing values; setting plan to zero works. This limitation also applies to shared category editors elsewhere.
- No category merge/move/reorder or expense-table bulk/export controls.

## 5. Category types

### `/data/types`

**View and actions**
- **R:** List name/color/creation date and usage by categories across all cycles, including hidden categories.
- **R:** Review Total Types/In Use/Unused counts; search names; filter All/In use.
- **W:** Create a type with name/color using suggestions, presets, or custom color picker.
- **W:** Edit shared name/color; changes appear on categories across cycles.
- **W:** Delete after confirmation; clears category-type assignments but does not delete categories/expenses.
- Desktop: sort Name/Usage/Created, 5/10/20/50 rows, Previous/Next. Mobile: all filtered cards, without table sort/pagination.
- Return to dashboard.

**Color controls:** Create offers ten presets and saturation/lightness/hue picker. HEX/RGB/CSS/HSL outputs are read-only. Edit uses native color input/presets. Shared inline type creation uses the create controls and persists immediately.

**Notes**
- No Unused-only filter, usage drill-down, detail page, archive/default, bulk operation, or manual reorder.
- Duplicate checks are case-sensitive. Edit can remove existing order metadata.
- Desktop and mobile searches are trimmed and case-insensitive.

## 6. Financial accounts

### `/accounts`

**View and actions**
- **R:** View separate active/archived card sections with name/type/nature/icon/color, opening/current balances, default/archive flags, and non-web change information.
- **R:** Review active totals grouped by currency, account/currency counts, and default account.
- Open account detail, add account, or return to dashboard.
- **W:** From active-account menu, adjust actual balance or record a transfer using the shared forms below. Archived cards offer View only.

**Notes:** Up to 1,000 accounts without pagination/truncation warning. No account search/sort/filter controls, table toggle, bulk actions, import/export, or card-level archive/default controls.

### `/accounts/new`

**Actions**
- **W:** Create account with name, active account type, and finite opening balance; zero/negative balances allowed.
- First active type is preselected. Opening balance defaults zero; blank balance also becomes zero.
- Open Manage account types if no active type exists.
- Success opens account detail; Back returns to accounts.

**Effects:** Creates active account with opening/current balance and opening ledger entry dated server UTC today. Sets default if none exists and marks optional account setup complete as needed.

**Notes:** No currency selector, opening date/note, default checkbox, or inline type management. The shared form's type-management controls are not enabled on this route.

### `/accounts/[id]`

**View and actions**
- **R:** Read account/type/nature/currency/default/archive information, fixed opening balance, and changing current balance.
- **R:** Review ledger entries: opening balance, expense, adjustment, transfer in/out, date/note, signed amount, balance-after, and provenance.
- **R:** Load 50 more ledger entries using backend pagination.
- **W:** Edit name/type, including on archived accounts. Existing archived type can be retained; a different type must be active.
- **W:** Make an active account default for new expenses; no explicit clear-default control.
- **W:** Archive after confirmation: preserves balance/history and clears default if this was the default account.
- **W:** Reactivate without confirmation: does not restore prior default or reactivate its type.
- **W:** Adjust balance or record transfer when active; return to accounts.

**Notes:** Ledger rows are not links and cannot be edited/deleted here. No ledger search/date/type/sort controls, opening-balance/currency editing, transfer reversal, account deletion, bulk operation, or inline type management.

### Shared balance-adjustment and transfer forms

| Action | Fields | Behavior |
| --- | --- | --- |
| Adjust balance | Actual balance, date, optional note | Shows signed difference; accepts zero/negative finite balance; records manual ledger adjustment; unchanged balance is a no-op |
| Record transfer | Destination, positive amount, date, optional note | Source is fixed by chosen account; destination must be another active same-currency account; updates both balances and paired ledger entries together |

- Defaults date to browser-local today; note is trimmed; valid calendar date required.
- Negative resulting balance warns but does not block. No extra confirmation after form submit.
- Transfer success can open destination account. No expense is created.
- Transfers are **internal balance records, not bank payments**. No exchange rate, fee, or cross-currency transfer.
- Backdated adjustments/transfers change current balance immediately; older stored balance-after snapshots are not recomputed.

## 7. Account types

### `/data/account-types`

**View and actions**
- **R:** List active/archived types in stored order, with account usage and deletion eligibility.
- **R:** Review Total Types/Active/Liabilities counts; liability count includes archived types.
- **W:** Create/edit name, optional icon/color, and Asset/money available or Liability/money owed nature.
- **W:** Clear custom icon/color; choose presets, native color/hex input, or default styling.
- **W:** Change nature only when no account references the type, including archived accounts.
- **W:** Archive after confirmation, preventing new assignments but retaining existing accounts/history.
- **W:** Reactivate without confirmation.
- **W:** Delete an unused active/archived type after confirmation; usage is rechecked.
- **W:** Restore missing defaults: Cash, Checking, Savings, Wallet, Other, Credit Card.
- Return to dashboard.

**Notes**
- Names are unique ignoring case, including archived types; maximum 100 types. Usage display can cap at 1,000 with a plus marker.
- Balance nature is classification, not enforcement of a positive/negative balance.
- Restore defaults does not overwrite edited types or reactivate archived matching names.
- No search/filter/table/pagination/manual reorder/bulk/reassignment control; stored order is not an editable/displayed field.

## 8. Tags

### `/data/tags`

**View and actions**
- **R:** List user-owned tags with creation date, expense usage count, In use/Unused status, and overall counts.
- Search names; filter All/In use.
- **W:** Create a named tag, optionally filling its field from suggestions.
- **W:** Rename; existing expense associations stay attached by ID.
- **W:** **Delete immediately without confirmation**; detaches from affected expenses without changing amounts/balances and advances their revisions.
- Desktop: Name/Usage/Created sort and 5/10/20/50-row pagination. Mobile: all filtered cards without table sort/pagination.
- Dismiss form dialogs or return to dashboard.

**Notes**
- Tags are reusable within one user, not shared between users.
- Creation reuses exact-case name matches; rename allows duplicate names.
- Desktop and mobile searches are trimmed and case-insensitive.
- No tag-detail/usage drill-down, merge/archive/default, Unused-only filter, bulk/export, or apply-to-expenses action on this page. Assignments are managed in expense forms.

## 9. Settings

### `/settings`

**View and actions**
- **R:** Read displayed name/avatar/primary email and preferred currency.
- Manage Profile opens Clerk's profile interface.
- **W:** Change currency immediately: USD, EUR, GBP, INR, CAD, AUD, JPY, AED. No separate Save.
- Choose Light/Dark/System theme; stored as a browser preference, not a Spendly backend preference.
- Return to dashboard.

**Notes**
- Currency changes relabel expense/plan displays without converting amounts. Accounts with explicit currency retain it; accounts without one follow the user preference. Account records and ledger entries are not rewritten.
- Clerk profile/security options depend on provider configuration and were not browser-tested.
- No timezone, language, notification, data export/reset, or default-account setting here.

## 10. Onboarding

### `/onboarding`

- Redirects to `/onboarding/start`; no form or separate data change.

### `/onboarding/start`

- **R:** Read saved currency/setup path.
- Choose currency and Start tracking freely or Plan & track; choices stay local until Save and continue.
- **W:** Save advances to cycle, resets completion/account-setup status, and seeds missing account types.
- Existing saved cycle/categories are not erased. No skip/back/reset-all control here.

### `/onboarding/cycle`

- **R/W:** Read/create/edit the user's onboarding cycle: name/start/end.
- Use Monthly/Pay period/Custom presets when URL `mode=plan` is absent; select dates in a one-month calendar. Monthly ends on the month's last day; Pay period ends today+13. Both save those dates unchanged as exclusive ends.
- **W:** Save advances to categories for Plan path or accounts for Free path; persisted path, not URL, determines routing.
- Back returns to start. Foreign cycle links cannot load another user's cycle.
- Same exclusive-end/no-overlap rules and no expense reassignment as normal cycles. No copy/delete/skip.

### `/onboarding/categories`

- **R:** Read onboarding cycle, visible existing categories, and types; use template categories when no visible categories exist.
- Edit rows with name/icon/type/optional plan; add/remove rows. Repeat Undo in last-in-first-out order; restored rows append rather than returning to their original position.
- Clear an existing type/plan here, unlike the ordinary category editor. Blank plan means absent; explicit zero remains zero.
- A foreign cycle URL shows a warning and uses the owned onboarding cycle, never the foreign cycle's data.
- Search emoji picker; review draft total/category count/type-share metrics.
- **W:** Create a category type inline; saves immediately even if setup is abandoned.
- **W:** Save creates/updates retained categories and their row order. **Omitted existing categories are deleted if unused or hidden if linked to expenses**, including previously hidden categories.
- **W:** Skip advances without saving draft/removals; Back returns to cycle.
- Blank-name rows omitted; at most 100 submitted categories. Retained rows become visible; linked expenses are not deleted/detached.
- No separate destructive confirmation. Draft totals can include amounts on blank-name rows not saved.

### `/onboarding/accounts`

- **R/W:** Read active account types; create a type inline with name and asset/liability nature, without icon/color fields.
- **W:** Create account with name/type/opening balance and finish onboarding; zero/negative balances allowed. First active type is preselected; opening balance defaults to zero and blank also parses as zero.
- Creates opening ledger entry dated server UTC today; makes default if absent; preserves existing default. Currency falls back to user preference.
- **W:** Skip account setup and finish without saving account draft. Inline-created types remain.
- Back follows Free/Plan path. Success offers Add your first expense or View dashboard; revisiting after completion redirects to dashboard.
- No account list/edit/default picker, currency/opening date/note, adjustment/transfer/archive, or bulk creation.

### Shared setup and access behavior

- Sign-in is required. Incomplete users without an onboarding cycle are redirected from app pages to Start or Cycle according to saved path. Categories requires the Plan path and an owned onboarding cycle; Accounts requires an onboarding cycle.
- Completed users are redirected away from setup to Dashboard; Accounts handles its completion redirect separately. Legacy users with an existing cycle can be considered complete without a saved setup path.
- Once a valid onboarding cycle exists, optional category/account setup need not be finished to access the app.
- Progress uses three Free-path or four Plan-path steps; Resume setup links to outstanding step.
- Back does not save/undo local drafts or confirm their loss. Separately saved types remain.
- **W:** Account reminder offers Add account or saved Not now dismissal; dismissal does not finish every setup step.
- No universal Skip onboarding/Cancel/reset wizard.
- Failed saves retain local drafts/selections for retry; inline type creation and skip failures expose errors.
- **W:** Global UserSync attempts initialization whenever it observes a signed-in Clerk user with an email, not only after signup. New users receive USD, pending setup, default account types, and Needs/Wants/Savings category types. Existing users are unchanged, not continuously profile-synchronized.

## 11. Authentication and shared navigation

### `/sign-in/[[...rest]]`

- Sign in through Clerk. Signed-out protected requests redirect to `/sign-in?redirect_url=<original absolute URL>`; after authentication, onboarding may redirect incomplete users to setup instead.
- Exact enabled password/social/passkey/MFA/reset flows depend on Clerk configuration, not established by these page sources.

### `/sign-up/[[...rest]]`

- Create/verify an identity through Clerk; backend initialization follows when signed in.
- Exact signup fields/providers/redirect behavior depend on Clerk configuration.

### Shared app controls

- Navigate Dashboard, Expenses, Cycles, Accounts, Compare, Tags, Category Types, Account Types, Settings, and CLI Docs; logo opens dashboard.
- Mobile primary navigation offers Dashboard/Expenses/Cycles/Accounts; More contains Compare/Tags/Category Types/Account Types/Settings/CLI Docs.
- Use sidebar/mobile drawer or Ctrl/Cmd+B, which toggles the drawer on mobile and sidebar state on desktop. Desktop Settings is in the user menu, not the main sidebar.
- Choose Light/Dark/System theme.
- Open Account/profile through Clerk or the app header's separate UserButton; Log out ends the Clerk session without deleting Spendly data.
- Sidebar name/email prefer saved backend values while avatar and Settings identity come from Clerk; profile edits can therefore appear differently.
- **R:** Read non-web change information in provenance tooltips.
- Sidebar toggle writes a cookie, but current layout does not use it to restore initial state. No configured nested navigation sections.

## 12. Marketing and help pages

These pages provide information and navigation, not financial-data editing.

### `/`

- Read product overview, cycle/planning workflows, and feature summaries.
- Open/close four screenshot previews: expense capture, history, cycle comparison, dashboard.
- Expand/collapse FAQs; follow Features/Pricing/Sign in/Sign up/Dashboard links.
- Screenshots have light/dark variants and are not a live financial demo. No shared-household/team functionality is exposed.

### `/features`

- Read feature/workflow descriptions; navigate Sign up/Sign in/Dashboard and CLI Docs.
- Read cycle-date rules, optional planning, editable history, and comparison examples. Marketing descriptions do not add controls to the app.

### `/pricing`

- Read the free web/CLI feature summary and setup guidance; navigate Sign up/Sign in/Dashboard, Features, and CLI Docs.
- No checkout, subscription, upgrade, or donation transaction.

### `/about`

- Read the product's story/principles; navigate Features, CLI Docs, GitHub, and Sign up/Sign in/Dashboard.

### `/faqs`

- Jump to topic groups; open/close one answer per group at a time.
- Read practical setup/date/planning/history/comparison answers and AI setup steps; follow CLI skill/setup documentation, Features, and GitHub links.
- No in-page support-ticket or chat submission; bug-report guidance points to public GitHub Issues.

### `/terms`

- Read terms; navigate Pricing/About/footer links. No acceptance form.
- Although a marketing page, current middleware requires sign-in because `/terms` is omitted from its public-route matcher.

### `/docs/cli/[[...slug]]`

- Read `/docs/cli`, `/docs/cli/ai-agents`, `/docs/cli/expenses`, `/docs/cli/accounts`, `/docs/cli/cycles`, `/docs/cli/categories`, `/docs/cli/tags`, `/docs/cli/troubleshooting`.
- Browse sidebar/table of contents/anchors; search documentation; follow app/site/GitHub/article links.
- Displayed commands do not execute financial actions from the documentation page.
- Copy command blocks. Supported installation/one-off command blocks offer npm/pnpm/yarn/bun tabs; the selection is shared across blocks and saved in browser storage when available.
- Unknown document returns not-found. Clipboard behavior still depends on browser permissions/context.

### Shared marketing controls

- Header/footer navigation; mobile menu open/close, Escape dismissal, close on link selection; Skip to content.
- Signed-out Sign in opens a Clerk modal; Sign up opens signup. Signed-in Go to Dashboard and Clerk UserButton are available.
- Choose Light/Dark/System theme while signed in or signed out, including from the mobile header; open the public GitHub repository.

## 13. Features not available on the web

The reviewed pages do not expose:
- General cycle-name search on `/cycles` or persistent category/type manual reorder. The comparison picker does have local name/date search, and onboarding saves draft row order.
- Bulk expense edit/delete/categorization or account archive/reactivate.
- Receipt upload, recurring-expense scheduling, expense splitting/duplication/archive.
- General import/export, bank synchronization/payment execution, currency conversion.
- Permanent account deletion, opening-balance editing, transfer reversal, or ledger-entry editing/deletion.
- Tag merge/archive or applying tags to expenses from tag management.
- Arbitrary-period/daily-series/FX-normalized reports, trend deltas, or averages.
- Timezone preference, paid checkout, or working donation transaction.

## 14. Review coverage and sources

The committed app contains **35 page modules, 32 route patterns, 3 modal variants, and 8 documentation pages**. This refresh compared the prior inventory with current page/shared-component sources, relevant backend handlers, and regression tests. Counts exclude API routes and metadata modules; modal variants share their canonical route patterns.

**Page sources**
- Authenticated routes: `apps/web/src/app/(app)/<route>/page.tsx`.
- Modal variants: `apps/web/src/app/(app)/@modal/` for expense create/edit and category create. They generally close/return instead of normal-page navigation; differences are noted above.
- Onboarding: `apps/web/src/app/onboarding/`.
- Authentication: `apps/web/src/app/(auth)/`.
- Marketing: `apps/web/src/app/(marketing)/`.
- Documentation: `apps/web/src/app/(docs)/docs/cli/`, `apps/web/content/docs/cli/`, and `apps/web/src/app/api/docs/search/route.ts`.
- Route protection: `apps/web/src/proxy.ts`.

**Shared implementation sources**
- Forms: `apps/web/src/components/expense-form.tsx`, `cycle-form.tsx`, `category-form.tsx`, `category-type-form.tsx`, `account-form.tsx`, `account-actions.tsx`.
- Reports/views: `apps/web/src/components/dashboard-summary.tsx`, `category-spending-chart.tsx`, `category-type-chart.tsx`, `recent-activity.tsx`, `account-balance-overview.tsx`, `compare/`.
- Tables/navigation/setup: `apps/web/src/components/ui/data-table.tsx`, `navigation-config.ts`, `nav-user.tsx`, `mobile-nav.tsx`, `onboarding-guard.tsx`, `onboarding-shell.tsx`, `user-sync.tsx`.
- Marketing/documentation controls: `apps/web/src/components/marketing-header.tsx`, `landing-demo-strip.tsx`, `docs/code-block.tsx`, `docs/package-manager-code-block.tsx`, and `apps/web/src/app/(marketing)/faqs/faq-page-data.ts`.
- Backend behavior: `packages/backend/convex/expenses.ts`, `cycles.ts`, `categories.ts`, `accounts.ts`, `accountTypes.ts`, `tags.ts`, `aggregations.ts`, `users.ts`, and their `domain/` operations.

Limits and malformed controls above describe source-level findings. Runtime behavior and identity-provider configuration still need signed-in verification.
