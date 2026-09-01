#!/usr/bin/env node
import { runCli } from "./cli.js";
import { PRODUCTION_CONFIG } from "./config.js";
import { createProcessRuntime } from "./runtime.js";

process.exitCode = await runCli(
	process.argv.slice(2),
	createProcessRuntime(PRODUCTION_CONFIG)
);
