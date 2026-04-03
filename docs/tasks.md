# Spendy MVP Tasks

Based on [Product Requirements](product-requirements.md) and current codebase state.

## 1. Backend (Convex)

The backend is currently empty. We need to implement the core data model and logic.

- [x] **Schema Definition**: Define tables for `users`, `expense_cycles`, `category_types`, `categories`, `expenses`, `tags`.
  - [x] Implement `users` table (Clerk identity).
  - [x] Implement `expense_cycles` (start/end dates, name).
  - [x] Implement `category_types` (user-defined semantic grouping).
  - [x] Implement `categories` (cycle-scoped, optional planned amount).
  - [x] Implement `tags` (global).
  - [x] Implement `expenses` (amount, date, category, tags).
- [x] **Auth Integration**: Configure Convex with Clerk.
- [x] **Core Mutations/Queries**:
  - [x] `users`: Create/Get current user.
  - [x] `cycles`: Create, List, Get current (by date).
  - [x] `categories`: CRUD, Copy from previous cycle.
  - [x] `expenses`: CRUD.
  - [x] `aggregations`: Calculate spent vs planned for cycles/categories.

## 2. Shared Packages

- [x] **Function Logic**: Ensure business logic (e.g. date handling, cycle derivation) is shared if possible, or implemented in Convex functions.

## 3. Web App (Next.js)

`apps/web` exists but seems minimal.

### Phase 1: Core Foundation & Onboarding (Priority: High)
These tasks establish the user's initial experience and ensuring the correct data state for the rest of the app.

- [x] **1. App Shell & Layout Structure**
    - **Goal:** Create the main layout wrapper for authenticated routes.
    - **Details:**
        - Implement `Sidebar` component (Desktop) using standard `shadcn` or `sidebar` pattern.
        - Implement Mobile Navigation (Bottom Nav or Hamburger).
        - Ensure responsive transition between desktop/mobile.
        - Add "User Profile" (Clerk UserButton) and "Theme Toggle" in the layout.
        - **Files:** `src/app/(app)/layout.tsx`, `src/components/sidebar.tsx`, `src/components/mobile-nav.tsx`.

- [x] **2. Initial User Setup (Sync)**
    - **Goal:** Ensure every logged-in user has a corresponding record in the Convex `users` table.
    - **Details:**
        - Use a `ConvexAuthenticated` wrapper or an effect in the root layout to check/create the user record via `api.users.create`.
        - **Files:** `src/components/user-sync.tsx` (or inside `providers.tsx`).

- [x] **3. Onboarding Wizard (The "First Cycle" Flow)**
    - **Goal:** Guide new users to create their first expense cycle so the dashboard isn't empty.
    - **Details:**
        - **Step 1 (Start):** Simple welcome screen. Choice: "Track Freely" vs "Plan & Track" (stores preference in local state for now).
        - **Step 2 (Cycle):** Form to create the first `expense_cycle` (Name, Start Date, End Date).
        - **Step 3 (Categories):** (If "Plan & Track") Allow adding initial categories (e.g., "Food", "Transport") with optional planned amounts.
        - **Redirect:** On completion, redirect to `/dashboard`.
        - **Files:** `src/app/onboarding/start/page.tsx`, `src/app/onboarding/cycle/page.tsx`, `src/app/onboarding/categories/page.tsx`.

### Phase 2: The Core Loop (Priority: High)
Enabling the primary action of the app: logging expenses.

- [ ] **4. Global "Add Expense" Modal**
    - **Goal:** Allow adding an expense from anywhere in the app.
    - **Details:**
        - Create a specialized "Intercepting Route" or a global Dialog controlled by URL state (e.g., `?modal=new-expense`) or a global store.
        - **Form Fields:** Amount (Required), Category (Dropdown, filtered by current cycle), Date (Default today), Note/SpentOn (Optional), Tags (Multi-select).
        - **Logic:**
            - Auto-select the cycle based on the chosen date.
            - Handle "Create New Category" inline if a user types a new one (optional UX polish).
        - **Files:** `src/components/expense-form.tsx`, `src/app/(app)/expenses/new/page.tsx` (intercepting).

- [ ] **5. Dashboard (Main Hub)**
    - **Goal:** Show the user their current status at a glance.
    - **Details:**
        - **Header:** "Current Cycle: [Name]" with Date Range.
        - **Summary Cards:** Total Spent, Total Planned (if any), Days Remaining.
        - **Recent Activity:** List of last 5 expenses.
        - **Empty State:** If no cycle exists for *today*, prompt to create one or view past/future.
        - **Files:** `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard-summary.tsx`.

### Phase 3: Data Management & Planning (Priority: Medium)
Giving users control over their data structure.

- [ ] **6. Cycle Management (CRUD)**
    - **Goal:** View past history and plan for the future.
    - **Details:**
        - **List View:** Table or Card list of all cycles (Past, Current, Future).
        - **Create/Edit:** mutation to add/update cycles.
        - **Validation:** Prevent overlapping date ranges (handled by backend, show error to user).
        - **Files:** `src/app/(app)/cycles/page.tsx`, `src/components/cycle-list.tsx`.

- [ ] **7. Category & Plan Management**
    - **Goal:** detailed control over spending buckets.
    - **Details:**
        - **View:** Inside a specific cycle (`/cycles/[id]`).
        - **Actions:** Add new category, Rename category, Change Planned Amount.
        - **UI:** Simple list with inline editing or a modal.
        - **Files:** `src/app/(app)/cycles/[id]/page.tsx`, `src/components/category-manager.tsx`.

### Phase 4: Analysis & History (Priority: Low/Polish)

- [ ] **8. Global Expense History**
    - **Goal:** Search and filter all past spending.
    - **Details:**
        - Infinite scroll or paginated list of *all* expenses.
        - Filters: By Cycle, By Category, By Date Range.
        - **Files:** `src/app/(app)/expenses/page.tsx`.

- [ ] **9. Cycle Comparison Mode**
    - **Goal:** Compare two months side-by-side.
    - **Details:**
        - Select 2 cycles.
        - Show "Spent vs Spent" and "Planned vs Planned" differences.
        - **Files:** `src/app/(app)/compare/page.tsx`.

## 4. Mobile App (Expo)

`apps/native` has basic structure (`(auth)`, `(drawer)`).

- [ ] **Setup**:
  - [ ] Verify `ConvexProvider` and `ClerkProvider` integration.
- [ ] **Auth**:
  - [ ] Ensure Sign In / Sign Up flows work.
- [ ] **Core Features (MVP)**:
  - [ ] **Dashboard**: View current cycle status.
  - [ ] **Add Expense**: Optimized for quick entry on mobile.
  - [ ] **Expense List**: View recent history.
  - [ ] (Optional for MVP but good) edit expenses.

## 5. Deployment / CI

- [ ] **Database**: Set up Convex production environment.
- [ ] **Web**: Deploy to Vercel (or similar).
- [ ] **Mobile**: EAS Build configuration (if needed) or distinct testing release.