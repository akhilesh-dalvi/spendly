// @vitest-environment jsdom

import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountForm } from "./account-form";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	update: vi.fn(),
	createType: vi.fn(),
	updateType: vi.fn(),
	query: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"accounts:create": mocks.create,
			"accounts:update": mocks.update,
			"accountTypes:create": mocks.createType,
			"accountTypes:update": mocks.updateType,
		})[getFunctionName(reference)],
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const checking: Doc<"account_types"> = {
	_id: "type-checking" as Id<"account_types">,
	_creationTime: 1,
	userId: "user-1" as Id<"users">,
	createdAt: 1,
	order: 0,
	normalizedName: "checking",
	name: "Checking",
	balanceNature: "asset",
	isArchived: false,
	color: "#14B8A6",
	icon: "landmark",
};
const credit: Doc<"account_types"> = {
	...checking,
	_id: "type-credit" as Id<"account_types">,
	name: "Credit",
	balanceNature: "liability",
	color: undefined,
	icon: undefined,
};
const archived: Doc<"account_types"> = {
	...credit,
	_id: "type-old" as Id<"account_types">,
	name: "Old credit",
	isArchived: true,
};
const accountId = "account-1" as Id<"accounts">;
const OLD_CREDIT = /Old credit/;
const LIABILITY_DESCRIPTION = /Tracks money owed/;
const OPENING_BALANCE = /Opening balance/;
const ARCHIVED_CREDIT = /Old credit.*Archived/;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(reference) === "accountTypes:list"
				? [checking, credit, archived]
				: { accountCount: 0 }
	);
	mocks.create.mockResolvedValue({ _id: accountId });
	mocks.update.mockResolvedValue(undefined);
	mocks.createType.mockResolvedValue(credit);
	mocks.updateType.mockResolvedValue(credit);
});

describe("AccountForm", () => {
	it("requires a non-whitespace name and creates an account with a negative opening balance", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(<AccountForm defaultCurrency="INR" onSuccess={onSuccess} />);
		await user.type(screen.getByLabelText("Account name"), "   ");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		expect(screen.getByText("Enter an account name.")).toBeVisible();
		expect(screen.getByLabelText("Account name")).toHaveAttribute(
			"aria-invalid",
			"true"
		);
		expect(mocks.create).not.toHaveBeenCalled();
		await user.clear(screen.getByLabelText("Account name"));
		await user.type(screen.getByLabelText("Account name"), "  Everyday  ");
		await user.click(screen.getByLabelText("Account type"));
		expect(
			screen.queryByRole("option", { name: OLD_CREDIT })
		).not.toBeInTheDocument();
		await user.click(screen.getByRole("option", { name: "Credit" }));
		expect(screen.getByText(LIABILITY_DESCRIPTION)).toBeVisible();
		await user.clear(screen.getByLabelText("Opening balance (INR)"));
		await user.type(screen.getByLabelText("Opening balance (INR)"), "-120.50");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(accountId));
		expect(mocks.create).toHaveBeenCalledWith({
			name: "Everyday",
			accountTypeId: credit._id,
			startingBalance: -120.5,
		});
		expect(mocks.success).toHaveBeenCalledWith("Account created");
	});

	it("disables loading and unavailable types, provides management navigation and validates forced submission", async () => {
		const user = userEvent.setup();
		mocks.query.mockReturnValue(undefined);
		const { rerender } = render(
			<AccountForm defaultCurrency="USD" onSuccess={vi.fn()} />
		);
		expect(screen.getByLabelText("Account type")).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Create account" })
		).toBeDisabled();
		mocks.query.mockReturnValue([archived]);
		rerender(<AccountForm defaultCurrency="USD" onSuccess={vi.fn()} />);
		expect(screen.getByText("Create an account type first")).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Manage account types" })
		).toHaveAttribute("href", "/data/account-types");
		await user.type(screen.getByLabelText("Account name"), "Cash");
		const form = screen.getByLabelText("Account name").closest("form");
		if (!form) {
			throw new Error("Missing account form");
		}
		fireEvent.submit(form);
		expect(screen.getByText("Choose an account type.")).toBeVisible();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("retains an archived current type when editing and never sends an opening balance", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		render(
			<AccountForm
				accountId={accountId}
				defaultCurrency="USD"
				defaultValues={{ name: "Old card", accountTypeId: archived._id }}
				onSuccess={onSuccess}
			/>
		);
		expect(screen.getByText("Current type is archived")).toBeVisible();
		expect(screen.queryByLabelText(OPENING_BALANCE)).not.toBeInTheDocument();
		await user.click(screen.getByLabelText("Account type"));
		expect(screen.getByRole("option", { name: ARCHIVED_CREDIT })).toBeVisible();
		await user.keyboard("{Escape}");
		await user.clear(screen.getByLabelText("Account name"));
		await user.type(screen.getByLabelText("Account name"), "  Renamed card ");
		await user.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(accountId));
		expect(mocks.update).toHaveBeenCalledWith({
			accountId,
			accountTypeId: archived._id,
			name: "Renamed card",
		});
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.success).toHaveBeenCalledWith("Account updated");
	});

	it("keeps an archived type editable even when there are no active types", () => {
		mocks.query.mockReturnValue([archived]);
		render(
			<AccountForm
				accountId={accountId}
				defaultCurrency="USD"
				defaultValues={{ name: "Old card", accountTypeId: archived._id }}
				onSuccess={vi.fn()}
			/>
		);
		expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
		expect(
			screen.queryByText("Create an account type first")
		).not.toBeInTheDocument();
	});

	it("prevents duplicate submissions while the create mutation is pending", async () => {
		const user = userEvent.setup();
		let finish: (value: { _id: Id<"accounts"> }) => void = () => undefined;
		mocks.create.mockReturnValueOnce(
			new Promise<{ _id: Id<"accounts"> }>((resolve) => {
				finish = resolve;
			})
		);
		render(<AccountForm defaultCurrency="USD" onSuccess={vi.fn()} />);
		await user.type(screen.getByLabelText("Account name"), "Cash");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		expect(
			screen.getByRole("button", { name: "Create account" })
		).toBeDisabled();
		expect(mocks.create).toHaveBeenCalledWith({
			name: "Cash",
			accountTypeId: checking._id,
			startingBalance: 0,
		});
		finish({ _id: accountId });
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Create account" })
			).toBeEnabled()
		);
	});

	it.each([
		"create",
		"update",
		"missing-result",
	])("reports %s failures without invoking success and allows retry", async (mode) => {
		const user = userEvent.setup();
		const failure = new Error("ACCOUNT_TYPE_ARCHIVED");
		if (mode === "missing-result") {
			mocks.create.mockResolvedValueOnce(null);
		} else {
			(mode === "update" ? mocks.update : mocks.create).mockRejectedValueOnce(
				failure
			);
		}
		const onSuccess = vi.fn();
		render(
			<AccountForm
				accountId={mode === "update" ? accountId : undefined}
				defaultCurrency="USD"
				defaultValues={{ name: "Cash", accountTypeId: checking._id }}
				onSuccess={onSuccess}
			/>
		);
		await user.click(
			screen.getByRole("button", {
				name: mode === "update" ? "Save changes" : "Create account",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				mode === "missing-result"
					? "Failed to create account"
					: "This account type is archived. Reactivate it before assigning it."
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), {
			feature: "accounts",
			operation: mode === "update" ? "update" : "create",
		});
		expect(onSuccess).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", {
				name: mode === "update" ? "Save changes" : "Create account",
			})
		).toBeEnabled();
	});

	it("creates a type from the empty state and assigns it through the updated selector", async () => {
		const user = userEvent.setup();
		mocks.query.mockReturnValue([]);
		// Publish the saved type in the query snapshot as its mutation completes.
		mocks.createType.mockImplementationOnce(() => {
			mocks.query.mockImplementation(
				(reference: Parameters<typeof getFunctionName>[0]) =>
					getFunctionName(reference) === "accountTypes:list"
						? [checking, credit]
						: { accountCount: 0 }
			);
			return Promise.resolve(credit);
		});
		render(
			<AccountForm
				allowAccountTypeManagement
				defaultCurrency="USD"
				onSuccess={vi.fn()}
			/>
		);
		await user.click(screen.getByLabelText("Account type"));
		expect(screen.getByText("No active account types yet.")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Edit selected" })
		).toBeDisabled();
		await user.keyboard("{Escape}");
		await user.click(
			screen.getByRole("button", { name: "Create account type" })
		);
		await user.type(screen.getByLabelText("Name", { exact: true }), "Credit");
		await user.click(screen.getByRole("button", { name: "Create type" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		await user.click(screen.getByLabelText("Account type"));
		await user.click(screen.getByRole("option", { name: "Credit" }));
		expect(screen.getByLabelText("Account type")).toHaveTextContent("Credit");
		await user.type(screen.getByLabelText("Account name"), "My card");
		await user.click(screen.getByRole("button", { name: "Create account" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				accountTypeId: credit._id,
				name: "My card",
				startingBalance: 0,
			})
		);
	});

	it("opens management from the select, edits the selected type and cancels a new type", async () => {
		const user = userEvent.setup();
		render(
			<AccountForm
				allowAccountTypeManagement
				defaultCurrency="USD"
				onSuccess={vi.fn()}
			/>
		);
		await user.click(screen.getByLabelText("Account type"));
		await user.click(screen.getByRole("button", { name: "Edit selected" }));
		expect(
			screen.getByRole("dialog", { name: "Edit account type" })
		).toBeVisible();
		expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
			"Checking"
		);
		await user.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		await user.click(screen.getByLabelText("Account type"));
		await user.click(screen.getByRole("button", { name: "New type" }));
		expect(
			screen.getByRole("dialog", { name: "Create account type" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(mocks.createType).not.toHaveBeenCalled();
	});
});
