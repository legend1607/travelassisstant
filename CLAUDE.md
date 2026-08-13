# travel-assistant - 旅行助手技能包
四阶段流水线：Plan → Research → Build → Visualize

<directory>
assets/ - AMap JSAPI 地图模板和配置 (2文件: template.html, env.example.js)
references/ - 规划、交通查询、调研、地图服务、路线可视化方法论 (7文件)
shared/ - 统一行程数据格式 (1文件: route-schema.json)
</directory>

<config>
SKILL.md - Agent 技能入口，定义触发条件、执行检查清单、共享记忆和四阶段流程
</config>

法则:
- 行程是参考坐标，不是执行脚本
- AMap 是唯一地图引擎
- env.js 已 gitignore，使用 env.example.js 作为模板
- Phase 1 包含交通查询：携程 WebSearch+WebFetch 获取火车车次和航班信息
- Phase 2 双轨：路径 A（WebSearch 多源聚合，无需登录）/ 路径 B（CDP 拦截小红书 API，需已登录 Chrome）
- 大众点评直连不可修复（美团验证中心），使用携程美食替代（含大众点评数据）
- 小红书 search/notes API 需登录态，未登录时前端不调用该 API（2026-08-13 CDP 测试验证）
- CDP 技术完全可行：成功拦截 66 个 API、获取 42 个响应体，唯一障碍是登录态
- 连接已登录 Chrome（使用用户 user-data-dir）即可拦截 search/notes API
- search/recommend API 无需登录可用（返回搜索联想词）
- Phase 2 完成后将所有 location 的 verified 设为 true
- MEMORY.md 每次会话结束必须更新（强制）
- 部署优先用 GitHub Pages
- 餐厅先看当天区域，再看评分和体验

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md