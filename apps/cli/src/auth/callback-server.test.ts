import { describe, expect, it } from "vitest";
import { startCallbackServer } from "./callback-server.js";

const CALLBACK_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/callback$/u;

describe("callback server", () => {
	it("binds to loopback on a random port and accepts the expected state", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 1000,
		});
		try {
			expect(callback.redirectUri).toMatch(CALLBACK_URL_PATTERN);
			const response = await fetch(
				`${callback.redirectUri}?code=authorization-code&state=expected`
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("no-store");
			expect(response.headers.get("referrer-policy")).toBe("no-referrer");
			await expect(callback.waitForCallback).resolves.toEqual({
				code: "authorization-code",
			});
		} finally {
			await callback.close();
		}
	});

	it("checks state before accepting an OAuth denial", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 1000,
		});
		try {
			const callbackResult = expect(
				callback.waitForCallback
			).rejects.toMatchObject({ code: "INVALID_AUTH_CALLBACK" });
			const response = await fetch(
				`${callback.redirectUri}?error=access_denied&state=forged`
			);
			expect(response.status).toBe(400);
			await callbackResult;
		} finally {
			await callback.close();
		}
	});

	it("does not consume unrelated loopback requests", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 1000,
		});
		try {
			const unrelatedResponse = await fetch(
				callback.redirectUri.replace("/callback", "/favicon.ico")
			);
			expect(unrelatedResponse.status).toBe(404);
			const response = await fetch(
				`${callback.redirectUri}?code=authorization-code&state=expected`
			);
			expect(response.status).toBe(200);
			await expect(callback.waitForCallback).resolves.toEqual({
				code: "authorization-code",
			});
		} finally {
			await callback.close();
		}
	});

	it("rejects a forged state", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 1000,
		});
		try {
			const callbackResult = expect(
				callback.waitForCallback
			).rejects.toMatchObject({
				code: "INVALID_AUTH_CALLBACK",
			});
			const response = await fetch(
				`${callback.redirectUri}?code=authorization-code&state=forged`
			);
			expect(response.status).toBe(400);
			await callbackResult;
		} finally {
			await callback.close();
		}
	});

	it("rejects duplicate state parameters", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 1000,
		});
		try {
			const callbackResult = expect(
				callback.waitForCallback
			).rejects.toMatchObject({ code: "INVALID_AUTH_CALLBACK" });
			const response = await fetch(
				`${callback.redirectUri}?code=authorization-code&state=expected&state=forged`
			);
			expect(response.status).toBe(400);
			await callbackResult;
		} finally {
			await callback.close();
		}
	});

	it("times out without receiving a callback", async () => {
		const callback = await startCallbackServer({
			expectedState: "expected",
			timeoutMs: 20,
		});
		try {
			await expect(callback.waitForCallback).rejects.toMatchObject({
				code: "AUTHENTICATION_REQUIRED",
			});
		} finally {
			await callback.close();
		}
	});
});
