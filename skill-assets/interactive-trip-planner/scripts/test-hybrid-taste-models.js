#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const modelRoot = path.join(skillRoot, "assets", "taste-models");
const runtime = await import("./taste-model-runtime.js");
const registry = runtime.loadTasteRegistry({ skillRoot });

assert.equal(registry.schemaVersion, "0.1.0");
assert.equal(registry.selectionContract.maxRecommendations, 3);
assert.equal(registry.selectionContract.allowSkip, true);
assert.equal(registry.selectionContract.hybrid.maxModels, 2);
assert.deepEqual(registry.selectionContract.hybrid.primaryOwns, ["place-selection", "pace"]);
assert.deepEqual(registry.selectionContract.hybrid.secondaryContributionTypes, ["domain", "visual"]);
assert.equal(new Set(registry.models.map((model) => model.id)).size, registry.models.length);

const requiredModelFiles = [
  "model.json",
  "manifesto.md",
  "source-policy.json",
  "visual-profile.json",
  "visual-references.md",
];
const prohibitedModelKeys = new Set(["coverage", "confidence", "maturity"]);
const allowedRepresentativeSampleTypes = new Set(["owner-confirmed-representative-plan", "completed-trip-review"]);
const requiredOfficialModels = new Map([
  ["city-craft-rhythm", {
    representativeTripId: "tokyo-rail-neon-craft",
    requiredCategories: ["market", "museum", "shopping", "neighborhood", "art"],
    requiredRouteRoles: ["design-walk", "neighborhood", "books-design"],
  }],
  ["food-nightlife-locality", {
    representativeTripId: "barcelona-modernisme-night-atlas",
    requiredCategories: ["market", "food", "bar"],
    requiredRouteRoles: ["local-food", "market", "nightlife"],
  }],
]);
for (const modelId of requiredOfficialModels.keys()) {
  assert.ok(registry.models.some((entry) => entry.id === modelId), "0.1.0 missing official model " + modelId);
}

function walkObject(value, visit) {
  if (Array.isArray(value)) return value.forEach((item) => walkObject(item, visit));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walkObject(child, visit);
  }
}

for (const entry of registry.models) {
  const directory = path.join(modelRoot, entry.path);
  for (const file of requiredModelFiles) {
    assert.ok(fs.existsSync(path.join(directory, file)), entry.id + " missing " + file);
  }
  const executable = fs.readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => item.name)
    .filter((name) => /\.(?:js|mjs|cjs|ts|py|sh|bash|zsh|html)$/i.test(name));
  assert.deepEqual(executable, [], entry.id + " model directory must contain no executable or HTML files");

  const model = JSON.parse(fs.readFileSync(path.join(directory, "model.json"), "utf8"));
  assert.equal(model.id, entry.id);
  assert.equal(model.owner.confirmed, true);
  assert.ok(model.representativeTrips.length >= 1, entry.id + " needs a representative trip");
  assert.ok(model.corePrinciples.length >= 3);
  assert.ok(model.antiPreferences.length >= 2);
  walkObject(model, (key) => assert.ok(!prohibitedModelKeys.has(key), entry.id + " uses forbidden " + key));

  for (const trip of model.representativeTrips) {
    assert.ok(allowedRepresentativeSampleTypes.has(trip.sampleType));
    assert.equal(trip.authorization.ownerConfirmed, true);
    assert.equal(trip.authorization.publicReuse, true);
    assert.equal(trip.authorization.privacyReviewed, true);
    assert.match(trip.representativeReason, /\S/);
    const sampleRoot = path.resolve(directory, trip.path);
    for (const required of [
      "docs/sample-brief.md",
      "docs/design-language.md",
      "data/pois.json",
      "data/itinerary.json",
      "data/sources.json",
      "data/design-tokens.json",
    ]) {
      assert.ok(fs.existsSync(path.join(sampleRoot, required)), entry.id + " sample missing " + required);
    }
    const brief = fs.readFileSync(path.join(sampleRoot, "docs", "sample-brief.md"), "utf8");
    assert.match(brief, /\S/);
  }

  const visual = JSON.parse(fs.readFileSync(path.join(directory, "visual-profile.json"), "utf8"));
  assert.ok(visual.keywords.length >= 3 && visual.keywords.length <= 5);
  for (const field of ["informationDensity", "tone", "imageStrategy", "marker", "color", "material"]) {
    assert.ok(visual[field], entry.id + " visual profile missing " + field);
  }
  assert.equal(visual.moodboard, "visual-references.md");
  assert.doesNotMatch(JSON.stringify(visual), /<html|\.html\b/i);

  const officialExpectation = requiredOfficialModels.get(entry.id);
  if (officialExpectation) {
    assert.equal(entry.status, "official");
    assert.equal(entry.version, "0.1.0");
    assert.equal(model.sourceType, "official-playstyle");
    assert.equal(model.owner.type, "project-maintainers");
    assert.equal(model.license.content, "CC-BY-4.0");
    assert.equal(model.representativeTrips[0].id, officialExpectation.representativeTripId);
    assert.equal(model.representativeTrips[0].sampleType, "owner-confirmed-representative-plan");
    const sampleRoot = path.resolve(directory, model.representativeTrips[0].path);
    const brief = fs.readFileSync(path.join(sampleRoot, "docs", "sample-brief.md"), "utf8");
    assert.match(brief, /owner 确认的代表性规划/);
    assert.match(brief, /授权/);
    assert.match(brief, /脱敏/);
    assert.doesNotMatch(brief, /已完成回顾|亲历/);
    const poisDocument = JSON.parse(fs.readFileSync(path.join(sampleRoot, "data", "pois.json"), "utf8"));
    const pois = Array.isArray(poisDocument) ? poisDocument : poisDocument.pois;
    const categories = new Set(pois.map((poi) => poi.category));
    for (const category of officialExpectation.requiredCategories) {
      assert.ok(categories.has(category), entry.id + " representative sample missing actual category " + category);
    }
    const itinerary = JSON.parse(fs.readFileSync(path.join(sampleRoot, "data", "itinerary.json"), "utf8"));
    const routeRoles = new Set(itinerary.flatMap((day) => day.routeStops.map((stop) => stop.role)));
    for (const role of officialExpectation.requiredRouteRoles) {
      assert.ok(routeRoles.has(role), entry.id + " representative itinerary missing actual role " + role);
    }
  }
}

const cityRecommendation = runtime.recommendTasteModels({
  destination: "Paris",
  playStyles: ["architecture", "neighborhood-walk"],
  pace: "unhurried",
  companions: ["solo"],
  interests: ["craft", "art", "markets"],
}, { skillRoot });
assert.equal(cityRecommendation.mode, "recommended");
assert.ok(cityRecommendation.recommendations.length >= 1 && cityRecommendation.recommendations.length <= 3);
assert.equal(cityRecommendation.recommendations[0].id, "city-craft-rhythm");
assert.match(cityRecommendation.recommendations[0].why, /\S/);
assert.match(cityRecommendation.recommendations[0].tradeoff, /\S/);
assert.deepEqual(cityRecommendation.unknownTerms, {
  destinationContexts: [],
  playStyles: [],
  paces: [],
  companions: [],
  interests: [],
});
assert.deepEqual(cityRecommendation.inputVocabulary, {
  destinationContexts: ["dense-city", "historic-city", "design-city", "food-city", "nightlife-city", "market-city"],
  playStyles: ["architecture", "neighborhood-walk", "art", "markets", "food", "nightlife", "bar-hopping"],
  paces: ["unhurried", "balanced", "late-and-lively"],
  companions: ["solo", "couple", "friends"],
  interests: ["craft", "art", "architecture", "markets", "local-life", "local-food", "cocktails", "wine", "nightlife"],
});

const unknownTermRecommendation = runtime.recommendTasteModels({
  interests: ["street-life"],
}, { skillRoot });
assert.equal(unknownTermRecommendation.mode, "needs-clarification");
assert.deepEqual(unknownTermRecommendation.recommendations, []);
assert.match(unknownTermRecommendation.explanation, /known|clarif|确认|偏好/i);
assert.deepEqual(unknownTermRecommendation.unknownTerms, {
  destinationContexts: [],
  playStyles: [],
  paces: [],
  companions: [],
  interests: ["street-life"],
});
assert.deepEqual(
  runtime.recommendTasteModels({ destination: "Paris" }, { skillRoot }).recommendations,
  [],
);
assert.equal(
  runtime.recommendTasteModels({ destination: "Paris" }, { skillRoot }).mode,
  "needs-clarification",
);
assert.deepEqual(
  runtime.recommendTasteModels({
    destinationContexts: ["unknown-context"],
    playStyles: ["unknown-style"],
    pace: "unknown-pace",
    companions: ["unknown-companion"],
    interests: ["unknown-interest"],
  }, { skillRoot }).recommendations,
  [],
);

const nightlifeRecommendation = runtime.recommendTasteModels({
  destination: "Osaka",
  playStyles: ["food", "nightlife"],
  pace: "late-and-lively",
  companions: ["friends"],
  interests: ["local-food", "cocktails", "markets"],
}, { skillRoot });
assert.equal(nightlifeRecommendation.recommendations[0].id, "food-nightlife-locality");

const destinationRecommendation = runtime.recommendTasteModels({
  destination: "Bangkok",
  destinationContexts: ["food-city", "nightlife-city"],
}, { skillRoot });
assert.equal(destinationRecommendation.recommendations[0].id, "food-nightlife-locality");

assert.deepEqual(runtime.recommendTasteModels({ useTasteModel: false }, { skillRoot }), {
  mode: "none",
  recommendations: [],
  explanation: "不使用现成模板，直接按这次旅行的明确偏好规划。",
});

const hybrid = runtime.composeTasteSelection({
  primary: "city-craft-rhythm",
  secondary: "food-nightlife-locality",
  secondaryContribution: { type: "domain", value: "nightlife" },
}, { skillRoot });
assert.equal(hybrid.mode, "hybrid");
assert.equal(hybrid.primaryOwns.placeSelection, true);
assert.equal(hybrid.primaryOwns.pace, true);
assert.deepEqual(hybrid.secondaryContribution, { type: "domain", value: "nightlife" });
assert.throws(() => runtime.composeTasteSelection({
  primary: "city-craft-rhythm",
  secondary: "food-nightlife-locality",
  secondaryContribution: [
    { type: "domain", value: "nightlife" },
    { type: "visual", value: "paper texture" },
  ],
}, { skillRoot }), /exactly one|one contribution/i);

const validator = spawnSync(process.execPath, [path.join(scriptDir, "validate-taste-models.js")], { encoding: "utf8" });
assert.equal(validator.status, 0, validator.stdout + validator.stderr);
assert.match(validator.stdout, /2 taste models validated/);
console.log("Hybrid Taste Model contract passed");
