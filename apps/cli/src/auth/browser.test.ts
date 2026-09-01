import { describe, expect, it, vi } from "vitest";
import { type BrowserDependencies, openSystemBrowser } from "./browser.js";

const createDependencies = (
	platform: NodeJS.Platform
): {
	dependencies: BrowserDependencies;
	emit: (event: "error" | "spawn") => void;
	spawn: ReturnType<typeof vi.fn<BrowserDependencies["spawn"]>>;
	unref: ReturnType<typeof vi.fn>;
} => {
	const listeners: Partial<Record<"error" | "spawn", () => void>> = {};
	const unref = vi.fn();
	const spawn = vi.fn<BrowserDependencies["spawn"]>(() => ({
		once: (event, listener) => {
			listeners[event] = listener;
		},
		unref,
	}));
	return {
		dependencies: { platform, spawn },
		emit: (event) => listeners[event]?.(),
		spawn,
		unref,
	};
};

describe("system browser opening", () => {
	it("opens a detached browser on supported platforms", async () => {
		const browser = createDependencies("darwin");
		const result = openSystemBrowser(
			"https://issuer.example/authorize",
			browser.dependencies
		);
		browser.emit("spawn");

		await expect(result).resolves.toBe(true);
		expect(browser.spawn).toHaveBeenCalledWith("open", [
			"https://issuer.example/authorize",
		]);
		expect(browser.unref).toHaveBeenCalledOnce();
	});

	it("falls back when the browser command fails", async () => {
		const browser = createDependencies("linux");
		const result = openSystemBrowser(
			"https://issuer.example/authorize",
			browser.dependencies
		);
		browser.emit("error");

		await expect(result).resolves.toBe(false);
		expect(browser.spawn).toHaveBeenCalledWith("xdg-open", [
			"https://issuer.example/authorize",
		]);
	});

	it("falls back without spawning on unsupported platforms", async () => {
		const browser = createDependencies("win32");

		await expect(
			openSystemBrowser(
				"https://issuer.example/authorize",
				browser.dependencies
			)
		).resolves.toBe(false);
		expect(browser.spawn).not.toHaveBeenCalled();
	});
});
