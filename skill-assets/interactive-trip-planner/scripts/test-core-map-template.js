#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const templateRoot = path.join(skillRoot, "assets", "guide-template", "maps");
const htmlPath = path.join(templateRoot, "itinerary-map.html");
const statePath = path.join(templateRoot, "assets", "trip-map-state.js");
const corePath = path.join(templateRoot, "assets", "trip-map-core.js");
const cssPath = path.join(templateRoot, "assets", "trip-map-core.css");

for (const filePath of [htmlPath, statePath, corePath, cssPath]) {
  assert.ok(fs.existsSync(filePath), `missing Core file: ${filePath}`);
  assert.ok(fs.statSync(filePath).size > 0, `empty Core file: ${filePath}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const core = fs.readFileSync(corePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const travelerFacingHtml = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
const requiredHtml = [
  'id="trip-overview"',
  'id="detail-browse"',
  'id="map"',
  'id="day-list"',
  'id="day-rail"',
  'id="day-place-list"',
  'id="poi-detail"',
  'id="change-summary"',
  'id="undo-change"',
  'id="request-replan"',
  'id="replan-dialog"',
  'id="impact-dialog"',
];

for (const token of requiredHtml) {
  assert.ok(html.includes(token), `missing template token: ${token}`);
}

assert.match(html, /trip-map-state\.js/);
assert.match(html, /trip-map-core\.js/);
assert.match(html, /trip-map-core\.css/);
assert.doesNotMatch(travelerFacingHtml, />\s*POI\s*</);
assert.doesNotMatch(travelerFacingHtml, /renderer|localStorage|themeProfile|JSON|schema|hash/);

for (const functionName of [
  "renderOverview",
  "selectDay",
  "openPoiDetail",
  "returnToOverview",
  "renderDayRail",
  "renderDayPlaceList",
  "renderPoiDetail",
  "renderMapLayers",
  "renderFilters",
  "renderChangeSummary",
]) {
  assert.match(core, new RegExp(`function ${functionName}\\b`), `missing ${functionName}`);
}

assert.match(core, /navigator\.clipboard\.writeText/);
assert.match(core, /需要重新安排/);
assert.match(css, /--trip-accent/);
assert.match(css, /@media \(max-width: 820px\)/);
assert.doesNotMatch(html + core, /姓周桥|德盛饭店|Hin Bus Depot/);

console.log("core map template contract passed");
