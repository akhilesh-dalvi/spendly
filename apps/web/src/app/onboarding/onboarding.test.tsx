// @vitest-environment jsdom
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type FunctionReference, getFunctionName } from "convex/server";
import type { DateRange } from "react-day-picker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountOnboardingNudge } from "../../components/account-onboarding-nudge";
import { OnboardingResumeCard } from "../../components/onboarding-resume-card";
import {
	OnboardingShell,
	OnboardingStepControls,
} from "../../components/onboarding-shell";
import AccountsPage from "./accounts/page";
import CyclePage from "./cycle/page";
import StartPage from "./start/page";

const PLANNING_PATH = /Plan & track/;
const EURO_OPTION = /Euro/;
const FREE_PATH = /Start tracking freely/;
const OPTIONAL_ACCOUNT_MESSAGE = /add an account whenever/;

const state = vi.hoisted(() => ({
	pathname: "/onboarding/start",
	search: new URLSearchParams(),
	onboarding: undefined as unknown,
	types: [] as unknown[],
	begin: vi.fn(),
	saveCycle: vi.fn(),
	createAccount: vi.fn(),
	createType: vi.fn(),
	complete: vi.fn(),
	dismiss: vi.fn(),
	router: { push: vi.fn(), replace: vi.fn() },
	report: vi.fn(),
	toastError: vi.fn(),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => state.router,
	usePathname: () => state.pathname,
	useSearchParams: () => state.search,
}));
vi.mock("convex/react", () => ({
	useQuery: (reference: FunctionReference<"query">) =>
		getFunctionName(reference) === "accountTypes:list"
			? state.types
			: state.onboarding,
	useMutation: (reference: FunctionReference<"mutation">) => {
		const name = getFunctionName(reference);
		if (name === "users:beginOnboarding") {
			return state.begin;
		}
		if (name === "cycles:saveOnboardingCycle") {
			return state.saveCycle;
		}
		if (name === "accounts:createOnboardingAccount") {
			return state.createAccount;
		}
		if (name === "accountTypes:create") {
			return state.createType;
		}
		if (name === "users:dismissAccountsOnboarding") {
			return state.dismiss;
		}
		return state.complete;
	},
}));
vi.mock("@/lib/report-error", () => ({ reportError: state.report }));
vi.mock("sonner", () => ({ toast: { error: state.toastError } }));
// The page owns range validation, not calendar mechanics. Real calendar behavior is tested independently.
vi.mock("@/components/ui/date-picker", () => ({
	DatePickerWithRange: ({
		date,
		onDateChange,
	}: {
		date?: DateRange;
		onDateChange: (date?: DateRange) => void;
	}) => (
		<div>
			<input
				aria-label="Start date"
				onChange={(event) =>
					onDateChange({
						from: event.target.value
							? new Date(`${event.target.value}T00:00:00`)
							: undefined,
						to: date?.to,
					})
				}
				type="date"
				value={date?.from?.toISOString().slice(0, 10) ?? ""}
			/>
			<input
				aria-label="End date"
				onChange={(event) =>
					onDateChange({
						from: date?.from,
						to: event.target.value
							? new Date(`${event.target.value}T00:00:00`)
							: undefined,
					})
				}
				type="date"
				value={date?.to?.toISOString().slice(0, 10) ?? ""}
			/>
		</div>
	),
}));

const cycle = {
	_id: "cycle",
	name: "My cycle",
	startDate: "2026-09-01",
	endDate: "2026-09-30",
};
const cash = { _id: "cash", name: "Cash", balanceNature: "asset" };

beforeEach(() => {
	vi.resetAllMocks();
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
	state.pathname = "/onboarding/start";
	state.search = new URLSearchParams();
	state.onboarding = { currency: "USD", path: "free", step: "account", cycle };
	state.types = [
		cash,
		{ _id: "credit", name: "Credit", balanceNature: "liability" },
	];
	state.begin.mockResolvedValue(undefined);
	state.saveCycle.mockResolvedValue("cycle");
	state.createAccount.mockResolvedValue("account");
	state.createType.mockImplementation(
		(input: { name: string; balanceNature: string }) => {
			const type = { ...input, _id: "new-type" };
			state.types = [...state.types, type];
			return Promise.resolve(type);
		}
	);
	state.complete.mockResolvedValue(undefined);
	state.dismiss.mockResolvedValue(undefined);
});
afterEach(() => {
	vi.useRealTimers();
});

describe("setup choice", () => {
	it("saves the free tracking default and its currency", async () => {
		state.onboarding = undefined;
		render(<StartPage />);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Save and continue" }));
		expect(state.begin).toHaveBeenCalledWith({ path: "free", currency: "USD" });
		expect(state.router.push).toHaveBeenCalledWith(
			"/onboarding/cycle?mode=free"
		);
	});

	it("restores a supported saved currency and lets the user change both choices", async () => {
		state.onboarding = { currency: "INR", path: "plan" };
		const user = userEvent.setup();
		render(<StartPage />);
		expect(screen.getByRole("button", { name: PLANNING_PATH })).toHaveAttribute(
			"aria-pressed",
			"true"
		);
		await user.click(
			screen.getByRole("combobox", { name: "Primary currency" })
		);
		await user.click(screen.getByRole("option", { name: EURO_OPTION }));
		await user.click(screen.getByRole("button", { name: FREE_PATH }));
		await user.click(screen.getByRole("button", { name: "Save and continue" }));
		expect(state.begin).toHaveBeenCalledWith({ path: "free", currency: "EUR" });
	});

	it("retains selections after a save failure and falls back from unsupported saved currency", async () => {
		state.onboarding = { currency: "XYZ", path: null };
		state.begin.mockRejectedValue(new Error("offline"));
		const user = userEvent.setup();
		render(<StartPage />);
		await user.click(screen.getByRole("button", { name: PLANNING_PATH }));
		await user.click(screen.getByRole("button", { name: "Save and continue" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"selections are still here"
		);
		expect(state.begin).toHaveBeenCalledWith({ path: "plan", currency: "USD" });
		expect(
			screen.getByRole("button", { name: "Save and continue" })
		).toBeEnabled();
		expect(state.router.push).not.toHaveBeenCalled();
	});
});

describe("onboarding cycle", () => {
	beforeEach(() => {
		state.pathname = "/onboarding/cycle";
	});

	it.each([
		"free",
		"plan",
	])("saves a named period and advances the %s path", async (path) => {
		state.onboarding = { path, cycle: null };
		state.search = new URLSearchParams({ mode: path });
		const user = userEvent.setup();
		render(<CyclePage />);
		await user.clear(screen.getByLabelText("Cycle name"));
		await user.type(screen.getByLabelText("Cycle name"), "  September  ");
		fireEvent.submit(
			screen.getByLabelText("Cycle name").closest("form") ??
				screen.getByLabelText("Cycle name")
		);
		await waitFor(() =>
			expect(state.saveCycle).toHaveBeenCalledWith({
				cycleId: undefined,
				name: "September",
				startDate: "2026-09-01",
				endDate: "2026-09-30",
			})
		);
		expect(state.router.push).toHaveBeenCalledWith(
			`/onboarding/${path === "plan" ? "categories" : "accounts"}?cycleId=cycle`
		);
	});

	it("switches presets and preserves a manually named custom cycle", async () => {
		state.onboarding = undefined;
		const user = userEvent.setup();
		render(<CyclePage />);
		await user.click(screen.getByRole("button", { name: "Pay period" }));
		expect(screen.getByLabelText("Cycle name")).toHaveValue("Sep 15 – Sep 28");
		await user.click(screen.getByRole("button", { name: "Custom" }));
		await user.clear(screen.getByLabelText("Cycle name"));
		await user.type(screen.getByLabelText("Cycle name"), "Trip");
		fireEvent.change(screen.getByLabelText("End date"), {
			target: { value: "2026-10-10" },
		});
		expect(screen.getByLabelText("Cycle name")).toHaveValue("Trip");
		await user.click(screen.getByRole("button", { name: "Monthly" }));
		expect(screen.getByLabelText("Cycle name")).toHaveValue("September 2026");
	});

	it.each([
		"",
		"2026-09-01",
		"2026-08-31",
	])("rejects an absent, equal, or backwards end date %s", (endDate) => {
		render(<CyclePage />);
		fireEvent.change(screen.getByLabelText("End date"), {
			target: { value: endDate },
		});
		fireEvent.submit(
			screen.getByLabelText("Cycle name").closest("form") ??
				screen.getByLabelText("Cycle name")
		);
		expect(screen.getByRole("alert")).toHaveTextContent("end date after it");
		expect(state.saveCycle).not.toHaveBeenCalled();
	});

	it("requires a name and keeps the current cycle visible after a save conflict", async () => {
		state.saveCycle.mockRejectedValue(new Error("overlap"));
		const user = userEvent.setup();
		render(<CyclePage />);
		await user.clear(screen.getByLabelText("Cycle name"));
		fireEvent.submit(
			screen.getByLabelText("Cycle name").closest("form") ??
				screen.getByLabelText("Cycle name")
		);
		expect(screen.getByText("Give this cycle a name.")).toBeVisible();
		expect(screen.getByLabelText("Cycle name")).toHaveFocus();
		await user.type(screen.getByLabelText("Cycle name"), "Revised cycle");
		fireEvent.submit(
			screen.getByLabelText("Cycle name").closest("form") ??
				screen.getByLabelText("Cycle name")
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"dates do not overlap"
		);
		expect(screen.getByLabelText("Cycle name")).toHaveValue("Revised cycle");
	});

	it("rejects a foreign setup cycle ID and restores only the authenticated cycle", () => {
		state.search = new URLSearchParams({ cycleId: "foreign", mode: "free" });
		render(<CyclePage />);
		expect(state.router.replace).toHaveBeenCalledWith(
			"/onboarding/cycle?mode=free&cycleId=cycle"
		);
		expect(screen.getByLabelText("Cycle name")).toHaveValue("My cycle");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"loaded your own cycle"
		);
	});
});

describe("optional first account", () => {
	beforeEach(() => {
		state.pathname = "/onboarding/accounts";
	});

	it("creates a trimmed account with its opening balance and shows the next actions", async () => {
		const user = userEvent.setup();
		render(<AccountsPage />);
		await user.type(screen.getByLabelText("Account name"), "  Everyday  ");
		fireEvent.change(screen.getByLabelText("Opening balance"), {
			target: { value: "123.45" },
		});
		await user.click(
			screen.getByRole("button", { name: "Create account and finish" })
		);
		expect(state.createAccount).toHaveBeenCalledWith({
			name: "Everyday",
			accountTypeId: "cash",
			openingBalance: 123.45,
		});
		expect(
			await screen.findByRole("heading", {
				name: "Spendly is ready for your first expense.",
			})
		).toBeVisible();
		expect(
			screen.getByRole("link", { name: "Add your first expense" })
		).toHaveAttribute("href", "/expenses/new");
	});

	it.each([
		false,
		true,
	])("allows skipping the optional account and handles failure=%s", async (failure) => {
		if (failure) {
			state.complete.mockRejectedValue(new Error("offline"));
		}
		render(<AccountsPage />);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Skip account setup" }));
		expect(state.complete).toHaveBeenCalledWith({ accountStatus: "skipped" });
		if (failure) {
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"couldn't skip"
			);
		} else {
			expect(screen.getByText(OPTIONAL_ACCOUNT_MESSAGE)).toBeVisible();
		}
	});

	it("validates account name and missing types before making a mutation", async () => {
		state.types = [];
		render(<AccountsPage />);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Create account and finish" }));
		expect(screen.getByText("Enter an account name.")).toBeVisible();
		expect(screen.getByLabelText("Account name")).toHaveFocus();
		fireEvent.change(screen.getByLabelText("Account name"), {
			target: { value: "Valid name" },
		});
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Create account and finish" }));
		expect(screen.getByText("Choose an account type.")).toBeVisible();
		expect(state.createAccount).not.toHaveBeenCalled();
	});

	it("retains account entries when creation fails", async () => {
		state.createAccount.mockRejectedValue(new Error("offline"));
		const user = userEvent.setup();
		render(<AccountsPage />);
		await user.type(screen.getByLabelText("Account name"), "Saved input");
		await user.click(
			screen.getByRole("button", { name: "Create account and finish" })
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"entries are still here"
		);
		expect(screen.getByLabelText("Account name")).toHaveValue("Saved input");
		expect(
			screen.getByRole("button", { name: "Create account and finish" })
		).toBeEnabled();
	});

	it.each([
		false,
		true,
	])("creates a custom liability type and handles failure=%s", async (failure) => {
		if (failure) {
			state.createType.mockRejectedValue(new Error("duplicate"));
		}
		const user = userEvent.setup();
		render(<AccountsPage />);
		await user.click(screen.getByRole("combobox", { name: "Account type" }));
		await user.click(screen.getByRole("option", { name: "Add account type" }));
		const dialog = screen.getByRole("dialog");
		await user.click(
			within(dialog).getByRole("button", {
				name: "Add account type",
			})
		);
		expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a name");
		await user.type(within(dialog).getByLabelText("Account type name"), "Loan");
		await user.click(
			within(dialog).getByRole("combobox", { name: "Balance treatment" })
		);
		await user.click(screen.getByRole("option", { name: "Money owed" }));
		await user.click(
			within(dialog).getByRole("button", {
				name: "Add account type",
			})
		);
		expect(state.createType).toHaveBeenCalledWith({
			name: "Loan",
			balanceNature: "liability",
		});
		if (failure) {
			expect(await screen.findByRole("alert")).toHaveTextContent(
				"different name"
			);
			await user.keyboard("{Escape}");
		} else {
			await waitFor(() =>
				expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
			);
			expect(
				screen.getByRole("combobox", { name: "Account type" })
			).toHaveTextContent("Loan");
		}
	});

	it("does not restart account setup after completion", () => {
		state.onboarding = {
			currency: "USD",
			path: "free",
			step: "complete",
			cycle,
		};
		render(<AccountsPage />);
		expect(state.router.replace).toHaveBeenCalledWith("/dashboard");
	});
});

describe("setup progress and reminders", () => {
	it.each([
		{
			pathname: "/onboarding/start",
			path: null,
			cycle: null,
			label: "Step 1 of 3",
			back: null,
		},
		{
			pathname: "/onboarding/cycle",
			path: "free",
			cycle: null,
			label: "Step 2 of 3",
			back: "/onboarding/start",
		},
		{
			pathname: "/onboarding/categories",
			path: "plan",
			cycle,
			label: "Step 3 of 4",
			back: "/onboarding/cycle?mode=plan&cycleId=cycle",
		},
		{
			pathname: "/onboarding/categories",
			path: "plan",
			cycle: null,
			label: "Step 3 of 4",
			back: "/onboarding/cycle?mode=plan",
		},
		{
			pathname: "/onboarding/accounts",
			path: "free",
			cycle,
			label: "Step 3 of 3",
			back: "/onboarding/cycle?mode=free&cycleId=cycle",
		},
		{
			pathname: "/onboarding/accounts",
			path: "plan",
			cycle,
			label: "Step 4 of 4",
			back: "/onboarding/categories?cycleId=cycle",
		},
		{
			pathname: "/onboarding/accounts",
			path: "plan",
			cycle: null,
			label: "Step 4 of 4",
			back: "/onboarding/categories",
		},
	])("shows the right progress and back destination for $pathname %#", ({
		pathname,
		path,
		cycle: setupCycle,
		label,
		back,
	}) => {
		state.pathname = pathname;
		state.onboarding = { path, cycle: setupCycle };
		render(
			<OnboardingShell>
				<OnboardingStepControls>
					<button type="button">Continue</button>
				</OnboardingStepControls>
			</OnboardingShell>
		);
		expect(
			screen.getByRole("progressbar", { name: label })
		).toBeInTheDocument();
		if (back) {
			expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
				"href",
				back
			);
		} else {
			expect(
				screen.queryByRole("link", { name: "Back" })
			).not.toBeInTheDocument();
		}
	});

	it.each([
		undefined,
		{ cycle: null },
		{ cycle, path: null },
		{ cycle, path: "free", step: "complete" },
	])("does not nag users whose setup is not resumable %#", (onboarding) => {
		state.onboarding = onboarding;
		const { container } = render(<OnboardingResumeCard />);
		expect(container).toBeEmptyDOMElement();
	});

	it.each([
		"categories",
		"account",
	])("resumes the unfinished %s setup stage", (step) => {
		state.onboarding = { path: "plan", cycle, step };
		render(<OnboardingResumeCard />);
		expect(screen.getByRole("link", { name: "Resume setup" })).toHaveAttribute(
			"href",
			`/onboarding/${step === "account" ? "accounts" : step}?cycleId=cycle`
		);
	});

	it.each([
		false,
		true,
	])("dismisses an optional account reminder with retry on failure=%s", async (failure) => {
		if (failure) {
			state.dismiss.mockRejectedValue(new Error("offline"));
		}
		render(<AccountOnboardingNudge />);
		expect(screen.getByRole("link", { name: "Add account" })).toHaveAttribute(
			"href",
			"/accounts/new"
		);
		await userEvent
			.setup()
			.click(screen.getByRole("button", { name: "Not now" }));
		expect(state.dismiss).toHaveBeenCalledWith({});
		if (failure) {
			expect(state.toastError).toHaveBeenCalled();
			expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
		} else {
			expect(screen.getByRole("button", { name: "Not now" })).toBeDisabled();
		}
	});
});
