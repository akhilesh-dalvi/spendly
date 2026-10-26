import { highlight } from "fumadocs-core/highlight";
import type { ReactNode } from "react";
import {
	PACKAGE_MANAGERS,
	type PackageManagerCommands,
} from "@/lib/docs/package-manager";

function Contents({ children }: { children?: ReactNode }) {
	return <>{children}</>;
}

export async function highlightCommands(commands: PackageManagerCommands) {
	// Reuse Fumadocs' server highlighter and themes for every manager. Only the
	// rendered tokens cross the client boundary, not the highlighter itself.
	const [pnpm, npm, bun, yarn] = await Promise.all(
		PACKAGE_MANAGERS.map((manager) =>
			highlight(commands[manager], {
				lang: "bash",
				components: { pre: Contents, code: Contents },
			})
		)
	);
	return { pnpm, npm, bun, yarn };
}
