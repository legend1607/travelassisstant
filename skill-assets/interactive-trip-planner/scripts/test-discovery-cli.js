#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-trip-planner-discovery-cli-"));
const contextPath = path.join(tempDir, "taste-context.json");
const spainPath = path.join(tempDir, "spain-context.json");
const queryWithoutTastePath = path.join(tempDir, "query-without-taste.json");
const missingLocalTermsPath = path.join(tempDir, "missing-local-terms.json");
const missingQueryContextPaths = [
  path.join(tempDir, "missing-country-code.json"),
  path.join(tempDir, "missing-destination.json"),
  path.join(tempDir, "missing-year-month.json"),
];
const invalidQueryContextPaths = [
  path.join(tempDir, "invalid-country-code.json"),
  path.join(tempDir, "invalid-destination.json"),
  path.join(tempDir, "invalid-year-month.json"),
];
const missingPath = path.join(tempDir, "missing-context.json");
const directoryPath = path.join(tempDir, "context-directory");
const invalidJsonPath = path.join(tempDir, "invalid-context.json");
const invalidShapePaths = [
  path.join(tempDir, "null-context.json"),
  path.join(tempDir, "array-context.json"),
  path.join(tempDir, "primitive-context.json"),
];
const cliScripts = ["recommend-taste-models.js", "build-source-query-matrix.js"];

fs.writeFileSync(contextPath, JSON.stringify({
  destination: "Paris",
  playStyles: ["architecture", "neighborhood-walk"],
  pace: "unhurried",
  companions: ["solo"],
  interests: ["craft", "art", "markets"],
}));
fs.writeFileSync(spainPath, JSON.stringify({
  countryCode: "ES",
  destination: "Barcelona",
  yearMonth: "octubre 2026",
  localLanguageTags: ["es", "ca"],
  tasteTerms: ["vida de barrio", "mercado municipal"],
}));
fs.writeFileSync(queryWithoutTastePath, JSON.stringify({
  countryCode: "ES",
  destination: "  Madrid  ",
  yearMonth: "  2026-11  ",
}));
fs.writeFileSync(missingLocalTermsPath, JSON.stringify({
  countryCode: "BR",
  destination: "Recife",
  yearMonth: "2026-11",
  localLanguageTags: ["es"],
}));
fs.writeFileSync(missingQueryContextPaths[0], JSON.stringify({ destination: "Madrid", yearMonth: "2026-11" }));
fs.writeFileSync(missingQueryContextPaths[1], JSON.stringify({ countryCode: "ES", yearMonth: "2026-11" }));
fs.writeFileSync(missingQueryContextPaths[2], JSON.stringify({ countryCode: "ES", destination: "Madrid" }));
fs.writeFileSync(invalidQueryContextPaths[0], JSON.stringify({ countryCode: "Spain", destination: "Madrid", yearMonth: "2026-11" }));
fs.writeFileSync(invalidQueryContextPaths[1], JSON.stringify({ countryCode: "ES", destination: ["Madrid"], yearMonth: "2026-11" }));
fs.writeFileSync(invalidQueryContextPaths[2], JSON.stringify({ countryCode: "ES", destination: "Madrid", yearMonth: 202611 }));
fs.mkdirSync(directoryPath);
fs.writeFileSync(invalidJsonPath, "not json super-secret-body");
fs.writeFileSync(invalidShapePaths[0], "null");
fs.writeFileSync(invalidShapePaths[1], "[]");
fs.writeFileSync(invalidShapePaths[2], '"not-an-object"');

function run(script, args = [], input) {
  return spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    encoding: "utf8",
    input,
  });
}

function assertFailure(result) {
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /\S/);
  assert.doesNotMatch(result.stderr, /super-secret-body/);
}

function queryStrings(matrix) {
  return matrix.intents.flatMap((intent) => [
    intent.queries.zh,
    intent.queries.en,
    ...intent.queries.local.map((item) => item.query),
  ]);
}

function runWithUnreadableStdin(script, args) {
  const fifoPath = path.join(tempDir, `unreadable-${script}.fifo`);
  const fifo = spawnSync("mkfifo", [fifoPath], { encoding: "utf8" });
  assert.equal(fifo.status, 0, fifo.stderr);
  const stdin = fs.openSync(fifoPath, fs.constants.O_RDWR);
  try {
    return spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
      encoding: "utf8",
      stdio: [stdin, "pipe", "pipe"],
      timeout: 500,
    });
  } finally {
    fs.closeSync(stdin);
    fs.rmSync(fifoPath, { force: true });
  }
}

try {
  const taste = run("recommend-taste-models.js", ["--context", contextPath]);
  assert.equal(taste.status, 0, taste.stderr);
  assert.equal(JSON.parse(taste.stdout).recommendations[0].id, "city-craft-rhythm");
  assert.equal(taste.stderr, "");

  const mixed = run("recommend-taste-models.js", ["--stdin"], JSON.stringify({ interests: ["craft", "street-life"] }));
  assert.equal(mixed.status, 0, mixed.stderr);
  assert.equal(JSON.parse(mixed.stdout).recommendations[0].id, "city-craft-rhythm");
  assert.deepEqual(JSON.parse(mixed.stdout).unknownTerms.interests, ["street-life"]);
  assert.equal(run("recommend-taste-models.js", ["--context", contextPath]).stdout, taste.stdout);

  const queries = run("build-source-query-matrix.js", ["--context", spainPath]);
  assert.equal(queries.status, 0, queries.stderr);
  assert.equal(JSON.parse(queries.stdout).status, "ready");
  assert.doesNotMatch(queries.stdout, /当地语言|\{local:/);
  const queryStdin = run("build-source-query-matrix.js", ["--stdin"], fs.readFileSync(spainPath, "utf8"));
  assert.equal(queryStdin.status, 0, queryStdin.stderr);
  assert.equal(queryStdin.stdout, queries.stdout);

  const queryWithoutTaste = run("build-source-query-matrix.js", ["--context", queryWithoutTastePath]);
  assert.equal(queryWithoutTaste.status, 0, queryWithoutTaste.stderr);
  const queryWithoutTasteOutput = JSON.parse(queryWithoutTaste.stdout);
  assert.equal(queryWithoutTasteOutput.status, "ready");
  assert.match(queryWithoutTasteOutput.intents[0].queries.zh, /^Madrid 2026-11 /);
  for (const query of queryStrings(queryWithoutTasteOutput)) {
    assert.doesNotMatch(query, /\{[^}]+\}|\[目的地\]|\[旅行月份 年份\]|\[本次偏好词\]| {2,}/);
  }

  const missingLocalTerms = run("build-source-query-matrix.js", ["--context", missingLocalTermsPath]);
  assert.equal(missingLocalTerms.status, 0, missingLocalTerms.stderr);
  const missingLocalTermsOutput = JSON.parse(missingLocalTerms.stdout);
  assert.equal(missingLocalTermsOutput.status, "needs-local-language-terms");
  for (const query of queryStrings(missingLocalTermsOutput)) {
    assert.doesNotMatch(query, /\{[^}]+\}|\[目的地\]|\[旅行月份 年份\]|\[本次偏好词\]| {2,}/);
  }

  for (const missingContextPath of missingQueryContextPaths) {
    const missingContext = run("build-source-query-matrix.js", ["--context", missingContextPath]);
    assert.equal(missingContext.status, 0, missingContext.stderr);
    const output = JSON.parse(missingContext.stdout);
    assert.equal(output.status, "needs-context");
    assert.deepEqual(output.intents, []);
    assert.ok(output.missingContextFields.length >= 1);
    assert.deepEqual(queryStrings(output), []);
  }
  for (const invalidContextPath of invalidQueryContextPaths) {
    assertFailure(run("build-source-query-matrix.js", ["--context", invalidContextPath]));
  }

  const unsafeQueryContexts = [
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      tasteTerms: ["   "],
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTags: [7],
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      tasteTerms: { value: "custom-secret-fragment" },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: [],
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: null,
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { es: [] },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { es: null },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { "bad tag": { "events-calendar": "agenda" } },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { es: { "bad token": "agenda" } },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { es: { "events-calendar": "" } },
    },
    {
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: { es: { "events-calendar": 7 } },
    },
    ...["{destination}", "[目的地]", "[旅行月份 年份]", "[本次偏好词]"].map((placeholder) => ({
      countryCode: "ES",
      destination: "Madrid",
      yearMonth: "2026-11",
      localLanguageTerms: {
        es: { "events-calendar": placeholder + " custom-secret-fragment" },
      },
    })),
  ];
  for (const unsafeContext of unsafeQueryContexts) {
    const rejected = run("build-source-query-matrix.js", ["--stdin"], JSON.stringify(unsafeContext));
    assertFailure(rejected);
    assert.doesNotMatch(rejected.stderr, /custom-secret-fragment|\{destination\}|\[目的地\]/);
  }

  const unknownTaste = run("recommend-taste-models.js", ["--stdin"], JSON.stringify({ interests: ["street-life"] }));
  assert.equal(unknownTaste.status, 0, unknownTaste.stderr);
  assert.equal(JSON.parse(unknownTaste.stdout).mode, "needs-clarification");
  assert.deepEqual(JSON.parse(unknownTaste.stdout).recommendations, []);

  for (const script of cliScripts) {
    for (const shapePath of invalidShapePaths) {
      assertFailure(run(script, ["--context", shapePath]));
    }
    for (const shape of ["null", "[]", '"not-an-object"']) {
      assertFailure(run(script, ["--stdin"], shape));
    }
  }

  for (const script of cliScripts) {
    const help = run(script, ["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.deepEqual(JSON.parse(help.stdout), {
      status: "usage",
      usage: `Usage: ${script} (--context <file> | --stdin)`,
    });
    assert.equal(help.stderr, "");

    assertFailure(run(script, ["--context", missingPath]));
    assertFailure(run(script, ["--context", directoryPath]));
    assertFailure(run(script, ["--context", invalidJsonPath]));
    assertFailure(run(script, ["--stdin"], "not json super-secret-body"));
    assertFailure(run(script, []));
    assertFailure(run(script, ["--context", contextPath, "--stdin"]));
    assertFailure(run(script, ["--stdin", "--context", contextPath]));

    const helpWithStdin = runWithUnreadableStdin(script, ["--help", "--stdin"]);
    assert.equal(helpWithStdin.error, undefined, helpWithStdin.error?.message);
    assertFailure(helpWithStdin);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Discovery CLI contract passed");
