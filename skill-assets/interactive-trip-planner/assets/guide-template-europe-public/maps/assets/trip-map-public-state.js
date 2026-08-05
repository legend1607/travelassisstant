(function installTripMapState(root) {
  "use strict";

  const legacyPriorities = { S: "must", A: "preferred", B: "nearby", C: "archive" };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function poiMap(trip) {
    return new Map((trip.pois || []).map((poi) => [poi.id, poi]));
  }

  function dayMap(trip) {
    return new Map((trip.days || []).map((day) => [day.id, day]));
  }

  function normalizePriority(trip, value) {
    const normalized = legacyPriorities[value] || value || "";
    return Object.prototype.hasOwnProperty.call(trip.priorities || {}, normalized) ? normalized : "";
  }

  function normalizeLayers(trip, savedLayers) {
    const requested = savedLayers && typeof savedLayers === "object" ? savedLayers : {};
    const layers = { itinerary: true };
    for (const category of Object.keys(trip.categories || {})) {
      layers[category] = true;
    }
    for (const key of Object.keys(layers)) {
      if (Object.prototype.hasOwnProperty.call(requested, key)) {
        layers[key] = requested[key] !== false;
      }
    }
    return layers;
  }

  function baseAssignments(trip) {
    const assignments = Object.fromEntries((trip.pois || []).map((poi) => [poi.id, ""]));
    const pois = poiMap(trip);
    for (const day of trip.days || []) {
      for (const stop of day.routeStops || []) {
        if (Object.prototype.hasOwnProperty.call(assignments, stop.poiId) && !pois.get(stop.poiId)?.recurring) {
          assignments[stop.poiId] = day.id;
        }
      }
    }
    return assignments;
  }

  function baseOrders(trip, assignments) {
    const pois = poiMap(trip);
    const orders = {};
    for (const day of trip.days || []) {
      const stops = [...(day.routeStops || [])]
        .filter((stop) => pois.has(stop.poiId) && (assignments[stop.poiId] === day.id || pois.get(stop.poiId)?.recurring))
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      orders[day.id] = stops.map((stop) => stop.poiId);
    }
    return orders;
  }

  function normalizeOrders(trip, savedOrders, assignments) {
    const pois = poiMap(trip);
    const orders = baseOrders(trip, assignments);
    for (const day of trip.days || []) {
      const requested = Array.isArray(savedOrders?.[day.id]) ? savedOrders[day.id] : orders[day.id];
      const routeStopIds = new Set((day.routeStops || []).map((stop) => stop.poiId));
      const valid = requested.filter(
        (poiId, index) =>
          pois.has(poiId) &&
          (assignments[poiId] === day.id || (pois.get(poiId)?.recurring && routeStopIds.has(poiId))) &&
          requested.indexOf(poiId) === index,
      );
      for (const poi of trip.pois || []) {
        if (assignments[poi.id] === day.id && !valid.includes(poi.id)) valid.push(poi.id);
      }
      orders[day.id] = valid;
    }
    return orders;
  }

  function normalizeSnapshot(trip, saved) {
    if (!saved || typeof saved !== "object") return null;
    const normalized = normalizeState(trip, saved, false);
    normalized.undoSnapshot = null;
    return normalized;
  }

  function normalizeState(trip, saved, includeUndo) {
    const source = saved && typeof saved === "object" ? saved : {};
    const pois = poiMap(trip);
    const days = dayMap(trip);
    const defaults = baseAssignments(trip);
    const assignments = {};
    const priorities = {};

    for (const poi of trip.pois || []) {
      const requestedDay = source.assignments?.[poi.id];
      assignments[poi.id] = poi.recurring
        ? ""
        : (requestedDay === "" || days.has(requestedDay) ? requestedDay : defaults[poi.id]);
      priorities[poi.id] = normalizePriority(
        trip,
        source.priorities?.[poi.id] ?? poi.priority,
      );
    }

    const activeDayId = days.has(source.view?.activeDayId) ? source.view.activeDayId : "";
    const selectedPoiId = pois.has(source.view?.selectedPoiId) ? source.view.selectedPoiId : "";
    const savedMap = source.view?.map;
    const map = savedMap
      && Number.isFinite(Number(savedMap.lat))
      && Number.isFinite(Number(savedMap.lng))
      && Number.isFinite(Number(savedMap.zoom))
      ? { lat: Number(savedMap.lat), lng: Number(savedMap.lng), zoom: Number(savedMap.zoom) }
      : null;
    const filters = source.view?.filters && typeof source.view.filters === "object"
      ? source.view.filters
      : {};
    const dirtyDays = {};
    for (const [dayId, dirty] of Object.entries(source.dirtyDays || {})) {
      if (days.has(dayId) && dirty) dirtyDays[dayId] = true;
    }
    const changes = (Array.isArray(source.changes) ? source.changes : []).filter(
      (change) => pois.has(change.poiId),
    );

    return {
      version: 1,
      view: {
        activeDayId,
        selectedPoiId,
        map,
        layers: normalizeLayers(trip, source.view?.layers),
        filters: {
          search: String(filters.search || ""),
          city: String(filters.city || ""),
          category: String(filters.category || ""),
          priority: normalizePriority(trip, filters.priority),
          plan: String(filters.plan || ""),
        },
      },
      priorities,
      assignments,
      orders: normalizeOrders(trip, source.orders, assignments),
      dirtyDays,
      changes: clone(changes),
      undoSnapshot: includeUndo ? normalizeSnapshot(trip, source.undoSnapshot) : null,
    };
  }

  function createState(trip, saved) {
    return normalizeState(trip, saved, true);
  }

  function assignedDayId(state, poiId) {
    return state.assignments?.[poiId] || "";
  }

  function activeNonHotelCount(trip, state, dayId) {
    const pois = poiMap(trip);
    const routeStopIds = new Set((dayMap(trip).get(dayId)?.routeStops || []).map((stop) => stop.poiId));
    return (state.orders?.[dayId] || []).filter((poiId) => {
      const poi = pois.get(poiId);
      return poi?.category !== "hotel"
        && (state.assignments?.[poiId] === dayId || (poi?.recurring && routeStopIds.has(poiId)));
    }).length;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function planAction(trip, rawState, action) {
    const state = createState(trip, rawState);
    const pois = poiMap(trip);
    const days = dayMap(trip);
    const poi = pois.get(action?.poiId);
    if (!poi) throw new Error("找不到要修改的地点");

    const fromDayId = assignedDayId(state, poi.id);
    const toDayId = action.type === "remove-day" ? "" : (action.dayId || fromDayId);
    const fromDay = days.get(fromDayId);
    const toDay = days.get(toDayId);
    const currentPriority = state.priorities[poi.id];
    const reasons = [];

    if (poi.category === "hotel") reasons.push("这个地点是住宿锚点，会影响每天的出发和回程");
    if (poi.fixedTime === true) reasons.push("这个地点有固定时间");
    if (currentPriority === "must") reasons.push("这个地点当前标记为必去");
    if (currentPriority === "booked") reasons.push("这个地点已经预约");
    if (fromDay && toDay && fromDay.city !== toDay.city) {
      reasons.push("新日期属于另一座城市");
    }
    if (!fromDay && toDay && poi.city && toDay.city && poi.city !== toDay.city) {
      reasons.push("这个地点与所选日期不在同一座城市");
    }
    if (toDay && fromDayId !== toDayId) {
      const count = activeNonHotelCount(trip, state, toDayId);
      const capacity = Number(toDay.capacity || 6);
      if (poi.category !== "hotel" && count >= capacity) {
        reasons.push(`这一天已经安排 ${count} 个主要地点`);
      }
    }

    return {
      requiresConfirmation: reasons.length > 0,
      reasons: unique(reasons),
      affectedDayIds: unique([fromDayId, toDayId]),
      fromDayId,
      toDayId,
    };
  }

  function snapshotForUndo(state) {
    return clone({
      version: state.version,
      view: state.view,
      priorities: state.priorities,
      assignments: state.assignments,
      orders: state.orders,
      dirtyDays: state.dirtyDays,
      changes: state.changes,
      undoSnapshot: null,
    });
  }

  function removeFromOrders(orders, poiId) {
    for (const dayId of Object.keys(orders)) {
      orders[dayId] = orders[dayId].filter((id) => id !== poiId);
    }
  }

  function insertIntoDay(trip, orders, poiId, dayId) {
    const poi = poiMap(trip).get(poiId);
    orders[dayId] ||= [];
    removeFromOrders(orders, poiId);
    if (poi?.category === "hotel") orders[dayId].unshift(poiId);
    else orders[dayId].push(poiId);
  }

  function dayLabel(trip, dayId) {
    const day = dayMap(trip).get(dayId);
    return day ? `${day.date}《${day.title || day.city}》` : "未安排日期";
  }

  function priorityLabel(trip, value) {
    return trip.priorities?.[value] || "未标记";
  }

  function changeSummary(trip, state, action, plan) {
    const poi = poiMap(trip).get(action.poiId);
    const name = poi.name_zh || poi.name;
    if (action.type === "set-priority") {
      return `${name}从“${priorityLabel(trip, state.priorities[poi.id])}”改成“${priorityLabel(trip, action.priority)}”`;
    }
    if (action.type === "assign-day") return `把${name}加入${dayLabel(trip, plan.toDayId)}`;
    if (action.type === "move-day") {
      return `把${name}从${dayLabel(trip, plan.fromDayId)}移到${dayLabel(trip, plan.toDayId)}`;
    }
    if (action.type === "remove-day") return `从${dayLabel(trip, plan.fromDayId)}移出${name}`;
    if (action.type === "move-order") {
      return `${name}在${dayLabel(trip, plan.fromDayId)}调整了游览顺序`;
    }
    throw new Error("不支持的行程修改");
  }

  function isNoop(state, action) {
    if (action.type === "set-priority") return state.priorities[action.poiId] === action.priority;
    if (action.type === "assign-day" || action.type === "move-day") {
      return state.assignments[action.poiId] === action.dayId;
    }
    if (action.type === "remove-day") return !state.assignments[action.poiId];
    return false;
  }

  function commitAction(trip, rawState, action) {
    const state = createState(trip, rawState);
    if (isNoop(state, action)) return state;
    const plan = planAction(trip, state, action);
    const next = clone(state);
    next.undoSnapshot = snapshotForUndo(state);

    if (action.type === "set-priority") {
      next.priorities[action.poiId] = normalizePriority(trip, action.priority);
    } else if (action.type === "assign-day" || action.type === "move-day") {
      if (!dayMap(trip).has(action.dayId)) throw new Error("找不到要加入的日期");
      next.assignments[action.poiId] = action.dayId;
      insertIntoDay(trip, next.orders, action.poiId, action.dayId);
    } else if (action.type === "remove-day") {
      next.assignments[action.poiId] = "";
      removeFromOrders(next.orders, action.poiId);
    } else if (action.type === "move-order") {
      const dayId = next.assignments[action.poiId];
      const order = next.orders[dayId] || [];
      const currentIndex = order.indexOf(action.poiId);
      if (currentIndex >= 0) {
        const requestedIndex = Number.isInteger(action.toIndex)
          ? action.toIndex
          : currentIndex + Number(action.direction || 0);
        const targetIndex = Math.max(0, Math.min(order.length - 1, requestedIndex));
        const hotelCount = order.filter((poiId) => poiMap(trip).get(poiId)?.category === "hotel").length;
        const boundedIndex = poiMap(trip).get(action.poiId)?.category === "hotel"
          ? 0
          : Math.max(hotelCount, targetIndex);
        order.splice(currentIndex, 1);
        order.splice(boundedIndex, 0, action.poiId);
      }
    } else {
      throw new Error("不支持的行程修改");
    }

    for (const dayId of plan.affectedDayIds) next.dirtyDays[dayId] = true;
    next.changes.push({
      id: `change-${next.changes.length + 1}`,
      type: action.type,
      poiId: action.poiId,
      fromDayId: plan.fromDayId,
      toDayId: plan.toDayId,
      fromPriority: state.priorities[action.poiId],
      toPriority: next.priorities[action.poiId],
      affectedDayIds: plan.affectedDayIds,
      summary: changeSummary(trip, state, action, plan),
    });
    return next;
  }

  function undoLastAction(rawState) {
    if (!rawState?.undoSnapshot) return rawState;
    const restored = clone(rawState.undoSnapshot);
    restored.undoSnapshot = null;
    return restored;
  }

  function hasPendingChanges(state) {
    return Array.isArray(state?.changes) && state.changes.length > 0;
  }

  function buildReplanPrompt(trip, state) {
    if (!hasPendingChanges(state)) {
      return `${trip.title || "这趟旅行"}目前没有需要重新安排的修改。`;
    }
    const days = dayMap(trip);
    const affected = unique(
      state.changes.flatMap((change) => change.affectedDayIds || []),
    ).map((dayId) => days.get(dayId)).filter(Boolean);
    const dayText = affected.map((day) => `${day.date}《${day.title || day.city}》`).join("、");
    const changes = state.changes.map((change, index) => `${index + 1}. ${change.summary}`).join("\n");
    return `请重新安排《${trip.title || "这趟旅行"}》的行程。\n\n我在地图中做了这些修改：\n${changes}\n\n受影响日期：${dayText || "请根据修改判断"}。\n\n请重新检查营业时间、预约、交通、酒店出发与回程、用餐、体力和当天容量，并更新正式路线。不要把地点坐标直接连线当成道路路线。`;
  }

  root.TripMapState = {
    createState,
    planAction,
    commitAction,
    undoLastAction,
    buildReplanPrompt,
    hasPendingChanges,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
