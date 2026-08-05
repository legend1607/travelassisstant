# POI 与 Itinerary 数据标准

## POI 必填字段

新增 POI 至少包含：

```json
{
  "id": "unique-poi-id",
  "name": "Local or English Name",
  "name_zh": "中文名",
  "city": "City",
  "area": "Neighborhood or area",
  "category": "sight",
  "priority": "preferred",
  "coords": [39.9042, 116.4074],
  "note": "为什么值得关注",
  "plan": "如何嵌入行程",
  "tip": "预约、排队、安全、营业时间或预算提示",
  "source": "资料线索或来源 id"
}
```

`coords` 使用 `[lat, lng]`。坐标可以是规划级近似定位，但出发前需要用地图、官网或订位页复核门牌和入口。

## 推荐字段

- `day`
- `timeWindow`
- `reservation`
- `officialUrl`
- `bookingUrl`
- `mapUrl`
- `imageQuery`
- `priceLevel`
- `duration`
- `durationMinutes`：规划级停留分钟数，用于加入行程前的容量提示。
- `timeWindows`：适合或可进入的时间窗口数组；需要出发前复核。
- `visitRole`：这个地点在旅行中的角色，例如文化主锚点、山线补给、天气替代。
- `hardConstraints`：预约、闭馆、天气、潜水后飞行等不能被普通排序覆盖的限制。
- `fallbackFor`
- `whyWorthIt`
- `themeTags`
- `mealRole`
- `lodgingRole`
- `reservationDifficulty`
- `returnSafety`
- `hotelRationale`
- `hotelTradeoffs`
- `eventRefs`：该地点承办特别项目时关联的活动 id 数组。活动的日期、状态、路线影响和资料来源只写在 `data/events.json`，不要复制到 POI；仅 `hosted` 活动使用其 `hostPoiId` 关联既有地点。

## 地点详情深度与类型化内容

地点详情使用三个深度级别：`deep`、`standard`、`compact`。它们控制内容投入和地图展示密度，不是地点质量评分。

```json
{
  "contentTier": "deep",
  "whyWorthIt": "一句具体说明这个地点为何值得进入本次路线。",
  "detailSections": [
    {
      "title": "到这里做什么",
      "items": ["一项可执行动作", "另一项可执行动作"]
    },
    {
      "title": "这个地方的来历",
      "body": "只有来源可靠、能帮助理解现场时才写。"
    }
  ]
}
```

- `deep`：主锚点、必去地点或用户正在深入查看的地点。必须有非空 `whyWorthIt`，并提供 2–4 个有效 `detailSections`。
- `standard`：正式路线中的支撑地点或优先候选。必须有非空 `whyWorthIt`，可以提供 0–2 个 `detailSections`。
- `compact`：顺路候选、替换项和留档。省略 `detailSections`，继续使用简洁的 `note`、`plan`、`tip`。
- 旧数据可以暂时省略 `contentTier`；地图用 `note`、`plan`、`tip` 兼容展示。新增或升级地点时再分层，不要求一次性重写整个旧地点池。

### 正式路线三层合同

正式路线采用“具体价值陈述 → 类型化现场动作 → 可解析证据”三层合同。canonical itinerary 的每个 `routeStops` 地点，以及公开母版 `defaultAssignments` 中 `order > 0` 的每个地点，都必须满足：

1. 价值陈述：`contentTier` 是 `standard` 或 `deep`；`whyWorthIt` 去除首尾空白后至少 40 个字符。validator 还会规范化文字、剥离标点与“这里、地方、很有特色、适合游客、慢慢体验、感受、当地氛围、独特城市生活节奏、值得、专门来看看、逛逛”等泛化 filler，剥离后必须保留至少 16 个实质字符，用来承载地点、品类、菜品、作品、人物、历史、空间或做法等具体信息。
2. 现场动作：至少有一个 `detailSections`；所有 section 合计至少两个有意义的 `items`。每条动作在剥离标点以及“看看、逛逛、体验一下、感受氛围”等泛化动作后，必须仍保留至少 8 个实质字符。动作应当能在现场执行或观察，`body` 可以补背景，但不能代替这两个动作。
3. 可解析证据：至少一个非空 `sourceIds`，每个 id 都必须解析到 `data/sources.json`。内部 `sourceIds` 在构建公开地图时转换为八字段 `evidenceSources`，不得把 raw `sourceIds` 暴露给旅行者。

16/8 字符规则只是防止空洞占位的最低启发式门槛，不是语义质量或事实真伪审查。通过门槛仍不证明文字具体、来源支持结论或现场动作合理；规划者必须继续人工阅读，并用 `sourceIds` 对应证据复核。

合法的非正序住宿基底（`order <= 0` 且地点类型为酒店/住宿基底）不属于游玩编号，可以不套正式路线合同；任何正序 assignment 都不能用住宿或旧数据兼容为由跳过。旧攻略可以继续通过不带 `--require-route-evidence` 的 legacy 验证，但这不等于 evidence certification。

类型化 section 使用以下矩阵，不复制同一套四段：

| 地点类型 | 适合的现场动作 section | 不应写成 |
| --- | --- | --- |
| 餐厅/小吃 | 点什么、地方菜或技法、如何组合一餐 | “吃当地美食” |
| 市场/当地生活 | 找什么食材、问什么季节信息、观察居民怎样购买或使用 | “看看鱼肉蔬菜” |
| 咖啡 | 当天豆单、冲煮或点单方式、适合停留的时段 | “喝杯咖啡” |
| 博物馆/艺术 | 重点作品或空间、参观顺序、现场细节 | “感受艺术” |
| 葡萄酒/酒吧 | 产区或风味对比、点酒方法、短半径下一站 | “体验夜生活” |
| 街区/散步 | 明确入口与结束点、街道用途变化、可观察的日常 | “随便逛逛” |
| 酒店/交通基底 | 位置效用、出发回程方法、行李和取舍 | 为了形式补故事 |

每个 `detailSections` 元素必须有非空 `title`，并包含非空 `body`，或 1–5 个非空 `items`。标题和内容由地点类型决定，不强制所有地点填写“为什么、做什么、看什么、故事”四段：

- 市场：写逛什么、买什么、观察什么；有可靠历史时再写市场与街区的故事。
- 博物馆/景点：写重点作品或空间、参观顺序、值得留意的细节；历史只保留帮助现场理解的部分。
- 餐厅：写值得点什么、地方菜或技法语境、适合哪顿饭；不虚构主厨故事。
- 咖啡/酒吧：写饮品、服务方式、空间气质、适合的时段和短半径夜间组合。
- 街区/散步：写步行顺序、街道生活、可观察的日常和必要的城市背景。
- 酒店/交通：写位置效用、使用方法与取舍，不需要为了形式补故事。

市场的 `deep` 详情在来源同时支持时，必须按“当地食材结构 → 居民如何购买、烹饪或上桌 → 行程月份的季节线索”连接具体内容。写出有辨识度的食材、菜式或使用方式，不用“本地食材很丰富”替代；当天库存、摊位供应或成熟度没有当前证据时，改写为“留意”或“询问摊主”，不要断言一定有货。

地图先显示 `whyWorthIt`，旧数据回退到 `note`；然后按数组顺序通用渲染 `detailSections`，最后显示 `plan`、`tip` 和资料入口。规划和路线计算默认只读取 id、名称、`contentTier`、`whyWorthIt`、`plan`、`tip`；完整详情只在最终交付、用户展开地点或修改已选地点时加载。

## 优先级

新数据默认使用语义枚举，界面显示中文描述：

- `must` / 必去：本次旅行核心体验，需提前安排，错过会明显遗憾。
- `preferred` / 优先去：很值得，尽量排进路线，但可根据天气、体力、预约情况替换。
- `nearby` / 顺路可去：同区域、顺路、有空再去，不为它专程绕路。
- `archive` / 留档：资料池或远期备选，不主动安排。
- `pending` / 待复核：信息不稳，等营业、票务、预约、天气或交通确认后再定。
- `booked` / 已预约：已订票、订位或确认时间，是硬约束。
- 空：未标记。

兼容旧数据时，可以把 `S/A/B/C` 映射为 `must/preferred/nearby/archive`。新生成数据不要再默认使用 `S/A/B/C`。

## 类别建议

按目的地调整类别，不要强行套模板。常用类别：

- `sight`
- `museum`
- `art`
- `food`
- `bar`
- `coffee`
- `dessert`
- `market`
- `shopping`
- `hotel`
- `transport`
- `nature`
- `winery`
- `night`
- `backup`

## Itinerary 结构

```json
[
  {
    "id": "day-1",
    "date": "2026-09-16",
    "title": "抵达与低强度街区",
    "city": "Paris",
    "summary": "抵达后只安排酒店附近轻量活动。",
    "anchors": ["hotel", "nearby-dinner"],
    "routeStops": [
      {
        "poiId": "hotel",
        "order": 1,
        "time": "18:00",
        "role": "anchor"
      }
    ],
    "candidates": ["coffee-nearby", "easy-walk"]
  }
]
```

`anchors` 建议每天 1-3 个。`routeStops` 是当天地图上显示路线顺序的核心点；`candidates` 是同日可替换或补充点。

`--strict-routes` 下，canonical `routeStops` 的每项必须是对象，包含非空 `poiId` 与真正的有限整数 `order`；字符串 stop 只在不启用 strict 的 legacy 模式兼容。排除合法住宿基底后，正整数 order 必须唯一并且完整覆盖 `1..N`；重复、缺口、字符串、分数、缺失与负数都是错误。`order: 0` 只允许引用 category 为 `hotel` / `lodging` 或明确 `lodgingRole: base` 的地点。证据验证不会把结构错误的 strict stop 认证为合格路线。

`transitSegments` 必须覆盖 `routeStops` 中每一对相邻地点：

```json
{
  "fromPoiId": "museum",
  "toPoiId": "lunch",
  "mode": "步行",
  "minutes": 12,
  "label": "沿主街步行约 0.9 公里，午餐就在前往下午主锚点的方向上"
}
```

不能用 `museum -> afternoon-anchor` 的一条记录跨过实际存在的午餐或酒店停靠。缺少复核数据时保留“这段移动尚未复核”，不能根据两点直线距离自动生成时间。

## 路线几何

需要在地图中绘制正式路线时，建议为每天保存经过路网计算或人工复核的 `routeGeometry`：

```json
{
  "routeGeometry": [
    [2.2945, 48.8584],
    [2.2961, 48.8592]
  ],
  "routeGeometryMode": "walking",
  "routeGeometrySource": "routing-source-id",
  "routeGeometryReviewedAt": "2026-07-15",
  "routeReview": {
    "fixedConstraints": ["15:30 预约导览"],
    "sequenceRationale": "上午一路向南，午餐后向北到固定导览；唯一折返是回酒店休息。",
    "intentionalDetours": ["导览后回酒店休息"],
    "routingMethod": "使用步行路网比较可行顺序，并人工复核开门和预约时间"
  }
}
```

- `routeGeometry` 遵循 GeoJSON 坐标顺序 `[lng, lat]`，与 POI 的 `[lat, lng]` 不同。
- `routeGeometryMode` 说明 `walking`、`driving`、`cycling`、`transit`、`funicular` 或混合方式。
- `routeGeometrySource` 指向 `sources.json` 中的路线来源；`routeGeometryReviewedAt` 记录最后检查日期。
- `routeReview` 保存固定约束、顺序理由、必要折返和复核方法。地图不直接展示这些字段，而是将判断改写成自然语言。
- 路线几何应在攻略生成阶段计算并保存，静态 HTML 不应携带第三方路线 API key，也不应在每次打开页面时重新请求。
- 只有地点顺序而没有真实路径几何时，可以显示编号 marker 和外部导航入口，但不能把 POI 坐标直接连成“正式路线”。
- 用户临时加入、移出或移动地点后，原路线只能显示为需要重新安排的基准路线；不得从最后一站向新增地点画一条假路线。Codex 完成重排后再更新路径几何。

## 主题、酒店和吃饭字段

`themeTags` 用于标记 POI 服务的旅行主题，例如 `gaudi-day`, `top-bars-night`, `nanyang-old-dream`, `local-market-life`。同一个 POI 可以属于多个主题。

酒店类 POI 可补充：

- `lodgingRole`：`base`, `transfer`, `night-safety`, `parking`, `airport`, `station`, `resort`
- `returnSafety`：晚间回程安全和交通说明
- `parking`：自驾停车说明
- `luggage`：行李寄存或入住退房影响
- `hotelRationale`：为什么这个酒店适合本次旅行主题和路线
- `hotelTradeoffs`：选择它会牺牲什么，例如价格、空间、交通、安静度或景观
- `nearbyFallbacks`：附近早餐、咖啡、晚餐、便利店或交通保底

餐厅、酒吧、咖啡、甜品类 POI 可补充：

- `mealRole`：`formal-dinner`, `local-classic`, `neighborhood-bistro`, `market-snack`, `coffee-break`, `dessert`, `bar-before-light-meal`, `backup`
- `reservationDifficulty`：`low`, `medium`, `high`, `unknown`
- `bestForDayPart`：`breakfast`, `lunch`, `afternoon`, `dinner`, `late-night`
- `partyFit`：多人、亲子、老人、独行或情侣是否适合

## 数据检查

完成前检查：

- POI 总数
- 分类数量
- 城市/区域数量
- 重复 `city/category/name`
- 缺失坐标、中文名、说明、来源的 POI
- `routeStops` 和 `candidates` 引用的 POI 是否存在
- 每天 `anchors` 是否超过 3 个
