#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--pois") {
      args.pois = valueArg(argv, i, item);
      i += 1;
    } else if (item === "--itinerary") {
      args.itinerary = valueArg(argv, i, item);
      i += 1;
    } else if (item === "--sources") {
      args.sources = valueArg(argv, i, item);
      i += 1;
    } else if (item === "--day") {
      args.day = valueArg(argv, i, item);
      i += 1;
    } else if (item === "--strict-routes") args.strictRoutes = true;
    else if (item === "--require-route-evidence") args.requireRouteEvidence = true;
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function valueArg(argv, index, flag) {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("-")) {
    throw new Error(`${flag} needs a value\n${usage()}`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  node validate-trip-data.js --pois data/pois.json --itinerary data/itinerary.json [--sources data/sources.json] [--require-route-evidence] [--strict-routes] [--day day-id]",
  ].join("\n");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse JSON ${filePath}: ${error.message}`);
  }
}

function isValidCoord(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && Number.isFinite(coords[0])
    && Number.isFinite(coords[1])
    && coords[0] >= -90
    && coords[0] <= 90
    && coords[1] >= -180
    && coords[1] <= 180;
}

function isValidRouteCoord(coords) {
  return Array.isArray(coords)
    && coords.length === 2
    && Number.isFinite(coords[0])
    && Number.isFinite(coords[1])
    && coords[0] >= -180
    && coords[0] <= 180
    && coords[1] >= -90
    && coords[1] <= 90;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeHttpUrl(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function fillerPattern(phrases) {
  const escaped = [...phrases]
    .sort((left, right) => right.length - left.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${escaped.join("|")})`, "giu");
}

const valueFillerPattern = fillerPattern([
  "感受当地生活", "体验当地生活", "独特城市生活节奏", "城市生活节奏", "感受这里的当地氛围",
  "感受当地氛围", "当地氛围", "本地氛围", "适合游客", "适合旅行者", "很有特色", "有特色",
  "慢慢体验一下", "慢慢体验", "体验一下", "专门来看看", "专门来逛逛", "来看看", "来逛逛",
  "随便逛逛", "慢慢逛逛", "随便看看", "慢慢看看", "值得一去", "这个地方", "生活节奏",
  "这里", "地方", "感受", "值得", "看看", "逛逛",
  "soak up the local atmosphere", "experience the local atmosphere", "feel the local atmosphere",
  "unique city rhythm", "local atmosphere", "worth a visit", "worth visiting", "good for visitors",
  "suitable for visitors", "take your time", "this place", "very special", "wander around", "look around",
]);

const actionFillerPattern = fillerPattern([
  "感受当地生活", "体验当地生活", "感受这里的当地氛围", "感受当地氛围", "感受氛围", "当地氛围",
  "独特城市生活节奏", "城市生活节奏", "慢慢体验一下", "慢慢体验", "体验一下", "专门来看看",
  "专门来逛逛", "随便看看", "慢慢看看", "随便逛逛", "慢慢逛逛", "来看看", "来逛逛",
  "生活节奏", "这个地方", "看看", "逛逛", "感受", "体验", "慢慢", "一下", "这里", "地方",
  "soak up the atmosphere", "experience the atmosphere", "take it in", "wander around", "look around", "experience",
]);

function substantiveLength(value, pattern) {
  if (!isNonEmptyString(value)) return 0;
  const substantive = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(pattern, "")
    .replace(/[\p{P}\p{S}\s]/gu, "");
  return Array.from(substantive).length;
}

function itineraryDays(itinerary, errors) {
  if (Array.isArray(itinerary)) return itinerary;
  if (itinerary && typeof itinerary === "object" && !Array.isArray(itinerary) && Array.isArray(itinerary.days)) {
    if (itinerary.defaultAssignments != null && !Array.isArray(itinerary.defaultAssignments)) {
      errors.push("itinerary.defaultAssignments must be an array when provided");
    }
    return itinerary.days;
  }
  errors.push("itinerary must be an array or a public-template object with a days array");
  return [];
}

function validateSourceRegistry(sources, errors) {
  const sourceById = new Map();
  if (sources == null) return sourceById;
  if (!Array.isArray(sources)) {
    errors.push("sources must be an array");
    return sourceById;
  }

  sources.forEach((source, index) => {
    const id = isNonEmptyString(source?.id) ? source.id.trim() : null;
    const label = id || `<source ${index}>`;
    if (!id) {
      errors.push(`Source ${label} missing non-empty id`);
      return;
    }
    if (sourceById.has(id)) {
      errors.push(`Duplicate source id: ${id}`);
      return;
    }
    sourceById.set(id, source);

    for (const field of ["title", "type", "role", "language", "checkedAt", "status"]) {
      if (!isNonEmptyString(source[field])) errors.push(`Source ${id} missing ${field}`);
    }
    if (!isSafeHttpUrl(source.url)) errors.push(`Source ${id} requires an HTTP(S) URL`);
    if (!Array.isArray(source.supports)
      || source.supports.length === 0
      || !source.supports.every(isNonEmptyString)) {
      errors.push(`Source ${id} requires non-empty supports`);
    }
  });
  return sourceById;
}

function asPoiId(stop) {
  if (typeof stop === "string") return stop;
  if (stop && typeof stop.poiId === "string") return stop.poiId;
  return null;
}

function isLodgingBasePoi(poi) {
  return poi?.category === "hotel"
    || poi?.category === "lodging"
    || poi?.lodgingRole === "base";
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earth = 6371000;
  const deltaLat = radians(right[0] - left[0]);
  const deltaLng = radians(right[1] - left[1]);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(left[0])) * Math.cos(radians(right[0])) * Math.sin(deltaLng / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function routeGapMessage(strictRoutes, errors, warnings, message) {
  (strictRoutes ? errors : warnings).push(message);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.pois || !args.itinerary) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  if (args.requireRouteEvidence && !args.sources) {
    console.error("--sources is required when --require-route-evidence is enabled");
    process.exit(1);
  }

  const pois = readJson(path.resolve(args.pois));
  const itinerary = readJson(path.resolve(args.itinerary));
  const sources = args.sources ? readJson(path.resolve(args.sources)) : null;
  const errors = [];
  const warnings = [];

  if (!Array.isArray(pois)) errors.push("pois must be an array");
  const days = itineraryDays(itinerary, errors);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  const sourceById = validateSourceRegistry(sources, errors);
  const usesPublicTemplateSchema = !Array.isArray(itinerary);

  const required = usesPublicTemplateSchema
    ? ["name", "category", "coords", "note"]
    : ["id", "name", "name_zh", "category", "coords", "note", "plan", "tip", "source"];
  const allowedPriorities = new Set(["", "must", "preferred", "nearby", "archive", "pending", "booked", "S", "A", "B", "C"]);
  const allowedContentTiers = new Set(["deep", "standard", "compact"]);
  const ids = new Set();
  const identityKeys = new Map();
  const categoryCounts = new Map();
  const cityCounts = new Map();
  const poiById = new Map();
  const poisByName = new Map();

  for (const poi of pois) {
    for (const field of required) {
      if (poi[field] == null || poi[field] === "") {
        errors.push(`POI ${poi.id || poi.name || "<unknown>"} missing ${field}`);
      }
    }
    if (typeof poi.id === "string") {
      if (ids.has(poi.id)) errors.push(`Duplicate POI id: ${poi.id}`);
      ids.add(poi.id);
      poiById.set(poi.id, poi);
    }
    if (isNonEmptyString(poi.name)) {
      const named = poisByName.get(poi.name) || [];
      named.push(poi);
      poisByName.set(poi.name, named);
    }
    if (!isValidCoord(poi.coords)) errors.push(`POI ${poi.id || poi.name} has invalid coords`);
    if (poi.priority != null && !allowedPriorities.has(poi.priority)) {
      errors.push(`POI ${poi.id || poi.name} has invalid priority: ${poi.priority}`);
    }
    if (["S", "A", "B", "C"].includes(poi.priority)) {
      warnings.push(`POI ${poi.id || poi.name} uses legacy priority ${poi.priority}; prefer semantic values must/preferred/nearby/archive`);
    }

    if (poi.contentTier != null) {
      const poiLabel = poi.id || poi.name || "<unknown>";
      if (!allowedContentTiers.has(poi.contentTier)) {
        errors.push(`POI ${poiLabel} has invalid contentTier: ${poi.contentTier}`);
      }

      const sections = poi.detailSections;
      const hasWhy = typeof poi.whyWorthIt === "string" && poi.whyWorthIt.trim().length > 0;
      if (["deep", "standard"].includes(poi.contentTier) && !hasWhy) {
        errors.push(`POI ${poiLabel} ${poi.contentTier} content requires whyWorthIt`);
      }
      if (poi.contentTier === "deep" && (!Array.isArray(sections) || sections.length < 2 || sections.length > 4)) {
        errors.push(`POI ${poiLabel} deep content requires 2-4 detailSections`);
      }
      if (poi.contentTier === "standard" && Array.isArray(sections) && sections.length > 2) {
        errors.push(`POI ${poiLabel} standard content allows at most 2 detailSections`);
      }
      if (poi.contentTier === "compact" && sections != null && (!Array.isArray(sections) || sections.length > 0)) {
        errors.push(`POI ${poiLabel} compact content must omit detailSections`);
      }
      if (sections != null && !Array.isArray(sections)) {
        errors.push(`POI ${poiLabel} detailSections must be an array`);
      }
      if (Array.isArray(sections)) {
        sections.forEach((section, index) => {
          const titleValid = typeof section?.title === "string" && section.title.trim().length > 0;
          if (!titleValid) errors.push(`POI ${poiLabel} detailSections[${index}] missing title`);

          const bodyValid = typeof section?.body === "string" && section.body.trim().length > 0;
          const itemsValid = Array.isArray(section?.items)
            && section.items.length >= 1
            && section.items.length <= 5
            && section.items.every((item) => typeof item === "string" && item.trim().length > 0);
          if (section?.items != null && !itemsValid) {
            errors.push(`POI ${poiLabel} detailSections[${index}] needs body or 1-5 items`);
          } else if (!bodyValid && !itemsValid) {
            errors.push(`POI ${poiLabel} detailSections[${index}] needs body or 1-5 items`);
          }
        });
      }
    }

    const key = [poi.city || "", poi.category || "", poi.name || ""].join(" / ");
    if (identityKeys.has(key)) errors.push(`Duplicate city/category/name: ${key}`);
    identityKeys.set(key, true);

    if (poi.category) categoryCounts.set(poi.category, (categoryCounts.get(poi.category) || 0) + 1);
    if (poi.city) cityCounts.set(poi.city, (cityCounts.get(poi.city) || 0) + 1);
  }

  const selectedItinerary = args.day
    ? days.filter((day) => day.id === args.day)
    : days;
  if (args.day && selectedItinerary.length === 0) errors.push(`Unknown day id: ${args.day}`);

  for (const day of selectedItinerary) {
    const dayLabel = day.id || day.date || day.title || "<unknown day>";
    const anchors = Array.isArray(day.anchors) ? day.anchors : [];
    if (anchors.length > 3) warnings.push(`${dayLabel} has ${anchors.length} anchors; recommended max is 3`);

    const refs = [
      ...anchors,
      ...(Array.isArray(day.candidates) ? day.candidates : []),
      ...(Array.isArray(day.routeStops) ? day.routeStops.map(asPoiId) : []),
    ].filter(Boolean);

    for (const ref of refs) {
      if (!ids.has(ref)) errors.push(`${dayLabel} references missing POI: ${ref}`);
    }

    if (Array.isArray(day.routeStops)) {
      if (args.strictRoutes) {
        const positiveOrders = [];
        const firstIndexByOrder = new Map();
        day.routeStops.forEach((stop, index) => {
          const stopContext = `${dayLabel} route stop ${index}`;
          if (!stop || typeof stop !== "object" || Array.isArray(stop)) {
            errors.push(`${stopContext} must be an object with non-empty poiId and finite integer order`);
            return;
          }
          if (!isNonEmptyString(stop.poiId)) {
            errors.push(`${stopContext} must provide a non-empty poiId`);
            return;
          }
          const poiId = stop.poiId.trim();
          if (typeof stop.order !== "number" || !Number.isFinite(stop.order) || !Number.isInteger(stop.order)) {
            errors.push(`${dayLabel} route stop ${poiId} must provide a finite integer order`);
            return;
          }
          if (stop.order < 0) {
            errors.push(`${dayLabel} route stop ${poiId} has negative order ${stop.order}`);
            return;
          }
          if (stop.order === 0) {
            if (!isLodgingBasePoi(poiById.get(poiId))) {
              errors.push(`${dayLabel} route stop ${poiId} uses order 0; only a lodging base may use order 0`);
            }
            return;
          }
          if (firstIndexByOrder.has(stop.order)) {
            errors.push(`${dayLabel} has duplicate route stop order ${stop.order}`);
          } else {
            firstIndexByOrder.set(stop.order, index);
          }
          positiveOrders.push(stop.order);
        });

        const sortedPositiveOrders = [...positiveOrders].sort((left, right) => left - right);
        const expectedPositiveOrders = sortedPositiveOrders.map((_, index) => index + 1);
        if (sortedPositiveOrders.some((order, index) => order !== expectedPositiveOrders[index])) {
          errors.push(`${dayLabel} positive route stop orders must be unique and contiguous 1..${positiveOrders.length}`);
        }
      }

      const stopIds = day.routeStops.map(asPoiId).filter(Boolean);
      const duplicateStopIds = stopIds.filter((id, index) => stopIds.indexOf(id) !== index);
      if (duplicateStopIds.length) errors.push(`${dayLabel} repeats route stops: ${[...new Set(duplicateStopIds)].join(", ")}`);

      const orders = day.routeStops
        .map((stop) => (typeof stop === "object" ? stop.order : null))
        .filter((order) => order != null);
      const duplicateOrders = orders.filter((order, index) => orders.indexOf(order) !== index);
      if (duplicateOrders.length && !args.strictRoutes) {
        warnings.push(`${dayLabel} has duplicate route stop orders: ${[...new Set(duplicateOrders)].join(", ")}`);
      }

      const segments = Array.isArray(day.transitSegments) ? day.transitSegments : [];
      for (let index = 1; index < stopIds.length; index += 1) {
        const fromPoiId = stopIds[index - 1];
        const toPoiId = stopIds[index];
        const segment = segments.find((item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId);
        if (!segment) {
          routeGapMessage(args.strictRoutes, errors, warnings, `${dayLabel} missing adjacent transit segment: ${fromPoiId} -> ${toPoiId}`);
        } else if (!segment.mode || !segment.label) {
          routeGapMessage(args.strictRoutes, errors, warnings, `${dayLabel} incomplete transit segment: ${fromPoiId} -> ${toPoiId}`);
        }
      }

      for (const segment of segments) {
        if (!ids.has(segment.fromPoiId)) errors.push(`${dayLabel} transit segment references missing POI: ${segment.fromPoiId}`);
        if (!ids.has(segment.toPoiId)) errors.push(`${dayLabel} transit segment references missing POI: ${segment.toPoiId}`);
      }
    }

    if (day.routeGeometry != null) {
      if (!Array.isArray(day.routeGeometry) || day.routeGeometry.length < 2) {
        errors.push(`${dayLabel} routeGeometry must contain at least two [lng, lat] points`);
      } else {
        day.routeGeometry.forEach((point, index) => {
          if (!isValidRouteCoord(point)) errors.push(`${dayLabel} routeGeometry point ${index} is invalid`);
        });
      }
      if (!day.routeGeometrySource) warnings.push(`${dayLabel} routeGeometry is missing routeGeometrySource`);
      if (!day.routeGeometryReviewedAt) warnings.push(`${dayLabel} routeGeometry is missing routeGeometryReviewedAt`);
      if (!day.routeGeometryMode) warnings.push(`${dayLabel} routeGeometry is missing routeGeometryMode`);

      if (args.strictRoutes) {
        if (!day.routeReview?.sequenceRationale || !day.routeReview?.routingMethod) {
          errors.push(`${dayLabel} routeGeometry requires routeReview.sequenceRationale and routeReview.routingMethod`);
        }
        if (/示意|直线|straight|approx/i.test(day.routeGeometrySource || "")) {
          errors.push(`${dayLabel} routeGeometrySource describes an illustrative or approximate line, not a verified route`);
        }

        const routePoints = day.routeGeometry
          .filter(isValidRouteCoord)
          .map(([lng, lat]) => [lat, lng]);
        for (const stop of day.routeStops || []) {
          const poi = pois.find((item) => item.id === asPoiId(stop));
          if (!poi || !routePoints.length) continue;
          const nearest = Math.min(...routePoints.map((point) => haversineMeters(poi.coords, point)));
          if (nearest > 150) errors.push(`${dayLabel} routeGeometry misses route stop ${poi.id} by ${Math.round(nearest)}m`);
        }
      }
    } else if (args.strictRoutes && (day.routeStops || []).length > 1) {
      warnings.push(`${dayLabel} has no verified routeGeometry; the map must not draw a formal route line`);
    }
  }

  if (args.requireRouteEvidence) {
    const scheduled = new Map();
    const allDayIds = new Set(days.map((day) => day.id).filter(isNonEmptyString));
    const selectedDayIds = new Set(selectedItinerary.map((day) => day.id).filter(isNonEmptyString));

    const resolveById = (poiId, context) => {
      const poi = poiById.get(poiId);
      if (!poi) errors.push(`${context} references unknown POI id: ${poiId}`);
      return poi;
    };
    const resolveByName = (name, context) => {
      const matches = poisByName.get(name) || [];
      if (matches.length === 0) {
        errors.push(`${context} has unknown default-assignment name: ${name}`);
        return null;
      }
      if (matches.length > 1) {
        errors.push(`${context} has ambiguous default-assignment name: ${name}; use poiId or make the exact name unique`);
        return null;
      }
      return matches[0];
    };
    const addScheduled = (poi, context) => {
      if (!poi) return;
      const index = pois.indexOf(poi);
      const key = isNonEmptyString(poi.id) ? `id:${poi.id}` : `index:${index}`;
      if (!scheduled.has(key)) scheduled.set(key, { poi, contexts: [] });
      scheduled.get(key).contexts.push(context);
    };
    const isLodgingBase = (poi) => poi?.category === "hotel"
      || poi?.category === "lodging"
      || poi?.lodgingRole === "base";
    const handleOrderedReference = (poi, order, context) => {
      if (!poi) return;
      if (order != null && Number.isFinite(Number(order)) && Number(order) <= 0) {
        if (isLodgingBase(poi)) return;
        errors.push(`${context} uses non-positive order ${order}; only a lodging base may be excluded from formal-route evidence`);
        return;
      }
      addScheduled(poi, context);
    };

    for (const day of selectedItinerary) {
      const dayLabel = day.id || day.date || day.title || "<unknown day>";
      for (const stop of Array.isArray(day.routeStops) ? day.routeStops : []) {
        const poiId = asPoiId(stop);
        const named = stop && typeof stop === "object" && isNonEmptyString(stop.name) ? stop.name : null;
        const referenceLabel = poiId || named || "<unknown route stop>";
        const context = `day ${dayLabel} route stop ${referenceLabel}`;
        let poi = null;
        if (poiId) poi = resolveById(poiId, context);
        else if (named) poi = resolveByName(named, context);
        else errors.push(`${context} must provide poiId or an exact name`);
        const order = stop && typeof stop === "object" ? stop.order : null;
        handleOrderedReference(poi, order, context);
      }
    }

    if (!Array.isArray(itinerary) && Array.isArray(itinerary.defaultAssignments)) {
      for (const assignment of itinerary.defaultAssignments) {
        const dayId = assignment?.dayId;
        const referenceLabel = assignment?.poiId || assignment?.name || "<unknown assignment>";
        const context = `day ${dayId || "<unknown day>"} default assignment ${referenceLabel}`;
        if (!isNonEmptyString(dayId) || !allDayIds.has(dayId)) {
          errors.push(`${context} references unknown dayId`);
          continue;
        }
        if (args.day && !selectedDayIds.has(dayId)) continue;

        let poi = null;
        if (isNonEmptyString(assignment.poiId)) poi = resolveById(assignment.poiId, context);
        else if (isNonEmptyString(assignment.name)) poi = resolveByName(assignment.name, context);
        else errors.push(`${context} must provide poiId or an exact name`);

        if (assignment.order == null || !Number.isFinite(Number(assignment.order))) {
          errors.push(`${context} must provide a numeric order`);
          continue;
        }
        handleOrderedReference(poi, assignment.order, context);
      }
    }

    for (const { poi, contexts } of scheduled.values()) {
      const poiLabel = poi.id || poi.name || "<unknown POI>";
      const context = `${contexts[0]} POI ${poiLabel}`;
      if (poi.contentTier !== "standard" && poi.contentTier !== "deep") {
        errors.push(`${context} requires contentTier standard or deep`);
      }
      if (!isNonEmptyString(poi.whyWorthIt) || poi.whyWorthIt.trim().length < 40) {
        errors.push(`${context} requires concrete whyWorthIt of at least 40 characters`);
      } else if (substantiveLength(poi.whyWorthIt, valueFillerPattern) < 16) {
        errors.push(`${context} whyWorthIt requires at least 16 substantive characters after generic filler normalization`);
      }
      if (!Array.isArray(poi.detailSections) || poi.detailSections.length === 0) {
        errors.push(`${context} requires at least one detailSections entry`);
      }
      const actionableItems = Array.isArray(poi.detailSections)
        ? poi.detailSections.flatMap((section) => Array.isArray(section?.items)
          ? section.items.filter(isNonEmptyString)
          : [])
        : [];
      const meaningfulActionableItems = actionableItems
        .filter((item) => substantiveLength(item, actionFillerPattern) >= 8);
      if (meaningfulActionableItems.length < 2) {
        errors.push(`${context} requires at least 2 meaningful actionable items with at least 8 substantive characters each after generic action filler normalization`);
      }

      if (!Array.isArray(poi.sourceIds)
        || poi.sourceIds.length === 0
        || !poi.sourceIds.every(isNonEmptyString)) {
        errors.push(`${context} requires non-empty sourceIds`);
      } else {
        for (const rawSourceId of poi.sourceIds) {
          const sourceId = rawSourceId.trim();
          if (!sourceById.has(sourceId)) {
            errors.push(`${context} has unknown source id: ${sourceId}`);
          }
        }
      }
    }
  }

  const summary = {
    poiCount: pois.length,
    dayCount: days.length,
    categories: Object.fromEntries([...categoryCounts.entries()].sort()),
    cities: Object.fromEntries([...cityCounts.entries()].sort()),
    warnings,
    errors,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
