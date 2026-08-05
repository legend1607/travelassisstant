#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/validate-europe-derived-map.js <itinerary-map.html>");
  process.exit(2);
}

const htmlPath = path.resolve(input);
const mapDir = path.dirname(htmlPath);
const errors = [];
if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size === 0) errors.push(`missing or empty: ${htmlPath}`);
if (errors.length) finish();

const html = fs.readFileSync(htmlPath, "utf8");
const hasEmbeddedLeaflet = html.includes("REDSkill embedded Leaflet CSS")
  && html.includes("REDSkill embedded Leaflet JS");
if (!hasEmbeddedLeaflet) {
  for (const file of [
    path.join(mapDir, "vendor", "leaflet", "leaflet.css"),
    path.join(mapDir, "vendor", "leaflet", "leaflet.js"),
  ]) {
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) errors.push(`missing or empty: ${file}`);
  }
}
const dataMatch = html.match(/const PUBLIC_TRIP_DATA = (\{[\s\S]*?\});\n\n    const stops = PUBLIC_TRIP_DATA\.stops;/);
let data;
if (!dataMatch) {
  errors.push("missing public data boundary: PUBLIC_TRIP_DATA");
} else {
  try {
    data = JSON.parse(dataMatch[1]);
  } catch (error) {
    errors.push(`public data is not valid JSON: ${error.message}`);
  }
}

if (data) {
  if (!String(data.trip?.slug || "").trim()) errors.push("public trip needs an isolated slug");
  if (!Array.isArray(data.itineraryDays) || !data.itineraryDays.length) errors.push("public trip needs itinerary days");
  if (!Array.isArray(data.pois) || !data.pois.length) errors.push("public trip needs POIs");
  const dayIds = new Set((data.itineraryDays || []).map((day) => day.id));
  for (const rule of data.defaultAssignments || []) {
    if (!dayIds.has(rule.dayId)) errors.push(`assignment uses unknown day: ${rule.dayId}`);
  }
}

for (const token of [
  'data-canonical-interaction="europe-map-direct-v1"',
  'id="sidebar"',
  'id="itinerary-panel"',
  'id="day-list"',
  'id="poi-list"',
  'id="poi-detail-panel"',
  'id="poi-detail-day-rail"',
  'id="poi-detail-day-list"',
  'id="poi-detail-content"',
  'id="map"',
  ...(hasEmbeddedLeaflet
    ? ["REDSkill embedded Leaflet CSS", "REDSkill embedded Leaflet JS"]
    : ['./vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet.js']),
]) {
  if (!html.includes(token)) errors.push(`missing accepted Europe interaction shell token: ${token}`);
}

for (const [pattern, label] of [
  [/renderDayList/, "day cards"],
  [/renderPoiList/, "POI list"],
  [/renderDetailDayRail/, "detail date rail"],
  [/renderPoiDetailDayList/, "ordered day list"],
  [/openPoiDetail/, "shared POI detail"],
  [/data-drag-poi/, "pointer reordering"],
  [/dayCandidatePriorityRank/, "dynamic nearby candidates"],
  [/loadCommonsImages/, "same-page image previews"],
  [/L\.control\.layers/, "Leaflet layer control"],
  [/params\.set\("lat"/, "URL latitude"],
  [/params\.set\("lng"/, "URL longitude"],
  [/params\.set\("z"/, "URL zoom"],
  [/params\.set\("poi"/, "URL POI"],
  [/params\.set\("layers"/, "URL layers"],
  [/dashArray:\s*"6 8"/, "daily dashed route"],
  [/@media \(max-width: 820px\)/, "mobile layout"],
  [/europe-autumn-2026-sample-(?:priorities|plan|map-state)-v1/, "isolated public storage"],
]) {
  if (!pattern.test(html)) errors.push(`missing accepted Europe interaction behavior: ${label}`);
}

const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());
if (inlineScripts.length !== 1) {
  errors.push(`expected one inline application script, found ${inlineScripts.length}`);
} else {
  try {
    new vm.Script(inlineScripts[0], { filename: htmlPath });
  } catch (error) {
    errors.push(`inline application script syntax error: ${error.message}`);
  }
}

for (const pattern of [
  /\/Users\//,
  /file:\/\//i,
  /Airbnb/i,
  /51240589/,
  /\bAF\d{3,4}\b/,
  /europe-2026-itinerary-/,
  /d0916/,
]) {
  if (pattern.test(html)) errors.push(`privacy scan found: ${pattern}`);
}

finish();

function finish() {
  if (errors.length) {
    console.error(`Europe direct-copy interaction contract failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Europe direct-copy interaction contract passed: ${htmlPath}`);
  process.exit(0);
}
