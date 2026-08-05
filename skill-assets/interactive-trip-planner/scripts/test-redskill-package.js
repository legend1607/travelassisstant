#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(process.argv[2] || path.join(scriptDir, ".."));
const scriptsDir = path.join(skillRoot, "scripts");

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

assert.ok(fs.existsSync(path.join(skillRoot, "SKILL.md")), `Missing SKILL.md: ${skillRoot}`);
assert.ok(fs.existsSync(scriptsDir), `Missing scripts directory: ${scriptsDir}`);

const packageJsonPath = path.join(skillRoot, "package.json");
assert.ok(fs.existsSync(packageJsonPath), "Missing package.json required for ESM .js scripts");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(packageJson.type, "module", 'package.json must declare "type": "module"');

const requiredDiscoveryRuntimeFiles = [
  "scripts/test-first-visit-balance.js",
  "scripts/cli-json-input.js",
  "scripts/recommend-taste-models.js",
  "scripts/build-source-query-matrix.js",
  "scripts/test-discovery-cli.js",
  "scripts/probe-source-access.js",
  "scripts/test-source-access-probe.js",
  "assets/source-packs/local-language-lexicons/es.json",
  "assets/source-packs/local-language-lexicons/ca.json",
];
const missingDiscoveryRuntimeFiles = requiredDiscoveryRuntimeFiles.filter(
  (relativePath) => !fs.existsSync(path.join(skillRoot, relativePath)),
);
assert.deepEqual(
  missingDiscoveryRuntimeFiles,
  [],
  `REDSkill release is missing discovery runtime files: ${missingDiscoveryRuntimeFiles.join(", ")}`,
);

const scriptFiles = walkFiles(scriptsDir);
const unsupportedScripts = scriptFiles
  .filter((file) => path.extname(file) !== ".js")
  .map((file) => path.relative(skillRoot, file));
assert.deepEqual(
  unsupportedScripts,
  [],
  `RedSkill publish scripts must use .js: ${unsupportedScripts.join(", ")}`,
);

const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".txt"]);
const referencedScripts = new Set();
const staleMjsReferences = [];
const legacyModuleExtension = [".m", "js"].join("");

for (const file of walkFiles(skillRoot)) {
  if (!textExtensions.has(path.extname(file))) continue;
  const relative = path.relative(skillRoot, file);
  const content = fs.readFileSync(file, "utf8");
  if (content.includes(legacyModuleExtension)) staleMjsReferences.push(relative);
  for (const match of content.matchAll(/scripts\/[A-Za-z0-9._/-]+\.js\b/g)) {
    referencedScripts.add(match[0]);
  }
}

assert.deepEqual(
  staleMjsReferences,
  [],
  `Stale legacy module references remain in: ${staleMjsReferences.join(", ")}`,
);

const missingReferences = [...referencedScripts].filter(
  (reference) => !fs.existsSync(path.join(skillRoot, reference)),
);
assert.deepEqual(
  missingReferences,
  [],
  `Referenced scripts are missing: ${missingReferences.join(", ")}`,
);

console.log(
  `RedSkill package contract OK: ${scriptFiles.length} .js scripts, ${referencedScripts.size} documented script references.`,
);
