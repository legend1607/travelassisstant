#!/usr/bin/env node

import fs from "node:fs";

export function jsonInputUsage(command) {
  return {
    status: "usage",
    usage: `Usage: ${command} (--context <file> | --stdin)`,
  };
}

export function parseJsonInputArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length === 2 && argv[0] === "--context") {
    return { help: false, mode: "context", contextPath: argv[1] };
  }
  if (argv.length === 1 && argv[0] === "--stdin") return { help: false, mode: "stdin" };
  throw new Error("Provide exactly one of --context <file> or --stdin.");
}

function parseContext(source) {
  let context;
  try {
    context = JSON.parse(source);
  } catch {
    throw new Error("Context must contain valid JSON.");
  }
  if (!context || Array.isArray(context) || Object.getPrototypeOf(context) !== Object.prototype) {
    throw new Error("Context must be a JSON object.");
  }
  return context;
}

export function readJsonContext(argv, stdin) {
  const input = parseJsonInputArgs(argv);
  if (input.help) return input;

  let source = stdin;
  if (input.mode === "context") {
    try {
      if (!fs.statSync(input.contextPath).isFile()) throw new Error("not a file");
      source = fs.readFileSync(input.contextPath, "utf8");
    } catch {
      throw new Error("Context path must be a readable file.");
    }
  }
  return { ...input, context: parseContext(source) };
}
