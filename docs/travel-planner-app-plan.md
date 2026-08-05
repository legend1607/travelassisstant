# 旅行规划 Web 应用 — 完整实现计划（融合双技能版）

## 概要

基于两个已安装技能构建一个**个人使用的旅行规划 Web 应用**：
- `trip-map-builder`（三阶段方法论 + 简单 HTML 模板 + 小红书/大众点评 CDP 调研）
- `interactive-trip-planner`（六阶段工作流 + 富交互地图模板 + 品味模板 + 区域来源包 + 验证脚本）

将两个技能的方法论和资产转译为人机交互的 SPA，集成**高德地图 JS API 2.0**、**小红书 CDP 调研**和**美团数据调研**，无需注册登录，数据存 localStorage。

**项目生成路径**：`/workspace/travelassisstant`（对应用户本地 `C:\Users\LEGEND\Desktop\travelassisstant`）

## 双技能融合策略

### 各取所长

| 维度 | trip-map-builder 贡献 | interactive-trip-planner 贡献 | 融合决策 |
|------|----------------------|-------------------------------|----------|
| 工作流 | 三阶段 Plan→Research→Build | 六阶段含用户修改闭环 | 采用六阶段，保留 trip-map-builder 的四拍交互和硬约束方法论 |
| 数据模型 | 简单 Location/Day | POI schema(contentTier/whyWorthIt/detailSections/priority enum)、event schema、routeGeometry、transitSegments、sources | 采用 interactive-trip-planner 的完整 schema |
| 地图模板 | template.html(Leaflet 简单版) | Europe public 母版(拖拽排序/优先级/搜索筛选/撤销/状态恢复) | 导出用 Europe public 母版，内部规划仍用 AMap |
| 调研 | 小红书 CDP + 大众点评 OpenCLI | 区域来源包 + 来源验证方法论 | CDP 调研技术用 trip-map-builder 的，来源验证逻辑用 interactive-trip-planner 的 |
| 品味/主题 | 无 | taste models(city-craft/food-nightlife) + theme library | 直接采用 |
| 验证 | 无 | 完整验证脚本体系 | 集成到导出管道 |
| 交互格式 | 四拍 Re-ground→Simplify→Recommend→Options | 旅行设计提案 + visitor mode | 四拍用于弹窗，提案用于主确认 |

### 关键架构变更（相比前一版计划）

1. **数据模型升级**：从简单 Location/Day 升级为 POI schema + Itinerary schema + Event schema + Sources schema
2. **导出模板更换**：从 template.html(Leaflet 简单版) 更换为 Europe public 母版（富交互、拖拽排序、优先级、搜索筛选、撤销、状态恢复）
3. **新增品味模板系统**：用户可选择 taste model 影响选点和节奏
4. **新增事件系统**：节庆/展览/市集等 date-bound events 影响路线
5. **新增来源验证**：结构化 sources.json + evidenceSources 公开呈现
6. **新增路线几何**：routeGeometry + transitSegments 替代简单 polyline
7. **新增验证管道**：导出前自动运行验证脚本
8. **工作流从三阶段升级为六阶段**：增加"用户修改"和"重排闭环"

## 现状分析

### trip-map-builder 技能

- `references/trip-planning.md` — 硬约束提取、4 类清单分组、删高风险点、四拍交互格式
- `references/xhs-research.md` — 小红书 Chrome CDP 调研（端口 9223、直接进搜索路由、拦截 API）
- `references/dianping-research.md` — 大众点评 OpenCLI 调研
- `assets/template.html` — 单文件 HTML 模板（Leaflet + 时间轴 + 导航 ActionSheet + scheme 唤起）

### interactive-trip-planner 技能

- `references/poi-schema.md` — POI 必填/推荐字段、contentTier(deep/standard/compact)、detailSections 类型化内容、priority 语义枚举、routeGeometry、transitSegments
- `references/event-schema.md` — venue/hosted/citywide 三种 scope、confirmed/announced/program-pending/historical-lead 四种 status、routeImpact
- `references/core-interaction-contract.md` — Europe direct-copy interaction v1 交互合同（四项任务、拖拽排序、状态恢复）
- `references/map-feature-contract.md` — Core/Enhancement/Visual 分层功能合同
- `references/map-standards.md` — 地图产物标准（路线边界、页面语言、验证要求）
- `references/planning-workflow.md` — 六阶段规划流程、visitor mode、旅行设计提案结构、日内动线验收
- `references/hybrid-taste-models.md` — 品味模板运行规则（一主一辅、视觉边界）
- `references/source-verification.md` — 来源验证方法论
- `references/regional-source-packs.md` — 区域来源包（Global/中国/日本/法语区）
- `assets/guide-template-europe-public/` — Europe 公开母版（富交互地图）
- `assets/guide-template/` — 轻量模板（低保真原型）
- `assets/taste-models/` — city-craft-rhythm + food-nightlife-locality
- `assets/source-packs/` — 4 个区域来源包
- `assets/themes/` — architectural-collage 主题
- `scripts/` — 完整验证脚本体系

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 前端框架 | React 18 + TypeScript + Vite | 现代化、生态丰富、Vite 极速 HMR |
| 样式 | TailwindCSS + CSS 变量 | 复用设计令牌 |
| 状态管理 | Zustand + persist | 轻量、原生 localStorage 同步 |
| 地图（内部规划） | 高德地图 JS API 2.0 | POI 搜索、路线规划、中文地址准确 |
| 地图（导出） | Europe public 母版（Leaflet 富交互） | 拖拽排序/优先级/搜索/撤销/状态恢复，无 key 依赖 |
| 后端 | Express + chrome-remote-interface | 代理小红书 CDP + 美团 CDP |
| 存储 | localStorage | 个人使用数据量小 |
| 数据模型 | interactive-trip-planner 的 POI/Itinerary/Event/Sources schema | 比 trip-map-builder 的简单模型丰富得多 |
| 品味模板 | interactive-trip-planner 的 taste models | 影响选点和节奏 |
| 验证 | interactive-trip-planner 的验证脚本 | 导出前自动校验数据完整性 |

## 项目目录结构

```
travelassisstant/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
│
├── client/                         # React SPA
│   ├── package.json
│   ├── vite.config.ts              # 代理 /api → localhost:3001
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── TripsListPage.tsx        # /trips — 行程列表
│   │   │   ├── TripSetupPage.tsx       # /trips/new — 新建向导（阶段一）
│   │   │   ├── PlannerPage.tsx         # /trips/:id — 规划主页（阶段二+三）
│   │   │   ├── ResearchPage.tsx        # /trips/:id/research/:poiId — 调研（阶段二）
│   │   │   ├── MapPage.tsx             # /trips/:id/map — 交互地图（阶段四+五）
│   │   │   └── ExportPage.tsx          # /trips/:id/export — 导出（阶段六）
│   │   ├── components/
│   │   │   ├── layout/                  # AppShell, Header, TabBar
│   │   │   ├── map/
│   │   │   │   ├── AMapView.tsx            # 高德地图（内部规划用）
│   │   │   │   ├── MapController.tsx
│   │   │   │   ├── DayMarkers.tsx
│   │   │   │   └── RouteOverlay.tsx
│   │   │   ├── planner/
│   │   │   │   ├── DayTabs.tsx
│   │   │   │   ├── DayColumn.tsx           # 含 routeStops + candidates
│   │   │   │   ├── POICard.tsx             # 替代 LocationCard，支持 contentTier
│   │   │   │   ├── POIEditor.tsx           # 含 detailSections 编辑
│   │   │   │   ├── POIDetailPanel.tsx      # 统一地点详情（whyWorthIt + detailSections）
│   │   │   │   ├── MealSlotSuggester.tsx
│   │   │   │   ├── AreaGrouper.tsx
│   │   │   │   ├── RiskChecker.tsx
│   │   │   │   ├── TransitSegmentEditor.tsx # 相邻交通编辑
│   │   │   │   ├── EventPanel.tsx          # 节庆/展览事件面板
│   │   │   │   └── DesignProposalView.tsx  # 旅行设计提案展示
│   │   │   ├── research/
│   │   │   │   ├── POISearchPanel.tsx
│   │   │   │   ├── XHSNoteList.tsx
│   │   │   │   ├── XHSNoteDetail.tsx
│   │   │   │   ├── MeituanResultList.tsx
│   │   │   │   ├── MeituanShopCard.tsx
│   │   │   │   ├── SourceVerificationPanel.tsx # 来源验证面板
│   │   │   │   ├── EvidenceSourceList.tsx      # evidenceSources 展示
│   │   │   │   └── ResearchVerdictForm.tsx
│   │   │   ├── taste/
│   │   │   │   ├── TasteModelPicker.tsx       # 品味模板选择器
│   │   │   │   └── TasteModelSummary.tsx      # 模板影响说明
│   │   │   ├── export/
│   │   │   │   ├── EuropeMapPreview.tsx       # Europe 母版预览（iframe）
│   │   │   │   ├── DesignSystemPicker.tsx
│   │   │   │   ├── ThemePicker.tsx            # 主题选择（architectural-collage 等）
│   │   │   │   └── ValidationReport.tsx       # 验证报告展示
│   │   │   ├── assistant/
│   │   │   │   ├── FourBeatDialog.tsx         # 四拍交互对话框（弹窗级）
│   │   │   │   ├── ConfirmCutDialog.tsx
│   │   │   │   └── ModificationSummary.tsx    # 修改汇总（阶段五）
│   │   │   └── ui/                      # Button, Card, Modal, ActionSheet, Chip, Form
│   │   ├── hooks/
│   │   │   ├── useAMap.ts
│   │   │   ├── useTrip.ts
│   │   │   ├── usePOISearch.ts
│   │   │   ├── useXHSResearch.ts
│   │   │   ├── useMeituanResearch.ts
│   │   │   ├── useTasteModel.ts             # 品味模板推荐
│   │   │   ├── useSourcePack.ts             # 区域来源包
│   │   │   ├── useRoutePlanning.ts
│   │   │   ├── useExport.ts
│   │   │   └── useValidation.ts             # 验证脚本
│   │   ├── lib/
│   │   │   ├── amap/                    # loader, placeSearch, autoComplete, routing, geocoder
│   │   │   ├── storage/                 # db, schema, migrations
│   │   │   ├── planner/
│   │   │   │   ├── constraints.ts         # 硬约束提取（trip-map-builder 方法论）
│   │   │   │   ├── grouping.ts            # 4 类清单分组
│   │   │   │   ├── riskCheck.ts           # 高风险检测
│   │   │   │   ├── areaCluster.ts         # 区域聚类
│   │   │   │   ├── mealSuggest.ts         # 餐位推荐
│   │   │   │   ├── visitorMode.ts         # visitor mode 判定（新）
│   │   │   │   ├── dailyRouteVerify.ts    # 日内动线验收（新）
│   │   │   │   ├── tasteModelRuntime.ts   # 品味模板运行时（新）
│   │   │   │   ├── sourcePackRuntime.ts   # 来源包运行时（新）
│   │   │   │   └── modificationSummary.ts # 修改汇总生成（新）
│   │   │   ├── xhs/                     # client (fetch 封装)
│   │   │   ├── meituan/                 # client, scheme
│   │   │   ├── export/
│   │   │   │   ├── europeTemplate.ts      # Europe 公开母版字符串化（新）
│   │   │   │   ├── render.ts              # 行程数据 → Europe HTML 渲染
│   │   │   │   ├── designTokens.ts        # 设计令牌
│   │   │   │   ├── themeRenderer.ts       # 主题渲染（新）
│   │   │   │   ├── validationRunner.ts    # 验证脚本运行器（新）
│   │   │   │   └── download.ts
│   │   │   ├── geo/                     # coordTransform, distance, bounds
│   │   │   └── utils/                   # id, time, color, format
│   │   ├── store/
│   │   │   ├── tripsStore.ts
│   │   │   ├── currentTripStore.ts
│   │   │   ├── uiStore.ts
│   │   │   ├── xhsCacheStore.ts
│   │   │   ├── meituanCacheStore.ts
│   │   │   └── modificationStore.ts       # 修改记录 + 撤销快照（新）
│   │   ├── styles/                      # tokens.css, global.css
│   │   └── types/
│   └── public/
│
├── server/                          # 轻量 Express CDP 代理
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── xhs.ts
│   │   │   ├── meituan.ts
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── cdp/
│   │   │   │   ├── CDPBridge.ts             # 共享 CDP 封装
│   │   │   │   ├── XhsNavigator.ts
│   │   │   │   ├── XhsSearchInterceptor.ts
│   │   │   │   ├── XhsDetailExtractor.ts
│   │   │   │   ├── MeituanNavigator.ts
│   │   │   │   ├── MeituanSearchExtractor.ts
│   │   │   │   └── MeituanShopExtractor.ts
│   │   │   └── cache/lruCache.ts
│   │   └── middleware/                     # rateLimit, errorHandler
│   └── .env.example
│
├── shared/                         # 前后端共享类型
│   └── types.ts                    # 采用 interactive-trip-planner 的 POI/Event/Sources schema
│
└── skill-assets/                   # 从两个技能复制的静态资产
    ├── trip-map-builder/
    │   └── template.html           # 备用简单模板
    └── interactive-trip-planner/
        ├── guide-template-europe-public/  # Europe 公开母版
        ├── guide-template/                # 轻量模板
        ├── taste-models/                  # 品味模板
        ├── source-packs/                  # 区域来源包
        ├── themes/                        # 主题库
        └── scripts/                       # 验证脚本
```

## 数据模型（采用 interactive-trip-planner schema）

核心类型定义在 `shared/types.ts`，前后端共享：

### POI（地点）

```typescript
type ContentTier = 'deep' | 'standard' | 'compact';
type Priority = 'must' | 'preferred' | 'nearby' | 'archive' | 'pending' | 'booked' | '';
type POICategory = 'sight' | 'museum' | 'art' | 'food' | 'bar' | 'coffee' | 'dessert' 
                  | 'market' | 'shopping' | 'hotel' | 'transport' | 'nature' | 'winery' | 'night' | 'backup';
type MealRole = 'formal-dinner' | 'local-classic' | 'neighborhood-bistro' | 'market-snack' 
              | 'coffee-break' | 'dessert' | 'bar-before-light-meal' | 'backup';
type LodgingRole = 'base' | 'transfer' | 'night-safety' | 'parking' | 'airport' | 'station' | 'resort';

interface POI {
  // 必填
  id: string;
  name: string;
  name_zh?: string;
  city: string;
  area?: string;
  category: POICategory;
  priority: Priority;
  coords: [number, number];          // [lat, lng] WGS-84
  note?: string;                      // 旧字段兼容
  plan?: string;
  tip?: string;
  source?: string;                    // 旧字段兼容

  // 内容深度（新）
  contentTier?: ContentTier;
  whyWorthIt?: string;               // 价值陈述（deep/standard 必填）
  detailSections?: DetailSection[];   // 类型化现场动作

  // 推荐字段
  day?: string;
  timeWindow?: string;
  reservation?: string;
  officialUrl?: string;
  bookingUrl?: string;
  mapUrl?: string;
  priceLevel?: string;
  duration?: string;
  durationMinutes?: number;
  timeWindows?: string[];
  visitRole?: string;
  hardConstraints?: string[];
  fallbackFor?: string;
  themeTags?: string[];
  mealRole?: MealRole;
  lodgingRole?: LodgingRole;
  reservationDifficulty?: 'low' | 'medium' | 'high' | 'unknown';
  bestForDayPart?: string;
  partyFit?: string;
  hotelRationale?: string;
  hotelTradeoffs?: string;
  returnSafety?: string;
  nearbyFallbacks?: string[];
  eventRefs?: string[];               // 关联 events.json 中的活动 id

  // 来源（新）
  sourceIds?: string[];               // 内部关联键，解析到 sources.json

  // 调研结果
  research?: POIResearch;

  // 高德 POI
  amapPoi?: AMapPOI;

  // 美团/小红书外链（保留 trip-map-builder 字段）
  xhs?: string;
  xhsKeyword?: string;
  dianping?: string | false;
  dianpingKeyword?: string;
  meituan?: string;
  meituanKeyword?: string;
  reserve?: string;
  gmap?: string;
}

interface DetailSection {
  title: string;
  body?: string;
  items?: string[];
}

interface POIResearch {
  xhsNotes?: XHSNote[];
  xhsVerdict?: string;
  meituanSummary?: string;
  dianpingSummary?: string;
  researchedAt: number;
}
```

### Itinerary（每日行程）

```typescript
interface ItineraryDay {
  id: string;
  date: string;                       // ISO date
  title: string;
  city: string;
  summary: string;
  anchors: string[];                  // 1-3 个主锚点 POI id
  routeStops: RouteStop[];
  candidates: string[];               // 同日可替换/补充 POI id
  transitSegments?: TransitSegment[];
  routeGeometry?: [number, number][]; // [lng, lat] GeoJSON 顺序
  routeGeometryMode?: string;
  routeGeometrySource?: string;
  routeGeometryReviewedAt?: string;
  routeReview?: {
    fixedConstraints: string[];
    sequenceRationale: string;
    intentionalDetours: string[];
    routingMethod: string;
  };
}

interface RouteStop {
  poiId: string;
  order: number;                      // 正整数，hotel 可为 0
  time?: string;
  role?: string;                      // 'anchor' 等
}

interface TransitSegment {
  fromPoiId: string;
  toPoiId: string;
  mode: string;                       // '步行'/'地铁'/'驾车'
  minutes?: number;
  label: string;                      // 移动说明
}
```

### Event（日期绑定事件）

```typescript
type EventScope = 'venue' | 'hosted' | 'citywide';
type EventStatus = 'confirmed' | 'announced' | 'program-pending' | 'historical-lead';
type RouteImpact = 'anchor' | 'candidate' | 'nearby' | 'avoidance';

interface TripEvent {
  id: string;
  name: string;
  name_zh?: string;
  scope: EventScope;
  city: string;
  status: EventStatus;
  startsAt: string;                   // ISO datetime 或 YYYY-MM-DD
  endsAt: string;
  venuePoiId?: string;
  hostPoiId?: string;
  affectedCities?: string[];
  routeImpact: RouteImpact;
  whyWorthIt: string;
  plan: string;
  tip: string;
  officialUrl: string;
  sourceIds: string[];
  coords?: [number, number];
  recheckAt?: string;
}
```

### Sources（来源验证）

```typescript
interface Source {
  id: string;
  title: string;
  url: string;
  type: string;                       // 'official'/'editorial'/'booking' 等
  role?: string;
  language?: string;
  supports?: string[];
  checkedAt?: string;
  status?: string;
  recheckBefore?: string;
  access?: { class: 'A' | 'B' | 'C'; fallback?: string[] };
}

// 公开呈现的来源（evidenceSources）
interface EvidenceSource {
  title: string;
  url: string;
  type: string;
  role?: string;
  language?: string;
  supports?: string[];
  checkedAt?: string;
  status?: string;
}
```

### Trip（完整行程）

```typescript
interface Trip {
  id: string;
  title: string;
  subtitle: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;

  // 阶段一产物
  constraints: TripConstraints;
  preferences: TravelerPreferences;
  hotel: HotelInfo;
  wishlist: WishlistItem[];
  cutItems: CutItem[];
  visitorMode: VisitorMode;           // 新：first-visit/return-visit/landmark-light/local-only/balanced-visitor
  tasteModel?: TasteModelSelection;   // 新：品味模板选择
  designProposal?: DesignProposal;     // 新：旅行设计提案

  // 阶段二产物
  pois: POI[];                        // 地点池
  events: TripEvent[];                // 日期绑定事件
  sources: Source[];                  // 来源验证

  // 阶段三产物
  days: ItineraryDay[];

  // 阶段五产物
  modifications: ModificationRecord[];

  // 元数据
  overview: OverviewInfo;
  paymentNotes: PaymentNote[];
  designTokens?: DesignTokens;
}

type VisitorMode = 'first-visit' | 'return-visit' | 'landmark-light' | 'local-only' | 'balanced-visitor' | 'unknown';

interface TasteModelSelection {
  primary: string;                    // 'city-craft-rhythm' | 'food-nightlife-locality'
  secondary?: string;                 // 辅模板
  skipped: boolean;
}

interface DesignProposal {
  mainTheme: string;
  segments: Array<{ name: string; description: string }>;
  concurrentEvents: string;
  tradeoffs: string;
  hotelLogic: string;
  mealLogic: string;
  dailySkeleton: string;
  visitorBalance: string;
  mapMood: string;
  pendingConfirmations: string[];
}

interface ModificationRecord {
  id: string;
  type: 'priority' | 'add' | 'remove' | 'move' | 'reorder';
  poiId: string;
  fromDay?: string;
  toDay?: string;
  fromPriority?: Priority;
  toPriority?: Priority;
  fromOrder?: number;
  toOrder?: number;
  timestamp: number;
}
```

localStorage key：`trip-planner:trips`、`trip-planner:xhs-cache`、`trip-planner:meituan-cache`。

## 六阶段工作流设计

### 路由与阶段映射

| 路径 | 页面 | 阶段 | 职责 |
|------|------|------|------|
| `/trips` | TripsListPage | — | 行程列表 |
| `/trips/new` | TripSetupPage | 阶段一 | 理解旅行方向，收集约束，生成设计提案，选择品味模板 |
| `/trips/:id` | PlannerPage | 阶段二+三 | 寻找地点 + 规划每日行程 |
| `/trips/:id/research/:poiId` | ResearchPage | 阶段二 | 单地点的高德 POI + 小红书 + 美团调研 |
| `/trips/:id/map` | MapPage | 阶段四+五 | 交互地图浏览 + 用户修改 |
| `/trips/:id/export` | ExportPage | 阶段六 | 导出独立 HTML + 验证 |

### 阶段一：理解并确认旅行方向

融合 trip-map-builder 的硬约束方法论 + interactive-trip-planner 的设计提案结构。

**TripSetupPage 向导流程**：
1. 收集硬约束（日期、航班、酒店、人数、偏好）— Smart skip 已填字段
2. 判定 visitor mode（到访史未知时暂定 balanced-visitor）
3. 推荐品味模板（调 `tasteModelRuntime.ts`，基于用户偏好匹配 city-craft-rhythm / food-nightlife-locality）
4. 生成旅行设计提案（主线、行程段、取舍、酒店逻辑、吃饭逻辑、每日骨架、游客平衡、待确认项）
5. 用户确认主方向 → 进入阶段二

**四拍交互**：所有需要用户决策的弹窗使用 FourBeatDialog（Re-ground → Simplify → Recommend → Options）。

### 阶段二：寻找适合用户的地点

融合 trip-map-builder 的 CDP 调研技术 + interactive-trip-planner 的来源验证方法论。

**地点搜索流程**：
1. 建立搜索任务单（日期、区域、主题、品味模板、地点角色覆盖）
2. 选择区域来源包（Global Base + 匹配的地区包）
3. 多语言搜索（中文 + 英文 + 当地语言）
4. 高德 PlaceSearch 补充 POI 坐标和地址
5. 小红书 CDP 调研（氛围、近期体验、拍照）
6. 美团 CDP 调研（评分、人均、团购优惠）
7. 来源验证（官方旅游、文化日历、地点官网、订位入口）
8. 按体验角色补候选（主题锚点、代表性景点、当地生活、酒店基地、正式餐、地方经典、小吃、咖啡甜品、夜间体验、休息点、交通节点、天气替代）
9. 分配 contentTier（主锚点 deep / 支撑 standard / 候选 compact）
10. 事件扫描写入 events.json

**POICard** 替代原 LocationCard，支持 contentTier 分层展示和 detailSections 类型化内容。

**SourceVerificationPanel** 让用户看到每个地点的来源验证状态。

### 阶段三：规划每日行程

融合 trip-map-builder 的选点原则 + interactive-trip-planner 的日内动线验收。

**规划流程**：
1. 放入硬约束（航班、已预约、节庆、闭馆日）
2. 设计城市段和住宿基地
3. 每天安排 1-3 个主锚点（visitor mode 影响代表性景点数量）
4. 餐厅按当天区域和体力安排
5. 建立备选地点池
6. **日内动线验收**（新）：列固定时间窗 → 列完整时间线 → 记录每对相邻地点交通 → 4+ 停靠点比较两种顺序 → 解释有意折返
7. 生成 routeGeometry（高德路线规划 API）
8. 生成 transitSegments（每对相邻地点的移动说明）

### 阶段四：制作动态地图

**关键变更**：导出模板从 template.html 更换为 Europe 公开母版。

**Europe 母版核心能力**（直接复用 `assets/guide-template-europe-public/`）：
- 全程总览：旅行骨架、每日路线、地点速查、筛选、地图分布
- 某一天：连续日期栏、当天有序地点、相邻交通、正式路线、顺路候选
- 统一地点详情：whyWorthIt → detailSections → plan → tip → evidenceSources → 官网/预约/地图入口
- 修改与重排：加入/移出、优先级、同日拖拽排序（44px 手柄、160ms 长按、插入线、边缘自动滚动）
- 状态恢复：刷新后恢复日期、详情、筛选、图层、优先级、顺序
- 修改汇总 + "请 Codex 重新安排"请求生成

**MapPage** 嵌入 Europe 母版的 HTML 到 iframe，通过 postMessage 通信实现数据传递和修改回调。

### 阶段五：让用户在地图中调整

**用户可完成的操作**：
- 浏览全程、切换某一天、查看统一地点详情
- 标记优先级（必去/优先去/顺路可去/留档/待复核/已预约）
- 把候选加入同城未满的一天、移出、拖拽排序
- 撤销上一步
- 查看修改汇总（改了几个地点、影响哪些日期、哪天可能过满/折返/跨区）
- "请 Codex 重新安排"生成可复制的自然语言请求

**ModificationSummary** 组件展示修改记录和受影响日期。

**modificationStore** 管理修改记录 + 撤销快照。

### 阶段六：根据反馈重新安排 + 导出

**重排流程**：
1. 汇总全部修改和受影响日期
2. 重新检查营业时间、预约、交通、同日容量、酒店基地、吃饭休息
3. 更新 pois/itinerary/events/sources/地图
4. 运行验证脚本

**导出流程**：
1. Trip 数据 → `renderTripToEuropeHtml(trip)` 生成完整 HTML
2. 替换 Europe 母版中的 `PUBLIC_TRIP_DATA`、旅行者文案、storage key、设计变量
3. 应用品味模板的视觉倾向（色彩、marker、路线风格）
4. 应用主题（architectural-collage 等）
5. 运行验证脚本（validate-trip-data / validate-europe-derived-map / validate-design-tokens）
6. `ValidationReport` 展示验证结果
7. 下载或复制

## 高德地图集成方案

### 内部规划用（不变）

使用 `@amap/amap-jsapi-loader`，加载插件：PlaceSearch、AutoComplete、Driving、Walking、Transfer、DragRoute、Geocoder、Geolocation。

### 新增：路线几何生成

```typescript
// lib/amap/routing.ts
async function generateRouteGeometry(stops: POI[]): Promise<{
  geometry: [number, number][];  // [lng, lat] GeoJSON 顺序
  mode: string;
  segments: TransitSegment[];
}> {
  const [lat, lng] = wgs84ToGcj02(stops[0].coords[0], stops[0].coords[1]);
  // 使用 AMap.Driving/Walking 逐段规划
  // 收集每段路径坐标，合并为完整 routeGeometry
  // 生成 transitSegments（mode/minutes/label）
}
```

### 坐标系统

- 存储层统一 WGS-84（`coords: [lat, lng]`）
- AMap 交互时双向转换
- routeGeometry 用 GeoJSON 顺序 `[lng, lat]`（与 POI 的 `[lat, lng]` 不同，需注意）
- 导出到 Europe 母版时用 WGS-84（Leaflet 用 `[lat, lng]`）

## 小红书 + 美团集成方案

（与前一版计划一致，不变）

后端 API：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/xhs/health` | 检测小红书 CDP 与登录态 |
| POST | `/api/xhs/search` | 搜索笔记（粗筛） |
| POST | `/api/xhs/note` | 详情提取（精读） |
| GET | `/api/meituan/health` | 检测美团 CDP |
| POST | `/api/meituan/search` | 搜索餐厅 |
| POST | `/api/meituan/shop` | 店铺详情 |

CDP 流程、缓存限流、前端流程均与前一版一致。

## 品味模板系统（新）

### 集成方式

1. 复制 `assets/taste-models/` 到 `skill-assets/interactive-trip-planner/taste-models/`
2. `lib/planner/tasteModelRuntime.ts` 封装 `recommend-taste-models.js` 的逻辑
3. `TasteModelPicker` 组件在阶段一展示推荐
4. 选中的模板影响：
   - 选点倾向（city-craft 强化建筑/手艺/市场；food-nightlife 强化地方饮食/夜间）
   - 节奏（city-craft 留白多；food-nightlife 晚间半径短）
   - 视觉倾向（色彩、marker、信息密度）→ 写入 designTokens

### 一主一辅规则

- 主模板负责选点和节奏
- 辅模板只补一个明确领域或视觉倾向
- 用户可跳过模板选择

## 区域来源包系统（新）

### 集成方式

1. 复制 `assets/source-packs/` 到 `skill-assets/interactive-trip-planner/source-packs/`
2. `lib/planner/sourcePackRuntime.ts` 封装来源包查询
3. `useSourcePack` hook 在阶段二使用
4. 根据目的地国家选择来源包（CN→china-mainland, JP→japan, FR/BE→france-belgium, 其他→global-base）
5. 来源包提供：十类查询意图、具名本地编辑源、搜索词模板

## 验证管道（新）

### 集成方式

1. 复制 `scripts/` 到 `skill-assets/interactive-trip-planner/scripts/`
2. `lib/export/validationRunner.ts` 封装验证脚本调用
3. 导出前自动运行：

```bash
node scripts/validate-trip-data.js --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json> --require-route-evidence --strict-routes
node scripts/validate-trip-events.js --events <events.json> --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json>
node scripts/validate-design-tokens.js <design-tokens.json>
node scripts/validate-europe-derived-map.js <itinerary-map.html>
```

4. `ValidationReport` 组件展示验证结果（通过/警告/错误）
5. 验证失败时阻止导出或给出明确警告

## 行程规划逻辑转化（融合双技能）

| 方法论来源 | 应用功能 | 实现位置 |
|------------|----------|----------|
| trip-map-builder: 抽硬约束 | TripSetupPage 向导 | `lib/planner/constraints.ts` |
| trip-map-builder: 4 类清单分组 | AreaGrouper | `lib/planner/grouping.ts` |
| trip-map-builder: 删高风险点 | RiskChecker + FourBeatDialog | `lib/planner/riskCheck.ts` |
| trip-map-builder: 四拍交互 | FourBeatDialog 通用组件 | `components/assistant/FourBeatDialog.tsx` |
| trip-map-builder: Smart skip | 表单已填字段跳过 | `routes/TripSetupPage.tsx` |
| trip-map-builder: 小红书 CDP | useXHSResearch | `lib/xhs/` + server CDP |
| interactive-trip-planner: visitor mode | visitorMode 判定 | `lib/planner/visitorMode.ts` |
| interactive-trip-planner: 旅行设计提案 | DesignProposalView | `components/planner/DesignProposalView.tsx` |
| interactive-trip-planner: taste model | TasteModelPicker | `lib/planner/tasteModelRuntime.ts` |
| interactive-trip-planner: contentTier | POICard 分层展示 | `components/planner/POICard.tsx` |
| interactive-trip-planner: detailSections | POIDetailPanel 类型化内容 | `components/planner/POIDetailPanel.tsx` |
| interactive-trip-planner: priority 语义枚举 | POICard 优先级 chips | `components/planner/POICard.tsx` |
| interactive-trip-planner: event schema | EventPanel | `components/planner/EventPanel.tsx` |
| interactive-trip-planner: 来源验证 | SourceVerificationPanel | `components/research/SourceVerificationPanel.tsx` |
| interactive-trip-planner: 日内动线验收 | dailyRouteVerify | `lib/planner/dailyRouteVerify.ts` |
| interactive-trip-planner: routeGeometry | 路线几何生成 | `lib/amap/routing.ts` |
| interactive-trip-planner: transitSegments | 相邻交通编辑 | `components/planner/TransitSegmentEditor.tsx` |
| interactive-trip-planner: 修改闭环 | ModificationSummary + modificationStore | `store/modificationStore.ts` |
| interactive-trip-planner: Europe 母版 | MapPage + 导出 | `lib/export/europeTemplate.ts` |
| interactive-trip-planner: 验证脚本 | validationRunner | `lib/export/validationRunner.ts` |
| interactive-trip-planner: 主题库 | ThemePicker | `lib/export/themeRenderer.ts` |

## 导出功能（升级为 Europe 母版）

### 模板策略

将 `assets/guide-template-europe-public/` 完整复制到 `skill-assets/`，导出时：
1. 复制整套 `maps/` 目录
2. 替换 `PUBLIC_TRIP_DATA`（行程数据、地点、事件、来源）
3. 替换旅行者文案（标题、摘要、按钮文字）
4. 设置独立 storage key
5. 应用设计变量（design tokens + 主题 CSS）

### Europe 母版核心交互（必须保留）

- 全程总览 + 某一天 + 统一地点详情 三级浏览
- 连续日期栏切换
- 拖拽排序（44px 手柄、160ms 长按、插入线、边缘自动滚动）
- 优先级修改（必去/优先去/顺路可去/留档/待复核/已预约）
- 加入/移出地点
- 搜索与筛选（城市/区域、类别、优先级、行程归类）
- 图层开关（行程图层 + 分类图层）
- 撤销上一步
- 状态恢复（刷新后恢复）
- 修改汇总 + "请 Codex 重新安排"
- 路线几何 vs 顺序参考虚线

### 备用模板

保留 `assets/guide-template/`（轻量模板）用于低保真原型或简单地图。

## 假设与决策

1. **高德 API key 由用户自行申请**，通过 `.env` 配置
2. **小红书/美团需要用户本地启动带调试口的 Chrome**（端口 9223）
3. **美团集成分两层**：scheme 链接唤起（必做）+ CDP 数据抓取（进阶）
4. **大众点评保留 scheme 链接**，与美团并列
5. **导出用 Europe 公开母版**（替代原 template.html），获得富交互能力
6. **内部规划用 AMap**，导出用 Leaflet（Europe 母版内置），通过坐标转换桥接
7. **数据模型采用 interactive-trip-planner 的完整 schema**（POI/Event/Sources/Itinerary）
8. **品味模板和区域来源包从技能资产复制**到 `skill-assets/` 目录
9. **验证脚本从技能资产复制**，集成到导出管道
10. **不引入用户认证**，所有数据存 localStorage
11. **项目路径**：`/workspace/travelassisstant`

## 实施阶段

### 阶段 A — 骨架搭建 + 资产复制
1. 初始化 monorepo（pnpm workspace + tsconfig + ESLint）
2. client: Vite + React + TS + TailwindCSS + Zustand 骨架
3. server: Express + cors + 健康检查
4. Vite 代理 /api → localhost:3001
5. 复制技能资产到 `skill-assets/`（Europe 母版、taste-models、source-packs、themes、scripts）
6. `shared/types.ts` 完整类型定义（POI/Event/Sources/Itinerary/Trip）
7. localStorage db.ts + tripsStore + modificationStore

### 阶段 B — 阶段一：理解旅行方向
1. TripSetupPage 向导（硬约束 + 偏好 + 心愿单）
2. visitorMode 判定逻辑
3. tasteModelRuntime.ts + TasteModelPicker
4. DesignProposalView 旅行设计提案
5. FourBeatDialog 通用组件
6. TripsListPage 列表

### 阶段 C — 阶段二+三：地点寻找与每日规划
1. POICard + POIEditor + POIDetailPanel（contentTier/detailSections）
2. AreaGrouper + RiskChecker
3. constraints.ts + grouping.ts + riskCheck.ts
4. dailyRouteVerify.ts 日内动线验收
5. EventPanel 事件面板
6. TransitSegmentEditor
7. PlannerPage 主工作区（AMap + DayTabs + DayColumn）
8. sourcePackRuntime.ts 区域来源包

### 阶段 D — 高德地图集成
1. AMapLoader 单例 + AMapView
2. AutoComplete + PlaceSearch
3. DayMarkers 按天绘制
4. 坐标转换
5. 路线几何生成（routeGeometry + transitSegments）
6. ActionSheet 导航三选
7. 定位控件

### 阶段 E — 小红书 + 美团 CDP 集成
1. server: CDPBridge 单例
2. server: XhsNavigator + XhsSearchInterceptor + /api/xhs/*
3. server: MeituanNavigator + MeituanSearchExtractor + /api/meituan/*
4. client: useXHSResearch + useMeituanResearch
5. client: ResearchPage + XHSNoteList + MeituanResultList
6. client: SourceVerificationPanel + EvidenceSourceList
7. client: ResearchVerdictForm
8. 缓存 + 限流

### 阶段 F — 阶段四+五：交互地图
1. europeTemplate.ts 字符串化 Europe 母版
2. MapPage 嵌入 iframe + postMessage 通信
3. 修改回调处理（优先级/加入/移出/排序）
4. modificationStore 修改记录 + 撤销快照
5. ModificationSummary 修改汇总
6. "请 Codex 重新安排"请求生成
7. 状态恢复

### 阶段 G — 阶段六：导出与验证
1. render.ts 行程数据 → Europe HTML 渲染
2. designTokens.ts + themeRenderer.ts 设计系统/主题
3. validationRunner.ts 验证脚本运行
4. ValidationReport 验证报告
5. ExportPage 预览 + 下载
6. 端到端坐标转换验证
7. 完整验证清单

## 验证步骤

### 环境搭建
- `pnpm install` 成功
- `VITE_AMAP_KEY` 已配置
- Chrome 已用 `--remote-debugging-port=9223` 启动并登录小红书/美团
- `skill-assets/` 中技能资产完整

### 阶段一验证
- TripSetup 收集硬约束后自动判定 visitor mode
- TasteModelPicker 推荐 1-3 个品味模板
- DesignProposalView 展示完整提案（主线/行程段/取舍/酒店/吃饭/骨架/游客平衡）
- FourBeatDialog 弹窗遵循四拍格式
- Smart skip：已填字段后续步骤跳过

### 阶段二+三验证
- POICard 按 contentTier 分层展示（deep 有 detailSections，compact 只有 note）
- POIDetailPanel 先显示 whyWorthIt，再按顺序渲染 detailSections
- 优先级 chips 显示语义枚举（必去/优先去/顺路可去/留档/待复核/已预约）
- AreaGrouper 将点分到 4 类
- RiskChecker 检测高风险点并弹四拍确认
- EventPanel 展示节庆/展览事件
- 日内动线验收：每对相邻地点有 transitSegment
- routeGeometry 在 AMapView 上正确绘制

### 高德地图
- 酒店名输入出现 AutoComplete 联想
- POI 搜索返回坐标自动转 WGS-84 存储
- AMapView 渲染 marker（GCJ-02 转换后）
- routeGeometry 生成正确（高德路线规划）
- 导航 ActionSheet 三选

### 小红书 + 美团 CDP
- `GET /api/xhs/health` 返回 connected + loggedIn
- 搜索小红书返回 ≥10 条 notes
- XHSNoteList 显示列表 + 真店信号标签
- 精读详情返回 title/desc/author
- `GET /api/meituan/health` 返回 connected
- 搜索美团返回评分/人均/团购
- MeituanResultList 正常展示
- SourceVerificationPanel 展示来源验证状态
- ResearchVerdictForm 保存后持久化
- 缓存与限流正常

### 阶段四+五验证
- MapPage 嵌入 Europe 母版正常渲染
- 全程总览显示旅行骨架、每日路线、地点速查、筛选
- 某一天视图显示连续日期栏、有序地点、相邻交通
- 统一地点详情：whyWorthIt → detailSections → plan → tip → evidenceSources
- 拖拽排序：44px 手柄、160ms 长按、插入线、边缘自动滚动
- 优先级修改立即保存
- 加入/移出地点正常
- 撤销上一步正常
- 刷新后状态恢复
- ModificationSummary 显示修改数量和受影响日期
- "请 Codex 重新安排"生成可复制请求

### 导出与验证
- ExportPage 预览 iframe 显示完整行程（Europe 母版交互）
- 验证脚本运行：validate-trip-data / validate-europe-derived-map / validate-design-tokens
- ValidationReport 展示通过/警告/错误
- 下载的 HTML 双击打开：
  - 地图正常渲染（Leaflet + OSM）
  - 拖拽排序可用
  - 优先级修改可用
  - 搜索筛选可用
  - 撤销可用
  - 刷新后状态恢复
  - 小红书/大众点评/美团/导航按钮可用
  - 修改汇总 + "请 Codex 重新安排"可用
- 坐标位置与内部 AMap 一致
- 微信内置浏览器 scheme 降级为 https
