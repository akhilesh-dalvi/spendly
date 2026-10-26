import { describe, expect, it } from "vitest";
import { packageManagerCommands } from "@/lib/docs/package-manager";

describe("package-manager command alternatives", () => {
	it("converts global installs and preserves the remaining commands and newlines", () => {
		const source =
			"npm install --global spendly@latest\nspendly --version\nspendly auth login\n";
		expect(packageManagerCommands(source)).toEqual({
			npm: source,
			pnpm: "pnpm add --global spendly@latest\nspendly --version\nspendly auth login\n",
			bun: "bun add --global spendly@latest\nspendly --version\nspendly auth login\n",
			yarn: "yarn global add spendly@latest\nspendly --version\nspendly auth login\n",
		});
	});

	it("converts global removal without changing sign-out", () => {
		expect(
			packageManagerCommands(
				"spendly auth logout\nnpm uninstall --global spendly"
			)?.bun
		).toBe("spendly auth logout\nbun remove --global spendly");
	});

	it("preserves environment variables and skill flags for tool runners", () => {
		const args =
			"skills add akhilesh-dalvi/spendly --skill spendly --global --agent codex";
		expect(packageManagerCommands(`DISABLE_TELEMETRY=1 npx ${args}`)).toEqual({
			npm: `DISABLE_TELEMETRY=1 npx ${args}`,
			pnpm: `DISABLE_TELEMETRY=1 pnpm dlx ${args}`,
			bun: `DISABLE_TELEMETRY=1 bunx ${args}`,
			yarn: `DISABLE_TELEMETRY=1 npx ${args}`,
		});
	});

	it("keeps explicit registry options", () => {
		expect(
			packageManagerCommands(
				"npm install --global spendly@latest --registry=https://registry.npmjs.org/"
			)?.pnpm
		).toBe(
			"pnpm add --global spendly@latest --registry=https://registry.npmjs.org/"
		);
	});

	it.each([
		"spendly expenses list",
		"node --version\nnpm --version",
		"npm view spendly@latest version --registry=https://registry.npmjs.org/",
		'export PATH="$(npm prefix --global)/bin:$PATH"',
		'echo "npm install --global spendly@latest"',
	])("does not translate unrelated code: %s", (source) => {
		expect(packageManagerCommands(source)).toBeUndefined();
	});
});
