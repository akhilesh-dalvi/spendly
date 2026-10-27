import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
	cleanup();
});

if (typeof window !== "undefined") {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn((query: string) => ({
			addEventListener: vi.fn(),
			addListener: vi.fn(),
			dispatchEvent: vi.fn(),
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: vi.fn(),
			removeListener: vi.fn(),
		})),
	});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe = vi.fn();
			unobserve = vi.fn();
			disconnect = vi.fn();
		}
	);
	Element.prototype.scrollIntoView = vi.fn();
	HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
	HTMLElement.prototype.setPointerCapture = vi.fn();
	HTMLElement.prototype.releasePointerCapture = vi.fn();
}
