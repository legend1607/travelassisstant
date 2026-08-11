# Travel Assistant — 旅行助手

四阶段流水线旅行规划技能：**Plan → Research → Build → Visualize**

融合 `trip-map-builder`、`travelmapgenator` 和 `amap-jsapi-skill` 三个技能，使用高德地图 JSAPI v2.0 作为唯一地图引擎，面向国内旅行场景。

## 四阶段流程

| 阶段 | 名称 | 输入 | 输出 |
|------|------|------|------|
| Phase 1 | Plan | 用户需求 + 硬约束 | 参考行程 + `route-schema.json` |
| Phase 2 | Research | Phase 1 行程 | 填充调研数据的 `route-schema.json` |
| Phase 3 | Build | Phase 2 行程 | AMap JSAPI 3D 交互式地图页面 |
| Phase 4 | Visualize | `route-schema.json` | AI 生成的路线图图片（可选） |

## 项目结构

```
travel-assistant/
├── SKILL.md                        # 技能入口，定义四阶段流水线
├── CLAUDE.md                       # 项目地图和目录结构
├── README.md                       # 本文件
├── assets/
│   ├── template.html               # AMap JSAPI 3D 交互式地图模板
│   └── env.js                      # 高德 API Key + 安全密钥配置
├── references/
│   ├── trip-planning.md            # 行程规划方法论
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
| OpenCLI | 大众点评 + 小红书调研 | `npm install -g @jackwener/opencli` |
| Chrome/Chromium | 浏览器 + 远程调试 | 已有 |
| AI 生图工具 | Phase 4 路线图生成 | 内置 |

## 环境配置

设置高德 API Key（编辑 `assets/env.js`）：

```javascript
window._AMapSecurityConfig = {
  securityJsCode: '你的安全密钥',
};
window.AMAP_JSAPI_KEY = '你的Web端Key';
```

## 触发词

"做个行程"、"行程规划"、"行程地图"、"trip map"、"plan my trip"、"帮我画路线图"、"生成行程封面"

## License

MIT
