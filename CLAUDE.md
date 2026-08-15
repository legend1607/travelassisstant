# travel-assistant - 旅行助手技能包
四阶段流水线：Plan → Research → Build → Visualize

<directory>
assets/ - AMap JSAPI 地图模板和配置 (3文件: template.html, mobile-template.html, env.example.js)
references/ - 规划、交通查询、调研、地图服务、路线可视化、多版本方案方法论 (8文件)
shared/ - 统一行程数据格式 (1文件: route-schema.json)
mobile/ - 移动端独立行程页面（产物，内嵌密钥，不提交）
</directory>

<config>
SKILL.md - Agent 技能入口，定义触发条件、执行检查清单、共享记忆和四阶段流程
</config>

法则:
- 行程是参考坐标，不是执行脚本
- AMap 是唯一地图引擎
- env.js 已 gitignore，使用 env.example.js 作为模板
- Phase 1 包含交通查询：携程 WebSearch+WebFetch 获取火车车次和航班信息
- Phase 1 包含 REST API 路线验证：每段驾驶路线必须通过高德 REST API 验证距离/时长/过路费
- Phase 1 多版本判断：存在互斥分支或交通组合时生成 2-4 个版本
- Phase 1 费用分摊：均摊项（租车/油费/过路费/住宿/餐饮）÷人数 + 个人项（高铁/机票）
- stat 字段中的费用必须与 cost_per_person 一致
- Phase 2 双轨：路径 A（WebSearch 多源聚合，无需登录）/ 路径 B（CDP 拦截小红书 API + OpenCLI adapter，需已登录 Chrome）
- 大众点评直连需已登录 Chrome + OpenCLI，且必须传数字 cityId（省略时 cityId=0 被重定向到首页）；哈尔滨 cityId=79，拼音是 haerbin 不是 harbin
- OpenCLI v1.8.6 + Browser Bridge 扩展 v1.0.22 已验证可用（Windows）：`opencli dianping search/shop`、`opencli xiaohongshu search` 均实测通过
- 小红书 search/notes API 需登录态，未登录时前端不调用该 API（2026-08-13 CDP 测试验证）
- CDP 技术完全可行：成功拦截 66 个 API、获取 42 个响应体，唯一障碍是登录态
- 连接已登录 Chrome（使用用户 user-data-dir）即可拦截 search/notes API；Windows 用 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 解锁 opencli.ps1
- search/recommend API 无需登录可用（返回搜索联想词）
- Phase 2 完成后将所有 location 的 verified 设为 true
- Phase 3 单版本：template.html + env.js → index.html
- Phase 3 多版本：mobile-template.html → mobile/plan-{id}.html + mobile/overview.html，密钥内嵌
- Phase 3 事件隔离：可点击卡片内嵌链接必须 event.stopPropagation() + event.preventDefault()
- Phase 3 模板填充用 str.replace 不用 f-string（JS 花括号冲突）
- REST API 需 Web 服务型 Key（AMAP_REST_KEY），JSAPI Key 调 REST API 会报 USERKEY_PLAT_NOMATCH
- MEMORY.md 每次会话结束必须更新（强制）
- 部署优先用 GitHub Pages；移动端独立文件可免服务器直接在手机打开
- 餐厅先看当天区域，再看评分和体验

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md