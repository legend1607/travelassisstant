#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const europeHtml = fs.readFileSync(
  path.join(skillRoot, "assets", "guide-template-europe-public", "maps", "itinerary-map.html"),
  "utf8",
);
const lightRoot = path.join(skillRoot, "assets", "guide-template", "maps");
const lightHtml = fs.readFileSync(path.join(lightRoot, "itinerary-map.html"), "utf8");
const lightCore = fs.readFileSync(path.join(lightRoot, "assets", "trip-map-core.js"), "utf8");
const lightCss = fs.readFileSync(path.join(lightRoot, "assets", "trip-map-core.css"), "utf8");
const lightStateSource = fs.readFileSync(path.join(lightRoot, "assets", "trip-map-state.js"), "utf8");

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

function loadVelocity(source) {
  const fnSource = extractNamedFunction(source, "calculateEdgeAutoScrollVelocity");
  const context = {};
  vm.runInNewContext(`${fnSource}\nthis.velocity = calculateEdgeAutoScrollVelocity;`, context);
  return context.velocity;
}

function assertVelocityContract(source, label) {
  const velocity = loadVelocity(source);
  assert.equal(velocity(250, 100, 400), 0, `${label}: center must not scroll`);
  assert.equal(velocity(100, 100, 400), -14, `${label}: top edge must use max upward speed`);
  assert.equal(velocity(400, 100, 400), 14, `${label}: bottom edge must use max downward speed`);
  assert.equal(velocity(124, 100, 400), -7, `${label}: upper edge speed must be proportional`);
  assert.equal(velocity(376, 100, 400), 7, `${label}: lower edge speed must be proportional`);
}

assertVelocityContract(europeHtml, "Europe template");
assertVelocityContract(lightCore, "Light template");

for (const [source, token, label] of [
  [europeHtml, 'data-drag-poi="', "Europe drag handle"],
  [europeHtml, "poi-detail-day-drop-indicator", "Europe insertion indicator"],
  [europeHtml, "DETAIL_SORT_HOLD_MS = 160", "Europe long-press threshold"],
  [europeHtml, "DETAIL_SORT_EDGE_PX = 48", "Europe edge zone"],
  [europeHtml, "DETAIL_SORT_MAX_SCROLL_PX = 14", "Europe edge speed"],
  [europeHtml, "detailSortAutoScrollFrame", "Europe animation loop"],
  [europeHtml, 'event.key === "Escape"', "Europe Escape cancellation"],
  [europeHtml, "顺序或安排已调整，交通待复核", "Europe invalid transit copy"],
  [lightCore, 'data-drag-place="', "Light drag handle"],
  [lightCore, "place-drop-indicator", "Light insertion indicator"],
  [lightCore, "PLACE_SORT_HOLD_MS = 160", "Light long-press threshold"],
  [lightCore, "PLACE_SORT_EDGE_PX = 48", "Light edge zone"],
  [lightCore, "PLACE_SORT_MAX_SCROLL_PX = 14", "Light edge speed"],
  [lightCore, "placeSortAutoScrollFrame", "Light animation loop"],
  [lightCore, 'event.key === "Escape"', "Light Escape cancellation"],
  [lightCore, "顺序或安排已调整，交通待复核", "Light invalid transit copy"],
  [lightCss, ".place-drag-handle", "Light handle styling"],
]) {
  assert.ok(source.includes(token), `missing ${label}: ${token}`);
}

assert.match(
  europeHtml,
  /\.poi-detail-day-place-handle\s*\{[\s\S]*?(?:width|min-width):\s*44px;/,
  "Europe handle must expose a 44 px target",
);
assert.match(
  lightCss,
  /\.place-drag-handle\s*\{[\s\S]*?(?:width|min-width):\s*44px;/,
  "Light handle must expose a 44 px target",
);
assert.match(
  lightCss,
  /@media \(max-width: 820px\)[\s\S]*?\.place-list\s*\{[\s\S]*?overflow-y:\s*auto;/,
  "Light mobile route list must scroll vertically",
);
assert.doesNotMatch(lightHtml + lightCore, /★|收藏|stars/);

const stateContext = { console };
stateContext.globalThis = stateContext;
vm.runInNewContext(lightStateSource, stateContext, { filename: "trip-map-state.js" });
const trip = {
  title: "排序测试",
  priorities: { nearby: "顺路可去" },
  pois: [
    { id: "hotel", name_zh: "住宿", city: "成都", category: "hotel", priority: "nearby" },
    { id: "a", name_zh: "地点 A", city: "成都", category: "art", priority: "nearby" },
    { id: "b", name_zh: "地点 B", city: "成都", category: "coffee", priority: "nearby" },
    { id: "c", name_zh: "地点 C", city: "成都", category: "food", priority: "nearby" },
  ],
  days: [{
    id: "day-1",
    date: "2026-08-02",
    city: "成都",
    routeStops: [
      { poiId: "hotel", order: 0 },
      { poiId: "a", order: 1 },
      { poiId: "b", order: 2 },
      { poiId: "c", order: 3 },
    ],
  }],
};
const initial = stateContext.TripMapState.createState(trip, {});
const reordered = stateContext.TripMapState.commitAction(trip, initial, {
  type: "move-order",
  poiId: "c",
  toIndex: 1,
});
assert.equal(JSON.stringify(reordered.orders["day-1"]), JSON.stringify(["hotel", "c", "a", "b"]));
assert.equal(reordered.dirtyDays["day-1"], true);
assert.equal(reordered.changes.at(-1).type, "move-order");
assert.equal(
  JSON.stringify(stateContext.TripMapState.undoLastAction(reordered).orders["day-1"]),
  JSON.stringify(initial.orders["day-1"]),
);

console.log("Route reorder interaction contract passed");
