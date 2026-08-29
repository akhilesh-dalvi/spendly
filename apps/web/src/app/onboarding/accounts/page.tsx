"use client";

import { api } from "@spendly/backend/convex/_generated/api";
import type { Id } from "@spendly/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowRight,
	CheckCircle2,
	LoaderCircle,
	LockKeyhole,
	Plus,
	WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OnboardingStepControls } from "@/components/onboarding-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getCurrencySymbol } from "@/lib/currencies";

const ADD_ACCOUNT_TYPE_VALUE = "__add-account-type__";

function OnboardingSuccess({ accountCreated }: { accountCreated: boolean }) {
	return (
		<Card className="gap-0 overflow-hidden py-0 shadow-sm">
			<CardContent className="px-5 py-10 text-center sm:px-10 sm:py-14">
				<div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
					<CheckCircle2 className="size-8" />
				</div>
				<Badge className="mt-6" variant="secondary">
					Setup complete
				</Badge>
				<h1 className="mt-4 text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
					Spendly is ready for your first expense.
				</h1>
				<p className="mx-auto mt-3 max-w-lg text-pretty text-muted-foreground leading-6">
					{accountCreated
						? "Your cycle, setup choices, and first account are saved."
						: "Your cycle and setup choices are saved. You can add an account whenever it becomes useful."}
				</p>
				<div className="mx-auto mt-8 grid max-w-sm gap-3 sm:grid-cols-2">
					<Button asChild size="lg">
						<Link href="/expenses/new">
							<Plus /> Add your first expense
						</Link>
					</Button>
					<Button asChild size="lg" variant="outline">
						<Link href="/dashboard">View dashboard</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export default function OnboardingAccountsPage() {
	const router = useRouter();
	const onboardingState = useQuery(api.users.getOnboardingState);
	const accountTypes = useQuery(api.accountTypes.list, {});
	const createAccount = useMutation(api.accounts.createOnboardingAccount);
	const createAccountType = useMutation(api.accountTypes.create);
	const completeOnboarding = useMutation(api.users.completeOnboarding);
	const [name, setName] = useState("");
	const [accountTypeId, setAccountTypeId] = useState<Id<"account_types">>();
	const [openingBalance, setOpeningBalance] = useState("0");
	const [customTypeName, setCustomTypeName] = useState("");
	const [customTypeNature, setCustomTypeNature] = useState<
		"asset" | "liability"
	>("asset");
	const [isAccountTypeDialogOpen, setIsAccountTypeDialogOpen] = useState(false);
	const [isCreatingType, setIsCreatingType] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSkipping, setIsSkipping] = useState(false);
	const [showSuccess, setShowSuccess] = useState(false);
	const [createdAccount, setCreatedAccount] = useState(false);
	const [nameError, setNameError] = useState<string>();
	const [typeError, setTypeError] = useState<string>();
	const [balanceError, setBalanceError] = useState<string>();
	const [formError, setFormError] = useState<string>();
	const [customTypeError, setCustomTypeError] = useState<string>();
	const initialStateHandled = useRef(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!onboardingState || initialStateHandled.current) {
			return;
		}
		initialStateHandled.current = true;
		if (onboardingState.step === "complete") {
			router.replace("/dashboard");
		}
	}, [onboardingState, router]);

	useEffect(() => {
		if (!accountTypeId && accountTypes?.[0]) {
			setAccountTypeId(accountTypes[0]._id);
		}
	}, [accountTypeId, accountTypes]);

	const handleCreateType = async () => {
		if (!customTypeName.trim()) {
			setCustomTypeError("Enter a name for the account type.");
			return;
		}
		setIsCreatingType(true);
		setCustomTypeError(undefined);
		try {
			const accountType = await createAccountType({
				balanceNature: customTypeNature,
				name: customTypeName,
			});
			setAccountTypeId(accountType._id);
			setTypeError(undefined);
			setCustomTypeName("");
			setCustomTypeNature("asset");
			setIsAccountTypeDialogOpen(false);
		} catch (_error) {
			setCustomTypeError(
				"We couldn't create that account type. Try a different name."
			);
		} finally {
			setIsCreatingType(false);
		}
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const normalizedName = name.trim();
		const parsedBalance = Number(openingBalance);
		const nextNameError = normalizedName ? undefined : "Enter an account name.";
		const nextTypeError = accountTypeId ? undefined : "Choose an account type.";
		const nextBalanceError = Number.isFinite(parsedBalance)
			? undefined
			: "Enter a valid opening balance.";
		setNameError(nextNameError);
		setTypeError(nextTypeError);
		setBalanceError(nextBalanceError);
		setFormError(undefined);
		if (nextNameError) {
			nameInputRef.current?.focus();
			return;
		}
		if (nextTypeError || nextBalanceError || !accountTypeId) {
			return;
		}

		setIsSubmitting(true);
		try {
			await createAccount({
				accountTypeId,
				name: normalizedName,
				openingBalance: parsedBalance,
			});
			setCreatedAccount(true);
			setShowSuccess(true);
		} catch (_error) {
			setFormError(
				"We couldn't create your account. Your entries are still here—please try again."
			);
			setIsSubmitting(false);
		}
	};

	const handleSkip = async () => {
		setIsSkipping(true);
		setFormError(undefined);
		try {
			await completeOnboarding({ accountStatus: "skipped" });
			setCreatedAccount(false);
			setShowSuccess(true);
		} catch (_error) {
			setFormError("We couldn't skip this step. Please try again.");
			setIsSkipping(false);
		}
	};

	if (showSuccess) {
		return <OnboardingSuccess accountCreated={createdAccount} />;
	}
	const currencySymbol = getCurrencySymbol(onboardingState?.currency ?? "USD");

	return (
		<Card className="gap-0 overflow-hidden py-0 shadow-sm">
			<CardHeader className="border-b bg-muted/25 px-5 py-6 sm:px-8">
				<div className="flex items-center gap-3">
					<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
						<WalletCards className="size-5" />
					</div>
					<CardTitle className="text-2xl">Add your first account</CardTitle>
				</div>
				<p className="max-w-2xl text-muted-foreground leading-6">
					This optional step gives expenses a useful home and keeps a running
					balance. You can skip it and add an account later.
				</p>
			</CardHeader>

			<CardContent className="px-5 py-6 sm:px-8 sm:py-8">
				<form className="flex flex-col gap-7" onSubmit={handleSubmit}>
					<div className="grid gap-5 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-name">Account name</Label>
							<Input
								aria-invalid={Boolean(nameError)}
								id="account-name"
								onChange={(event) => {
									setName(event.target.value);
									setNameError(undefined);
								}}
								placeholder="Everyday checking"
								ref={nameInputRef}
								value={name}
							/>
							{nameError ? (
								<p className="text-destructive text-sm" role="alert">
									{nameError}
								</p>
							) : null}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="account-type">Account type</Label>
							<Select
								onValueChange={(value) => {
									if (value === ADD_ACCOUNT_TYPE_VALUE) {
										setCustomTypeError(undefined);
										setIsAccountTypeDialogOpen(true);
										return;
									}
									setAccountTypeId(value as Id<"account_types">);
									setTypeError(undefined);
								}}
								value={accountTypeId ?? ""}
							>
								<SelectTrigger
									aria-invalid={Boolean(typeError)}
									className="w-full"
									id="account-type"
								>
									<SelectValue placeholder="Choose an account type" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{accountTypes?.map((accountType) => (
											<SelectItem key={accountType._id} value={accountType._id}>
												{accountType.name}
											</SelectItem>
										))}
									</SelectGroup>
									<SelectSeparator />
									<SelectGroup>
										<SelectItem value={ADD_ACCOUNT_TYPE_VALUE}>
											<Plus /> Add account type
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							{typeError ? (
								<p className="text-destructive text-sm" role="alert">
									{typeError}
								</p>
							) : null}
						</div>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="opening-balance">Opening balance</Label>
						<div className="relative">
							<span
								aria-hidden="true"
								className="absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm"
							>
								{currencySymbol}
							</span>
							<Input
								aria-invalid={Boolean(balanceError)}
								className="pl-8 tabular-nums"
								id="opening-balance"
								inputMode="decimal"
								onChange={(event) => {
									setOpeningBalance(event.target.value);
									setBalanceError(undefined);
								}}
								step="0.01"
								type="number"
								value={openingBalance}
							/>
						</div>
						<p className="text-muted-foreground text-sm">
							This opening entry stays fixed for a clear history. Correct the
							current balance later with an adjustment.
						</p>
						{balanceError ? (
							<p className="text-destructive text-sm" role="alert">
								{balanceError}
							</p>
						) : null}
					</div>

					<div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
						<LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
						<p>
							<span className="font-medium">Private by design.</span> Spendly
							never connects to your bank. You enter only a name, type, and
							opening balance.
						</p>
					</div>

					<Dialog
						onOpenChange={(open) => {
							setIsAccountTypeDialogOpen(open);
							if (!open) {
								setCustomTypeError(undefined);
							}
						}}
						open={isAccountTypeDialogOpen}
					>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Add account type</DialogTitle>
								<DialogDescription>
									Create a type when the suggested options do not fit your
									account.
								</DialogDescription>
							</DialogHeader>
							<div className="flex flex-col gap-4">
								<div className="flex flex-col gap-2">
									<Label htmlFor="custom-account-type-name">
										Account type name
									</Label>
									<Input
										aria-invalid={Boolean(customTypeError)}
										id="custom-account-type-name"
										onChange={(event) => {
											setCustomTypeName(event.target.value);
											setCustomTypeError(undefined);
										}}
										placeholder="Investment"
										value={customTypeName}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="custom-account-type-nature">
										Balance treatment
									</Label>
									<Select
										onValueChange={(value) =>
											setCustomTypeNature(value as "asset" | "liability")
										}
										value={customTypeNature}
									>
										<SelectTrigger
											className="w-full"
											id="custom-account-type-nature"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="asset">Money available</SelectItem>
												<SelectItem value="liability">Money owed</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
									<p className="text-muted-foreground text-sm">
										Choose whether this account holds money or represents money
										you owe.
									</p>
								</div>
								{customTypeError ? (
									<p className="text-destructive text-sm" role="alert">
										{customTypeError}
									</p>
								) : null}
							</div>
							<DialogFooter showCloseButton>
								<Button
									disabled={isCreatingType}
									onClick={handleCreateType}
									type="button"
								>
									{isCreatingType ? (
										<LoaderCircle className="animate-spin" />
									) : (
										<Plus />
									)}{" "}
									Add account type
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					<div aria-live="polite">
						{formError ? (
							<p className="mb-3 text-destructive text-sm" role="alert">
								{formError}
							</p>
						) : null}
						<OnboardingStepControls>
							<Button
								disabled={isSkipping || isSubmitting}
								onClick={handleSkip}
								type="button"
								variant="ghost"
							>
								{isSkipping ? <LoaderCircle className="animate-spin" /> : null}{" "}
								Skip account setup
							</Button>
							<Button
								disabled={
									isSkipping || isSubmitting || accountTypes === undefined
								}
								size="lg"
								type="submit"
							>
								{isSubmitting ? (
									<LoaderCircle className="animate-spin" />
								) : null}{" "}
								Create account and finish {isSubmitting ? null : <ArrowRight />}
							</Button>
						</OnboardingStepControls>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
