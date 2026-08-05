#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const requestedRoot = path.resolve(process.argv[2] || path.join(scriptDir, ".."));
const skillRoot = fs.existsSync(path.join(requestedRoot, "SKILL.md"))
  ? requestedRoot
  : path.join(requestedRoot, "interactive-trip-planner");
const packageRoot = skillRoot === requestedRoot ? skillRoot : requestedRoot;

assert.ok(fs.existsSync(path.join(skillRoot, "SKILL.md")), `missing release skill: ${skillRoot}`);

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const allowedExtensions = new Set([
  ".txt", ".md", ".markdown", ".html", ".htm", ".css", ".js", ".py", ".java",
  ".cpp", ".c", ".h", ".php", ".sh", ".bat", ".ps1", ".json", ".xml", ".sql",
  ".db", ".sqlite", ".sqlite3", ".mdb", ".accdb", ".sys", ".ini", ".cfg", ".log",
]);
const packageFiles = walkFiles(packageRoot);
const unsupported = packageFiles
  .filter((file) => !allowedExtensions.has(path.extname(file).toLowerCase()))
  .map((file) => path.relative(packageRoot, file));
assert.deepEqual(unsupported, [], `unsupported REDSkill files: ${unsupported.join(", ")}`);
const forbiddenReleaseExtensions = packageFiles
  .filter((file) => [".yaml", ".yml", ".jsonl"].includes(path.extname(file).toLowerCase()))
  .map((file) => path.relative(packageRoot, file));
assert.deepEqual(forbiddenReleaseExtensions, [], `forbidden REDSkill files: ${forbiddenReleaseExtensions.join(", ")}`);
assert.ok(!packageFiles.some((file) => /(^|\/)agents\/openai\.ya?ml$/i.test(file)), "Codex-only openai.yaml must be omitted");
assert.ok(!packageFiles.some((file) => path.basename(file) === ".DS_Store"), ".DS_Store must be omitted");

const packageJson = JSON.parse(fs.readFileSync(path.join(skillRoot, "package.json"), "utf8"));
const expectedVersion = process.argv[3] || "";
assert.match(packageJson.version || "", /^\d+\.\d+\.\d+$/, "release package must identify a semantic version");
if (expectedVersion) {
  assert.equal(packageJson.version, expectedVersion, `release package must identify version ${expectedVersion}`);
}
assert.equal(packageJson.type, "module", "release scripts require ESM mode");

const lightTemplateReadme = fs.readFileSync(path.join(skillRoot, "assets", "guide-template", "README.md"), "utf8");
assert.match(lightTemplateReadme, /单个 HTML|内联/, "release template instructions should describe the standalone HTML");
assert.doesNotMatch(lightTemplateReadme, /maps\/vendor\/leaflet/, "release template instructions must not require a removed vendor directory");

const mapPaths = [
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html"),
  path.join(skillRoot, "assets", "guide-template", "maps", "itinerary-map.html"),
];

for (const mapPath of mapPaths) {
  const html = fs.readFileSync(mapPath, "utf8");
  const relative = path.relative(skillRoot, mapPath);
  assert.match(html, /REDSkill embedded Leaflet CSS/, `${relative} should embed Leaflet CSS`);
  assert.match(html, /REDSkill embedded Leaflet JS/, `${relative} should embed Leaflet JS`);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["'](?!https?:)[^"']+/i, `${relative} has a local stylesheet dependency`);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["'](?!https?:)[^"']+/i, `${relative} has a local script dependency`);
  assert.doesNotMatch(html, /vendor\/leaflet\/leaflet\.(?:css|js)/i, `${relative} still references Leaflet files`);
  assert.doesNotMatch(html, /url\(["']?images\//i, `${relative} still references Leaflet image files`);

  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());
  assert.ok(inlineScripts.length > 0, `${relative} should contain executable inline JavaScript`);
  for (const [index, script] of inlineScripts.entries()) {
    new vm.Script(script, { filename: `${relative}#inline-${index + 1}` });
  }
}

const publicTravelerFiles = [
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html"),
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "assets", "trip-data.js"),
];
for (const travelerFile of publicTravelerFiles) {
  assert.doesNotMatch(
    fs.readFileSync(travelerFile, "utf8"),
    /"sourceIds"\s*:/,
    `${path.relative(skillRoot, travelerFile)} must omit internal event sourceIds`,
  );
}

for (const vendorPath of [
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "vendor", "leaflet"),
  path.join(skillRoot, "assets", "guide-template", "maps", "vendor", "leaflet"),
]) {
  assert.ok(!fs.existsSync(vendorPath), `redundant Leaflet vendor directory remains: ${vendorPath}`);
}

const publicText = packageFiles
  .filter((file) => allowedExtensions.has(path.extname(file).toLowerCase()))
  .filter((file) => !path.relative(skillRoot, file).startsWith(`scripts${path.sep}`))
  .filter((file) => path.basename(file) !== "privacy.md")
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
for (const pattern of [
  /\/Users\/cyx/i,
  /file:\/\//i,
  /\b(?:AMAP_KEY|AMAP_SECURITY_KEY)\s*[:=]\s*\S+/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /Airbnb/i,
  /51240589/,
  /\bAF\d{3,4}\b/,
  /europe-2026-itinerary-/,
]) {
  assert.doesNotMatch(publicText, pattern, `privacy scan found ${pattern}`);
}

for (const testFile of [
  "test-redskill-package.js",
  "test-hybrid-taste-models.js",
  "test-regional-source-packs.js",
  "test-amap-cli.js",
  "test-contribution-extensibility.js",
  "test-first-visit-balance.js",
  "test-discovery-cli.js",
  "test-source-access-probe.js",
  "test-skill-contract.js",
]) {
  const result = spawnSync(process.execPath, [path.join(skillRoot, "scripts", testFile)], { encoding: "utf8" });
  assert.equal(result.status, 0, `${testFile} failed:\n${result.stdout}${result.stderr}`);
}

console.log(`REDSkill ${packageJson.version} release contract passed: ${packageFiles.length} supported files, 2 standalone maps`);
