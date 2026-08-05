#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "assets", "guide-template-europe-public");
const htmlPath = path.join(root, "maps", "itinerary-map.html");
const poiPath = path.join(root, "data", "pois.json");
const itineraryPath = path.join(root, "data", "itinerary.json");
const sourcesPath = path.join(root, "data", "sources.json");
const eventsPath = path.join(root, "data", "events.json");
const tripDataPath = path.join(root, "maps", "assets", "trip-data.js");
const builderPath = path.join(scriptDir, "build-europe-public-template.js");

for (const file of [htmlPath, poiPath, itineraryPath, sourcesPath, eventsPath, tripDataPath]) {
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `missing public template file: ${file}`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const pois = JSON.parse(fs.readFileSync(poiPath, "utf8"));
const itinerary = JSON.parse(fs.readFileSync(itineraryPath, "utf8"));
const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const events = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
const travelerEvents = events.map(({ sourceIds: _sourceIds, ...event }) => event);
const dataMatch = html.match(/const PUBLIC_TRIP_DATA = (\{[\s\S]*?\});\n\n    const stops = PUBLIC_TRIP_DATA\.stops;/);
assert.ok(dataMatch, "public HTML must expose a single replaceable PUBLIC_TRIP_DATA block");
const embedded = JSON.parse(dataMatch[1]);

assert.equal(itinerary.trip.slug, "europe-autumn-2026-sample");
assert.equal(itinerary.trip.language, "zh-CN");
assert.equal(itinerary.days.length, 18);
assert.equal(pois.length, 379);
assert.equal(embedded.trip.slug, itinerary.trip.slug);
assert.equal(embedded.itineraryDays.length, 18);
assert.equal(embedded.pois.length, 379);
assert.ok(embedded.pois.every((poi) => !Object.hasOwn(poi, "sourceIds")), "traveler HTML must not expose POI sourceIds");
assert.deepEqual(embedded.itineraryDays, itinerary.days);
assert.ok(events.every((event) => Array.isArray(event.sourceIds) && event.sourceIds.length > 0));
assert.deepEqual(embedded.events, travelerEvents);
assert.ok(embedded.events.every((event) => !Object.hasOwn(event, "sourceIds")));
assert.ok(sources.every((source) => source.url && source.checkedAt && source.supports?.length));

const sourcePoi = pois.find((poi) => poi.name === "Art Basel Paris at Grand Palais");
const embeddedSourcePoi = embedded.pois.find((poi) => poi.name === sourcePoi?.name);
assert.ok(sourcePoi?.sourceIds?.length >= 1, "public source data must include a source-backed sample POI");
assert.ok(!Object.hasOwn(embeddedSourcePoi, "sourceIds"));
assert.deepEqual(embeddedSourcePoi.evidenceSources, [
  {
    title: "Art Basel Paris",
    url: "https://www.artbasel.com/Paris?lang=en",
    type: "official",
    role: "fact",
    language: "en",
    supports: ["event-dates", "venue"],
    checkedAt: "2026-07-19",
    status: "confirmed",
  },
  {
    title: "Art Basel Paris Tickets",
    url: "https://www.artbasel.com/paris/tickets?lang=en",
    type: "official",
    role: "visit",
    language: "en",
    supports: ["opening-hours", "tickets", "entry-rules"],
    checkedAt: "2026-07-19",
    status: "confirmed",
  },
]);
assert.match(html, /function renderPoiEvidence\(item\)/);
assert.match(html, /<details class="poi-evidence">/);

const generatedSandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(tripDataPath, "utf8"), generatedSandbox);
assert.deepEqual(JSON.parse(JSON.stringify(generatedSandbox.window.TRIP_DATA.events)), travelerEvents);
assert.ok(generatedSandbox.window.TRIP_DATA.events.every((event) => !Object.hasOwn(event, "sourceIds")));
assert.ok(generatedSandbox.window.TRIP_DATA.pois.every((poi) => !Object.hasOwn(poi, "sourceIds")));
assert.deepEqual(
  JSON.parse(JSON.stringify(
    generatedSandbox.window.TRIP_DATA.pois.find((poi) => poi.name === sourcePoi.name)?.evidenceSources,
  )),
  embeddedSourcePoi.evidenceSources,
);

const eventRuntimeMatch = html.match(/\/\* EVENT_RUNTIME_PURE_START \*\/([\s\S]*?)\/\* EVENT_RUNTIME_PURE_END \*\//);
assert.ok(eventRuntimeMatch, "public map must expose the shipped pure event runtime for executable contract tests");
const publicUrlRuntimeMatch = html.match(/\/\* PUBLIC_URL_RUNTIME_START \*\/([\s\S]*?)\/\* PUBLIC_URL_RUNTIME_END \*\//);
assert.ok(publicUrlRuntimeMatch, "public map must expose the shared public URL runtime contract");
const eventRuntimeNames = [
  "isSlugSafeEventId",
  "isTravelerVisibleEvent",
  "getDayIsoDate",
  "buildRuntimeEventPois",
  "isEventAssignable",
  "sanitizeEventAssignments",
  "getCityEventsForDay",
  "renderHostedEventsForItem",
  "renderCityEventNoticesForDay",
  "composePoiDetailEventSections",
  "composeDayListEventSections",
];
const eventRuntimeSandbox = { URL };
vm.runInNewContext(
  `${publicUrlRuntimeMatch[1]}\n${eventRuntimeMatch[1]}\nthis.eventRuntime = { ${eventRuntimeNames.join(", ")} };`,
  eventRuntimeSandbox,
);
const eventRuntime = eventRuntimeSandbox.eventRuntime;
const runtimePois = [
  {
    id: "venue-1",
    name: "Venue",
    city: "Paris",
    area: "Venue area",
    coords: [48.8, 2.3],
    category: "art",
  },
  { id: "host-1", name: "Host", city: "Paris", area: "Host area", coords: [48.9, 2.4], category: "art" },
];
const runtimeEvents = [
  {
    id: "confirmed.event-1",
    name: "Confirmed event",
    name_zh: "确认活动",
    scope: "venue",
    city: "Paris",
    area: "Event area",
    status: "confirmed",
    startsAt: "2026-10-24T10:00:00+02:00",
    endsAt: "2026-10-25T18:00:00+02:00",
    affectedCities: ["Versailles"],
    venuePoiId: "venue-1",
    whyWorthIt: "Worth it",
    plan: "Plan it",
    tip: "Check it",
    officialUrl: "https://example.com/confirmed",
  },
  {
    id: "pending-event",
    name: "Pending event",
    scope: "venue",
    city: "Paris",
    status: "program-pending",
    startsAt: "2026-10-24",
    endsAt: "2026-10-25",
    coords: [48.7, 2.2],
    whyWorthIt: "Pending worth",
    plan: "Pending plan",
    tip: "Pending tip",
    officialUrl: "https://example.com/pending",
  },
  { id: "hosted-event", name: "Hosted", scope: "hosted", city: "Paris", status: "announced", hostPoiId: "host-1" },
  { id: "city-event", name: "Citywide", scope: "citywide", city: "Paris", status: "program-pending" },
  {
    id: "historical-venue",
    name: "Historical venue",
    scope: "venue",
    city: "Paris",
    status: "historical-lead",
    startsAt: "2026-10-24",
    endsAt: "2026-10-25",
    coords: [48.6, 2.2],
  },
  {
    id: 'bad" onmouseover="alert(1)',
    name: "Malicious",
    scope: "venue",
    city: "Paris",
    status: "confirmed",
    coords: [48.6, 2.1],
  },
];
const syntheticPois = JSON.parse(JSON.stringify(eventRuntime.buildRuntimeEventPois(runtimeEvents, runtimePois)));
assert.equal(syntheticPois.length, 2, "only safe, located venue events should become synthetic POIs");
assert.deepEqual(syntheticPois[0], {
  id: "event:confirmed.event-1",
  name: "Confirmed event",
  name_zh: "确认活动",
  zh: "确认活动",
  city: "Paris",
  area: "Event area",
  category: "event",
  priority: "preferred",
  coords: [48.8, 2.3],
  note: "Worth it",
  whyWorthIt: "Worth it",
  plan: "Plan it",
  tip: "Check it",
  officialUrl: "https://example.com/confirmed",
  imageQuery: "Confirmed event Paris",
  eventId: "confirmed.event-1",
  eventStatus: "confirmed",
  eventScope: "venue",
  eventStartsAt: "2026-10-24T10:00:00+02:00",
  eventEndsAt: "2026-10-25T18:00:00+02:00",
  eventAffectedCities: ["Versailles"],
});
assert.deepEqual(syntheticPois.map((item) => item.id), ["event:confirmed.event-1", "event:pending-event"]);
assert.equal(eventRuntime.isSlugSafeEventId('bad" onmouseover="alert(1)'), false);
assert.equal(eventRuntime.isTravelerVisibleEvent({ id: "safe", status: "historical-lead" }), false);
assert.equal(eventRuntime.isTravelerVisibleEvent({ id: "safe", status: "confirmed" }), true);

for (const day of [
  { date: "2026-10-24", short: "10/31", city: "Paris" },
  { date: "2026-10-25", short: "10/31", city: "Paris" },
  { date: "2026-10-24", short: "10/31", city: "Versailles" },
]) {
  assert.equal(eventRuntime.isEventAssignable(syntheticPois[0], day, "2026-10-24"), true);
}
for (const day of [
  { date: "2026-10-23", short: "10/24", city: "Paris" },
  { date: "2026-10-26", short: "10/24", city: "Paris" },
  { date: "2026-10-24", short: "10/24", city: "Barcelona" },
  { date: "2026-10-24", short: "10/24", city: "Transit" },
]) {
  assert.equal(eventRuntime.isEventAssignable(syntheticPois[0], day, "2026-10-24"), false);
}
assert.equal(eventRuntime.isEventAssignable({ id: "normal", category: "art" }, null, "2026-10-24"), true);

const assignmentItems = [
  { id: "normal", category: "art" },
  syntheticPois[0],
  syntheticPois[1],
];
const assignmentDays = [{ id: "d1", date: "2026-10-24", short: "10/24", city: "Paris" }];
for (const label of ["default", "restored"]) {
  const input = {
    normal: { dayId: "d1", order: 1 },
    "event:confirmed.event-1": { dayId: "d1", order: 2 },
    "event:pending-event": { dayId: "d1", order: 3 },
    "event:removed-event": { dayId: "d1", order: 4 },
    "legacy-missing-poi": { dayId: "d1", order: 5 },
  };
  const sanitized = JSON.parse(JSON.stringify(eventRuntime.sanitizeEventAssignments(
    input,
    assignmentItems,
    assignmentDays,
    "2026-10-24",
  )));
  assert.deepEqual(sanitized, {
    normal: { dayId: "d1", order: 1 },
    "event:confirmed.event-1": { dayId: "d1", order: 2 },
    "legacy-missing-poi": { dayId: "d1", order: 5 },
  }, `${label} assignments must exclude pending and removed events`);
  assert.ok(input["event:pending-event"], `${label} sanitization must not mutate its input`);
}
for (const [label, staleItem] of [
  ["window moved", { ...syntheticPois[0], eventStartsAt: "2026-10-25T10:00:00+02:00", eventEndsAt: "2026-10-26T18:00:00+02:00" }],
  ["city changed", { ...syntheticPois[0], city: "Barcelona", eventAffectedCities: [] }],
  ["scope changed", { ...syntheticPois[0], eventScope: "hosted" }],
]) {
  const sanitized = eventRuntime.sanitizeEventAssignments(
    { [staleItem.id]: { dayId: "d1", order: 1 } },
    [staleItem],
    assignmentDays,
    "2026-10-24",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), {}, `${label} must remove a stale event assignment`);
}
assert.ok(
  html.includes("const defaultItineraryAssignments = sanitizeEventAssignments(rawDefaultItineraryAssignments, pois, itineraryDays, PUBLIC_TRIP_DATA.trip.startDate)"),
  "default assignments must use the executable event sanitizer",
);
assert.ok(
  /const itineraryPlan = initializeItineraryPlan\([\s\S]*?\(assignments\) => sanitizeEventAssignments\(\s*assignments,\s*pois,\s*itineraryDays,\s*PUBLIC_TRIP_DATA\.trip\.startDate\s*\)\s*\);/.test(html),
  "restored assignments must sanitize saved structure before the executable event sanitizer",
);
for (const token of [
  ".filter((day) => isEventAssignable(item, day, PUBLIC_TRIP_DATA.trip.startDate))",
  "isEventAssignable(item, selectedDay, PUBLIC_TRIP_DATA.trip.startDate)",
  "isEventAssignable(item, dayById[dayId], PUBLIC_TRIP_DATA.trip.startDate)",
]) {
  assert.ok(html.includes(token), `all assignment controls and mutations must use day eligibility: ${token}`);
}

const boundaryEvents = [{
  id: "all-saints",
  scope: "citywide",
  city: "Barcelona",
  startsAt: "2026-11-01",
  endsAt: "2026-11-03",
}];
for (const short of ["11/1", "11/2", "11/3"]) {
  assert.equal(eventRuntime.getCityEventsForDay(boundaryEvents, { short, city: "Barcelona" }, "2026-10-24").length, 1);
}
assert.equal(
  eventRuntime.getDayIsoDate({ date: "2026-11-03", short: "10/31" }, "2026-10-24"),
  "2026-11-03",
  "ISO day.date must win over a conflicting short label",
);
assert.equal(eventRuntime.getDayIsoDate({ short: "11-03" }, "2026-10-24"), "2026-11-03");
assert.equal(eventRuntime.getDayIsoDate({ short: "2/30" }, "2026-10-24"), "");

const historicalScopeEvents = [
  {
    id: "historical-hosted",
    name: "Historical hosted",
    scope: "hosted",
    status: "historical-lead",
    hostPoiId: "host-1",
    startsAt: "2026-10-24",
    endsAt: "2026-10-24",
  },
  {
    id: "historical-citywide",
    name: "Historical citywide",
    scope: "citywide",
    city: "Paris",
    status: "historical-lead",
    startsAt: "2026-10-24",
    endsAt: "2026-10-24",
  },
];
assert.equal(eventRuntime.renderHostedEventsForItem(historicalScopeEvents, { id: "host-1" }), "");
assert.equal(
  eventRuntime.renderCityEventNoticesForDay(
    historicalScopeEvents,
    { date: "2026-10-24", short: "10/24", city: "Paris" },
    "2026-10-24",
  ),
  "",
);
const unsafeHostedEvent = {
  id: "unsafe-hosted-event",
  name: "Unsafe hosted event",
  scope: "hosted",
  status: "announced",
  hostPoiId: "host-1",
  startsAt: "2026-10-24",
  endsAt: "2026-10-24",
  whyWorthIt: "Visible copy remains available.",
  plan: "Keep the notice without a link.",
  tip: "Do not follow an unsafe URL.",
  officialUrl: "javascript:alert(1)",
};
const unsafeHostedHtml = eventRuntime.renderHostedEventsForItem([unsafeHostedEvent], { id: "host-1" });
assert.match(unsafeHostedHtml, /Unsafe hosted event/, "unsafe runtime event should retain its escaped notice copy");
assert.doesNotMatch(unsafeHostedHtml, /<a\b/i, "javascript event URL must render no anchor");
const credentialHostedHtml = eventRuntime.renderHostedEventsForItem([
  { ...unsafeHostedEvent, id: "credential-hosted-event", officialUrl: "https://user:secret@example.com/event" },
], { id: "host-1" });
assert.doesNotMatch(credentialHostedHtml, /<a\b/i, "credential-bearing event URL must render no anchor");
for (const [short, city] of [["10/31", "Barcelona"], ["11/4", "Barcelona"], ["11/2", "Madrid"]]) {
  assert.equal(eventRuntime.getCityEventsForDay(boundaryEvents, { short, city }, "2026-10-24").length, 0);
}

const slugify = (value) => String(value)
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const publicPoiIds = new Set(pois.map((poi) => slugify(`${poi.city}-${poi.name}`)));
const hostedEvent = events.find((event) => event.scope === "hosted");
assert.ok(hostedEvent && publicPoiIds.has(hostedEvent.hostPoiId), "hosted event must reference a real public POI");
const citywidePendingEvent = events.find((event) => event.scope === "citywide" && event.status === "program-pending");
assert.ok(citywidePendingEvent, "public fixture must include a visible citywide program-pending event");
assert.ok(
  itinerary.days.some((day) => day.city === citywidePendingEvent.city && day.short === "11/1"),
  "citywide program-pending event must overlap a visible public itinerary day",
);
const confirmedVenueEvents = events.filter((event) => event.scope === "venue" && event.status === "confirmed");
assert.equal(confirmedVenueEvents.length, 1, "public fixture should produce one confirmed venue event POI");
const castanyadaSource = sources.find((source) => source.id === "barcelona-autumn-traditions");
assert.ok(castanyadaSource?.supports.includes("castanyada-date"));
assert.match(castanyadaSource?.notes || "", /10 月 31 日/);

const byName = new Map(pois.map((poi) => [poi.name, poi]));
const santAntoni = byName.get("Mercat de Sant Antoni");
assert.equal(santAntoni?.contentTier, "deep");
assert.ok(santAntoni?.whyWorthIt?.trim(), "deep sample should explain why it is worth visiting");
assert.ok(santAntoni?.detailSections?.length >= 2 && santAntoni.detailSections.length <= 4);
assert.deepEqual(
  embedded.pois.find((poi) => poi.name === "Mercat de Sant Antoni"),
  { ...santAntoni, evidenceSources: [] },
);
const hasChinese = (value) => /[\u3400-\u9fff]/.test(String(value || ""));
for (const [name, expected] of [
  ["Sainte-Chapelle", "圣礼拜堂"],
  ["Cathédrale Notre-Dame de Paris", "巴黎圣母院"],
  ["Musée d'Orsay", "奥赛博物馆"],
  ["Domaine national du Palais-Royal", "巴黎皇家宫殿"],
  ["La Pedrera - Casa Milà", "米拉之家"],
]) {
  assert.match(byName.get(name)?.zh || "", new RegExp(expected), `${name} should have a Chinese-facing name`);
}
for (const poi of pois.filter((item) => ["sight", "art", "local-life"].includes(item.category))) {
  assert.ok(hasChinese(poi.zh), `${poi.category} place should have a Chinese-facing name: ${poi.name}`);
}

for (const token of [
  'data-canonical-interaction="europe-map-direct-v1"',
  'id="sidebar"',
  'id="day-list"',
  'id="poi-list"',
  'id="poi-detail-panel"',
  'id="poi-detail-day-rail"',
  'id="poi-detail-day-list"',
  'id="map"',
  "renderDayList",
  "renderPoiList",
  "renderDetailDayRail",
  "renderPoiDetailDayList",
  "openPoiDetail",
  "const renderPoiDetailSections",
  "const tripEvents = PUBLIC_TRIP_DATA.events || []",
  "const renderHostedEvents",
  "const renderCityEventNotices",
  "function isEventAssignable",
  'event: { label: "同期活动"',
  "等待具体节目",
  "poi-detail-list",
  "item.whyWorthIt || item.note",
  "const userLanguage = PUBLIC_TRIP_DATA.trip.language",
  "const getDisplayName = (item)",
  "function calculatePoiFocusZoom(currentZoom, mapSize)",
  "const focusPoiOnMap = (entry)",
  "data-drag-poi",
  "dayCandidatePriorityRank",
  "loadCommonsImages",
  "L.control.layers",
  'dashArray: "6 8"',
  'params.set("lat"',
  'params.set("lng"',
  'params.set("z"',
  'params.set("poi"',
  'params.set("layers"',
  "@media (max-width: 820px)",
  "europe-autumn-2026-sample-priorities-v1",
  "europe-autumn-2026-sample-plan-v1",
  "europe-autumn-2026-sample-map-state-v1",
]) {
  assert.ok(html.includes(token), `missing direct-copy interaction token: ${token}`);
}

const focusMatch = html.match(/function calculatePoiFocusZoom\(currentZoom, mapSize\) \{[\s\S]*?\n    \}/);
assert.ok(focusMatch, "public template should expose a pure size-aware POI focus calculation");
const focusSandbox = {};
vm.runInNewContext(`${focusMatch[0]}; this.calculatePoiFocusZoom = calculatePoiFocusZoom;`, focusSandbox);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 420, y: 360 }), 14);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 680, y: 640 }), 15);
assert.equal(focusSandbox.calculatePoiFocusZoom(8, { x: 1200, y: 800 }), 16);
assert.equal(focusSandbox.calculatePoiFocusZoom(18, { x: 680, y: 640 }), 16);
assert.doesNotMatch(html, /Math\.max\(map\.getZoom\(\), 15\)/);

const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());
assert.equal(scripts.length, 1);
new vm.Script(scripts[0], { filename: htmlPath });

function runRealBuilderFixture({
  nextItinerary,
  nextEvents = events,
  nextPois = pois,
  nextSources = sources,
  mutateHtml = (value) => value,
}) {
  const fixtureParent = fs.mkdtempSync(path.join(os.tmpdir(), "europe-public-builder-"));
  const fixtureRoot = path.join(fixtureParent, "guide-template-europe-public");
  try {
    fs.cpSync(root, fixtureRoot, { recursive: true });
    const fixtureItineraryPath = path.join(fixtureRoot, "data", "itinerary.json");
    const fixtureEventsPath = path.join(fixtureRoot, "data", "events.json");
    const fixturePoiPath = path.join(fixtureRoot, "data", "pois.json");
    const fixtureSourcesPath = path.join(fixtureRoot, "data", "sources.json");
    const fixtureTripDataPath = path.join(fixtureRoot, "maps", "assets", "trip-data.js");
    const fixtureHtmlPath = path.join(fixtureRoot, "maps", "itinerary-map.html");
    fs.writeFileSync(fixtureItineraryPath, `${JSON.stringify(nextItinerary, null, 2)}\n`);
    fs.writeFileSync(fixtureEventsPath, `${JSON.stringify(nextEvents, null, 2)}\n`);
    fs.writeFileSync(fixturePoiPath, `${JSON.stringify(nextPois, null, 2)}\n`);
    fs.writeFileSync(fixtureSourcesPath, `${JSON.stringify(nextSources, null, 2)}\n`);
    fs.writeFileSync(fixtureHtmlPath, mutateHtml(fs.readFileSync(fixtureHtmlPath, "utf8")));
    const assetBefore = fs.readFileSync(fixtureTripDataPath, "utf8");
    const htmlBefore = fs.readFileSync(fixtureHtmlPath, "utf8");
    const result = spawnSync(
      process.execPath,
      [builderPath, "--template-root", fixtureRoot],
      { encoding: "utf8" },
    );
    let builtTrip = null;
    if (result.status === 0) {
      const sandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(fixtureTripDataPath, "utf8"), sandbox, { filename: fixtureTripDataPath });
      builtTrip = JSON.parse(JSON.stringify(sandbox.window.TRIP_DATA));
    }
    return {
      result,
      builtTrip,
      assetUnchanged: fs.readFileSync(fixtureTripDataPath, "utf8") === assetBefore,
      htmlUnchanged: fs.readFileSync(fixtureHtmlPath, "utf8") === htmlBefore,
    };
  } finally {
    fs.rmSync(fixtureParent, { recursive: true, force: true });
  }
}

const sampleSourcePoi = {
  ...pois[0],
  id: "sample-source-poi",
  name: "Sample source POI",
  sourceIds: ["sample-official-source"],
};
const sampleSource = {
  id: "sample-official-source",
  title: "Sample official source",
  url: "https://example.com/place",
  type: "official",
  role: "fact",
  language: "es",
  supports: ["identity", "visit"],
  checkedAt: "2026-08-02",
  status: "confirmed",
};
const sampleEvidenceBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextPois: [sampleSourcePoi, ...pois.slice(1)],
  nextSources: [...sources, sampleSource],
});
assert.equal(sampleEvidenceBuild.result.status, 0, sampleEvidenceBuild.result.stderr);
const generatedSamplePoi = sampleEvidenceBuild.builtTrip.pois.find((poi) => poi.name === sampleSourcePoi.name);
assert.ok(generatedSamplePoi, "the real builder must write the requested temporary template root");
assert.ok(!Object.hasOwn(generatedSamplePoi, "sourceIds"));
assert.deepEqual(generatedSamplePoi.evidenceSources, [
  {
    title: "Sample official source",
    url: "https://example.com/place",
    type: "official",
    role: "fact",
    language: "es",
    supports: ["identity", "visit"],
    checkedAt: "2026-08-02",
    status: "confirmed",
  },
]);

const missingSourceBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextPois: [{ ...sampleSourcePoi, sourceIds: ["missing-source"] }, ...pois.slice(1)],
});
assert.notEqual(missingSourceBuild.result.status, 0, "unresolved POI source ids must fail the build");
assert.match(
  `${missingSourceBuild.result.stdout}${missingSourceBuild.result.stderr}`,
  /POI sample-source-poi references missing source missing-source/,
);

const unsafeSourceBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextPois: [sampleSourcePoi, ...pois.slice(1)],
  nextSources: [...sources, { ...sampleSource, url: "javascript:alert(1)" }],
});
assert.notEqual(unsafeSourceBuild.result.status, 0, "non-HTTP(S) source URLs must fail the build");
assert.match(`${unsafeSourceBuild.result.stdout}${unsafeSourceBuild.result.stderr}`, /Source sample-official-source has unsafe URL/);

const credentialSourceBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextPois: [sampleSourcePoi, ...pois.slice(1)],
  nextSources: [...sources, { ...sampleSource, url: "https://reader:secret@example.com/place" }],
});
assert.notEqual(credentialSourceBuild.result.status, 0, "credential-bearing evidence source URLs must fail the build");
assert.match(`${credentialSourceBuild.result.stdout}${credentialSourceBuild.result.stderr}`, /Source sample-official-source has unsafe URL/);

for (const [label, officialUrl] of [
  ["javascript", "javascript:alert(1)"],
  ["credential-bearing", "https://reader:secret@example.com/event"],
]) {
  const unsafeEventBuild = runRealBuilderFixture({
    nextItinerary: itinerary,
    nextEvents: events.map((event, index) => index === 0 ? { ...event, officialUrl } : event),
  });
  assert.notEqual(unsafeEventBuild.result.status, 0, `${label} event officialUrl must fail the build`);
  assert.match(
    `${unsafeEventBuild.result.stdout}${unsafeEventBuild.result.stderr}`,
    /Event .* has unsafe officialUrl/,
  );
}

const normalizedEventSource = "HTTPS://Example.COM:443/normalized-event";
const normalizedEventBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextEvents: events.map((event, index) => index === 0 ? { ...event, officialUrl: normalizedEventSource } : event),
});
assert.equal(normalizedEventBuild.result.status, 0, normalizedEventBuild.result.stderr);
assert.equal(
  normalizedEventBuild.builtTrip.events.find((event) => event.id === events[0].id)?.officialUrl,
  new URL(normalizedEventSource).href,
  "event officialUrl must be normalized before public serialization",
);

const duplicateSourceBuild = runRealBuilderFixture({
  nextItinerary: itinerary,
  nextSources: [...sources, { ...sources[0] }],
});
assert.notEqual(duplicateSourceBuild.result.status, 0, "duplicate source ids must fail the build");
assert.match(`${duplicateSourceBuild.result.stdout}${duplicateSourceBuild.result.stderr}`, /duplicate source id.*art-basel-paris-2026/i);

for (const [label, mutateHtml, expected] of [
  [
    "missing declaration",
    (value) => value.replace("const PUBLIC_TRIP_DATA = ", "const BROKEN_TRIP_DATA = "),
    /exactly one PUBLIC_TRIP_DATA block|missing the PUBLIC_TRIP_DATA boundary/i,
  ],
  [
    "missing alias boundary",
    (value) => value.replace("    const stops = PUBLIC_TRIP_DATA.stops;", "    const stops = BROKEN_TRIP_DATA.stops;"),
    /alias boundary|PUBLIC_TRIP_DATA boundary/i,
  ],
  [
    "duplicate declaration",
    (value) => value.replace("const PUBLIC_TRIP_DATA = ", "const PUBLIC_TRIP_DATA = {};\n    const PUBLIC_TRIP_DATA = "),
    /exactly one PUBLIC_TRIP_DATA block|PUBLIC_TRIP_DATA boundary/i,
  ],
]) {
  const brokenBoundaryBuild = runRealBuilderFixture({
    nextItinerary: itinerary,
    mutateHtml,
  });
  assert.notEqual(brokenBoundaryBuild.result.status, 0, `${label} must fail the real builder`);
  assert.match(`${brokenBoundaryBuild.result.stdout}${brokenBoundaryBuild.result.stderr}`, expected);
  assert.equal(brokenBoundaryBuild.assetUnchanged, true, `${label} must leave trip-data.js byte-identical`);
  assert.equal(brokenBoundaryBuild.htmlUnchanged, true, `${label} must leave itinerary-map.html byte-identical`);
}

const confirmedDefaultEvent = events.find((event) => event.scope === "venue" && event.status === "confirmed");
assert.ok(confirmedDefaultEvent, "real builder fixture requires a confirmed venue event");
const itineraryWithEventDefault = {
  ...itinerary,
  defaultAssignments: [
    ...itinerary.defaultAssignments,
    { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
    { poiId: `event:${confirmedDefaultEvent.id}`, dayId: "d1025", order: 99 },
  ],
};
const eventDefaultBuild = runRealBuilderFixture({ nextItinerary: itineraryWithEventDefault });
assert.equal(
  eventDefaultBuild.result.status,
  0,
  `real builder must resolve a confirmed event default by name:\n${eventDefaultBuild.result.stdout}${eventDefaultBuild.result.stderr}`,
);
for (const dayId of ["d1024", "d1025"]) {
  const generatedDay = eventDefaultBuild.builtTrip.days.find((day) => day.id === dayId);
  assert.ok(
    generatedDay?.routeStops.some((stop) => stop.poiId === `event:${confirmedDefaultEvent.id}`),
    `generated trip output must contain the synthetic event id for ${dayId}`,
  );
  const baselineStops = JSON.parse(JSON.stringify(
    generatedSandbox.window.TRIP_DATA.days.find((day) => day.id === dayId)?.routeStops || [],
  ));
  assert.deepEqual(
    generatedDay.routeStops.filter((stop) => !stop.poiId.startsWith("event:")),
    baselineStops,
    `event resolution must not alter stable POI defaults for ${dayId}`,
  );
}

const isoPrecedenceItinerary = {
  ...itinerary,
  days: itinerary.days.map((day) => day.id === "d1024"
    ? { ...day, date: "2026-10-25", short: "10/26" }
    : day),
  defaultAssignments: [
    ...itinerary.defaultAssignments,
    { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
  ],
};
const isoPrecedenceBuild = runRealBuilderFixture({ nextItinerary: isoPrecedenceItinerary });
assert.equal(
  isoPrecedenceBuild.result.status,
  0,
  `valid ISO day.date must win over a conflicting short label:\n${isoPrecedenceBuild.result.stdout}${isoPrecedenceBuild.result.stderr}`,
);
assert.equal(isoPrecedenceBuild.builtTrip.days.find((day) => day.id === "d1024")?.date, "2026-10-25");
assert.ok(
  isoPrecedenceBuild.builtTrip.days
    .find((day) => day.id === "d1024")
    ?.routeStops.some((stop) => stop.poiId === `event:${confirmedDefaultEvent.id}`),
);

const fallbackYear = "2031";
const fallbackYearItinerary = {
  ...itinerary,
  trip: { ...itinerary.trip, startDate: `${fallbackYear}-10-24` },
  days: itinerary.days.map((day) => day.id === "d1024"
    ? { ...day, date: "10/24 周五", short: "10-24" }
    : day),
  defaultAssignments: [
    ...itinerary.defaultAssignments,
    { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
  ],
};
const fallbackYearEvents = events.map((event) => event.id === confirmedDefaultEvent.id
  ? {
      ...event,
      startsAt: `${fallbackYear}-10-23T11:00:00+02:00`,
      endsAt: `${fallbackYear}-10-25T19:00:00+01:00`,
    }
  : event);
const fallbackYearBuild = runRealBuilderFixture({
  nextItinerary: fallbackYearItinerary,
  nextEvents: fallbackYearEvents,
});
assert.equal(
  fallbackYearBuild.result.status,
  0,
  `short fallback must use trip.startDate year and accept MM-DD:\n${fallbackYearBuild.result.stdout}${fallbackYearBuild.result.stderr}`,
);
assert.equal(fallbackYearBuild.builtTrip.days.find((day) => day.id === "d1024")?.date, "2031-10-24");

const impossibleIsoItinerary = {
  ...itinerary,
  days: itinerary.days.map((day) => day.id === "d1024"
    ? { ...day, date: "2026-02-30", short: "10/24" }
    : day),
  defaultAssignments: [
    ...itinerary.defaultAssignments,
    { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
  ],
};
const impossibleIsoBuild = runRealBuilderFixture({ nextItinerary: impossibleIsoItinerary });
assert.notEqual(impossibleIsoBuild.result.status, 0, "impossible ISO day.date must fail the real builder");
assert.match(
  `${impossibleIsoBuild.result.stdout}${impossibleIsoBuild.result.stderr}`,
  /invalid public sample day date.*d1024/i,
);

for (const [label, coords] of [
  ["non-finite", [Number.POSITIVE_INFINITY, 2.3]],
  ["latitude out of range", [91, 2.3]],
  ["longitude out of range", [48.8, 181]],
]) {
  const invalidLocationEvents = events.map((event) => event.id === confirmedDefaultEvent.id
    ? { ...event, venuePoiId: undefined, coords }
    : event);
  const invalidLocationBuild = runRealBuilderFixture({
    nextItinerary: {
      ...itinerary,
      defaultAssignments: [
        ...itinerary.defaultAssignments,
        { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
      ],
    },
    nextEvents: invalidLocationEvents,
  });
  assert.notEqual(invalidLocationBuild.result.status, 0, `${label} event coords must fail the real builder`);
  assert.match(
    `${invalidLocationBuild.result.stdout}${invalidLocationBuild.result.stderr}`,
    /no usable location.*Art Basel Paris 2026 public days/i,
  );
}

const venueSourcePoi = pois.find((poi) => slugify(`${poi.city}-${poi.name}`) === confirmedDefaultEvent.venuePoiId);
assert.ok(venueSourcePoi, "real builder fixture requires the confirmed event venue POI");
const invalidVenueBuild = runRealBuilderFixture({
  nextItinerary: {
    ...itinerary,
    defaultAssignments: [
      ...itinerary.defaultAssignments,
      { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
    ],
  },
  nextEvents: events.map((event) => event.id === confirmedDefaultEvent.id
    ? { ...event, coords: undefined }
    : event),
  nextPois: pois.map((poi) => poi === venueSourcePoi ? { ...poi, coords: [91, 2.3] } : poi),
});
assert.notEqual(invalidVenueBuild.result.status, 0, "out-of-range venue POI coords must fail the real builder");
assert.match(`${invalidVenueBuild.result.stdout}${invalidVenueBuild.result.stderr}`, /no usable location/i);

const missingVenueBuild = runRealBuilderFixture({
  nextItinerary: {
    ...itinerary,
    defaultAssignments: [
      ...itinerary.defaultAssignments,
      { name: confirmedDefaultEvent.name, dayId: "d1024", order: 99 },
    ],
  },
  nextEvents: events.map((event) => event.id === confirmedDefaultEvent.id
    ? { ...event, venuePoiId: "missing-venue-poi" }
    : event),
});
assert.notEqual(missingVenueBuild.result.status, 0, "missing venuePoiId target must fail the real builder");
assert.match(`${missingVenueBuild.result.stdout}${missingVenueBuild.result.stderr}`, /missing venue POI/i);

const ambiguousEventBuild = runRealBuilderFixture({
  nextItinerary: itineraryWithEventDefault,
  nextEvents: [
    ...events,
    { ...confirmedDefaultEvent, id: `${confirmedDefaultEvent.id}-duplicate` },
  ],
});
assert.notEqual(ambiguousEventBuild.result.status, 0, "ambiguous event names must fail the real builder");
assert.match(
  `${ambiguousEventBuild.result.stdout}${ambiguousEventBuild.result.stderr}`,
  /ambiguous public sample assignment name.*Art Basel Paris 2026 public days/i,
);

const builderModule = await import("./build-europe-public-template.js?serializer-contract");
assert.equal(typeof builderModule.serializeForInlineScript, "function", "builder must export its script-context serializer");
const breakoutPayload = {
  text: "</script><script>globalThis.scriptBreakout = true</script>&>\u2028\u2029",
};
const serializedBreakout = builderModule.serializeForInlineScript(breakoutPayload, 2);
assert.doesNotMatch(serializedBreakout, /[<>&\u2028\u2029]/, "inline serializer must escape script-breaking code points");
const breakoutSandbox = {};
vm.runInNewContext(`globalThis.roundTrip = ${serializedBreakout};`, breakoutSandbox);
assert.deepEqual(JSON.parse(JSON.stringify(breakoutSandbox.roundTrip)), breakoutPayload);
assert.equal(breakoutSandbox.scriptBreakout, undefined);
const generatedBreakoutHtml = `<script>globalThis.roundTrip = ${serializedBreakout};</script>`;
assert.equal([...generatedBreakoutHtml.matchAll(/<\/script>/gi)].length, 1, "payload must not terminate generated script context");
new vm.Script(generatedBreakoutHtml.match(/<script>([\s\S]*)<\/script>/i)[1]);

const publicText = [html, JSON.stringify(pois), JSON.stringify(itinerary), JSON.stringify(sources)].join("\n");
for (const pattern of [
  /\/Users\/cyx/i,
  /file:\/\//i,
  /Airbnb/i,
  /51240589/,
  /\bAF\d{3,4}\b/,
  /europe-2026-itinerary-/,
  /d0916/,
]) {
  assert.doesNotMatch(publicText, pattern, `privacy scan found ${pattern}`);
}

console.log("Europe direct-copy public template contract passed");
