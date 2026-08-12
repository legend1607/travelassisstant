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
- 大众点评和小红书需要已登录的浏览器会话，headless 不可用
- Phase 2 不可用时必须标注 verified: false，不静默跳过
- MEMORY.md 每次会话结束必须更新（强制）
- 部署优先用 GitHub Pages，本地服务器在远程环境中手机不可访问
- 餐厅先看当天区域，再看大众点评和小红书
- 大众点评注意刷好评，小红书注意推广帖和差评

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md