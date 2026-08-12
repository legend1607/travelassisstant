---
name: travel-assistant
description: >
  四阶段旅行助手：规划行程（AMap 地理编码+路径规划验证）→ 调研餐厅景点（大众点评+小红书+AMap POI）→
  构建交互式地图页面（AMap JSAPI 3D）→ 生成路线图图片（AI 生图，可选）。
  使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。
  触发词："做个行程"、"行程规划"、"行程地图"、"trip map"、"plan my trip"、"帮我画路线图"、"生成行程封面"。
license: MIT
version: 1.1.0
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

## 共享记忆

开始前读取 `~/.travel-assistant/MEMORY.md`（如存在）。仅用于持久化旅行偏好：

- 交通方式偏好、节奏偏好
- 餐饮口味和预算习惯
- 支付和导航偏好
- 历史行程输出索引
- 未解决的问题

不存在则正常继续，不阻塞。不存储截图、证件、订单号、聊天记录。

每次完成后更新 MEMORY.md，只保存下次仍有用的信息。

## 共享数据

Phase 1 产出 `shared/route-schema.json`，Phase 3 和 Phase 4 共用。行程只标准化一次。

## Phase 1: Plan — 行程规划 + AMap 验证

读取 `references/trip-planning.md` 获取完整方法论。

### 前置收集

先明确：主要交通方式（自驾/公共交通/步行/混合）、人数及年龄段、节奏偏好、餐饮预算、饮食限制。

### 核心流程

1. **抽取硬约束** — 日期、航班、航站楼、酒店
2. **愿望清单分组** — 城内轻松/需预约/远郊/可路过
3. **删高风险点** — 天数不够、节假日拥挤、天气敏感
4. **AMap 地理编码** — `AMap.Geocoder.getLocation(address)` → 坐标 [lng, lat]
5. **AMap 路径规划验证** — 根据交通方式调用 Driving/Transfer/Walking，获取实际通行时间
6. **AMap 行政区查询** — `AMap.DistrictSearch` 辅助按区域分组
7. **按区域重组** — 一天一个主区域
8. **补餐饮** — 按当天区域给候选
9. **补票务交通** — 只查关键的
10. **输出** — 参考文档 + `route-schema.json`

读取 `references/amap-services.md` 获取 AMap 服务 API 用法。

### 关键原则

- 不端水，替用户删东西，明说删了什么和为什么
- 一天一个主区域，一天只放一个重预约点
- 行程越顺越好，不是越满越好
- 用户交互遵循四拍格式：Re-ground → Simplify → Recommend → Options

## Phase 2: Research — 调研 + AMap POI

### 前提条件

大众点评和小红书均需要**已登录的浏览器会话**。未登录状态下：
- 大众点评会重定向至 `verify.meituan.com` 验证中心（拼图滑块）
- 小红书会弹出"登录后查看搜索结果"弹窗

使用 OpenCLI + Chrome CDP 连接真实浏览器（已登录态），不要使用 headless 模式。

### 核心流程

1. **AMap POI 搜索** — `AMap.PlaceSearch.searchNearBy` 按区域搜索餐厅/景点
2. **AMap 输入提示** — `AMap.AutoComplete.search` 补全地址和坐标
3. **AMap 天气查询** — `AMap.Weather.getLive/getForecast` 标记天气敏感点
4. **大众点评调研** — OpenCLI 获取口味/排队/踩雷信号（需登录态）
5. **小红书调研** — Chrome CDP 获取氛围/体验/拍照信号（需登录态）
6. **信号合并** — AMap 结构化数据 + 大众点评餐饮判断 + 小红书体验补充

读取 `references/dianping-research.md` 获取大众点评工作流（含刷好评识别）。
读取 `references/xhs-research.md` 获取小红书工作流（含差评筛选+推广帖甄别）。

### 信号合并优先级

- 坐标/地址/电话/营业时间 → AMap PlaceSearch
- 口味/排队/踩雷/性价比 → 大众点评（注意刷好评识别）
- 氛围/拍照/近期体验 → 小红书（注意推广帖甄别+差评筛选）

### 更新 route-schema.json

填充每个 location 的 `amap`、`dianping`、`xhs` 字段。

## Phase 3: Build — AMap JSAPI 交互式地图

1. 复制 `assets/template.html` → `index.html`
2. 复制 `assets/env.example.js` → `env.js`，填入你的高德 API Key 和安全密钥
3. 填充 `HOTEL` 对象和 `DAYS` 数组（来自 route-schema.json）
4. 每个 location 需要：name, lng/lat, type, time, desc; 可选：budget, pay, xhs, reserve, amap
5. 填充 `overviewContent()` 行程摘要 + 支付提示
6. 默认 Apple 设计系统，可通过 awesome-design-md 切换

Location types: `food` | `spot` | `drink` | `hotel` | `transport`

Payment chip values: `1` = 已确认（绿色）, `0.5` = 不确定（橙色）, 省略 = 不显示

### 部署（可选）

```bash
git init && git add . && git commit -m "trip map"
gh repo create REPO --public --source=. --push
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
| OpenCLI v1.8.6+ | 大众点评 + 小红书调研 | `npm install -g @jackwener/opencli` | ✅ 已安装，需浏览器扩展 |
| Chrome/Chromium | 浏览器 + 远程调试 | 已有 | ⚠️ 需登录态 |
| AI 生图工具 | Phase 4 路线图生成 | 内置 | 待验证 |

## Resources

- `references/trip-planning.md` — 行程规划方法论、输入/输出模板、选点原则
- `references/dianping-research.md` — 大众点评工作流、刷好评识别
- `references/xhs-research.md` — 小红书工作流、差评筛选、推广帖甄别
- `references/amap-services.md` — 高德服务集成指南
- `references/route-visualization.md` — 路线图生成方法论
- `references/style-presets.md` — 视觉风格预设
- `assets/template.html` — AMap JSAPI HTML 地图模板
- `assets/env.example.js` — AMap Key 配置模板（复制为 env.js 使用，env.js 已 gitignore）
- `shared/route-schema.json` — 统一行程数据格式