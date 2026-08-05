(function installTripMapRoute(root) {
  "use strict";

  const supportedModes = new Set(["walking", "driving", "cycling", "transit", "funicular", "mixed"]);
  const illustrativeSourcePattern = /示意|直线|规划级|approx|illustrative|straight/i;

  function isRouteCoordinate(point) {
    return Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && point[0] >= -180
      && point[0] <= 180
      && point[1] >= -90
      && point[1] <= 90;
  }

  function hasVerifiedRouteGeometry(day) {
    if (!day || !Array.isArray(day.routeGeometry) || day.routeGeometry.length < 2) return false;
    if (!day.routeGeometry.every(isRouteCoordinate)) return false;
    if (!supportedModes.has(day.routeGeometryMode)) return false;

    const source = String(day.routeGeometrySource || "").trim();
    if (!source || illustrativeSourcePattern.test(source)) return false;
    if (!String(day.routeGeometryReviewedAt || "").trim()) return false;

    const review = day.routeReview || {};
    return Boolean(
      String(review.routingMethod || "").trim()
      && String(review.sequenceRationale || "").trim(),
    );
  }

  root.TripMapRoute = Object.freeze({ hasVerifiedRouteGeometry });
})(typeof globalThis !== "undefined" ? globalThis : window);
