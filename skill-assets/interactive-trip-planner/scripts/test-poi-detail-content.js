#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-data.js");
const publicMapPath = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public", "maps", "itinerary-map.html");

function basePoi(id) {
  return {
    id,
    name: `Place ${id}`,
    name_zh: `地点 ${id}`,
    city: "Test City",
    area: "Test Area",
    category: "sight",
    priority: "preferred",
    coords: [41.38, 2.16],
    note: "Concise fallback",
    plan: "Same-area plan",
    tip: "Recheck facts",
    source: "official-source",
  };
}

function runTripValidation({ pois, itinerary = [], sources, extraArgs = [] }) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "poi-detail-content-"));
  const poisPath = path.join(fixtureDir, "pois.json");
  const itineraryPath = path.join(fixtureDir, "itinerary.json");
  fs.writeFileSync(poisPath, JSON.stringify(pois));
  fs.writeFileSync(itineraryPath, JSON.stringify(itinerary));
  const args = [validator, "--pois", poisPath, "--itinerary", itineraryPath];
  if (sources !== undefined) {
    const sourcesPath = path.join(fixtureDir, "sources.json");
    fs.writeFileSync(sourcesPath, JSON.stringify(sources));
    args.push("--sources", sourcesPath);
  }
  args.push(...extraArgs);
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
  });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

function runValidation(pois) {
  return runTripValidation({ pois });
}

function runRawValidation(args) {
  const result = spawnSync(process.execPath, [validator, ...args], { encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

const validDeep = {
  ...basePoi("deep"),
  contentTier: "deep",
  whyWorthIt: "Distinct enough to earn time in the route.",
  detailSections: [
    { title: "What to do", items: ["Observe the main hall", "Buy one local snack"] },
    { title: "The story", body: "A verified piece of place-specific history." },
  ],
};
const validStandard = {
  ...basePoi("standard"),
  contentTier: "standard",
  whyWorthIt: "A useful supporting stop.",
  detailSections: [{ title: "What to order", items: ["The local specialty"] }],
};
const validCompact = { ...basePoi("compact"), contentTier: "compact" };
const validLegacy = basePoi("legacy");
const validMarketDeep = {
  ...basePoi("market-deep"),
  category: "market",
  contentTier: "deep",
  whyWorthIt: "A market stop that explains a distinctive local pantry through resident use.",
  detailSections: [
    { title: "What to look for", items: ["Look for salted cod used in family stews.", "Ask which late-autumn mushrooms are in today instead of assuming stock."] },
    { title: "Local pantry", body: "The stall mix connects preserved fish and seasonal mushrooms to everyday resident cooking." },
  ],
};
const marketDeepFixtureCopy = JSON.stringify(validMarketDeep);
assert.match(marketDeepFixtureCopy, /salted cod used in family stews/i, "market fixture needs a distinctive dish or resident-use signal");
assert.match(marketDeepFixtureCopy, /(?:look|ask)[^\\"]*(?:autumn|today)/i, "market fixture needs seasonal look or ask wording");

assert.equal(
  runValidation([validLegacy, validDeep, validStandard, validCompact, validMarketDeep]).status,
  0,
  "legacy and valid tiered POIs should pass",
);

for (const [label, poi, expected] of [
  ["unknown tier", { ...basePoi("bad-tier"), contentTier: "verbose" }, /invalid contentTier/],
  ["deep why", { ...validDeep, id: "deep-no-why", name: "Deep no why", name_zh: "缺理由", whyWorthIt: " " }, /deep content requires whyWorthIt/],
  ["deep sections", { ...validDeep, id: "deep-one-section", name: "Deep one", name_zh: "一段", detailSections: validDeep.detailSections.slice(0, 1) }, /deep content requires 2-4 detailSections/],
  ["standard sections", { ...validStandard, id: "standard-three", name: "Standard three", name_zh: "三段", detailSections: [...validDeep.detailSections, { title: "Extra", body: "Too much" }] }, /standard content allows at most 2 detailSections/],
  ["compact sections", { ...validCompact, id: "compact-sections", name: "Compact sections", name_zh: "简洁多段", detailSections: [{ title: "Should not exist", body: "Too much" }] }, /compact content must omit detailSections/],
  ["blank title", { ...validDeep, id: "blank-title", name: "Blank title", name_zh: "空标题", detailSections: [{ title: " ", body: "Content" }, validDeep.detailSections[1]] }, /detailSections\[0\] missing title/],
  ["empty content", { ...validDeep, id: "empty-content", name: "Empty content", name_zh: "空内容", detailSections: [{ title: "Empty", body: " ", items: [] }, validDeep.detailSections[1]] }, /detailSections\[0\] needs body or 1-5 items/],
  ["too many items", { ...validDeep, id: "many-items", name: "Many items", name_zh: "太多条目", detailSections: [{ title: "Too many", items: ["1", "2", "3", "4", "5", "6"] }, validDeep.detailSections[1]] }, /detailSections\[0\] needs body or 1-5 items/],
]) {
  const result = runValidation([poi]);
  assert.notEqual(result.status, 0, `${label} should fail`);
  assert.match(result.output, expected, `${label} should explain the contract failure`);
}

function formalPoi(id, category, whyWorthIt, title, items, sourceId) {
  return {
    ...basePoi(id),
    category,
    contentTier: "standard",
    whyWorthIt,
    detailSections: [{ title, items }],
    sourceIds: [sourceId],
  };
}

function source(id, overrides = {}) {
  return {
    id,
    title: `Evidence for ${id}`,
    url: `https://example.com/${id}`,
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
    status: "confirmed",
    supports: ["identity", "visit"],
    ...overrides,
  };
}

const formalPois = [
  formalPoi(
    "food-stop",
    "food",
    "This counter belongs in the route for its city-specific chickpea stew and quick lunch rhythm.",
    "What to order",
    ["Order the chickpea stew before the lunch batch sells out.", "Compare the broth and local garnish before adding condiments."],
    "food-source",
  ),
  formalPoi(
    "market-stop",
    "market",
    "This resident market makes the local autumn pantry legible through preserved fish and seasonal produce.",
    "How to read the stalls",
    ["Look for preserved fish used in weekday home cooking.", "Ask which October mushrooms residents are buying today."],
    "market-source",
  ),
  formalPoi(
    "coffee-stop",
    "coffee",
    "This roastery is useful for tasting how the city treats a lighter seasonal espresso rather than generic café culture.",
    "At the bar",
    ["Ask which roast is currently dialled in for espresso.", "Taste it before adding milk, then note the service rhythm."],
    "coffee-source",
  ),
  formalPoi(
    "museum-stop",
    "museum",
    "This collection earns a focused stop because one room connects the city patronage story to its best-known altarpiece.",
    "Focused visit",
    ["Start in the patronage gallery instead of walking every room.", "Spend ten minutes with the signed altarpiece and its side panels."],
    "museum-source",
  ),
  formalPoi(
    "wine-stop",
    "bar",
    "This neighbourhood wine bar shows the region through changing by-the-glass pours rather than a generic international list.",
    "How to drink here",
    ["Ask for one local white and one skin-contact comparison.", "Check the producer and village before choosing the second glass."],
    "wine-source",
  ),
  formalPoi(
    "neighborhood-stop",
    "neighborhood",
    "This short street sequence reveals the district's workshop-to-residential transition without turning it into an aimless walk.",
    "Walking sequence",
    ["Enter from the workshop end while shutters are still open.", "Finish at the residential square when evening use begins."],
    "neighborhood-source",
  ),
];
const formalSources = formalPois.map((poi) => source(poi.sourceIds[0]));
const canonicalFormalItinerary = [{
  id: "day-route",
  date: "2026-10-13",
  routeStops: formalPois.map((poi, index) => ({ poiId: poi.id, order: index + 1 })),
}];
const strictEvidenceArgs = ["--require-route-evidence"];

const validFormalRoute = runTripValidation({
  pois: formalPois,
  itinerary: canonicalFormalItinerary,
  sources: formalSources,
  extraArgs: strictEvidenceArgs,
});
assert.equal(validFormalRoute.status, 0, validFormalRoute.output);

const synonymFillerRoute = runTripValidation({
  pois: formalPois.map((poi, index) => index ? poi : {
    ...poi,
    whyWorthIt: "这里很有特色，适合游客慢慢体验，感受当地氛围和独特城市生活节奏，值得专门来看看和逛逛。",
    detailSections: [{ title: "到这里做什么", items: ["看看", "逛逛"] }],
  }),
  itinerary: canonicalFormalItinerary,
  sources: formalSources,
  extraArgs: strictEvidenceArgs,
});
assert.notEqual(synonymFillerRoute.status, 0, "synonym-only value copy and trivial actions must fail strict validation");
assert.match(synonymFillerRoute.output, /food-stop[\s\S]*whyWorthIt[\s\S]*at least 16 substantive/i);
assert.match(synonymFillerRoute.output, /food-stop[\s\S]*at least 2[\s\S]*meaningful actionable items[\s\S]*8 substantive/i);

const missingSourcesArgument = runTripValidation({
  pois: formalPois,
  itinerary: canonicalFormalItinerary,
  extraArgs: strictEvidenceArgs,
});
assert.notEqual(missingSourcesArgument.status, 0, "strict evidence validation must require --sources");
assert.match(missingSourcesArgument.output, /--sources[\s\S]*required/i);

const nonArraySources = runTripValidation({
  pois: formalPois,
  itinerary: canonicalFormalItinerary,
  sources: { sources: formalSources },
  extraArgs: strictEvidenceArgs,
});
assert.notEqual(nonArraySources.status, 0, "strict evidence validation must reject a non-array source registry");
assert.match(nonArraySources.output, /sources must be an array/i);

for (const [label, mutatePois, mutateSources, expected] of [
  ["missing sourceIds", (pois) => pois.map((poi, index) => index ? poi : { ...poi, sourceIds: [] }), null, /day-route[\s\S]*food-stop[\s\S]*sourceIds/i],
  ["empty sourceIds", (pois) => pois.map((poi, index) => index ? poi : { ...poi, sourceIds: [" "] }), null, /day-route[\s\S]*food-stop[\s\S]*sourceIds/i],
  ["unknown source id", (pois) => pois.map((poi, index) => index ? poi : { ...poi, sourceIds: ["missing-source"] }), null, /day-route[\s\S]*food-stop[\s\S]*unknown source id[\s\S]*missing-source/i],
  ["compact scheduled POI", (pois) => pois.map((poi, index) => index ? poi : { ...poi, contentTier: "compact", detailSections: undefined }), null, /day-route[\s\S]*food-stop[\s\S]*contentTier[\s\S]*standard[\s\S]*deep/i],
  ["vague whyWorthIt", (pois) => pois.map((poi, index) => index ? poi : { ...poi, whyWorthIt: "值得一去" }), null, /day-route[\s\S]*food-stop[\s\S]*whyWorthIt[\s\S]*40/i],
  ["padded placeholder whyWorthIt", (pois) => pois.map((poi, index) => index ? poi : { ...poi, whyWorthIt: "感受当地生活，随便逛逛，值得一去。".repeat(4) }), null, /day-route[\s\S]*food-stop[\s\S]*whyWorthIt[\s\S]*at least 16 substantive/i],
  ["empty whyWorthIt", (pois) => pois.map((poi, index) => index ? poi : { ...poi, whyWorthIt: " " }), null, /day-route[\s\S]*food-stop[\s\S]*whyWorthIt/i],
  ["zero detail sections", (pois) => pois.map((poi, index) => index ? poi : { ...poi, detailSections: [] }), null, /day-route[\s\S]*food-stop[\s\S]*detailSections/i],
  ["fewer than two actions", (pois) => pois.map((poi, index) => index ? poi : { ...poi, detailSections: [{ title: "What to order", items: ["Order the stew."] }] }), null, /day-route[\s\S]*food-stop[\s\S]*at least 2[\s\S]*meaningful actionable items[\s\S]*8 substantive/i],
  ["two short empty actions", (pois) => pois.map((poi, index) => index ? poi : { ...poi, detailSections: [{ title: "到这里做什么", items: ["看", "逛"] }] }), null, /day-route[\s\S]*food-stop[\s\S]*at least 2[\s\S]*meaningful actionable items[\s\S]*8 substantive/i],
  ["two long filler actions", (pois) => pois.map((poi, index) => index ? poi : { ...poi, detailSections: [{ title: "到这里做什么", items: ["慢慢看看，体验一下，感受这里的当地氛围。", "专门来逛逛，慢慢体验一下独特城市生活节奏。"] }] }), null, /day-route[\s\S]*food-stop[\s\S]*at least 2[\s\S]*meaningful actionable items[\s\S]*8 substantive/i],
  ["duplicate source ids", (pois) => pois, (sources) => [...sources, { ...sources[0] }], /Duplicate source id:[\s\S]*food-source/i],
  ["empty source id", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, id: "" }), /Source <source 0>[\s\S]*non-empty id/i],
  ["unsafe source URL", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, url: "javascript:alert(1)" }), /Source food-source[\s\S]*HTTP\(S\) URL/i],
  ["credential-bearing source URL", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, url: "https://reader:secret@example.com/place" }), /Source food-source[\s\S]*HTTP\(S\) URL/i],
  ["missing source title", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, title: "" }), /Source food-source[\s\S]*missing title/i],
  ["missing source role", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, role: "" }), /Source food-source[\s\S]*missing role/i],
  ["empty source supports", (pois) => pois, (sources) => sources.map((item, index) => index ? item : { ...item, supports: [] }), /Source food-source[\s\S]*non-empty supports/i],
]) {
  const pois = mutatePois(formalPois);
  const sources = mutateSources ? mutateSources(formalSources) : formalSources;
  const result = runTripValidation({
    pois,
    itinerary: canonicalFormalItinerary,
    sources,
    extraArgs: strictEvidenceArgs,
  });
  assert.notEqual(result.status, 0, `${label} should fail strict formal-route validation`);
  assert.match(result.output, expected, `${label} should identify the actionable contract failure`);
}

const strictRoutePois = [
  { ...basePoi("hotel-base"), category: "hotel" },
  basePoi("route-one"),
  basePoi("route-two"),
  basePoi("route-three"),
];

function strictRouteItinerary(routeStops) {
  const stopIds = routeStops.map((stop) => typeof stop === "string" ? stop : stop?.poiId).filter(Boolean);
  return [{
    id: "strict-day",
    routeStops,
    transitSegments: stopIds.slice(1).map((toPoiId, index) => ({
      fromPoiId: stopIds[index],
      toPoiId,
      mode: "walk",
      label: "verified fixture segment",
    })),
  }];
}

for (const [label, routeStops, expected] of [
  ["missing order", [{ poiId: "route-one" }], /strict-day[\s\S]*route-one[\s\S]*finite integer order/i],
  ["string order", [{ poiId: "route-one", order: "1" }], /strict-day[\s\S]*route-one[\s\S]*finite integer order/i],
  ["fractional order", [{ poiId: "route-one", order: 1.5 }], /strict-day[\s\S]*route-one[\s\S]*finite integer order/i],
  ["negative order", [{ poiId: "route-one", order: -1 }], /strict-day[\s\S]*route-one[\s\S]*negative order/i],
  ["duplicate order", [{ poiId: "route-one", order: 1 }, { poiId: "route-two", order: 1 }], /strict-day[\s\S]*duplicate route stop order[\s\S]*1/i],
  ["gapped order", [{ poiId: "route-one", order: 1 }, { poiId: "route-two", order: 3 }], /strict-day[\s\S]*contiguous[\s\S]*1\.\.2/i],
  ["legacy string stop", ["route-one"], /strict-day[\s\S]*route stop 0[\s\S]*object/i],
  ["empty poiId", [{ poiId: " ", order: 1 }], /strict-day[\s\S]*route stop 0[\s\S]*non-empty poiId/i],
  ["non-lodging zero", [{ poiId: "route-one", order: 0 }], /strict-day[\s\S]*route-one[\s\S]*order 0[\s\S]*lodging/i],
]) {
  const result = runTripValidation({
    pois: strictRoutePois,
    itinerary: strictRouteItinerary(routeStops),
    extraArgs: ["--strict-routes"],
  });
  assert.notEqual(result.status, 0, `${label} must fail strict canonical route validation`);
  assert.match(result.output, expected, `${label} must explain the strict route-order boundary`);
}

const validStrictRoute = runTripValidation({
  pois: strictRoutePois,
  itinerary: strictRouteItinerary([
    { poiId: "hotel-base", order: 0 },
    { poiId: "route-one", order: 1 },
    { poiId: "route-two", order: 2 },
  ]),
  extraArgs: ["--strict-routes"],
});
assert.equal(validStrictRoute.status, 0, validStrictRoute.output);

const legacyStringWithoutStrict = runTripValidation({
  pois: strictRoutePois,
  itinerary: strictRouteItinerary(["route-one"]),
});
assert.equal(legacyStringWithoutStrict.status, 0, legacyStringWithoutStrict.output);

const malformedEvidenceRoute = runTripValidation({
  pois: formalPois,
  itinerary: strictRouteItinerary(["food-stop"]),
  sources: formalSources,
  extraArgs: ["--require-route-evidence", "--strict-routes"],
});
assert.notEqual(malformedEvidenceRoute.status, 0, "evidence collection must not certify a malformed strict route stop");
assert.match(malformedEvidenceRoute.output, /strict-day[\s\S]*route stop 0[\s\S]*object/i);

const publicNamedPoi = {
  name: "Named market",
  zh: "具名市场",
  city: "Public City",
  area: "Old Quarter",
  category: "market",
  coords: [41.39, 2.17],
  note: "Fallback",
  plan: "Morning",
  tip: "Check hours",
  source: "market-source",
  contentTier: "standard",
  whyWorthIt: "This named market reveals the city's breakfast pantry through one locally specific preserved ingredient.",
  detailSections: [{ title: "Market actions", items: ["Find the preserved ingredient stall.", "Ask how residents serve it at breakfast."] }],
  sourceIds: ["market-source"],
};
const publicIdPoi = {
  ...formalPois[3],
  id: "public-museum-id",
  name: "ID museum",
  name_zh: "ID 博物馆",
};
const publicAssignedByIdPoi = {
  ...formalPois[2],
  id: "public-coffee-id",
  name: "ID coffee bar",
  name_zh: "ID 咖啡吧",
};
const publicHotelBase = {
  name: "Public hotel base",
  zh: "公开住宿基底",
  city: "Public City",
  area: "Station",
  category: "hotel",
  coords: [41.4, 2.18],
  note: "Route base",
  plan: "Start here",
  tip: "Confirm check-in",
  source: "hotel-source",
};
const publicItinerary = {
  days: [{ id: "public-day", date: "2026-10-14", routeStops: [{ poiId: "public-museum-id", order: 1 }] }],
  defaultAssignments: [
    { name: "Public hotel base", dayId: "public-day", order: 0 },
    { name: "Named market", dayId: "public-day", order: 1 },
    { poiId: "public-coffee-id", dayId: "public-day", order: 2 },
  ],
};
const publicResult = runTripValidation({
  pois: [publicNamedPoi, publicIdPoi, publicAssignedByIdPoi, publicHotelBase],
  itinerary: publicItinerary,
  sources: [source("market-source"), source("museum-source"), source("coffee-source")],
  extraArgs: strictEvidenceArgs,
});
assert.equal(publicResult.status, 0, publicResult.output);

for (const [label, pois, assignment, expected] of [
  ["unknown assignment name", [publicNamedPoi, publicHotelBase], { name: "Missing market", dayId: "public-day", order: 1 }, /public-day[\s\S]*Missing market[\s\S]*unknown default-assignment name/i],
  ["ambiguous assignment name", [publicNamedPoi, { ...publicNamedPoi, city: "Other City" }, publicHotelBase], { name: "Named market", dayId: "public-day", order: 1 }, /public-day[\s\S]*Named market[\s\S]*ambiguous default-assignment name/i],
]) {
  const result = runTripValidation({
    pois,
    itinerary: { days: publicItinerary.days, defaultAssignments: [assignment] },
    sources: [source("market-source")],
    extraArgs: strictEvidenceArgs,
  });
  assert.notEqual(result.status, 0, `${label} should fail`);
  assert.match(result.output, expected, `${label} should explain how to repair the assignment`);
}

const publicPositiveCompact = runTripValidation({
  pois: [{ ...publicNamedPoi, contentTier: "compact", detailSections: undefined }],
  itinerary: { days: publicItinerary.days, defaultAssignments: [{ name: "Named market", dayId: "public-day", order: 1 }] },
  sources: [source("market-source")],
  extraArgs: strictEvidenceArgs,
});
assert.notEqual(publicPositiveCompact.status, 0, "positive public assignments must not pass strict evidence validation vacuously");
assert.match(publicPositiveCompact.output, /public-day[\s\S]*Named market[\s\S]*contentTier/i);

const sourcesOnlyDoesNotEnableStrictEvidence = runTripValidation({
  pois: [{ ...formalPois[0], contentTier: "compact", detailSections: undefined, sourceIds: [] }],
  itinerary: [{ id: "legacy-day", routeStops: [{ poiId: "food-stop", order: 1 }] }],
  sources: formalSources,
});
assert.equal(sourcesOnlyDoesNotEnableStrictEvidence.status, 0, sourcesOnlyDoesNotEnableStrictEvidence.output);

const legacyWithoutEvidenceFlag = runTripValidation({
  pois: [{ ...formalPois[0], contentTier: "compact", detailSections: undefined, sourceIds: [] }],
  itinerary: [{ id: "legacy-day", routeStops: [{ poiId: "food-stop", order: 1 }] }],
});
assert.equal(legacyWithoutEvidenceFlag.status, 0, legacyWithoutEvidenceFlag.output);

for (const [flag, args] of [
  ["--pois", ["--pois", "--itinerary"]],
  ["--itinerary", ["--itinerary"]],
  ["--sources", ["--pois", "unused-pois.json", "--itinerary", "unused-itinerary.json", "--sources", "--require-route-evidence"]],
  ["--day", ["--pois", "unused-pois.json", "--itinerary", "unused-itinerary.json", "--day", "--strict-routes"]],
]) {
  const result = runRawValidation(args);
  assert.notEqual(result.status, 0, `${flag} without a value should fail`);
  assert.match(result.output, new RegExp(`${flag} needs a value`), `${flag} should identify its missing value`);
  assert.match(result.output, /Usage:/, `${flag} value error should include actionable usage`);
}

const unknownFlag = runRawValidation(["--unknown-contract-flag"]);
assert.notEqual(unknownFlag.status, 0, "unknown flags must still fail");
assert.match(unknownFlag.output, /Unknown argument: --unknown-contract-flag/);

const publicMapHtml = fs.readFileSync(publicMapPath, "utf8");
const publicUrlRuntimeMatch = publicMapHtml.match(/\/\* PUBLIC_URL_RUNTIME_START \*\/([\s\S]*?)\/\* PUBLIC_URL_RUNTIME_END \*\//);
assert.ok(publicUrlRuntimeMatch, "public map must expose the shared public URL runtime contract");
const evidenceRuntimeMatch = publicMapHtml.match(/\/\* POI_EVIDENCE_RUNTIME_START \*\/([\s\S]*?)\/\* POI_EVIDENCE_RUNTIME_END \*\//);
assert.ok(evidenceRuntimeMatch, "public map must expose the shipped POI evidence renderer for executable contract tests");
const evidenceSandbox = { URL };
vm.runInNewContext(
  `${publicUrlRuntimeMatch[1]}\n${evidenceRuntimeMatch[1]}\nthis.renderPoiEvidence = renderPoiEvidence; this.renderPoiSourceEvidence = renderPoiSourceEvidence;`,
  evidenceSandbox,
);

assert.equal(evidenceSandbox.renderPoiEvidence({ evidenceSources: [] }), "", "missing evidence must render nothing");
assert.equal(evidenceSandbox.renderPoiEvidence({}), "", "legacy POIs without evidence must render nothing in the evidence renderer");

const renderedEvidence = evidenceSandbox.renderPoiEvidence({
  evidenceSources: [
    {
      title: "Sample <official> source",
      url: "https://example.com/place?next=<unsafe>",
      type: "editorial",
      role: "recommendation",
      language: "es",
      supports: ["identity", "visit"],
      checkedAt: "2026-08-02<script>",
      status: "confirmed",
    },
  ],
});
assert.match(renderedEvidence, /^\s*<details class="poi-evidence">/);
assert.match(renderedEvidence, /<span class="poi-evidence-count">1<\/span>/);
assert.match(renderedEvidence, /西语餐饮媒体 · 推荐品类/);
assert.match(renderedEvidence, /target="_blank" rel="noopener noreferrer"/);
assert.match(renderedEvidence, /href="https:\/\/example\.com\/place\?next=%3Cunsafe%3E"/);
assert.match(renderedEvidence, /Sample &lt;official&gt; source/);
assert.match(renderedEvidence, /2026-08-02&lt;script&gt; 复核/);
assert.doesNotMatch(renderedEvidence, /<script>|<official>/);

const unsafeEvidence = evidenceSandbox.renderPoiEvidence({
  evidenceSources: [{
    title: "Unsafe source",
    url: "javascript:alert(1)",
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
  }],
});
assert.equal(unsafeEvidence, "", "renderer must discard non-HTTP(S) evidence URLs even if malformed data reaches the browser");

const credentialEvidence = evidenceSandbox.renderPoiEvidence({
  evidenceSources: [{
    title: "Credential source",
    url: "https://reader:secret@example.com/place",
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
  }],
});
assert.equal(credentialEvidence, "", "renderer must discard credential-bearing evidence URLs");

const legacyFallback = evidenceSandbox.renderPoiSourceEvidence({ source: "Legacy <source> text" });
assert.match(legacyFallback, /<h2>资料线索<\/h2>/);
assert.match(legacyFallback, /Legacy &lt;source&gt; text/);
assert.doesNotMatch(legacyFallback, /<source>/);
const structuredEvidenceWins = evidenceSandbox.renderPoiSourceEvidence({
  source: "Legacy text must stay hidden",
  evidenceSources: [{
    title: "Current source",
    url: "https://example.com/current",
    type: "official",
    role: "fact",
    language: "en",
    checkedAt: "2026-08-02",
  }],
});
assert.match(structuredEvidenceWins, /Current source/);
assert.doesNotMatch(structuredEvidenceWins, /Legacy text must stay hidden/);
assert.equal(evidenceSandbox.renderPoiSourceEvidence({}), "");

console.log("POI detail content contract passed");
