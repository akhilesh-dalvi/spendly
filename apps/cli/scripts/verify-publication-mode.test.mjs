import { describe, expect, it, vi } from "vitest";
import { verifyPublicationMode } from "./verify-publication-mode.mjs";

const environment = (version, bootstrap) => ({
	BOOTSTRAP: bootstrap,
	RELEASE_VERSION: version,
	SOURCE_COMMIT: "a".repeat(40),
});

describe("publication mode", () => {
	it("bootstraps 0.1.1 only when no public package exists", async () => {
		const request = vi.fn(async () => ({ status: 404 }));
		await expect(
			verifyPublicationMode(environment("0.1.1", "true"), request)
		).resolves.toBeUndefined();
		expect(request).toHaveBeenCalledWith("https://registry.npmjs.org/spendly");
	});
	it.each([
		"true",
		"false",
	])("rejects the superseded candidate with bootstrap=%s before registry access", async (bootstrap) => {
		const request = vi.fn();
		await expect(
			verifyPublicationMode(environment("0.1.0", bootstrap), request)
		).rejects.toThrow("superseded 0.1.0");
		expect(request).not.toHaveBeenCalled();
	});
	it.each([
		["0.1.1", "false"],
		["0.1.2", "true"],
		["0.2.0", "true"],
	])("rejects version %s in bootstrap mode %s", async (version, bootstrap) => {
		const request = vi.fn();
		await expect(
			verifyPublicationMode(environment(version, bootstrap), request)
		).rejects.toThrow("Only the initial 0.1.1");
		expect(request).not.toHaveBeenCalled();
	});
	it.each([
		"0.1.2",
		"0.2.0",
	])("allows OIDC staging for %s when the package exists", async (version) => {
		await expect(
			verifyPublicationMode(environment(version, "false"), async () => ({
				status: 200,
			}))
		).resolves.toBeUndefined();
	});
	it.each([
		200, 401, 429, 500,
	])("refuses bootstrap on registry status %s", async (status) => {
		await expect(
			verifyPublicationMode(environment("0.1.1", "true"), async () => ({
				status,
			}))
		).rejects.toThrow("Unexpected npm package state");
	});
	it("refuses OIDC staging before the package exists", async () => {
		await expect(
			verifyPublicationMode(environment("0.1.2", "false"), async () => ({
				status: 404,
			}))
		).rejects.toThrow("Unexpected npm package state");
	});
	it.each([
		undefined,
		"",
		"yes",
	])("rejects ambiguous bootstrap input %s", async (bootstrap) => {
		const request = vi.fn();
		await expect(
			verifyPublicationMode(environment("0.1.1", bootstrap), request)
		).rejects.toThrow("explicitly true or false");
		expect(request).not.toHaveBeenCalled();
	});
});
