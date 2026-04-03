"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { CategoryTypeForm } from "./category-type-form";

interface CategoryTypeModalProps {
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: (typeId: string) => void;
	existingTypeNames?: string[];
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
	const setOpen = (val: boolean) => {
		if (isControlled) {
			onOpenChange?.(val);
		} else {
			setInternalOpen(val);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Category Type</DialogTitle>
				</DialogHeader>
				<CategoryTypeForm
					existingTypeNames={existingTypeNames}
					onSuccess={(typeId) => {
						onSuccess?.(typeId);
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
