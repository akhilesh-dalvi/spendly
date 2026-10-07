# Expense Cycles

Start with `spendly --agent --json --non-interactive cycles --help`, then the
specific action's help. Older versions only support list/current. Use the
installed help as authority; do not infer support from this document.

## Find and preview

1. List cycles and use returned IDs; names may be duplicated.
2. Get the intended cycle to read its revision.
3. Preview the requested change and review dates and all copied/deleted categories.

```bash
spendly --agent --json --non-interactive cycles list
spendly --agent --json --non-interactive cycles get "$CYCLE_ID"
spendly --agent --json --non-interactive cycles add --name "$NAME" \
  --start-date "$START" --end-date-exclusive "$END" --dry-run
```

Cycle creation requires both dates. The start is inclusive, the end exclusive:
September 1 through September 30 ends October 1. Cycles cannot overlap.
Creation does not attach existing unassigned expenses; date edits do not
reassign existing expenses.

## Copy categories at creation

Use `--copy-from-cycle-id` for an owned source. Without selections, all
categories copy, including hidden ones. Repeat `--copy-category-id` for a
subset, or use `--without-categories` to copy none. New category IDs are
created; source expenses are never copied.

Plans default to unset. Add `--include-planned-amounts` to copy plans.
`--planned-amount SOURCE_CATEGORY_ID=200` overrides a plan;
`--clear-planned-amount SOURCE_CATEGORY_ID` explicitly clears one.
Each category gets at most one override, and zero is allowed.
Read source categories first; selected/overridden IDs must belong to the source.

## Commit an authorized change

Use a fresh key per intended write; edits require the read revision.

```bash
spendly --agent --json --non-interactive cycles edit "$CYCLE_ID" \
  --name "$NAME" --if-revision "$REVISION" --idempotency-key "$KEY"
```

Creation returns `data.cycle` plus `data.copiedCategories`.
Edits return the cycle directly. Review `CYCLE_OVERLAP` or
`CYCLE_REVISION_CONFLICT` with a fresh read and preview.

## Delete

Deletion permanently removes the cycle and every category. Any linked expense
blocks it with `CYCLE_HAS_EXPENSES`, even if uncategorized or outside edited
dates. Removing categories or editing cycle dates does not resolve the links.
Ask before any additional expense changes not already authorized.

```bash
spendly --agent --json --non-interactive cycles delete "$CYCLE_ID" --dry-run
spendly --agent --json --non-interactive cycles delete "$CYCLE_ID" \
  --confirmation-token "$TOKEN" --if-revision "$REVISION" --idempotency-key "$KEY"
```

Use `data.cycle.revision` and `data.confirmationToken` from the preview.
Review `data.categoryCount` before saving. The token expires after five minutes
and is bound to the user, cycle revision, and category snapshot. A fresh preview
is required after changes; do not silently replace the reviewed token.
A deletion preview saves confirmation metadata only.

For uncertain outcomes, follow [Troubleshooting](troubleshooting.md);
preserve the exact original input and key and stop before an unauthorized retry.
