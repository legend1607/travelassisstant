#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const routeScript = path.resolve(
  scriptDir,
  "../assets/guide-template-europe-public/maps/assets/trip-map-public-route.js",
);

assert.ok(fs.existsSync(routeScript), `missing route policy module: ${routeScript}`);

const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(routeScript, "utf8"), sandbox, { filename: routeScript });

const { hasVerifiedRouteGeometry } = sandbox.TripMapRoute || {};
assert.equal(typeof hasVerifiedRouteGeometry, "function", "route policy must expose hasVerifiedRouteGeometry");

const verifiedDay = {
  routeGeometry: [
    [2.2945, 48.8584],
    [2.2961, 48.8592],
  ],
  routeGeometryMode: "walking",
  routeGeometrySource: "openstreetmap-walking-route-2026-07-21",
  routeGeometryReviewedAt: "2026-07-21",
  routeReview: {
    sequenceRationale: "沿经过复核的步行道路依次前往两个地点。",
    routingMethod: "使用步行路网计算并人工复核入口。",
  },
};

assert.equal(hasVerifiedRouteGeometry(verifiedDay), true, "complete verified route should render");
assert.equal(
  hasVerifiedRouteGeometry({ ...verifiedDay, routeGeometrySource: "规划级示意线" }),
  false,
  "illustrative route source must not render",
);
assert.equal(
  hasVerifiedRouteGeometry({ ...verifiedDay, routeGeometryMode: undefined }),
  false,
  "route without a supported mode must not render",
);
assert.equal(
  hasVerifiedRouteGeometry({ ...verifiedDay, routeReview: undefined }),
  false,
  "route without review evidence must not render",
);
assert.equal(
  hasVerifiedRouteGeometry({ ...verifiedDay, routeGeometry: [[2.2945, 48.8584], [181, 48.8592]] }),
  false,
  "route with invalid coordinates must not render",
);

console.log("core map route policy tests passed");
