# Product Requirements Document (PRD)

## Product Name

**Spendly**

---

## 1. Product Definition

Spendly is a flexible expense-tracking app that helps users observe, plan, and compare spending across time without enforcing financial rules, discipline, or perfection.

---

## 2. Product Principles

1. No income tracking
2. No hard validation or enforcement
3. Planning is optional
4. Historical data is editable
5. All structures are user-defined
6. Comparison is observational, not judgmental
7. Backend is the single source of truth
8. **Guide users, don't constrain them**
9. **Smart defaults, flexible overrides**

---

## 3. Target User

- Individuals tracking personal expenses
- Users with irregular income or spending
- Users who want insight, not discipline
- Mobile and web users

---

## 4. Supported Platforms

- Web: Next.js
- Mobile: Expo
- Backend: Convex
- Architecture: Monorepo

---

## 5. Core Domain Model

### 5.1 Expense Cycle

A time-bounded period used for grouping expenses and plans.

**Fields**

- `id`
- `name`
- `startDate` (ISO date string, YYYY-MM-DD)
- `endDate` (ISO date string, YYYY-MM-DD)
- `createdAt`

**Rules**

- Cycles must not overlap
- End date is **inclusive** (cycle includes startDate through endDate)
- Example: Cycle A (Jan 1 - Jan 31) includes Jan 31, Cycle B (Feb 1 - Feb 28) starts Feb 1
- Expense cycle is derived from expense date
- Past cycles are readable and editable
- Future cycles are fully editable
- Cycle names need not be unique (user may have "January" for multiple years)

**Naming Conventions**

- Auto-suggest based on date range:
  - Same month: "January 2025"
  - Spans months: "Jan-Feb 2025"
- User can override with custom names

**Deletion Rules**

- Cycles with no categories/expenses: Delete freely
- Cycles with categories but no expenses: Warn "This will delete X categories. Continue?"
- Cycles with expenses: Block deletion (future: offer archive feature)

### 5.2 Category Type

User-defined semantic grouping for organizational purposes.

**Fields**

- `id`
- `name`
- `order` (integer, for user-defined sorting)
- `createdAt`

**Rules**

- Fully CRUD-able
- No system-defined types
- User can reorder types
- Deleting a type does not delete categories (categoryTypeId becomes null)

**Default Seed (Optional)**

- On first login, optionally seed: "Needs", "Wants", "Savings"
- User can modify or delete these immediately

### 5.3 Category (Cycle-Scoped)

Represents spending intent within a cycle.

**Fields**

- `id`
- `name`
- `categoryTypeId` (nullable - if null, shows as "Uncategorized" in UI)
- `plannedAmount` (nullable - null and 0 both treated as "no plan")
- `order` (integer, for user-defined sorting within cycle)
- `cycleId`
- `createdAt`

**Rules**

- Category belongs to exactly one cycle
- Planned amount is optional (null = no plan, 0 = no plan)
- Categories are editable in all cycles (past, present, future)
- Renaming a category affects only that cycle
- User can reorder categories within a cycle
- Category names need not be unique (user can have multiple "Food" categories)

**Uncategorized Handling**

- Categories without a `categoryTypeId` appear under "Uncategorized" group in UI
- No database record for "Uncategorized" - purely a UI grouping

**Deletion Rules**

- When a category is deleted, all its expenses have `categoryId` set to null
- Expenses become "uncategorized" and can be bulk-reassigned later
- UI shows warning: "X expenses will become uncategorized. Continue?"

### 5.4 Tag

Optional metadata for additional context.

**Fields**

- `id`
- `name`
- `createdAt`

**Rules**

- Global across cycles
- Never required
- No uniqueness constraint (though unlikely to have duplicates)
- Example use cases: "Work Trip", "Recurring", "Emergency", "Gift"

**Usage**

- Expenses can have 0 to N tags
- Filterable in expense history
- Not shown in comparison mode (too granular for MVP)

### 5.5 Expense

Atomic spending record.

**Fields**

- `id`
- `amount` (decimal, can be negative for refunds/returns)
- `categoryId` (nullable - null = uncategorized)
- `cycleId` (derived from date, denormalized for performance)
- `date` (ISO date string, YYYY-MM-DD)
- `spentOn` (optional description/note)
- `tagIds` (array, optional)
- `createdAt`

**Rules**

- Expense cycle is derived from date (automatically assigned based on which cycle contains the date)
- Expenses are fully editable in any cycle (past, present, future)
- Editing date may move expense across cycles (`cycleId` updates automatically)
- Amount validation:
  - Maximum 2 decimal places (auto-round if more entered)
  - Can be $0 (free items, reimbursements)
  - Can be negative (refunds, returns - shown with minus prefix)
  - Soft warning if > $10,000: "That's a big expense! Double-check?"
  - No hard maximum limit
- Date validation:
  - Future dates allowed (for planned bills)
  - Soft warning if > 90 days old: "This is from [X months ago]. Correct?"
  - No hard constraints

**Expense Without Valid Cycle**

- If date falls outside all cycles:
  - Show preview: "No cycle exists for [date]. Create one now?"
  - Allow expense creation, prompt cycle creation immediately after
  - Expense temporarily has `cycleId = null` until cycle is created

---

## 6. Core Functional Flows (UI-Neutral)

### 6.1 Add Expense

**Required**

- `amount`
- category (or leave uncategorized)

**Optional**

- `date` (default: today)
- `spentOn` (note/description)
- `tags`

**Smart Defaults**

- Category: Pre-select most recently used category
- Date: Today
- Show cycle preview: "This will be added to **[Cycle Name]**"

**Rules**

- Expense creation must succeed with minimal inputs
- No validation against planned amounts
- No blocking behavior
- If date is outside all cycles, prompt to create cycle (non-blocking)

**Mobile Quick Add Mode**

- **Quick tab**: Amount + Category (pre-filled), one-tap submit
- **Details tab**: Full form with all fields
- Default to Quick mode

### 6.2 Manage Categories

**Create**

- Name required
- Type optional (defaults to uncategorized)
- Planned amount optional (null = no plan)
- Order auto-assigned (can be reordered later)

**Edit**

- Allowed for all cycles (past, present, future)
- No propagation across cycles
- User can reorder categories via drag-and-drop or move up/down

**Delete**

- Allowed regardless of expense count
- Expenses with deleted category become uncategorized (`categoryId = null`)
- Show warning: "X expenses will become uncategorized. Continue?"

### 6.3 Planned Amount Management

- Planned amount is cycle-scoped
- Editable in any cycle (past, present, future)
- No enforcement or validation against spending
- `null` and `0` both treated as "no plan"
- In aggregations, only non-null planned amounts are summed

### 6.4 Expense Cycle Management

**Create New Cycle**

- Name, start date, end date required
- Auto-suggest name based on date range (user can override)
- Cycles must not overlap (exclusive end dates)
- Validation: `startDate < endDate`

**Cycle Date Validation**

- Overlap check: `newStart < existingEnd AND existingStart < newEnd`
- Adjacent cycles allowed: Cycle A ends Feb 1, Cycle B starts Feb 1 (no overlap)

**Initialize Categories (Optional)**

- Option 1: Start empty
- Option 2: Copy from previous cycle
  - Show modal: "Copy X categories from [Previous Cycle]?"
  - Checkbox: "Include planned amounts ($X total)"
  - Allow inline editing before confirming
  - Copies: names, types, planned amounts (if checkbox selected), order

**Update Cycle**

- Can edit name, start date, end date
- Re-validate for overlaps
- Expenses automatically reassign to new cycles if dates change

**Delete Cycle**

- See deletion rules in 5.1

---

## 7. Onboarding (MVP)

### 7.1 Onboarding Goals

- Establish correct mental model
- Reduce blank-state friction
- Avoid financial advice or discipline framing

### 7.2 Step 1 — Choose How to Start

User selects one option:

1. **Start tracking freely**
   - Skip category setup, jump straight to expense logging
2. **Plan & track**
   - Set up categories and optional planned amounts

**Rules**

- Default: Start tracking freely
- Choice affects initial flow only
- No features are locked by this choice

### 7.3 Step 2 — Create First Expense Cycle

**Required**

- Cycle name (auto-suggested based on current month)
- Start date (default: first of current month)
- End date (default: last of current month)

**Explanation**

- Simple description: "A cycle is a time period to organize your expenses—like a month or pay period."

### 7.4 Step 3 — Categories (Plan & Track Only)

- Add categories for the cycle
- Optionally assign to category types
- Planned amounts optional
- Skip allowed (can add categories later)

---

## 8. High-Level Routes & Navigation (MVP)

### 8.1 Public (Marketing)

**Layout:** Marketing (Header, Footer, Hero)

- `/` — Landing Page (Value prop, "Get Started")
  - _Redirects to `/dashboard` if user is logged in._
- `/login` — Authentication entry (Clerk)
- `/signup` — Registration (Clerk)

### 8.2 App Shell (Authenticated)

**Layout:** App Shell (Sidebar/Bottom Nav, User Profile)

- `/dashboard` — Main Hub
  - Shows _current_ cycle status
  - Unified metrics: Spent, Planned, Remaining
  - Category breakdown with progress indicators
  - Recent activity (last 5 expenses)
  - Quick action: Add Expense (global floating button)
  - _Empty State:_ "Create your first Cycle" (or redirect to `/onboarding`)
- `/expenses` — Global History
  - List of all expenses across all time
  - Search and filter capabilities (by cycle, category, date range, tags)
  - Sortable columns
- `/cycles` — Cycle List
  - Grid/list of all historical and future cycles
  - Summary cards showing spent vs planned
  - Quick actions: Edit, Delete, Create New
- `/settings` — Global Configuration
  - User profile & preferences
  - Currency selection
  - Theme preference
  - `/settings/data` — Manage Category Types & Tags

### 8.3 Contextual Views

- `/cycles/{cycleId}` — Cycle Overview
  - **Tabs** (using `?tab=` query param):
    - `overview` — Dashboard-style view for this cycle
    - `plan` — Category planning interface
    - `activity` — Transaction log for this cycle
  - **Sibling Navigation**: "← Previous Cycle" / "Next Cycle →" buttons
- `/cycles/{cycleId}/edit` — Cycle Settings
  - Edit name, start date, end date
  - Validation for overlaps
- `/compare` — Comparison Tool
  - Select 2-5 cycles via multi-select
  - Query params: `/compare?cycles=id1,id2,id3`
  - Read-only comparison view

### 8.4 Actions (Modals/Overlays)

- `/expenses/new` — Add Expense
  - **UX**: Opens as a modal (Intercepting Route `@modal/(.)expenses/new`) when navigating from within app
  - **Direct access**: Renders full page if URL is entered directly or page refreshed
  - **Global Access**: Floating action button (FAB) on all primary routes
- `/expenses/{expenseId}` — View/Edit Expense
  - Same modal pattern as `/expenses/new`
  - Shows expense details with edit form
  - Delete button with confirmation
- `/cycles/new` — Create Cycle
  - Modal or full page (designer's choice)

### 8.5 Onboarding

- `/onboarding` — Wizard wrapper
  - `/onboarding/start` — Choice screen
  - `/onboarding/cycle` — First cycle creation
  - `/onboarding/categories` — Initial category setup (if Plan & Track chosen)
- _Resume Logic:_ Returning users drop back into their last incomplete step
- _Guard Logic:_ Users with no cycles redirect from `/dashboard` to `/onboarding`

---

## 9. Navigation & UX Logic

### 9.1 Smart Redirects

- **Logged-in Root:** `/` → `/dashboard`
- **Onboarding Guard:** `/dashboard` (if no cycles exist) → `/onboarding/start`
- **No Current Cycle:** `/dashboard` (if today falls outside all cycles) → Show prompt to create cycle

### 9.2 Navigation Patterns

- **Sibling Navigation:** In `/cycles/{cycleId}`, allow quick navigation to adjacent cycles without returning to list
- **Back Intelligence:** Deep links (e.g., `/expenses/123`) should have a "Back" button that defaults to parent context (Cycle or Dashboard) if history is empty
- **Global FAB:** Prominent "+" floating action button visible on all primary routes to trigger `/expenses/new`

### 9.3 URL Patterns

**Comparison Mode:**

- `/compare?cycles=id1,id2,id3` - comma-separated cycle IDs
- Max 5 cycles for performance and UI clarity

**Cycle Tabs:**

- `/cycles/{cycleId}?tab=overview` (default)
- `/cycles/{cycleId}?tab=plan`
- `/cycles/{cycleId}?tab=activity`

---

## 10. Comparison Mode

**Purpose:** Side-by-side observation of spending patterns across cycles

**Features:**

- Select 2-5 cycles from dropdown
- Show totals: Spent, Planned, Difference
- Category-level breakdown (if categories exist in selected cycles)
- Categories without matches show as "N/A" or "—"

**Rules:**

- Read-only (no edits allowed)
- No normalization for cycle length (show raw totals)
- No merging or auto-matching of categories
- Metrics are purely observational
- Tag-level comparison excluded (too granular)

**Future Enhancements (Post-MVP):**

- Normalize for cycle length option
- Trend charts
- Rich comparison export templates (beyond standard CSV/JSON)

---

## 11. Aggregations & Calculations

### Category Level

- **Total Spent:** Sum of all expenses in category
- **Planned Amount:** User-defined (nullable)
- **Difference:** `planned - spent` (only if planned is not null)
- **Progress:** `(spent / planned) * 100` (only if planned exists)

**UI Indicators:**

- Normal: < 85% of planned
- Warning: 85% - 100% of planned (amber/yellow)
- Over: > 100% of planned (red, but not judgmental)

### Cycle Level

- **Total Spent:** Sum of all expenses in cycle
- **Total Planned:** Sum of non-null planned amounts only
- **Remaining:** `totalPlanned - totalSpent` (only shown if totalPlanned > 0)
- **Days Remaining:** `endDate - today` (if cycle is current)

### Type Level (Category Types)

- **Type Total Spent:** Sum of all expenses in categories under this type
- **Type Total Planned:** Sum of non-null planned amounts in categories under this type

**Progressive Disclosure:**

- Show type-level totals collapsed by default
- Click to expand and see individual categories
- Example:

  ```text
  Needs: $350 ▼
  ├─ Groceries: $200 / $250
  └─ Restaurants: $150 / $100

  Wants: $50 ▼
  └─ Movies: $50 (no plan)

  Uncategorized: $20
  └─ Miscellaneous: $20
  ```

---

## 12. Data Integrity Rules

- No income entity
- No hardcoded categories (except optional onboarding seeds)
- Overspending allowed everywhere
- Historical data is editable
- No audit logs in MVP (may add "last edited" timestamp in future)
- Soft validation with warnings, no hard blocks
- Trust users to correct their own mistakes

---

## 13. Mutability Matrix

| Entity         | Past | Current | Future | Notes                                 |
| :------------- | :--- | :------ | :----- | :------------------------------------ |
| Expense        | CRUD | CRUD    | CRUD   | Future-dated expenses allowed         |
| Category       | CRUD | CRUD    | CRUD   | Changes don't propagate across cycles |
| Planned Amount | Edit | Edit    | Edit   | Editable in any cycle                 |
| Cycle          | Edit | Edit    | Edit   | Delete only if no expenses            |
| Category Type  | CRUD | CRUD    | CRUD   | Global, affects all cycles            |
| Tag            | CRUD | CRUD    | CRUD   | Global, affects all expenses          |

---

## 14. Currency & Localization (MVP Scope)

### Currency Handling

- **Single currency per user** (selected in Settings)
- **Display only** - no multi-currency support or conversion
- **Auto-formatting** using `Intl.NumberFormat`:
  - Respects currency conventions (prefix/suffix)
  - Decimal separators (1,000.00 vs 1.000,00)
- Examples:
  - USD: $1,000.50
  - EUR: 1.000,50 €
  - INR: ₹1,000.50

**Changing Currency:**

- User can change currency anytime in Settings
- Existing expense amounts remain unchanged (numeric values stay same)
- Only display formatting updates
- No historical conversion or adjustment

### Date Formats

- **Storage**: ISO strings (YYYY-MM-DD) for consistency
- **Display**: User's browser locale via `Intl.DateTimeFormat`
- Examples:
  - US: 01/31/2025
  - UK: 31/01/2025
  - ISO: 2025-01-31

---

## 15. MVP Scope

**Included**

- ✅ Expense cycles with smart validation
- ✅ Categories & category types with reordering
- ✅ Planned amounts (optional, null-friendly)
- ✅ Expense CRUD (including uncategorized)
- ✅ Tags (multi-select, global)
- ✅ Cycle comparison (2-5 cycles)
- ✅ Dashboard with visibility controls (fixed layout MVP, customizable later)
- ✅ Editable historical data (no audit trail)
- ✅ Smart defaults (most recent category, auto-suggested names)
- ✅ Mobile quick-add mode
- ✅ Type-level aggregations with progressive disclosure
- ✅ Soft validation with helpful warnings

**Excluded (Post-MVP)**

- ❌ Income tracking
- ❌ Push notifications
- ❌ Budget enforcement or alerts
- ❌ AI categorization
- ❌ Multi-currency conversion
- ❌ PDF export
- ❌ Sharing or collaboration
- ❌ Recurring expenses automation
- ❌ Receipt scanning
- ❌ Audit logs or edit history
- ❌ Cycle archiving
- ❌ Dashboard customization (layout reordering)

---

## 16. Success Metrics (MVP)

**Functional**

- Expense creation success rate > 95%
- Time to add expense < 15 seconds
- Onboarding completion rate > 70%

**Engagement**

- Expenses logged per cycle (target: 15+)
- Cycles created per user (target: 3+ indicating retention)
- Return visits per week (target: 3+)

**Behavioral**

- Planned amount usage rate (% of categories with plans)
- Cycle comparison usage (% of users who use feature)
- Category type adoption (% of categories assigned to types)

**Technical**

- Page load time < 2s
- Real-time sync latency < 500ms
- Mobile app crash rate < 1%

---

## 17. Non-Goals

- ❌ Financial advice or recommendations
- ❌ Behavioral nudging or gamification
- ❌ "Good/bad" spending classification
- ❌ Debt tracking or payoff planning
- ❌ Investment tracking
- ❌ Bill reminders or due dates
- ❌ Social features or spending competitions
- ❌ Complex reporting or tax preparation

---

## 18. Error Handling Philosophy

**Principle:** Warn, don't block. Guide, don't constrain.

### Error Types

**Soft Warnings (Toast, Dismissable):**

- Large amounts (> $10,000)
- Old dates (> 90 days)
- Future dates (> 30 days)
- Deleting categories with expenses

**Hard Errors (Must Fix):**

- Cycle date overlaps
- Invalid date format
- Network/sync failures
- Authentication issues

**Empty States (Guidance, Not Errors):**

- No cycles: "Create your first cycle to start tracking"
- No expenses: "Add your first expense to see insights"
- No categories: "Add categories to organize your spending"
- Uncategorized expenses: "You have X uncategorized expenses. Organize them?"

---

## 19. One-Line Product Summary

Spendly helps users track, plan, and compare spending over time—without enforcing financial perfection.

---

## Appendix A: Glossary

- **Cycle**: A time-bounded period for grouping expenses (e.g., monthly, bi-weekly)
- **Category**: A spending bucket within a cycle (e.g., "Groceries", "Rent")
- **Category Type**: A semantic grouping of categories (e.g., "Needs", "Wants")
- **Planned Amount**: An optional spending goal for a category
- **Tag**: Optional metadata for expenses (e.g., "Work Trip", "Recurring")
- **Uncategorized**: Expenses without an assigned category (`categoryId = null`)
- **Current Cycle**: The cycle containing today's date

## Appendix B: Design Principles

1. **Flexibility over rigidity** - Support diverse user workflows
2. **Observation over judgment** - Show data, don't label it "good" or "bad"
3. **Smart defaults over blank slates** - Pre-fill when possible, allow override
4. **Progressive disclosure** - Show essentials, hide complexity
5. **Trust users** - Allow editing historical data, no audit trails
6. **Mobile-first data entry** - Quick add optimized for speed
7. **Desktop-first analysis** - Rich visuals for comparison and insight
8. **Real-time by default** - Instant sync across devices
9. **Forgiving of mistakes** - Uncategorized expenses, soft warnings
10. **No financial discipline** - A tool for awareness, not enforcement
