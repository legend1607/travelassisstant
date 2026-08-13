---
name: travel-assistant
description: >
  四阶段旅行助手：规划行程（交通查询+AMap 地理编码+路径规划验证）→ 调研餐厅景点（WebSearch 多源聚合+AMap POI）→
  构建交互式地图页面（AMap JSAPI 3D）→ 生成路线图图片（AI 生图，可选）。
  使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。
  触发词："做个行程"、"行程规划"、"行程地图"、"trip map"、"plan my trip"、"帮我画路线图"、"生成行程封面"。
license: MIT
version: 1.3.1
homepage: https://github.com/legend1607/travelassisstant
metadata:
  openclaw:
    requires:
      env: AMAP_JSAPI_KEY
    primaryEnv: AMAP_JSAPI_KEY
---

# Travel Assistant — 旅行助手

四阶段流水线：**Plan → Research → Build → Visualize**。

输出是**参考行程**，不是旅途中必须执行的脚本。天气、当前位置、体力、饥饿程度都可以覆盖原计划。

## 执行检查清单（HARD GATE）

每次执行**必须**按顺序确认：

- [ ] **START**：读取 `~/.travel-assistant/MEMORY.md`（不存在则跳过，不阻塞）
- [ ] **Phase 1**：交通查询（火车/飞机）+ AMap 验证 + 输出 route-schema.json
- [ ] **Phase 2**：执行多源调研（WebSearch + WebFetch + AMap POI），填充 verified: true
- [ ] **Phase 3**：生成交互式地图 index.html
- [ ] **Phase 4**：（可选）用户明确要求才触发
- [ ] **END**：创建/更新 `~/.travel-assistant/MEMORY.md`

**最后一步不可跳过。** 即便行程简单，也要写入 MEMORY.md。

## 共享记忆

`~/.travel-assistant/MEMORY.md` 是跨会话持久化文件。

### 何时读取

每次会话开始时读取（如存在）。用于继承旅行偏好：
- 交通方式偏好、节奏偏好
- 餐饮口味和预算习惯
- 支付和导航偏好
- 历史行程输出索引
- 未解决的问题

不存在则正常继续，不阻塞。

### 何时写入（强制）

**每次会话结束时必须更新**，只保存下次仍有用的信息：

```markdown
# Travel Assistant Memory

## 旅行偏好
- 交通：[偏好]
- 节奏：[偏好]
- 餐饮预算：[范围]
- 住宿偏好：[偏好]
- 喜欢的类型：[列表]
- 避免的类型：[列表]
- 体力/排队容忍：[范围]

## 历史行程
- YYYY-MM-DD [目的地] [天数]天 → [输出路径]

## 未解决问题
- [如有]
```

不存储截图、证件、订单号、聊天记录。

## 共享数据

Phase 1 产出 `shared/route-schema.json`，Phase 3 和 Phase 4 共用。行程只标准化一次。

### 数据可信度标记

route-schema.json 中每个 location 应包含 `verified` 字段：

- `true` — Phase 2 已调研，amap/dianping/xhs 字段已填充
- `false` — Phase 2 未执行或该点未调研，数据基于通用知识

## Phase 1: Plan — 交通查询 + 行程规划 + AMap 验证

读取 `references/trip-planning.md` 获取完整方法论。
读取 `references/transport-query.md` 获取交通查询详细工作流。

### 前置收集

先明确：出发地、目的地、日期范围、主要交通方式（自驾/公共交通/步行/混合）、人数及年龄段、节奏偏好、餐饮预算、饮食限制。

### 核心流程

1. **抽取硬约束** — 日期、航班、航站楼、酒店
2. **交通查询** — 火车/高铁/飞机车次航班查询（WebSearch + WebFetch 携程）
3. **愿望清单分组** — 城内轻松/需预约/远郊/可路过
4. **删高风险点** — 天数不够、节假日拥挤、天气敏感
5. **AMap 地理编码** — `AMap.Geocoder.getLocation(address)` → 坐标 [lng, lat]
6. **AMap 路径规划验证** — 根据交通方式调用 Driving/Transfer/Walking，获取实际通行时间
7. **AMap 行政区查询** — `AMap.DistrictSearch` 辅助按区域分组
8. **按区域重组** — 一天一个主区域
9. **补餐饮** — 按当天区域给候选
10. **补票务交通** — 只查关键的
11. **输出** — 参考文档 + `route-schema.json`（每个 location 标注 `verified` 字段）

### 交通查询（Step 2 详细）

#### 火车/高铁查询

```
# WebSearch 搜索车次
WebSearch: "携程 {出发城市}到{到达城市} 高铁 火车 车次 时刻表"

# WebFetch 抓取完整车次列表
WebFetch: https://trains.ctrip.com/TrainBooking/{出发城市拼音}-{到达城市拼音}/gaotie/
```

获取数据：车次号、出发/到达时间、运行时长、各等级票价、余票数量、预订成功率、中转方案。

#### 飞机航班查询

```
# WebSearch 搜索航班
WebSearch: "携程 {出发城市}到{到达城市} 飞机 航班 时刻表 票价"

# WebFetch 抓取航班时刻表
WebFetch: https://flights.ctrip.com/international/search/schedule/{出发机场代码}-{到达机场代码}.html
```

获取数据：航空公司、航班号、起飞/到达时间、出发/到达机场、机型、经停信息、票价范围。

读取 `references/amap-services.md` 获取 AMap 服务 API 用法。

### 关键原则

- 不端水，替用户删东西，明说删了什么和为什么
- 一天一个主区域，一天只放一个重预约点
- 行程越顺越好，不是越满越好
- 用户交互遵循四拍格式：Re-ground → Simplify → Recommend → Options

## Phase 2: Research — 多源调研

### 数据源架构（v1.3.0 重构）

原 OpenCLI + Chrome CDP 方案需已登录浏览器会话，在无登录环境中不可用。v1.3.0 改用 **WebSearch + WebFetch 多源聚合**方案，无需登录，在沙箱环境中验证通过。

#### 大众点评/小红书直连状态

| 平台 | 直连状态 | 拦截方式 | 修复方案 |
|------|----------|----------|----------|
| 大众点评 (PC) | ❌ 不可用 | 重定向至 verify.meituan.com 拼图滑块 | 使用携程美食（含大众点评数据） |
| 大众点评 (移动端) | ❌ 不可用 | 返回空壳页面，无餐厅数据 | 同上 |
| 小红书 | ❌ 不可用 | "登录后查看搜索结果"弹窗 | 使用携程旅拍+什么值得买 |

**结论**：大众点评和小红书的直连无法在无登录环境中修复。它们的反爬机制是平台级别的：
- 大众点评使用美团验证中心（拼图滑块 + 设备指纹）
- 小红书使用登录墙 + 风控算法

v1.3.0 的多源聚合方案是**唯一可行路径**，不是临时替代。携程美食页面 URL 中包含 `dianping` 字样，其数据直接来源于大众点评，通过携程可以间接获取相同数据。

| 数据需求 | 数据源 | 获取方式 | 验证状态 |
|----------|--------|----------|----------|
| 坐标/地址/电话/营业时间 | AMap PlaceSearch | JSAPI 调用 | ✅ 已验证 |
| 餐厅评分/口味/环境/服务 | 携程美食（含大众点评数据） | WebSearch + WebFetch | ✅ 已验证 |
| 餐厅体验/排队/价格/踩雷 | 什么值得买 + 途牛 + 去哪儿 | WebSearch + WebFetch | ✅ 已验证 |
| 景点氛围/拍照点/体验 | 携程旅拍 + 头条 | WebSearch + WebFetch | ✅ 已验证 |
| 天气 | AMap Weather | JSAPI 调用 | ✅ 已验证 |
| 火车/高铁车次 | 携程火车 | WebSearch + WebFetch | ✅ 已验证 |
| 飞机航班 | 携程机票 | WebSearch + WebFetch | ✅ 已验证 |

### 调研流程

#### Step 1：AMap POI 搜索

```javascript
new AMap.PlaceSearch({
  type: '餐饮服务|风景名胜',
  pageSize: 10,
  city: '城市名'
}).searchNearBy(keyword, center, radius, callback);
```

获取：坐标、电话、营业时间、基础评分。

#### Step 2：WebSearch 搜索餐厅评价

对每个餐厅执行：

```
WebSearch: "{餐厅名} {城市} 评价 排队 好吃吗"
```

优先结果：
- `you.ctrip.com/food/...` — 携程美食页（含大众点评数据）
- `post.m.smzdm.com/p/...` — 什么值得买
- `m.tuniu.com/restaurant/...` — 途牛
- `touch.go.qunar.com/poi/...` — 去哪儿

#### Step 3：WebFetch 抓取详情

对携程美食页面执行 WebFetch，获取：总评分、子评分、人均、点评数、特色菜、用户点评原文。

#### Step 4：WebSearch 搜索体验内容

```
WebSearch: "{景点名} {城市} 拍照 攻略 体验"
```

优先结果：
- `hk.trip.com/moments/detail/...` — 携程旅拍
- `m.toutiao.com/group/...` — 头条攻略

#### Step 5：信号合并

| 数据类型 | 优先来源 | 备选来源 |
|----------|----------|----------|
| 坐标/地址/电话 | AMap PlaceSearch | 携程美食页 |
| 评分（总分+子分） | 携程美食（含大众点评） | 途牛/去哪儿 |
| 排队/踩雷/价格 | 什么值得买 | 携程用户点评 |
| 氛围/拍照/近期体验 | 携程旅拍 | 头条/什么值得买 |
| 天气敏感 | AMap Weather | — |

#### Step 6：更新 route-schema.json

填充每个 location 的 `amap`、`dianping`、`xhs` 字段，并将 `verified` 设为 `true`。

读取 `references/dianping-research.md` 获取完整工作流。
读取 `references/xhs-research.md` 获取完整工作流。

## Phase 3: Build — AMap JSAPI 交互式地图

1. 复制 `assets/template.html` → `index.html`
2. 复制 `assets/env.example.js` → `env.js`，填入你的高德 API Key 和安全密钥
3. 填充 `HOTEL` 对象和 `DAYS` 数组（来自 route-schema.json）
4. 每个 location 需要：name, lng/lat, type, time, desc; 可选：budget, pay, xhs, reserve, amap, verified
5. 未验证 location (`verified: false`) 的卡片上显示"⚠ 未经调研验证"标签
6. 填充 `overviewContent()` 行程摘要 + 支付提示
7. 默认 Apple 设计系统，可通过 awesome-design-md 切换

Location types: `food` | `spot` | `drink` | `hotel` | `transport`

Payment chip values: `1` = 已确认（绿色）, `0.5` = 不确定（橙色）, 省略 = 不显示

### 部署

**方式一：GitHub Pages（推荐，手机可直接访问）**

```bash
git init && git add . && git commit -m "trip map"
gh repo create REPO --public --source=. --push
gh api repos/:owner/:repo/pages -X POST -f "source[branch]=main" -f "source[path]=/"
# 访问 https://<username>.github.io/<repo>/
```

**方式二：本地服务器（仅本机访问）**

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/index.html
```

## Phase 4: Visualize — AI 生图（可选）

读取 `references/route-visualization.md` 获取完整方法论。
读取 `references/style-presets.md` 获取风格预设。

直接读取 `route-schema.json`，跳过行程标准化（Phase 1 已完成）。编译 AI 生图提示词，生成图片集：

- 总览路线图、每日行程卡、区域详情图、封面海报、手机行程卡

用户可选触发：只要交互地图（Phase 1-3），或额外生成路线图图片。

## 依赖

| 工具 | 用途 | 安装 | 验证状态 |
|------|------|------|----------|
| AMap JSAPI v2.0 | 地图渲染 + 地理服务 | loader.js CDN，需 API Key | ✅ 已验证 |
| WebSearch | 餐厅/景点/交通搜索 | 内置 | ✅ 已验证 |
| WebFetch | 详情页/车次/航班抓取 | 内置 | ✅ 已验证 |
| AI 生图工具 | Phase 4 路线图生成 | 内置 | 待验证 |

## Resources

- `references/trip-planning.md` — 行程规划方法论、输入/输出模板、选点原则、输出检查清单
- `references/transport-query.md` — 交通查询工作流（携程火车+飞机）
- `references/dianping-research.md` — 多源餐厅调研工作流（携程+什么值得买+途牛）
- `references/xhs-research.md` — 多源体验调研工作流（携程旅拍+头条+什么值得买）
- `references/amap-services.md` — 高德服务集成指南
- `references/route-visualization.md` — 路线图生成方法论
- `references/style-presets.md` — 视觉风格预设
- `assets/template.html` — AMap JSAPI HTML 地图模板
- `assets/env.example.js` — AMap Key 配置模板（复制为 env.js 使用，env.js 已 gitignore）
- `shared/route-schema.json` — 统一行程数据格式