# Travel Assistant — 旅行助手

四阶段流水线旅行规划技能：**Plan → Research → Build → Visualize**

融合 `trip-map-builder`、`travelmapgenator` 和 `amap-jsapi-skill` 三个技能，使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。

## 四阶段流程

| 阶段 | 名称 | 输入 | 输出 | 验证状态 |
|------|------|------|------|----------|
| Phase 1 | Plan | 用户需求 + 硬约束 | 参考行程 + `route-schema.json` | ✅ 已验证（哈尔滨6日） |
| Phase 2 | Research | Phase 1 行程 | 填充调研数据的 `route-schema.json` | ✅ 已验证（WebSearch+WebFetch） |
| Phase 3 | Build | Phase 2 行程 | AMap JSAPI 3D 交互式地图页面 | ✅ 已验证 |
| Phase 4 | Visualize | `route-schema.json` | AI 生成的路线图图片（可选） | 待验证 |

## 项目结构

```
travel-assistant/
├── SKILL.md                        # 技能入口，定义四阶段流水线 + 执行检查清单
├── CLAUDE.md                       # 项目地图和目录结构
├── README.md                       # 本文件
├── assets/
│   ├── template.html               # AMap JSAPI 3D 交互式地图模板
│   └── env.example.js              # 高德 API Key 配置模板（复制为 env.js 使用）
├── references/
│   ├── trip-planning.md            # 行程规划方法论 + 输出检查清单 + MEMORY 模板
│   ├── amap-services.md            # 高德服务集成指南
│   ├── dianping-research.md        # 多源餐厅调研工作流（携程+什么值得买+途牛）
│   ├── xhs-research.md             # 多源体验调研工作流（携程旅拍+头条+什么值得买）
│   ├── route-visualization.md      # 路线图生成方法论
│   └── style-presets.md            # 视觉风格预设
└── shared/
    └── route-schema.json           # 统一行程数据格式
```

## 依赖

| 工具 | 用途 | 安装 | 验证状态 |
|------|------|------|----------|
| AMap JSAPI v2.0 | 地图渲染 + 地理服务 | loader.js CDN，需 API Key | ✅ 已验证 |
| WebSearch | 餐厅/景点评价搜索 | 内置 | ✅ 已验证 |
| WebFetch | 详情页抓取 | 内置 | ✅ 已验证 |
| AI 生图工具 | Phase 4 路线图生成 | 内置 | 待验证 |

## 环境配置

1. 复制配置模板：`cp assets/env.example.js assets/env.js`
2. 编辑 `assets/env.js`，填入你的高德 API Key 和安全密钥
3. `env.js` 已在 `.gitignore` 中，不会被提交

```javascript
window._AMapSecurityConfig = {
  securityJsCode: '你的安全密钥',
};
window.AMAP_JSAPI_KEY = '你的Web端Key';
```

## Phase 2 调研链路（v1.3.0）

v1.3.0 使用 **WebSearch + WebFetch 多源聚合**方案，无需登录浏览器：

| 数据需求 | 数据源 | 获取方式 |
|----------|--------|----------|
| 餐厅评分/口味/排队 | 携程美食（含大众点评数据） | WebSearch + WebFetch |
| 餐厅体验/价格/踩雷 | 什么值得买 + 途牛 + 去哪儿 | WebSearch + WebFetch |
| 景点氛围/拍照点/体验 | 携程旅拍 + 头条 | WebSearch + WebFetch |
| 坐标/地址/电话/营业时间 | AMap PlaceSearch | JSAPI 调用 |
| 天气 | AMap Weather | JSAPI 调用 |

## 部署地图页面

### 方式一：GitHub Pages（推荐，手机可直接访问）

```bash
git init && git add . && git commit -m "trip map"
gh repo create REPO --public --source=. --push
gh api repos/:owner/:repo/pages -X POST -f "source[branch]=main" -f "source[path]=/"
# 访问 https://<username>.github.io/<repo>/
```

### 方式二：本地服务器（仅本机访问）

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/index.html
```

## 触发词

"做个行程"、"行程规划"、"行程地图"、"trip map"、"plan my trip"、"帮我画路线图"、"生成行程封面"

## 版本历史

- **v1.3.0** — Phase 2 改用 WebSearch+WebFetch 多源聚合，无需登录，全部数据源已验证
- **v1.2.0** — 增加 MEMORY.md 强制步骤、Phase 2 降级策略、GitHub Pages 部署、verified 字段
- **v1.1.0** — 增加 env.example.js、.gitignore 安全规则、Phase 2 验证结果
- **v1.0.0** — 初始版本，四阶段流水线设计

## License

MIT