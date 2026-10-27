export const PACKAGE_MANAGERS = ["pnpm", "npm", "bun", "yarn"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export type PackageManagerCommands = Record<PackageManager, string>;

const COMMAND_LINE =
	/^(\s*)((?:[A-Z_][A-Z0-9_]*=[^\s]+\s+)*)(npm install --global |npm uninstall --global |npx )(.+)$/;

export function isPackageManager(value: unknown): value is PackageManager {
	return (
		value === "pnpm" || value === "npm" || value === "bun" || value === "yarn"
	);
}

// Convert only the standalone command forms used by the docs. Diagnostic npm
// commands, inline snippets, and ordinary Spendly commands stay unchanged.
export function packageManagerCommands(
	source: string
): PackageManagerCommands | undefined {
	let converted = false;
	const lines: Record<PackageManager, string[]> = {
		bun: [],
		npm: [],
		pnpm: [],
		yarn: [],
	};
	for (const line of source.split("\n")) {
		const match = COMMAND_LINE.exec(line);
		if (!match) {
			for (const manager of PACKAGE_MANAGERS) {
				lines[manager].push(line);
			}
			continue;
		}
		const [, indent, environment, command, args] = match;
		const prefix = `${indent}${environment}`;
		converted = true;
		lines.npm.push(line);
		if (command === "npm install --global ") {
			lines.pnpm.push(`${prefix}pnpm add --global ${args}`);
			lines.bun.push(`${prefix}bun add --global ${args}`);
			lines.yarn.push(`${prefix}yarn global add ${args}`);
		} else if (command === "npm uninstall --global ") {
			lines.pnpm.push(`${prefix}pnpm remove --global ${args}`);
			lines.bun.push(`${prefix}bun remove --global ${args}`);
			lines.yarn.push(`${prefix}yarn global remove ${args}`);
		} else {
			lines.pnpm.push(`${prefix}pnpm dlx ${args}`);
			lines.bun.push(`${prefix}bunx ${args}`);
			// Yarn Classic supports global installs but not `dlx`. npx ships
			// with the required Node.js setup and works with either Yarn generation.
			lines.yarn.push(`${prefix}npx ${args}`);
		}
	}
	if (!converted) {
		return undefined;
	}
	return {
		bun: lines.bun.join("\n"),
		npm: lines.npm.join("\n"),
		pnpm: lines.pnpm.join("\n"),
		yarn: lines.yarn.join("\n"),
	};
}
