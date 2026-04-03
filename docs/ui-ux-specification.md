# UI/UX Specification

This document serves as the visual and interactive blueprint for the Spendy web application. It defines the design tokens, component patterns, and page-specific requirements to ensure a cohesive and premium experience.

---

## 1. Design System Tokens

### 1.1 Core Aesthetic
- **Philosophy:** Minimalist, data-first, high-contrast "Pro-sumer" aesthetic.
- **Theme:** Default to Dark Mode (`#0a0a0a` background).
- **Radius:** Standard `16px` (`rounded-2xl`) for primary cards and `24px` (`rounded-3xl`) for major containers.
- **Borders:** Thin, subtle borders (`border-border/40`) to create structure without visual noise.

### 1.2 Typography
- **Primary Font:** Sans-serif (Inter or similar).
- **Scale:**
    - **Display:** `text-4xl` | `font-black` (Dashboard Header)
    - **Heading:** `text-xl` | `font-bold` (Card Titles)
    - **Metric:** `text-3xl` | `font-medium` (Primary numbers)
    - **Sub-label:** `text-[10px]` | `font-bold` | `uppercase` | `tracking-widest` (Metadata)

---

## 2. Page Specifications

### 2.1 Dashboard (`/dashboard`)
The command center. Focus on immediate clarity of spending velocity.

- **Visual Hierarchy:**
    1. **Spend Metrics:** Unified block showing Spent vs. Remaining vs. Planned.
    2. **Timeline:** Days remaining in the current cycle.
    3. **Category Progress:** Detailed breakdown of intent vs. reality.
    4. **Activity:** Quick view of the latest 5 transactions.
- **Components:**
    - `MetricGrid`: A single container with internal dividers.
    - `CategoryList`: Custom high-visibility progress bars (Primary for normal, Amber for 85%+, Destructive for >100%).
    - `RecentActivity`: Sidebar-style list with receipt icons.
- **Primary Action:** "New Expense" (Top Right).

### 2.2 Add Expense (`/expenses/new`)
Optimized for speed and minimal friction.

- **Interaction Model:**
    - Opens as a **Contextual Modal** (`@modal`) from Dashboard/Sidebar.
    - Loads as a full page for direct links.
- **Form Fields:**
    - **Amount:** Large, auto-focusing numeric input.
    - **Category:** Searchable select (defaults to most used or first available).
    - **Date:** Inline picker (defaults to Today).
    - **Note:** Optional text field.
- **Success State:** Instant toast notification + auto-close modal.

### 2.3 Global History (`/expenses`)
A searchable, filterable archive.

- **Information Density:** High. Use a list or table view.
- **Filtering:** By Category, Date Range, and Note content.
- **Empty State:** Large illustration or icon + "Log your first expense" button.

### 2.4 Cycles Management (`/cycles`)
Management of the temporal containers.

- **Visuals:** Grid of cards.
- **States:** Highlight the "Active" cycle with a unique border or glow. Show "Past" and "Future" with distinct metadata.

---

## 3. Interactive Patterns

### 3.1 Navigation (Narrow Sidebar)
- **Width:** `w-20` (80px).
- **Behavior:** Icon-only. Use tooltips for labels on hover (optional).
- **Active State:** Contrast-heavy background (`bg-primary/10`) + vertical indicator bar on the left edge.

### 3.2 Loading Strategy
- **Skeleton Screens:** Use CSS-animated pulses matching the actual component geometry to avoid layout shifts.
- **Transitions:** Subtle `fade-in` and `slide-up` (200ms) for page entries.

### 3.3 Empty States
- Never show a blank screen. Use a consistent pattern:
    - Centralized Icon (`muted-foreground/20`).
    - Heading + Subtext.
    - Clear Call to Action (CTA) button.
