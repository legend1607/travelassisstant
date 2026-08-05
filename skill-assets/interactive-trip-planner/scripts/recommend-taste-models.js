#!/usr/bin/env node

import fs from "node:fs";
import { jsonInputUsage, parseJsonInputArgs, readJsonContext } from "./cli-json-input.js";
import { recommendTasteModels } from "./taste-model-runtime.js";

const command = "recommend-taste-models.js";

try {
  const argv = process.argv.slice(2);
  const args = parseJsonInputArgs(argv);
  if (args.help) {
    process.stdout.write(JSON.stringify(jsonInputUsage(command), null, 2) + "\n");
  } else {
    const stdin = args.mode === "stdin" ? fs.readFileSync(0, "utf8") : "";
    const input = readJsonContext(argv, stdin);
    process.stdout.write(JSON.stringify(recommendTasteModels(input.context), null, 2) + "\n");
  }
} catch (error) {
  process.stderr.write(error.message + "\n");
  process.exitCode = 2;
}
