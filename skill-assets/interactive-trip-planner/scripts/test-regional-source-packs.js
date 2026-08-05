#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(skillRoot, "assets", "source-packs");
const canonicalIntents = [
  "date-bound-events",
  "local-food-structure",
  "seasonal-produce",
  "markets-traditional-commerce",
  "community-third-places",
  "arts-music-nightlife",
  "craft-industry-migration",
  "family-low-energy-rain-accessibility",
  "current-disruptions-risks",
  "taste-specific-discovery",
];
const editorialSubtypes = new Set([
  "city-life-culture",
  "food-drink",
  "events-listing",
  "local-news",
  "industry-specialist",
]);
const requiredInitialPackIds = ["global-base", "china-mainland", "japan", "france-belgium"];

const runtime = await import("./source-pack-runtime.js");
const registry = runtime.loadSourceRegistry({ skillRoot });
assert.equal(registry.schemaVersion, "0.1.0");
assert.deepEqual(new Set(registry.accessClasses), new Set(["A", "B", "C"]));
for (const packId of requiredInitialPackIds) {
  const initialPack = registry.packs.find((entry) => entry.id === packId);
  assert.ok(initialPack, "0.1.0 missing initial source pack " + packId);
  assert.equal(initialPack.version, "0.1.0", packId + " initial regression version changed");
}

for (const entry of registry.packs) {
  const packPath = path.join(sourceRoot, entry.path);
  assert.ok(fs.existsSync(packPath), "missing " + entry.id);
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  assert.equal(pack.id, entry.id);
  assert.equal(pack.version, entry.version);
  assert.deepEqual(pack.languageStrategy.required, ["zh", "en", "destination-local"]);
  assert.ok(pack.languageStrategy.localLanguageTags.length >= 1);
  assert.deepEqual(pack.queryIntents.map((intent) => intent.id), canonicalIntents);

  for (const intent of pack.queryIntents) {
    assert.ok(intent.terms.zh.length >= 1, pack.id + "/" + intent.id + " missing Chinese terms");
    assert.ok(intent.terms.en.length >= 1, pack.id + "/" + intent.id + " missing English terms");
    assert.ok(intent.terms.local.length >= 1, pack.id + "/" + intent.id + " missing local terms");
    assert.match(intent.queryTemplates.zh, /\S/);
    assert.match(intent.queryTemplates.en, /\S/);
    assert.match(intent.queryTemplates.local, /\S/);
    assert.ok(intent.sourceRoles.length >= 1);
  }

  assert.ok(pack.sources.length >= 3, pack.id + " needs official, context and spatial paths");
  const roles = new Set(pack.sources.flatMap((source) => source.roles));
  for (const requiredRole of ["official-fact", "local-context", "spatial-search"]) {
    assert.ok(roles.has(requiredRole), pack.id + " missing " + requiredRole);
  }
  assert.ok(pack.sources.some((source) => source.kind === "local-editorial"), pack.id + " needs named editorial");

  for (const source of pack.sources) {
    assert.match(source.name, /\S/);
    assert.ok(!/^(当地媒体|local media)$/i.test(source.name));
    assert.ok(["A", "B", "C"].includes(source.access.class));
    assert.match(source.access.searchMethod, /\S/);
    assert.equal(typeof source.access.loginRequired, "boolean");
    assert.ok("toolDependency" in source.access);
    assert.match(source.access.agentAccess, /\S/);
    assert.ok(source.access.fallback.length >= 1);
    assert.match(source.factBoundary.canSupport.join(" "), /\S/);
    assert.match(source.factBoundary.cannotProve.join(" "), /\S/);
    assert.match(source.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.limitations.length >= 1);
    if (source.kind === "local-editorial") {
      assert.ok(editorialSubtypes.has(source.subtype), source.id + " has invalid editorial subtype");
      assert.ok(source.coverageRegions.length >= 1);
      assert.ok(source.beats.length >= 1);
    }
    if (source.access.class !== "A") assert.notEqual(source.access.agentAccess, "default-automatic");
  }
}

assert.deepEqual(runtime.selectSourcePacks({ countryCode: "JP" }, { skillRoot }), ["global-base", "japan"]);
assert.deepEqual(runtime.selectSourcePacks({ countryCode: "CN" }, { skillRoot }), ["global-base", "china-mainland"]);
assert.deepEqual(runtime.selectSourcePacks({ countryCode: "FR" }, { skillRoot }), ["global-base", "france-belgium"]);
assert.deepEqual(runtime.selectSourcePacks({ countryCode: "BE" }, { skillRoot }), ["global-base", "france-belgium"]);
assert.deepEqual(runtime.selectSourcePacks({ countryCode: "BR" }, { skillRoot }), ["global-base"]);

const queryMatrix = runtime.buildQueryMatrix({
  countryCode: "JP",
  destination: "京都",
  yearMonth: "2026-10",
  tasteTerms: ["手仕事", "静かな街区"],
}, { skillRoot });
assert.deepEqual(queryMatrix.packIds, ["global-base", "japan"]);
assert.equal(queryMatrix.intents.length, 10);
assert.deepEqual(queryMatrix.intents.map((intent) => intent.id), canonicalIntents);
for (const intent of queryMatrix.intents) {
  assert.match(intent.queries.zh, /京都/);
  assert.match(intent.queries.en, /京都/);
  assert.deepEqual(intent.queries.local.map((item) => item.languageTag), ["ja"]);
  assert.match(intent.queries.local[0].query, /京都/);
}
assert.equal(queryMatrix.searchFunnel.length, 8);
assert.match(queryMatrix.searchFunnel[0], /事实骨架/);
assert.match(queryMatrix.searchFunnel[3], /访问性/);
assert.match(queryMatrix.searchFunnel[5], /真实移动/);
assert.match(queryMatrix.searchFunnel[7], /停止/);

const spain = runtime.buildQueryMatrix({
  countryCode: "ES",
  destination: "Barcelona",
  yearMonth: "octubre 2026",
  localLanguageTags: ["ca"],
  tasteTerms: ["vida de barrio", "mercado municipal"],
}, { skillRoot });
assert.deepEqual(spain.packIds, ["global-base"]);
assert.equal(spain.status, "ready");
assert.deepEqual(spain.intents[0].queries.local, [
  { languageTag: "es", query: "Barcelona octubre 2026 agenda cultural official" },
  { languageTag: "ca", query: "Barcelona octubre 2026 agenda cultural official" },
]);
assert.deepEqual(spain.intents[1].queries.local, [
  { languageTag: "es", query: "Barcelona platos locales mercado municipal" },
  { languageTag: "ca", query: "Barcelona plats locals mercat municipal" },
]);
for (const intent of spain.intents) {
  assert.deepEqual(intent.queries.local.map((item) => item.languageTag), ["es", "ca"]);
  assert.doesNotMatch(JSON.stringify(intent.queries.local), /当地语言|\{local:/);
}

const spainDefault = runtime.buildQueryMatrix({
  countryCode: "ES",
  destination: "Madrid",
  yearMonth: "2026-11",
}, { skillRoot });
assert.equal(spainDefault.status, "ready");
for (const intent of spainDefault.intents) {
  assert.deepEqual(intent.queries.local.map((item) => item.languageTag), ["es"]);
  for (const query of [intent.queries.zh, intent.queries.en, ...intent.queries.local.map((item) => item.query)]) {
    assert.doesNotMatch(query, /\{[^}]+\}|\[目的地\]|\[旅行月份 年份\]|\[本次偏好词\]/);
  }
}
assert.throws(() => runtime.buildQueryMatrix({
  countryCode: "ES",
  destination: "Madrid",
  yearMonth: "2026-11",
  tasteTerms: ["   "],
}, { skillRoot }), /tasteTerms.*non-empty strings/i);

const unsupported = runtime.buildQueryMatrix({
  countryCode: "BR",
  destination: "Recife",
  yearMonth: "2026-11",
  localLanguageTags: ["es"],
}, { skillRoot });
assert.equal(unsupported.status, "needs-local-language-terms");
assert.ok(unsupported.missingLocalTerms.length > 0);
assert.deepEqual(unsupported.intents[0].queries.local, []);

const brazilCallerTerms = runtime.buildQueryMatrix({
  countryCode: "BR",
  destination: "Recife",
  yearMonth: "2026-11",
  localLanguageTags: ["es"],
  localLanguageTerms: {
    es: {
      "events-calendar": "  agenda    brasileira en espanol  ",
      "local-dishes": "comida brasilena",
      "seasonal-produce": "productos brasilenos de temporada",
      "municipal-market": "mercado municipal brasileno",
      "neighborhood-life": "vida de barrio brasilena",
      "live-music": "musica brasilena en vivo",
      "local-crafts": "artesania brasilena",
      "rainy-day": "planes de lluvia en Brasil",
      "current-notices": "avisos actuales de Brasil",
      "independent-neighborhood": "comercio independiente brasileno",
    },
  },
}, { skillRoot });
assert.equal(brazilCallerTerms.status, "ready");
assert.equal(
  brazilCallerTerms.intents[0].queries.local[0].query,
  "Recife 2026-11 agenda brasileira en espanol official",
);
const nullPrototypeTerms = Object.create(null);
nullPrototypeTerms.es = { "events-calendar": "agenda" };
assert.throws(() => runtime.buildQueryMatrix({
  countryCode: "BR",
  destination: "Recife",
  yearMonth: "2026-11",
  localLanguageTerms: nullPrototypeTerms,
}, { skillRoot }), /localLanguageTerms.*plain object/i);

const validator = spawnSync(process.execPath, [path.join(scriptDir, "validate-source-packs.js")], { encoding: "utf8" });
assert.equal(validator.status, 0, validator.stdout + validator.stderr);
assert.match(validator.stdout, /4 regional source packs validated/);
console.log("Regional Source Pack contract passed");
