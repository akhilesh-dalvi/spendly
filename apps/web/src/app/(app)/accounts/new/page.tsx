"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { AccountForm } from "@/components/account-form";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewAccountPage() {
	const router = useRouter();
	const user = useQuery(api.users.get);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-3">
			<header className="flex items-center gap-4">
				<Button
					aria-label="Back to accounts"
					onClick={() => router.push("/accounts")}
					size="icon"
					variant="ghost"
				>
					<ChevronLeft />
				</Button>
				<div className="flex flex-col gap-1">
					<h1 className="font-bold text-3xl tracking-tight">New account</h1>
					<p className="text-muted-foreground text-sm">
						Add an opening snapshot. Future activity will keep the balance
						current.
					</p>
				</div>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>Account details</CardTitle>
					<CardDescription>
						You can change the name and type later.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{user === undefined ? (
						<div className="flex flex-col gap-4">
							<Skeleton className="h-9 w-full" />
							<Skeleton className="h-9 w-full" />
							<Skeleton className="h-9 w-full" />
						</div>
					) : (
						<AccountForm
							defaultCurrency={user.currency ?? "USD"}
							onSuccess={(accountId) => router.push(`/accounts/${accountId}`)}
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
