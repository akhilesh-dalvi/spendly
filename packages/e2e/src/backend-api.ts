import { anyApi } from "convex/server";
import type { api as generatedApi } from "../../backend/convex/_generated/api";

// The generated runtime is ESM in a backend package without type:module. Use
// Convex's identical reference proxy in Node, retaining generated API types.
export const api = anyApi as unknown as typeof generatedApi;
