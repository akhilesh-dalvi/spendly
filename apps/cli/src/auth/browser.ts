import { spawn } from "node:child_process";

interface BrowserProcess {
	once: (event: "error" | "spawn", listener: () => void) => void;
	unref: () => void;
}

export interface BrowserDependencies {
	platform: NodeJS.Platform;
	spawn: (command: string, args: string[]) => BrowserProcess;
}

const defaultDependencies: BrowserDependencies = {
	platform: process.platform,
	spawn: (command, args) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		return {
			once: (event, listener) => {
				child.once(event, listener);
			},
			unref: () => child.unref(),
		};
	},
};

export const openSystemBrowser = async (
	url: string,
	dependencies: BrowserDependencies = defaultDependencies
): Promise<boolean> => {
	const command = dependencies.platform === "darwin" ? "open" : "xdg-open";
	if (dependencies.platform !== "darwin" && dependencies.platform !== "linux") {
		return false;
	}

	return await new Promise<boolean>((resolve) => {
		const child = dependencies.spawn(command, [url]);
		child.once("error", () => resolve(false));
		child.once("spawn", () => {
			child.unref();
			resolve(true);
		});
	});
};
