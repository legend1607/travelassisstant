# Trip Guide Core Template

本目录是 `interactive-trip-planner` 的唯一地图实现起点。复制整个目录后，先替换旅行数据并通过 Core 验收，再决定是否深化图片和目的地视觉。

## 使用顺序

1. 复制整个 `assets/guide-template/` 到 `guides/<trip-slug>/`。
2. 替换 `maps/itinerary-map.html` 内的 `TRIP_DATA`。
3. 同步更新 `data/pois.json` 和 `data/itinerary.json`，确保与页面内嵌数据一致。
4. 运行数据、地图和合同验证。
5. 在桌面和手机浏览器完成总览、日期、详情、修改、撤销和重新安排测试。
6. Core 通过后，按需要补充图片、专题信息、`docs/design-language.md` 和 `data/design-tokens.json`。

不要先替换地图技术，也不要在每个攻略中重写状态规则。REDSkill 发布版的 `maps/itinerary-map.html` 已内联 Leaflet 与 Core CSS/JS，是可单独复制和打开的单个 HTML；`maps/assets/` 只保留为源码与验证参考，不再依赖单独的 Leaflet vendor 目录。

## 入口

- 地图：`maps/itinerary-map.html`
- 地点数据：`data/pois.json`
- 每日路线：`data/itinerary.json`
- 规划原则：`docs/planning-principles.md`
- 预约事项：`docs/reservations.md`
- 资料来源：`docs/sources.md`
- 当前地图行为：`docs/online-logic/map.md`

示例中的巴黎地点只用于验证功能，不是实时旅行建议。生成正式攻略时必须重新复核营业、预约、交通、同期活动和安全信息。
