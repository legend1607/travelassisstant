#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "..");
const requiredFiles = ["model.json", "manifesto.md", "source-policy.json", "visual-profile.json", "visual-references.md"];
const requiredSampleFiles = [
  "docs/sample-brief.md",
  "docs/design-language.md",
  "data/pois.json",
  "data/itinerary.json",
  "data/sources.json",
  "data/design-tokens.json",
];
const prohibitedKeys = new Set(["coverage", "confidence", "maturity"]);
const allowedModelSourceTypes = new Set(["official-playstyle", "curator-owned"]);
const allowedStatuses = new Set(["official", "community"]);
const allowedSampleTypes = new Set(["owner-confirmed-representative-plan", "completed-trip-review"]);
const executableExtension = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|rb|php|pl|sh|bash|zsh|fish|bat|cmd|ps1|html|htm)$/i;
const allowedModelExtension = /\.(?:json|md)$/i;
const sensitivePatterns = [
  /\/Users\/[^/\s]+/i,
  /\b(?:AMAP_KEY|AMAP_SECURITY_KEY)\s*[:=]\s*\S+/i,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /\b(?:order|booking|ticket)[-_ ]?(?:id|number)\s*[:=]\s*\S+/i,
];

function walk(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walk(item, visit));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

function listFilesRecursively(directory, base = directory) {
  const files = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isSymbolicLink()) assert.fail("model directory contains symbolic link " + path.relative(base, absolute));
    if (item.isDirectory()) files.push(...listFilesRecursively(absolute, base));
    if (item.isFile()) files.push({ absolute, relative: path.relative(base, absolute) });
  }
  return files;
}

function assertNonEmptyString(value, label) {
  assert.ok(typeof value === "string" && value.trim(), label + " must be a non-empty string");
}

function assertSemanticVersion(value, label) {
  assertNonEmptyString(value, label);
  assert.match(value, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, label + " must be a semantic version");
}

function resolveInside(root, requestedPath, label) {
  assertNonEmptyString(requestedPath, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requestedPath);
  assert.ok(resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep), label + " must stay inside " + resolvedRoot);
  return resolved;
}

function resolveVerifiedDirectory(root, requestedPath, label) {
  const resolved = resolveInside(root, requestedPath, label);
  const stats = fs.lstatSync(resolved);
  assert.ok(!stats.isSymbolicLink(), label + " must not be a symbolic link");
  assert.ok(stats.isDirectory(), label + " must be a directory");
  const realRoot = fs.realpathSync(root);
  const realDirectory = fs.realpathSync(resolved);
  assert.ok(
    realDirectory.startsWith(realRoot + path.sep),
    label + " realpath must stay inside " + realRoot,
  );
  return realDirectory;
}

function scanPrivacy(files, label) {
  const publicText = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const pattern of sensitivePatterns) assert.doesNotMatch(publicText, pattern, label + " privacy scan found " + pattern);
}

export function validateTasteModels({ skillRoot = defaultSkillRoot } = {}) {
  const modelRoot = path.join(skillRoot, "assets", "taste-models");
  const registry = JSON.parse(fs.readFileSync(path.join(modelRoot, "index.json"), "utf8"));
  const validatedModels = [];
  assert.equal(registry.schemaVersion, "0.1.0");
  assert.ok(Array.isArray(registry.models) && registry.models.length >= 1, "taste registry needs at least one model");
  assert.equal(new Set(registry.models.map((entry) => entry.id)).size, registry.models.length, "taste model ids must be unique");

  for (const entry of registry.models) {
    assertNonEmptyString(entry.id, "registry model id");
    assertSemanticVersion(entry.version, entry.id + " registry version");
    assert.ok(allowedStatuses.has(entry.status), entry.id + " has unsupported status " + entry.status);
    const directory = resolveVerifiedDirectory(modelRoot, entry.path, entry.id + " model registry path");
    for (const file of requiredFiles) assert.ok(fs.existsSync(path.join(directory, file)), entry.id + " missing " + file);

    const modelFiles = listFilesRecursively(directory);
    for (const file of modelFiles) {
      assert.ok(!executableExtension.test(file.relative), entry.id + " contains executable " + file.relative);
      assert.ok(allowedModelExtension.test(file.relative), entry.id + " contains unsupported model file " + file.relative);
    }

    const model = JSON.parse(fs.readFileSync(path.join(directory, "model.json"), "utf8"));
    validatedModels.push({ ...entry, model });
    assert.equal(model.schemaVersion, "0.1.0", entry.id + " model schemaVersion must be 0.1.0");
    assert.equal(model.id, entry.id);
    assertNonEmptyString(model.name, entry.id + " name");
    assert.equal(model.status, entry.status, entry.id + " registry/model status mismatch");
    assert.equal(model.version, entry.version, entry.id + " registry/model version mismatch");
    assertSemanticVersion(model.version, entry.id + " model version");
    assert.ok(allowedModelSourceTypes.has(model.sourceType), entry.id + " has unsupported sourceType " + model.sourceType);
    assertNonEmptyString(model.owner?.name, entry.id + " owner.name");
    assertNonEmptyString(model.owner?.type, entry.id + " owner.type");
    assert.equal(model.owner?.confirmed, true, entry.id + " owner.confirmed must be true");
    if (model.sourceType === "official-playstyle") {
      assert.equal(model.owner.type, "project-maintainers", entry.id + " official owner.type must be project-maintainers");
      assert.equal(model.status, "official", entry.id + " official model status must be official");
    }
    if (model.sourceType === "curator-owned") {
      assert.equal(model.owner.type, "curator", entry.id + " curator owner.type must be curator");
      assertNonEmptyString(model.owner.identifier, entry.id + " curator owner.identifier");
      assert.notEqual(model.status, "official", entry.id + " curator-owned model cannot claim official status");
    }
    assertNonEmptyString(model.license?.content, entry.id + " license.content");
    assertNonEmptyString(model.license?.attribution, entry.id + " license.attribution");
    for (const field of ["destinationContexts", "playStyles", "paces", "companions", "interests"]) {
      const values = model.applicability?.[field];
      assert.ok(Array.isArray(values) && values.length >= 1, entry.id + " applicability." + field + " must be a non-empty array");
      for (const value of values) assertNonEmptyString(value, entry.id + " applicability." + field + " item");
    }
    assertNonEmptyString(model.recommendation?.why, entry.id + " recommendation.why");
    assertNonEmptyString(model.recommendation?.tradeoff, entry.id + " recommendation.tradeoff");
    assert.ok(Array.isArray(model.corePrinciples) && model.corePrinciples.length >= 3, entry.id + " needs at least three core principles");
    assert.ok(Array.isArray(model.antiPreferences) && model.antiPreferences.length >= 2, entry.id + " needs at least two anti-preferences");
    assert.ok(Array.isArray(model.representativeTrips) && model.representativeTrips.length >= 1, entry.id + " needs a representative trip");
    walk(model, (key) => assert.ok(!prohibitedKeys.has(key), entry.id + " uses prohibited key " + key));

    const representativeFiles = [];
    for (const trip of model.representativeTrips) {
      assertNonEmptyString(trip.id, entry.id + " representative trip id");
      assert.ok(allowedSampleTypes.has(trip.sampleType), entry.id + " has unsupported sampleType " + trip.sampleType);
      assertNonEmptyString(trip.representativeReason, entry.id + " representativeReason");
      assert.equal(trip.authorization?.ownerConfirmed, true, entry.id + " representative trip ownerConfirmed must be true");
      assert.equal(trip.authorization?.publicReuse, true, entry.id + " representative trip publicReuse must be true");
      assert.equal(trip.authorization?.privacyReviewed, true, entry.id + " representative trip privacyReviewed must be true");
      const resolvedSampleRoot = path.resolve(directory, trip.path);
      let sampleRoot;
      if (model.sourceType === "curator-owned") {
        const resolvedModelDirectory = path.resolve(directory);
        assert.ok(
          resolvedSampleRoot === resolvedModelDirectory || resolvedSampleRoot.startsWith(resolvedModelDirectory + path.sep),
          entry.id + " curator-owned representative path must stay inside model directory",
        );
        sampleRoot = resolvedSampleRoot;
      } else {
        const realSkillRoot = fs.realpathSync(skillRoot);
        assert.ok(
          resolvedSampleRoot.startsWith(realSkillRoot + path.sep),
          entry.id + " representative path must stay inside " + realSkillRoot,
        );
        sampleRoot = resolvedSampleRoot;
      }
      for (const required of requiredSampleFiles) {
        const file = path.join(sampleRoot, required);
        assert.ok(fs.existsSync(file), entry.id + " sample missing " + required);
        representativeFiles.push(file);
      }
    }

    const sourcePolicy = JSON.parse(fs.readFileSync(path.join(directory, "source-policy.json"), "utf8"));
    assert.equal(sourcePolicy.schemaVersion, "0.1.0", entry.id + " source-policy schemaVersion must be 0.1.0");
    assert.equal(sourcePolicy.modelId, entry.id, entry.id + " source-policy modelId must match model id");

    const visual = JSON.parse(fs.readFileSync(path.join(directory, "visual-profile.json"), "utf8"));
    assert.equal(visual.schemaVersion, "0.1.0", entry.id + " visual profile schemaVersion must be 0.1.0");
    assert.equal(visual.modelId, entry.id, entry.id + " visual profile modelId must match model id");
    assert.ok(Array.isArray(visual.keywords) && visual.keywords.length >= 3 && visual.keywords.length <= 5, entry.id + " needs 3-5 visual keywords");
    for (const field of ["informationDensity", "tone", "imageStrategy", "marker", "color", "material", "moodboard"]) {
      assertNonEmptyString(visual[field], entry.id + " visual profile " + field);
    }
    assert.doesNotMatch(JSON.stringify(visual), /<html|\.html\b/i, entry.id + " visual profile cannot reference a second HTML");

    for (const file of modelFiles.filter((item) => item.relative.endsWith(".json"))) {
      walk(JSON.parse(fs.readFileSync(file.absolute, "utf8")), (key) => {
        assert.ok(!prohibitedKeys.has(key), entry.id + "/" + file.relative + " uses prohibited key " + key);
      });
    }
    scanPrivacy([...modelFiles.map((file) => file.absolute), ...representativeFiles], entry.id);
  }

  return { modelCount: registry.models.length, registry: { ...registry, models: validatedModels } };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = validateTasteModels();
  console.log(result.modelCount + " taste models validated");
}
