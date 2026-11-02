"use client";

import { useCallback, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { CategoryTypeForm } from "./category-type-form";

interface CategoryTypeModalProps {
	existingTypeNames?: string[];
	onOpenChange?: (open: boolean) => void;
	onSuccess?: (typeId: string) => void;
	open?: boolean;
	trigger?: React.ReactNode;
}

export function CategoryTypeModal({
	trigger,
	open: controlledOpen,
	onOpenChange,
	onSuccess,
	existingTypeNames,
}: CategoryTypeModalProps) {
	const [internalOpen, setInternalOpen] = useState(false);

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const setOpen = useCallback(
		(val: boolean) => {
			if (isControlled) {
				onOpenChange?.(val);
			} else {
				setInternalOpen(val);
			}
		},
		[isControlled, onOpenChange]
	);
	const handleSuccess = useCallback(
		(typeId: string) => {
			onSuccess?.(typeId);
			setOpen(false);
		},
		[onSuccess, setOpen]
	);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Category Type</DialogTitle>
				</DialogHeader>
				<CategoryTypeForm
					existingTypeNames={existingTypeNames}
					onSuccess={handleSuccess}
				/>
			</DialogContent>
		</Dialog>
	);
}
