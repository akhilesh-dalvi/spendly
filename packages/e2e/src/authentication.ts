// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import { setTimeout as delay } from "node:timers/promises";
import { clerkSetup } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";
import type { E2EEnvironment } from "./environment";
import type { RunningProcess } from "./process";

const AUTHORIZATION_LINE = /https:\/\/[^\s]+\r?\n/u;
const EMAIL_LABEL = /^Email address(?: or username)?$/iu;
const PASSWORD_LABEL = /^Password$/iu;
const CONTINUE_BUTTON = /^(Continue|Sign in)$/u;
const CONSENT_BUTTON = /^(Allow|Authorize)$/u;
const TEST_EMAIL = /^spendly-e2e-[0-9a-f-]{36}\+clerk_test@example\.com$/u;
const SIGN_IN_TIMEOUT_MS = 45_000;

const completeTestEmailChallenge = async (
	page: Page,
	email: string,
	completedChallenges: Set<string>
): Promise<void> => {
	const code = page.getByRole("textbox", {
		exact: true,
		name: "Enter verification code",
	});
	if (!(await code.isVisible())) {
		return;
	}
	if (!TEST_EMAIL.test(email)) {
		throw new Error(
			"Verification automation requires a synthetic Clerk test email"
		);
	}
	// The code field can mount before Clerk finishes sending/preparing a code.
	// Wait for the public SDK verification resource, not an arbitrary delay.
	const prepared = await page.waitForFunction(
		() => {
			const signIn = window.Clerk?.client?.signIn;
			if (
				window.Clerk?.user ||
				signIn?.status === "complete" ||
				document.title === "Spendly authorized"
			) {
				return "complete";
			}
			const verifications = [
				signIn?.firstFactorVerification,
				signIn?.secondFactorVerification,
				window.Clerk?.client?.signUp?.verifications.emailAddress,
			];
			for (const [factor, verification] of verifications.entries()) {
				if (
					verification?.strategy === "email_code" &&
					verification.status === "unverified" &&
					verification.expireAt !== null &&
					verification.expireAt !== undefined
				) {
					return `${factor}:${verification.expireAt.getTime()}`;
				}
			}
			return null;
		},
		undefined,
		{ timeout: 15_000 }
	);
	const challenge = await prepared.jsonValue();
	await prepared.dispose();
	if (
		typeof challenge !== "string" ||
		challenge === "complete" ||
		completedChallenges.has(challenge)
	) {
		return;
	}
	// Hosted sign-in may require an email first factor AND a separate new-device
	// challenge. Track prepared factors rather than assuming one code per login.
	await code.fill("424242");
	completedChallenges.add(challenge);
};

export const configureClerk = async (config: E2EEnvironment): Promise<void> => {
	// Clerk otherwise loads normal .env files, honors CLERK_API_URL and reuses
	// CLERK_TESTING_TOKEN. None may select an unintended instance/API host here.
	process.env.CLERK_TESTING_TOKEN = "";
	try {
		// @clerk/testing 1.14.9 honors apiUrl at runtime, but omits it from
		// ClerkSetupOptions. Keep the full options object without a type cast.
		const options = {
			apiUrl: "https://api.clerk.com",
			dotenv: false,
			publishableKey: config.publishableKey,
			secretKey: config.secretKey,
		};
		await clerkSetup(options);
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error("E2E Clerk setup failed; provider response withheld.");
	}
};

const beginSignIn = async (
	page: Page,
	email: string,
	password: string
): Promise<boolean> => {
	const identifier = page.getByLabel(EMAIL_LABEL);
	if (await identifier.isEditable({ timeout: 3000 })) {
		await identifier.fill(email, { timeout: 5000 });
	}
	const passwordInput = page.getByLabel(PASSWORD_LABEL, { exact: true });
	const passwordVisible = await passwordInput.isVisible();
	if (passwordVisible) {
		await passwordInput.fill(password, { timeout: 5000 });
	}
	try {
		await page
			.getByRole("button", { name: CONTINUE_BUTTON })
			.click({ timeout: 5000 });
	} catch (error) {
		// Account Portal may advance to the code screen while the original
		// submit is resolving. Do not wait on that screen's disabled Continue.
		if (
			!(await page
				.getByRole("textbox", { exact: true, name: "Enter verification code" })
				.isVisible())
		) {
			throw error;
		}
	}
	// Hosted Account Portal can choose an email-code step after the identifier;
	// do not block forever waiting for a password input that will never appear.
	return passwordVisible;
};

export const signInThroughUi = async (
	page: Page,
	email: string,
	password: string
): Promise<void> => {
	try {
		let passwordSubmitted = await beginSignIn(page, email, password);
		const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
		const completedChallenges = new Set<string>();
		while (Date.now() < deadline) {
			if (await page.evaluate(() => Boolean(window.Clerk?.user))) {
				return;
			}
			if (
				await page
					.getByRole("textbox", {
						exact: true,
						name: "Enter verification code",
					})
					.isVisible()
			) {
				await completeTestEmailChallenge(page, email, completedChallenges);
			}
			const passwordInput = page.getByLabel(PASSWORD_LABEL, { exact: true });
			if (!passwordSubmitted && (await passwordInput.isVisible())) {
				await passwordInput.fill(password);
				await page.getByRole("button", { name: CONTINUE_BUTTON }).click();
				passwordSubmitted = true;
			}
			await delay(100);
		}
		throw new Error("Web sign-in did not establish a session");
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error(
			"E2E Web sign-in failed; credentials and provider response withheld."
		);
	}
};

export const signUpThroughUi = async (
	page: Page,
	email: string,
	password: string
): Promise<void> => {
	try {
		if (!TEST_EMAIL.test(email)) {
			throw new Error(
				"Signup automation requires a synthetic Clerk test email"
			);
		}
		await page.getByLabel(EMAIL_LABEL).fill(email);
		await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(password);
		// Names and legal acceptance depend on the dedicated development
		// instance's user model. These remain real form interactions.
		for (const [name, value] of [
			["First name", "Spendly"],
			["Last name", "E2E"],
		] as const) {
			const field = page.getByLabel(name, { exact: true });
			if (await field.isVisible()) {
				await field.fill(value);
			}
		}
		const legalAcceptance = page.locator('input[name="legalAccepted"]');
		if (await legalAcceptance.isVisible()) {
			await legalAcceptance.check();
		}
		await page.getByRole("button", { exact: true, name: "Continue" }).click();
		const completedChallenges = new Set<string>();
		const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (await page.evaluate(() => Boolean(window.Clerk?.user))) {
				return;
			}
			await completeTestEmailChallenge(page, email, completedChallenges);
			await delay(100);
		}
		throw new Error("Web signup did not establish a session");
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error(
			"E2E Web signup failed; credentials and provider response withheld."
		);
	}
};

export const interactWithOAuth = async (
	page: Page,
	email: string,
	password: string,
	isFinished: () => boolean
): Promise<void> => {
	const completedChallenges = new Set<string>();
	let passwordSubmitted = false;
	let identifierSubmitted = false;
	while (!isFinished()) {
		if (
			await page
				.getByRole("textbox", { exact: true, name: "Enter verification code" })
				.isVisible()
		) {
			await completeTestEmailChallenge(page, email, completedChallenges);
		}
		const emailInput = page.getByLabel(EMAIL_LABEL);
		const allow = page.getByRole("button", { name: CONSENT_BUTTON });
		if (!identifierSubmitted && (await emailInput.isVisible())) {
			if (isFinished()) {
				return;
			}
			// The hosted Clerk origin need not inherit localhost's development cookie.
			// A successful hosted login can redirect straight to the CLI's callback,
			// which has no Clerk SDK. Process completion, not window.Clerk, proves it.
			passwordSubmitted = await beginSignIn(page, email, password);
			identifierSubmitted = true;
		} else if (
			!passwordSubmitted &&
			(await page.getByLabel(PASSWORD_LABEL, { exact: true }).isVisible())
		) {
			await page.getByLabel(PASSWORD_LABEL, { exact: true }).fill(password);
			await page.getByRole("button", { name: CONTINUE_BUTTON }).click();
			passwordSubmitted = true;
		} else if (await allow.isVisible()) {
			if (isFinished()) {
				return;
			}
			await allow.click({ timeout: 5000 });
		}
		// Bounded polling of optional hosted-login/consent states stops with the
		// subprocess. No losing Promise.race waiter can click a later Web page.
		await delay(100);
	}
};

interface OAuthOptions {
	clientId: string;
	interact?: (isFinished: () => boolean) => Promise<void>;
	issuer: string;
	login: RunningProcess;
	visit: (url: string) => Promise<unknown>;
}

export const completeOAuth = async ({
	login,
	issuer,
	clientId,
	visit,
	interact,
}: OAuthOptions): Promise<void> => {
	try {
		const url = (await login.waitForOutput(AUTHORIZATION_LINE)).trim();
		const authorization = new URL(url);
		if (
			authorization.origin !== issuer ||
			authorization.username !== "" ||
			authorization.password !== "" ||
			authorization.searchParams.get("client_id") !== clientId
		) {
			throw new Error("Unexpected OAuth request");
		}
		await visit(url);
		let finished = false;
		const completion = (async () => {
			try {
				return await login.result;
			} finally {
				finished = true;
			}
		})();
		// Keep a process timeout handled while a browser interaction is pending.
		completion.catch(() => undefined);
		await interact?.(() => finished);
		const result = await completion;
		if (result.exitCode !== 0 || result.signal !== null) {
			throw new Error("OAuth subprocess failed");
		}
	} catch {
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error(
			"E2E CLI OAuth failed; credentials and authorization details withheld."
		);
	} finally {
		await login.stop();
	}
};
