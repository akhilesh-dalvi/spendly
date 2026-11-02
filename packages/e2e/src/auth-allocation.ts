import { rm } from "node:fs/promises";
import { type FixtureJournal, saveJournal } from "./journals";

interface AuthAllocation {
	journal: URL;
	record: FixtureJournal;
	create: () => Promise<string>;
	resolve: () => Promise<string | undefined>;
	stop: () => Promise<void>;
	remove: (clerkId: string) => Promise<void>;
}

// Used for both admin allocation and real UI signup. The intent contains no
// passwords/tokens and must be durable before either path can create a user.
export const allocateAuthIdentity = async ({
	journal,
	record,
	create,
	resolve,
	stop,
	remove,
}: AuthAllocation): Promise<string> => {
	try {
		await saveJournal(journal, record);
	} catch {
		await rm(record.directory, { recursive: true, force: true });
		throw new Error("E2E creation-intent journal could not be saved");
	}
	try {
		const clerkId = await create();
		await saveJournal(journal, { ...record, clerkId });
		return clerkId;
	} catch {
		try {
			// Stop UserSync and pending browser work before resolving a signup
			// that may have succeeded despite a lost response/navigation failure.
			await stop();
			const clerkId = await resolve();
			if (clerkId) {
				await saveJournal(journal, { ...record, clerkId });
				await remove(clerkId);
				await rm(record.directory, { recursive: true, force: true });
				await rm(journal, { force: true });
			}
		} catch {
			// No broad sweep: failed/ambiguous lookup or cleanup retains the
			// journal. A missing lookup may still be an in-flight remote create.
		}
		throw new Error(
			"E2E identity creation failed; credentials withheld. Run journal recovery if an intent remains."
		);
	}
};
