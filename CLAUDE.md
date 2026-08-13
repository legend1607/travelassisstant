# travel-assistant - 旅行助手技能包
四阶段流水线：Plan → Research → Build → Visualize

<directory>
assets/ - AMap JSAPI 地图模板和配置 (2文件: template.html, env.example.js)
references/ - 规划、调研、地图服务、路线可视化方法论 (6文件)
shared/ - 统一行程数据格式 (1文件: route-schema.json)
</directory>

<config>
SKILL.md - Agent 技能入口，定义触发条件、执行检查清单、共享记忆和四阶段流程
</config>

法则:
- 行程是参考坐标，不是执行脚本
- AMap 是唯一地图引擎
- env.js 已 gitignore，使用 env.example.js 作为模板
- Phase 2 使用 WebSearch + WebFetch 多源聚合，不依赖 OpenCLI/CDP
- 餐厅评分数据从携程美食获取（含大众点评数据），体验数据从携程旅拍+什么值得买获取
- Phase 2 完成后将所有 location 的 verified 设为 true
- MEMORY.md 每次会话结束必须更新（强制）
- 部署优先用 GitHub Pages，本地服务器在远程环境中手机不可访问
- 餐厅先看当天区域，再看评分和体验
- 注意刷好评识别和推广帖甄别

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md