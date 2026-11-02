import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { allocateAuthIdentity } from "./auth-allocation";
import type { FixtureJournal } from "./journals";

const fixture = async () => {
	const directory = await mkdtemp(join(tmpdir(), "spendly-e2e-"));
	const journal = pathToFileURL(join(directory, "identity.json"));
	const record: FixtureJournal = {
		clerkIssuer: "https://e2e-test.clerk.accounts.dev",
		convexUrl: "https://e2e-test.convex.cloud",
		directory,
		email: `spendly-e2e-${randomUUID()}+clerk_test@example.com`,
	};
	return {
		create: vi.fn(async () => "user_synthetic"),
		directory,
		journal,
		record,
		remove: vi.fn(async (_clerkId: string) => undefined),
		resolve: vi.fn(async (): Promise<string | undefined> => "user_synthetic"),
		stop: vi.fn(async () => undefined),
	};
};

it("durably journals a credential-free intent before a UI or admin identity can be created", async () => {
	const allocation = await fixture();
	try {
		allocation.create.mockImplementationOnce(async () => {
			const intent = JSON.parse(await readFile(allocation.journal, "utf8"));
			expect(intent).toEqual(allocation.record);
			expect((await stat(allocation.journal)).mode % 0o1000).toBe(0o600);
			return "user_synthetic";
		});
		expect(await allocateAuthIdentity(allocation)).toBe("user_synthetic");
		expect(JSON.parse(await readFile(allocation.journal, "utf8"))).toEqual({
			...allocation.record,
			clerkId: "user_synthetic",
		});
		expect(allocation.resolve).not.toHaveBeenCalled();
		expect(allocation.remove).not.toHaveBeenCalled();
	} finally {
		await rm(allocation.directory, { force: true, recursive: true });
	}
});

it("does not allocate an identity when its creation intent cannot be saved", async () => {
	const allocation = await fixture();
	allocation.journal = pathToFileURL(
		join(allocation.directory, "missing", "identity.json")
	);
	await expect(allocateAuthIdentity(allocation)).rejects.toThrow(
		"creation-intent journal could not be saved"
	);
	expect(allocation.create).not.toHaveBeenCalled();
	expect(allocation.resolve).not.toHaveBeenCalled();
	await expect(stat(allocation.directory)).rejects.toMatchObject({
		code: "ENOENT",
	});
});

it("stops the browser and cleans up an exact identity after ambiguous UI/provider allocation", async () => {
	const allocation = await fixture();
	const events: string[] = [];
	allocation.create.mockRejectedValueOnce(
		new Error("private-password provider-response")
	);
	allocation.stop.mockImplementationOnce(() => {
		events.push("stop");
		return Promise.resolve(undefined);
	});
	allocation.resolve.mockImplementationOnce(() => {
		events.push("resolve");
		return Promise.resolve("user_synthetic");
	});
	allocation.remove.mockImplementationOnce(async (id) => {
		events.push("remove");
		expect(id).toBe("user_synthetic");
		expect(
			JSON.parse(await readFile(allocation.journal, "utf8"))
		).toMatchObject({
			clerkId: id,
			email: allocation.record.email,
		});
	});
	const result = allocateAuthIdentity(allocation);
	await expect(result).rejects.toThrow("credentials withheld");
	await expect(result).rejects.not.toHaveProperty("cause");
	await expect(result).rejects.not.toThrow("private-password");
	expect(events).toEqual(["stop", "resolve", "remove"]);
	await expect(stat(allocation.journal)).rejects.toMatchObject({
		code: "ENOENT",
	});
	await expect(stat(allocation.directory)).rejects.toMatchObject({
		code: "ENOENT",
	});
});

it.each(["missing", "ambiguous", "cleanup"])(
	"retains recovery intent when allocation lookup/cleanup is %s",
	async (failure) => {
		const allocation = await fixture();
		try {
			allocation.create.mockRejectedValueOnce(
				new Error("secret provider detail")
			);
			if (failure === "missing") {
				allocation.resolve.mockResolvedValueOnce(undefined);
			} else if (failure === "ambiguous") {
				allocation.resolve.mockRejectedValueOnce(new Error("multiple matches"));
			} else {
				allocation.remove.mockRejectedValueOnce(
					new Error("secret cleanup response")
				);
			}
			await expect(allocateAuthIdentity(allocation)).rejects.toThrow(
				"credentials withheld"
			);
			expect(
				JSON.parse(await readFile(allocation.journal, "utf8"))
			).toMatchObject(allocation.record);
			if (failure !== "cleanup") {
				expect(allocation.remove).not.toHaveBeenCalled();
			}
		} finally {
			await rm(allocation.directory, { force: true, recursive: true });
		}
	}
);
