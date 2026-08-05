# TravelAssisstant — 个人旅行规划 Web 应用

基于 `trip-map-builder` 和 `interactive-trip-planner` 双技能构建的个人旅行规划 SPA。

## 特性

- **六阶段规划工作流**：理解方向 → 寻找地点 → 规划行程 → 动态地图 → 用户调整 → 导出
- **富交互地图**：拖拽排序、优先级标记、搜索筛选、撤销、状态恢复（Europe 公开母版）
- **多源调研**：高德地图 POI 搜索 + 小红书 CDP 调研 + 美团 CDP 调研
- **品味模板系统**：city-craft-rhythm / food-nightlife-locality 影响选点和节奏
- **来源验证**：结构化 sources + evidenceSources 公开呈现
- **验证管道**：导出前自动校验数据完整性
- **离线优先**：数据存 localStorage，无需注册登录

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS |
| 状态管理 | Zustand + persist (localStorage) |
| 地图（内部） | 高德地图 JS API 2.0 |
| 地图（导出） | Europe 公开母版（Leaflet 富交互） |
| 后端 | Express + chrome-remote-interface（CDP 代理） |
| 存储 | localStorage |

## 项目结构

```
travelassisstant/
├── docs/                    # 设计文档和实现计划
├── skill-assets/            # 从两个技能复制的静态资产
│   ├── trip-map-builder/    # 三阶段方法论 + CDP 调研 + 简单模板
│   └── interactive-trip-planner/  # 六阶段工作流 + 富交互模板 + 品味模型
├── client/                  # React SPA（待实现）
├── server/                  # Express CDP 代理（待实现）
└── shared/                  # 前后端共享类型（待实现）
```

## 快速开始

```bash
# 安装依赖（待项目骨架搭建后）
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入高德 API key

# 启动开发服务器
pnpm dev
```

## 文档

- [完整实现计划（融合双技能版）](docs/travel-planner-app-plan.md)

## License

Personal use only.
