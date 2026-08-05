#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.resolve(
  scriptDir,
  "..",
  "assets",
  "guide-template-europe-public",
  "maps",
  "assets",
  "trip-map-public-state.js",
);

assert.ok(fs.existsSync(statePath), `missing state engine: ${statePath}`);

const context = { console };
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(statePath, "utf8"), context, { filename: statePath });
const {
  createState,
  planAction,
  commitAction,
  undoLastAction,
  buildReplanPrompt,
  hasPendingChanges,
} = context.TripMapState;

const trip = {
  slug: "sample-trip",
  title: "示例旅行",
  priorities: {
    must: "必去",
    preferred: "优先去",
    nearby: "顺路可去",
    archive: "留档",
    pending: "待复核",
    booked: "已预约",
  },
  pois: [
    { id: "hotel", name_zh: "左岸酒店", city: "巴黎", category: "hotel", priority: "must" },
    { id: "museum", name_zh: "示例美术馆", city: "巴黎", category: "art", priority: "nearby" },
    { id: "garden", name_zh: "示例花园", city: "巴黎", category: "sight", priority: "preferred" },
    { id: "booked-show", name_zh: "已预约演出", city: "巴黎", category: "show", priority: "booked", fixedTime: true },
    { id: "other-city", name_zh: "外地景点", city: "里昂", category: "sight", priority: "nearby" },
  ],
  days: [
    {
      id: "day-1",
      date: "2026-04-08",
      city: "巴黎",
      capacity: 4,
      routeStops: [
        { poiId: "hotel", order: 0 },
        { poiId: "garden", order: 1 },
        { poiId: "booked-show", order: 2 },
      ],
    },
    {
      id: "day-2",
      date: "2026-04-09",
      city: "里昂",
      capacity: 1,
      routeStops: [{ poiId: "other-city", order: 1 }],
    },
  ],
};

const state = createState(trip, {});
assert.equal(state.assignments.museum, "");
assert.equal(state.assignments.garden, "day-1");
assert.equal(hasPendingChanges(state), false);

assert.equal(
  planAction(trip, state, { type: "assign-day", poiId: "museum", dayId: "day-1" })
    .requiresConfirmation,
  false,
);

const movedMuseum = commitAction(trip, state, {
  type: "assign-day",
  poiId: "museum",
  dayId: "day-1",
});
assert.equal(movedMuseum.assignments.museum, "day-1");
assert.equal(movedMuseum.dirtyDays["day-1"], true);
assert.equal(hasPendingChanges(movedMuseum), true);

assert.equal(
  planAction(trip, movedMuseum, {
    type: "move-day",
    poiId: "museum",
    dayId: "day-2",
  }).requiresConfirmation,
  true,
);

const bookedPlan = planAction(trip, state, {
  type: "remove-day",
  poiId: "booked-show",
});
assert.equal(bookedPlan.requiresConfirmation, true);
assert.match(bookedPlan.reasons.join(" "), /已经预约|固定时间/);

const fullDayPlan = planAction(trip, state, {
  type: "assign-day",
  poiId: "museum",
  dayId: "day-2",
});
assert.equal(fullDayPlan.requiresConfirmation, true);
assert.match(fullDayPlan.reasons.join(" "), /已经安排 1 个主要地点/);

const changed = commitAction(trip, state, {
  type: "set-priority",
  poiId: "museum",
  priority: "must",
});
assert.equal(changed.priorities.museum, "must");
assert.ok(changed.undoSnapshot);
assert.deepEqual(
  JSON.parse(JSON.stringify(undoLastAction(changed).priorities)),
  JSON.parse(JSON.stringify(state.priorities)),
);
assert.match(buildReplanPrompt(trip, changed), /示例旅行/);
assert.match(buildReplanPrompt(trip, changed), /改成“必去”/);

const restored = createState(trip, {
  assignments: { museum: "missing-day", missing: "day-1" },
  priorities: { museum: "must", missing: "booked" },
  view: { activeDayId: "missing-day", selectedPoiId: "missing", map: { lat: 48.85, lng: 2.35, zoom: 14 } },
});
assert.equal(restored.assignments.museum, "");
assert.equal("missing" in restored.assignments, false);
assert.equal(restored.priorities.museum, "must");
assert.equal(restored.view.activeDayId, "");
assert.equal(restored.view.selectedPoiId, "");
assert.deepEqual(JSON.parse(JSON.stringify(restored.view.map)), { lat: 48.85, lng: 2.35, zoom: 14 });
assert.equal(createState(trip, { view: { map: { lat: "bad", lng: 2.35, zoom: 14 } } }).view.map, null);

console.log("core map state tests passed");
