import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

// A black-box file contract, deliberately not a production store/session import.
const sessionSchema = z
	.object({
		clientId: z.string().min(1),
		issuer: z.string().url(),
		loginAt: z.number().int().nonnegative(),
		schemaVersion: z.literal(1),
		subject: z.string().min(1),
		tokens: z
			.object({
				expiresAt: z.number().int().nonnegative(),
				idToken: z.string().min(1),
				refreshToken: z.string().min(1),
			})
			.strict(),
	})
	.strict();
const documentSchema = z.record(
	z.string().regex(/^[a-f0-9]{64}$/u),
	sessionSchema
);

type CredentialDocument = z.infer<typeof documentSchema>;

const readDocument = async (
	path: string
): Promise<CredentialDocument | null> => {
	try {
		const [file, directory] = await Promise.all([
			lstat(path),
			lstat(dirname(path)),
		]);
		if (
			!file.isFile() ||
			file.isSymbolicLink() ||
			!directory.isDirectory() ||
			directory.isSymbolicLink() ||
			file.mode % 0o1_0000 !== 0o600 ||
			directory.mode % 0o1_0000 !== 0o700 ||
			(process.getuid &&
				(file.uid !== process.getuid() || directory.uid !== process.getuid()))
		) {
			throw new Error("Unsafe credential file");
		}
		const parsed = documentSchema.safeParse(
			JSON.parse(await readFile(path, "utf8"))
		);
		if (!parsed.success || Object.keys(parsed.data).length !== 1) {
			throw new Error("Unexpected credential file contract");
		}
		return parsed.data;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error("E2E credential inspection failed; credentials withheld");
	}
};

const describeDocument = (document: CredentialDocument) => {
	const [namespace, session] = Object.entries(document)[0];
	return {
		clientId: session.clientId,
		expiresAt: session.tokens.expiresAt,
		hasRefreshToken: session.tokens.refreshToken.length > 0,
		issuer: session.issuer,
		loginAt: session.loginAt,
		namespace,
		namespaceCount: Object.keys(document).length,
		subject: session.subject,
	};
};

/** Secrets remain inside closures and never become assertion values or diagnostics. */
export const openCredentialProbe = async (path: string) => {
	const original = await readDocument(path);
	if (!original) {
		throw new Error(
			"E2E expected a genuine OAuth credential file; credentials withheld"
		);
	}
	const summary = describeDocument(original);
	const originalSession = original[summary.namespace];
	const changeMetadata = async (target: "refresh" | "authorization") => {
		const document = await readDocument(path);
		if (!document) {
			throw new Error("E2E credential file disappeared; credentials withheld");
		}
		const session = document[summary.namespace];
		if (!session) {
			throw new Error("E2E credential namespace changed; credentials withheld");
		}
		if (target === "refresh") {
			// Keep the genuine signed ID/refresh tokens byte-for-byte untouched.
			session.tokens.expiresAt = 0;
		} else {
			session.loginAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
		}
		try {
			await writeFile(path, `${JSON.stringify(document)}\n`, { mode: 0o600 });
		} catch {
			// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
			throw new Error(
				"E2E could not change local expiry metadata; credentials withheld"
			);
		}
	};
	return {
		expireAuthorization: async () => await changeMetadata("authorization"),
		expireForRefresh: async () => await changeMetadata("refresh"),
		inspect: async () => {
			const document = await readDocument(path);
			const session = document?.[summary.namespace];
			return {
				present: Boolean(session),
				summary: document ? describeDocument(document) : null,
				tokensChanged: Boolean(
					session &&
						(session.tokens.idToken !== originalSession.tokens.idToken ||
							session.tokens.refreshToken !==
								originalSession.tokens.refreshToken)
				),
				unchanged: JSON.stringify(document) === JSON.stringify(original),
			};
		},
		summary,
	};
};
