# Accounts Feature Plan

## Goal

Add first-class accounts to Spendly so users can track where money lives, keep balances current, move money between accounts, and associate expenses with the account they were paid from.

---

## Implementation Status

Last reviewed against the working branch. Use this section to track progress.

| Area | Status | Notes |
| :--- | :--- | :--- |
| Schema (`accounts`, `account_transactions`, `account_transfers`) | Done | `expenses.accountId` added |
| User-managed account types | Done | `account_types` is the classification source; accounts store `accountTypeId` |
| `packages/backend/convex/accounts.ts` | Done | Resolved account-type metadata returned by account queries |
| Expense ↔ account balance sync | Done | Create, update, delete, account change |
| Expense form account picker | Done | User preference first, recent active expense fallback |
| Expenses list account column | Done | |
| Recent activity account label | Done | |
| Transfer safety + default account preference | Done | Archived/cross-currency guards; active-account preference validation |
| Account management UI | Done | `/accounts`, create, edit, detail, balance adjustment, transfer |
| Account-type management UI | Done | `/data/account-types`, CRUD, archive/reactivate, safe delete |
| Dashboard accounts section | Done | Currency-aware summary kept separate from cycle spending |
| Onboarding accounts step | Not started | |
| Transfer / balance update dialogs | Done | |
| Nav links | Done | Accounts and Account Types are independently addressable |
| Aggregations / account summary query | Done | `accounts.getSummary` |
| Backend docs update | Not started | `docs/backend-documentation.md` |
| Account-type and balance tests | Done | Convex integration suite covers authorization and ledger regressions |

**Current phase:** Account management, dashboard discovery, and user-managed
account types are implemented and verified. Onboarding and production deployment
remain future work.

---

## Product Scope

### Accounts

Users can create accounts and classify them with their own account types. New
users receive editable Cash, Checking, Savings, Credit Card, Wallet, and Other
templates; these are ordinary user-owned records after seeding.

Each account stores:

- Name
- Account type reference (`accountTypeId`)
- Resolved account-type name, icon, color, and balance nature on reads
- Starting balance (immutable snapshot at creation)
- Current balance (denormalized cache; ledger is source of truth)
- Currency
- Archived state
- Created / updated timestamps

**Planned extensions** (see [Schema](#schema)):

- `sortOrder`, `icon`, `notes`
- `creditLimit` (credit card utilization)
- `includeInNetWorth` (exclude from dashboard totals when false)

Archived accounts stay available for historical transactions but are hidden from default account selectors and dashboard summaries.

### Balance Updates

Users can update an account balance at any time. Spendly records the difference between the current balance and the new balance as a manual adjustment instead of silently rewriting history.

Example:

- Current balance: 500
- User-entered balance: 650
- Ledger adjustment: +150

This covers external income, corrections, refunds, or any money movement Spendly does not yet model directly.

**Future:** Add an explicit `income` / `deposit` transaction type instead of overloading `manual_adjustment`.

### Transfers

Users can move money from one account to another.

Transfers create two ledger entries:

- `transfer_out` on the source account
- `transfer_in` on the destination account

Transfers do not count as expenses and should not affect cycle spending totals.

**Implemented validation:**

- Reject transfers involving archived accounts
- Reject cross-currency transfers until FX is supported

**Validation to consider:**

- Optional: insufficient-funds check on non-credit accounts

### Expenses

Expenses can optionally reference an account. The backend keeps this optional so existing expenses remain valid.

When an expense has an account:

- Creating an expense decreases the account balance (`-amount`).
- Updating the expense amount or account reverses the old balance effect and applies the new one.
- Deleting the expense reverses the balance effect.
- Clearing the account on edit reverses the prior account only.

**Balance convention:**

Every account type declares `balanceNature` as `asset` or `liability`. The
ledger continues to store signed balances and apply expense deltas uniformly;
balance nature controls presentation and prevents unsafe semantic changes once
a type is in use.

### Onboarding

Current onboarding: **currency → cycle → categories (plan mode) → optional account → dashboard**.

Implemented flow:

1. **Optional step** after cycle setup: `/onboarding/accounts` — add first account or skip.
2. Account-type templates are seeded on signup; account records themselves are
   never created without the user choosing a name, currency, and opening balance.
3. **Post-onboarding nudge** on dashboard when user has zero accounts and has not dismissed the prompt.
4. **Expense form empty state** — link to create account when none exist (mirror category "Create new" action).

User-level flags (on `users`):

- `defaultAccountId?: Id<"accounts">` — preferred default for expense form
- `accountsOnboardingStatus?: "pending" | "skipped" | "completed"` — controls prompts

---

## Backend Implementation

### Schema

#### Implemented tables

- `accounts`
- `account_transactions`
- `account_transfers`

Update to `expenses`:

- `accountId?: Id<"accounts">`

#### Recommended schema extensions

**`accounts`** — add when building management UI / dashboard:

```typescript
{
  // existing fields ...
  sortOrder?: number,           // dashboard / list ordering
  icon?: string,                // optional emoji or icon key
  notes?: string,               // e.g. "Joint Monzo account"
  creditLimit?: number,         // credit_card only
  includeInNetWorth?: boolean,  // default true
}
```

**`users`** — implemented for onboarding and defaults:

```typescript
{
  defaultAccountId?: Id<"accounts">,
  accountsOnboardingStatus?: "pending" | "skipped" | "completed",
}
```

**`account_transactions`** — add index for reliable history order:

```typescript
.index("by_accountId_createdAt", ["accountId", "createdAt"])
```

Same-day transactions should sort by `createdAt`, not `date` alone.

**`expenses`** — no change required for v1. Future: `users.requireAccountOnExpense` preference.

### Convex Functions

#### `accounts.ts` — implemented

| Function | Status |
| :--- | :--- |
| `list` | Done |
| `getSummary` | Done |
| `get` | Done |
| `create` | Done |
| `update` | Done |
| `archive` | Done |
| `updateBalance` | Done |
| `transfer` | Done — rejects archived and cross-currency accounts |
| `listTransactions` | Done |

#### `accounts.ts` — planned

| Function | Purpose |
| :--- | :--- |
| `listTransfers` | Transfer history with from/to account names |
| `remove` | Hard delete only when empty; otherwise archive |
| `reconcile` | Debug: verify `currentBalance` vs latest ledger entry |

#### `expenses.ts` — implemented

- Accept `accountId` on create/update (including `null` to clear).
- Return account name plus resolved account-type name, icon, color, and balance
  nature in list, get, and recent activity queries.
- Apply balance changes in create, update, and remove mutations.
- Filter list by `accountId`.

#### `users.ts`

| Function | Status | Purpose |
| :--- | :--- | :--- |
| `updateDefaultAccount` | Done | Set preferred active expense account |
| `dismissAccountsOnboarding` | Planned | Mark onboarding prompt as skipped/completed |

### Safety Rules

- Every query and mutation must filter by the authenticated user.
- Account transfers must reject same-account transfers.
- Transfer amounts must be positive.
- Starting and current balances may be zero or negative (credit card and overdraft).
- Archived accounts must not be used for new expenses or transfers.
- Balance changes must be recorded through `account_transactions`.
- `currentBalance` is a cache; the ledger (`account_transactions.balanceAfter`) is the audit trail.

**Known gaps:**

- [x] Transfers reject archived accounts
- [x] Transfers reject cross-currency accounts
- [ ] Expense edits append new ledger rows (balances correct; history can be noisy — group by expense in UI)
- [ ] No delete-account flow (archive-only for now)

---

## Frontend Implementation

### New Views

| Route | Status | Description |
| :--- | :--- | :--- |
| `/accounts` | Done | Account list, currency-aware totals, quick actions |
| `/accounts/new` | Done | Create account using an active user-owned type |
| `/accounts/[id]` | Done | Account details and transaction history |
| `/data/account-types` | Done | Manage user-owned account classifications |
| `/onboarding/accounts` | Done | Optional first-account step with persisted skip state |

### New UI Components

| Component | Status |
| :--- | :--- |
| Account form (create / edit) | Done |
| Account selector in expense form | Done |
| Balance update dialog | Done |
| Transfer dialog | Done |
| Dashboard accounts section | Done |
| Empty-state / onboarding prompt | Done |
| Expense filter by account | Done |

### Navigation

- Add **Accounts** to `PRIMARY_NAV_ITEMS` in `navigation-config.ts` (Wallet icon).
- Optional: **Accounts** entry under Settings.

### Dashboard

Show an accounts section with:

- Total active balance (respect `includeInNetWorth`)
- Active account balances
- Quick actions: add account, update balance, transfer

Account summaries must stay separate from cycle spending totals. Transfers and balance adjustments do not affect cycle charts.

---

## Rollout Order

### Phase 1 — Backend foundation ✅

1. Schema and `accounts.ts` mutations/queries.
2. Expense `accountId` support and balance sync.

### Phase 2 — Make it usable ✅

3. ~~Account management UI (`/accounts`, `/accounts/new`, `/accounts/[id]`).~~ Done.
4. ~~Nav link + expense form "Create account" when list is empty.~~ Done.
5. ~~Fix transfer archived-account guard.~~ Done; cross-currency transfers are also rejected.
6. ~~`users.defaultAccountId` + expense form default from user preference.~~ Done; the latest active expense is the fallback.

### Phase 3 — Discovery ✅

7. ~~Dashboard accounts section + `accounts.getSummary`.~~ Done.
8. ~~Post-onboarding / empty-state prompt (`accountsOnboardingStatus`).~~ Done.
9. ~~Optional `/onboarding/accounts` step (skippable).~~ Done.

Account records are intentionally not auto-created; the user explicitly chooses
the account name, type, currency, and opening balance.

### Phase 4 — Power features

11. Balance update and transfer dialogs.
12. Expense list filter by account.
13. Schema extensions: `creditLimit`, `includeInNetWorth`, `sortOrder`, `icon`.
14. Credit card sign convention (see [Expenses](#expenses)).
15. `income` transaction type.
16. Tests for balance math; update `docs/backend-documentation.md`.

### Phase 5 — Production deploy

17. Convex deploy (schema + functions).
18. Vercel deploy (web app).

---

## Deployment Plan

### Convex

Deploy schema and functions first:

```bash
pnpm --filter @spendly/backend exec convex deploy
```

Confirm the production deployment has Clerk auth configured and that generated Convex types are up to date.

### Vercel

Deploy the web app after backend deploy:

```bash
pnpm build
vercel --prod
```

Required production environment variables:

```env
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=https://spendly.akhileshdalvi.com
```

**Do not commit:** `.antigravitycli/`, `apps/native/.env`, or other local-only scaffold files alongside accounts work.
