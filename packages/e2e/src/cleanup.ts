import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { loadEnvironment } from "./environment";
import { readJournal } from "./journals";
import {
	findClerkUser,
	JOURNAL_DIRECTORY,
	removeBackendUser,
	removeClerkUser,
} from "./users";

const config = loadEnvironment();
const STALE_AFTER_MS = 2 * 60 * 60_000;
await mkdir(JOURNAL_DIRECTORY, { recursive: true, mode: 0o700 });
let removed = 0;
for (const name of await readdir(JOURNAL_DIRECTORY)) {
	if (name.startsWith(".") || !name.endsWith(".json")) {
		continue;
	}
	const journal = new URL(encodeURIComponent(name), JOURNAL_DIRECTORY);
	if (Date.now() - (await stat(journal)).mtimeMs < STALE_AFTER_MS) {
		continue;
	}
	const record = await readJournal(journal, config);
	const { email, directory } = record;
	const clerkId = record.clerkId ?? (await findClerkUser(config, email));
	if (clerkId) {
		await removeBackendUser(config, clerkId, email);
		await removeClerkUser(config, clerkId);
	}
	await rm(directory, { recursive: true, force: true });
	await rm(journal);
	removed += 1;
}
process.stdout.write(`Removed ${removed} stale E2E fixture users.\n`);
