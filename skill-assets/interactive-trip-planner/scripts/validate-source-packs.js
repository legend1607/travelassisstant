#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "..");
const requiredIntents = [
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
const requiredRoles = ["official-fact", "local-context", "spatial-search"];
const requiredGlobalLocalTokens = new Set([
  "events-calendar",
  "local-dishes",
  "seasonal-produce",
  "municipal-market",
  "neighborhood-life",
  "live-music",
  "local-crafts",
  "rainy-day",
  "current-notices",
  "independent-neighborhood",
]);
const prohibitedKeys = new Set(["coverage", "confidence", "maturity"]);
const safeSourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const sensitivePatterns = [
  /\/Users\/[^/\s]+/i,
  /\b(?:AMAP_KEY|AMAP_SECURITY_KEY)\s*[:=]\s*\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
];

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

function assertNonEmptyString(value, label) {
  assert.ok(typeof value === "string" && value.trim(), label + " must be a non-empty string");
}

function assertSemanticVersion(value, label) {
  assertNonEmptyString(value, label);
  assert.match(value, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, label + " must be a semantic version");
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  assert.ok(Array.isArray(value) && (allowEmpty || value.length >= 1), label + " must be an array" + (allowEmpty ? "" : " with at least one item"));
  for (const item of value) assertNonEmptyString(item, label + " item");
}

function assertSafeHttpUrl(value, label) {
  assertNonEmptyString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    assert.fail(label + " must be a valid http/https URL");
  }
  assert.ok(["http:", "https:"].includes(parsed.protocol), label + " must use http or https");
  assert.ok(!parsed.username && !parsed.password, label + " must not contain username, password, or embedded credentials");
}

function resolveInside(root, requestedPath, label) {
  assertNonEmptyString(requestedPath, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requestedPath);
  assert.ok(resolved.startsWith(resolvedRoot + path.sep), label + " must stay inside " + resolvedRoot);
  return resolved;
}

function resolveVerifiedTarget(root, requestedPath, label, expectedType) {
  const resolved = resolveInside(root, requestedPath, label);
  const stats = fs.lstatSync(resolved);
  assert.ok(!stats.isSymbolicLink(), label + " must not be a symbolic link");
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(resolved);
  assert.ok(realTarget.startsWith(realRoot + path.sep), label + " realpath must stay inside " + realRoot);
  if (expectedType === "file") assert.ok(stats.isFile(), label + " must be a file");
  if (expectedType === "directory") assert.ok(stats.isDirectory(), label + " must be a directory");
  return realTarget;
}

function validateLocalLexicons(sourceRoot) {
  const lexiconRoot = resolveVerifiedTarget(
    sourceRoot,
    "local-language-lexicons",
    "local language lexicon root",
    "directory",
  );
  const entries = fs.readdirSync(lexiconRoot, { withFileTypes: true });
  const languageTags = new Set();
  const defaultCountries = new Set();
  for (const entry of entries) {
    assert.ok(!entry.isSymbolicLink(), "lexicon directory contains symbolic link " + entry.name);
    assert.ok(entry.isFile() && path.extname(entry.name) === ".json", "lexicon directory may contain only JSON files: " + entry.name);
    const filename = entry.name;
    const lexicon = JSON.parse(fs.readFileSync(path.join(lexiconRoot, filename), "utf8"));
    assert.equal(lexicon.schemaVersion, "0.1.0");
    assert.match(lexicon.languageTag, /^[a-z]{2}(?:-[A-Z]{2})?$/);
    assert.equal(path.basename(filename, ".json"), lexicon.languageTag, "lexicon filename must match languageTag");
    assert.ok(!languageTags.has(lexicon.languageTag), "lexicon languageTag values must be unique");
    languageTags.add(lexicon.languageTag);
    assertStringArray(lexicon.countryCodes, lexicon.languageTag + " countryCodes");
    assertStringArray(lexicon.defaultCountryCodes, lexicon.languageTag + " defaultCountryCodes", { allowEmpty: true });
    assert.equal(new Set(lexicon.countryCodes).size, lexicon.countryCodes.length, lexicon.languageTag + " countryCodes must be unique");
    assert.equal(new Set(lexicon.defaultCountryCodes).size, lexicon.defaultCountryCodes.length, lexicon.languageTag + " defaultCountryCodes must be unique");
    for (const countryCode of lexicon.countryCodes) assert.match(countryCode, /^[A-Z]{2}$/, lexicon.languageTag + " countryCodes must use two-letter uppercase codes");
    for (const countryCode of lexicon.defaultCountryCodes) {
      assert.ok(lexicon.countryCodes.includes(countryCode), lexicon.languageTag + " defaultCountryCodes must be a subset of countryCodes");
      assert.ok(!defaultCountries.has(countryCode), "each country may have only one default lexicon; defaults must be unique");
      defaultCountries.add(countryCode);
    }
    assert.deepEqual(new Set(Object.keys(lexicon.terms)), requiredGlobalLocalTokens);
    for (const [token, term] of Object.entries(lexicon.terms)) assertNonEmptyString(term, lexicon.languageTag + " term " + token);
    assert.doesNotMatch(JSON.stringify(lexicon), /https?:|<script|\/Users\//i);
  }
}

export function validateSourcePacks({ skillRoot = defaultSkillRoot } = {}) {
  const sourceRoot = path.join(skillRoot, "assets", "source-packs");
  const registry = JSON.parse(fs.readFileSync(path.join(sourceRoot, "index.json"), "utf8"));
  const validatedPacks = [];
  validateLocalLexicons(sourceRoot);
  assert.equal(registry.schemaVersion, "0.1.0");
  assert.deepEqual(new Set(registry.accessClasses), new Set(["A", "B", "C"]));
  assert.ok(Array.isArray(registry.packs) && registry.packs.length >= 1, "source registry needs at least one pack");
  assert.equal(new Set(registry.packs.map((entry) => entry.id)).size, registry.packs.length, "source pack ids must be unique");
  const editorialSubtypes = new Set(registry.editorialSubtypes);
  assert.deepEqual(editorialSubtypes, new Set([
    "city-life-culture",
    "food-drink",
    "events-listing",
    "local-news",
    "industry-specialist",
  ]));

  for (const entry of registry.packs) {
    assertNonEmptyString(entry.id, "registry source pack id");
    assertSemanticVersion(entry.version, entry.id + " registry version");
    assert.ok(Array.isArray(entry.countryCodes) && entry.countryCodes.length >= 1, entry.id + " needs countryCodes");
    assert.equal(new Set(entry.countryCodes).size, entry.countryCodes.length, entry.id + " countryCodes must be unique");
    for (const countryCode of entry.countryCodes) assert.match(countryCode, /^(?:\*|[A-Z]{2})$/, entry.id + " invalid countryCode " + countryCode);
    const packPath = resolveVerifiedTarget(sourceRoot, entry.path, entry.id + " pack registry path", "file");
    assert.equal(path.extname(packPath), ".json", entry.id + " pack must be JSON");
    const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
    validatedPacks.push({ ...entry, pack });
    assert.equal(pack.schemaVersion, "0.1.0", entry.id + " pack schemaVersion must be 0.1.0");
    assert.equal(pack.id, entry.id);
    assert.equal(pack.version, entry.version, entry.id + " registry/pack version mismatch");
    assertSemanticVersion(pack.version, entry.id + " pack version");
    assert.deepEqual(pack.languageStrategy.required, ["zh", "en", "destination-local"]);
    assert.ok(Array.isArray(pack.languageStrategy.localLanguageTags) && pack.languageStrategy.localLanguageTags.length >= 1);
    assert.deepEqual(pack.queryIntents.map((intent) => intent.id), requiredIntents);
    for (const intent of pack.queryIntents) {
      for (const language of ["zh", "en", "local"]) {
        assert.ok(Array.isArray(intent.terms[language]) && intent.terms[language].length >= 1, pack.id + "/" + intent.id + " missing " + language + " terms");
        assertNonEmptyString(intent.queryTemplates[language], pack.id + "/" + intent.id + " " + language + " query template");
      }
      assert.ok(Array.isArray(intent.sourceRoles) && intent.sourceRoles.length >= 1, pack.id + "/" + intent.id + " needs sourceRoles");
    }

    assert.ok(Array.isArray(pack.sources) && pack.sources.length >= 3, pack.id + " needs official, context and spatial paths");
    assert.equal(new Set(pack.sources.map((source) => source.id)).size, pack.sources.length, pack.id + " source ids must be unique");
    const roles = new Set(pack.sources.flatMap((source) => source.roles));
    for (const role of requiredRoles) assert.ok(roles.has(role), pack.id + " missing " + role);
    assert.ok(pack.sources.some((source) => source.kind === "local-editorial"), pack.id + " needs named editorial");
    for (const source of pack.sources) {
      assertNonEmptyString(source.id, pack.id + " source id");
      assert.match(source.id, safeSourceIdPattern, pack.id + " source id must use letters, numbers, dots, underscores, or hyphens");
      assertNonEmptyString(source.name, pack.id + "/" + source.id + " source name");
      assertSafeHttpUrl(source.url, pack.id + "/" + source.id + " source url");
      assert.ok(!/^(当地媒体|local media)$/i.test(source.name), pack.id + "/" + source.id + " must use a named source");
      assert.ok(registry.accessClasses.includes(source.access.class), pack.id + "/" + source.id + " invalid access class");
      assertNonEmptyString(source.access.searchMethod, pack.id + "/" + source.id + " searchMethod");
      assert.equal(typeof source.access.loginRequired, "boolean", pack.id + "/" + source.id + " loginRequired must be boolean");
      assert.ok(Object.prototype.hasOwnProperty.call(source.access, "toolDependency"), pack.id + "/" + source.id + " missing toolDependency");
      assertNonEmptyString(source.access.agentAccess, pack.id + "/" + source.id + " agentAccess");
      assert.ok(Array.isArray(source.access.fallback) && source.access.fallback.length >= 1, pack.id + "/" + source.id + " needs fallback");
      for (const fallback of source.access.fallback) assertNonEmptyString(fallback, pack.id + "/" + source.id + " fallback option");
      assert.ok(Array.isArray(source.factBoundary.canSupport) && source.factBoundary.canSupport.length >= 1, pack.id + "/" + source.id + " needs canSupport");
      assert.ok(Array.isArray(source.factBoundary.cannotProve) && source.factBoundary.cannotProve.length >= 1, pack.id + "/" + source.id + " needs cannotProve");
      assert.match(source.lastVerified, /^\d{4}-\d{2}-\d{2}$/, pack.id + "/" + source.id + " invalid lastVerified");
      assert.ok(Array.isArray(source.limitations) && source.limitations.length >= 1, pack.id + "/" + source.id + " needs limitations");
      if (source.kind === "local-editorial") {
        assert.ok(editorialSubtypes.has(source.subtype), pack.id + "/" + source.id + " invalid editorial subtype");
        assert.ok(Array.isArray(source.coverageRegions) && source.coverageRegions.length >= 1, pack.id + "/" + source.id + " needs coverageRegions");
        assert.ok(Array.isArray(source.beats) && source.beats.length >= 1, pack.id + "/" + source.id + " needs beats");
      }
      if (source.access.class !== "A") assert.notEqual(source.access.agentAccess, "default-automatic");
    }
    walk(pack, (key) => assert.ok(!prohibitedKeys.has(key), pack.id + " uses prohibited key " + key));
    const publicText = fs.readFileSync(packPath, "utf8");
    for (const pattern of sensitivePatterns) assert.doesNotMatch(publicText, pattern, pack.id + " privacy scan found " + pattern);
  }

  return { packCount: registry.packs.length, registry: { ...registry, packs: validatedPacks } };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = validateSourcePacks();
  console.log(result.packCount + " regional source packs validated");
}
