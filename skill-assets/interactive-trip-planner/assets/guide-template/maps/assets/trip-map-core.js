(function installTripMapCore(root) {
  "use strict";

  function calculateEdgeAutoScrollVelocity(pointerY, top, bottom, threshold = 48, maxSpeed = 14) {
    if (pointerY < top + threshold) {
      return -Math.min(maxSpeed, Math.max(0, ((top + threshold - pointerY) / threshold) * maxSpeed));
    }
    if (pointerY > bottom - threshold) {
      return Math.min(maxSpeed, Math.max(0, ((pointerY - (bottom - threshold)) / threshold) * maxSpeed));
    }
    return 0;
  }

  function mount({ root: appRoot, trip }) {
    if (!appRoot) throw new Error("找不到旅行地图容器");
    if (!trip || !Array.isArray(trip.pois) || !Array.isArray(trip.days)) {
      throw new Error("旅行地图缺少地点或每日路线数据");
    }
    if (!root.L || !root.TripMapState) throw new Error("旅行地图基础资源没有加载完成");

    const $ = (selector) => appRoot.querySelector(selector) || document.querySelector(selector);
    const storageKey = `trip-map-core:${trip.slug || "guide"}`;
    const pois = new Map(trip.pois.map((poi) => [poi.id, poi]));
    const days = new Map(trip.days.map((day) => [day.id, day]));
    const categoryLabels = trip.categories || {};
    const priorityLabels = trip.priorities || {};
    const categoryGlyphs = { hotel: "宿", art: "艺", sight: "景", food: "餐", show: "演" };
    let state = root.TripMapState.createState(trip, loadSavedState());
    let map;
    let markerLayer;
    let routeLayer;
    let markerByPoi = new Map();
    let pendingAction = null;
    let shouldFitMap = true;
    const PLACE_SORT_HOLD_MS = 160;
    const PLACE_SORT_EDGE_PX = 48;
    const PLACE_SORT_MAX_SCROLL_PX = 14;
    const placeDropIndicator = document.createElement("div");
    placeDropIndicator.className = "place-drop-indicator";
    placeDropIndicator.setAttribute("aria-hidden", "true");
    let placePointerSort = null;
    let placeSortAutoScrollFrame = 0;

    applyHashState();
    initializeMap();
    renderFilters();
    bindEvents();
    renderAll();

    function loadSavedState() {
      try {
        return JSON.parse(root.localStorage.getItem(storageKey) || "{}");
      } catch (_error) {
        return {};
      }
    }

    function persistState() {
      try {
        root.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (_error) {
        // The map remains usable when browser storage is unavailable.
      }
      const params = new URLSearchParams();
      if (state.view.activeDayId) params.set("day", state.view.activeDayId);
      if (state.view.selectedPoiId) params.set("place", state.view.selectedPoiId);
      const nextHash = params.toString();
      root.history.replaceState(null, "", `${root.location.pathname}${root.location.search}${nextHash ? `#${nextHash}` : ""}`);
    }

    function applyHashState() {
      const params = new URLSearchParams(root.location.hash.replace(/^#/, ""));
      const dayId = params.get("day");
      const poiId = params.get("place");
      if (days.has(dayId)) state.view.activeDayId = dayId;
      if (pois.has(poiId)) state.view.selectedPoiId = poiId;
    }

    function initializeMap() {
      map = root.L.map($("#map"), { zoomControl: true, attributionControl: true }).setView(
        trip.map?.center || [48.8588, 2.3295],
        Number(trip.map?.zoom || 13),
      );
      root.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      markerLayer = root.L.layerGroup().addTo(map);
      routeLayer = root.L.layerGroup().addTo(map);
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]);
    }

    function shortDate(date) {
      const parts = String(date || "").split("-");
      return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date;
    }

    function assignedDayId(poiId) {
      return state.assignments[poiId] || "";
    }

    function assignedLabel(poiId) {
      const dayId = assignedDayId(poiId);
      if (!dayId) return "尚未安排行程";
      const day = days.get(dayId);
      return day ? `${shortDate(day.date)} 已安排` : "尚未安排行程";
    }

    function priorityLabel(poiId) {
      return priorityLabels[state.priorities[poiId]] || "未标记";
    }

    function categoryLabel(poi) {
      return categoryLabels[poi.category] || poi.category;
    }

    function nonHotelOrder(dayId, poiId) {
      const ordered = (state.orders[dayId] || []).filter((id) => pois.get(id)?.category !== "hotel");
      const index = ordered.indexOf(poiId);
      return index >= 0 ? index + 1 : "";
    }

    function routeStop(day, poiId) {
      return (day.routeStops || []).find((stop) => stop.poiId === poiId);
    }

    function filters() {
      return state.view.filters;
    }

    function filteredPois() {
      const activeDayId = state.view.activeDayId;
      const day = days.get(activeDayId);
      const query = filters().search.trim().toLowerCase();
      return trip.pois.filter((poi) => {
        const haystack = [poi.name, poi.name_zh, poi.city, poi.area, categoryLabel(poi), poi.note, poi.plan]
          .join(" ")
          .toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (filters().city && poi.city !== filters().city) return false;
        if (filters().category && poi.category !== filters().category) return false;
        if (filters().priority && state.priorities[poi.id] !== filters().priority) return false;
        if (filters().plan === "scheduled" && assignedDayId(poi.id) !== activeDayId) return false;
        if (filters().plan === "candidate" && !(day?.candidates || []).includes(poi.id)) return false;
        if (filters().plan === "unassigned" && assignedDayId(poi.id)) return false;
        if (filters().plan === "other-day" && (!assignedDayId(poi.id) || assignedDayId(poi.id) === activeDayId)) return false;
        return true;
      });
    }

    function renderAll(options = {}) {
      shouldFitMap = options.preserveMapView ? false : shouldFitMap;
      const inDay = Boolean(state.view.activeDayId);
      $("#trip-overview").hidden = inDay;
      $("#detail-browse").hidden = !inDay;
      renderOverview();
      renderDayRail();
      renderDayPlaceList(state.view.activeDayId);
      renderPoiDetail(state.view.selectedPoiId);
      renderFilters();
      renderChangeSummary();
      renderMapLayers();
      persistState();
    }

    function renderOverview() {
      $("#trip-title").textContent = trip.title;
      $("#trip-summary").textContent = trip.summary;
      $("#trip-day-count").textContent = trip.days.length;
      $("#trip-place-count").textContent = trip.pois.length;
      $("#trip-city-count").textContent = new Set(trip.pois.map((poi) => poi.city)).size;
      $("#day-list").innerHTML = trip.days.map((day) => {
        const anchorNames = (day.anchors || [])
          .map((poiId) => pois.get(poiId)?.name_zh || pois.get(poiId)?.name)
          .filter(Boolean)
          .join(" / ");
        return `<button class="day-card" type="button" data-open-day="${escapeHtml(day.id)}">
          <span class="day-meta">${escapeHtml(day.date)} · ${escapeHtml(day.city)}</span>
          <span class="day-title">${escapeHtml(day.title)}</span>
          <span class="day-summary">${escapeHtml(day.summary)}</span>
          <span class="day-anchors">主锚点：${escapeHtml(anchorNames || "按当天情况决定")}</span>
        </button>`;
      }).join("");
      renderQuickList();
    }

    function renderQuickList() {
      const visible = filteredPois();
      $("#quick-count").textContent = `${visible.length} / ${trip.pois.length} 个地点`;
      $("#quick-list").innerHTML = visible.map((poi) => `
        <button class="quick-place ${state.view.selectedPoiId === poi.id ? "is-selected" : ""}" type="button" data-open-place="${escapeHtml(poi.id)}">
          <span class="place-meta">${escapeHtml(poi.city)} · ${escapeHtml(poi.area)}</span>
          <span class="place-name">${escapeHtml(poi.name_zh || poi.name)}</span>
          <span class="place-tags">
            <span class="tag">${escapeHtml(categoryLabel(poi))}</span>
            <span class="tag accent">${escapeHtml(priorityLabel(poi.id))}</span>
            <span class="tag">${escapeHtml(assignedLabel(poi.id))}</span>
          </span>
        </button>`).join("") || '<div class="empty-state">没有符合当前筛选的地点。</div>';
    }

    function selectDay(dayId, options = {}) {
      if (!days.has(dayId)) return;
      state.view.activeDayId = dayId;
      if (!options.keepPlace) state.view.selectedPoiId = "";
      shouldFitMap = !options.preserveMapView;
      renderAll({ preserveMapView: options.preserveMapView });
    }

    function openPoiDetail(poiId, options = {}) {
      const poi = pois.get(poiId);
      if (!poi) return;
      if (!state.view.activeDayId) {
        const targetDay = assignedDayId(poiId)
          || trip.days.find((day) => (day.candidates || []).includes(poiId))?.id
          || trip.days[0]?.id;
        state.view.activeDayId = targetDay || "";
      }
      state.view.selectedPoiId = poiId;
      shouldFitMap = false;
      renderAll({ preserveMapView: true });
      markerByPoi.get(poiId)?.openTooltip();
      if (options.pan !== false) map.panTo(poi.coords, { animate: false });
      if (root.innerWidth <= 820) $("#poi-detail").scrollIntoView({ block: "start" });
    }

    function returnToOverview() {
      state.view.activeDayId = "";
      state.view.selectedPoiId = "";
      shouldFitMap = true;
      renderAll();
    }

    function renderDayRail() {
      const rail = $("#day-rail");
      if (!state.view.activeDayId) {
        rail.innerHTML = "";
        return;
      }
      rail.innerHTML = `<button class="day-pill" type="button" data-return-overview><strong>全程</strong><span>返回总览</span></button>${trip.days.map((day) => `
        <button class="day-pill ${state.view.activeDayId === day.id ? "is-active" : ""}" type="button" data-select-day="${escapeHtml(day.id)}">
          <strong>${escapeHtml(shortDate(day.date))}</strong>
          <span>${escapeHtml(day.city)}</span>
        </button>`).join("")}`;
    }

    function transitLabel(day, fromPoiId, toPoiId) {
      if (state.dirtyDays[day.id]) return "顺序或安排已调整，交通待复核";
      const segment = (day.transitSegments || []).find(
        (item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId,
      );
      if (segment) return segment.label || `${segment.mode || "移动"}约 ${segment.minutes} 分钟`;
      const from = pois.get(fromPoiId);
      const to = pois.get(toPoiId);
      if (!from || !to) return "";
      const distance = haversineKm(from.coords, to.coords) * 1.25;
      return `规划估算约 ${distance.toFixed(1)} 公里，出发前请用地图复核`;
    }

    function haversineKm(left, right) {
      const radians = (degrees) => degrees * Math.PI / 180;
      const earth = 6371;
      const deltaLat = radians(right[0] - left[0]);
      const deltaLng = radians(right[1] - left[1]);
      const value = Math.sin(deltaLat / 2) ** 2
        + Math.cos(radians(left[0])) * Math.cos(radians(right[0])) * Math.sin(deltaLng / 2) ** 2;
      return earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    }

    function renderDayPlaceList(dayId) {
      const container = $("#day-place-list");
      const day = days.get(dayId);
      if (!day) {
        container.innerHTML = "";
        return;
      }
      const ordered = (state.orders[dayId] || []).filter((poiId) => state.assignments[poiId] === dayId);
      const rows = ordered.map((poiId, index) => {
        const poi = pois.get(poiId);
        if (!poi) return "";
        const order = poi.category === "hotel" ? "宿" : nonHotelOrder(dayId, poiId);
        const transit = index > 0 ? transitLabel(day, ordered[index - 1], poiId) : "";
        const canMove = poi.category !== "hotel";
        return `<div class="place-row-wrap" ${canMove ? `data-sortable-place="${escapeHtml(poiId)}"` : ""}>
          ${transit ? `<div class="place-transit">${escapeHtml(transit)}</div>` : ""}
          <div class="place-row ${state.view.selectedPoiId === poiId ? "is-selected" : ""}">
            ${canMove
              ? `<button class="place-drag-handle" type="button" data-drag-place="${escapeHtml(poiId)}" aria-label="长按并拖动${escapeHtml(poi.name_zh || poi.name)}调整顺序" title="拖动调整顺序"><span aria-hidden="true">⠿</span></button>`
              : '<span class="place-drag-spacer" aria-hidden="true"></span>'}
            <button class="place-main" type="button" data-open-place="${escapeHtml(poiId)}">
              <span class="place-order ${poi.category === "hotel" ? "hotel" : ""}">${escapeHtml(order)}</span>
              <span><span class="place-name">${escapeHtml(poi.name_zh || poi.name)}</span><span class="place-meta">${escapeHtml(routeStop(day, poiId)?.time || "时间待定")} · ${escapeHtml(categoryLabel(poi))}</span></span>
            </button>
            <span class="place-actions">
              <button type="button" title="上移" aria-label="上移${escapeHtml(poi.name_zh || poi.name)}" data-move-order="-1" data-poi-id="${escapeHtml(poiId)}" ${canMove ? "" : "disabled"}>↑</button>
              <button type="button" title="下移" aria-label="下移${escapeHtml(poi.name_zh || poi.name)}" data-move-order="1" data-poi-id="${escapeHtml(poiId)}" ${canMove ? "" : "disabled"}>↓</button>
            </span>
          </div>
        </div>`;
      }).join("");
      const candidates = trip.pois.filter((poi) =>
        (day.candidates || []).includes(poi.id) && state.assignments[poi.id] !== dayId,
      );
      container.innerHTML = `<section class="day-context">
          <div class="day-meta">${escapeHtml(day.date)} · ${escapeHtml(day.city)}</div>
          <h2>${escapeHtml(day.title)}</h2>
          <p>${escapeHtml(day.summary)}</p>
          ${state.dirtyDays[day.id] ? '<div class="route-status">顺序或安排已调整，交通待复核。地图保留原正式路线作为参考，不会自动连接新增地点。</div>' : ""}
        </section>
        <section class="section-block"><div class="section-heading-row"><h3 class="section-title">当天安排</h3><span class="muted">${ordered.filter((id) => pois.get(id)?.category !== "hotel").length} / ${Number(day.capacity || 6)} 个主要地点</span></div><div class="place-list">${rows || '<div class="empty-state">这一天还没有安排地点。</div>'}</div></section>
        <section class="section-block"><h3 class="section-title">顺路候选</h3><div class="quick-list">${candidates.map((poi) => `<button class="quick-place" type="button" data-open-place="${escapeHtml(poi.id)}"><span class="place-name">${escapeHtml(poi.name_zh || poi.name)}</span><span class="place-meta">${escapeHtml(poi.area)} · ${escapeHtml(priorityLabel(poi.id))}</span></button>`).join("") || '<div class="empty-state">当前没有额外候选。</div>'}</div></section>`;
    }

    function renderPoiDetail(poiId) {
      const container = $("#poi-detail");
      const poi = pois.get(poiId);
      if (!poi) {
        container.innerHTML = '<div class="empty-state">选择当天地点、候选地点或地图标记，查看完整说明。</div>';
        return;
      }
      const assignmentButtons = trip.days.map((day) => {
        const current = assignedDayId(poi.id);
        if (current === day.id) return `<button type="button" class="is-active" disabled>${escapeHtml(shortDate(day.date))} 已安排</button>`;
        const action = current ? "move-day" : "assign-day";
        return `<button type="button" data-action="${action}" data-poi-id="${escapeHtml(poi.id)}" data-day-id="${escapeHtml(day.id)}">${current ? "移到" : "加入"}${escapeHtml(shortDate(day.date))}</button>`;
      }).join("");
      const currentDayId = assignedDayId(poi.id);
      container.innerHTML = `<div class="detail-heading-row">
          <div><div class="detail-meta">${escapeHtml(poi.city)} · ${escapeHtml(poi.area)} · ${escapeHtml(categoryLabel(poi))}</div><h2 class="detail-title">${escapeHtml(poi.name_zh || poi.name)}</h2><div class="detail-original-name">${escapeHtml(poi.name)}</div></div>
          <button class="icon-button" type="button" aria-label="关闭地点详情" title="关闭地点详情" data-close-detail>×</button>
        </div>
        <div class="place-tags"><span class="tag accent">${escapeHtml(priorityLabel(poi.id))}</span><span class="tag">${escapeHtml(assignedLabel(poi.id))}</span>${state.dirtyDays[currentDayId] ? '<span class="tag warning">路线待调整</span>' : ""}</div>
        <div class="detail-sections">
          <section class="detail-section"><h3>为什么去</h3><p>${escapeHtml(poi.note)}</p></section>
          <section class="detail-section"><h3>怎么安排</h3><p>${escapeHtml(poi.plan)}</p></section>
          <section class="detail-section"><h3>注意事项</h3><p>${escapeHtml(poi.tip)}</p></section>
        </div>
        <div class="detail-actions">
          <a href="${escapeHtml(poi.officialUrl || `https://www.google.com/search?q=${encodeURIComponent(`${poi.name} official`)}`)}" target="_blank" rel="noreferrer">官网/预约</a>
          <a href="${escapeHtml(poi.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.name} ${poi.city}`)}`)}" target="_blank" rel="noreferrer">Google Maps 地图</a>
          <a href="${escapeHtml(poi.experienceUrl || `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(poi.name_zh || poi.name)}`)}" target="_blank" rel="noreferrer">体验线索</a>
        </div>
        <section class="section-block"><h3 class="section-title">优先级</h3><div class="priority-controls">${Object.entries(priorityLabels).map(([value, label]) => `<button type="button" class="${state.priorities[poi.id] === value ? "is-active" : ""}" data-action="set-priority" data-poi-id="${escapeHtml(poi.id)}" data-priority="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join("")}</div></section>
        <section class="section-block"><h3 class="section-title">安排日期</h3><div class="assignment-controls">${assignmentButtons}${currentDayId ? `<button type="button" class="warning" data-action="remove-day" data-poi-id="${escapeHtml(poi.id)}">移出行程</button>` : ""}</div></section>`;
    }

    function renderFilters() {
      const city = $("#filter-city");
      const category = $("#filter-category");
      const priority = $("#filter-priority");
      const plan = $("#filter-plan");
      if (!city.dataset.ready) {
        city.innerHTML = '<option value="">全部城市/区域</option>' + [...new Set(trip.pois.map((poi) => poi.city))].map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
        category.innerHTML = '<option value="">全部类别</option>' + Object.entries(categoryLabels).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
        priority.innerHTML = '<option value="">全部优先级</option>' + Object.entries(priorityLabels).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
        plan.innerHTML = '<option value="">全部地点</option><option value="scheduled">当天已安排</option><option value="candidate">当天候选</option><option value="unassigned">尚未安排行程</option><option value="other-day">其他日期</option>';
        city.dataset.ready = "true";
      }
      $("#quick-search").value = filters().search;
      city.value = filters().city;
      category.value = filters().category;
      priority.value = filters().priority;
      plan.value = filters().plan;
      renderQuickList();
    }

    function renderChangeSummary() {
      const container = $("#change-summary");
      const hasChanges = root.TripMapState.hasPendingChanges(state);
      container.hidden = !hasChanges;
      $("#undo-change").disabled = !state.undoSnapshot;
      if (!hasChanges) return;
      const affected = Object.keys(state.dirtyDays).map((dayId) => days.get(dayId)?.date).filter(Boolean);
      $("#change-summary-text").textContent = `你有 ${state.changes.length} 项修改，影响 ${affected.join("、") || "待判断日期"}。正式路线尚未重排。`;
    }

    function renderMapLayers() {
      markerLayer.clearLayers();
      routeLayer.clearLayers();
      markerByPoi = new Map();
      const activeDayId = state.view.activeDayId;
      const visiblePois = filteredPois();
      const visibleIds = new Set(visiblePois.map((poi) => poi.id));
      const bounds = [];

      for (const day of trip.days) {
        if (!Array.isArray(day.routeGeometry) || day.routeGeometry.length < 2) continue;
        const active = !activeDayId || day.id === activeDayId;
        const dirty = Boolean(state.dirtyDays[day.id]);
        const latLngs = day.routeGeometry.map(([lng, lat]) => [lat, lng]);
        root.L.polyline(latLngs, {
          color: active ? "#176b61" : "#98a2b3",
          weight: active ? 4 : 2,
          opacity: dirty ? 0.36 : (active ? 0.88 : 0.32),
          dashArray: dirty ? "8 8" : null,
          interactive: false,
        }).addTo(routeLayer);
        if (active) bounds.push(...latLngs);
      }

      for (const poi of visiblePois) {
        const assignment = assignedDayId(poi.id);
        const isOther = Boolean(activeDayId && assignment && assignment !== activeDayId);
        const isUnassigned = !assignment;
        const isSelected = state.view.selectedPoiId === poi.id;
        const dirty = Boolean(assignment && state.dirtyDays[assignment]);
        const order = activeDayId && assignment === activeDayId ? nonHotelOrder(activeDayId, poi.id) : "";
        const glyph = poi.category === "hotel" ? "宿" : (order || categoryGlyphs[poi.category] || "点");
        const classNames = ["trip-marker", isOther && "is-other", isUnassigned && "is-unassigned", isSelected && "is-selected", dirty && "is-dirty"].filter(Boolean).join(" ");
        const icon = root.L.divIcon({
          className: "",
          html: `<span class="${classNames}">${escapeHtml(glyph)}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = root.L.marker(poi.coords, { icon, keyboard: true, title: poi.name_zh || poi.name })
          .bindTooltip(escapeHtml(poi.name_zh || poi.name), { direction: "top", offset: [0, -16] })
          .on("click", () => openPoiDetail(poi.id, { pan: false }))
          .addTo(markerLayer);
        markerByPoi.set(poi.id, marker);
        if (!activeDayId || assignment === activeDayId || isUnassigned) bounds.push(poi.coords);
      }

      const mapNote = $("#map-note");
      if (activeDayId && state.dirtyDays[activeDayId]) {
        mapNote.textContent = "这一天的路线需要重新安排。虚线是原正式路线，新增地点不会自动连线。";
      } else if (activeDayId) {
        mapNote.textContent = "当前显示当天正式路线；浅色地点属于其他日期，空心地点尚未安排。";
      } else {
        mapNote.textContent = "选择每日路线进入当天安排；也可以直接点击地图地点查看详情。";
      }
      if (shouldFitMap && bounds.length) {
        map.fitBounds(bounds, { padding: [38, 38], maxZoom: 14, animate: false });
        shouldFitMap = false;
      }
      window.setTimeout(() => map.invalidateSize(false), 0);
    }

    function requestAction(action) {
      const plan = root.TripMapState.planAction(trip, state, action);
      if (plan.requiresConfirmation) {
        pendingAction = action;
        openImpactDialog(plan);
        return;
      }
      commitAndRender(action);
    }

    function commitAndRender(action) {
      state = root.TripMapState.commitAction(trip, state, action);
      persistState();
      closeImpactDialog();
      renderAll({ preserveMapView: true });
    }

    function openImpactDialog(plan) {
      $("#impact-reasons").innerHTML = plan.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
      $("#impact-dialog").hidden = false;
      $("#confirm-impact").focus();
    }

    function closeImpactDialog() {
      $("#impact-dialog").hidden = true;
      pendingAction = null;
    }

    function openReplanDialog() {
      $("#replan-text").value = root.TripMapState.buildReplanPrompt(trip, state);
      $("#copy-feedback").textContent = "";
      $("#replan-dialog").hidden = false;
      $("#copy-replan").focus();
    }

    function closeReplanDialog() {
      $("#replan-dialog").hidden = true;
    }

    async function copyReplanPrompt() {
      const textarea = $("#replan-text");
      const feedback = $("#copy-feedback");
      feedback.textContent = "正在复制…";
      try {
        await navigator.clipboard.writeText(textarea.value);
        feedback.textContent = "已复制，可以直接粘贴给 Codex。";
      } catch (_error) {
        textarea.focus();
        textarea.select();
        feedback.textContent = "浏览器没有允许自动复制，完整文字已经选中，请手动复制。";
      }
    }

    function clearFilters() {
      state.view.filters = { search: "", city: "", category: "", priority: "", plan: "" };
      renderAll({ preserveMapView: true });
    }

    function updateFilter(target) {
      const field = target.dataset.filterField;
      if (!field) return;
      state.view.filters[field] = target.value;
      renderAll({ preserveMapView: true });
    }

    function sortablePlaceRows(list) {
      return [...list.querySelectorAll(".place-row-wrap[data-sortable-place]")];
    }

    function updatePlaceDropIndicator(session) {
      const candidates = sortablePlaceRows(session.list).filter((row) => row !== session.wrap);
      const next = candidates.find((row) => {
        const rect = row.getBoundingClientRect();
        return session.pointerY < rect.top + rect.height / 2;
      });
      if (next) session.list.insertBefore(placeDropIndicator, next);
      else session.list.appendChild(placeDropIndicator);
    }

    function updatePlaceDragOffset(session) {
      const scrollDelta = session.list.scrollTop - session.startScrollTop;
      session.row.style.setProperty(
        "--place-drag-offset",
        `${session.pointerY - session.startY + scrollDelta}px`,
      );
    }

    function stopPlaceSortAutoScroll() {
      if (placeSortAutoScrollFrame) root.cancelAnimationFrame(placeSortAutoScrollFrame);
      placeSortAutoScrollFrame = 0;
      if (!placePointerSort) return;
      placePointerSort.list.classList.remove("edge-scroll-top", "edge-scroll-bottom");
    }

    function runPlaceSortAutoScroll() {
      const session = placePointerSort;
      if (!session?.active) {
        placeSortAutoScrollFrame = 0;
        return;
      }
      const rect = session.list.getBoundingClientRect();
      const velocity = calculateEdgeAutoScrollVelocity(
        session.pointerY,
        rect.top,
        rect.bottom,
        PLACE_SORT_EDGE_PX,
        PLACE_SORT_MAX_SCROLL_PX,
      );
      session.list.classList.toggle("edge-scroll-top", velocity < 0);
      session.list.classList.toggle("edge-scroll-bottom", velocity > 0);
      if (velocity) {
        const before = session.list.scrollTop;
        session.list.scrollTop += velocity;
        if (session.list.scrollTop !== before) {
          updatePlaceDragOffset(session);
          updatePlaceDropIndicator(session);
        }
      }
      placeSortAutoScrollFrame = root.requestAnimationFrame(runPlaceSortAutoScroll);
    }

    function releasePlacePointer(session) {
      try {
        if (session.handle.hasPointerCapture(session.pointerId)) {
          session.handle.releasePointerCapture(session.pointerId);
        }
      } catch (_error) {
        // The pointer may already have been released by the browser.
      }
    }

    function resetPlacePointerSort() {
      const session = placePointerSort;
      if (!session) return;
      root.clearTimeout(session.holdTimer);
      stopPlaceSortAutoScroll();
      session.row.classList.remove("is-dragging");
      session.row.style.removeProperty("--place-drag-offset");
      placeDropIndicator.remove();
      releasePlacePointer(session);
      placePointerSort = null;
    }

    function activatePlacePointerSort(session) {
      if (placePointerSort !== session) return;
      session.active = true;
      session.startScrollTop = session.list.scrollTop;
      session.row.classList.add("is-dragging");
      updatePlaceDropIndicator(session);
      placeSortAutoScrollFrame = root.requestAnimationFrame(runPlaceSortAutoScroll);
    }

    function placeSortTargetIndex(session) {
      const order = (state.orders[session.dayId] || []).filter((poiId) => poiId !== session.poiId);
      let next = placeDropIndicator.nextElementSibling;
      while (next && !next.matches(".place-row-wrap[data-sortable-place]")) {
        next = next.nextElementSibling;
      }
      if (!next) return order.length;
      const nextIndex = order.indexOf(next.dataset.sortablePlace);
      return nextIndex >= 0 ? nextIndex : order.length;
    }

    function finishPlacePointerSort(event, { cancel = false } = {}) {
      const session = placePointerSort;
      if (!session || (event && event.pointerId !== session.pointerId)) return;
      const wasActive = session.active;
      const toIndex = wasActive && !cancel ? placeSortTargetIndex(session) : session.originalIndex;
      resetPlacePointerSort();
      if (!wasActive || cancel || toIndex === session.originalIndex) return;
      requestAction({ type: "move-order", poiId: session.poiId, toIndex });
      root.requestAnimationFrame(() => {
        const reorderedRow = sortablePlaceRows($("#day-place-list").querySelector(".place-list"))
          .find((row) => row.dataset.sortablePlace === session.poiId);
        reorderedRow?.scrollIntoView({ block: "nearest" });
      });
    }

    function bindPlaceSorting() {
      const dayPlaceList = $("#day-place-list");
      dayPlaceList.addEventListener("pointerdown", (event) => {
        const handle = event.target.closest("[data-drag-place]");
        if (!handle || (event.pointerType === "mouse" && event.button !== 0)) return;
        const wrap = handle.closest(".place-row-wrap[data-sortable-place]");
        const list = handle.closest(".place-list");
        const row = handle.closest(".place-row");
        const dayId = state.view.activeDayId;
        const poiId = handle.dataset.dragPlace;
        if (!wrap || !list || !row || !dayId || !poiId) return;
        resetPlacePointerSort();
        const session = {
          pointerId: event.pointerId,
          pointerY: event.clientY,
          startY: event.clientY,
          startScrollTop: list.scrollTop,
          dayId,
          poiId,
          originalIndex: (state.orders[dayId] || []).indexOf(poiId),
          handle,
          wrap,
          row,
          list,
          active: false,
          holdTimer: 0,
        };
        placePointerSort = session;
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (_error) {
          // Pointer capture is an enhancement; document-level events still finish the gesture.
        }
        session.holdTimer = root.setTimeout(
          () => activatePlacePointerSort(session),
          PLACE_SORT_HOLD_MS,
        );
      });

      dayPlaceList.addEventListener("pointermove", (event) => {
        const session = placePointerSort;
        if (!session || event.pointerId !== session.pointerId) return;
        session.pointerY = event.clientY;
        if (!session.active) {
          if (Math.abs(event.clientY - session.startY) > 10) resetPlacePointerSort();
          return;
        }
        event.preventDefault();
        updatePlaceDragOffset(session);
        updatePlaceDropIndicator(session);
      });
      dayPlaceList.addEventListener("pointerup", (event) => finishPlacePointerSort(event));
      dayPlaceList.addEventListener("pointercancel", (event) => finishPlacePointerSort(event, { cancel: true }));
    }

    function bindEvents() {
      bindPlaceSorting();
      appRoot.addEventListener("click", (event) => {
        const openDay = event.target.closest("[data-open-day]");
        const selectDayButton = event.target.closest("[data-select-day]");
        const openPlace = event.target.closest("[data-open-place]");
        const moveOrder = event.target.closest("[data-move-order]");
        const actionButton = event.target.closest("[data-action]");
        if (openDay) return selectDay(openDay.dataset.openDay);
        if (selectDayButton) return selectDay(selectDayButton.dataset.selectDay, { preserveMapView: false });
        if (event.target.closest("[data-return-overview]")) return returnToOverview();
        if (openPlace && !event.target.closest("[data-move-order]")) return openPoiDetail(openPlace.dataset.openPlace);
        if (event.target.closest("[data-close-detail]")) {
          state.view.selectedPoiId = "";
          return renderAll({ preserveMapView: true });
        }
        if (moveOrder) {
          event.stopPropagation();
          return requestAction({
            type: "move-order",
            poiId: moveOrder.dataset.poiId,
            direction: Number(moveOrder.dataset.moveOrder),
          });
        }
        if (actionButton) {
          const type = actionButton.dataset.action;
          return requestAction({
            type,
            poiId: actionButton.dataset.poiId,
            dayId: actionButton.dataset.dayId,
            priority: actionButton.dataset.priority,
          });
        }
        if (event.target.closest("#clear-filters")) return clearFilters();
        if (event.target.closest("#undo-change")) {
          state = root.TripMapState.undoLastAction(state);
          return renderAll({ preserveMapView: true });
        }
        if (event.target.closest("#request-replan")) return openReplanDialog();
      });

      appRoot.addEventListener("input", (event) => {
        if (event.target.matches("[data-filter-field]")) updateFilter(event.target);
      });
      appRoot.addEventListener("change", (event) => {
        if (event.target.matches("[data-filter-field]")) updateFilter(event.target);
      });

      $("#cancel-impact").addEventListener("click", closeImpactDialog);
      $("#confirm-impact").addEventListener("click", () => {
        if (pendingAction) commitAndRender(pendingAction);
      });
      $("#close-replan").addEventListener("click", closeReplanDialog);
      $("#copy-replan").addEventListener("click", copyReplanPrompt);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && placePointerSort) {
          finishPlacePointerSort(null, { cancel: true });
          return;
        }
        if (event.key !== "Escape") return;
        if (!$("#impact-dialog").hidden) closeImpactDialog();
        else if (!$("#replan-dialog").hidden) closeReplanDialog();
      });
    }

    return {
      renderOverview,
      selectDay,
      openPoiDetail,
      returnToOverview,
      renderDayRail,
      renderDayPlaceList,
      renderPoiDetail,
      renderMapLayers,
      renderFilters,
      renderChangeSummary,
    };
  }

  root.TripMapCore = { mount };
})(typeof globalThis !== "undefined" ? globalThis : window);
