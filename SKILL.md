---
name: travel-assistant
description: >
  四阶段旅行助手：规划行程（交通查询+AMap 地理编码+REST API 路线验证+多版本方案）→ 调研餐厅景点（WebSearch 多源聚合 / CDP API 拦截+AMap POI）→
  构建交互式地图页面（AMap JSAPI 3D + 移动端独立 HTML + 多方案对比）→ 生成路线图图片（AI 生图，可选）。
  使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。
  触发词：“做个行程”、“行程规划”、“行程地图”、“trip map”、“plan my trip”、“帮我画路线图”、“生成行程封面”、“多版本方案”。
license: MIT
version: 1.5.0
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
- [ ] **Phase 1**：交通查询（火车/飞机）+ AMap 验证 + REST API 路线验证 + 输出 route-schema.json
- [ ] **Phase 2**：执行多源调研（路径 A 或 B）+ AMap POI，填充 verified: true
- [ ] **Phase 3**：生成交互式地图 index.html；**如有多版本方案**，额外生成 `mobile/overview.html` + `mobile/plan-{id}.html`
- [ ] **Phase 4**：（可选）用户明确要求才触发
- [ ] **END**：创建/更新 `~/.travel-assistant/MEMORY.md`

**最后一步不可跳过。** 即便行程简单，也要写入 MEMORY.md。

## 共享记忆

`~/.travel-assistant/MEMORY.md` 是跨会话持久化文件。

### 何时读取

每次会话开始时读取（如存在）。用于继承旅行偏好：交通方式、节奏、餐饮预算、住宿、喜欢/避免的类型、体力/排队容忍。

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

## 共享数据

Phase 1 产出 `shared/route-schema.json`，Phase 3 和 Phase 4 共用。行程只标准化一次。

### 数据可信度标记

route-schema.json 中每个 location 应包含 `verified` 字段：

- `true` — Phase 2 已调研，amap/dianping/xhs 字段已填充
- `false` — Phase 2 未执行或该点未调研，数据基于通用知识

### 多版本方案数据结构

当存在多条可行路线时，route-schema.json 的顶层增加 `plans` 数组，每个元素是一个独立方案（含 id/name/color/stat/cost_per_person/days）。读取 `references/multi-plan.md` 获取完整方法论。

## Phase 1: Plan — 交通查询 + 行程规划 + AMap 验证

读取 `references/trip-planning.md` 获取完整方法论。
读取 `references/transport-query.md` 获取交通查询详细工作流。
读取 `references/amap-services.md` 获取 REST API 路线验证方法。

### 前置收集

先明确：出发地、目的地、日期范围、主要交通方式、人数及年龄段、节奏偏好、餐饮预算、饮食限制。

### 核心流程

1. **抽取硬约束** — 日期、航班、航站楼、酒店
2. **交通查询** — 火车/高铁/飞机车次航班查询（WebSearch + WebFetch 携程）
3. **愿望清单分组** — 城内轻松/需预约/远郊/可路过
4. **删高风险点** — 天数不够、节假日拥挤、天气敏感
5. **AMap 地理编码** — `AMap.Geocoder.getLocation(address)` → 坐标 [lng, lat]
6. **AMap 路径规划验证** — REST API `direction/driving` 验证距离/时长/过路费；JSAPI Driving 备选
7. **AMap 行政区查询** — `AMap.DistrictSearch` 辅助按区域分组
8. **按区域重组** — 一天一个主区域
9. **补餐饮** — 按当天区域给候选
10. **补票务交通** — 只查关键的
11. **多版本判断** — 如存在互斥分支或交通组合，生成 2-4 个版本
12. **输出** — 参考文档 + `route-schema.json`（含 `plans` 数组）

### 路线验证（HARD RULE）

每段驾驶路线**必须**通过高德 REST API 验证，不使用估算值。验证结果写入 `drives` 数组，包含 `time`、`dist`、`toll` 三个字段。

REST API 需「Web 服务」型 Key（`AMAP_REST_KEY`），与 JSAPI Key 不同。如报 `USERKEY_PLAT_NOMATCH`，说明 Key 类型不匹配。

### 费用分摊模型

多版本对比时，费用分为两类：

- **均摊项**（按人数分摊）：租车、油费（~0.7 RMB/km）、过路费、住宿、餐饮
- **个人项**（不均摊）：高铁票、机票

```
人均费用 = (均摊项总和 ÷ 人数) + 个人项费用
```

`stat` 字段中的费用摘要**必须**与 `cost_per_person` 字段一致。

### 关键原则

- 不端水，替用户删东西，明说删了什么和为什么
- 一天一个主区域，一天只放一个重预约点
- 行程越顺越好，不是越满越好
- 用户交互遵循四拍格式：Re-ground → Simplify → Recommend → Options
- 存在互斥路线时，并行生成多版本供用户选择

## Phase 2: Research — 多源调研（双轨）

### 路径选择

| 路径 | 方案 | 前提 | 数据质量 | 适用环境 |
|------|------|------|----------|----------|
| A（主） | WebSearch + WebFetch | 无 | 中 | 沙箱/无登录 |
| B（高级） | CDP 直连拦截 API | 已登录 Chrome | 高 | 本地已登录浏览器 |

**自动选择**：检测 `http://127.0.0.1:9222` 是否可达。可达 → 路径 B；不可达 → 路径 A。

### 数据源总览

| 数据需求 | 路径 A 数据源 | 路径 B 数据源 | 验证状态 |
|----------|--------------|--------------|----------|
| 坐标/地址/电话 | AMap PlaceSearch | AMap PlaceSearch | ✅ |
| 餐厅评分/口味 | 携程美食（含大众点评数据） | 同 A | ✅ |
| 餐厅体验/排队 | 什么值得买+途牛 | CDP 拦截小红书笔记 | ✅ A / ✅ B(需登录) |
| 景点氛围/拍照 | 携程旅拍+头条 | CDP 拦截小红书笔记 | ✅ A / ✅ B(需登录) |
| 天气 | AMap Weather | AMap Weather | ✅ |
| 火车/高铁 | 携程火车 | 同 A | ✅ |
| 飞机航班 | 携程机票 | 同 A | ✅ |

### 大众点评/小红书直连状态

| 平台 | 直连状态 | 拦截方式 | 修复方案 |
|------|----------|----------|----------|
| 大众点评 (PC) | ✅ 可用（已登录 + OpenCLI） | OpenCLI dianping adapter | 未登录 → 美团验证中心（拼图滑块）；登录后必须传数字 cityId（哈尔滨=79） |
| 小红书 | ✅ 可用（已登录 + OpenCLI） | OpenCLI xiaohongshu adapter | 未登录 → 登录墙，search/notes 不触发；登录后 `whoami`/`search` 实测通过 |

**2026-08-13 CDP 测试验证（沙箱·未登录）**：
- ✅ CDP 拦截技术完全可行（成功拦截 66 个 API、获取 42 个响应体）
- ✅ `search/recommend` API 无需登录可用（返回搜索联想词）
- ❌ `search/notes` API 需登录态 — 前端检测未登录后弹出登录弹窗，不调用搜索 API
- ✅ 连接已登录的 Chrome（使用用户 user-data-dir）即可拦截 search/notes

**2026-08-13 本地实测（已登录 Chrome + OpenCLI v1.8.6）**：
- ✅ `opencli doctor` 全绿（daemon 19825 + Browser Bridge 扩展 v1.0.22 已连接）
- ✅ `opencli xiaohongshu whoami`（logged_in: true）/ `search` 返回笔记（rank/author/likes/带 xsec_token 的 url）
- ✅ `opencli dianping search "中央大街 火锅" --city 79` 返回 shop_id/rating/reviews/price/cuisine/district
- ✅ `opencli dianping shop <id>` 返回 taste/environment/service/hours/address/subway/features
- ⚠️ dianping 省略 `--city` 时 cityId=0 会被重定向到首页（必传数字 cityId）

读取 `references/dianping-research.md` 获取餐厅调研完整工作流。
读取 `references/xhs-research.md` 获取体验调研双轨方案完整细节。

## Phase 3: Build — AMap JSAPI 交互式地图

### 单版本模式

1. 复制 `assets/template.html` → `index.html`
2. 复制 `assets/env.example.js` → `env.js`，填入高德 API Key 和安全密钥
3. 填充 `HOTEL` 对象和 `DAYS` 数组（来自 route-schema.json）
4. 每个 location 需要：name, lng/lat, type, time, desc; 可选：budget, pay, xhs, reserve, amap, verified
5. 未验证 location (`verified: false`) 的卡片上显示“⚠ 未经调研验证”标签
6. 填充 `overviewContent()` 行程摘要 + 支付提示

### 多版本模式

当 Phase 1 产出了多个方案时，额外生成移动端独立 HTML：

读取 `references/multi-plan.md` 获取完整方法论。

1. 复制 `assets/mobile-template.html` → `mobile/plan-{id}.html`（每个方案一个）
2. 生成 `mobile/overview.html`（四版总对比页）
3. API 密钥**内嵌**在 HTML 中（不依赖外部 env.js），单文件可在手机浏览器直接打开
4. 使用 `str.replace("__PLACEHOLDER__", value)` 填充模板，**不用** f-string（JS 花括号冲突）
5. overview.html 中“查看详情”链接的 onclick **必须**添加 `event.stopPropagation()` 防止冒泡
6. 验证所有文件的 `stat` 与 `cost_per_person` 一致性

### 事件隔离（HARD RULE）

当可点击的父元素（如 `.plan-card onclick=showPlanOnMap()`）内嵌套了 `<a>` 链接时，链接的 `onclick` **必须**添加：

```javascript
event.stopPropagation();
event.preventDefault();
window.location.href = 'target.html';
```

否则点击链接会冒泡触发父元素的 onclick，导致无法跳转。

### 部署

**GitHub Pages（推荐，手机可直接访问）**：
```bash
git init && git add . && git commit -m "trip map"
gh repo create REPO --public --source=. --push
gh api repos/:owner/:repo/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```

**本地服务器（仅本机）**：
```bash
python3 -m http.server 8080
```

**移动端独立文件（无需服务器）**：
`mobile/plan-*.html` 和 `mobile/overview.html` 内嵌 API 密钥，可通过 AirDrop / 文件传输直接在手机浏览器打开。

## Phase 4: Visualize — AI 生图（可选）

读取 `references/route-visualization.md` 和 `references/style-presets.md`。

## 依赖

| 工具 | 用途 | 验证状态 |
|------|------|----------|
| AMap JSAPI v2.0 | 地图渲染 + 地理服务 | ✅ 已验证 |
| AMap REST API | 驾车路线验证（距离/时长/过路费） | ✅ 已验证（需 Web 服务型 Key） |
| WebSearch | 餐厅/景点/交通搜索 | ✅ 已验证 |
| WebFetch | 详情页/车次/航班抓取 | ✅ 已验证 |
| OpenCLI v1.8.6 | 大众点评 + 小红书直连（路径 B） | ✅ 已验证（需已登录 Chrome + Browser Bridge 扩展） |
| Puppeteer + CDP | 小红书 API 拦截（路径 B 备选） | ✅ 技术可行，需已登录 Chrome |
| AI 生图工具 | Phase 4 路线图生成 | 待验证 |

## Resources

- `references/trip-planning.md` — 行程规划方法论
- `references/transport-query.md` — 交通查询工作流
- `references/multi-plan.md` — 多版本方案生成方法论（路线验证/费用分摊/移动端模板/事件隔离）
- `references/dianping-research.md` — 多源餐厅调研工作流
- `references/xhs-research.md` — 双轨体验调研工作流（WebSearch + CDP）
- `references/amap-services.md` — 高德服务集成指南（含 REST API 路线验证）
- `references/route-visualization.md` — 路线图生成方法论
- `references/style-presets.md` — 视觉风格预设
- `assets/template.html` — AMap JSAPI HTML 地图模板（桌面端，依赖 env.js）
- `assets/mobile-template.html` — 移动端独立行程模板（内嵌密钥，单文件）
- `assets/env.example.js` — AMap Key 配置模板
- `shared/route-schema.json` — 统一行程数据格式