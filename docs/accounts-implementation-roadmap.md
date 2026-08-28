# Accounts Implementation Roadmap

This document is the execution checklist for making Spendly accounts usable end to end. Update it after each implementation and verification pass.

## Phase 0 — Backend foundation and safety

**Status:** Complete

- Account, transaction, transfer, expense, and user-default schema fields
- Account CRUD-style mutations and transaction queries
- Expense-to-account balance synchronization
- Archived-account and cross-currency transfer guards
- Default-account ownership validation and expense-form preference

## Phase 1 — Account management foundation

**Status:** Implementation complete; acceptance testing in progress

- [x] Add Accounts to desktop and mobile navigation
- [x] Add `/accounts` with currency-aware totals, active accounts, archived accounts, and empty/loading states
- [x] Add `/accounts/new` with account creation form
- [x] Add `/accounts/[id]` with account details and transaction history
- [x] Add edit, make-default, archive, and reactivate actions
- [x] Add “Create account” from the expense account picker empty state
- [x] Verify the authenticated desktop empty state in dark mode with Computer Use
- [x] Verify type safety, Ultracite compliance, and a production build
- [ ] Complete the data-changing acceptance tests below
- [ ] Verify keyboard access, mobile layout, and light theme

### Phase 1 acceptance tests

1. Create a checking account with a positive opening balance.
2. Create a credit card or cash account with a zero or negative opening balance.
3. Confirm the first account becomes the expense-form default.
4. Change the default account and confirm a new expense preselects it.
5. Edit an account name, type, and currency.
6. Archive the default account and confirm it disappears from new-expense choices.
7. Reactivate the account and confirm its history is retained.
8. Verify opening-balance and expense entries appear on the account detail page.

## Phase 2 — Balance adjustment and transfers

**Status:** Implementation complete; acceptance testing pending

- [x] Balance-update dialog that records a manual adjustment from the actual balance
- [x] Transfer dialog with active, same-currency destination filtering
- [x] Negative-balance warnings without blocking legitimate adjustments or transfers
- [x] Selectable date and optional note for both actions
- [x] Quick-action menu on account cards and visible actions on account details
- [x] Friendly error messages mapped from Convex error codes
- [x] Transfer success toast with a link to the destination account
- [ ] Complete the Phase 2 acceptance tests below

### Phase 2 acceptance tests

1. Adjust an account to a higher balance and confirm a positive ledger adjustment.
2. Adjust it to a lower balance and confirm a negative ledger adjustment.
3. Enter a negative actual balance and confirm the warning appears without blocking submission.
4. Transfer between two active accounts using the same currency and confirm both balances update.
5. Transfer more than the source balance and confirm the negative-balance warning appears.
6. Confirm archived, same-account, and different-currency destinations cannot be selected.
7. Confirm the chosen date and optional note appear in account activity.
8. Use the success-toast action and confirm it opens the destination account.
9. Verify dialogs using keyboard navigation, mobile layout, light theme, and dark theme.

## Phase 3 — Dashboard and discovery

**Status:** Implementation complete; acceptance testing pending

- [x] Add an indexed `accounts.getSummary` query for active balances grouped by currency
- [x] Keep dashboard account balances separate from cycle spending, including when no cycle exists
- [x] Link each dashboard account row to its account details
- [x] Add a URL-backed account filter to expense history
- [x] Include archived accounts in the history filter with a clear archived label
- [x] Load account activity newest first in pages of 50
- [ ] Complete the Phase 3 acceptance tests below

### Phase 3 acceptance tests

1. Confirm the dashboard shows active-account totals grouped by currency and does not mix them into cycle spending.
2. Confirm archived accounts are excluded from dashboard totals.
3. Confirm the account summary still appears when no expense cycle exists.
4. Open an account from the dashboard and confirm it reaches the correct account details.
5. Filter expenses by an active account and confirm the `account` query parameter survives refresh and can be shared.
6. Filter expenses by an archived account and confirm its historical expenses remain discoverable with an Archived label.
7. Clear the account filter and Clear all, then confirm the URL and results both reset.
8. On an account with more than 50 ledger entries, confirm the newest 50 appear first and Load 50 more appends the next page without duplicates.
9. Verify dashboard cards and expense filters using keyboard navigation, mobile layout, light theme, and dark theme.

## Phase 4 — Onboarding and empty-state guidance

**Status:** Not started

- Optional `/onboarding/accounts` step
- Dashboard prompt for users with no accounts
- `dismissAccountsOnboarding` mutation
- Product decision on seeding a zero-balance Cash account

## Account-type refactor

**Status:** Complete

- [x] Replace the fixed account type enum with user-owned `account_types`
- [x] Seed six editable defaults for new users
- [x] Add `/data/account-types` management and independent navigation
- [x] Resolve current type metadata across accounts, expenses, dashboard, and
  transfers
- [x] Preserve archived type metadata while blocking new assignments
- [x] Protect in-use deletion and balance-nature changes
- [x] Add authorization, lifecycle, seeding, metadata, and ledger regression
  tests

## Phase 5 — Production hardening

**Status:** Not started

- [x] Asset/liability balance-nature convention and documentation
- [x] Balance-math and authorization tests
- Reconciliation/debug query
- Backend documentation update
- Convex development deployment verification, production deploy, and Vercel deploy

## Verification log

Record the command, UI walkthrough, date, and outcome for each completed phase.

### 2026-08-10 — Phase 1 implementation verification

- `pnpm --filter web exec next typegen` — passed
- `pnpm --filter web exec tsc --noEmit` — passed
- `pnpm dlx ultracite check` — passed across 199 files
- `NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack` — passed; `/accounts`, `/accounts/new`, and `/accounts/[id]` were generated
- Computer Use in the authenticated Brave session — `/accounts` loaded successfully with the Accounts navigation item, currency-aware empty summary, active-account empty state, and both create-account links
- Persistent test records were not created during the automated walkthrough; use the Phase 1 acceptance tests above for the mutation flow

### 2026-08-10 — Phase 2 implementation verification

- `pnpm --filter web exec tsc --noEmit` — passed
- Focused `pnpm dlx ultracite check` — passed for the Phase 2 components and account pages
- `NEXT_TELEMETRY_DISABLED=1 pnpm --filter web exec next build --webpack` — passed with all account routes
- Computer Use in the authenticated Brave session — the account-creation form and existing account navigation remained accessible after the Phase 2 build
- The current development account has no account records, so the adjustment and transfer dialogs require the Phase 2 acceptance tests above after creating two same-currency accounts

### 2026-08-15 — Phase 3 implementation verification

- Web TypeScript check — passed
- Convex TypeScript check — passed
- Focused `pnpm dlx ultracite check` — passed for the Phase 3 backend, dashboard, expense history, account details, and dashboard-account component
- `git diff --check` — passed
- `NEXT_TELEMETRY_DISABLED=1 next build --webpack` — passed with `/dashboard`, `/expenses`, and all account routes
- Convex reviewer pass — new queries authenticate, validate ownership where required, use indexes and bounded reads, paginate history, and declare return validators
- Computer Use — the local server was started on the previously authenticated port, but the active Brave tab changed during the walkthrough; UI acceptance testing remains pending to avoid interrupting the user's browser session

### 2026-08-17 — Account-type refactor verification

- `pnpm --filter web exec next typegen` — passed
- Web and explicit Convex TypeScript checks — passed
- Convex integration suite — 11 tests passed, covering tenant isolation, type
  lifecycle, seeding, account reassignment, archived history, multiple
  currencies, negative balances, expense synchronization, and ledger math
- `pnpm --filter web exec next build --webpack` — passed with `/accounts`,
  `/accounts/[id]`, `/accounts/new`, and `/data/account-types`
- In-app Browser — restored six defaults in order; repeated recovery remained
  idempotent; two temporary custom types passed create, rename, recolor, re-icon,
  archive, assignment filtering, reactivate, and delete flows
- In-app Browser — keyboard-operated selectors, 390 px mobile and 1440 px
  desktop layouts, light/dark/system themes, and a clean console passed; no
  account or expense records were created
