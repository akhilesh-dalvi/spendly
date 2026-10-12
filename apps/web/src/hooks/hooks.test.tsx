// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrency } from "./use-currency";
import { useIsMobile } from "./use-mobile";

const state = vi.hoisted(() => ({
	auth: { isLoaded: true, isSignedIn: true },
	user: undefined as unknown,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => state.auth }));
vi.mock("convex/react", () => ({ useQuery: vi.fn(() => state.user) }));

beforeEach(() => {
	state.auth = { isLoaded: true, isSignedIn: true };
	state.user = undefined;
	vi.clearAllMocks();
});

describe("user currency", () => {
	it("does not query signed-out user data and safely formats dollars", () => {
		state.auth.isSignedIn = false;
		const { result } = renderHook(useCurrency);
		expect(result.current).toMatchObject({
			currency: "USD",
			locale: "en-US",
			hasUserCurrency: false,
			isLoading: false,
		});
		expect(result.current.format(1234.5)).toBe("$1,234.50");
		expect(useQuery).toHaveBeenCalledWith(expect.anything(), "skip");
	});

	it.each([
		{ isLoaded: false, isSignedIn: false },
		{ isLoaded: true, isSignedIn: true },
	])("exposes loading before authentication or the user query resolves %#", (auth) => {
		state.auth = auth;
		const { result } = renderHook(useCurrency);
		expect(result.current.isLoading).toBe(true);
	});

	it.each([
		{ user: {}, currency: "USD", locale: "en-US", hasUserCurrency: false },
		{
			user: { currency: "EUR" },
			currency: "EUR",
			locale: "en-US",
			hasUserCurrency: true,
		},
		{
			user: { currency: "INR" },
			currency: "INR",
			locale: "en-IN",
			hasUserCurrency: true,
		},
	])("resolves user preference $currency", ({ user, ...expected }) => {
		state.user = user;
		const { result } = renderHook(useCurrency);
		expect(result.current).toMatchObject({ ...expected, isLoading: false });
		if (expected.currency === "INR") {
			expect(result.current.format(123_456.5)).toBe("₹1,23,456.50");
		}
	});
});

describe("mobile breakpoint", () => {
	it.each([
		767, 768, 1024,
	])("classifies a %spx viewport and subscribes to breakpoint changes", (width) => {
		vi.stubGlobal("innerWidth", width);
		const listeners = new Set<EventListenerOrEventListenerObject>();
		const mediaQuery: MediaQueryList = {
			matches: width < 768,
			media: "(max-width: 767px)",
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn((_event, listener) => {
				if (listener) {
					listeners.add(listener);
				}
			}),
			removeEventListener: vi.fn((_event, listener) => {
				if (listener) {
					listeners.delete(listener);
				}
			}),
			dispatchEvent: vi.fn(() => true),
		};
		const matchMedia = vi
			.spyOn(window, "matchMedia")
			.mockReturnValue(mediaQuery);
		const { result, unmount } = renderHook(useIsMobile);
		expect(result.current).toBe(width < 768);
		expect(matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
		act(() => {
			vi.stubGlobal("innerWidth", width < 768 ? 1000 : 400);
			for (const listener of listeners) {
				if (typeof listener === "function") {
					listener(new Event("change"));
				}
			}
		});
		expect(result.current).toBe(width >= 768);
		unmount();
		expect(listeners.size).toBe(0);
		matchMedia.mockRestore();
		vi.unstubAllGlobals();
	});
});
