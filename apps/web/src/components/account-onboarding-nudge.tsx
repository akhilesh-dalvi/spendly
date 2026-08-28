"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { ArrowRight, WalletCards } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AccountOnboardingNudge() {
	const dismissAccountsOnboarding = useMutation(
		api.users.dismissAccountsOnboarding
	);
	const [isDismissing, setIsDismissing] = useState(false);

	const handleDismiss = async () => {
		setIsDismissing(true);
		try {
			await dismissAccountsOnboarding({});
		} catch (_error) {
			toast.error("We couldn't dismiss this reminder. Please try again.");
			setIsDismissing(false);
		}
	};

	return (
		<div className="flex flex-col gap-4 border-t bg-primary/[0.035] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<div className="flex min-w-0 gap-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<WalletCards className="size-4" />
				</div>
				<div className="min-w-0">
					<p className="font-medium text-sm">
						Make every expense update a balance
					</p>
					<p className="mt-0.5 text-muted-foreground text-xs leading-5">
						Add the cash, bank, wallet, or credit account you use most often.
					</p>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
				<Button
					disabled={isDismissing}
					onClick={handleDismiss}
					size="sm"
					type="button"
					variant="ghost"
				>
					Not now
				</Button>
				<Button asChild size="sm">
					<Link href="/accounts/new">
						Add account
						<ArrowRight data-icon="inline-end" />
					</Link>
				</Button>
			</div>
		</div>
	);
}
