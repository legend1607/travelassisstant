# Travel Assistant — 旅行助手

四阶段流水线旅行规划技能：**Plan → Research → Build → Visualize**

融合 `trip-map-builder`、`travelmapgenator` 和 `amap-jsapi-skill` 三个技能，使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。

## 四阶段流程

| 阶段 | 名称 | 输入 | 输出 | 验证状态 |
|------|------|------|------|----------|
| Phase 1 | Plan | 用户需求 + 硬约束 | 参考行程 + `route-schema.json` | ✅ 已验证（哈尔滨6日） |
| Phase 2 | Research | Phase 1 行程 | 填充调研数据的 `route-schema.json` | ⚠️ 需登录态，有降级策略 |
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
│   ├── dianping-research.md        # 大众点评调研工作流
│   ├── xhs-research.md             # 小红书调研工作流
│   ├── route-visualization.md      # 路线图生成方法论
│   └── style-presets.md            # 视觉风格预设
└── shared/
    └── route-schema.json           # 统一行程数据格式
```

## 依赖

| 工具 | 用途 | 安装 |
|------|------|------|
| AMap JSAPI v2.0 | 地图渲染 + 地理服务 | loader.js CDN，需 API Key |
| OpenCLI v1.8.6+ | 大众点评 + 小红书调研 | `npm install -g @jackwener/opencli` |
| Chrome/Chromium | 浏览器 + 远程调试 | 已有 |
| AI 生图工具 | Phase 4 路线图生成 | 内置 |

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

## Phase 2 调研链路前提

大众点评和小红书均需要已登录的浏览器会话：

- **大众点评**：未登录会重定向至 `verify.meituan.com` 验证中心（拼图滑块）
- **小红书**：未登录会弹出"登录后查看搜索结果"弹窗

使用 OpenCLI + Chrome CDP 连接真实已登录的浏览器，不要使用 headless 模式。

**降级策略**：当调研不可用时，不静默跳过。所有 location 标注 `verified: false`，地图卡片显示"未经调研验证"标签，告知用户数据基于通用知识。

## 部署地图页面

### 方式一：GitHub Pages（推荐，手机可直接访问）

```bash
git init && git add . && git commit -m "trip map"
gh repo create REPO --public --source=. --push
# 开启 Pages
gh api repos/:owner/:repo/pages -X POST -f "source[branch]=main" -f "source[path]=/"
# 访问 https://<username>.github.io/<repo>/
```

### 方式二：本地服务器（仅本机访问）

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080/index.html
# 注意：沙箱/远程环境中手机无法通过 localhost 访问
```

## 触发词

"做个行程"、"行程规划"、"行程地图"、"trip map"、"plan my trip"、"帮我画路线图"、"生成行程封面"

## 运行时反馈（v1.2.0）

基于 2026-08-12 哈尔滨行程规划实际运行：

- Phase 1（规划）：正常执行，AMap 坐标填充正确
- Phase 2（调研）：未执行（OpenCLI Browser Bridge 未连接），已按降级策略标注
- Phase 3（地图）：正常生成，AMap JSAPI 3D 渲染正常
- Phase 4（生图）：未触发（用户未要求）
- MEMORY.md：未创建 → 已在 v1.2.0 中修复为强制步骤

## License

MIT