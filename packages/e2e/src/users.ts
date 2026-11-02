import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import type {
	FunctionArgs,
	FunctionReference,
	FunctionReturnType,
} from "convex/server";
import { z } from "zod";
import { allocateAuthIdentity } from "./auth-allocation";
import {
	completeOAuth,
	interactWithOAuth,
	signInThroughUi,
	signUpThroughUi,
} from "./authentication";
import { api } from "./backend-api";
import type { E2EEnvironment } from "./environment";
import { runProcess, startProcess } from "./process";

const userSchema = z.object({ id: z.string().regex(/^user_[a-zA-Z0-9]+$/u) });
const FIXTURE_EMAIL = /^spendly-e2e-[0-9a-f-]{36}\+clerk_test@example\.com$/u;
const CLI_ENTRY = fileURLToPath(
	new URL(
		"../../../apps/cli/development-dist/development/index.js",
		import.meta.url
	)
);
export const JOURNAL_DIRECTORY = new URL("../.e2e/users/", import.meta.url);

const clerkRequest = async (
	config: E2EEnvironment,
	path: string,
	method: string,
	body?: unknown
): Promise<unknown> => {
	const response = await fetch(`https://api.clerk.com/v1/${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${config.secretKey}`,
			"Content-Type": "application/json",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(30_000),
	});
	if (method === "DELETE" && response.status === 404) {
		return {};
	}
	if (!response.ok) {
		throw new Error(
			`E2E Clerk ${method} request failed (${response.status}); response withheld.`
		);
	}
	return await response.json();
};

const clerkUsersSchema = z.array(
	userSchema.extend({
		email_addresses: z.array(z.object({ email_address: z.string() })),
	})
);

export const findClerkUser = async (
	config: E2EEnvironment,
	email: string
): Promise<string | undefined> => {
	if (!FIXTURE_EMAIL.test(email)) {
		throw new Error("E2E identity lookup requires an exact synthetic email.");
	}
	const query = new URLSearchParams({ email_address: email, limit: "2" });
	const result = clerkUsersSchema.safeParse(
		await clerkRequest(config, `users?${query}`, "GET")
	);
	if (
		!result.success ||
		result.data.length > 1 ||
		result.data.some(
			(user) =>
				!user.email_addresses.some((address) => address.email_address === email)
		)
	) {
		throw new Error("E2E creation-intent lookup failed; response withheld.");
	}
	return result.data[0]?.id;
};

export const removeClerkUser = async (
	config: E2EEnvironment,
	clerkId: string
): Promise<void> => {
	await clerkRequest(config, `users/${clerkId}`, "DELETE");
};

export const removeBackendUser = async (
	config: E2EEnvironment,
	clerkId: string,
	email: string
): Promise<void> => {
	const response = await fetch(`${config.convexUrl}/api/mutation`, {
		method: "POST",
		headers: {
			Authorization: `Convex ${config.deployKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			path: "e2eFixtures:removeUser",
			format: "convex_encoded_json",
			args: [{ clerkId, email, expectedDeploymentUrl: config.convexUrl }],
		}),
		signal: AbortSignal.timeout(30_000),
	});
	const result = z
		.object({ status: z.string() })
		.safeParse(await response.json());
	if (!(response.ok && result.success) || result.data.status !== "success") {
		throw new Error(
			"E2E fixture cleanup unavailable; deploy e2eFixtures and enable SPENDLY_E2E_ENABLED only on the test deployment. Response withheld."
		);
	}
};

export interface E2EUser {
	page: Page;
	email: string;
	config: E2EEnvironment;
	credentialFile?: string;
	cliEnvironment?: NodeJS.ProcessEnv;
	query: <Query extends FunctionReference<"query">>(
		query: Query,
		args: FunctionArgs<Query>
	) => Promise<FunctionReturnType<Query>>;
	mutation: <Mutation extends FunctionReference<"mutation">>(
		mutation: Mutation,
		args: FunctionArgs<Mutation>
	) => Promise<FunctionReturnType<Mutation>>;
	runCli: (args: readonly string[]) => ReturnType<typeof runProcess>;
	loginCli: () => Promise<void>;
	dispose: () => Promise<void>;
}

export const createUser = async (
	page: Page,
	config: E2EEnvironment,
	options: { creationMode?: "admin" | "sign-up" } = {}
): Promise<E2EUser> => {
	const email = `spendly-e2e-${randomUUID()}+clerk_test@example.com`;
	// Preflight verifies server-side cleanup guards before allocating any user/data.
	await removeBackendUser(config, "e2e-preflight-absent", email);
	const password = `${randomBytes(24).toString("base64url")}aA1!`;
	await mkdir(JOURNAL_DIRECTORY, { recursive: true, mode: 0o700 });
	const directory = await mkdtemp(join(tmpdir(), "spendly-e2e-"));
	const journal = new URL(`${randomUUID()}.json`, JOURNAL_DIRECTORY);
	const record = {
		email,
		convexUrl: config.convexUrl,
		clerkIssuer: config.clerkIssuer,
		directory,
	};
	const id = await allocateAuthIdentity({
		journal,
		record,
		create: async () => {
			if (options.creationMode === "sign-up") {
				await setupClerkTestingToken({ page });
				await page.goto(`${config.baseUrl}/sign-up`);
				await signUpThroughUi(page, email, password);
				let clerkId: string | undefined;
				await expect
					.poll(
						async () => {
							clerkId = await findClerkUser(config, email);
							return Boolean(clerkId);
						},
						{ timeout: 15_000, message: "Signup identity was not provisioned" }
					)
					.toBe(true);
				if (!clerkId) {
					throw new Error("Signup identity unavailable");
				}
				return clerkId;
			}
			return userSchema.parse(
				await clerkRequest(config, "users", "POST", {
					email_address: [email],
					password,
					skip_password_checks: true,
				})
			).id;
		},
		resolve: async () => await findClerkUser(config, email),
		stop: async () => {
			if (!page.isClosed()) {
				await page.close();
			}
		},
		remove: async (clerkId) => {
			await removeClerkUser(config, clerkId);
			await removeBackendUser(config, clerkId, email);
		},
	});
	const client = new ConvexHttpClient(config.convexUrl, { logger: false });
	const refreshAuth = async () => {
		// A document reload resolves before Clerk hydrates its real session.
		await page.waitForFunction(
			() => Boolean(window.Clerk?.loaded && window.Clerk.session),
			undefined,
			{ timeout: 15_000 }
		);
		const token = await page.evaluate(async () => {
			const sdk = window.Clerk;
			if (!sdk?.session) {
				throw new Error("E2E Web session unavailable");
			}
			return await sdk.session.getToken({ template: "convex" });
		});
		if (!token) {
			throw new Error("E2E Convex JWT template unavailable");
		}
		client.setAuth(token);
	};
	const env = {
		PATH: process.env.PATH ?? "",
		HOME: directory,
		TZ: "UTC",
		NO_COLOR: "1",
		SPENDLY_CLERK_ISSUER: config.clerkIssuer,
		SPENDLY_CLERK_OAUTH_CLIENT_ID: config.oauthClientId,
		SPENDLY_CONVEX_URL: config.convexUrl,
		SPENDLY_WEB_URL: config.baseUrl,
		SPENDLY_E2E_CREDENTIAL_FILE: join(directory, "credentials", "session.json"),
	};
	const dispose = async () => {
		try {
			// Stop UserSync before cleanup so it cannot re-create a deleted profile.
			if (!page.isClosed()) {
				await page.close();
			}
			await removeClerkUser(config, id);
			await removeBackendUser(config, id, email);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
		// Retain recovery information until remote AND local cleanup succeeded.
		await rm(journal, { force: true });
	};
	const user: E2EUser = {
		page,
		email,
		config,
		credentialFile: env.SPENDLY_E2E_CREDENTIAL_FILE,
		cliEnvironment: env,
		query: async (query, args) => {
			await refreshAuth();
			return await client.query(query, args);
		},
		mutation: async (mutation, args) => {
			await refreshAuth();
			return await client.mutation(mutation, args);
		},
		runCli: async (args) =>
			await runProcess({
				command: process.execPath,
				args: [CLI_ENTRY, ...args, "--json", "--non-interactive", "--no-color"],
				env,
			}),
		loginCli: async () => {
			const login = startProcess({
				command: process.execPath,
				args: [CLI_ENTRY, "auth", "login", "--no-browser"],
				env,
				timeoutMs: 120_000,
			});
			try {
				await completeOAuth({
					login,
					issuer: config.clerkIssuer,
					clientId: config.oauthClientId,
					visit: async (url) =>
						await page.goto(url, { waitUntil: "domcontentloaded" }),
					interact: async (isFinished) =>
						await interactWithOAuth(page, email, password, isFinished),
				});
				await page.goto(`${config.baseUrl}/dashboard`);
			} catch {
				throw new Error(
					"E2E CLI OAuth failed; credentials and authorization details withheld."
				);
			}
		},
		dispose,
	};
	try {
		if (options.creationMode !== "sign-up") {
			await setupClerkTestingToken({ page });
			await page.goto(`${config.baseUrl}/sign-in`);
			await signInThroughUi(page, email, password);
			await page.goto(`${config.baseUrl}/onboarding/start`);
		}
		// Signup deliberately follows Clerk's actual redirect instead of
		// navigating past a broken signup-to-onboarding transition.
		// The Web app's UserSync owns profile provisioning; fixtures must not
		// make onboarding pass by calling users.create themselves.
		await expect
			.poll(
				async () => {
					try {
						const profile = await user.query(api.users.get, {});
						return profile.clerkId === id && profile.email === email;
					} catch {
						return false;
					}
				},
				{
					timeout: 30_000,
					message:
						"Web profile synchronization did not provision the signed-in user",
				}
			)
			.toBe(true);
		return user;
	} catch {
		await dispose();
		throw new Error(
			"E2E user setup failed; credentials and provider response withheld."
		);
	}
};

export const seedUser = async (user: E2EUser) => {
	await user.mutation(api.users.beginOnboarding, {
		currency: "USD",
		path: "free",
	});
	const cycleId = await user.mutation(api.cycles.saveOnboardingCycle, {
		name: "E2E tracking",
		startDate: "2020-01-01",
		endDate: "2030-01-01",
	});
	const types = await user.query(api.accountTypes.list, {});
	const assetType = types.find((type) => type.balanceNature === "asset");
	if (!assetType) {
		throw new Error("E2E requires a seeded asset account type");
	}
	const accountId = await user.mutation(api.accounts.createOnboardingAccount, {
		name: "E2E Wallet",
		accountTypeId: assetType._id,
		openingBalance: 1000,
	});
	const destination = await user.mutation(api.accounts.create, {
		name: "E2E Savings",
		accountTypeId: assetType._id,
		startingBalance: 200,
	});
	return {
		cycleId,
		accountId,
		destinationId: destination._id,
		assetTypeId: assetType._id,
		date: new Date().toISOString().slice(0, 10),
	};
};
