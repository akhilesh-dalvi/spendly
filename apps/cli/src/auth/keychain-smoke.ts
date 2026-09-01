import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Entry } from "@napi-rs/keyring";
import { CliError } from "../errors.js";

const SMOKE_TEST_SERVICE = "spendly-cli-security-test";

export const runKeychainSmokeTest = (): {
	platform: NodeJS.Platform;
	roundTrip: true;
	cleanup: true;
} => {
	const entry = new Entry(SMOKE_TEST_SERVICE, randomUUID());
	const canary = randomBytes(32).toString("base64url");
	let cleanup = false;
	try {
		entry.setPassword(canary);
		const stored = entry.getPassword();
		if (stored === null) {
			throw new Error("Stored canary was not found");
		}
		const matches = timingSafeEqual(Buffer.from(stored), Buffer.from(canary));
		if (!matches) {
			throw new Error("Stored canary did not round-trip");
		}
		entry.deletePassword();
		cleanup = true;
		return { cleanup: true, platform: process.platform, roundTrip: true };
	} catch (error) {
		throw new CliError(
			"KEYCHAIN_UNAVAILABLE",
			"Native keychain security test failed",
			{
				cause: error,
			}
		);
	} finally {
		if (!cleanup) {
			try {
				entry.deletePassword();
			} catch {
				// Preserve the original test failure. The unique account is documented in the error path.
			}
		}
	}
};
