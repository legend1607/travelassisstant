(function installTripMapCore(root) {
  "use strict";

  function mount({ root: appRoot, trip }) {
    if (!appRoot) throw new Error("找不到旅行地图容器");
    if (!trip || !Array.isArray(trip.pois) || !Array.isArray(trip.days)) {
      throw new Error("旅行地图缺少地点或每日路线数据");
    }
    if (!root.L || !root.TripMapRoute || !root.TripMapState) throw new Error("旅行地图基础资源没有加载完成");

    const $ = (selector) => appRoot.querySelector(selector) || document.querySelector(selector);
    const storageKey = `${trip.slug || "trip-planner-public"}:${trip.dataRevision || "v1"}`;
    const pois = new Map(trip.pois.map((poi) => [poi.id, poi]));
    const days = new Map(trip.days.map((day) => [day.id, day]));
    const categoryLabels = trip.categories || {};
    const priorityLabels = trip.priorities || {};
    const cityLabels = trip.cities || {};
    const categoryGlyphs = { hotel: "H", top50: "50", wine: "W", sweet: "S", coffee: "C", food: "F", art: "A", "local-life": "L", sight: "T", event: "节", architecture: "筑", history: "史", local: "街", market: "市", nightlife: "夜" };
    let state = root.TripMapState.createState(trip, loadSavedState());
    let map;
    let markerLayer;
    let routeLayer;
    let layerControl;
    const markerLayers = new Map();
    const layerKeyByLeafletId = new Map();
    let markerByPoi = new Map();
    let pendingAction = null;
    let shouldFitMap = true;
    let hashMapView = null;
    let pointerSort = null;

    applyHashState();
    if (state.view.activeDayId) state.view.layers.itinerary = true;
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
      if (map) {
        const center = map.getCenter();
        state.view.map = { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
      }
      try {
        root.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (_error) {
        // The map remains usable when browser storage is unavailable.
      }
      const params = new URLSearchParams();
      if (state.view.map) {
        params.set("lat", Number(state.view.map.lat).toFixed(5));
        params.set("lng", Number(state.view.map.lng).toFixed(5));
        params.set("z", String(state.view.map.zoom));
      }
      if (state.view.activeDayId) params.set("day", state.view.activeDayId);
      if (state.view.selectedPoiId) params.set("poi", state.view.selectedPoiId);
      params.set("layers", Object.entries(state.view.layers || {}).filter(([, enabled]) => enabled).map(([key]) => key).join(","));
      const nextHash = params.toString();
      root.history.replaceState(null, "", `${root.location.pathname}${root.location.search}${nextHash ? `#${nextHash}` : ""}`);
    }

    function applyHashState() {
      const params = new URLSearchParams(root.location.hash.replace(/^#/, ""));
      const dayId = params.get("day");
      const poiId = params.get("poi") || params.get("place");
      const lat = Number(params.get("lat"));
      const lng = Number(params.get("lng"));
      const zoom = Number(params.get("z"));
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
        hashMapView = { lat, lng, zoom };
        state.view.map = hashMapView;
      }
      if (days.has(dayId)) state.view.activeDayId = dayId;
      if (pois.has(poiId)) state.view.selectedPoiId = poiId;
      if (params.has("layers")) {
        const enabled = new Set(String(params.get("layers") || "").split(",").filter(Boolean));
        for (const key of Object.keys(state.view.layers || {})) state.view.layers[key] = enabled.has(key);
      }
    }

    function initializeMap() {
      const initialView = hashMapView || state.view.map;
      map = root.L.map($("#map"), { zoomControl: true, attributionControl: true }).setView(
        initialView ? [initialView.lat, initialView.lng] : (trip.map?.center || [48.8588, 2.3295]),
        Number(initialView?.zoom || trip.map?.zoom || 13),
      );
      root.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      markerLayer = root.L.layerGroup().addTo(map);
      routeLayer = root.L.layerGroup();
      for (const category of Object.keys(categoryLabels)) markerLayers.set(category, root.L.layerGroup());
      syncLayerVisibility();
      initializeLayerControl();
      map.on("moveend", persistState);
    }

    function themeValue(name, fallback) {
      const value = root.getComputedStyle?.(appRoot)?.getPropertyValue(name)?.trim();
      return value || fallback;
    }

    function syncLayerVisibility() {
      const layers = new Map([["itinerary", routeLayer], ...markerLayers.entries()]);
      for (const [key, layer] of layers) {
        if (state.view.layers[key] !== false) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
    }

    function decorateLayerControl() {
      const container = layerControl?.getContainer();
      const list = container?.querySelector(".leaflet-control-layers-list");
      const overlays = container?.querySelector(".leaflet-control-layers-overlays");
      if (!list || !overlays) return;
      list.querySelectorAll(".map-control-title").forEach((node) => node.remove());
      overlays.querySelectorAll(".map-control-group-label").forEach((node) => node.remove());
      const labels = [...overlays.children].filter((node) => node.matches("label"));
      const title = document.createElement("div");
      title.className = "map-control-title";
      title.textContent = "地图显示";
      list.prepend(title);
      const routeHeading = document.createElement("div");
      routeHeading.className = "map-control-group-label";
      routeHeading.textContent = "路线与移动";
      overlays.prepend(routeHeading);
      if (labels[1]) {
        const poiHeading = document.createElement("div");
        poiHeading.className = "map-control-group-label";
        poiHeading.textContent = "地点分类";
        overlays.insertBefore(poiHeading, labels[1]);
      }
    }

    function initializeLayerControl() {
      const entries = { [`每日路线 (${trip.days.length})`]: routeLayer };
      layerKeyByLeafletId.set(root.L.stamp(routeLayer), "itinerary");
      for (const [category, layer] of markerLayers) {
        const count = trip.pois.filter((poi) => poi.category === category).length;
        entries[`${categoryGlyphs[category] || "点"} | ${categoryLabels[category] || category} (${count})`] = layer;
        layerKeyByLeafletId.set(root.L.stamp(layer), category);
      }
      layerControl = root.L.control.layers(null, entries, { collapsed: false }).addTo(map);
      decorateLayerControl();
      map.on("layeradd layerremove", decorateLayerControl);
      map.on("overlayadd overlayremove", (event) => {
        const key = layerKeyByLeafletId.get(root.L.stamp(event.layer));
        if (!key) return;
        state.view.layers[key] = event.type === "overlayadd";
        persistState();
      });
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

    function isRecurringOnDay(poi, dayId) {
      return Boolean(poi?.recurring && days.get(dayId)?.routeStops?.some((stop) => stop.poiId === poi.id));
    }

    function isPoiOnDay(poiId, dayId) {
      const poi = pois.get(poiId);
      return assignedDayId(poiId) === dayId || isRecurringOnDay(poi, dayId);
    }

    function assignedLabel(poiId) {
      const poi = pois.get(poiId);
      if (poi?.recurring && poi.category === "hotel") return "行程段住宿锚点";
      if (poi?.recurring) {
        const labels = trip.days.filter((day) => isRecurringOnDay(poi, day.id)).map((day) => shortDate(day.date));
        return `${labels.join("、")} 已安排`;
      }
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

    function cityLabel(value) {
      return cityLabels[value] || value;
    }

    function nonHotelOrder(dayId, poiId) {
      const ordered = (state.orders[dayId] || []).filter((id) => pois.get(id)?.category !== "hotel");
      const index = ordered.indexOf(poiId);
      return index >= 0 ? index + 1 : "";
    }

    function routeStop(day, poiId) {
      return (day.routeStops || []).find((stop) => stop.poiId === poiId);
    }

    function candidatePoisForDay(dayId) {
      const day = days.get(dayId);
      if (!day || day.city === "Transit") return [];
      const scheduled = (state.orders[dayId] || []).map((poiId) => pois.get(poiId)).filter(Boolean);
      const areas = new Set(scheduled.map((poi) => poi.area));
      const coords = scheduled.map((poi) => poi.coords).filter(Boolean);
      const priorityRank = { must: 0, preferred: 1, nearby: 2, pending: 3, archive: 4 };
      const distance = (poi) => coords.length
        ? Math.min(...coords.map((point) => (point[0] - poi.coords[0]) ** 2 + (point[1] - poi.coords[1]) ** 2))
        : Number.POSITIVE_INFINITY;
      return trip.pois
        .filter((poi) => poi.city === day.city && poi.category !== "hotel" && !assignedDayId(poi.id) && !poi.recurring)
        .sort((left, right) => (
          (priorityRank[state.priorities[left.id]] ?? 5) - (priorityRank[state.priorities[right.id]] ?? 5)
          || Number(areas.has(right.area)) - Number(areas.has(left.area))
          || distance(left) - distance(right)
          || String(left.name_zh || left.name).localeCompare(String(right.name_zh || right.name), "zh-CN")
        ))
        .slice(0, 8)
        .map((poi) => poi.id);
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
        if (filters().plan === "scheduled" && !isPoiOnDay(poi.id, activeDayId)) return false;
        if (filters().plan === "candidate" && !candidatePoisForDay(day?.id).includes(poi.id)) return false;
        if (filters().plan === "unassigned" && (assignedDayId(poi.id) || poi.recurring)) return false;
        if (filters().plan === "other-day" && (poi.recurring || !assignedDayId(poi.id) || assignedDayId(poi.id) === activeDayId)) return false;
        return true;
      });
    }

    function renderAll(options = {}) {
      shouldFitMap = options.preserveMapView ? false : shouldFitMap;
      const inDay = Boolean(state.view.activeDayId);
      appRoot.classList.toggle("is-detail-browse", inDay);
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
      $("#trip-eyebrow").textContent = trip.eyebrow || "公开旅行地图母版";
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
          <span class="day-meta">${escapeHtml(day.date)} · ${escapeHtml(cityLabel(day.city))}</span>
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
          <span class="place-meta">${escapeHtml(cityLabel(poi.city))} · ${escapeHtml(poi.area)}</span>
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
      state.view.layers.itinerary = true;
      syncLayerVisibility();
      if (!options.keepPlace) state.view.selectedPoiId = "";
      shouldFitMap = !options.preserveMapView;
      renderAll({ preserveMapView: options.preserveMapView });
    }

    function openPoiDetail(poiId, options = {}) {
      const poi = pois.get(poiId);
      if (!poi) return;
      if (!state.view.activeDayId) {
        const targetDay = assignedDayId(poiId)
          || trip.days.find((day) => candidatePoisForDay(day.id).includes(poiId))?.id
          || trip.days[0]?.id;
        state.view.activeDayId = targetDay || "";
      }
      state.view.layers.itinerary = true;
      syncLayerVisibility();
      const categoryLayer = markerLayers.get(poi.category);
      if (categoryLayer && !map.hasLayer(categoryLayer)) {
        state.view.layers[poi.category] = true;
        categoryLayer.addTo(map);
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
          <span>${escapeHtml(cityLabel(day.city))}</span>
        </button>`).join("")}`;
    }

    function transitLabel(day, fromPoiId, toPoiId) {
      const segment = (day.transitSegments || []).find(
        (item) => item.fromPoiId === fromPoiId && item.toPoiId === toPoiId,
      );
      if (segment) return segment.label || `${segment.mode || "移动"}约 ${segment.minutes} 分钟`;
      return "这段移动尚未复核，正式出发前需要重新安排";
    }

    function renderDayPlaceList(dayId) {
      const container = $("#day-place-list");
      const day = days.get(dayId);
      if (!day) {
        container.innerHTML = "";
        return;
      }
      const ordered = (state.orders[dayId] || []).filter((poiId) => isPoiOnDay(poiId, dayId));
      const rows = ordered.map((poiId, index) => {
        const poi = pois.get(poiId);
        if (!poi) return "";
        const order = poi.category === "hotel" ? "宿" : nonHotelOrder(dayId, poiId);
        const transit = index > 0 ? transitLabel(day, ordered[index - 1], poiId) : "";
        const canMove = poi.category !== "hotel";
        return `<div class="place-row-wrap" ${canMove ? `data-sortable-poi="${escapeHtml(poiId)}"` : ""}>
          ${transit ? `<div class="place-transit">${escapeHtml(transit)}</div>` : ""}
          <div class="place-row ${state.view.selectedPoiId === poiId ? "is-selected" : ""}">
            ${canMove ? `<button class="place-drag-handle" type="button" data-drag-poi="${escapeHtml(poiId)}" aria-label="拖动调整${escapeHtml(poi.name_zh || poi.name)}的顺序" title="拖动调整顺序">⠿</button>` : '<span class="place-drag-spacer" aria-hidden="true"></span>'}
            <button class="place-main" type="button" data-open-place="${escapeHtml(poiId)}">
              <span class="place-order ${poi.category === "hotel" ? "hotel" : ""}">${escapeHtml(order)}</span>
              <span><span class="place-name">${escapeHtml(poi.name_zh || poi.name)}</span><span class="place-meta">${escapeHtml(routeStop(day, poiId)?.time || "时间待定")} · ${escapeHtml(categoryLabel(poi))}</span></span>
            </button>
            <span class="place-actions">
              <button type="button" title="移出当天" aria-label="从${escapeHtml(shortDate(day.date))}移出${escapeHtml(poi.name_zh || poi.name)}" data-action="remove-day" data-poi-id="${escapeHtml(poiId)}" ${canMove ? "" : "disabled"}>−</button>
              <button class="order-shift" type="button" title="上移" aria-label="上移${escapeHtml(poi.name_zh || poi.name)}" data-move-order="-1" data-poi-id="${escapeHtml(poiId)}" ${canMove ? "" : "disabled"}>↑</button>
              <button class="order-shift" type="button" title="下移" aria-label="下移${escapeHtml(poi.name_zh || poi.name)}" data-move-order="1" data-poi-id="${escapeHtml(poiId)}" ${canMove ? "" : "disabled"}>↓</button>
            </span>
          </div>
        </div>`;
      }).join("");
      const candidates = candidatePoisForDay(day.id).map((poiId) => pois.get(poiId)).filter(Boolean);
      container.innerHTML = `<section class="day-context">
          <div class="day-meta">${escapeHtml(day.date)} · ${escapeHtml(cityLabel(day.city))}</div>
          <h2>${escapeHtml(day.title)}</h2>
          <p>${escapeHtml(day.summary)}</p>
          ${state.dirtyDays[day.id] ? '<div class="route-status">路线需要重新整理。地图保留原路线作为参考，不会自动连接新增地点。</div>' : ""}
        </section>
        <section class="section-block"><div class="section-heading-row"><h3 class="section-title">当天安排</h3><span class="muted">${ordered.filter((id) => pois.get(id)?.category !== "hotel").length} / ${Number(day.capacity || 6)} 个主要地点</span></div><div class="place-list">${rows || '<div class="empty-state">这一天还没有安排地点。</div>'}</div></section>
        <section class="section-block"><h3 class="section-title">顺路候选</h3><div class="quick-list">${candidates.map((poi) => {
          const action = assignedDayId(poi.id) ? "move-day" : "assign-day";
          return `<div class="quick-place candidate-place"><button class="candidate-main" type="button" data-open-place="${escapeHtml(poi.id)}"><span class="place-name">${escapeHtml(poi.name_zh || poi.name)}</span><span class="place-meta">${escapeHtml(poi.area)} · ${escapeHtml(priorityLabel(poi.id))}</span></button><button class="candidate-add" type="button" aria-label="加入${escapeHtml(poi.name_zh || poi.name)}到${escapeHtml(shortDate(day.date))}" data-action="${action}" data-poi-id="${escapeHtml(poi.id)}" data-day-id="${escapeHtml(day.id)}">＋</button></div>`;
        }).join("") || '<div class="empty-state">当前没有额外候选。</div>'}</div></section>`;
    }

    function renderPoiDetail(poiId) {
      const container = $("#poi-detail");
      const poi = pois.get(poiId);
      if (!poi) {
        container.innerHTML = '<div class="empty-state">选择当天地点、候选地点或地图标记，查看完整说明。</div>';
        return;
      }
      const currentDayId = poi.recurring ? state.view.activeDayId : assignedDayId(poi.id);
      const assignmentOptions = `<option value="">尚未安排行程</option>${trip.days.map((day) => `<option value="${escapeHtml(day.id)}" ${currentDayId === day.id ? "selected" : ""}>${escapeHtml(shortDate(day.date))} · ${escapeHtml(cityLabel(day.city))} · ${escapeHtml(day.title)}</option>`).join("")}`;
      container.dataset.poiId = poi.id;
      container.innerHTML = `<div class="detail-heading-row">
          <div><div class="detail-meta">${escapeHtml(cityLabel(poi.city))} · ${escapeHtml(poi.area)} · ${escapeHtml(categoryLabel(poi))}</div><h2 class="detail-title">${escapeHtml(poi.name_zh || poi.name)}</h2><div class="detail-original-name">${escapeHtml(poi.name)}</div></div>
          <button class="icon-button" type="button" aria-label="关闭地点详情" title="关闭地点详情" data-close-detail>×</button>
        </div>
        <div class="place-tags"><span class="tag accent">${escapeHtml(priorityLabel(poi.id))}</span><span class="tag">${escapeHtml(assignedLabel(poi.id))}</span>${state.dirtyDays[currentDayId] ? '<span class="tag warning">路线待调整</span>' : ""}</div>
        <section class="detail-section image-section"><h3>图片预览</h3><div class="image-status" data-image-status>正在查找可展示图片…</div><div class="image-preview-viewer" data-image-viewer></div><div class="image-preview-grid" data-image-grid></div></section>
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
        <section class="section-block"><h3 class="section-title">安排日期</h3><div class="assignment-controls">${poi.recurring ? `<div class="empty-state compact">${poi.category === "hotel" ? "住宿片区会出现在这一行程段的每天，不需要逐日重复添加。" : `这个固定活动已安排在 ${escapeHtml(assignedLabel(poi.id).replace(" 已安排", ""))}。如需删除其中一次，请让 Codex 一并复核时间安排。`}</div>` : `<select class="filter-control" data-assign-select data-poi-id="${escapeHtml(poi.id)}" aria-label="选择安排日期">${assignmentOptions}</select>`}</div></section>`;
      void loadCommonsImages(poi);
    }

    function imageSearchUrl(poi) {
      return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(poi.imageQuery || `${poi.name} ${poi.city}`)}`;
    }

    function renderImageFallback(poi, message) {
      const container = $("#poi-detail");
      if (container.dataset.poiId !== poi.id) return;
      const status = container.querySelector("[data-image-status]");
      const viewer = container.querySelector("[data-image-viewer]");
      const grid = container.querySelector("[data-image-grid]");
      if (status) status.textContent = message;
      if (viewer) viewer.innerHTML = `<div class="empty-state">暂时没有加载到可展示图片。<br><a href="${escapeHtml(imageSearchUrl(poi))}" target="_blank" rel="noreferrer">打开 Google 图片搜索</a></div>`;
      if (grid) grid.innerHTML = "";
    }

    async function loadCommonsImages(poi) {
      const query = poi.imageQuery || `${poi.name} ${poi.city}`;
      const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
      endpoint.search = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "1000",
        origin: "*",
        format: "json",
      }).toString();
      try {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`image request ${response.status}`);
        const payload = await response.json();
        const images = Object.values(payload.query?.pages || {})
          .map((page) => page.imageinfo?.[0])
          .filter((info) => info && /^image\/(jpeg|png|webp)$/.test(info.mime || ""))
          .map((info) => ({ full: info.url, thumb: info.thumburl || info.url }))
          .slice(0, 4);
        if (!images.length) return renderImageFallback(poi, "没有找到适合直接展示的图片，可以改用图片搜索。");
        const container = $("#poi-detail");
        if (container.dataset.poiId !== poi.id) return;
        const status = container.querySelector("[data-image-status]");
        const viewer = container.querySelector("[data-image-viewer]");
        const grid = container.querySelector("[data-image-grid]");
        status.textContent = `来自 Wikimedia Commons 的 ${images.length} 张图片，可点击切换。`;
        viewer.innerHTML = `<img src="${escapeHtml(images[0].thumb)}" alt="${escapeHtml(poi.name_zh || poi.name)} 图片预览">`;
        grid.innerHTML = images.map((image, index) => `<button type="button" class="${index === 0 ? "is-active" : ""}" data-preview-image="${escapeHtml(image.thumb)}" aria-label="查看第 ${index + 1} 张图片"><img src="${escapeHtml(image.thumb)}" alt=""></button>`).join("");
      } catch (_error) {
        renderImageFallback(poi, "图片服务暂时没有响应，地图和行程仍可正常使用。");
      }
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

    function renderSequenceGuide(dayId, { hasVerifiedRoute = false, dirty = false } = {}) {
      if (!dayId || (hasVerifiedRoute && !dirty)) return false;
      const points = (state.orders[dayId] || [])
        .filter((poiId) => pois.get(poiId)?.category !== "hotel" && isPoiOnDay(poiId, dayId))
        .map((poiId) => pois.get(poiId)?.coords)
        .filter((coords) => Array.isArray(coords) && coords.length === 2);
      if (points.length < 2) return false;
      root.L.polyline(points, {
        className: "trip-sequence-guide",
        color: themeValue("--trip-sequence", "#64748b"),
        weight: 4,
        opacity: 0.92,
        dashArray: "6 8",
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(routeLayer);
      return true;
    }

    function renderMapLayers() {
      markerLayer.clearLayers();
      routeLayer.clearLayers();
      for (const layer of markerLayers.values()) layer.clearLayers();
      markerByPoi = new Map();
      const activeDayId = state.view.activeDayId;
      const activeDay = days.get(activeDayId);
      const activeCandidates = new Set(candidatePoisForDay(activeDayId));
      const visiblePois = filteredPois().filter((poi) =>
        !activeDayId
        || isPoiOnDay(poi.id, activeDayId)
        || activeCandidates.has(poi.id)
        || state.view.selectedPoiId === poi.id,
      );
      const bounds = [];
      let activeHasVerifiedRoute = false;

      if (!activeDayId) {
        const cityGroups = new Map();
        for (const poi of visiblePois) {
          const group = cityGroups.get(poi.city) || [];
          group.push(poi);
          cityGroups.set(poi.city, group);
        }
        const cityPoints = [];
        for (const [city, cityPois] of cityGroups) {
          const coords = [
            cityPois.reduce((sum, poi) => sum + poi.coords[0], 0) / cityPois.length,
            cityPois.reduce((sum, poi) => sum + poi.coords[1], 0) / cityPois.length,
          ];
          cityPoints.push(coords);
          const icon = root.L.divIcon({
            className: "",
            html: `<span class="city-summary-marker"><strong>${escapeHtml(cityLabel(city))}</strong><small>${cityPois.length} 个地点</small></span>`,
            iconSize: [92, 48],
            iconAnchor: [46, 24],
          });
          const firstDay = trip.days.find((day) => day.city === city || day.routeStops?.some((stop) => pois.get(stop.poiId)?.city === city));
          root.L.marker(coords, { icon, keyboard: true, title: `${cityLabel(city)} ${cityPois.length} 个地点` })
            .on("click", () => firstDay && selectDay(firstDay.id))
            .addTo(markerLayer);
        }
        $("#map-note").textContent = `点击城市查看对应日期；左侧可以先比较完整的 ${trip.days.length} 天路线。`;
        if (cityPoints.length) map.fitBounds(cityPoints, { padding: [90, 90], maxZoom: 6, animate: false });
        shouldFitMap = false;
        window.setTimeout(() => map.invalidateSize(false), 0);
        return;
      }

      for (const day of trip.days) {
        if (!root.TripMapRoute.hasVerifiedRouteGeometry(day)) continue;
        const active = day.id === activeDayId;
        if (active) activeHasVerifiedRoute = true;
        const dirty = Boolean(state.dirtyDays[day.id]);
        const latLngs = day.routeGeometry.map(([lng, lat]) => [lat, lng]);
        root.L.polyline(latLngs, {
          color: active ? themeValue("--trip-route", "#0f766e") : themeValue("--trip-other-route", "#94a3b8"),
          weight: active ? 4 : 2,
          opacity: dirty ? 0.36 : (active ? 0.88 : 0.32),
          dashArray: dirty ? "8 8" : null,
          interactive: false,
        }).addTo(routeLayer);
        if (active) bounds.push(...latLngs);
      }

      const sequenceGuideVisible = renderSequenceGuide(activeDayId, {
        hasVerifiedRoute: activeHasVerifiedRoute,
        dirty: Boolean(state.dirtyDays[activeDayId]),
      });

      for (const poi of visiblePois) {
        const savedAssignment = assignedDayId(poi.id);
        const assignment = activeDayId && isRecurringOnDay(poi, activeDayId) ? activeDayId : savedAssignment;
        const recurringElsewhere = Boolean(activeDayId && poi.recurring && !isRecurringOnDay(poi, activeDayId));
        const isOther = Boolean(recurringElsewhere || (activeDayId && assignment && assignment !== activeDayId));
        const isUnassigned = !assignment && !poi.recurring;
        const isSelected = state.view.selectedPoiId === poi.id;
        const dirty = Boolean(assignment && state.dirtyDays[assignment]);
        const order = activeDayId && assignment === activeDayId ? nonHotelOrder(activeDayId, poi.id) : "";
        const glyph = poi.category === "hotel" ? "H" : (order || categoryGlyphs[poi.category] || "点");
        const classNames = ["trip-marker", `category-${poi.category}`, isOther && "is-other", isUnassigned && "is-unassigned", isSelected && "is-selected", dirty && "is-dirty"].filter(Boolean).join(" ");
        const icon = root.L.divIcon({
          className: "",
          html: `<span class="${classNames}">${escapeHtml(glyph)}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = root.L.marker(poi.coords, { icon, keyboard: true, title: poi.name_zh || poi.name })
          .bindTooltip(escapeHtml(poi.name_zh || poi.name), { direction: "top", offset: [0, -16] })
          .on("click", () => openPoiDetail(poi.id, { pan: false }))
          .addTo(markerLayers.get(poi.category) || markerLayer);
        markerByPoi.set(poi.id, marker);
        if (assignment === activeDayId) bounds.push(poi.coords);
      }

      const mapNote = $("#map-note");
      if (activeDayId && state.dirtyDays[activeDayId] && activeHasVerifiedRoute) {
        mapNote.textContent = sequenceGuideVisible
          ? "这一天需要重新整理：浅线是上次复核路线，编号虚线只表示当前游览先后，不代表道路。"
          : "这一天的路线需要重新整理。浅线是上次经过复核的路线，新增地点不会自动接入道路路线。";
      } else if (activeDayId && state.dirtyDays[activeDayId]) {
        mapNote.textContent = "这一天的路线需要重新整理。编号虚线只表示当前游览先后，不代表道路或实时导航。";
      } else if (activeDayId && activeHasVerifiedRoute) {
        mapNote.textContent = "当前显示当天经过复核的道路路线；日内视图聚焦当天安排、当天候选和当前地点。";
      } else if (activeDayId) {
        mapNote.textContent = "地图用编号虚线表示当天游览先后；顺序引导线不代表道路或实时导航。";
      } else {
        mapNote.textContent = "选择每日路线进入当天安排；也可以直接点击地图地点查看详情。";
      }
      if (shouldFitMap && bounds.length) {
        map.fitBounds(bounds, { padding: [38, 38], maxZoom: 16, animate: false });
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

    function cancelImpactDialog() {
      closeImpactDialog();
      renderAll({ preserveMapView: true });
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

    function assignmentAction(poiId, currentDayId, nextDayId) {
      if (!nextDayId) return { type: "remove-day", poiId };
      if (currentDayId) return { type: "move-day", poiId, dayId: nextDayId };
      return { type: "assign-day", poiId, dayId: nextDayId };
    }

    function bindEvents() {
      appRoot.addEventListener("pointerdown", (event) => {
        const handle = event.target.closest("[data-drag-poi]");
        if (!handle || event.button !== 0) return;
        event.preventDefault();
        pointerSort = {
          poiId: handle.dataset.dragPoi,
          pointerId: event.pointerId,
          startY: event.clientY,
          moved: false,
          handle,
        };
        handle.closest("[data-sortable-poi]")?.classList.add("is-dragging");
        handle.setPointerCapture?.(event.pointerId);
      });

      appRoot.addEventListener("pointermove", (event) => {
        if (!pointerSort || event.pointerId !== pointerSort.pointerId) return;
        if (!pointerSort.moved && Math.abs(event.clientY - pointerSort.startY) < 4) return;
        event.preventDefault();
        pointerSort.moved = true;
        const dragged = appRoot.querySelector(`[data-sortable-poi="${pointerSort.poiId}"]`);
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-sortable-poi]");
        if (!dragged || !target || dragged === target || dragged.parentElement !== target.parentElement) return;
        const rect = target.getBoundingClientRect();
        target.parentElement.insertBefore(dragged, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      });

      const finishPointerSort = (event, commit) => {
        if (!pointerSort || event.pointerId !== pointerSort.pointerId) return;
        pointerSort.handle.releasePointerCapture?.(pointerSort.pointerId);
        appRoot.querySelectorAll(".is-dragging").forEach((node) => node.classList.remove("is-dragging"));
        if (commit && pointerSort.moved && state.view.activeDayId) {
          const orderedPoiIds = [...appRoot.querySelectorAll("#day-place-list [data-sortable-poi]")]
            .map((row) => row.dataset.sortablePoi);
          const hotelCount = (state.orders[state.view.activeDayId] || []).filter((poiId) => pois.get(poiId)?.category === "hotel").length;
          const nextIndex = orderedPoiIds.indexOf(pointerSort.poiId);
          const action = { type: "move-order", poiId: pointerSort.poiId, toIndex: hotelCount + nextIndex };
          pointerSort = null;
          requestAction(action);
          return;
        }
        pointerSort = null;
        renderDayPlaceList(state.view.activeDayId);
      };

      appRoot.addEventListener("pointerup", (event) => finishPointerSort(event, true));
      appRoot.addEventListener("pointercancel", (event) => finishPointerSort(event, false));

      appRoot.addEventListener("click", (event) => {
        const openDay = event.target.closest("[data-open-day]");
        const selectDayButton = event.target.closest("[data-select-day]");
        const openPlace = event.target.closest("[data-open-place]");
        const moveOrder = event.target.closest("[data-move-order]");
        const actionButton = event.target.closest("[data-action]");
        const segmentButton = event.target.closest("[data-segment-day]");
        const previewButton = event.target.closest("[data-preview-image]");
        if (segmentButton) return selectDay(segmentButton.dataset.segmentDay);
        if (previewButton) {
          const viewer = $("#poi-detail").querySelector("[data-image-viewer]");
          if (viewer) viewer.innerHTML = `<img src="${escapeHtml(previewButton.dataset.previewImage)}" alt="地点图片预览">`;
          $("#poi-detail").querySelectorAll("[data-preview-image]").forEach((button) => button.classList.toggle("is-active", button === previewButton));
          return;
        }
        if (openDay) return selectDay(openDay.dataset.openDay);
        if (selectDayButton) return selectDay(selectDayButton.dataset.selectDay, { keepPlace: true, preserveMapView: true });
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
        if (event.target.matches("[data-assign-select]")) {
          const poiId = event.target.dataset.poiId;
          const currentDayId = assignedDayId(poiId);
          const nextDayId = event.target.value;
          if (nextDayId === currentDayId) return;
          requestAction(assignmentAction(poiId, currentDayId, nextDayId));
        }
      });

      $("#cancel-impact").addEventListener("click", cancelImpactDialog);
      $("#confirm-impact").addEventListener("click", () => {
        if (pendingAction) commitAndRender(pendingAction);
      });
      $("#close-replan").addEventListener("click", closeReplanDialog);
      $("#copy-replan").addEventListener("click", copyReplanPrompt);
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!$("#impact-dialog").hidden) cancelImpactDialog();
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
      loadCommonsImages,
    };
  }

  root.TripMapCore = { mount };
})(typeof globalThis !== "undefined" ? globalThis : window);
