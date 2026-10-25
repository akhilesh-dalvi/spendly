import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import loadConfig from "next/dist/server/config";
import { beforeAll, expect, it } from "vitest";

let config: NextConfig;

beforeAll(async () => {
	config = await loadConfig(PHASE_PRODUCTION_BUILD, process.cwd());
});

it("isolates production compilation in a memory-optimized webpack worker", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../package.json", import.meta.url), "utf8")
	);
	expect(manifest.scripts.build).toBe("next build --webpack");
	expect(config.experimental?.webpackBuildWorker).toBe(true);
	expect(config.experimental?.webpackMemoryOptimizations).toBe(true);
});

it("keeps production typechecking enabled", () => {
	expect(config.typescript?.ignoreBuildErrors).not.toBe(true);
});
