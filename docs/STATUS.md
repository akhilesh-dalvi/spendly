# Project Status Overview

This document outlines the current implementation status of the Spendly project, detailing what has been completed and what features are pending or in placeholder stages.

---

## 1. Backend (Convex)

**Status: Largely Implemented**

The core backend infrastructure is in place and functional.

-   **Schema Definition**:
    -   `users` table (Clerk identity): **Implemented**
    -   `expense_cycles` (start/end dates, name): **Implemented**
    -   `category_types` (user-defined semantic grouping): **Implemented**
    -   `categories` (cycle-scoped, optional planned amount): **Implemented**
    -   `tags` (global): **Implemented**
    -   `expenses` (amount, date, category, tags): **Implemented**
-   **Auth Integration**: Configured with Clerk. **Implemented**
-   **Core Mutations/Queries**:
    -   `users`: Create/Get current user. **Implemented**
    -   `cycles`: Create, List, Get current (by date). **Implemented**
    -   `categories`: CRUD operations (implied by usage in web app forms and dashboard). **Implemented**
    -   `expenses`: CRUD operations. **Implemented**
    -   `aggregations`: Calculate spent vs planned for cycles/categories. **Implemented**

## 2. Shared Packages

**Status: Logic shared where appropriate**

-   **Function Logic**: Business logic for date handling and cycle derivation is handled within Convex functions. **Implemented**

## 3. Web App (Next.js - `apps/web`)

**Status: Core features largely implemented, some management and advanced analytics pending.**

The foundational elements and primary user flows are functional.

### Implemented Features:

-   **App Shell & Layout Structure**: The main layout wrapper for authenticated routes, including `Sidebar`, Mobile Navigation, User Profile (Clerk UserButton), and Theme Toggle, is in place and responsive.
    -   Files: `src/app/(app)/layout.tsx`, `src/components/sidebar.tsx`, `src/components/mobile-nav.tsx`, etc.
-   **Initial User Setup (Sync)**: Ensures every logged-in user has a corresponding record in the Convex `users` table via `user-sync.tsx`.
    -   Files: `src/components/user-sync.tsx`.
-   **Onboarding Wizard**: Guides new users to create their first expense cycle. This includes welcome, cycle creation, and initial category setup.
    -   Files: `src/app/onboarding/start/page.tsx`, `src/app/onboarding/cycle/page.tsx`, `src/app/onboarding/categories/page.tsx`.
-   **Global "Add Expense" Modal**: Functionality to add an expense from various parts of the app, featuring form fields for amount, category, date, notes, and tags, along with soft validation warnings.
    -   Files: `src/components/expense-form.tsx`, `src/app/(app)/expenses/new/page.tsx`.
-   **Dashboard (Main Hub)**: Displays current status at a glance, including cycle details, summary cards, category spending/type charts, and recent activity.
    -   Files: `src/app/(app)/dashboard/page.tsx`, `src/components/dashboard-summary.tsx`, `src/components/category-spending-chart.tsx`, `src/components/category-type-chart.tsx`, `src/components/recent-activity.tsx`.
-   **Global Expense History**: Provides a searchable and filterable list of all past expenses, with sorting capabilities and total calculations.
    -   Files: `src/app/(app)/expenses/page.tsx`.
-   **Cycle Management (List & Creation)**: Allows viewing of all cycles (grouped by current, upcoming, past) and the creation of new cycles.
    -   Files: `src/app/(app)/cycles/page.tsx`, `src/components/cycle-card.tsx`, `src/components/cycle-form.tsx`.

### Pending Features (Web App):

-   **Category & Plan Management**: A dedicated page or comprehensive functionality for managing categories within a specific cycle (e.g., `/cycles/[id]`) to add, rename, or change planned amounts for categories is not fully implemented. `CategoryTypeModal` exists for types, but per-cycle category management needs to be expanded.
-   **Cycle Comparison Mode**: Feature to compare two cycles side-by-side to analyze spending differences is not yet implemented.
    -   Files: `src/app/(app)/compare/` (placeholder directory).

## 4. Mobile App (Expo - `apps/native`)

**Status: Placeholder / Not started**

The mobile application's core features are pending implementation.

-   **Setup**:
    -   Verify `ConvexProvider` and `ClerkProvider` integration.
-   **Auth**:
    -   Ensure Sign In / Sign Up flows work.
-   **Core Features (MVP)**:
    -   Dashboard: View current cycle status.
    -   Add Expense: Optimized for quick entry on mobile.
    -   Expense List: View recent history.
    -   (Optional for MVP but good) Edit expenses.

## 5. Deployment / CI

**Status: Not started**

Deployment and continuous integration configurations are pending.

-   **Database**: Set up Convex production environment.
-   **Web**: Deploy to Vercel (or similar).
-   **Mobile**: EAS Build configuration (if needed) or distinct testing release.
