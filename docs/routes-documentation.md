# Routes Documentation (Web)

This document provides a detailed technical overview of the routing architecture, layouts, page-specific implementations, and data flows in the Spendy web application.

---

## 1. Route Architecture & Layouts

The application leverages Next.js **App Router** with **Route Groups** to manage distinct layout contexts and access controls.

| Group          | Path Pattern                 | Layout Component         | Access Control               | Primary Aesthetic               |
| :------------- | :--------------------------- | :----------------------- | :--------------------------- | :------------------------------ |
| **Marketing**  | `/`                          | `(marketing)/layout.tsx` | Public                       | Minimalist, Branding focus      |
| **Auth**       | `/sign-in`, `/sign-up`       | `(auth)/layout.tsx`      | Public (Clerk)               | Focused, Center-aligned         |
| **App Shell**  | `/dashboard`, `/expenses`... | `(app)/layout.tsx`       | Authenticated + Guarded      | High-contrast, Narrow Sidebar   |
| **Onboarding** | `/onboarding/*`              | `onboarding/layout.tsx`  | Authenticated (bypass guard) | Wizard-style, Progress-oriented |

### Layout Hierarchy

```text
app/
├── layout.tsx # Root: Providers, Theme, Font
├── (marketing)/
│   ├── layout.tsx # Marketing: Header, Footer
│   └── page.tsx # Landing page
├── (auth)/
│   ├── layout.tsx # Auth: Centered container
│   ├── sign-in/[[...rest]]/page.tsx
│   └── sign-up/[[...rest]]/page.tsx
├── (app)/
│   ├── layout.tsx # App Shell: Sidebar, OnboardingGuard
│   ├── @modal/ # Parallel route for modals
│   │   └── (.)expenses/
│   │       └── new/page.tsx # Intercepting route
│   ├── dashboard/page.tsx
│   ├── expenses/
│   │   ├── page.tsx # List view
│   │   ├── new/page.tsx # Full page (fallback)
│   │   └── [id]/page.tsx # Detail/Edit
│   ├── cycles/
│   │   ├── page.tsx # List view
│   │   ├── new/page.tsx # Create
│   │   └── [id]/
│   │       ├── page.tsx # Detail (tabs via ?tab=)
│   │       └── edit/page.tsx # Edit metadata
│   ├── compare/page.tsx
│   └── settings/
│       ├── page.tsx # Profile
│       └── data/
│           ├── types/page.tsx # Category Types
│           └── tags/page.tsx # Tags
└── onboarding/
    ├── layout.tsx # Wizard container
    ├── start/page.tsx
    ├── cycle/page.tsx
    └── categories/page.tsx
```

---

## 2. Public & Authentication Routes

### 2.1 Landing Page (`/`)

**Location:** `app/(marketing)/page.tsx`

**Purpose:** Marketing entry point with value proposition

**Data Loading:**

```typescript
const user = useQuery(api.users.get); // Returns null if not authenticated
```

**Logic:**

- If user exists: Redirect to `/dashboard`
- If user is null: Show landing page

**Components:**

- Hero section with app preview
- Feature highlights
- CTA: "Get Started" → `/sign-up`
- Secondary CTA: "Sign In" → `/sign-in`

**SEO:**

- Static generation preferred
- Open Graph metadata
- Structured data for app

---

### 2.2 Authentication (`/sign-in` & `/sign-up`)

**Location:**

- `app/(auth)/sign-in/[[...rest]]/page.tsx`
- `app/(auth)/sign-up/[[...rest]]/page.tsx`

**Provider:** Clerk (catches all sub-routes via `[[...rest]]`)

**Implementation:**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
        redirectUrl="/dashboard"
      />
    </div>
  );
}
```

**Post-Auth Flow:**

1. Clerk completes authentication
2. User redirected to `redirectUrl` (`/dashboard`)
3. `ConvexAuthSync` component calls `api.users.create`
4. `OnboardingGuard` checks for cycles
5. User lands in dashboard or onboarding

**Auth Layout:**

- Centered container
- Minimal branding (logo only)
- No navigation chrome

---

## 3. Onboarding Sequence

**Protected by:** Authentication (but bypasses `OnboardingGuard`)

**State Management:** URL-based progression (no local storage)

**Resume Logic:** Users can bookmark and return to any step

---

### 3.1 Start (`/onboarding/start`)

**Purpose:** Set user expectations and choose path

**Data:** None required

**UI:**

```tsx
<div className="space-y-6">
  <h1>Welcome to Spendy</h1>
  <p>How would you like to start?</p>

  <Card onClick={() => router.push("/onboarding/cycle?mode=simple")}>
    <h2>Start tracking freely</h2>
    <p>Jump right in and add expenses as they happen</p>
  </Card>

  <Card onClick={() => router.push("/onboarding/cycle?mode=plan")}>
    <h2>Plan & track</h2>
    <p>Set up categories and spending goals first</p>
  </Card>
</div>
```

**Next:** `/onboarding/cycle?mode=[simple|plan]`

---

### 3.2 Cycle Creation (`/onboarding/cycle`)

**Purpose:** Create first expense cycle

**Query Params:**

- `mode`: `"simple"` | `"plan"` (determines next step)

**Data Loading:**

```typescript
const cycles = useQuery(api.cycles.list);
const hasCycles = cycles && cycles.length > 0;

// If user already has cycles, redirect to dashboard
if (hasCycles) {
  router.push("/dashboard");
}
```

**Form:**

```typescript
const form = useForm({
  defaultValues: {
    name: "January 2025", // Auto-suggested from current month
    startDate: "2025-01-01",
    endDate: "2025-02-01",
  },
});

const createCycle = useMutation(api.cycles.create);

const onSubmit = async (data) => {
  try {
    const cycle = await createCycle(data);

    if (searchParams.get("mode") === "plan") {
      router.push(`/onboarding/categories?cycleId=${cycle._id}`);
    } else {
      router.push("/dashboard");
    }
  } catch (error) {
    if (error.message === "CYCLE_OVERLAP") {
      setError("Dates overlap with existing cycle");
    }
  }
};
```

**Validation:**

- Start date < End date
- No overlap with existing cycles (backend enforced)
- Dates must be valid ISO strings

**Smart Defaults:**

- Name: Current month/year
- Start: First of current month
- End: First of next month

**Next:**

- Simple mode: `/dashboard`
- Plan mode: `/onboarding/categories?cycleId={id}`

---

### 3.3 Categories Setup (`/onboarding/categories`)

**Purpose:** Initialize categories with optional plans

**Query Params:**

- `cycleId`: Required (the cycle just created)

**Data Loading:**

```typescript
const cycleId = searchParams.get("cycleId");
const cycle = useQuery(api.cycles.get, { cycleId });
const types = useQuery(api.categories.listTypes);

// Seed default types if none exist
useEffect(() => {
  if (types?.length === 0) {
    seedDefaults.mutate();
  }
}, [types]);
```

**UI Pattern:**

```tsx
// Dynamic list with inline add
const [categories, setCategories] = useState([]);

<div className="space-y-4">
  {categories.map((cat, index) => (
    <Card key={index}>
      <Input
        placeholder="Category name (e.g., Groceries)"
        value={cat.name}
        onChange={(e) => updateCategory(index, "name", e.target.value)}
      />
      <Select
        placeholder="Type (optional)"
        value={cat.typeId}
        options={types}
      />
      <Input
        type="number"
        placeholder="Planned amount (optional)"
        value={cat.plannedAmount}
      />
      <Button onClick={() => removeCategory(index)}>Remove</Button>
    </Card>
  ))}

  <Button onClick={addCategory}>+ Add Category</Button>
  <Button onClick={completeOnboarding}>Done</Button>
  <Button variant="ghost" onClick={() => router.push("/dashboard")}>
    Skip for now
  </Button>
</div>;
```

**Submission:**

```typescript
const createCategory = useMutation(api.categories.create);

const completeOnboarding = async () => {
  // Create all categories in parallel
  await Promise.all(
    categories.map((cat) =>
      createCategory({
        cycleId,
        name: cat.name,
        categoryTypeId: cat.typeId || null,
        plannedAmount: cat.plannedAmount || null,
      }),
    ),
  );

  router.push("/dashboard");
};
```

**Next:** `/dashboard`

---

## 4. Core Application Hub (`(app)`)

**Protected by:**

1. Clerk authentication
2. `OnboardingGuard` (checks for cycles)

**Layout Features:**

- Narrow sidebar (desktop)
- Bottom navigation (mobile)
- Global FAB (Add Expense)
- User profile dropdown
- Theme toggle

---

### 4.1 App Layout (`(app)/layout.tsx`)

**Implementation:**

```tsx
export default function AppLayout({ children, modal }) {
  return (
    <>
      <OnboardingGuard>
        <div className="flex h-screen">
          {/* Desktop Sidebar */}
          <Sidebar className="hidden md:flex w-20" />

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">{children}</main>

          {/* Mobile Bottom Nav */}
          <MobileNav className="md:hidden" />
        </div>

        {/* Global FAB */}
        <AddExpenseButton />

        {/* Modal Slot for Intercepting Routes */}
        {modal}
      </OnboardingGuard>
    </>
  );
}
```

**OnboardingGuard Logic:**

```tsx
"use client";

export function OnboardingGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const cycles = useQuery(api.cycles.list);

  // Don't guard onboarding routes
  if (pathname.startsWith("/onboarding")) {
    return children;
  }

  // Loading state
  if (cycles === undefined) {
    return <LoadingSpinner />;
  }

  // No cycles - redirect to onboarding
  if (cycles.length === 0) {
    router.push("/onboarding/start");
    return null;
  }

  // Has cycles - allow access
  return children;
}
```

---

### 4.2 Dashboard (`/dashboard`)

**Purpose:** Command center with current cycle overview

**Data Loading:**

```typescript
const currentCycle = useQuery(api.cycles.getCurrent);
const summary = useQuery(
  api.aggregations.getCycleSummary,
  currentCycle ? { cycleId: currentCycle._id } : "skip",
);
const recentExpenses = useQuery(api.expenses.listRecent, { limit: 5 });
```

**Empty States:**

_No Current Cycle:_

```tsx
if (!currentCycle) {
  return (
    <EmptyState
      icon={CalendarIcon}
      title="No active cycle"
      description="Create a cycle for this period to start tracking"
      action={
        <Button onClick={() => router.push("/cycles/new")}>Create Cycle</Button>
      }
    />
  );
}
```

_Loading State:_

```tsx
if (summary === undefined) {
  return <DashboardSkeleton />;
}
```

**Main UI Structure:**

```tsx
<div className="container py-8 space-y-8">
  {/* Header */}
  <div className="flex justify-between items-center">
    <div>
      <h1 className="text-4xl font-black">{currentCycle.name}</h1>
      <p className="text-muted-foreground">
        {formatDateRange(currentCycle.startDate, currentCycle.endDate)}
      </p>
    </div>
    <Button onClick={() => router.push("/cycles")}>All Cycles</Button>
  </div>

  {/* Unified Metrics Grid */}
  <MetricGrid summary={summary} />

  {/* Category Breakdown */}
  <Card>
    <CardHeader>
      <CardTitle>Categories</CardTitle>
    </CardHeader>
    <CardContent>
      <CategoryList
        categories={summary.categoryStats}
        types={summary.typeStats}
      />
    </CardContent>
  </Card>

  {/* Recent Activity */}
  <Card>
    <CardHeader>
      <CardTitle>Recent Activity</CardTitle>
    </CardHeader>
    <CardContent>
      <ExpenseList expenses={recentExpenses} compact />
    </CardContent>
  </Card>
</div>
```

**Components:**

_MetricGrid:_

```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <MetricCard
    label="Total Spent"
    value={formatCurrency(summary.totalSpent)}
    variant="primary"
  />
  <MetricCard
    label="Planned"
    value={formatCurrency(summary.totalPlanned)}
    variant="muted"
  />
  <MetricCard
    label="Remaining"
    value={formatCurrency(summary.remaining)}
    variant={summary.remaining < 0 ? "destructive" : "success"}
  />
  <MetricCard
    label="Days Left"
    value={summary.daysRemaining ?? "Ended"}
    variant="muted"
  />
</div>
```

_CategoryList with Progressive Disclosure:_

```tsx
{
  summary.typeStats.map((type) => (
    <Collapsible key={type.typeId}>
      <CollapsibleTrigger>
        <div className="flex justify-between">
          <span className="font-bold">{type.typeName}</span>
          <span>{formatCurrency(type.totalSpent)}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {type.categories.map((cat) => (
          <CategoryProgressBar
            key={cat.categoryId}
            name={cat.name}
            spent={cat.spent}
            planned={cat.planned}
            progress={cat.progress}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  ));
}
```

**Real-Time Updates:**

- All data auto-refreshes via Convex subscriptions
- No manual refresh needed
- Optimistic updates for mutations

---

### 4.3 Add Expense (`/expenses/new`)

**Implementation Pattern:** Intercepting Routes + Parallel Routes

**File Structure:**

```text
(app)/
├── @modal/
│   └── (.)expenses/
│       └── new/
│           └── page.tsx      # Modal version (intercepted)
└── expenses/
    └── new/
        └── page.tsx          # Full page version (fallback)
```

**Modal Version (`@modal/(.)expenses/new/page.tsx`):**

```tsx
"use client";

export default function AddExpenseModal() {
  const router = useRouter();

  return (
    <Dialog open onOpenChange={() => router.back()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>
        <ExpenseForm onSuccess={() => router.back()} />
      </DialogContent>
    </Dialog>
  );
}
```

**Full Page Version (`expenses/new/page.tsx`):**

```tsx
export default function AddExpensePage() {
  const router = useRouter();

  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Add Expense</h1>
      <Card>
        <CardContent className="pt-6">
          <ExpenseForm onSuccess={() => router.push("/dashboard")} />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Shared Form Component (`ExpenseForm`):**

```tsx
export function ExpenseForm({ onSuccess, defaultValues }) {
  const createExpense = useMutation(api.expenses.create);
  const currentCycle = useQuery(api.cycles.getCurrent);
  const categories = useQuery(
    api.categories.list,
    currentCycle ? { cycleId: currentCycle._id } : "skip",
  );
  const tags = useQuery(api.tags.list);

  // Recent category (smart default)
  const recentExpenses = useQuery(api.expenses.listRecent, { limit: 1 });
  const defaultCategoryId = recentExpenses?.[0]?.categoryId;

  const form = useForm({
    defaultValues: {
      amount: "",
      categoryId: defaultCategoryId || "",
      date: new Date().toISOString().split("T")[0], // Today
      spentOn: "",
      tagIds: [],
      ...defaultValues,
    },
  });

  const onSubmit = async (data) => {
    try {
      const result = await createExpense({
        amount: parseFloat(data.amount),
        categoryId: data.categoryId || null,
        date: data.date,
        spentOn: data.spentOn || null,
        tagIds: data.tagIds,
      });

      // Show warnings (non-blocking)
      if (result.warnings) {
        result.warnings.forEach((warning) => {
          toast.warning(getWarningMessage(warning));
        });
      }

      toast.success("Expense added");
      onSuccess?.();
    } catch (error) {
      if (error.message === "NO_CYCLE") {
        toast.error("No cycle exists for this date", {
          action: {
            label: "Create Cycle",
            onClick: () => router.push("/cycles/new"),
          },
        });
      } else {
        toast.error(error.message);
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Amount - Large, Auto-focus */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  autoFocus
                  className="text-3xl font-medium"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category - Searchable Select */}
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or leave uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Uncategorized</SelectItem>
                  {categories?.map((cat) => (
                    <SelectItem key={cat._id} value={cat._id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date - With Cycle Preview */}
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <CyclePreview date={field.value} />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Note - Optional */}
        <FormField
          control={form.control}
          name="spentOn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl>
                <Input placeholder="What was this for?" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* Tags - Multi-select */}
        <FormField
          control={form.control}
          name="tagIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags (optional)</FormLabel>
              <MultiSelect
                options={tags?.map((t) => ({ label: t.name, value: t._id }))}
                value={field.value}
                onChange={field.onChange}
              />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full">
          Add Expense
        </Button>
      </form>
    </Form>
  );
}
```

**Cycle Preview Component:**

```tsx
function CyclePreview({ date }) {
  const cycles = useQuery(api.cycles.list);
  const matchingCycle = cycles?.find(
    (c) => date >= c.startDate && date < c.endDate,
  );

  if (!matchingCycle) {
    return (
      <p className="text-sm text-amber-600">
        ⚠️ No cycle exists for this date. Create one?
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Will be added to <strong>{matchingCycle.name}</strong>
    </p>
  );
}
```

**Mobile Quick Add Mode:**

```tsx
// Tabs for Quick vs Detailed
<Tabs defaultValue="quick">
  <TabsList>
    <TabsTrigger value="quick">Quick</TabsTrigger>
    <TabsTrigger value="details">Details</TabsTrigger>
  </TabsList>

  <TabsContent value="quick">
    {/* Amount + Category only */}
    <QuickExpenseForm />
  </TabsContent>

  <TabsContent value="details">
    {/* Full form */}
    <ExpenseForm />
  </TabsContent>
</Tabs>
```

---

### 4.4 Expense Detail/Edit (`/expenses/[id]`)

**Purpose:** View and edit existing expense

**Same Modal Pattern:**

```text
(app)/
├── @modal/
│   └── (.)expenses/
│       └── [id]/
│           └── page.tsx      # Modal version
└── expenses/
    └── [id]/
        └── page.tsx          # Full page version
```

**Data Loading:**

```typescript
const expenseId = params.id;
const expense = useQuery(api.expenses.get, { expenseId });
```

**UI:**

```tsx
<Dialog open onOpenChange={() => router.back()}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit Expense</DialogTitle>
      <DialogDescription>
        Created on {formatDate(expense.createdAt)}
      </DialogDescription>
    </DialogHeader>

    <ExpenseForm defaultValues={expense} onSuccess={() => router.back()} />

    <DialogFooter>
      <Button variant="destructive" onClick={handleDelete}>
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Delete Confirmation:**

```typescript
const deleteExpense = useMutation(api.expenses.remove);

const handleDelete = async () => {
  const confirmed = await confirm({
    title: "Delete expense?",
    description: "This action cannot be undone.",
  });

  if (confirmed) {
    await deleteExpense({ expenseId });
    toast.success("Expense deleted");
    router.back();
  }
};
```

---

### 4.5 Global Expense History (`/expenses`)

**Purpose:** Searchable archive of all expenses

**Data Loading:**

```typescript
const [filters, setFilters] = useState({
  cycleId: null,
  categoryId: null,
  startDate: null,
  endDate: null,
  tagIds: [],
});

const expenses = useQuery(api.expenses.list, filters);
const cycles = useQuery(api.cycles.list);
const categories = useQuery(api.categories.list); // Global
const tags = useQuery(api.tags.list);
```

**UI Structure:**

```tsx
<div className="container py-8">
  <div className="flex justify-between items-center mb-6">
    <h1 className="text-3xl font-bold">Expense History</h1>
    <Button onClick={() => router.push("/expenses/new")}>Add Expense</Button>
  </div>

  {/* Filters */}
  <Card className="mb-6">
    <CardContent className="pt-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Select
          placeholder="All Cycles"
          value={filters.cycleId}
          onChange={(cycleId) => setFilters({ ...filters, cycleId })}
        >
          {cycles.map((c) => (
            <SelectItem key={c._id} value={c._id}>
              {c.name}
            </SelectItem>
          ))}
        </Select>

        <Select
          placeholder="All Categories"
          value={filters.categoryId} /* ... */
        />

        <Input
          type="date"
          placeholder="Start Date"
          value={filters.startDate} /* ... */
        />

        <Input
          type="date"
          placeholder="End Date"
          value={filters.endDate} /* ... */
        />
      </div>
    </CardContent>
  </Card>

  {/* Results */}
  {expenses?.length === 0 ? (
    <EmptyState
      title="No expenses found"
      description="Try adjusting your filters"
    />
  ) : (
    <ExpenseTable
      expenses={expenses}
      onRowClick={(expense) => router.push(`/expenses/${expense._id}`)}
    />
  )}
</div>
```

**Table Component:**

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Date</TableHead>
      <TableHead>Amount</TableHead>
      <TableHead>Category</TableHead>
      <TableHead>Note</TableHead>
      <TableHead>Tags</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {expenses.map((exp) => (
      <TableRow
        key={exp._id}
        onClick={() => onRowClick(exp)}
        className="cursor-pointer hover:bg-muted/50"
      >
        <TableCell>{formatDate(exp.date)}</TableCell>
        <TableCell className="font-medium">
          {formatCurrency(exp.amount)}
        </TableCell>
        <TableCell>{exp.categoryName || "Uncategorized"}</TableCell>
        <TableCell className="text-muted-foreground">{exp.spentOn}</TableCell>
        <TableCell>
          {exp.tagNames.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

### 4.6 Cycles Management (`/cycles`)

**Purpose:** Overview of all expense cycles

**Data Loading:**

```typescript
const cycles = useQuery(api.cycles.list);
const currentCycle = useQuery(api.cycles.getCurrent);

// Organize by status
const pastCycles = cycles?.filter((c) => c.endDate < today);
const futureCycles = cycles?.filter((c) => c.startDate > today);
```

**UI:**

```tsx
<div className="container py-8">
  <div className="flex justify-between items-center mb-6">
    <h1 className="text-3xl font-bold">Expense Cycles</h1>
    <Button onClick={() => router.push("/cycles/new")}>Create Cycle</Button>
  </div>

  {/* Current Cycle - Highlighted */}
  {currentCycle && (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Current</h2>
      <CycleCard cycle={currentCycle} variant="current" />
    </section>
  )}

  {/* Future Cycles */}
  {futureCycles.length > 0 && (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Upcoming</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {futureCycles.map((cycle) => (
          <CycleCard key={cycle._id} cycle={cycle} />
        ))}
      </div>
    </section>
  )}

  {/* Past Cycles */}
  <section>
    <h2 className="text-xl font-semibold mb-4">Past</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {pastCycles.map((cycle) => (
        <CycleCard key={cycle._id} cycle={cycle} />
      ))}
    </div>
  </section>
</div>
```

**Cycle Card:**

```tsx
function CycleCard({ cycle, variant }) {
  const summary = useQuery(api.aggregations.getCycleSummary, {
    cycleId: cycle._id,
  });

  return (
    <Card
      className={cn(
        "cursor-pointer hover:border-primary",
        variant === "current" && "border-primary shadow-lg",
      )}
      onClick={() => router.push(`/cycles/${cycle._id}`)}
    >
      <CardHeader>
        <CardTitle>{cycle.name}</CardTitle>
        <CardDescription>
          {formatDateRange(cycle.startDate, cycle.endDate)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Spent</span>
              <span className="font-medium">
                {formatCurrency(summary.totalSpent)}
              </span>
            </div>
            {summary.totalPlanned > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Planned</span>
                <span className="font-medium">
                  {formatCurrency(summary.totalPlanned)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/cycles/${cycle._id}/edit`}>Edit</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
```

---

### 4.7 Cycle Detail (`/cycles/[id]`)

**Purpose:** Deep dive into a specific cycle

**Query Params:**

- `tab`: `"overview"` (default) | `"plan"` | `"activity"`

**Data Loading:**

```typescript
const cycleId = params.id;
const cycle = useQuery(api.cycles.get, { cycleId });
const summary = useQuery(api.aggregations.getCycleSummary, { cycleId });
const expenses = useQuery(api.expenses.list, { cycleId });
const categories = useQuery(api.categories.list, { cycleId });

// Sibling cycles for navigation
const allCycles = useQuery(api.cycles.list);
const cycleIndex = allCycles?.findIndex((c) => c._id === cycleId);
const previousCycle = allCycles?.[cycleIndex + 1];
const nextCycle = allCycles?.[cycleIndex - 1];
```

**UI Structure:**

```tsx
<div className="container py-8">
  {/* Header with Navigation */}
  <div className="flex justify-between items-center mb-6">
    <div className="flex items-center gap-4">
      <Button
        variant="ghost"
        onClick={() => router.push(`/cycles/${previousCycle._id}`)}
        disabled={!previousCycle}
      >
        ← Previous
      </Button>

      <div>
        <h1 className="text-3xl font-bold">{cycle.name}</h1>
        <p className="text-muted-foreground">
          {formatDateRange(cycle.startDate, cycle.endDate)}
        </p>
      </div>

      <Button
        variant="ghost"
        onClick={() => router.push(`/cycles/${nextCycle._id}`)}
        disabled={!nextCycle}
      >
        Next →
      </Button>
    </div>

    <Button variant="outline" asChild>
      <Link href={`/cycles/${cycleId}/edit`}>Edit</Link>
    </Button>
  </div>

  {/* Tabs */}
  <Tabs value={searchParams.get("tab") || "overview"}>
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="plan">Plan</TabsTrigger>
      <TabsTrigger value="activity">Activity</TabsTrigger>
    </TabsList>

    <TabsContent value="overview">
      {/* Same as Dashboard */}
      <MetricGrid summary={summary} />
      <CategoryList categories={summary.categoryStats} />
    </TabsContent>

    <TabsContent value="plan">
      <CategoryManager cycleId={cycleId} categories={categories} />
    </TabsContent>

    <TabsContent value="activity">
      <ExpenseTable expenses={expenses} />
    </TabsContent>
  </Tabs>
</div>
```

**Category Manager (`Plan` Tab):**

```tsx
function CategoryManager({ cycleId, categories }) {
  const createCategory = useMutation(api.categories.create);
  const updateCategory = useMutation(api.categories.update);
  const deleteCategory = useMutation(api.categories.remove);

  const handleUpdate = async (categoryId, field, value) => {
    await updateCategory({ categoryId, [field]: value });
    toast.success("Category updated");
  };

  const handleDelete = async (categoryId) => {
    const result = await deleteCategory({ categoryId });
    if (result.affectedExpenses > 0) {
      toast.warning(
        `${result.affectedExpenses} expenses moved to Uncategorized`,
      );
    } else {
      toast.success("Category deleted");
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {categories.map((cat) => (
          <div
            key={cat._id}
            className="flex items-center gap-4 p-4 border rounded"
          >
            <Input
              value={cat.name}
              onChange={(e) => handleUpdate(cat._id, "name", e.target.value)}
            />
            <Input
              type="number"
              value={cat.plannedAmount || ""}
              placeholder="Planned"
              onChange={(e) =>
                handleUpdate(
                  cat._id,
                  "plannedAmount",
                  parseFloat(e.target.value),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(cat._id)}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        <Button onClick={() => setShowAddForm(true)}>+ Add Category</Button>
      </CardContent>
    </Card>
  );
}
```

---

### 4.8 Cycle Edit (`/cycles/[id]/edit`)

**Purpose:** Update cycle metadata

**Data Loading:**

```typescript
const cycleId = params.id;
const cycle = useQuery(api.cycles.get, { cycleId });
```

**Form:**

```typescript
const updateCycle = useMutation(api.cycles.update);
const deleteCycle = useMutation(api.cycles.remove);

const form = useForm({
  defaultValues: {
    name: cycle?.name,
    startDate: cycle?.startDate,
    endDate: cycle?.endDate,
  },
});

const onSubmit = async (data) => {
  try {
    await updateCycle({ cycleId, ...data });
    toast.success("Cycle updated");
    router.push(`/cycles/${cycleId}`);
  } catch (error) {
    if (error.message === "CYCLE_OVERLAP") {
      setError("root", { message: "Dates overlap with another cycle" });
    }
  }
};

const handleDelete = async () => {
  try {
    await deleteCycle({ cycleId });
    toast.success("Cycle deleted");
    router.push("/cycles");
  } catch (error) {
    if (error.message === "CYCLE_HAS_EXPENSES") {
      toast.error("Cannot delete cycle with expenses");
    }
  }
};
```

---

### 4.9 Create Cycle (`/cycles/new`)

**Purpose:** Add a new expense cycle

**Form with Smart Copy:**

```typescript
const createCycle = useMutation(api.cycles.create);
const cycles = useQuery(api.cycles.list);
const latestCycle = cycles?.[0]; // Sorted by startDate DESC

const [copyFromCycle, setCopyFromCycle] = useState(false);
const [includePlanned, setIncludePlanned] = useState(true);

const form = useForm({
  defaultValues: {
    name: "", // Auto-suggest based on dates
    startDate: "",
    endDate: ""
  }
});

const onSubmit = async (data) => {
  await createCycle({
    ...data,
    copyFromCycleId: copyFromCycle ? latestCycle._id : undefined,
    includePlannedAmounts: includePlanned
  });
  toast.success("Cycle created");
  router.push('/cycles');
};

return (
  <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Name, dates fields... */}
      {latestCycle && (
        <Card>
          <CardHeader>
            <CardTitle>Copy from previous cycle?</CardTitle>
          </CardHeader>
          <CardContent>
            <Checkbox
              checked={copyFromCycle}
              onCheckedChange={setCopyFromCycle}
              label={`Copy categories from "${latestCycle.name}"`}
            />
            {copyFromCycle && (
              <Checkbox
                checked={includePlanned}
                onCheckedChange={setIncludePlanned}
                label="Include planned amounts"
                className="mt-2"
              />
            )}
          </CardContent>
        </Card>
      )}
      <Button type="submit">Create Cycle</Button>
    </form>
  </Form>
);
```

---

### 4.10 Comparison Mode (`/compare`)

**Purpose:** Side-by-side cycle analysis

**Query Params:**

- `cycles`: Comma-separated cycle IDs (e.g., `?cycles=id1,id2,id3`)

**Data Loading:**

```typescript
const selectedIds = searchParams.get("cycles")?.split(",") || [];
const compareData = useQuery(
  api.aggregations.compareMultiple,
  selectedIds.length >= 2 ? { cycleIds: selectedIds } : "skip",
);
const allCycles = useQuery(api.cycles.list);
```

**UI:**

```tsx
<div className="container py-8">
  <h1 className="text-3xl font-bold mb-6">Compare Cycles</h1>

  {/* Cycle Selector */}
  <Card className="mb-6">
    <CardContent className="pt-6">
      <MultiSelect
        placeholder="Select 2-5 cycles to compare"
        options={allCycles.map((c) => ({ label: c.name, value: c._id }))}
        value={selectedIds}
        onChange={(ids) => {
          const params = new URLSearchParams({ cycles: ids.join(",") });
          router.push(`/compare?${params}`);
        }}
        max={5}
      />
    </CardContent>
  </Card>

  {selectedIds.length < 2 ? (
    <EmptyState
      title="Select cycles to compare"
      description="Choose at least 2 cycles to see a comparison"
    />
  ) : (
    <ComparisonTable data={compareData} />
  )}
</div>
```

**Comparison Table:**

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Cycle</TableHead>
      <TableHead>Total Spent</TableHead>
      <TableHead>Total Planned</TableHead>
      <TableHead>Difference</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {compareData.map((cycle) => (
      <TableRow key={cycle.cycleId}>
        <TableCell className="font-medium">{cycle.cycleName}</TableCell>
        <TableCell>{formatCurrency(cycle.totalSpent)}</TableCell>
        <TableCell>{formatCurrency(cycle.totalPlanned)}</TableCell>
        <TableCell
          className={
            cycle.totalPlanned - cycle.totalSpent < 0
              ? "text-destructive"
              : "text-success"
          }
        >
          {formatCurrency(cycle.totalPlanned - cycle.totalSpent)}
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>;

{
  /* Category Breakdown (Expandable) */
}
<Accordion type="multiple">
  {compareData.map((cycle) => (
    <AccordionItem key={cycle.cycleId} value={cycle.cycleId}>
      <AccordionTrigger>{cycle.cycleName} - Categories</AccordionTrigger>
      <AccordionContent>
        <Table>
          {cycle.categoryBreakdown.map((cat) => (
            <TableRow key={cat.categoryName}>
              <TableCell>{cat.categoryName}</TableCell>
              <TableCell>{formatCurrency(cat.spent)}</TableCell>
              <TableCell>{formatCurrency(cat.planned || 0)}</TableCell>
            </TableRow>
          ))}
        </Table>
      </AccordionContent>
    </AccordionItem>
  ))}
</Accordion>;
```

---

### 4.11 Settings (`/settings`)

**Purpose:** User preferences and data management

**Nested Routes:**

- `/settings` → Profile (default)
- `/settings/data/types` → Category Types
- `/settings/data/tags` → Tags

**Layout:**

```tsx
// settings/layout.tsx
<div className="container py-8">
  <div className="flex gap-6">
    {/* Sidebar (Desktop) */}
    <nav className="hidden md:block w-48">
      <SettingsNav />
    </nav>

    {/* Tabs (Mobile) */}
    <Tabs className="md:hidden">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
    </Tabs>

    {/* Content */}
    <main className="flex-1">{children}</main>
  </div>
</div>
```

**Profile (`/settings/page.tsx`):**

```typescript
const user = useQuery(api.users.get);
const updateCurrency = useMutation(api.users.updateCurrency);

<Card>
  <CardHeader>
    <CardTitle>Profile</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div>
      <Label>Email</Label>
      <Input value={user.email} disabled />
    </div>
    <div>
      <Label>Currency</Label>
      <Select value={user.currency} onValueChange={currency => updateCurrency({ currency })}>
        <SelectItem value="USD">USD ($)</SelectItem>
        <SelectItem value="EUR">EUR (€)</SelectItem>
        <SelectItem value="INR">INR (₹)</SelectItem>
        <SelectItem value="GBP">GBP (£)</SelectItem>
      </Select>
    </div>
    <div>
      <Label>Theme</Label>
      <ThemeToggle />
    </div>
  </CardContent>
</Card>
```

**Category Types (`/settings/data/types/page.tsx`):**

```typescript
const types = useQuery(api.categories.listTypes);
const createType = useMutation(api.categories.createType);
const updateType = useMutation(api.categories.updateType);
const deleteType = useMutation(api.categories.deleteType);

// Sortable list with drag-and-drop
<DndContext onDragEnd={handleReorder}>
  <SortableContext items={types}>
    {types.map(type => (
      <SortableItem key={type._id} id={type._id}>
        <div className="flex items-center gap-4 p-4 border rounded">
          <GripVertical className="cursor-grab" />
          <Input
            value={type.name}
            onChange={e => updateType({ typeId: type._id, name: e.target.value })}
          />
          <Button variant="ghost" size="icon" onClick={() => deleteType({ typeId: type._id })}>
            <TrashIcon />
          </Button>
        </div>
      </SortableItem>
    ))}
  </SortableContext>
</DndContext>
```

---

## 5. Mobile App Routes (Expo)

Structure mirrors web with mobile-optimized UX

**Key Differences:**

- Bottom tab navigation instead of sidebar
- Swipe gestures for navigation
- Native modals for forms
- Pull-to-refresh on lists
- Hardware back button support

**Main Tabs:**

```tsx
// app/(tabs)/_layout.tsx
<Tabs>
  <Tabs.Screen
    name="dashboard"
    options={{
      title: "Dashboard",
      tabBarIcon: ({ color }) => <HomeIcon color={color} />,
    }}
  />
  <Tabs.Screen
    name="expenses"
    options={{
      title: "Expenses",
      tabBarIcon: ({ color }) => <ListIcon color={color} />,
    }}
  />
  <Tabs.Screen
    name="cycles"
    options={{
      title: "Cycles",
      tabBarIcon: ({ color }) => <CalendarIcon color={color} />,
    }}
  />
  <Tabs.Screen
    name="settings"
    options={{
      title: "Settings",
      tabBarIcon: ({ color }) => <SettingsIcon color={color} />,
    }}
  />
</Tabs>
```

**Quick Add FAB:**

```tsx
// Floating action button overlays all tabs
<Pressable
  style={styles.fab}
  onPress={() => navigation.navigate("ExpenseModal")}
>
  <PlusIcon />
</Pressable>
```

---

## 6. Error Handling & Loading States

**Global Error Boundary**

```tsx
// app/error.tsx
"use client";

export default function GlobalError({ error, reset }) {
  return (
    <div className="flex h-screen items-center justify-center">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Loading States**

```tsx
// app/loading.tsx (route-level)
export default function Loading() {
  return <DashboardSkeleton />;
}

// Component-level
{
  data === undefined ? (
    <Skeleton className="h-32 w-full" />
  ) : (
    <DataDisplay data={data} />
  );
}
```

**Network Errors**

```typescript
// Convex query error handling
const data = useQuery(api.some.query);
if (data === undefined) return <Loading />;
if (data === null) return <Error />;
return <Success data={data} />;
```

---

## 7. Performance Optimizations

**Code Splitting**

- Route-based splitting (automatic with App Router)
- Component lazy loading for heavy components:

```typescript
const HeavyChart = dynamic(() => import('@/components/heavy-chart'), {
  loading: () => <Skeleton />
});
```

**Data Prefetching**

```tsx
// Prefetch on hover
<Link href={`/cycles/${id}`} onMouseEnter={() => prefetch(`/cycles/${id}`)}>
  View Cycle
</Link>
```

**Optimistic Updates**

```typescript
const updateExpense = useMutation(api.expenses.update).withOptimisticUpdate(
  (localStore, args) => {
    // Update local cache immediately
    const current = localStore.getQuery(api.expenses.list);
    localStore.setQuery(
      api.expenses.list,
      {},
      current.map((exp) =>
        exp._id === args.expenseId ? { ...exp, ...args } : exp,
      ),
    );
  },
);
```

---

## 8. SEO & Metadata

**Dynamic Metadata**

```typescript
// app/(app)/cycles/[id]/page.tsx
export async function generateMetadata({ params }) {
  const cycle = await fetchCycle(params.id);
  return {
    title: `${cycle.name} | Spendy`,
    description: `Expense tracking for ${cycle.name}`,
  };
}
```

**Static Pages**

```typescript
// app/(marketing)/page.tsx
export const metadata = {
  title: "Spendy - Flexible Expense Tracking",
  description: "Track, plan, and compare spending without financial perfection",
  openGraph: {
    title: "Spendy",
    description: "Flexible expense tracking app",
    images: ["/og-image.png"],
  },
};
```

---

## Appendix: Navigation Patterns Cheat Sheet

| User Action                        | Current Route               | Destination               | Pattern                    |
| :--------------------------------- | :-------------------------- | :------------------------ | :------------------------- |
| Click "Add Expense" (sidebar)      | `/dashboard`                | `/expenses/new`           | Intercepting route → Modal |
| Direct navigate to `/expenses/new` | N/A                         | `/expenses/new`           | Full page                  |
| Click expense in list              | `/expenses`                 | `/expenses/{id}`          | Intercepting route → Modal |
| Edit cycle dates                   | `/cycles/{id}`              | `/cycles/{id}/edit`       | Full page                  |
| Compare cycles                     | `/cycles`                   | `/compare?cycles=id1,id2` | Query params               |
| Switch cycle tab                   | `/cycles/{id}?tab=overview` | `/cycles/{id}?tab=plan`   | Query params               |
| Navigate sibling cycles            | `/cycles/id1`               | `/cycles/id2`             | Direct link (no list)      |
| Back from modal                    | `/expenses/new` (modal)     | Previous route            | `router.back()`            |
| Back from full page                | `/expenses/new` (full)      | `/dashboard`              | `router.push()`            |
