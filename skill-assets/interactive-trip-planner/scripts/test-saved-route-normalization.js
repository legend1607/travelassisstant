#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(
  scriptDir,
  "..",
  "assets",
  "guide-template-europe-public",
  "maps",
  "itinerary-map.html",
);
const html = fs.readFileSync(htmlPath, "utf8");

function extractNamedFunction(source, name) {
  const signatureIndex = source.indexOf(`function ${name}(`);
  assert.notEqual(signatureIndex, -1, `missing pure function ${name}`);
  const bodyStart = source.indexOf("{", signatureIndex);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(signatureIndex, index + 1);
  }
  throw new Error(`unterminated pure function ${name}`);
}

const pureFunctionNames = [
  "isPlainDataObject",
  "isLodgingBasePoi",
  "sanitizeSavedAssignments",
  "initializeItineraryPlan",
  "getEffectivePoiAssignment",
  "buildSavedOrderOverrides",
  "summarizeScheduledPlaces",
  "formatScheduledPlacesSummary",
  "formatCityEventNoticeSummary",
];
const sandbox = {};
vm.runInNewContext(
  `${pureFunctionNames.map((name) => extractNamedFunction(html, name)).join("\n")}\n`
    + `this.routeSummary = { ${pureFunctionNames.join(", ")} };`,
  sandbox,
);
const {
  sanitizeSavedAssignments,
  initializeItineraryPlan,
  getEffectivePoiAssignment,
  buildSavedOrderOverrides,
  summarizeScheduledPlaces,
  formatScheduledPlacesSummary,
  formatCityEventNoticeSummary,
} = sandbox.routeSummary;

const sanitizerDefaults = {
  hotel: { dayId: "d1017", order: 0 },
  museum: { dayId: "d1017", order: 1 },
  dinner: { dayId: "d1017", order: 2 },
};
const sanitizerMetadata = [
  { id: "hotel", category: "hotel" },
  { id: "museum", category: "art" },
  { id: "dinner", category: "food" },
];
const malformedSavedAssignments = {
  hotel: { dayId: "d1017", order: 0 },
  museum: { dayId: "d1017", order: 0 },
  dinner: { dayId: "d1017", order: 4 },
  missing: { dayId: "d1017" },
  text: { dayId: "d1017", order: "3" },
  fractional: { dayId: "d1017", order: 1.5 },
  infinite: { dayId: "d1017", order: Infinity },
  nonObject: "d1017:3",
  invalidDay: { dayId: "missing-day", order: 3 },
  unknownZero: { dayId: "d1017", order: 0 },
  futurePoi: { dayId: "d1017", order: 7 },
};
const malformedSavedBefore = structuredClone(malformedSavedAssignments);
const sanitizerDefaultsBefore = structuredClone(sanitizerDefaults);
const sanitizerMetadataBefore = structuredClone(sanitizerMetadata);
assert.deepEqual(
  JSON.parse(JSON.stringify(sanitizeSavedAssignments(
    malformedSavedAssignments,
    sanitizerDefaults,
    ["d1017"],
    sanitizerMetadata,
  ))),
  {
    hotel: { dayId: "d1017", order: 0 },
    dinner: { dayId: "d1017", order: 4 },
    futurePoi: { dayId: "d1017", order: 7 },
  },
  "saved assignments must keep only valid known assignments and forward-compatible positive unknown assignments",
);
assert.deepEqual(malformedSavedAssignments, malformedSavedBefore, "sanitizer must not mutate saved assignments");
assert.deepEqual(sanitizerDefaults, sanitizerDefaultsBefore, "sanitizer must not mutate default assignments");
assert.deepEqual(sanitizerMetadata, sanitizerMetadataBefore, "sanitizer must not mutate POI metadata");
assert.deepEqual(
  JSON.parse(JSON.stringify(sanitizeSavedAssignments("not-an-object", sanitizerDefaults, ["d1017"], sanitizerMetadata))),
  {},
  "a non-object saved assignment map must be discarded",
);

const persistedPlans = [];
const savedPlanInput = {
  assignments: malformedSavedAssignments,
  removed: { archived: true },
  dirtyDays: { d1018: true },
  changes: [{ type: "priority", label: "keep me" }],
  undoStack: [{ assignments: { older: { dayId: "d1017", order: 1 } } }],
};
const savedPlanBefore = structuredClone(savedPlanInput);
const initializedPlan = initializeItineraryPlan(
  () => savedPlanInput,
  (value) => persistedPlans.push(structuredClone(value)),
  sanitizerDefaults,
  ["d1017"],
  sanitizerMetadata,
  (assignments) => ({ ...assignments }),
);
assert.equal(persistedPlans.length, 1, "sanitation plus normalization must persist exactly once");
assert.deepEqual(savedPlanInput, savedPlanBefore, "initialization must not mutate loaded saved state");
assert.deepEqual(initializedPlan.removed, savedPlanBefore.removed, "removed flags must survive initialization");
assert.deepEqual(initializedPlan.dirtyDays, savedPlanBefore.dirtyDays, "dirty-day state must survive initialization");
assert.deepEqual(initializedPlan.changes, savedPlanBefore.changes, "change history must survive initialization");
assert.deepEqual(initializedPlan.undoStack, savedPlanBefore.undoStack, "undo history must survive initialization");
assert.deepEqual(
  JSON.parse(JSON.stringify(initializedPlan.assignments)),
  {
    hotel: { dayId: "d1017", order: 0 },
    dinner: { dayId: "d1017", order: 2 },
    futurePoi: { dayId: "d1017", order: 3 },
  },
  "the real initialization seam must sanitize before normalizing surviving assignments",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(getEffectivePoiAssignment("museum", initializedPlan, sanitizerDefaults))),
  { dayId: "d1017", order: 1 },
  "a malformed known saved assignment must be removed so resolution falls back to its valid default",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(getEffectivePoiAssignment("futurePoi", initializedPlan, sanitizerDefaults))),
  { dayId: "d1017", order: 3 },
  "a structurally valid future POI assignment must survive load and resolve for rendering",
);

const noWritePlans = [];
const cleanPlan = { assignments: { dinner: { dayId: "d1017", order: 1 } }, removed: {} };
initializeItineraryPlan(
  () => cleanPlan,
  (value) => noWritePlans.push(value),
  {},
  ["d1017"],
  sanitizerMetadata,
  (assignments) => ({ ...assignments }),
);
assert.equal(noWritePlans.length, 0, "clean saved assignments must not cause a redundant persistence write");
assert.match(
  html,
  /const itineraryPlan = initializeItineraryPlan\(\s*loadItineraryPlan,\s*saveItineraryPlan,/,
  "the shipped load path must call the tested initialization seam",
);

const defaults = {
  hotel: { dayId: "d1017", order: 1 },
  market: { dayId: "d1017", order: 2 },
  coffee: { dayId: "d1017", order: 3 },
  wine: { dayId: "d1017", order: 4 },
};
const removed = { market: true, coffee: true };
const removedBefore = JSON.stringify(removed);
assert.equal(
  JSON.stringify(buildSavedOrderOverrides(defaults, {}, removed, ["d1017"])),
  JSON.stringify({ wine: { dayId: "d1017", order: 2 } }),
  "removing middle stops must close saved numbering gaps",
);
assert.equal(JSON.stringify(removed), removedBefore, "removed flags must not be mutated");

assert.equal(
  JSON.stringify(buildSavedOrderOverrides(defaults, {}, {}, ["d1017"])),
  JSON.stringify({}),
  "a clean contiguous default plan must not create saved overrides",
);

const savedDayMove = {
  market: { dayId: "d1018", order: 8 },
};
assert.equal(
  JSON.stringify(buildSavedOrderOverrides(
    {
      hotel: { dayId: "d1017", order: 1 },
      market: { dayId: "d1017", order: 2 },
      museum: { dayId: "d1018", order: 1 },
    },
    savedDayMove,
    {},
    ["d1017", "d1018"],
  )),
  JSON.stringify({ market: { dayId: "d1018", order: 2 } }),
  "a saved day reassignment must be normalized inside its new day",
);
assert.equal(
  JSON.stringify(savedDayMove),
  JSON.stringify({ market: { dayId: "d1018", order: 8 } }),
  "saved assignments must not be mutated",
);

const lodgingDefaults = {
  lodging: { dayId: "d1017", order: 0 },
  museum: { dayId: "d1017", order: 2 },
  lunch: { dayId: "d1017", order: 3 },
};
const lodgingOverrides = buildSavedOrderOverrides(lodgingDefaults, {}, {}, ["d1017"]);
assert.equal(
  JSON.stringify(lodgingOverrides),
  JSON.stringify({
    museum: { dayId: "d1017", order: 1 },
    lunch: { dayId: "d1017", order: 2 },
  }),
);
assert.equal(Object.hasOwn(lodgingOverrides, "lodging"), false, "order 0 lodging must stay unnumbered");
assert.equal(lodgingDefaults.lodging.order, 0, "lodging assignment input must stay unchanged");

const malformedSavedOrders = {
  lodging: { dayId: "d1017" },
  missing: { dayId: "d1017" },
  text: { dayId: "d1017", order: "not-a-number" },
  infinite: { dayId: "d1017", order: Infinity },
};
const malformedBefore = {
  lodging: { ...malformedSavedOrders.lodging },
  missing: { ...malformedSavedOrders.missing },
  text: { ...malformedSavedOrders.text },
  infinite: { ...malformedSavedOrders.infinite },
};
const malformedOverrides = buildSavedOrderOverrides(
  {
    lodging: { dayId: "d1017", order: 0 },
    visit: { dayId: "d1017", order: 1 },
  },
  malformedSavedOrders,
  {},
  ["d1017"],
);
assert.equal(
  JSON.stringify(malformedOverrides),
  JSON.stringify({}),
  "missing, non-numeric, and infinite saved orders must not enter positive route normalization",
);
assert.equal(
  Object.hasOwn(malformedOverrides, "lodging"),
  false,
  "a saved lodging assignment without order must not promote default order 0 to a route stop",
);
assert.deepEqual(malformedSavedOrders, malformedBefore, "malformed saved assignments must not be mutated");

const dayPois = [
  { item: { category: "hotel" }, assignment: { dayId: "d1017", order: 0 } },
  { item: { category: "sight" }, assignment: { dayId: "d1017", order: 1 } },
  { item: { category: "food" }, assignment: { dayId: "d1017", order: 2 } },
];
assert.equal(
  JSON.stringify(summarizeScheduledPlaces(dayPois)),
  JSON.stringify({ total: 3, lodgingBases: 1, experiences: 2 }),
);
assert.equal(
  formatScheduledPlacesSummary(dayPois),
  "3 个路线站点：住宿基底 1，体验与吃喝 2",
);
assert.equal(formatCityEventNoticeSummary(2), "同期活动提示 2 条，不计入路线编号");
assert.equal(formatCityEventNoticeSummary(0), "", "zero visible notices must render no event sentence");
assert.doesNotMatch(
  formatScheduledPlacesSummary(dayPois),
  /活动/,
  "route counts and citywide event notices must remain separate",
);

for (const pattern of [
  /dayModeNote\.textContent\s*=\s*[^;]*formatScheduledPlacesSummary\(/,
  /mobileAppMeta\.textContent\s*=\s*[^;]*formatScheduledPlacesSummary\(/,
  /poiDetailDaySummary\.textContent\s*=\s*[^;]*formatScheduledPlacesSummary\(/,
]) {
  assert.match(html, pattern, `summary render path must use truthful route helper: ${pattern}`);
}
assert.ok(
  (html.match(/formatCityEventNoticeSummary\(/g) || []).length >= 4,
  "all three render paths plus the helper definition must keep visible event notices separate",
);

console.log("Saved route normalization contract passed");
