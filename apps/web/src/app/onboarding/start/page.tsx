"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Target, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const currencies = [
	{ label: "US Dollar ($)", value: "USD" },
	{ label: "Euro (€)", value: "EUR" },
	{ label: "British Pound (£)", value: "GBP" },
	{ label: "Indian Rupee (₹)", value: "INR" },
	{ label: "Japanese Yen (¥)", value: "JPY" },
	{ label: "Canadian Dollar ($)", value: "CAD" },
	{ label: "Australian Dollar ($)", value: "AUD" },
];

export default function OnboardingStartPage() {
	const user = useQuery(api.users.get);
	const updateCurrency = useMutation(api.users.updateCurrency);
	const seedDefaults = useMutation(api.categories.seedDefaults);
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");

	useEffect(() => {
		seedDefaults();
	}, [seedDefaults]);

	useEffect(() => {
		if (user?.currency) {
			setValue(user.currency);
		}
	}, [user?.currency]);

	const handleSelect = (currentValue: string) => {
		setValue(currentValue);
		updateCurrency({ currency: currentValue });
		setOpen(false);
	};

	return (
		<div className="space-y-6">
			<div className="space-y-2 text-center">
				<h1 className="font-bold text-3xl tracking-tight">Welcome to Spendy</h1>
				<p className="text-muted-foreground">
					Let's get you set up. First, choose your currency.
				</p>
			</div>

			<div className="flex justify-center">
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>
						<Button
							aria-expanded={open}
							className="w-[200px] justify-between"
							role="combobox"
							variant="outline"
						>
							{value
								? currencies.find((framework) => framework.value === value)
										?.label
								: "Select currency..."}
							<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-[200px] p-0">
						<Command>
							<CommandInput placeholder="Search currency..." />
							<CommandList>
								<CommandEmpty>No currency found.</CommandEmpty>
								<CommandGroup>
									{currencies.map((framework) => (
										<CommandItem
											key={framework.value}
											onSelect={(_currentValue) => {
												// Command component usually lowercases value
												// We need to match it back to our uppercase codes if needed
												// But here we are using value={framework.value} which is uppercase
												// However, cmdk might lowercase the 'value' passed to onSelect
												// Let's rely on the passed value if it matches, or find it.
												// Actually, simpler to just use framework.value directly in closure
												handleSelect(framework.value);
											}}
											value={framework.value}
										>
											<Check
												className={cn(
													"mr-2 h-4 w-4",
													value === framework.value
														? "opacity-100"
														: "opacity-0"
												)}
											/>
											{framework.label}
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			<div className="space-y-2 text-center">
				<p className="text-muted-foreground">
					Now, choose how you want to start.
				</p>
			</div>

			<div className="mx-auto grid max-w-md gap-4">
				<Link
					className={cn(!value && "pointer-events-none opacity-50")}
					href={value ? "/onboarding/cycle?mode=free" : "#"}
				>
					<Card className="w-full cursor-pointer border-2 transition-colors hover:border-primary hover:bg-muted/50">
						<CardHeader className="flex flex-row items-center gap-4 space-y-0">
							<div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
								<Zap className="h-6 w-6" />
							</div>
							<div className="flex flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<CardTitle className="text-lg">
										Start tracking freely
									</CardTitle>
									<CardDescription className="text-sm">
										Add expenses with minimal setup.
									</CardDescription>
								</div>
							</div>
						</CardHeader>
					</Card>
				</Link>

				<Link
					className={cn(!value && "pointer-events-none opacity-50")}
					href={value ? "/onboarding/cycle?mode=plan" : "#"}
				>
					<Card className="w-full cursor-pointer border-2 transition-colors hover:border-primary hover:bg-muted/50">
						<CardHeader className="flex flex-row items-center gap-4 space-y-0">
							<div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary">
								<Target className="h-6 w-6" />
							</div>
							<div className="flex flex-col gap-1">
								<div className="flex flex-wrap items-center gap-2">
									<CardTitle className="text-lg">Plan & track</CardTitle>
									<CardDescription className="text-sm">
										Set categories and planned amounts before you start.
									</CardDescription>
								</div>
							</div>
						</CardHeader>
					</Card>
				</Link>
			</div>
			<p className="text-center text-muted-foreground text-sm">
				Don't worry, all these settings can be updated later in your dashboard.
			</p>
		</div>
	);
}
