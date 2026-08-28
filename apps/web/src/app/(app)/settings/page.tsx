"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, ChevronLeft, Globe, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from "@/lib/currencies";

export default function SettingsPage() {
	const { user: clerkUser } = useUser();
	const convexUser = useQuery(api.users.get);
	const updateCurrency = useMutation(api.users.updateCurrency);
	const { theme, setTheme } = useTheme();
	const { openUserProfile } = useClerk();

	const handleCurrencyChange = async (value: string) => {
		if (!isSupportedCurrency(value)) {
			toast.error("Unsupported currency");
			return;
		}
		try {
			await updateCurrency({ currency: value });
			toast.success(`Currency updated to ${value}`);
		} catch (_error) {
			toast.error("Failed to update currency");
		}
	};

	if (convexUser === undefined) {
		return null;
	}

	return (
		<div className="space-y-8 py-3">
			<div className="flex items-center gap-4">
				<Button asChild size="icon" variant="ghost">
					<Link href="/dashboard">
						<ChevronLeft className="h-5 w-5" />
					</Link>
				</Button>
				<div>
					<h1 className="font-bold text-3xl tracking-tight">Settings</h1>
					<p className="text-muted-foreground text-sm">
						Manage your account settings and preferences.
					</p>
				</div>
			</div>

			<div className="grid gap-8">
				{/* Profile Section */}
				<Card className="overflow-hidden border-none bg-accent/5 shadow-none">
					<CardContent className="space-y-6">
						<div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
							<div className="flex items-center gap-4">
								<Avatar className="h-16 w-16 border-2 border-background shadow-sm">
									<AvatarImage src={clerkUser?.imageUrl} />
									<AvatarFallback className="bg-primary/5 text-xl">
										{clerkUser?.firstName?.[0] ||
											clerkUser?.emailAddresses[0]?.emailAddress[0]}
									</AvatarFallback>
								</Avatar>
								<div className="space-y-1">
									<p className="font-medium text-lg leading-none">
										{clerkUser?.fullName}
									</p>
									<p className="text-muted-foreground text-sm">
										{clerkUser?.primaryEmailAddress?.emailAddress}
									</p>
								</div>
							</div>
							<Button onClick={() => openUserProfile()} variant="outline">
								Manage Profile
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* Preferences Section */}
				<section className="space-y-4">
					<div className="flex items-center gap-2">
						<BadgeCheck className="h-4 w-4 text-primary" />
						<h2 className="font-semibold text-lg">Preferences</h2>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center gap-2">
									<Globe className="h-4 w-4 text-muted-foreground" />
									<CardTitle className="text-base">Currency</CardTitle>
								</div>
								<CardDescription>
									Primary currency for your expenses.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Select
									onValueChange={handleCurrencyChange}
									value={convexUser.currency || "USD"}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select currency" />
									</SelectTrigger>
									<SelectContent>
										{SUPPORTED_CURRENCIES.map((c) => (
											<SelectItem key={c.value} value={c.value}>
												{c.label} ({c.value})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</CardContent>
						</Card>

						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center gap-2">
									{theme === "dark" ? (
										<Moon className="h-4 w-4 text-muted-foreground" />
									) : (
										<Sun className="h-4 w-4 text-muted-foreground" />
									)}
									<CardTitle className="text-base">Theme</CardTitle>
								</div>
								<CardDescription>
									Switch between light and dark mode.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex gap-2">
									<Button
										className="flex-1"
										onClick={() => setTheme("light")}
										size="sm"
										variant={theme === "light" ? "secondary" : "ghost"}
									>
										<Sun className="mr-2 h-4 w-4" />
										Light
									</Button>
									<Button
										className="flex-1"
										onClick={() => setTheme("dark")}
										size="sm"
										variant={theme === "dark" ? "secondary" : "ghost"}
									>
										<Moon className="mr-2 h-4 w-4" />
										Dark
									</Button>
									<Button
										className="flex-1"
										onClick={() => setTheme("system")}
										size="sm"
										variant={theme === "system" ? "secondary" : "ghost"}
									>
										System
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</section>
			</div>
		</div>
	);
}
