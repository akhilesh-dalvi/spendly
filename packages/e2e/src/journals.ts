import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import type { E2EEnvironment } from "./environment";

const FIXTURE_EMAIL =
	/^spendly-e2e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\+clerk_test@example\.com$/u;
const CLERK_ID = /^user_[a-zA-Z0-9]+$/u;
const invalidJournal = () =>
	new Error("Invalid E2E fixture journal; contents withheld.");

export interface FixtureJournal {
	clerkId?: string;
	clerkIssuer: string;
	convexUrl: string;
	directory: string;
	email: string;
}

export const saveJournal = async (
	journal: URL,
	record: FixtureJournal
): Promise<void> => {
	const { email, clerkId, convexUrl, clerkIssuer, directory } = record;
	// Hidden, non-JSON siblings cannot be mistaken for recovery journals.
	const temporary = new URL(`.${randomUUID()}.tmp`, journal);
	try {
		await writeFile(
			temporary,
			JSON.stringify({ clerkId, clerkIssuer, convexUrl, directory, email }),
			{ flag: "wx", mode: 0o600 }
		);
		await rename(temporary, journal);
	} finally {
		await rm(temporary, { force: true });
	}
};

const assertOwnedDirectory = async (directory: string): Promise<void> => {
	let information: Stats;
	try {
		information = await lstat(directory);
	} catch (error) {
		// A prior cleanup may have removed credentials before journal deletion failed.
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return;
		}
		throw invalidJournal();
	}
	const owner = process.getuid?.();
	if (
		!information.isDirectory() ||
		(owner !== undefined && information.uid !== owner)
	) {
		throw invalidJournal();
	}
};

export const readJournal = async (
	journal: URL,
	config: E2EEnvironment
): Promise<FixtureJournal> => {
	const schema = z.object({
		clerkId: z.string().regex(CLERK_ID).optional(),
		clerkIssuer: z.literal(config.clerkIssuer),
		convexUrl: z.literal(config.convexUrl),
		directory: z
			.string()
			.refine(
				(directory) =>
					isAbsolute(directory) &&
					dirname(directory) === tmpdir() &&
					directory === join(tmpdir(), basename(directory)) &&
					basename(directory).startsWith("spendly-e2e-")
			),
		email: z.string().regex(FIXTURE_EMAIL),
	});
	try {
		const record = schema.parse(JSON.parse(await readFile(journal, "utf8")));
		await assertOwnedDirectory(record.directory);
		return record;
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw invalidJournal();
	}
};
