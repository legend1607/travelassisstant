# 补充设计：坐标系转换 + 路线几何生成 + 事件系统集成

> 精度：架构级（数据流 + 关键决策 + 伪代码）
>
> 关联：主计划 `travel-planner-app-plan.md` 阶段三+四+六

## 坐标系转换

### 背景

两套地图系统使用不同坐标系：

| 系统 | 坐标系 | 顺序 | 用途 |
|------|--------|------|------|
| 高德地图 JS API | GCJ-02（火星坐标） | `[lng, lat]` | 内部规划地图 |
| Leaflet / OSM | WGS-84（原始 GPS） | `[lat, lng]` | Europe 导出母版 |
| GeoJSON | WGS-84 | `[lng, lat]` | routeGeometry 存储 |

### 存储约定

```
POI.coords          → [lat, lng]  WGS-84     （存储层统一）
routeGeometry       → [lng, lat]  WGS-84     （GeoJSON 顺序，存储层）
AMap 交互           → [lng, lat]  GCJ-02     （运行时转换）
Leaflet 交互         → [lat, lng]  WGS-84     （直接使用，无需转换）
```

### 转换实现

```typescript
// lib/geo/coordTransform.ts

const PI = Math.PI;
const A = 6378245.0;           // 长半轴
const EE = 0.00669342162296594323; // 偏心率平方

function isOutOfChina(lat: number, lng: number): boolean {
  // 境外坐标不做偏移（高德官方行为）
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
    + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
    + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

/** WGS-84 → GCJ-02，输入输出均为 [lat, lng] */
export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (isOutOfChina(lat, lng)) return [lat, lng]; // 境外不偏移
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI);
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI);
  return [lat + dLat, lng + dLng];
}

/** GCJ-02 → WGS-84（近似逆向），输入输出均为 [lat, lng] */
export function gcj02ToWgs84(lat: number, lng: number): [number, number] {
  if (isOutOfChina(lat, lng)) return [lat, lng];
  // 迭代逼近法
  let wgsLat = lat, wgsLng = lng;
  for (let i = 0; i < 3; i++) {
    const [gLat, gLng] = wgs84ToGcj02(wgsLat, wgsLng);
    wgsLat = lat - (gLat - wgsLat);
    wgsLng = lng - (gLng - wgsLng);
  }
  return [wgsLat, wgsLng];
}

/** 批量转换：WGS-84 [lat,lng][] → GCJ-02 [lat,lng][] */
export function wgs84ArrayToGcj02(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => wgs84ToGcj02(lat, lng));
}

/** 批量转换：GCJ-02 [lat,lng][] → WGS-84 [lat,lng][] */
export function gcj02ArrayToWgs84(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => gcj02ToWgs84(lat, lng));
}
```

### 转换使用点

```
POI 搜索（高德 PlaceSearch）
  → 高德返回 GCJ-02 [lng, lat]
  → gcj02ToWgs84(lat, lng)
  → 存储 POI.coords = [wgsLat, wgsLng]

AMapView 渲染 marker
  → 读取 POI.coords [wgsLat, wgsLng] (WGS-84)
  → wgs84ToGcj02(lat, lng)
  → AMap.Marker({ position: [gcjLng, gcjLat] })

routeGeometry 生成
  → 高德返回 path: [[gcjLng, gcjLat], ...]
  → 逐点 gcj02ToWgs84(lat, lng)
  → 转为 GeoJSON [lng, lat] 顺序
  → 存储 routeGeometry: [[wgsLng, wgsLat], ...]

Europe 母版渲染（Leaflet）
  → POI.coords [wgsLat, wgsLng] → 直接用 [lat, lng]
  → routeGeometry [[wgsLng, wgsLat]] → 转为 [wgsLat, wgsLng]
```

## 路线几何生成

### 整体流程

```
DayColumn 中用户排定的 routeStops（有序 POI 列表）
       │
       ▼
  preprocessRoute(stops, pois)
  ├─ 过滤 order=0 的酒店作为起终点（不参与游玩编号）
  ├─ 按 order 排序
  └─ 确定每段的交通方式（步行/驾车/公交）
       │
       ▼
  ┌─ 逐段规划 ──────────────────────────────────┐
  │ stop[0] → stop[1]:                           │
  │   AMap.Driving 或 AMap.Walking               │
  │   → path coords (GCJ-02 [lng, lat][])       │
  │   → time (秒)                                │
  │   → distance (米)                             │
  │                                               │
  │ stop[1] → stop[2]: ...                       │
  │ stop[n-1] → stop[n]: ...                     │
  └───────────────────────────────────────────────┘
       │
       ▼
  收集每段结果
  ├─ path coords (GCJ-02) → 逐点转 WGS-84 → 合并为完整 routeGeometry
  ├─ time/60 → minutes → transitSegments[i].minutes
  ├─ mode → transitSegments[i].mode ('步行'/'驾车'/'公交')
  └─ label 生成 → transitSegments[i].label (如 "步行约 8 分钟")
       │
       ▼
  写入 ItineraryDay
  ├─ routeGeometry: [[lng, lat], ...]  WGS-84 GeoJSON 顺序
  ├─ routeGeometryMode: 'driving' | 'walking' | 'transit'
  ├─ routeGeometrySource: 'amap-routing-api'
  ├─ routeGeometryReviewedAt: ISO datetime
  └─ transitSegments: TransitSegment[]
       │
       ▼
  降级：API 失败或 key 缺失
  ├─ routeGeometry = []
  ├─ transitSegments = []
  ├─ 地图显示顺序参考虚线 + "尚未复核"
  └─ 不生成虚构距离或时间
```

### 交通方式判定

```typescript
// lib/amap/routing.ts

function determineTransitMode(from: POI, to: POI, day: ItineraryDay): 'walking' | 'driving' | 'transit' {
  const distance = haversineDistance(from.coords, to.coords);

  // 同街区（< 1.5km）→ 步行
  if (distance < 1500) return 'walking';

  // 自驾行程 → 驾车
  if (day.transitSegments?.some(s => s.mode === '驾车')) return 'driving';

  // 同城中等距离（1.5-8km）→ 步行或公交
  if (distance < 8000) {
    // 优先步行（如果步行 < 20 分钟）
    return 'walking';
  }

  // 跨城或长距离 → 驾车或公交
  return 'driving';
}
```

### 逐段规划实现

```typescript
// lib/amap/routing.ts

interface RouteSegmentResult {
  path: [number, number][];   // GCJ-02 [lng, lat]
  time: number;               // 秒
  distance: number;           // 米
  mode: string;
}

async function planSegment(
  amap: typeof AMap,
  from: POI,
  to: POI,
  mode: 'walking' | 'driving'
): Promise<RouteSegmentResult> {
  // POI.coords 是 WGS-84 [lat, lng]，转为 GCJ-02
  const [fromLat, fromLng] = wgs84ToGcj02(from.coords[0], from.coords[1]);
  const [toLat, toLng] = wgs84ToGcj02(to.coords[0], to.coords[1]);

  return new Promise((resolve, reject) => {
    const plugin = mode === 'walking' ? AMap.Walking : AMap.Driving;
    const router = new amap.plugin(plugin, () => {
      router.search(
        [fromLng, fromLat],  // AMap 用 [lng, lat]
        [toLng, toLat],
        (status: string, result: any) => {
          if (status !== 'complete' || !result.routes?.length) {
            reject(new Error(`Route planning failed: ${status}`));
            return;
          }
          const route = result.routes[0];
          const path: [number, number][] = [];
          // 合并所有步骤的路径
          route.steps.forEach((step: any) => {
            step.path.forEach((p: any) => {
              path.push([p.lng, p.lat]);  // GCJ-02 [lng, lat]
            });
          });
          resolve({
            path,
            time: route.time,
            distance: route.distance,
            mode: mode === 'walking' ? '步行' : '驾车',
          });
        }
      );
    });
  });
}

export async function generateRouteGeometry(
  amap: typeof AMap,
  stops: POI[],
  day: ItineraryDay
): Promise<{
  geometry: [number, number][];
  segments: TransitSegment[];
  mode: string;
}> {
  if (stops.length < 2) {
    return { geometry: [], segments: [], mode: 'walking' };
  }

  const allGeometry: [number, number][] = [];
  const segments: TransitSegment[] = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];
    const mode = determineTransitMode(from, to, day);

    try {
      const result = await planSegment(amap, from, to, mode);

      // GCJ-02 → WGS-84，转为 GeoJSON [lng, lat]
      const wgsPath = result.path.map(([lng, lat]) => {
        const [wgsLat, wgsLng] = gcj02ToWgs84(lat, lng);
        return [wgsLng, wgsLat] as [number, number];
      });
      allGeometry.push(...wgsPath);

      segments.push({
        fromPoiId: from.id,
        toPoiId: to.id,
        mode: result.mode,
        minutes: Math.round(result.time / 60),
        label: `${result.mode}约 ${Math.round(result.time / 60)} 分钟`,
      });
    } catch (error) {
      // 单段失败不影响整体，标记为待复核
      segments.push({
        fromPoiId: from.id,
        toPoiId: to.id,
        mode: mode === 'walking' ? '步行' : '驾车',
        minutes: undefined,
        label: '这段移动尚未复核',
      });
    }
  }

  return {
    geometry: allGeometry,
    segments,
    mode: segments.some(s => s.mode === '驾车') ? 'driving' : 'walking',
  };
}
```

### 4+ 停靠点顺序比较

按 `planning-workflow.md` 要求，正式停靠点 ≥ 4 时比较至少两种顺序：

```typescript
// lib/planner/dailyRouteVerify.ts

interface OrderCandidate {
  order: number[];         // POI 索引排列
  totalTime: number;       // 总移动时间（秒）
  detours: number;         // 折返次数
  fixedWindowViolations: number;  // 固定时间窗违反次数
  routeGeometry: [number, number][];
  segments: TransitSegment[];
}

async function compareRouteOrders(
  amap: typeof AMap,
  stops: POI[],
  fixedWindows: { poiId: string; timeWindow: string }[]
): Promise<OrderCandidate> {
  // 1. 列出所有满足固定时间窗的排列（剪枝：先排除违反时间窗的）
  // 2. 对前 3 个排列生成路线几何
  // 3. 比较：先排除迟到/闭馆/过度疲劳，再比较总移动时间和折返
  // 4. 选出最优，保存 routeReview
  // 注意：排列数 = n!，n > 6 时只比较启发式选出的 3 个候选
  //   - 原始顺序
  //   - 按地理位置聚类的顺序（同区域先走）
  //   - 按固定时间窗约束的顺序
}

interface RouteReview {
  fixedConstraints: string[];      // ["10:30 预约圣家堂", "14:00 餐厅订位"]
  sequenceRationale: string;       // "上午从酒店向东，午后转向旧城"
  intentionalDetours: string[];    // ["回酒店休息后去晚餐"]
  routingMethod: string;           // "amap-driving + walking, 3 candidates compared"
}
```

## 事件系统集成

### 事件数据流

```
阶段二：事件扫描
  ├─ 搜索节庆/展览/市集/演出/体育赛事
  ├─ 按 event-schema.md 写入 events 数组
  └─ 每个事件分配 routeImpact (anchor/candidate/nearby/avoidance)
       │
       ▼
阶段三：行程排程
  ├─ integrateEventsIntoItinerary(events, days, pois)
  │   ├─ anchor + confirmed + venue → 加入 day.anchors + day.routeStops
  │   ├─ candidate → 加入 day.candidates
  │   ├─ nearby → 写入 day.summary
  │   └─ avoidance → 写入 day.summary（标红提示）
  └─ 事件影响路线几何（anchor 事件作为路线节点参与规划）
       │
       ▼
阶段四：地图渲染
  ├─ serializeEventsToPublicData(events)
  │   ├─ venue + confirmed → 独立 marker (event:id)
  │   ├─ hosted → 合并到 hostPoiId 的 POI 详情
  │   └─ citywide → 不生成 marker，写入 day summary
  └─ 事件 marker 使用不同样式（带日期标签）
       │
       ▼
阶段六：导出验证
  └─ validate-trip-events.js 检查事件引用完整性
```

### routeImpact 四级处理

```typescript
// lib/planner/eventScheduler.ts

function integrateEventsIntoItinerary(
  events: TripEvent[],
  days: ItineraryDay[],
  pois: POI[]
): ItineraryDay[] {
  const updatedDays = [...days];

  for (const event of events) {
    // historical-lead 不进入行程
    if (event.status === 'historical-lead') continue;

    // 找到匹配的日期（event.city === day.city && event 日期 ∈ day.date）
    const matchingDays = updatedDays.filter(day => {
      if (day.city !== event.city && !event.affectedCities?.includes(day.city)) return false;
      const dayDate = new Date(day.date);
      const eventStart = new Date(event.startsAt);
      const eventEnd = new Date(event.endsAt);
      return dayDate >= eventStart && dayDate <= eventEnd;
    });

    for (const day of matchingDays) {
      switch (event.routeImpact) {
        case 'anchor':
          // anchor + confirmed + venue → 排入正式路线
          if (event.status === 'confirmed' && event.scope === 'venue') {
            if (!day.anchors.includes(`event:${event.id}`)) {
              day.anchors.push(`event:${event.id}`);
            }
            if (!day.routeStops.some(s => s.poiId === `event:${event.id}`)) {
              day.routeStops.push({
                poiId: `event:${event.id}`,
                order: day.routeStops.length + 1,
                role: 'event-anchor',
              });
            }
          }
          break;

        case 'candidate':
          // candidate → 加入当天候选
          if (!day.candidates.includes(`event:${event.id}`)) {
            day.candidates.push(`event:${event.id}`);
          }
          break;

        case 'nearby':
          // nearby → 写入当天说明
          day.summary += `\n附近活动：${event.name_zh || event.name}（${event.startsAt}）`;
          break;

        case 'avoidance':
          // avoidance → 写入当天说明（标红）
          day.summary += `\n⚠ ${event.name_zh || event.name} 期间可能有交通管制或拥挤，建议避开中心区域。`;
          break;
      }
    }
  }

  return updatedDays;
}
```

### 事件在 Europe 地图中的渲染

```typescript
// lib/export/serialize.ts

function serializeEvent(event: TripEvent, sources: Source[]): PublicEvent | null {
  // 只输出 venue + confirmed 的活动作为独立 marker
  if (event.scope !== 'venue' || event.status !== 'confirmed') {
    // hosted → 合并到 hostPoiId 的 POI 详情中（在 serializePOI 中处理）
    // citywide → 写入 itinerary day 的说明字段
    return null;
  }

  const evidenceSources = resolveEvidenceSources(event.sourceIds, sources);

  return {
    id: `event:${event.id}`,
    name: event.name,
    name_zh: event.name_zh,
    city: event.city,
    area: event.area,
    category: 'event',
    priority: event.routeImpact === 'anchor' ? 'must' : 'nearby',
    coords: event.coords,  // [lat, lng] WGS-84
    note: event.whyWorthIt,
    plan: event.plan,
    tip: event.tip,
    officialUrl: event.officialUrl,
    evidenceSources,
    // 事件特有字段
    recurring: false,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.name + ' ' + event.city)}`,
    experienceUrl: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(event.name_zh || event.name)}`,
    imageQuery: `${event.name} ${event.city}`,
  };
}
```

### hosted 事件合并到 POI 详情

```typescript
function serializePOI(poi: POI, sources: Source[], events: TripEvent[]): PublicPOI {
  const base = {
    // ...常规 POI 字段
  };

  // 查找关联的 hosted 事件
  const hostedEvents = events.filter(
    e => e.scope === 'hosted' && e.hostPoiId === poi.id && e.status !== 'historical-lead'
  );

  if (hostedEvents.length > 0) {
    base.detailSections = [
      ...(poi.detailSections || []),
      ...hostedEvents.map(e => ({
        title: `同期活动：${e.name_zh || e.name}`,
        body: `${e.whyWorthIt} 时间：${e.startsAt}。${e.plan} ${e.tip}`,
        items: e.officialUrl ? [`官网：${e.officialUrl}`] : undefined,
      })),
    ];
  }

  return base;
}
```

### citywide 事件写入行程说明

```typescript
function serializeItineraryDay(
  day: ItineraryDay,
  pois: POI[],
  events: TripEvent[]
): PublicItineraryDay {
  const base = {
    // ...常规 day 字段
  };

  // 查找影响当天的 citywide 事件
  const citywideEvents = events.filter(
    e => e.scope === 'citywide' &&
    e.city === day.city &&
    isDateInRange(day.date, e.startsAt, e.endsAt)
  );

  if (citywideEvents.length > 0) {
    const notices = citywideEvents.map(e => {
      if (e.routeImpact === 'avoidance') {
        return `⚠ ${e.name_zh || e.name}：${e.tip}`;
      }
      return `${e.name_zh || e.name}：${e.tip}`;
    });
    base.summary = base.summary + '\n\n' + notices.join('\n');
  }

  return base;
}
```

### 事件 marker 样式

```
普通 POI marker       事件 marker
  ◉                    ◉ + 日期标签
  (实心圆)              (实心圆 + 上方日期徽章)
                       日期格式：MM/DD
                       颜色：与 event 类别一致
```

事件 marker 在 Europe 母版中作为特殊 POI 渲染：
- `category: 'event'` → 使用事件分类的图层和颜色
- 优先级继承自 `routeImpact`：anchor → `must`，candidate → `nearby`
- 详情面板显示 `startsAt` / `endsAt` 时间
- 官网/预约入口显示 `officialUrl`
