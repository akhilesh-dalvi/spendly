#!/usr/bin/env node
import { runCli } from "../src/cli.js";
import { createDevelopmentRuntime } from "./runtime.js";

process.exitCode = await runCli(
	process.argv.slice(2),
	createDevelopmentRuntime()
);
