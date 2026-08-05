#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptDir, "validate-trip-events.js");

const validVenue = {
  id: "concert",
  name: "Neighborhood concert",
  scope: "venue",
  city: "Madrid",
  status: "confirmed",
  startsAt: "2026-10-18T19:30:00+02:00",
  endsAt: "2026-10-18T21:00:00+02:00",
  venuePoiId: "venue",
  routeImpact: "candidate",
  whyWorthIt: "A date-bound local performance.",
  plan: "Use it as the evening anchor.",
  tip: "Reserve before the trip.",
  officialUrl: "https://example.org/concert",
  sourceIds: ["event-source"],
};

const validHosted = {
  ...validVenue,
  id: "market-workshop",
  scope: "hosted",
  status: "announced",
  hostPoiId: "market",
  venuePoiId: undefined,
  startsAt: "2026-10-15",
  endsAt: "2026-10-15",
};

const validCitywide = {
  ...validVenue,
  id: "parade",
  scope: "citywide",
  status: "program-pending",
  routeImpact: "avoidance",
  startsAt: "2026-10-17",
  endsAt: "2026-10-18",
  venuePoiId: undefined,
};

const validHistoricalLead = {
  ...validCitywide,
  id: "past-fair",
  status: "historical-lead",
  routeImpact: "nearby",
};

function runValidation(events, itinerary = [], overrides = {}) {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "trip-event-contract-"));
  const paths = {
    events: path.join(fixtureDir, "events.json"),
    pois: path.join(fixtureDir, "pois.json"),
    itinerary: path.join(fixtureDir, "itinerary.json"),
    sources: path.join(fixtureDir, "sources.json"),
  };
  fs.writeFileSync(paths.events, JSON.stringify(events));
  fs.writeFileSync(paths.pois, JSON.stringify(overrides.pois || [{ id: "venue" }, { id: "market" }]));
  fs.writeFileSync(paths.itinerary, JSON.stringify(itinerary));
  fs.writeFileSync(paths.sources, JSON.stringify(overrides.sources || [{ id: "event-source" }]));
  const result = spawnSync(process.execPath, [
    validator,
    "--events", paths.events,
    "--pois", paths.pois,
    "--itinerary", paths.itinerary,
    "--sources", paths.sources,
  ], { encoding: "utf8" });
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

const valid = runValidation([validVenue, validHosted, validCitywide, validHistoricalLead]);
assert.equal(valid.status, 0, valid.output);
const summary = JSON.parse(valid.output);
assert.equal(summary.eventCount, 4);
assert.deepEqual(summary.scopes, { citywide: 2, hosted: 1, venue: 1 });
assert.deepEqual(summary.statuses, { announced: 1, confirmed: 1, "historical-lead": 1, "program-pending": 1 });
assert.deepEqual(summary.warnings, []);
assert.deepEqual(summary.errors, []);

const publicRoot = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public");
const publicValidation = spawnSync(process.execPath, [
  validator,
  "--events", path.join(publicRoot, "data", "events.json"),
  "--pois", path.join(publicRoot, "data", "pois.json"),
  "--itinerary", path.join(publicRoot, "data", "itinerary.json"),
  "--sources", path.join(publicRoot, "data", "sources.json"),
], { encoding: "utf8" });
assert.equal(
  publicValidation.status,
  0,
  `real public object itinerary fixture must validate:\n${publicValidation.stdout}${publicValidation.stderr}`,
);

const validObjectItinerary = {
  trip: { startDate: "2026-10-18" },
  days: [{
    id: "d1018",
    date: "2026-10-18",
    city: "Madrid",
    anchors: ["event:concert"],
    routeStops: [{ poiId: "venue" }],
  }],
  defaultAssignments: [{ poiId: "event:concert", dayId: "d1018", order: 2 }],
};
const validObject = runValidation([validVenue], validObjectItinerary);
assert.equal(validObject.status, 0, validObject.output);

for (const [label, events, itinerary, expected] of [
  ["unknown scope", [{ ...validVenue, scope: "district" }], [], /invalid scope: district/],
  ["unknown status", [{ ...validVenue, status: "booked" }], [], /invalid status: booked/],
  ["unknown route impact", [{ ...validVenue, routeImpact: "detour" }], [], /invalid routeImpact: detour/],
  ["duplicate id", [validVenue, { ...validVenue, name: "Duplicate concert" }], [], /Duplicate event id: concert/],
  ["missing official URL", [{ ...validVenue, officialUrl: "" }], [], /missing officialUrl/],
  ["missing source id", [{ ...validVenue, sourceIds: [] }], [], /missing sourceIds/],
  ["missing host", [{ ...validHosted, hostPoiId: undefined }], [], /hosted event requires hostPoiId/],
  ["missing venue location", [{ ...validVenue, venuePoiId: undefined }], [], /venue event requires venuePoiId or valid coords/],
  ["missing confirmed date time", [{ ...validVenue, startsAt: "2026-10-18", endsAt: "2026-10-18" }], [], /confirmed event requires startsAt and endsAt with date and time/],
  ["impossible calendar date time", [{ ...validVenue, startsAt: "2026-02-30T19:30:00+02:00" }], [], /invalid startsAt/],
  ["impossible calendar date", [{ ...validHosted, startsAt: "2026-02-30" }], [], /invalid startsAt/],
  ["missing source record", [{ ...validVenue, sourceIds: ["missing-source"] }], [], /references missing source: missing-source/],
  ["unconfirmed itinerary event", [validHosted], [{ id: "day-1", routeStops: [{ poiId: "event:market-workshop" }] }], /event:market-workshop must reference a confirmed venue event/],
  ["unsafe leading punctuation id", [{ ...validVenue, id: "-unsafe" }], [], /invalid id.*-unsafe/],
  ["unsafe slash id", [{ ...validVenue, id: "unsafe\/id" }], [], /invalid id.*unsafe\/id/],
  ["invalid event recheckAt", [{ ...validVenue, recheckAt: "2026-02-30" }], [], /invalid recheckAt/],
  ["wrong assignment city", [validVenue], {
    trip: { startDate: "2026-10-18" },
    days: [{ id: "d1018", date: "2026-10-18", city: "Barcelona", routeStops: [{ poiId: "event:concert" }] }],
    defaultAssignments: [],
  }, /event:concert.*city/i],
  ["assignment outside event window", [validVenue], {
    trip: { startDate: "2026-10-17" },
    days: [{ id: "d1017", date: "2026-10-17", city: "Madrid" }],
    defaultAssignments: [{ name: validVenue.name, dayId: "d1017", order: 1 }],
  }, /event:concert.*window/i],
  ["assignment on transit day", [validVenue], {
    trip: { startDate: "2026-10-18" },
    days: [{ id: "d1018", date: "2026-10-18", city: "Transit" }],
    defaultAssignments: [{ poiId: "event:concert", dayId: "d1018", order: 1 }],
  }, /event:concert.*transit/i],
  ["assignment missing day", [validVenue], {
    trip: { startDate: "2026-10-18" },
    days: [{ id: "d1018", date: "2026-10-18", city: "Madrid" }],
    defaultAssignments: [{ poiId: "event:concert", dayId: "missing", order: 1 }],
  }, /missing day.*missing/i],
]) {
  const result = runValidation(events, itinerary);
  assert.notEqual(result.status, 0, `${label} should fail`);
  assert.match(result.output, expected, `${label} should explain the contract failure`);
}

const affectedCityEvent = {
  ...validVenue,
  id: "regional-concert",
  affectedCities: ["Versailles"],
  startsAt: "2026-10-17T19:30:00+02:00",
  endsAt: "2026-10-19T21:00:00+02:00",
};
for (const [date, city] of [
  ["2026-10-17", "Madrid"],
  ["2026-10-19", "Madrid"],
  ["2026-10-18", "Versailles"],
]) {
  const boundary = runValidation([affectedCityEvent], {
    trip: { startDate: "2026-10-17" },
    days: [{ id: "boundary", date, city, routeStops: [{ poiId: "event:regional-concert" }] }],
    defaultAssignments: [],
  });
  assert.equal(boundary.status, 0, `${date} ${city} should be eligible:\n${boundary.output}`);
}

const invalidSourceRecheck = runValidation([validVenue], [], {
  sources: [{ id: "event-source", recheckBefore: "2026-04-31" }],
});
assert.notEqual(invalidSourceRecheck.status, 0);
assert.match(invalidSourceRecheck.output, /invalid recheckBefore/);

console.log("Event data contract passed");
