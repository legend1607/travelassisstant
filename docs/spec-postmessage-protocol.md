# 补充设计：postMessage 通信协议 + 修改闭环数据流

> 精度：接口级（TypeScript 类型定义 + 状态机 + 序列化函数签名）
>
> 关联：主计划 `travel-planner-app-plan.md` 阶段四+五+六

## 通信架构

MapPage 将 Europe 母版渲染为 iframe，通过 `postMessage` 双向通信。iframe 内部运行 Europe 母版的完整 JS（`trip-map-public-core.js` 等），外部 SPA 通过消息注入数据和接收回调。

```
SPA (MapPage)                          iframe (Europe 母版)
    │                                        │
    │── INIT (trip data + config) ──────────→│
    │                                        │── 渲染地图、恢复状态
    │←── READY ──────────────────────────────│
    │                                        │
    │   用户在 iframe 内操作（拖拽/优先级/加入移出）
    │←── MODIFICATION ───────────────────────│
    │── MODIFICATION_ACK ───────────────────→│
    │                                        │
    │←── STATE_SYNC (当前日期/筛选/图层) ─────│
    │                                        │
    │   用户点击"请 Codex 重新安排"
    │←── REROUTE_REQUEST ────────────────────│
    │── REROUTE_ACK ─────────────────────────→│
    │                                        │
    │   SPA 处理重排后更新数据
    │── DATA_UPDATE (新 trip data) ──────────→│
    │                                        │── 重新渲染
```

### 安全约束

- `postMessage` 的 `targetOrigin` 必须限定为 iframe 的 origin，不使用 `'*'`
- iframe 内部 `message` 事件监听必须校验 `event.source === window.parent` 和 `event.origin`
- 序列化的 `PublicTripData` 不包含 `sourceIds`（内部键），只含 `evidenceSources`（8 字段公开呈现）

## 消息类型定义

```typescript
// shared/postMessage-protocol.ts

type MessageType =
  | 'INIT'              // SPA → iframe：注入行程数据和配置
  | 'READY'             // iframe → SPA：iframe 已加载完毕
  | 'MODIFICATION'      // iframe → SPA：用户做了修改
  | 'MODIFICATION_ACK'  // SPA → iframe：确认已处理修改
  | 'UNDO'              // iframe → SPA：用户撤销
  | 'STATE_SYNC'        // iframe → SPA：状态同步（日期/筛选/图层/选中地点）
  | 'REROUTE_REQUEST'   // iframe → SPA：生成重排请求
  | 'REROUTE_ACK'       // SPA → iframe：确认收到重排请求
  | 'DATA_UPDATE'       // SPA → iframe：SPA 重排后推送新数据
  | 'ERROR';            // iframe → SPA：iframe 内部错误

interface BaseMessage {
  type: MessageType;
  messageId: string;       // UUID v4，用于 ACK 关联
  timestamp: number;       // Date.now()
}
```

### SPA → iframe 消息

```typescript
/** 注入行程数据和配置（首次加载） */
interface InitMessage extends BaseMessage {
  type: 'INIT';
  payload: {
    tripData: PublicTripData;     // serializeTripToPublicData(trip) 的输出
    storageKey: string;           // 独立 localStorage key，如 'travelassisstant:map:{tripId}'
    language: 'zh' | 'en';        // 跟随对话语言
    designTokens?: DesignTokens;  // 可选设计令牌覆盖
    readOnly?: boolean;           // true = 导出预览模式（禁用修改控件）
  };
}

/** 确认修改已处理 */
interface ModificationAckMessage extends BaseMessage {
  type: 'MODIFICATION_ACK';
  payload: {
    accepted: boolean;
    reason?: string;              // 拒绝原因（如高影响修改用户未确认）
    newTripData?: PublicTripData; // 如果 SPA 修改了数据（如重排后）
  };
}

/** 确认收到重排请求 */
interface RerouteAckMessage extends BaseMessage {
  type: 'REROUTE_ACK';
  payload: {
    received: boolean;
    message?: string;             // "正在重新安排..." 等状态提示
  };
}

/** SPA 重排后推送新数据 */
interface DataUpdateMessage extends BaseMessage {
  type: 'DATA_UPDATE';
  payload: {
    tripData: PublicTripData;
    resetModifications: boolean;   // true = 清空修改历史（重排完成）
    resetReason?: string;          // "Codex 已重新安排路线"
  };
}
```

### iframe → SPA 消息

```typescript
/** iframe 已加载并初始化完毕 */
interface ReadyMessage extends BaseMessage {
  type: 'READY';
  payload: {
    savedState: SavedMapState | null;  // 从 localStorage 恢复的状态
  };
}

/** 用户做了修改 */
interface ModificationMessage extends BaseMessage {
  type: 'MODIFICATION';
  payload: {
    modification: ModificationRecord;     // 复用 shared/types.ts 的 ModificationRecord
    affectedDays: string[];               // 受影响日期 ID 列表
    impactLevel: 'normal' | 'high';       // normal=直接保存, high=需用户确认
    overflowWarning?: {                   // 过满/折返/跨区预警
      dayId: string;
      type: 'overfull' | 'detour' | 'cross-area';
      message: string;                    // 自然语言描述
    };
  };
}

/** 用户撤销 */
interface UndoMessage extends BaseMessage {
  type: 'UNDO';
  payload: {
    undoneModification: ModificationRecord;
    remainingHistory: number;   // 还能撤销几次（0 = 无法继续撤销）
  };
}

/** 状态同步（用户切换日期/筛选/图层/选中地点时） */
interface StateSyncMessage extends BaseMessage {
  type: 'STATE_SYNC';
  payload: {
    currentDay: string | null;           // 当前查看的日期 ID
    selectedPOIId: string | null;        // 当前选中的地点 ID
    filters: {
      city?: string;
      category?: string;
      priority?: string;
    };
    layerVisibility: {
      itinerary: boolean;                // 行程图层开关
      categories: string[];              // 已开启的分类图层
    };
  };
}

/** 重排请求（用户点击"请 Codex 重新安排"后生成） */
interface RerouteRequestMessage extends BaseMessage {
  type: 'REROUTE_REQUEST';
  payload: {
    requestText: string;            // 自然语言重排请求文本
    modifications: ModificationRecord[];  // 全部修改记录
    affectedDays: string[];         // 受影响日期
  };
}

/** iframe 内部错误 */
interface ErrorMessage extends BaseMessage {
  type: 'ERROR';
  payload: {
    code: 'RENDER_FAILED' | 'DATA_INVALID' | 'STORAGE_FULL' | 'UNKNOWN';
    message: string;
    recoverable: boolean;           // 是否可自动恢复
  };
}
```

### 联合类型

```typescript
type MapMessage =
  | InitMessage
  | ReadyMessage
  | ModificationMessage
  | ModificationAckMessage
  | UndoMessage
  | StateSyncMessage
  | RerouteRequestMessage
  | RerouteAckMessage
  | DataUpdateMessage
  | ErrorMessage;
```

## 修改闭环状态机

### 状态定义

```typescript
type ModificationFlowState =
  | 'idle'                  // 无修改，等待用户操作
  | 'pending_normal'        // 普通修改已收到，正在处理
  | 'pending_high'          // 高影响修改已收到，等待用户确认
  | 'ack_sent'              // 已发送 ACK，等待 iframe 重新渲染
  | 'reroute_requested'     // 用户请求重排，等待 SPA 处理
  | 'reroute_processing'    // SPA 正在重排
  | 'data_updated'          // 新数据已推送，等待 iframe 确认
  | 'error';                // 错误状态
```

### 状态转换

```
                          ┌──────────────────────────────────────┐
                          │                                      │
idle ─── MODIFICATION(normal) ──→ pending_normal ─── ACK(accepted) ──→ ack_sent ──→ idle
                                      │
                                      └── ACK(rejected) ──→ idle (iframe 回滚)

idle ─── MODIFICATION(high) ──→ pending_high ─── 用户确认 ──→ ACK(accepted) ──→ ack_sent ──→ idle
                                   │
                                   └── 用户拒绝 ──→ ACK(rejected) ──→ idle (iframe 回滚)

idle ─── UNDO ──→ 更新 modificationStore ──→ idle

idle ─── REROUTE_REQUEST ──→ reroute_requested ─── 用户操作 ──→ reroute_processing
                                                                  │
                                                                  ├── SPA 内重排 ──→ DATA_UPDATE ──→ data_updated ──→ idle
                                                                  └── 复制文本 ──→ idle (用户去外部工具)

任何状态 ─── ERROR ──→ error ─── recoverable? ──→ idle (重试)
                                   └── 不可恢复 ──→ 显示错误信息
```

### 高影响修改判定规则

以下修改为高影响（需用户确认后才保存）：

| 修改类型 | 高影响条件 | 原因 |
|----------|-----------|------|
| priority | 改为 `must` 或从 `must` 改为其他 | 必去点变化影响路线骨架 |
| add | 跨城市加入 | 跨城加入破坏当天区域集中性 |
| remove | 住宿/已预约/当前必去 | 移除固定点影响整体结构 |
| move | 跨城市移动 | 改变城市段安排 |
| reorder | 超出当天容量 | 容量超限导致过满 |

普通修改（直接保存）：

- 调整普通地点优先级（preferred ↔ nearby ↔ archive ↔ pending）
- 把同城普通候选加入未满日期
- 调整同日普通地点顺序

## PublicTripData 序列化

### 函数签名

```typescript
// lib/export/serialize.ts

import type { Trip, POI, TripEvent, Source, ItineraryDay } from '../../shared/types';

/** Europe 母版的公开行程数据格式 */
interface PublicTripData {
  slug: string;
  dataRevision: string;
  title: string;
  eyebrow?: string;
  summary: string;
  language: 'zh' | 'en';
  map: { center: [number, number]; zoom: number };
  cities: Record<string, string>;           // { "Paris": "巴黎" }
  categories: Record<string, string>;       // { "hotel": "住宿片区", ... }
  priorities: Record<string, string>;       // { "must": "必须去", ... }
  pois: PublicPOI[];
  itinerary: PublicItineraryDay[];
  events: PublicEvent[];
  designTokens?: DesignTokens;
}

/** 将内部 Trip 序列化为 Europe 母版可用的 PublicTripData */
export function serializeTripToPublicData(trip: Trip): PublicTripData;

/** 将 POI 序列化为公开格式（解析 sourceIds → evidenceSources） */
function serializePOI(poi: POI, sources: Source[]): PublicPOI;

/** 将 ItineraryDay 序列化为公开格式 */
function serializeItineraryDay(day: ItineraryDay, pois: POI[]): PublicItineraryDay;

/** 将 TripEvent 序列化为公开格式（只含 venue + confirmed） */
function serializeEvent(event: TripEvent, sources: Source[]): PublicEvent | null;

/** 解析 sourceIds 为 8 字段 evidenceSources */
function resolveEvidenceSources(sourceIds: string[], sources: Source[]): EvidenceSource[];

/** 计算地图中心和缩放级别（基于所有 POI 坐标的 bounding box） */
function computeMapBounds(pois: POI[]): { center: [number, number]; zoom: number };
```

### 序列化规则

1. **POI**：`sourceIds` 不出现在公开数据中；`evidenceSources` 只输出 `{title, url, type, role, language, supports, checkedAt, status}` 八字段
2. **events**：只输出 `scope=venue && status=confirmed` 的活动；`hosted` 合并到 hostPoiId 的 POI 详情中；`citywide` 写入 itinerary day 的说明字段
3. **itinerary**：`routeStops` 保持顺序；酒店 `order=0` 不参与游玩编号
4. **coords**：POI 用 `[lat, lng]` WGS-84；`routeGeometry` 用 `[lng, lat]` GeoJSON 顺序
5. **language**：跟随用户当前对话语言，写入 `PUBLIC_TRIP_DATA.trip.language`

## SPA 端通信管理

### MapPage 通信 Hook

```typescript
// hooks/useMapIframe.ts

interface UseMapIframeOptions {
  tripId: string;
  iframeRef: RefObject<HTMLIFrameElement>;
  readOnly?: boolean;
}

interface UseMapIframeReturn {
  status: 'loading' | 'ready' | 'error';
  init: (trip: Trip) => void;
  sendDataUpdate: (trip: Trip, resetModifications: boolean) => void;
  onModification: (cb: (msg: ModificationMessage) => void) => void;
  onUndo: (cb: (msg: UndoMessage) => void) => void;
  onRerouteRequest: (cb: (msg: RerouteRequestMessage) => void) => void;
  onError: (cb: (msg: ErrorMessage) => void) => void;
  acknowledgeModification: (messageId: string, accepted: boolean, reason?: string) => void;
  acknowledgeReroute: (messageId: string, received: boolean, message?: string) => void;
}

export function useMapIframe(options: UseMapIframeOptions): UseMapIframeReturn;
```

### iframe 端消息桥接

Europe 母版的 JS 需要添加一个轻量的 message bridge（注入到 iframe HTML 的 `<script>` 中）：

```typescript
// 此代码注入到 Europe 母版 HTML 中
// 负责：接收 SPA 消息 → 调用母版已有 API → 发送回调

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  const msg = event.data as MapMessage;
  
  switch (msg.type) {
    case 'INIT':
      window.TRIP_DATA = msg.payload.tripData;
      STORAGE_KEY = msg.payload.storageKey;
      // 调用母版的初始化函数
      TripMapPublic.init(msg.payload);
      sendToParent({ type: 'READY', messageId: uuid(), timestamp: Date.now(), payload: { savedState } });
      break;
    case 'MODIFICATION_ACK':
      if (msg.payload.accepted) {
        // 确认修改已保存
      } else {
        // 回滚修改
        TripMapPublic.rollbackModification(msg.payload.reason);
      }
      break;
    case 'DATA_UPDATE':
      TripMapPublic.reloadData(msg.payload.tripData, msg.payload.resetModifications);
      break;
  }
});

// 用户操作时发送到 SPA
function sendModification(mod: ModificationRecord, impact: 'normal' | 'high') {
  sendToParent({ type: 'MODIFICATION', messageId: uuid(), timestamp: Date.now(),
    payload: { modification: mod, affectedDays: [...], impactLevel: impact } });
}
```

## 导出场景的差异

### 场景 A：SPA 内 MapPage

- iframe + postMessage 双向通信
- 修改直接同步到 Zustand stores
- "请 Codex 重新安排" → SPA 内重排 → DATA_UPDATE

### 场景 B：导出独立 HTML

- 无 postMessage，Europe 母版自包含运行
- 修改保存到独立 localStorage key
- "请 Codex 重新安排" → 生成可复制文本 → 用户手动粘贴到外部工具
- scheme 链接在微信浏览器中降级为 https

## 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| iframe 加载超时（10s） | 显示"地图加载失败" + 重试按钮 |
| INIT 后未收到 READY（15s） | 显示错误 + 检查 iframe origin |
| MODIFICATION_ACK 超时（5s） | 重发 ACK，3 次后标记 error |
| DATA_UPDATE 后 iframe 无响应 | 重发 DATA_UPDATE，3 次后标记 error |
| localStorage 写入失败 | 发送 ERROR(code=STORAGE_FULL) |
| 序列化数据无效 | 发送 ERROR(code=DATA_INVALID) |
