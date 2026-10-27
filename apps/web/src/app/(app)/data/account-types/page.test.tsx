// @vitest-environment jsdom

import type { Doc, Id } from "@spendly/backend/convex/_generated/dataModel";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountTypesPage from "./page";

const mocks = vi.hoisted(() => ({
	archive: vi.fn(),
	create: vi.fn(),
	error: vi.fn(),
	query: vi.fn(),
	remove: vi.fn(),
	seed: vi.fn(),
	success: vi.fn(),
	update: vi.fn(),
}));
vi.mock("convex/react", () => ({
	useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
		({
			"accountTypes:archive": mocks.archive,
			"accountTypes:create": mocks.create,
			"accountTypes:remove": mocks.remove,
			"accountTypes:seedDefaults": mocks.seed,
			"accountTypes:update": mocks.update,
		})[getFunctionName(reference)],
	useQuery: (...args: unknown[]) => mocks.query(...args),
}));
vi.mock("sonner", () => ({
	toast: { error: mocks.error, success: mocks.success },
}));

const bank: Doc<"account_types"> = {
	_creationTime: 1,
	_id: "type-bank" as Id<"account_types">,
	balanceNature: "asset",
	color: "#14B8A6",
	createdAt: 1,
	icon: "landmark",
	isArchived: false,
	name: "Bank",
	normalizedName: "bank",
	order: 0,
	userId: "user-1" as Id<"users">,
};
const debt: Doc<"account_types"> = {
	...bank,
	_id: "type-debt" as Id<"account_types">,
	balanceNature: "liability",
	color: undefined,
	icon: undefined,
	isArchived: true,
	name: "Debt",
};
const unused: Doc<"account_types"> = {
	...bank,
	_id: "type-unused" as Id<"account_types">,
	name: "Travel",
};
const LIABILITY_DESCRIPTION = /Negative balances represent money owed/;
const USAGE_DESCRIPTION = /This type is assigned to/;
const queryValues = (
	types: Doc<"account_types">[] | undefined,
	usage:
		| { accountCount: number; canDelete: boolean; hasMoreAccounts?: boolean }
		| undefined = { accountCount: 0, canDelete: true }
) => {
	mocks.query.mockImplementation(
		(reference: Parameters<typeof getFunctionName>[0]) =>
			getFunctionName(reference) === "accountTypes:list" ? types : usage
	);
};
const openMenu = async (
	user: ReturnType<typeof userEvent.setup>,
	name: string
) => {
	await user.click(screen.getByRole("button", { name: `Manage ${name}` }));
};

beforeEach(() => {
	vi.clearAllMocks();
	queryValues([bank, debt, unused]);
	mocks.create.mockResolvedValue(bank);
	mocks.update.mockResolvedValue(bank);
	mocks.archive.mockResolvedValue(undefined);
	mocks.remove.mockResolvedValue(undefined);
	mocks.seed.mockResolvedValue({ createdCount: 6 });
});

describe("AccountTypesPage", () => {
	it("transitions from loading to an actionable empty state", async () => {
		const user = userEvent.setup();
		queryValues(undefined);
		const { rerender } = render(<AccountTypesPage />);
		expect(screen.queryByText("No account types yet")).not.toBeInTheDocument();
		expect(
			screen.queryByLabelText("Account type overview")
		).not.toBeInTheDocument();
		queryValues([]);
		rerender(<AccountTypesPage />);
		expect(screen.getByText("No account types yet")).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Back to dashboard" })
		).toHaveAttribute("href", "/dashboard");
		await user.click(screen.getByRole("button", { name: "Create a type" }));
		expect(
			screen.getByRole("dialog", { name: "Create account type" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it("summarizes active and liability types and blocks deletion while usage is unknown or in use", async () => {
		const user = userEvent.setup();
		queryValues([bank, debt], undefined);
		// Explicitly simulate a loading usage response rather than the helper's default value.
		mocks.query.mockImplementation(
			(reference: Parameters<typeof getFunctionName>[0]) =>
				getFunctionName(reference) === "accountTypes:list"
					? [bank, debt]
					: undefined
		);
		const { rerender } = render(<AccountTypesPage />);
		const summary = screen.getByLabelText("Account type overview");
		expect(within(summary).getByText("Total Types")).toBeVisible();
		expect(within(summary).getByText("2")).toBeVisible();
		expect(screen.getByText("Historical use only")).toBeVisible();
		expect(screen.getByText("Money owed")).toBeVisible();
		await openMenu(user, "Bank");
		expect(
			screen.getByRole("menuitem", { name: "Delete permanently" })
		).toHaveAttribute("aria-disabled", "true");
		await user.keyboard("{Escape}");
		queryValues([bank, debt], { accountCount: 1, canDelete: false });
		rerender(<AccountTypesPage />);
		expect(screen.getAllByText("1 account · deletion blocked")).toHaveLength(2);
		queryValues([bank, debt], {
			accountCount: 100,
			canDelete: false,
			hasMoreAccounts: true,
		});
		rerender(<AccountTypesPage />);
		expect(
			screen.getAllByText("100+ accounts · deletion blocked")
		).toHaveLength(2);
	});

	it.each([
		[0, "All default account types already exist"],
		[1, "1 default type restored"],
		[4, "4 default types restored"],
	])(
		"restores defaults with an accurate count: %s",
		async (createdCount, message) => {
			const user = userEvent.setup();
			mocks.seed.mockResolvedValueOnce({ createdCount });
			render(<AccountTypesPage />);
			await user.click(
				screen.getByRole("button", { name: "Restore defaults" })
			);
			await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(message));
			expect(mocks.seed).toHaveBeenCalledWith({});
		}
	);

	it("disables restoring while pending and recovers after a failure", async () => {
		const user = userEvent.setup();
		let reject: (error: Error) => void = () => undefined;
		mocks.seed.mockReturnValueOnce(
			new Promise((_, rejectPromise) => {
				reject = rejectPromise;
			})
		);
		render(<AccountTypesPage />);
		await user.click(screen.getByRole("button", { name: "Restore defaults" }));
		expect(
			screen.getByRole("button", { name: "Restore defaults" })
		).toBeDisabled();
		reject(new Error("offline"));
		await waitFor(() =>
			expect(mocks.error).toHaveBeenCalledWith(
				"Failed to restore default types"
			)
		);
		expect(
			screen.getByRole("button", { name: "Restore defaults" })
		).toBeEnabled();
	});

	it("validates create name and color and saves a trimmed liability type with selected icon and color", async () => {
		const user = userEvent.setup();
		render(<AccountTypesPage />);
		await user.click(screen.getByRole("button", { name: "New type" }));
		const name = screen.getByLabelText("Name");
		const form = name.closest("form");
		if (!form) {
			throw new Error("Missing create form");
		}
		fireEvent.submit(form);
		expect(screen.getByText("Enter an account type name.")).toBeVisible();
		await user.type(name, "  Mortgage  ");
		await user.clear(screen.getByLabelText("Color", { exact: true }));
		await user.type(screen.getByLabelText("Color", { exact: true }), "#abc");
		expect(screen.getByText("Enter a six-digit hex color.")).toBeVisible();
		expect(screen.getByRole("button", { name: "Create type" })).toBeDisabled();
		fireEvent.submit(form);
		expect(mocks.create).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Use #EF4444" }));
		expect(screen.getByRole("button", { name: "Use #EF4444" })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		fireEvent.change(screen.getByLabelText("Choose account type color"), {
			target: { value: "#f59e0b" },
		});
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "Credit card" }));
		await user.click(screen.getByLabelText("Balance nature"));
		await user.click(
			screen.getByRole("option", { name: "Liability · money owed" })
		);
		expect(screen.getAllByText(LIABILITY_DESCRIPTION)).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Create type" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.create).toHaveBeenCalledWith({
			balanceNature: "liability",
			color: "#f59e0b",
			icon: "credit-card",
			name: "Mortgage",
		});
		expect(mocks.success).toHaveBeenCalledWith("Account type created");
	});

	it("omits appearance defaults when creating and holds actions while saving", async () => {
		const user = userEvent.setup();
		let finish: () => void = () => undefined;
		mocks.create.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				finish = resolve;
			})
		);
		render(<AccountTypesPage />);
		await user.click(screen.getByRole("button", { name: "New type" }));
		await user.type(screen.getByLabelText("Name"), "Cash");
		await user.click(screen.getByRole("button", { name: "Use default" }));
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "No icon" }));
		await user.click(screen.getByRole("button", { name: "Create type" }));
		expect(mocks.create).toHaveBeenCalledWith({
			balanceNature: "asset",
			color: undefined,
			icon: undefined,
			name: "Cash",
		});
		expect(screen.getByRole("button", { name: "Create type" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
		finish();
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
	});

	it("edits an unused type and clears appearance with null instead of omitting update fields", async () => {
		const user = userEvent.setup();
		render(<AccountTypesPage />);
		await openMenu(user, "Bank");
		await user.click(screen.getByRole("menuitem", { name: "Edit" }));
		expect(screen.getByLabelText("Name")).toHaveValue("Bank");
		expect(screen.getByLabelText("Balance nature")).toBeEnabled();
		await user.clear(screen.getByLabelText("Name"));
		await user.type(screen.getByLabelText("Name"), "Reserve");
		await user.click(screen.getByRole("button", { name: "Use default" }));
		await user.click(screen.getByLabelText("Icon", { exact: true }));
		await user.click(screen.getByRole("option", { name: "No icon" }));
		await user.click(screen.getByRole("button", { name: "Save changes" }));
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
		);
		expect(mocks.update).toHaveBeenCalledWith({
			accountTypeId: bank._id,
			balanceNature: "asset",
			color: null,
			icon: null,
			name: "Reserve",
		});
		expect(mocks.success).toHaveBeenCalledWith("Account type updated");
	});

	it.each([undefined, { accountCount: 2, canDelete: false }])(
		"locks balance nature when editing in-use or loading types: %j",
		async (usage) => {
			const user = userEvent.setup();
			mocks.query.mockImplementation(
				(reference: Parameters<typeof getFunctionName>[0]) =>
					getFunctionName(reference) === "accountTypes:list" ? [debt] : usage
			);
			render(<AccountTypesPage />);
			await openMenu(user, "Debt");
			await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			expect(screen.getByLabelText("Balance nature")).toBeDisabled();
			expect(screen.getByText("Balance nature is locked")).toBeVisible();
			expect(screen.getByText(USAGE_DESCRIPTION)).toHaveTextContent(
				usage ? "2 accounts" : "one or more accounts"
			);
			await user.click(screen.getByRole("button", { name: "Cancel" }));
			expect(mocks.update).not.toHaveBeenCalled();
		}
	);

	it.each([false, true])(
		"keeps failed editor saves open with an actionable error (editing=%s)",
		async (editing) => {
			const user = userEvent.setup();
			(editing ? mocks.update : mocks.create).mockRejectedValueOnce(
				new Error("ACCOUNT_TYPE_NAME_TAKEN")
			);
			render(<AccountTypesPage />);
			if (editing) {
				await openMenu(user, "Bank");
				await user.click(screen.getByRole("menuitem", { name: "Edit" }));
			} else {
				await user.click(screen.getByRole("button", { name: "New type" }));
				await user.type(screen.getByLabelText("Name"), "Bank");
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
			expect(screen.getByRole("dialog")).toBeVisible();
			expect(
				screen.getByRole("button", {
					name: editing ? "Save changes" : "Create type",
				})
			).toBeEnabled();
		}
	);

	it("confirms archive and deletion boundaries and supports cancelling both", async () => {
		const user = userEvent.setup();
		render(<AccountTypesPage />);
		await openMenu(user, "Bank");
		await user.click(screen.getByRole("menuitem", { name: "Archive" }));
		expect(
			screen.getByRole("alertdialog", { name: "Archive Bank?" })
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.archive).not.toHaveBeenCalled();
		await openMenu(user, "Bank");
		await user.click(screen.getByRole("menuitem", { name: "Archive" }));
		await user.click(screen.getByRole("button", { name: "Archive type" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Account type archived")
		);
		expect(mocks.archive).toHaveBeenCalledWith({
			accountTypeId: bank._id,
			isArchived: true,
		});
		await openMenu(user, "Travel");
		await user.click(
			screen.getByRole("menuitem", { name: "Delete permanently" })
		);
		expect(
			screen.getByRole("alertdialog", { name: "Delete Travel permanently?" })
		).toBeVisible();
		expect(screen.getByText("Permanent deletion")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mocks.remove).not.toHaveBeenCalled();
		await openMenu(user, "Travel");
		await user.click(
			screen.getByRole("menuitem", { name: "Delete permanently" })
		);
		await user.click(
			screen.getByRole("button", { name: "Delete permanently" })
		);
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Account type deleted")
		);
		expect(mocks.remove).toHaveBeenCalledWith({ accountTypeId: unused._id });
	});

	it("reactivates archived types without losing their identity", async () => {
		const user = userEvent.setup();
		render(<AccountTypesPage />);
		await openMenu(user, "Debt");
		await user.click(screen.getByRole("menuitem", { name: "Reactivate" }));
		await waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Account type reactivated")
		);
		expect(mocks.archive).toHaveBeenCalledWith({
			accountTypeId: debt._id,
			isArchived: false,
		});
	});

	it.each(["archive", "reactivate", "delete"])(
		"reports %s mutation failures and releases the pending guard",
		async (operation) => {
			const user = userEvent.setup();
			const mutation = operation === "delete" ? mocks.remove : mocks.archive;
			let reject: (error: Error) => void = () => undefined;
			mutation.mockReturnValueOnce(
				new Promise((_, rejectPromise) => {
					reject = rejectPromise;
				})
			);
			render(<AccountTypesPage />);
			const name = operation === "reactivate" ? "Debt" : "Bank";
			await openMenu(user, name);
			await user.click(
				screen.getByRole("menuitem", {
					name: {
						archive: "Archive",
						delete: "Delete permanently",
						reactivate: "Reactivate",
					}[operation],
				})
			);
			if (operation !== "reactivate") {
				await user.click(
					screen.getByRole("button", {
						name:
							operation === "delete" ? "Delete permanently" : "Archive type",
					})
				);
			}
			const pendingControl = screen.getByRole("button", {
				hidden: true,
				name: `Manage ${name}`,
			});
			expect(pendingControl).toBeDisabled();
			reject(new Error("offline"));
			await waitFor(() =>
				expect(mocks.error).toHaveBeenCalledWith(
					`Failed to ${operation} the account type`
				)
			);
			expect(pendingControl).toBeEnabled();
		}
	);
});
