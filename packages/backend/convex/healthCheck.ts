// biome-ignore lint/style/useFilenamingConvention: Convex specific naming
import { query } from "./_generated/server";

export const get = query({
	handler: () => {
		return "OK";
	},
});
