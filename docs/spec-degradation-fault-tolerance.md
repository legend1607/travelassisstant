# 补充设计：降级与容错策略

> 精度：架构级（数据流 + 关键决策 + 伪代码）
>
> 关联：主计划 `travel-planner-app-plan.md` 全阶段

## 设计原则

1. **不阻塞规划流程** — 任何外部依赖失败时，用户仍可继续规划，只是体验降低
2. **明确告知降级状态** — 用自然语言说明"当前处于降级模式"和"缺失了什么"
3. **渐进降级** — 先尝试降级方案，再尝试更低的降级方案，最后才是错误提示
4. **数据安全优先** — 降级时已保存的数据不丢失

## 降级层次总览

```
外部依赖           正常模式                    降级模式                       错误模式
─────────         ─────────                  ─────────                      ─────────
高德地图 API       JS API 2.0 完整能力         Leaflet + OSM 底图              纯文本列表
                  POI搜索/路线规划/地理编码     手动输入坐标/搜索链接            无地图

小红书 CDP         搜索+详情自动提取            手动搜索链接+用户粘贴            隐藏面板
                  (端口 9223 连接)             显示启动命令复制按钮

美团 CDP           搜索+详情自动提取            scheme 链接唤起+手动搜索         隐藏面板
                                               显示启动命令复制按钮

路线几何           高德 Driving/Walking API     顺序参考虚线+"尚未复核"          空白+编号
                  逐段规划→合并坐标             无距离/时间估算

localStorage       完整行程数据                 清理缓存后重试                   提示导出+删除
                  + CDP 缓存                   归档最旧行程                     旧行程
```

## CDP 连接降级

### 健康检查流程

```
SPA 启动 → GET /api/xhs/health
  │
  ├─ 200 { connected: true, loggedIn: true }
  │    └─ 正常模式：显示小红书调研面板
  │
  ├─ 200 { connected: false, reason: 'no-debug-port' }
  │    └─ 降级 A：Chrome 未以调试端口启动
  │         - 隐藏 CDP 搜索面板
  │         - 显示启动命令复制按钮：
  │           "Chrome --remote-debugging-port=9223 ..."
  │         - 显示手动搜索链接（直达小红书搜索页）
  │         - 用户可手动粘贴笔记 URL/内容到 research 字段
  │
  ├─ 200 { connected: false, reason: 'not-logged-in' }
  │    └─ 降级 B：Chrome 已启动但未登录小红书
  │         - 显示"请在 Chrome 中登录小红书后刷新"
  │         - 保留手动搜索链接
  │
  └─ 超时 / 网络错误
       └─ 降级 C：后端服务未启动
            - 显示"后端服务未启动，请在终端运行 pnpm server"
            - 保留手动搜索链接
```

美团 CDP 同理，健康检查端点为 `/api/meituan/health`。

### CDP 请求失败重试

```typescript
// server/src/services/cdp/CDPBridge.ts

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        // 重连 CDP
        await this.reconnect();
      }
    }
  }
  throw lastError;
}
```

### CDP 并发控制

```typescript
// 同一时刻最多 1 个 CDP 操作（Chrome 单页面约束）
// 使用队列串行执行所有 CDP 请求

class CDPRequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = false;

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try { resolve(await fn()); }
        catch (e) { reject(e); }
        finally { this.next(); }
      });
      if (!this.running) this.next();
    });
  }

  private async next() {
    const task = this.queue.shift();
    if (!task) { this.running = false; return; }
    this.running = true;
    await task();
  }
}
```

## 高德 API 降级

### 降级判定

```typescript
// hooks/useAMap.ts

type AMapStatus = 'loading' | 'ready' | 'degraded' | 'error';

function useAMap(): { status: AMapStatus; AMap: typeof AMap | null } {
  const [status, setStatus] = useState<AMapStatus>('loading');
  const [amap, setAMap] = useState<typeof AMap | null>(null);

  useEffect(() => {
    const key = import.meta.env.VITE_AMAP_KEY;
    if (!key || key === 'YOUR_AMAP_KEY') {
      console.warn('[AMap] API key not configured, switching to degraded mode');
      setStatus('degraded');
      return;
    }

    AMapLoader.load({ key, plugins: ['PlaceSearch', 'AutoComplete', 'Driving', 'Walking', 'Transfer', 'Geocoder'] })
      .then((AMapInstance) => {
        setAMap(AMapInstance);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[AMap] Failed to load:', err);
        setStatus('degraded');
      });
  }, []);

  return { status: status, AMap: amap };
}
```

### 降级时的 UI 变化

| 功能 | ready 模式 | degraded 模式 |
|------|-----------|---------------|
| AMapView | 高德地图（GCJ-02） | Leaflet + OSM（WGS-84） |
| POI 搜索 | AutoComplete + PlaceSearch | 手动输入坐标 or 搜索链接 |
| 路线几何 | Driving/Walking API 逐段 | 跳过，routeGeometry 为空 |
| 导航 ActionSheet | 高德导航 scheme | Google Maps / 百度地图链接 |
| 地理编码 | Geocoder | 手动输入地址 |

### degraded 模式的 AMapView 实现

```typescript
// components/map/AMapView.tsx

function AMapView({ status, pois, day }: AMapViewProps) {
  if (status === 'degraded') {
    return <LeafletFallback pois={pois} day={day} />;
    // 使用 react-leaflet，底图为 OpenStreetMap
    // POI 坐标直接用 WGS-84，无需转换
    // 无路线几何，只显示 marker + 顺序编号
  }
  // 正常高德地图渲染...
}
```

## localStorage 容量管理

### 存储结构

```
localStorage
├── trip-planner:trips          # 所有行程（主数据，最重要）
├── trip-planner:trips:archive  # 归档的旧行程（压缩）
├── trip-planner:xhs-cache      # 小红书 CDP 缓存（可清除）
├── trip-planner:meituan-cache  # 美团 CDP 缓存（可清除）
└── travelassisstant:map:{id}   # 每个行程的地图状态（iframe 独立 storage）
```

### 容量预估

| 数据类型 | 单行程预估 | 说明 |
|----------|-----------|------|
| Trip 主数据 | 50-200 KB | 10 天 × 15 POI × 2KB/POI |
| XHS 缓存 | 10-50 KB/次 | 每次搜索结果缓存 |
| 美团缓存 | 10-30 KB/次 | 每次搜索结果缓存 |
| 地图状态 | 5-20 KB | 修改记录 + 撤销快照 |

localStorage 典型配额 5-10 MB，可容纳约 20-50 个行程。

### 写入安全策略

```typescript
// lib/storage/db.ts

function safeSetItem(key: string, value: string): { success: boolean; action?: string } {
  try {
    localStorage.setItem(key, value);
    return { success: true };
  } catch (e) {
    if (!(e instanceof DOMException) || e.name !== 'QuotaExceededError') {
      throw e; // 非容量错误，继续抛出
    }

    // 策略 1：清理 CDP 缓存
    const cacheFreed = clearCDPCaches();
    if (cacheFreed) {
      try {
        localStorage.setItem(key, value);
        return { success: true, action: 'cleared-cache' };
      } catch {}
    }

    // 策略 2：归档最旧行程
    const archived = archiveOldestTrip();
    if (archived) {
      try {
        localStorage.setItem(key, value);
        return { success: true, action: 'archived-old-trip' };
      } catch {}
    }

    // 策略 3：提示用户
    return { success: false, action: 'user-action-required' };
    // UI 层显示："存储空间不足，请导出并删除部分旧行程"
  }
}
```

### 行程归档机制

```typescript
function archiveOldestTrip(): boolean {
  const trips = loadTrips();
  if (trips.length <= 1) return false; // 至少保留当前行程

  // 找到 updatedAt 最旧的行程
  const oldest = trips.sort((a, b) => a.updatedAt - b.updatedAt)[0];

  // 压缩后移入 archive
  const archive = loadArchive();
  archive.push({
    id: oldest.id,
    title: oldest.title,
    compressedData: compressTrip(oldest),
    archivedAt: Date.now(),
  });
  localStorage.setItem('trip-planner:trips:archive', JSON.stringify(archive));

  // 从主列表中移除
  const remaining = trips.filter(t => t.id !== oldest.id);
  localStorage.setItem('trip-planner:trips', JSON.stringify(remaining));

  return true;
}
```

## 导出 HTML 的降级

### scheme 链接降级

```typescript
// lib/export/render.ts

function renderSchemeLink(scheme: string, httpsFallback: string, label: string): string {
  return `
    <a href="${scheme}" 
       data-fallback="${httpsFallback}"
       class="scheme-link"
       onclick="return handleSchemeClick(event, this)">
      ${label}
    </a>
  `;
}

// 注入到导出 HTML 的 <script>
function handleSchemeClick(e: Event, link: HTMLElement): boolean {
  const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  if (isWeChat) {
    // 微信内置浏览器不支持 scheme，直接打开 https 降级
    window.open(link.dataset.fallback, '_blank');
    return false;
  }
  // 非微信：尝试 scheme，1.5s 后降级到 https
  const fallback = link.dataset.fallback;
  setTimeout(() => {
    if (!document.hidden) {
      window.open(fallback, '_blank');
    }
  }, 1500);
  return true; // 允许 scheme 跳转
}
```

### scheme 链接清单

| 平台 | scheme | https 降级 |
|------|--------|-----------|
| 小红书 | `xhsdiscover://search?keyword=` | `https://www.xiaohongshu.com/search_result?keyword=` |
| 大众点评 | `dianping://search?keyword=` | `https://www.dianping.com/search/keyword/` |
| 美团 | `imeituan://search?keyword=` | `https://h5.waimai.meituan.com/waimai/mindex/search/` |
| 高德导航 | `amapuri://route/plan/?` | `https://uri.amap.com/navigation?` |
| Google Maps | (无 scheme) | `https://www.google.com/maps/search/?api=1&query=` |

## 后端服务降级

### 后端未启动时的前端行为

```typescript
// hooks/useXHSResearch.ts

function useXHSResearch() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/xhs/health', { signal: AbortSignal.timeout(3000) })
      .then(r => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, []);

  // available === false 时：
  // - XHSNoteList 显示"后端服务未启动"
  // - 提供"手动搜索"按钮（打开小红书搜索页）
  // - 提供"粘贴笔记内容"文本框
  // - 用户粘贴的内容保存到 POI.research.xhsVerdict
}
```

### 后端缓存策略

```typescript
// server/src/services/cache/lruCache.ts

// LRU 缓存，避免重复 CDP 请求
// key: `${platform}:${query}` (如 "xhs:银座 午餐")
// TTL: 30 分钟
// maxEntries: 100

class LRUCache<K, V> {
  private map = new Map<K, { value: V; expires: number }>();
  private maxEntries: number;
  private ttlMs: number;

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return undefined;
    }
    // LRU: 移到末尾
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.maxEntries) {
      // 删除最旧（Map 第一个）
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}
```
