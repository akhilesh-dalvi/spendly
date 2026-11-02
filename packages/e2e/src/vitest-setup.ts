// biome-ignore-all lint/performance/noAwaitInLoops: Stateful E2E steps and fixture cleanup require ordered execution.
import { setTimeout as delay } from "node:timers/promises";
import { loadEnvironment, webEnvironment } from "./environment";
import { startProcess } from "./process";

export default async function setup(): Promise<() => Promise<void>> {
	const config = loadEnvironment();
	try {
		await fetch(config.baseUrl, { signal: AbortSignal.timeout(1000) });
		throw new Error(
			"E2E requires port 3001 to be unused; refusing to reuse an unverified server."
		);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("E2E requires")) {
			throw error;
		}
	}
	const server = startProcess({
		args: ["--dir", "../../apps/web", "dev"],
		command: "pnpm",
		env: webEnvironment(config),
		maxOutputBytes: 8 * 1024 * 1024,
		timeoutMs: 30 * 60_000,
	});
	let ready = false;
	const deadline = Date.now() + 120_000;
	try {
		while (Date.now() < deadline) {
			try {
				const response = await fetch(`${config.baseUrl}/sign-in`, {
					signal: AbortSignal.timeout(2000),
				});
				if (response.ok) {
					ready = true;
					break;
				}
			} catch {
				// Poll only server readiness, never product assertions.
			}
			await delay(250);
		}
		if (!ready) {
			throw new Error("E2E Web server did not become ready; output withheld.");
		}
		return async () => {
			await server.stop();
		};
	} catch {
		await server.stop();
		// biome-ignore lint/style/useErrorCause: Never retain credential-bearing provider, filesystem, or subprocess errors.
		throw new Error("E2E Web setup failed; output withheld.");
	}
}
