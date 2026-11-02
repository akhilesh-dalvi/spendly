import {
	chmod,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvironment } from "./environment";
import { type FixtureJournal, readJournal, saveJournal } from "./journals";

const config = loadEnvironment({
	SPENDLY_E2E_ENABLED: "true",
	E2E_CONVEX_URL: "https://e2e-fixtures.convex.cloud",
	E2E_CONVEX_DEPLOY_KEY: "dev:e2e-fixtures|synthetic-secret",
	E2E_CLERK_ISSUER: "https://fixture.clerk.accounts.dev",
	E2E_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("fixture.clerk.accounts.dev$").toString("base64")}`,
	E2E_CLERK_SECRET_KEY: "sk_test_synthetic-secret",
	E2E_CLERK_OAUTH_CLIENT_ID: "test-oauth-client",
});

let directory: string;
let journal: URL;
let record: FixtureJournal;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "spendly-e2e-journals-"));
	journal = pathToFileURL(join(directory, "intent.json"));
	record = {
		email:
			"spendly-e2e-12345678-1234-1234-1234-123456789abc+clerk_test@example.com",
		convexUrl: config.convexUrl,
		clerkIssuer: config.clerkIssuer,
		directory,
	};
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe("fixture journals", () => {
	it("persists a credential-free creation intent without a Clerk ID in an owner-only file", async () => {
		const input = { ...config, ...record, password: "withheld-password" };
		await saveJournal(journal, input);
		expect(await readJournal(journal, config)).toEqual(record);
		expect(JSON.parse(await readFile(journal, "utf8"))).toEqual(record);
		expect((await stat(journal)).mode % 0o1000).toBe(0o600);
	});

	it("atomically replaces an intent with its Clerk ID without exposing partial content", async () => {
		await saveJournal(journal, record);
		await chmod(journal, 0o644);
		const previous = await open(journal, "r");
		try {
			const updated = { ...record, clerkId: "user_Synthetic123" };
			await saveJournal(journal, updated);
			expect(JSON.parse(await previous.readFile("utf8"))).toEqual(record);
			expect(await readJournal(journal, config)).toEqual(updated);
			expect((await stat(journal)).mode % 0o1000).toBe(0o600);
			expect(await readdir(directory)).toEqual(["intent.json"]);
		} finally {
			await previous.close();
		}
	});

	it.each([
		["non-synthetic email", { email: "person@example.com" }],
		[
			"malformed UUID",
			{
				email:
					"spendly-e2e-------------------------------------+clerk_test@example.com",
			},
		],
		[
			"email suffix",
			{
				email:
					"spendly-e2e-12345678-1234-1234-1234-123456789abc+clerk_test@example.com.extra",
			},
		],
		["empty Clerk ID", { clerkId: "" }],
		["malformed Clerk ID", { clerkId: "user_bad/id" }],
		["null Clerk ID", { clerkId: null }],
		["wrong Convex deployment", { convexUrl: "https://other.convex.cloud" }],
		["wrong Clerk issuer", { clerkIssuer: "https://other.accounts.dev" }],
		["relative directory", { directory: "spendly-e2e-relative" }],
		["outside temporary root", { directory: "/spendly-e2e-outside" }],
		["unowned name", { directory: join(tmpdir(), "ordinary-directory") }],
	])("rejects %s without deleting the journal", async (_name, override) => {
		await writeFile(journal, JSON.stringify({ ...record, ...override }));
		await expect(readJournal(journal, config)).rejects.toThrow(
			"Invalid E2E fixture journal"
		);
		expect((await stat(journal)).isFile()).toBe(true);
	});

	it("rejects nested credential directories even with a synthetic basename", async () => {
		await writeFile(
			journal,
			JSON.stringify({
				...record,
				directory: join(directory, "spendly-e2e-nested"),
			})
		);
		await expect(readJournal(journal, config)).rejects.toThrow(
			"Invalid E2E fixture journal"
		);
	});

	it("rejects symlinked credential directories", async () => {
		const link = `${directory}-link`;
		await symlink(directory, link, "dir");
		try {
			await saveJournal(journal, { ...record, directory: link });
			await expect(readJournal(journal, config)).rejects.toThrow(
				"Invalid E2E fixture journal"
			);
		} finally {
			await rm(link, { force: true });
		}
	});

	it("rejects a regular file masquerading as a credential directory", async () => {
		const file = `${directory}-file`;
		await writeFile(file, "not a directory");
		try {
			await saveJournal(journal, { ...record, directory: file });
			await expect(readJournal(journal, config)).rejects.toThrow(
				"Invalid E2E fixture journal"
			);
		} finally {
			await rm(file, { force: true });
		}
	});

	it("rejects credential directories owned by another user", async () => {
		await saveJournal(journal, record);
		const owner = vi
			.spyOn(process, "getuid")
			.mockReturnValue((await stat(directory)).uid + 1);
		try {
			await expect(readJournal(journal, config)).rejects.toThrow(
				"Invalid E2E fixture journal"
			);
		} finally {
			owner.mockRestore();
		}
	});

	it("accepts an already-removed credential directory so interrupted cleanup can retry", async () => {
		const missing = { ...record, directory: `${directory}-missing` };
		await saveJournal(journal, missing);
		expect(await readJournal(journal, config)).toEqual(missing);
	});

	it("withholds malformed JSON contents and read errors", async () => {
		await writeFile(journal, '{"password":"do-not-echo-this",');
		await expect(readJournal(journal, config)).rejects.toEqual(
			new Error("Invalid E2E fixture journal; contents withheld.")
		);
		await rm(journal);
		await expect(readJournal(journal, config)).rejects.toEqual(
			new Error("Invalid E2E fixture journal; contents withheld.")
		);
	});

	it("removes atomic temporary files after a failed replacement", async () => {
		await mkdir(journal);
		await expect(saveJournal(journal, record)).rejects.toThrow();
		expect(await readdir(directory)).toEqual(["intent.json"]);
	});
});
