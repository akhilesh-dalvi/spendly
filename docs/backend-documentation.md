# Backend Documentation (Convex)

Spendy uses **Convex** as its backend-as-a-service, providing a real-time database, serverless functions, and seamless integration with authentication providers.

---

## 1. Data Model (Schema)

The database schema is defined in `packages/backend/convex/schema.ts`.

### Tables

| Table            | Description                                | Key Fields                                            | Validation Rules                           |
| :--------------- | :----------------------------------------- | :---------------------------------------------------- | :----------------------------------------- |
| `users`          | Local record of users synced from Clerk    | `clerkId`, `email`, `currency`, `createdAt`           | Currency must be valid ISO code            |
| `expense_cycles` | Time-bounded periods for grouping expenses | `userId`, `name`, `startDate`, `endDate`              | No overlaps, startDate < endDate           |
| `category_types` | User-defined semantic groupings            | `userId`, `name`, `order`                             | Name required, order >= 0                  |
| `categories`     | Cycle-scoped spending intents              | `cycleId`, `userId`, `name`, `plannedAmount`, `order` | plannedAmount nullable, order >= 0         |
| `expenses`       | Atomic spending records                    | `userId`, `cycleId`, `categoryId`, `amount`, `date`   | amount any decimal, date ISO string        |
| `tags`           | Global optional metadata                   | `userId`, `name`                                      | Name required, unique per user recommended |

### Detailed Field Specifications

#### `users`

```typescript
{
  clerkId: string,           // Unique Clerk user identifier
  email: string,             // User's email (for display)
  currency: string,          // ISO currency code (USD, EUR, INR, etc.)
  createdAt: number          // Timestamp
}
```

#### `expense_cycles`

```typescript
{
  userId: Id<"users">,
  name: string,              // e.g., "January 2025", "Q1 Budget"
  startDate: string,         // ISO date (YYYY-MM-DD), inclusive
  endDate: string,           // ISO date (YYYY-MM-DD), exclusive
  createdAt: number
}
```

**Validation:**

- `startDate < endDate`
- No overlaps: For any existing cycle, NOT (`newStart < existingEnd AND existingStart < newEnd`)
- Dates must be valid ISO strings

#### `category_types`

```typescript
{
  userId: Id<"users">,
  name: string,              // e.g., "Needs", "Wants", "Savings"
  order: number,             // For user-defined sorting (0, 1, 2...)
  createdAt: number
}
```

#### `categories`

```typescript
{
  cycleId: Id<"expense_cycles">,
  userId: Id<"users">,       // Denormalized for global queries
  name: string,              // e.g., "Groceries", "Rent"
  categoryTypeId: Id<"category_types"> | null,  // null = Uncategorized
  plannedAmount: number | null,  // null or 0 = no plan
  order: number,             // For sorting within cycle
  createdAt: number
}
```

**Validation:**

- `plannedAmount` can be any number >= 0 or null
- null and 0 both treated as "no plan" in aggregations

#### `expenses`

```typescript
{
  userId: Id<"users">,
  cycleId: Id<"expense_cycles"> | null,  // null if date outside all cycles
  categoryId: Id<"categories"> | null,    // null = Uncategorized
  amount: number,            // Can be negative (refunds), decimals allowed
  date: string,              // ISO date (YYYY-MM-DD)
  spentOn: string | null,    // Optional note/description
  tagIds: Id<"tags">[],      // Array of tag references
  createdAt: number
}
```

**Validation:**

- `amount`: Any decimal, no hard limits (soft warning > 10000 in UI)
- `date`: Valid ISO string, can be past or future
- `cycleId`: Auto-assigned based on date, can be null temporarily

#### `tags`

```typescript
{
  userId: Id<"users">,
  name: string,              // e.g., "Work Trip", "Recurring"
  createdAt: number
}
```

### Key Indexes

| Table            | Index Name        | Fields                           | Query Pattern               |
| ---------------- | ----------------- | -------------------------------- | --------------------------- |
| `users`          | `by_clerkId`      | `clerkId`                        | Find user by Clerk identity |
| `expense_cycles` | `by_userId`       | `userId`                         | List all cycles for user    |
| `expense_cycles` | `by_userId_dates` | `userId`, `startDate`, `endDate` | Find cycle containing date  |
| `category_types` | `by_userId`       | `userId`                         | List all types for user     |
| `category_types` | `by_userId_order` | `userId`, `order`                | Sorted type list            |
| `categories`     | `by_cycleId`      | `cycleId`                        | Categories in a cycle       |
| `categories`     | `by_userId`       | `userId`                         | All categories for user     |
| `expenses`       | `by_cycleId`      | `cycleId`                        | Expenses in a cycle         |
| `expenses`       | `by_categoryId`   | `categoryId`                     | Expenses in a category      |
| `expenses`       | `by_userId_date`  | `userId`, `date`                 | Date-range queries          |
| `tags`           | `by_userId`       | `userId`                         | All tags for user           |

---

## 2. Authentication

Authentication is handled by **Clerk**. Convex verifies the Clerk JWT.

### User Sync Flow

1. User signs up/logs in via Clerk
2. Web/mobile app calls `api.users.create` on first authenticated load
3. Function checks if user exists by `clerkId`:
   - If exists: Return existing user
   - If not: Create new user record with default currency (USD)

### Security

- All mutations/queries use `getCurrentUser()` helper
- Throws `ConvexError` if not authenticated
- `userId` automatically filtered on all queries
- No cross-user data access possible

---

## 3. API Reference

### 3.1 Users (`users.ts`)

#### `get()`

Returns current authenticated user profile.

**Returns:**

```typescript
{
  _id: Id<"users">,
  clerkId: string,
  email: string,
  currency: string,
  createdAt: number
}
```

**Errors:**

- `UNAUTHENTICATED`: No valid session

---

#### `create()`

Creates or returns existing user from Clerk identity.

**Returns:** Same as `get()`

**Side Effects:**

- First-time users get default currency: "USD"
- Optional: Seed default category types

---

#### `updateCurrency(args: { currency: string })`

Updates user's preferred currency symbol.

**Args:**

- `currency`: ISO currency code (e.g., "USD", "EUR", "INR")

**Returns:** Updated user object

**Validation:**

- Currency must be non-empty string (validation for valid ISO codes optional)

---

### 3.2 Expense Cycles (`cycles.ts`)

#### `list()`

Returns all cycles for the user, newest first.

**Returns:**

```typescript
Array<{
  _id: Id<"expense_cycles">;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: number;
}>;
```

**Sorting:** `ORDER BY startDate DESC`

---

#### `get(args: { cycleId: Id<"expense_cycles"> })`

Returns a single cycle by ID.

**Returns:** Single cycle object

**Errors:**

- `NOT_FOUND`: Cycle doesn't exist
- `UNAUTHORIZED`: Cycle belongs to different user

---

#### `getCurrent(args?: { date?: string })`

Returns the cycle containing the given date (defaults to today).

**Args:**

- `date` (optional): ISO date string (YYYY-MM-DD), defaults to today

**Returns:** Cycle object or `null` if no matching cycle

**Logic:**

```typescript
// Find cycle where: startDate <= date < endDate
WHERE startDate <= date AND date < endDate AND userId = currentUserId
```

---

#### `create(args)`

Creates a new expense cycle.

**Args:**

```typescript
{
  name: string,
  startDate: string,      // ISO date (YYYY-MM-DD)
  endDate: string,        // ISO date (YYYY-MM-DD)
  copyFromCycleId?: Id<"expense_cycles">,  // Optional
  includePlannedAmounts?: boolean          // Optional, default false
}
```

**Returns:** New cycle object with `_id`

**Validation:**

1. `startDate < endDate`
2. No overlap with existing cycles:
   ```typescript
   // Overlap if: newStart < existingEnd AND existingStart < newEnd
   const overlapping = cycles.find(
     (c) => newStart < c.endDate && c.startDate < newEnd,
   );
   if (overlapping) throw new Error("CYCLE_OVERLAP");
   ```

**Side Effects (if `copyFromCycleId` provided):**

1. Fetch categories from source cycle
2. Create new categories in new cycle with:
   - Same `name`
   - Same `categoryTypeId`
   - Same `order`
   - `plannedAmount`: Copied if `includePlannedAmounts === true`, else null

**Errors:**

- `INVALID_DATE_RANGE`: startDate >= endDate
- `CYCLE_OVERLAP`: New cycle overlaps existing cycle
- `SOURCE_NOT_FOUND`: copyFromCycleId doesn't exist

---

#### `update(args)`

Modifies cycle metadata.

**Args:**

```typescript
{
  cycleId: Id<"expense_cycles">,
  name?: string,
  startDate?: string,
  endDate?: string
}
```

**Returns:** Updated cycle object

**Validation:** Same overlap check as `create()`

**Side Effects:**

- If dates change, expenses may need re-assignment (handled by `expenses.update`)

**Errors:**

- `NOT_FOUND`: Cycle doesn't exist
- `INVALID_DATE_RANGE`: New dates invalid
- `CYCLE_OVERLAP`: Updated dates cause overlap

---

#### `remove(args: { cycleId: Id<"expense_cycles"> })`

Deletes a cycle.

**Args:**

- `cycleId`: ID of cycle to delete

**Returns:** `{ success: true }`

**Validation:**

1. Check if any expenses reference this cycle
2. If yes: `throw new Error("CYCLE_HAS_EXPENSES")`
3. If categories exist (but no expenses): Show warning count in error

**Cascade Behavior:**

- Deletes all categories in the cycle
- Does NOT delete expenses (should be caught by validation)

**Errors:**

- `NOT_FOUND`: Cycle doesn't exist
- `CYCLE_HAS_EXPENSES`: Cannot delete cycle with expenses (count included)

---

### 3.3 Categories (`categories.ts`)

#### Category Types

##### `listTypes()`

Returns all category types for the user, sorted by order.

**Returns:**

```typescript
Array<{
  _id: Id<"category_types">;
  name: string;
  order: number;
  createdAt: number;
}>;
```

**Sorting:** `ORDER BY order ASC`

---

##### `createType(args: { name: string, order?: number })`

Creates a new category type.

**Args:**

- `name`: Required
- `order`: Optional, auto-assigned as `max(order) + 1` if not provided

**Returns:** New type object

---

##### `updateType(args)`

Updates a category type.

**Args:**

```typescript
{
  typeId: Id<"category_types">,
  name?: string,
  order?: number
}
```

**Returns:** Updated type

---

##### `deleteType(args: { typeId: Id<"category_types"> })`

Deletes a category type.

**Returns:** `{ success: true }`

**Side Effects:**

- All categories with this `categoryTypeId` get set to `null` (become Uncategorized)

**No validation** (can delete even if categories reference it)

---

##### `seedDefaults()`

Initializes default types for new users.

**Returns:** Array of created types

**Default Types:**

1. "Needs" (order: 0)
2. "Wants" (order: 1)
3. "Savings" (order: 2)

**Logic:** Only creates if user has no existing types

---

#### Cycle-Scoped Categories

##### `list(args: { cycleId: Id<"expense_cycles"> })`

Returns all categories for a specific cycle.

**Returns:**

```typescript
Array<{
  _id: Id<"categories">;
  name: string;
  categoryTypeId: Id<"category_types"> | null;
  plannedAmount: number | null;
  order: number;
  createdAt: number;
  // Joined data:
  typeName?: string; // Name of category type, if exists
}>;
```

**Sorting:** `ORDER BY order ASC`

---

##### `create(args)`

Creates a new category within a cycle.

**Args:**

```typescript
{
  cycleId: Id<"expense_cycles">,
  name: string,
  categoryTypeId?: Id<"category_types"> | null,
  plannedAmount?: number | null,
  order?: number
}
```

**Returns:** New category object

**Defaults:**

- `categoryTypeId`: null
- `plannedAmount`: null
- `order`: `max(order in cycle) + 1`

**Validation:**

- `cycleId` must exist and belong to user
- `categoryTypeId` must exist and belong to user (if provided)

---

##### `update(args)`

Updates a category.

**Args:**

```typescript
{
  categoryId: Id<"categories">,
  name?: string,
  categoryTypeId?: Id<"category_types"> | null,
  plannedAmount?: number | null,
  order?: number
}
```

**Returns:** Updated category

**Note:** Changes only affect this cycle, not other cycles

---

##### `remove(args: { categoryId: Id<"categories"> })`

Deletes a category.

**Returns:** `{ success: true, affectedExpenses: number }`

**Side Effects:**

1. Find all expenses with `categoryId === this category`
2. Set their `categoryId` to `null` (become Uncategorized)
3. Return count of affected expenses

**No validation** (always succeeds, even with expenses)

---

### 3.4 Expenses (`expenses.ts`)

#### `list(args?)`

Lists expenses with optional filtering.

**Args (all optional):**

```typescript
{
  cycleId?: Id<"expense_cycles">,     // Filter by cycle
  categoryId?: Id<"categories">,      // Filter by category
  startDate?: string,                 // ISO date
  endDate?: string,                   // ISO date
  tagIds?: Id<"tags">[],             // Filter by tags (AND logic)
  limit?: number,                     // Default 100
  offset?: number                     // For pagination
}
```

**Returns:**

```typescript
Array<{
  _id: Id<"expenses">;
  amount: number;
  date: string;
  spentOn: string | null;
  categoryId: Id<"categories"> | null;
  cycleId: Id<"expense_cycles"> | null;
  tagIds: Id<"tags">[];
  createdAt: number;
  // Joined data:
  categoryName: string | null;
  cycleName: string | null;
  tagNames: string[];
}>;
```

**Sorting:** `ORDER BY date DESC, createdAt DESC`

---

#### `listRecent(args?: { limit?: number })`

Returns most recent expenses with pre-joined metadata.

**Args:**

- `limit`: Default 5

**Returns:** Same as `list()` with all joins

**Optimization:** Pre-joins category and cycle names for dashboard display

---

#### `get(args: { expenseId: Id<"expenses"> })`

Returns a single expense by ID.

**Returns:** Single expense with joined data

**Errors:**

- `NOT_FOUND`: Expense doesn't exist
- `UNAUTHORIZED`: Expense belongs to different user

---

#### `create(args)`

Creates a new expense.

**Args:**

```typescript
{
  amount: number,              // Required, can be negative
  categoryId?: Id<"categories"> | null,  // Optional, default null
  date?: string,               // ISO date, default today
  spentOn?: string | null,     // Optional description
  tagIds?: Id<"tags">[]        // Optional tags
}
```

**Returns:** New expense object with `_id`

**Logic:**

1. Default `date` to today if not provided
2. Find `cycleId` by date:
   ```typescript
   cycleId = findCycle(date) ?? null;
   ```
3. Validate `categoryId` belongs to user (if provided)
4. Validate category's cycle matches derived cycleId (if both exist)
5. Insert expense

**Validation:**

- `amount`: No hard limits (UI warns if > 10000)
- `date`: Must be valid ISO string
- `categoryId`: Must exist and belong to user
- Category's `cycleId` must match expense's derived `cycleId`

**Errors:**

- `INVALID_DATE`: Date format invalid
- `INVALID_CATEGORY`: Category doesn't exist or belongs to different user
- `CATEGORY_CYCLE_MISMATCH`: Category belongs to different cycle than expense date

**Soft Warnings (returned in response, not errors):**

- `LARGE_AMOUNT`: amount > 10000
- `OLD_DATE`: date > 90 days in past
- `FUTURE_DATE`: date > 30 days in future
- `NO_CYCLE`: No cycle exists for date (suggest creating one)

---

#### `update(args)`

Updates an existing expense.

**Args:**

```typescript
{
  expenseId: Id<"expenses">,
  amount?: number,
  categoryId?: Id<"categories"> | null,
  date?: string,
  spentOn?: string | null,
  tagIds?: Id<"tags">[]
}
```

**Returns:** Updated expense object

**Logic:**

1. If `date` changed: Re-calculate `cycleId`
2. If `categoryId` changed: Validate category exists
3. Validate category's cycle matches new cycleId (if both exist)

**Side Effects:**

- Changing `date` may move expense to different cycle
- Aggregations update in real-time

**Errors:** Same as `create()`

---

#### `remove(args: { expenseId: Id<"expenses"> })`

Deletes an expense.

**Returns:** `{ success: true }`

**No validation** (always succeeds if expense exists and belongs to user)

---

### 3.5 Tags (`tags.ts`)

#### `list()`

Returns all tags for the user.

**Returns:**

```typescript
Array<{
  _id: Id<"tags">;
  name: string;
  createdAt: number;
}>;
```

**Sorting:** `ORDER BY name ASC`

---

#### `create(args: { name: string })`

Creates a new tag.

**Returns:** New tag object

**Validation:** Name must be non-empty

---

#### `update(args: { tagId: Id<"tags">, name: string })`

Updates a tag name.

**Returns:** Updated tag

---

#### `remove(args: { tagId: Id<"tags"> })`

Deletes a tag.

**Returns:** `{ success: true }`

**Side Effects:**

- All expenses referencing this tag have it removed from their `tagIds` array

---

### 3.6 Aggregations (`aggregations.ts`)

#### `getCycleSummary(args: { cycleId: Id<"expense_cycles"> })`

Primary data source for dashboard and cycle detail views.

**Returns:**

```typescript
{
  cycleId: Id<"expense_cycles">,
  cycleName: string,
  startDate: string,
  endDate: string,
  totalSpent: number,
  totalPlanned: number,        // Sum of non-null planned amounts only
  remaining: number,            // totalPlanned - totalSpent
  daysRemaining: number | null, // null if cycle ended
  categoryStats: Array<{
    categoryId: Id<"categories">,
    name: string,
    typeId: Id<"category_types"> | null,
    typeName: string | null,
    planned: number | null,
    spent: number,
    diff: number | null,       // planned - spent (null if no plan)
    progress: number | null    // (spent / planned) * 100 (null if no plan)
  }>,
  typeStats: Array<{
    typeId: Id<"category_types"> | null,
    typeName: string,          // "Uncategorized" if null
    totalPlanned: number,
    totalSpent: number,
    categories: [...categoryStats from above...]
  }>
}
```

**Logic:**

1. Fetch cycle details
2. Fetch all categories in cycle
3. For each category:
   - Sum expenses: `spent = SUM(expenses.amount WHERE categoryId = category.id)`
   - Calculate `diff = planned - spent` (only if planned !== null)
   - Calculate `progress = (spent / planned) * 100` (only if planned !== null && planned > 0)
4. Group by category type for `typeStats`
5. Calculate cycle-level totals:
   - `totalSpent = SUM(all expenses in cycle)`
   - `totalPlanned = SUM(categories.plannedAmount WHERE plannedAmount !== null)`
   - `remaining = totalPlanned - totalSpent`
   - `daysRemaining = endDate - today` (null if endDate < today)

**Performance:** Uses indexed queries and single-pass aggregation

---

#### `compareMultiple(args: { cycleIds: Id<"expense_cycles">[] })`

Comparison data for multiple cycles.

**Args:**

- `cycleIds`: Array of 2-5 cycle IDs

**Returns:**

```typescript
Array<{
  cycleId: Id<"expense_cycles">;
  cycleName: string;
  startDate: string;
  endDate: string;
  totalSpent: number;
  totalPlanned: number;
  categoryBreakdown: Array<{
    categoryName: string;
    spent: number;
    planned: number | null;
  }>;
}>;
```

**Validation:**

- Minimum 2 cycles
- Maximum 5 cycles
- All cycles must belong to user

**Note:** Categories are NOT matched across cycles - each cycle's categories listed independently

---

## 4. Error Handling

### Error Response Format

All mutations return:

```typescript
{
  success: boolean,
  data?: T,                    // On success
  error?: string,              // On failure
  warnings?: string[]          // Soft warnings (don't block)
}
```

### Error Codes

| Code                      | Description                          | HTTP Equivalent |
| ------------------------- | ------------------------------------ | --------------- |
| `UNAUTHENTICATED`         | No valid session                     | 401             |
| `UNAUTHORIZED`            | Resource belongs to different user   | 403             |
| `NOT_FOUND`               | Resource doesn't exist               | 404             |
| `VALIDATION_ERROR`        | Input validation failed              | 400             |
| `CYCLE_OVERLAP`           | Cycle dates overlap existing cycle   | 409             |
| `CYCLE_HAS_EXPENSES`      | Cannot delete cycle with expenses    | 409             |
| `INVALID_DATE_RANGE`      | Start date >= end date               | 400             |
| `INVALID_DATE`            | Date format invalid                  | 400             |
| `INVALID_CATEGORY`        | Category doesn't exist or wrong user | 400             |
| `CATEGORY_CYCLE_MISMATCH` | Category belongs to different cycle  | 400             |
| `SOURCE_NOT_FOUND`        | Copy source cycle doesn't exist      | 404             |

### Warning Codes (Non-Blocking)

Returned in `warnings` array, don't prevent operation:

| Code            | Trigger               | Suggested Action                          |
| --------------- | --------------------- | ----------------------------------------- |
| `LARGE_AMOUNT`  | amount > 10000        | "That's a big expense! Double-check?"     |
| `OLD_DATE`      | date > 90 days ago    | "This is from X months ago. Correct?"     |
| `FUTURE_DATE`   | date > 30 days future | "This is a future date. Is this planned?" |
| `NO_CYCLE`      | No cycle for date     | "Create cycle for [month]?"               |
| `UNCATEGORIZED` | categoryId = null     | "Uncategorized expense"                   |

---

## 5. Helper Functions (`helpers.ts`)

### `getCurrentUser(ctx: QueryCtx | MutationCtx)`

Returns current authenticated user or throws.

**Returns:** Full user object

**Throws:** `ConvexError("UNAUTHENTICATED")` if no session

---

### `getCurrentUserOrNull(ctx: QueryCtx)`

Returns current user or null (for public pages).

**Returns:** User object or `null`

---

### `findCycleForDate(ctx, userId, date)`

Finds the cycle containing a given date.

**Args:**

- `userId`: User ID
- `date`: ISO date string

**Returns:** Cycle object or `null`

**Logic:**

```typescript
WHERE userId = userId
  AND startDate <= date
  AND date < endDate
LIMIT 1
```

---

### `validateCycleOwnership(ctx, cycleId, userId)`

Checks if cycle belongs to user, throws if not.

**Throws:** `ConvexError("UNAUTHORIZED")` if ownership mismatch

---

### `validateCategoryOwnership(ctx, categoryId, userId)`

Checks if category belongs to user, throws if not.

**Throws:** `ConvexError("UNAUTHORIZED")` if ownership mismatch

---

### `checkCycleOverlap(ctx, userId, startDate, endDate, excludeCycleId?)`

Checks for overlapping cycles.

**Returns:** Overlapping cycle or `null`

**Logic:**

```typescript
// Overlap if: newStart < existingEnd AND existingStart < newEnd
WHERE userId = userId
  AND startDate < endDate
  AND startDate < newEnd
  AND id != excludeCycleId
```

---

## 6. Real-Time Subscriptions

All queries are **reactive by default** in Convex. Changes propagate instantly:

### Subscription Patterns

**Dashboard:**

```typescript
// Automatically updates when expenses/categories/cycles change
const summary = useQuery(api.aggregations.getCycleSummary, { cycleId });
```

**Expense List:**

```typescript
// Live updates as expenses are added/edited/deleted
const expenses = useQuery(api.expenses.list, { cycleId });
```

**Category List:**

```typescript
// Live updates as categories change
const categories = useQuery(api.categories.list, { cycleId });
```

### Performance Considerations

- Indexes optimize common queries (by_userId, by_cycleId, by_date)
- Aggregations computed on-demand (cached by Convex)
- Large lists (>1000 expenses) should use pagination

---

## 7. Configuration

### Environment Variables

| Variable                  | Purpose               | Example                               |
| ------------------------- | --------------------- | ------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk JWT validation  | `https://your-app.clerk.accounts.dev` |
| `CONVEX_DEPLOYMENT`       | Deployment identifier | `prod` or `dev`                       |

### Auth Config (`auth.config.ts`)

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

---

## 8. Data Migration Strategy (Future)

Not implemented in MVP, but considerations:

### Schema Versioning

- Add `schemaVersion` field to tables
- Migration functions triggered on version mismatch
- Backward-compatible reads

### Example Migration

```typescript
// migration_001_add_order_to_categories.ts
export default mutation(async (ctx) => {
  const categories = await ctx.db.query("categories").collect();

  for (const [index, category] of categories.entries()) {
    if (category.order === undefined) {
      await ctx.db.patch(category._id, { order: index });
    }
  }
});
```

---

## 9. Testing Strategy

### Unit Tests (Functions)

- Test validation logic in isolation
- Mock Convex context
- Focus on edge cases (overlaps, nulls, negatives)

### Integration Tests (E2E)

- Full mutation flows (create cycle → add categories → add expenses)
- Cross-table consistency (delete category → expenses uncategorized)
- Real-time update verification

### Test Data Factories

```typescript
const testCycle = {
  name: "Test January",
  startDate: "2025-01-01",
  endDate: "2025-02-01",
};

const testExpense = {
  amount: 100,
  date: "2025-01-15",
  categoryId: testCategory._id,
};
```

---

## 10. Performance Benchmarks (Target)

| Operation                    | Target  | Notes                  |
| ---------------------------- | ------- | ---------------------- |
| `expenses.create`            | < 100ms | Single write           |
| `expenses.list` (100 items)  | < 200ms | Indexed query          |
| `getCycleSummary`            | < 300ms | Aggregation with joins |
| `compareMultiple` (3 cycles) | < 500ms | Multiple aggregations  |
| Real-time update propagation | < 500ms | Convex push            |

---

## Appendix: Common Query Patterns

### Get Current Cycle with Summary

```typescript
const currentCycle = useQuery(api.cycles.getCurrent);
const summary = useQuery(
  api.aggregations.getCycleSummary,
  currentCycle ? { cycleId: currentCycle._id } : "skip",
);
```

### List Expenses with Filters

```typescript
const expenses = useQuery(api.expenses.list, {
  cycleId: selectedCycleId,
  startDate: "2025-01-01",
  endDate: "2025-01-31",
  limit: 50,
});
```

### Create Expense with Auto-Cycle

```typescript
const createExpense = useMutation(api.expenses.create);

await createExpense({
  amount: 50.0,
  date: "2025-01-15", // Cycle auto-detected
  categoryId: groceriesCategoryId,
  spentOn: "Weekly groceries",
});
```

### Copy Categories to New Cycle

```typescript
const createCycle = useMutation(api.cycles.create);

await createCycle({
  name: "February 2025",
  startDate: "2025-02-01",
  endDate: "2025-03-01",
  copyFromCycleId: januaryCycleId,
  includePlannedAmounts: true,
});
```
