// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Fragment } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocsCodeBlock } from "@/components/docs/code-block";
import { PACKAGE_MANAGERS } from "@/lib/docs/package-manager";

const STORAGE_KEY = "spendly-docs-package-manager";
const YARN_GLOBAL_WARNING = /Global commands require Yarn Classic/;
const YARN_RUNNER_NOTE = /One-off tools use npx/;

async function renderBlocks(...sources: string[]) {
	const blocks = await Promise.all(
		sources.map(async (source) => ({
			source,
			element: await DocsCodeBlock({ children: <code>{source}</code> }),
		}))
	);
	return render(
		blocks.map(({ source, element }) => (
			<Fragment key={source}>{element}</Fragment>
		))
	);
}

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("synchronized package-manager blocks", () => {
	it("changes all blocks together and copies the selected manager's command", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		const { container } = await renderBlocks(
			"npm install --global spendly@latest\nspendly --version",
			"npx skills list --global",
			"spendly expenses list"
		);

		expect(
			screen.getAllByRole("tab", { name: "npm", selected: true })
		).toHaveLength(2);
		fireEvent.mouseDown(screen.getAllByRole("tab", { name: "bun" })[0], {
			button: 0,
			ctrlKey: false,
		});
		expect(
			screen.getAllByRole("tab", { name: "bun", selected: true })
		).toHaveLength(2);
		expect(screen.getAllByRole("tabpanel")[0].textContent).toBe(
			"bun add --global spendly@latest\nspendly --version"
		);
		expect(screen.getAllByRole("tabpanel")[1].textContent).toBe(
			"bunx skills list --global"
		);
		expect(container.textContent).toContain("spendly expenses list");
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe("bun");
		fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith(
				"bun add --global spendly@latest\nspendly --version"
			)
		);
	});

	it.each(
		PACKAGE_MANAGERS
	)("uses the same highlighted frame for %s", async (manager) => {
		window.localStorage.setItem(STORAGE_KEY, manager);
		const { container } = await renderBlocks(
			"npm install --global spendly@latest"
		);
		const panel = screen.getByRole("tabpanel");
		expect(panel.querySelector("span[style*='--shiki-light']")).not.toBeNull();
		expect(container.querySelector("[data-slot=code-block]")).toHaveClass(
			"shiki"
		);
		expect(
			container.querySelector("[data-slot=code-block-header]")
		).toHaveClass("h-11", "px-4");
		expect(panel.querySelector("pre")).toHaveClass(
			"p-4",
			"text-[13px]",
			"leading-6"
		);
		expect(panel.querySelectorAll("pre code")).toHaveLength(1);
		expect(panel.querySelector("code code")).toBeNull();
	});

	it("restores the preference when navigating to another page", async () => {
		window.localStorage.setItem(STORAGE_KEY, "pnpm");
		const first = await renderBlocks("npx skills list --global");
		expect(
			screen.getByRole("tab", { name: "pnpm", selected: true })
		).toBeTruthy();
		first.unmount();
		await renderBlocks("npm install --global spendly@latest");
		expect(
			screen.getByRole("tab", { name: "pnpm", selected: true })
		).toBeTruthy();
		expect(screen.getByRole("tabpanel").textContent).toBe(
			"pnpm add --global spendly@latest"
		);
	});

	it("ignores invalid stored values and responds to another browser tab", async () => {
		window.localStorage.setItem(STORAGE_KEY, "invalid");
		await renderBlocks("npx skills list --global");
		expect(
			screen.getByRole("tab", { name: "npm", selected: true })
		).toBeTruthy();
		window.localStorage.setItem(STORAGE_KEY, "yarn");
		fireEvent(
			window,
			new StorageEvent("storage", { key: STORAGE_KEY, newValue: "yarn" })
		);
		expect(
			screen.getByRole("tab", { name: "yarn", selected: true })
		).toBeTruthy();
		expect(screen.getByRole("tabpanel").textContent).toBe(
			"npx skills list --global"
		);
	});

	it("supports keyboard selection", async () => {
		await renderBlocks("npx skills list --global");
		fireEvent.keyDown(screen.getByRole("tab", { name: "pnpm" }), {
			key: "Enter",
		});
		expect(
			screen.getByRole("tab", { name: "pnpm", selected: true })
		).toBeTruthy();
	});

	it("uses a Classic-compatible fallback for Yarn skill commands", async () => {
		window.localStorage.setItem(STORAGE_KEY, "yarn");
		await renderBlocks("npx skills list --global");
		expect(screen.getByRole("tabpanel").textContent).toBe(
			"npx skills list --global"
		);
		expect(
			screen.getByText(YARN_RUNNER_NOTE).closest("[data-slot=code-block]")
		).toBeNull();
	});

	it("shows Yarn's compatibility note outside the code frame", async () => {
		window.localStorage.setItem(STORAGE_KEY, "yarn");
		await renderBlocks("npm install --global spendly@latest");
		expect(
			screen.getByText(YARN_GLOBAL_WARNING).closest("[data-slot=code-block]")
		).toBeNull();
	});

	it("updates all blocks when storage reads work but writes fail", async () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Quota exceeded");
		});
		await renderBlocks(
			"npx skills list --global",
			"npm install --global spendly@latest"
		);
		fireEvent.mouseDown(screen.getAllByRole("tab", { name: "pnpm" })[0], {
			button: 0,
			ctrlKey: false,
		});
		expect(
			screen.getAllByRole("tab", { name: "pnpm", selected: true })
		).toHaveLength(2);
	});

	it("keeps blocks synchronized when browser storage is blocked", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("Storage blocked");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage blocked");
		});
		await renderBlocks(
			"npx skills list --global",
			"npm install --global spendly@latest"
		);
		fireEvent.mouseDown(screen.getAllByRole("tab", { name: "bun" })[0], {
			button: 0,
			ctrlKey: false,
		});
		expect(
			screen.getAllByRole("tab", { name: "bun", selected: true })
		).toHaveLength(2);
	});
});
