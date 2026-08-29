# Account Types Implementation Plan

## Goal

Replace the hardcoded account type union with first-class, user-owned
`account_types` records. Users should be able to create, rename, style,
archive, and safely remove account types, while every account references
exactly one valid type owned by the same user.

This plan assumes the accounts feature has not been deployed. Implement the
final schema directly: do not add legacy fields, compatibility branches,
backfills, or transitional UI.

---

## Product Decisions

- Account types belong to one authenticated user and are never shared across
  users.
- Every account must have a required `accountTypeId`.
- New users receive a standard set of account types, but those records become
  fully user-managed after creation.
- Default types are Cash, Checking, Savings, Credit Card, Wallet, and Other.
- Users may create additional types and customize names, icons, and colors.
- Types use a stable default and creation order. Manual ordering is not exposed
  because it adds management work without changing account behavior.
- A type referenced by an account cannot be hard-deleted. It must be archived
  or reassigned first.
- Archived types remain visible on existing accounts but are unavailable when
  creating an account or changing an account's type.
- Type names must be non-empty and unique per user after trimming and
  case-normalization.
- The accounting ledger continues to store signed balances. Account type
  metadata must not silently rewrite existing balances or ledger entries.
- `balanceNature` controls presentation and reporting semantics:
  - `asset`: positive balances represent money available.
  - `liability`: negative balances represent money owed.
- Changing `balanceNature` is blocked while the type is referenced by any
  account. Users can create a new type and reassign accounts instead.

---

## Final Data Model

### `account_types`

```typescript
account_types: defineTable({
  userId: v.id("users"),
  name: v.string(),
  normalizedName: v.string(),
  icon: v.optional(v.string()),
  color: v.optional(v.string()),
  balanceNature: v.union(v.literal("asset"), v.literal("liability")),
  order: v.number(),
  isArchived: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_userId_order", ["userId", "order"])
  .index("by_userId_normalizedName", ["userId", "normalizedName"]);
```

### `accounts`

Replace the hardcoded `type` field with:

```typescript
accountTypeId: v.id("account_types")
```

Add an index for type usage checks and filtered account views:

```typescript
.index("by_accountTypeId", ["accountTypeId"])
```

Do not retain `accounts.type` or make `accountTypeId` optional.

### Default seed records

| Name | Icon key | Balance nature | Order |
| :--- | :--- | :--- | ---: |
| Cash | `banknote` | `asset` | 0 |
| Checking | `landmark` | `asset` | 1 |
| Savings | `piggy-bank` | `asset` | 2 |
| Credit Card | `credit-card` | `liability` | 3 |
| Wallet | `wallet` | `asset` | 4 |
| Other | `circle-dollar-sign` | `asset` | 5 |

Seed data is a template only. No permanent system flag is required because
users are allowed to rename, archive, or remove unused defaults.

---

## Backend API

Create `packages/backend/convex/accountTypes.ts` and keep shared validation and
normalization helpers outside the public query and mutation wrappers.

### Queries

- `list({ includeArchived? })`
  - Authenticate the user.
  - Read only the user's types through an index.
  - Return types ordered by `order`, then name.
- `get({ accountTypeId })`
  - Authenticate and verify ownership.
- `getUsage({ accountTypeId })`
  - Authenticate and verify ownership.
  - Return the number of accounts using the type so the UI can explain whether
    deletion is available.

### Mutations

- `create({ name, icon?, color?, balanceNature })`
  - Normalize and validate the name.
  - Reject duplicate normalized names for the user.
  - Append the type after the user's current maximum order.
- `update({ accountTypeId, name?, icon?, color?, balanceNature? })`
  - Verify ownership.
  - Recheck uniqueness when the name changes.
  - Reject a `balanceNature` change when any account references the type.
- `archive({ accountTypeId, isArchived })`
  - Verify ownership.
  - Preserve all existing account relationships.
- `remove({ accountTypeId })`
  - Verify ownership.
  - Delete only when no account references the type.
  - Return a specific `ACCOUNT_TYPE_IN_USE` error otherwise.
- `seedDefaults({})`
  - Be idempotent.
  - Create only missing default names for the authenticated user.
  - Share its implementation with new-user setup.

### Backend rules

- Every function must define both `args` and `returns` validators.
- Never accept `userId` from the client.
- Never trust an `accountTypeId` without checking ownership.
- Account creation and updates must reject archived or foreign account types.
- Normalize names with `trim().toLocaleLowerCase()` for uniqueness checks while
  preserving the user's display capitalization in `name`.
- Validate supported icon keys and color values before storing them.
- Use `ConvexError` codes that the frontend can map to friendly messages.
- Use indexes for ownership lists, duplicate-name checks, and usage checks;
  avoid unbounded database filters.

### Error codes

- `ACCOUNT_TYPE_NAME_REQUIRED`
- `ACCOUNT_TYPE_NAME_TAKEN`
- `ACCOUNT_TYPE_NOT_FOUND`
- `ACCOUNT_TYPE_ARCHIVED`
- `ACCOUNT_TYPE_IN_USE`
- `ACCOUNT_TYPE_BALANCE_NATURE_IN_USE`
- `ACCOUNT_TYPE_LIMIT_REACHED`
- `INVALID_ACCOUNT_TYPE_ICON`
- `INVALID_ACCOUNT_TYPE_COLOR`
- `UNAUTHENTICATED`
- `UNAUTHORIZED`

---

## Accounts Backend Integration

- Replace every account type enum validator with `v.id("account_types")`.
- Update account creation to validate that the selected type is active and
  belongs to the current user.
- Update account editing with the same validation.
- Return resolved account type data wherever an account is returned to the UI:
  - `accountTypeId`
  - `accountTypeName`
  - `accountTypeIcon`
  - `accountTypeColor`
  - `accountTypeBalanceNature`
- Update account list, detail, summary, transfer, and expense-enrichment queries.
- Keep ledger arithmetic independent from user-editable type names.
- Use `balanceNature` only for presentation, liability labels, and net-worth
  reporting rules explicitly defined by the product.
- Ensure archived account types do not remove existing accounts from history,
  summaries, filters, or detail pages.

---

## User Creation and Seeding

- Extract an internal helper such as `seedDefaultAccountTypes(ctx, userId)`.
- Call the helper from `users.create` after the user document is inserted.
- Keep the public `accountTypes.seedDefaults` mutation for recovery and local
  development.
- Make both paths idempotent by checking normalized names through the compound
  index.
- Confirm repeated calls never create duplicates or reorder customized types.

---

## Frontend Implementation

### Account type management

Add `/data/account-types` alongside Category Types and Tags.

The page must include:

- Loading, empty, populated, and error states.
- Create account type dialog.
- Edit name, icon, color, and balance nature.
- Archive and reactivate actions.
- Delete action only for unused types.
- Usage count and an explanation when deletion is blocked.
- Confirmation before archive or delete.
- Clear asset/liability descriptions in the form.

### Navigation

- Add Account Types to desktop and mobile data navigation.
- Ensure active-route behavior works for `/data/account-types` and nested state.
- Update route documentation.

### Account form

- Query active account types rather than rendering a hardcoded constant.
- Store and submit `accountTypeId`.
- Display each type's icon, color, name, and balance-nature description.
- Preselect the first ordered active type when creating an account.
- Preserve the current type when editing an account whose type is archived.
- Add an empty state with a link to `/data/account-types`.
- Do not allow selecting archived types for new assignments.

### Shared display components

- Replace the hardcoded `AccountType` union and label map.
- Change `AccountTypeIcon` to accept an icon key with a safe fallback.
- Use stored type metadata in:
  - account cards and account details;
  - dashboard account rows and summaries;
  - expense forms, tables, filters, and recent activity;
  - transfer destinations and success messages.
- Ensure missing optional icon and color values render safely.

### Liability presentation

- Keep raw signed balances unchanged.
- For liability types, label negative values as amount owed where appropriate.
- Do not hide the underlying sign in editable balance fields.
- Keep asset and liability balances separated or clearly identified in dashboard
  summaries; do not add unlike values without an explicit net-worth view.

---

## Remove Hardcoded Type Code

- Delete `ACCOUNT_TYPES` and the `AccountType` literal union.
- Delete hardcoded account type label maps.
- Delete hardcoded type-to-icon mappings.
- Remove the account type validator union from `accounts.ts`.
- Remove the account type union from `schema.ts`.
- Remove all casts from arbitrary strings to account type literals.
- Search the repository for `credit_card`, `checking`, `savings`, `wallet`,
  `cash`, and `other`; keep occurrences only in the default seed template or
  unrelated prose.

---

## Documentation Updates

- Update `docs/accounts-feature-plan.md` to make user-managed account types part
  of the implemented account model.
- Update `docs/accounts-implementation-roadmap.md` with the completed phase and
  verification evidence.
- Update `docs/backend-documentation.md` with the table, indexes, functions,
  authorization rules, and error codes.
- Update `docs/routes-documentation.md` with `/data/account-types`.
- Update product requirements wherever account types are described as a fixed
  list.

---

## Implementation Checklist

### Phase 1 — Schema and shared backend rules

- [x] Add the `account_types` table and indexes.
- [x] Replace `accounts.type` with required `accounts.accountTypeId`.
- [x] Add the `accounts.by_accountTypeId` index.
- [x] Add shared account-type validators and return validators.
- [x] Add name, icon, and color normalization helpers.
- [x] Add ownership and active-type validation helpers.
- [x] Regenerate Convex types.

### Phase 2 — Account type API

- [x] Implement `accountTypes.list`.
- [x] Implement `accountTypes.get`.
- [x] Implement `accountTypes.getUsage`.
- [x] Implement `accountTypes.create`.
- [x] Implement `accountTypes.update`.
- [x] Implement `accountTypes.archive`.
- [x] Implement `accountTypes.remove` with in-use protection.
- [x] Implement idempotent `accountTypes.seedDefaults`.
- [x] Add all documented error codes and frontend mappings.

### Phase 3 — Account and expense integration

- [x] Update account create and edit mutations to accept `accountTypeId`.
- [x] Reject foreign and archived types for new assignments.
- [x] Resolve type metadata in account list, get, and summary queries.
- [x] Resolve type metadata in expense list, get, and recent queries.
- [x] Update transfer and balance-action data shapes.
- [x] Confirm account archiving and account-type archiving preserve history.
- [x] Remove all backend hardcoded account type unions.

### Phase 4 — Seeding

- [x] Add the six default account type templates.
- [x] Extract a reusable internal seeding helper.
- [x] Seed account types during user creation.
- [x] Confirm public recovery seeding is idempotent.
- [x] Confirm customized existing types are not overwritten or reordered.

### Phase 5 — Management UI

- [x] Add `/data/account-types`.
- [x] Add desktop and mobile navigation.
- [x] Add create and edit forms.
- [x] Add icon and color selection.
- [x] Add asset/liability selection and explanatory copy.
- [x] Render types in stable default and creation order without manual controls.
- [x] Add archive and reactivate actions.
- [x] Add protected deletion with usage feedback.
- [x] Add loading, empty, error, and confirmation states.

### Phase 6 — Account-facing UI

- [x] Replace the hardcoded account type selector with live user types.
- [x] Handle no-active-type and archived-current-type states.
- [x] Update account cards and detail pages.
- [x] Update dashboard account displays.
- [x] Update expense form, history, filter, and recent activity displays.
- [x] Update transfer destination displays.
- [x] Replace hardcoded icon and label utilities.
- [x] Remove all frontend account type casts and constants.

### Phase 7 — Tests

- [x] Test that users can only read their own account types.
- [x] Test create, update, archive, reactivate, and delete.
- [x] Test case-insensitive duplicate-name rejection.
- [x] Test deletion rejection when a type is in use.
- [x] Test balance-nature change rejection when a type is in use.
- [x] Test foreign and archived type rejection during account writes.
- [x] Test default seeding and repeated idempotent seeding.
- [x] Test that each new user receives the six defaults.
- [x] Test account queries return the correct resolved type metadata.
- [x] Test that ledger balance math is unchanged after the refactor.
- [x] Test archived types remain visible on historical accounts and expenses.
- [x] Test management and account forms with keyboard navigation.
- [x] Test mobile layouts and light/dark themes.

### Phase 8 — Verification and documentation

- [x] Run `pnpm --filter web exec next typegen`.
- [x] Run `pnpm --filter web exec tsc --noEmit`.
- [x] Run the Convex TypeScript check with its explicit project config.
- [x] Run focused Ultracite checks on every changed file.
- [x] Run the production web build.
- [x] Run `git diff --check`.
- [x] Complete the account-type acceptance tests below.
- [x] Update all related documentation.
- [x] Confirm no hardcoded account type implementation remains.

---

## Acceptance Tests

1. [x] Create a new user and confirm exactly six default account types appear in the
   documented order.
2. [x] Create a custom asset type and a custom liability type.
3. [x] Rename, recolor, and re-icon both custom types.
4. [x] Confirm another user cannot read, update, archive, or assign them.
5. [x] Create an account using a custom type and confirm every account and expense
   view displays its current metadata.
6. [x] Archive the type and confirm existing records still display it while new
   account assignments cannot select it.
7. [x] Reactivate the type and confirm it becomes selectable again.
8. [x] Attempt to delete an in-use type and confirm the UI explains why deletion is
   blocked.
9. [x] Reassign or remove all accounts using that type, then delete it successfully.
10. [x] Attempt to change the balance nature of an in-use type and confirm it is
    rejected without changing ledger data.
11. [x] Run default seeding repeatedly and confirm no duplicates or ordering changes
    occur.
12. [x] Create, edit, archive, and reactivate accounts after the refactor and confirm
    expense balance synchronization still works.
13. [x] Verify long names, missing icons, missing colors, negative balances, and
    multiple currencies across desktop and mobile layouts.
14. [x] Verify the complete flow using keyboard navigation in both light and dark
    themes.

---

## Definition of Done

- `account_types` is the only source of account classification.
- Every account references one active or historically valid user-owned type.
- Users can fully manage their types without breaking referenced accounts.
- Default type seeding is automatic and idempotent.
- No hardcoded account type enums, labels, icons, or unsafe casts remain outside
  the seed template.
- Account, expense, dashboard, and transfer experiences all use resolved type
  metadata.
- Authorization, validation, ledger regression, UI, and acceptance tests pass.
- TypeScript, Ultracite, production build, and documentation checks pass.
