// @vitest-environment jsdom

import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountTypeEditorDialog } from "./account-type-editor-dialog";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	update: vi.fn(),
	query: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	report: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useQuery: (...args: unknown[]) => mocks.query(...args),
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		getFunctionName(reference) === "accountTypes:create"
			? mocks.create
			: mocks.update,
}));
vi.mock("sonner", () => ({
	toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

const accountType: Doc<"account_types"> = {
	_id: "type-savings" as Id<"account_types">,
	_creationTime: 1,
	userId: "user-1" as Id<"users">,
	createdAt: 1,
	order: 0,
	normalizedName: "savings",
	name: "Savings",
	balanceNature: "asset",
	color: "#14B8A6",
	icon: "piggy-bank",
	isArchived: false,
};

const LIABILITY_DESCRIPTION = /Negative balances represent money owed/;
const USAGE_DESCRIPTION = /This type is assigned to/;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.query.mockReturnValue({ accountCount: 0 });
	mocks.create.mockResolvedValue(accountType);
	mocks.update.mockResolvedValue(accountType);
});

describe("AccountTypeEditorDialog", () => {
	it("validates name and hex color, then creates a trimmed liability with selected appearance", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		const onOpenChange = vi.fn();
		render(
			<AccountTypeEditorDialog
				accountType={null}
				onOpenChange={onOpenChange}
				onSuccess={onSuccess}
				open
			/>
		);
		const name = screen.getByLabelText("Name");
		const submit = screen.getByRole("button", { name: "Create type" });
		expect(submit).toBeDisabled();
		const form = name.closest("form");
		if (!form) {
			throw new Error("Missing account type form");
		}
		fireEvent.submit(form);
		expect(
			await screen.findByText("Enter an account type name.")
		).toBeVisible();
		await user.type(name, "  Mortgage  ");
		fireEvent.change(screen.getByLabelText("Choose account type color"), {
			target: { value: "#0ea5e9" },
		});
		expect(screen.getByLabelText("Color", { exact: true })).toHaveValue(
			"#0ea5e9"
		);
		expect(
			screen.queryByText("Enter an account type name.")
		).not.toBeInTheDocument();
		await user.clear(screen.getByLabelText("Color", { exact: true }));
		await user.type(screen.getByLabelText("Color", { exact: true }), "red");
		expect(screen.getByText("Enter a six-digit hex color.")).toBeVisible();
		expect(submit).toBeDisabled();
		fireEvent.submit(form);
		expect(mocks.create).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Use #EF4444" }));
		expect(screen.getByRole("button", { name: "Use #EF4444" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "Credit card" }));
		await user.click(screen.getByLabelText("Balance nature"));
		await user.click(
			screen.getByRole("option", { name: "Liability · money owed" })
		);
		expect(screen.getByText(LIABILITY_DESCRIPTION)).toBeVisible();
		await user.click(submit);
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				name: "Mortgage",
				balanceNature: "liability",
				color: "#EF4444",
				icon: "credit-card",
			})
		);
		expect(onSuccess).toHaveBeenCalledWith(accountType);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(mocks.success).toHaveBeenCalledWith("Account type created");
	});

	it("omits optional create fields when default color and no icon are chosen", async () => {
		const user = userEvent.setup();
		render(
			<AccountTypeEditorDialog accountType={null} onOpenChange={vi.fn()} open />
		);
		await user.type(screen.getByLabelText("Name"), "Cash");
		await user.click(screen.getByRole("button", { name: "Use default" }));
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "No icon" }));
		await user.click(screen.getByRole("button", { name: "Create type" }));
		await waitFor(() =>
			expect(mocks.create).toHaveBeenCalledWith({
				name: "Cash",
				balanceNature: "asset",
				color: undefined,
				icon: undefined,
			})
		);
	});

	it.each([
		undefined,
		{ accountCount: 3 },
	])("locks nature until usage is known and no accounts use it: %j", (usage) => {
		mocks.query.mockReturnValue(usage);
		render(
			<AccountTypeEditorDialog
				accountType={accountType}
				onOpenChange={vi.fn()}
				open
			/>
		);
		expect(screen.getByLabelText("Balance nature")).toBeDisabled();
		expect(screen.getByText("Balance nature is locked")).toBeVisible();
		expect(screen.getByText(USAGE_DESCRIPTION)).toHaveTextContent(
			usage ? "3 accounts" : "one or more accounts"
		);
		expect(mocks.query).toHaveBeenCalledWith(expect.anything(), {
			accountTypeId: accountType._id,
		});
	});

	it("edits an unused type, clears optional fields with null and disables actions while saving", async () => {
		const user = userEvent.setup();
		let finish: (value: Doc<"account_types">) => void = () => undefined;
		mocks.update.mockReturnValue(
			new Promise<Doc<"account_types">>((resolve) => {
				finish = resolve;
			})
		);
		const onOpenChange = vi.fn();
		render(
			<AccountTypeEditorDialog
				accountType={accountType}
				onOpenChange={onOpenChange}
				open
			/>
		);
		expect(screen.getByLabelText("Balance nature")).toBeEnabled();
		await user.clear(screen.getByLabelText("Name"));
		await user.type(screen.getByLabelText("Name"), "  Reserve  ");
		await user.click(screen.getByRole("button", { name: "Use default" }));
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "No icon" }));
		await user.click(screen.getByRole("button", { name: "Save changes" }));
		expect(mocks.update).toHaveBeenCalledWith({
			accountTypeId: accountType._id,
			name: "Reserve",
			balanceNature: "asset",
			color: null,
			icon: null,
		});
		expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		finish(accountType);
		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
		expect(mocks.success).toHaveBeenCalledWith("Account type updated");
	});

	it.each([
		false,
		true,
	])("keeps failed %s saves open and reports a safe actionable error", async (editing) => {
		const user = userEvent.setup();
		const error = new Error("ACCOUNT_TYPE_NAME_TAKEN");
		(editing ? mocks.update : mocks.create).mockRejectedValueOnce(error);
		const onOpenChange = vi.fn();
		const onSuccess = vi.fn();
		render(
			<AccountTypeEditorDialog
				accountType={
					editing ? { ...accountType, color: undefined, icon: undefined } : null
				}
				onOpenChange={onOpenChange}
				onSuccess={onSuccess}
				open
			/>
		);
		if (!editing) {
			await user.type(screen.getByLabelText("Name"), "Savings");
		}
		await user.click(
			screen.getByRole("button", {
				name: editing ? "Save changes" : "Create type",
			})
		);
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"An account type with this name already exists."
			)
		);
		expect(mocks.report).toHaveBeenCalledWith(error, {
			feature: "account-types",
			operation: editing ? "update" : "create",
		});
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", {
				name: editing ? "Save changes" : "Create type",
			})
		).toBeEnabled();
	});

	it("cancels without a mutation and skips usage queries for a closed dialog", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		const { rerender } = render(
			<AccountTypeEditorDialog
				accountType={null}
				onOpenChange={onOpenChange}
				open
			/>
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(mocks.create).not.toHaveBeenCalled();
		rerender(
			<AccountTypeEditorDialog
				accountType={accountType}
				onOpenChange={onOpenChange}
				open={false}
			/>
		);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(mocks.query).toHaveBeenLastCalledWith(expect.anything(), "skip");
	});
});
