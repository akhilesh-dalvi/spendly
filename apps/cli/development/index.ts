#!/usr/bin/env node
import { runCli } from "../src/cli.js";
import { createProcessRuntime } from "../src/runtime.js";
import { loadDevelopmentConfig } from "./config.js";

process.exitCode = await runCli(
	process.argv.slice(2),
	createProcessRuntime(() => loadDevelopmentConfig(), process.env, {
		developmentTools: true,
	})
);
