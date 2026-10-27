"use client";

import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { CategoryForm } from "@/components/category-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export default function NewCategoryModal() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const cycleId = searchParams.get("id") as Id<"expense_cycles">;

	const [open, setOpen] = useState(true);

	const handleOpenChange = useCallback(
		(val: boolean) => {
			setOpen(val);
			if (!val) {
				router.back();
			}
		},
		[router]
	);
	const close = useCallback(() => handleOpenChange(false), [handleOpenChange]);

	if (!cycleId) {
		return null;
	}

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add Category</DialogTitle>
					<DialogDescription>
						Create a new spending category for this cycle.
					</DialogDescription>
				</DialogHeader>
				<CategoryForm className="mt-4" cycleId={cycleId} onSuccess={close} />
			</DialogContent>
		</Dialog>
	);
}
