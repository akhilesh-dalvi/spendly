// biome-ignore-all lint/style/useFilenamingConvention: Convex module filenames use camelCase.
import { v } from "convex/values";

export const actionSourceValidator = v.union(
	v.literal("web"),
	v.literal("cli"),
	v.literal("cli_agent")
);

export type ActionSource = "web" | "cli" | "cli_agent";

export const resolveCliActionSource = (agent?: boolean): ActionSource =>
	agent ? "cli_agent" : "cli";
