---
name: interactive-trip-planner
description: Use when 用户想规划旅行、制作旅游攻略、寻找适合自己的地点、设计每日路线、复核酒店/餐厅/景点/交通/节庆、生成可点击动态地图、让地图内容跟随对话语言，或希望在地图中调整地点并让 Codex 重新安排行程。
---

# Interactive Trip Planner

把旅行想法制作成一套有设计思路、有事实依据、可以在地图中浏览和修改、并能继续迭代的旅行计划。

核心原则：先理解用户想怎样旅行，再寻找地点和规划路线；地图是主要使用界面，交付不是终点。所有给旅行者看的内容使用自然语言，并尽量跟随用户当前主要对话语言；内部数据和开发术语不出现在聊天和地图界面。

0.1.0 是尚未发布的 developer-preview contract slice，只表示本 Skill 当前实现的可验证子集，不等于 PRD V1 public acceptance。在 8 个海外 Regional Source Pack、每个 taste model 至少 3 个 unseen cities 评估与更强 representative evidence 全部满足前，不得宣称 public V1 ready。

## 开始时向用户说明

完整规划开始前，用 2-3 句话说明流程，不直接进入酒店清单、景点清单或地图制作：

```text
我会先确认会改变路线的关键信息，再给你一版旅行设计提案。方向确认后，我会寻找适合你的地点、复核交通和营业等信息、安排每日路线，并制作一份可以继续调整的旅行地图；你在地图里修改后，我还会根据这些选择重新安排行程。
```

先读取当前目录或上级 `AGENTS.md`。没有旅行工作区规则时，按 `references/workspace-bootstrap.md` 建立。用户提供了旧攻略、参考地图或历史文件时，先读当前产物和线上逻辑，不能用聊天印象代替当前事实。

## 六阶段完整流程

### 阶段一：理解并确认旅行方向

目标不是提前确认完整行程，而是弄清楚这趟旅行想怎样过。

执行：

1. 整理用户已经提供的日期、目的地、抵达离开、同行人、体力、兴趣、预算、交通、住宿和必去事项，不重复提问。
2. 第一轮最多询问 3-5 组会改变路线骨架的问题。床型、每顿预算、潜水资质、停车、夜生活边界等只在相关路线出现后再问。
3. 必要时做一次轻量搜索，确认季节、城市关系、重要节庆和明显不可行条件；此时不深挖每个地点。
4. 在对话中给出一次旅行设计提案。用户偏好明确时直接归纳暂定主线；方向不明确时提供 3-5 个真正会产生不同路线的主题候选。
5. 根据目的地、玩法、节奏、同行人与兴趣判断生活品味模板是否会显著改变选点或节奏。会改变时推荐 1–3 个并分别说明强化和舍弃；用户可以单选、不使用现成模板，或选择一主一辅。主模板负责选点和节奏，辅模板只补一个明确领域或视觉倾向，不做比例调参。
6. 确认 visitor mode：`first-visit`、`return-visit`、`landmark-light`、`local-only` 或 `balanced-visitor`。第一次使用当前 Skill、第一次咨询或第一次规划不等于第一次到访目的地；用户没有明确到访历史时，记录“到访史未知”并只能暂定 `balanced-visitor`，不能写成首次到访。“想更 local”本身也不能推断为排除代表性景点。

一次旅行设计提案必须说明：

- 旅行主线：这趟旅行主要在体验什么。
- 行程段：每段经过哪里，有一个一眼能懂的名字，并说明看什么、吃什么、为什么值得。
- 同期活动：节庆、展览、市集、演出、赛事或自然体验会怎样影响路线。
- 取舍：强化什么、降低什么、为什么不加入其他著名地点。
- 酒店逻辑：适合住在哪些区域，如何影响出发、回程、休息、安全和跨城移动。
- 吃饭逻辑：正式餐、地方经典、小吃、咖啡、甜品、酒吧前轻餐和保底餐如何服务路线。
- 每日骨架：每天 1-3 个主锚点及其大致方向，不在此时假装已经完成精确排程。
- 游客与在地平衡：说明 visitor mode 与到访史；已确认首次或到访史未知的城市如何把代表性景点与同方向的当地生活一起安排，并逐城写明至少 3 个已评估代表性景点的采用或舍弃理由。
- 待确认事项：只列仍会显著改变路线的 2-5 项。
- 模板选择：说明本次使用哪种生活品味、为什么适合；跳过时直接按用户本次偏好继续。

进入下一阶段：用户确认主方向，或用户已经给出足够明确的主题和路线要求。完整攻略只做一次主确认；局部修改、用户要求跳过提案或当前对话已确认方向时可以直接继续。

详细规则见 `references/planning-workflow.md`、`references/theme-library.md`、`references/theme-narrative.md` 和 `references/hybrid-taste-models.md`。

### 阶段二：寻找适合用户的地点

目标不是复制热门榜单，而是建立一组能服务旅行主题、路线、吃住和风险替代的地点候选。

执行前读取 `references/source-verification.md` 和 `references/regional-source-packs.md`。0.1.0 内置 Global、中国大陆、日本、法语区四个 Regional Source Pack；其他目的地使用 Global Base 与三语动态搜索。按照“先发现、后核实”的顺序搜索：

1. 建立搜索任务单：明确日期、区域、主题、用户偏好、选中的生活品味、必须覆盖的地点角色和需要实时复核的事实。
2. 选择 Global Base 与一个匹配的地区包，按 A/B/C 可访问性先探测来源；B/C 失败时执行明确 fallback。中国大陆先运行 `scripts/check-amap-cli.js` 探测可选增强，不读取或输出密钥；CLI 不可用时明确未完成高德路网复核，不伪造路线。
3. 使用地区包的十类查询意图，至少组合中文、英文和目的地当地语言搜索。先从官方旅游、文化日历、地图和主题资料发现候选，再用地点官网、主办方、交通运营方和订位入口逐项核实。具名本地编辑源必须说明覆盖地区、beat、检索方法和事实边界，不能用模糊来源名称代替。活动扫描必须写入 `data/events.json`：`venue` 是可地图化活动地点，`hosted` 关联既有地点的特别项目，`citywide` 只影响城市或当天语境；字段与引用按 `references/event-schema.md`。
4. 按体验角色补候选，而不是按类别凑数量：主题主锚点、代表性景点、当地生活、酒店基地、正式餐、地方经典、小吃、咖啡甜品、夜间体验、休息点、交通节点和天气/闭馆替代。城市有至少两个完整旅行日时，逐城至少评估 3 个代表性景点并写明采用或舍弃理由；在该城市停留段内保留的主锚点接到同方向当地生活角色：市场、居民广场、社区空间、街区咖啡、社区饭馆、传统商业或短半径夜间体验。
5. 每个准备进入资料池的地点都要回答：为什么符合这个模板（未选模板时为什么符合用户偏好）、为什么安排在这里、与附近地点如何衔接、需要预约或复核什么。按地点在路线中的角色分配 `contentTier`：主锚点和必去地点用 `deep`，正式路线中的支撑地点用 `standard`，候选池与留档地点用 `compact`。正式路线地点使用“具体价值陈述 → 类型化现场动作 → 可解析证据”三层合同：`whyWorthIt` 说明这个地方独有的路线价值，`detailSections` 告诉旅行者到场做什么，`sourceIds` 必须解析到结构化来源。不同类型地点不强制写同样的四段；市场、博物馆、餐厅、咖啡/酒吧、街区、酒店/交通使用与现场体验相匹配的 `detailSections`。当来源同时支持当地食材结构、居民使用方式和行程月份季节时，市场详情必须连起来写；库存未核实时用“留意/询问”而非断言。只有可靠且能帮助现场理解的历史才写故事，不为凑结构编造，也不使用“感受当地生活”“随便逛逛”“值得一去”等没有地点特异性的占位表达。
6. 对营业时间、票务、活动日期、交通时刻、价格、安全、天气、海况和入境规则等易变化信息，使用当前来源复核并记录检查日期。只有真实的可变事实、来源冲突或高影响事实未确认时显示“需要临近复核”，不增加常驻来源徽章。
7. 对落选的著名地点保留简短取舍理由，避免用户看见缺失却不知道为什么。

当需要把阶段一或阶段二的结构化判断交给 Agent 脚本时，使用同一份 JSON context：

```bash
node skill/scripts/recommend-taste-models.js --context <context.json>
node skill/scripts/build-source-query-matrix.js --context <context.json>
node skill/scripts/probe-source-access.js --context <sources.json>
```

三个命令也接受 `--stdin`；每次只能选择一种输入方式。Taste 推荐只在至少一个已知词命中模板时输出 recommendations；否则返回 `needs-clarification`、空 recommendations、未知词与输入词表。Query matrix 必须提供有效 `countryCode`、`destination` 与 `yearMonth`；缺失时返回 `needs-context` 和空 intents，错误类型则拒绝。输出前会清理多余 whitespace，且 `ready` / `needs-local-language-terms` 的任何 query 都不含占位符。第三个命令接收 `{ "sources": [...] }`：每个 source 必须有安全 `id` 和无内嵌凭据的 `http`/`https` `url`，可使用顶层 URL `fallback`，也可直接传入正式 pack 中带 `access.fallback` 字符串数组的 source。Probe 不自动访问 fallback；顶层 URL 只输出移除 query/fragment 的安全 URL，`access.fallback` 只输出 availability 与 option count，不回显任意文本。Probe 不输出 headers、正文或凭据；它是 access-only，不能证明地点存在、正在营业、适合路线或安全。

数量基线：地点池通常准备为正式路线预计使用量的 2-3 倍。每个完整旅行日约 12-18 个可地图化地点，其中只有 1-3 个主锚点；其余组成完整备选路线、吃饭休息选择、当地生活和扩展候选。抵达、离开和纯移动日按 6-10 个低强度候选计算。数量必须同时满足分类覆盖，不能搜索 18 个景点却没有餐厅、休息和当地生活；不同停留天数、主题加权和分层复核口径见 `references/source-verification.md`。

地点选择至少考虑：用户匹配、生活品味与主题相关性、在地独特性、路线顺路程度、时间和预算成本、事实可信度、预约与天气风险。不要把平台评分或榜单名次直接等同于“必去”，也不得把代表样本里的店名直接复制到新城市。

为控制上下文与 token，检索、聚类和路线比较阶段默认只加载地点 id、名称、`contentTier`、`whyWorthIt`、`plan` 与 `tip`；完整 `detailSections` 只在生成最终攻略/地图、用户展开某个地点或修改已选地点时加载。不能通过降低事实复核质量来节省 token。

进入下一阶段：每个行程段已经有核心地点、合理备选、吃住与交通支撑；高影响事实已经核实或明确标为“需要临近出发复核”；继续搜索得到的主要是重复结果，而不是新的路线价值。

阶段产物写入 `data/pois.json`、`data/events.json`、`data/sources.json`、`docs/sources.md`、`docs/hotels.md` 和 `docs/reservations.md`。地点字段按 `references/poi-schema.md`，活动字段按 `references/event-schema.md`，酒店解释按 `references/hotel-selection.md`。

### 阶段三：规划每日行程

目标是把地点候选变成可执行、少折返、留有余量的正式路线。

执行：

1. 先放入航班、火车、已预约、节庆、演出、闭馆日和固定餐厅等硬约束。`confirmed` 的固定活动场次是硬约束，`announced` 项目只是当天候选，`program-pending` 窗口只作复核事项，`historical-lead` 不得作为当前活动展示；`venue` 只在确认后以 `event:<id>` 排入路线，`hosted` 通过其既有地点安排，`citywide` 只改变当天语境或避让判断。
2. 先设计城市段和住宿基地，再设计每天；跨城移动日只安排抵达后顺路、低强度、可取消的活动。
3. 每天安排 1-3 个主锚点。已确认 `first-visit` 或到访史未知而暂定 `balanced-visitor` 的城市，在该城市停留段内保留代表性景点与当地生活的平衡；重型代表性景点每天最多 1 个，并把它与同方向当地生活角色相接。当地生活角色可以是市场、居民广场、社区空间、街区咖啡、社区饭馆、传统商业或短半径夜间体验。其他地点不强制必须同街区，但要顺着步行方向、交通轴线、时间窗口或驾驶顺序，避免为了普通地点折返和横穿城市。
4. 把酒店当作每天出发、午休、行李和晚间回程的路线锚点，不作为行程之外的附录。
5. 把吃饭和休息安排进真实时间线：正式餐控制预约，地方经典和小吃补足在地体验，咖啡和甜品承担休息，酒吧前安排轻餐，移动日保留保底餐。
6. 为天气、闭馆、排队、预约失败和体力下降准备同方向替代方案。
7. 对远距离地点说明它为什么值得、交通与时间成本、风险和近处替代；价值不足时降为留档。
8. 把一天拆成连续的时间线，午餐、咖啡休息、回酒店、取行李和晚餐前移动不能只藏在脑内。每两个相邻地点都要有交通方式和经过复核的移动说明。
9. 有 4 个以上正式停靠点时，使用真实路网或公共交通规划比较至少两种可行顺序；固定预约、开门时间和回酒店休息优先于纯粹最短路。存在有意折返时，向用户说明原因。

向用户说明每一天：今天在体验什么、为什么这样排序、1-3 个主锚点是什么、吃饭和休息在哪里、哪些是当天备选、出现变化时怎么替换。不能只返回时间表而不解释设计逻辑。

进入下一阶段：每天的硬约束、主锚点、顺序、交通、用餐和备选彼此不冲突；所有相邻路段完整；移动强度与用户体力相符；路线引用的地点和来源完整。不能只看地图上的直线距离判断顺路。

正式路线写入 `data/itinerary.json`，规划判断写入 `docs/planning-principles.md`。路线几何和地点引用按 `references/poi-schema.md`。

### 阶段四：制作动态地图

目标是把正式路线和更丰富的地点候选制作成可以实际使用的地图，而不是只做一张展示页面。

完整攻略统一使用公开母版的 **Europe direct-copy interaction v1**。它不是近似复刻，而是从已经验收的欧洲地图直接复制交互壳、布局和样式，再清除私人数据后形成的公开母版。用户没有特殊交互要求时，这就是唯一默认交互。

执行：

1. 完整攻略默认使用 `assets/guide-template-europe-public/`。先复制其中整套 `maps/` 目录到当前攻略，再替换旅行内容；不能从空白 HTML 或另一套 Core 重新实现相似界面。
2. 公开母版的 `maps/itinerary-map.html` 是单文件交互壳。派生地图优先只替换 `PUBLIC_TRIP_DATA`、页面标题/摘要、独立 storage key 和目的地平面设计变量；不得把私人母版的数据块、住宿、航班或用户文件路径复制进去。
   `PUBLIC_TRIP_DATA.trip.language` 必须写成用户明确指定的语言；用户未指定时跟随当前主要对话语言。中文地图同时补齐有通行译名地点的 `zh`，品牌可以保留原名并补中文类型。
3. 默认保留直接复制版的 DOM、状态、地图、列表与详情行为：真实地图、地点标记、全程总览、连续日期、当天有序列表、段间移动提示、动态顺路候选、统一地点详情、分类图层、搜索筛选、加入/移出、优先级、拖拽排序和刷新恢复。拖拽排序必须保留左侧 44px 专用手柄、160ms 长按、插入线、路线列表顶部/底部边缘自动滚动、取消不保存和上移/下移降级；卡片正文继续打开详情，不把整张卡片变成拖拽区。
4. 地点详情先显示 `whyWorthIt`（旧数据回退到 `note`），再按数据顺序渲染类型化 `detailSections`，最后显示如何安排、注意事项、当前行程归类，以及官网、预约、外部地图和体验线索。不同类型地点不强制显示相同栏目；没有类型化内容的旧数据继续使用 `note`、`plan`、`tip`。只有真实异常显示“需要临近复核”。地图标记、每日路线和地点速查必须打开同一个详情界面。
5. 只有经过路网计算或人工复核的路径才能显示为正式路线。完整攻略的非纯移动日应保存正式路线；只有地点顺序时可以显示编号和顺序引导线，顺序引导线只是顺序参考、不代表道路，并提供外部导航入口，不能把引导线称为路线，也不能用直线距离自动补成移动时间。
6. 完整攻略基于 `assets/guide-template-europe-public/` 时只运行 `node scripts/validate-europe-derived-map.js <itinerary-map.html>` 作为地图 HTML 合同校验，并检查主语言、主要地点译名和选点后的尺寸自适应聚焦，再做浏览器验收。校验失败时先恢复母版交互，不通过删功能或改验证器绕过。
7. 基础功能交互通过后再做视觉增强。生活品味模板只提供 3–5 个关键词、信息密度、语气、图片策略、marker、色彩、材质和文字 moodboard；与目的地线索共同形成本次视觉。配色、字体、标记、路线色、圆角、阴影和图层控件外观可以在单文件 `<style>` 的 design token 与组件外观中微调，但不能携带第二套 HTML，也不能改变直接复制版的布局层级、状态与交互。
   旅行叙事主题、taste model 与 UI theme 是三个独立层次：前两者决定体验和选点，UI theme 只决定地图呈现。需要复用完整组件语言时读取 `assets/themes/index.json`，选择与 `europe-map-direct-v1` 兼容的主题与目的地 preset；选择结果仍需写回当前攻略自己的 design tokens、设计语言和单文件 HTML，不能让地图运行时依赖 theme registry。
8. 轻量模板 `assets/guide-template/` 只用于用户明确要求的低保真原型、内部功能试验或三天以内且不需要完整修改闭环的简单地图；不能把它作为完整攻略交付后声称与欧洲版交互一致。
9. 把地图当前实际行为写入 `docs/online-logic/map.md`，不把尚未实现的想法写成事实。
10. 只有用户明确要求改变交互时，才建立独立的 **interaction fork**：先写差异规格、验证新状态语义和回退边界，再复制并改 Core。视觉方向、配色和装饰变化不构成 interaction fork。

完整地图的 Core 至少支持真实地图、全程总览、某一天和统一地点详情三级浏览，以及自然语言的优先级、路线归类和修改状态。详细合同见 `references/map-standards.md`、`references/core-interaction-contract.md` 和 `references/map-feature-contract.md`。

进入下一阶段：静态验证通过，并在真实浏览器中确认底图、地点、路线、日期切换、详情、搜索、修改、撤销、刷新恢复、移动端和错误信息均可用。

### 阶段五：让用户在地图中调整

目标是让用户表达偏好并理解修改影响，不要求用户阅读数据文件或重新描述全部旅行。

地图应让用户完成：

- 浏览全程、切换某一天并查看统一地点详情。
- 标记“必去、优先去、顺路可去、留档、待复核、已预约”。
- 把普通候选加入同城且未满的一天、移出当天或通过左侧专用手柄调整同日顺序；6–10 个地点时可以靠近列表边缘自动滚动。
- 撤销上一步，并在刷新后恢复选择。
- 看见改了几个地点、影响哪些日期、哪一天可能过满、折返或跨区。

普通优先级修改、同城未满日期的加入和同日排序可以直接保存。住宿、已预约、固定时间、当前必去、跨城市或超容量等高影响修改必须先用自然语言解释影响，再由用户确认。

地图中的修改代表用户选择，不代表正式路线已经自动合理。修改后弱化受影响的原路线并显示“需要重新安排”；在 Codex 完成复核前，不为新增地点绘制推测路线。

### 阶段六：根据反馈重新安排

目标是把地图中的用户选择转化成新的正式行程，并形成可反复使用的修改闭环。

执行：

1. “请 Codex 重新安排”汇总全部修改和受影响日期，生成可独立理解的自然语言请求，并提供明确的复制成功或失败反馈。
2. 请求包含旅行名称、地点名称、原安排、新安排、优先级变化和需要复核的问题；静态 HTML 不假装能直接写入当前 Codex 对话。
3. Codex 收到反馈后，重新检查营业时间、预约、交通、同日容量、酒店基地、吃饭和休息，而不是机械接受用户拖动后的顺序。
4. 向用户说明改了什么、为什么这样重排、哪些日期受到影响、是否产生新的取舍或待确认事项。
5. 更新 `pois.json`、`itinerary.json`、资料记录、预约清单、地图和线上逻辑文档，再运行完整验证。
6. 如果反馈暴露了新的兴趣或路线方向，回到阶段二补充地点；如果只是顺序和容量问题，回到阶段三重排。不要要求用户从第一阶段重新回答。

交付新版后继续保留修改状态和版本边界。最终地图中的正式路线必须与最新文档和数据一致，不能只改界面文案。

## 面向旅行者的语言

所有聊天回复、地图标题、日期与路线、地点说明、筛选、按钮、状态、提示、修改汇总和最终交付使用自然语言，并尽量跟随用户当前主要对话语言。用户明确指定输出语言时，以明确要求为准。有通行译名的国家、城市、区域和著名景点必须优先使用用户语言名称；首次出现补充原名，后续路线使用译名。完整规则见 `references/user-facing-language.md`。

默认替换：

- `POI` -> `地点`
- `candidate` -> `当天备选` 或 `顺路备选`
- `unassigned` -> `尚未安排行程`
- `draft / needs reroute` -> `需要重新安排`
- `resource drawer` -> `地点详情`
- `export change set` -> `请 Codex 重新安排`
- `localStorage` -> `地图已经记住你的选择`

不要向旅行者展示 `schema`、`renderer`、`themeProfile`、`token`、`hash`、`JSON` 等实现语言。开发文档和代码中可以使用。

重要判断分成：事实、推断、建议。每次修改反馈都回答用户改了什么、影响哪一天、是否可能过满或绕路、下一步会怎样处理。

## 输出目录

需要落地时默认生成：

```text
AGENTS.md
guides/<trip-slug>/
  README.md
  docs/
    design-language.md
    planning-principles.md
    hotels.md
    reservations.md
    sources.md
    online-logic/map.md
  data/
    design-tokens.json
    pois.json
    events.json
    itinerary.json
    sources.json
  maps/itinerary-map.html
```

模板选择：

- `assets/guide-template-europe-public/`：完整攻略的唯一默认公开母版（Europe direct-copy interaction v1）。必须复制整套地图目录，优先只替换 HTML 中的 `PUBLIC_TRIP_DATA`、旅行者文案、独立 storage key 与平面设计变量。
- `assets/guide-template/`：轻量模板，只用于用户明确要求的低保真原型或内部功能试验，不作为默认完整交付。
- `assets/samples/golden/`：只作为信息完整度标尺，不作为固定视觉模板。

新目的地可以有不同平面设计风格，但默认共享同一套 Core、旅行状态、浏览方式和修改语义。

## 按阶段读取参考

- 阶段一和三：`references/planning-workflow.md`
- 阶段一：`references/theme-library.md`、`references/theme-narrative.md`、`references/hybrid-taste-models.md`
- 阶段二：`references/source-verification.md`、`references/regional-source-packs.md`、`references/hotel-selection.md`
- 阶段二和三：`references/poi-schema.md`
- 阶段四和五：`references/map-standards.md`、`references/core-interaction-contract.md`、`references/map-feature-contract.md`
- 视觉深化：`references/design-language.md`
- 所有阶段：`references/user-facing-language.md`
- 没有旅行工作区规则时：`references/workspace-bootstrap.md`

按任务读取需要的参考，不要一次加载全部文件。

## REDSkill 发布

发布到只接受文本与代码格式的 REDSkill 平台时，使用专用构建脚本生成发布目录，不直接上传 Codex 本地 skill 原目录：

```bash
node scripts/build-redskill-release.js <release-directory> 0.1.0
node scripts/test-redskill-release.js <release-directory>
```

构建结果只保留 REDSkill 支持的扩展名，省略 Codex 专属 `agents/openai.yaml` 和 `.DS_Store`，并把 Leaflet CSS/JS 及轻量地图的本地 Core 依赖内联进各自 `itinerary-map.html`。发布目录中的地图必须可以作为单个 HTML 复制和打开；仍需联网加载 OpenStreetMap 底图与 Wikimedia Commons 图片。

## 验证和交付

先运行与当前产物相关的共享验证；共享的数据、设计与活动验证仍按相关范围适用：

```bash
node scripts/validate-trip-data.js --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json> --require-route-evidence --strict-routes
node scripts/validate-trip-events.js --events <events.json> --pois <pois.json> --itinerary <itinerary.json> --sources <sources.json>
node scripts/validate-design-tokens.js <design-tokens.json>
node scripts/test-core-map-route.js
node scripts/test-skill-contract.js
node scripts/test-europe-public-template.js
node scripts/test-redskill-package.js
node scripts/test-redskill-release.js <release-directory>
```

地图 HTML 验证按模板互斥路由；同一产物不要求、也不得为了通过文档清单而同时运行两个 template-specific validator：

- 完整攻略基于 `assets/guide-template-europe-public/` 或它的派生地图，只运行 Europe direct-copy validator：`node scripts/validate-europe-derived-map.js <itinerary-map.html>`。
- 轻量低保真或内部原型基于 `assets/guide-template/`，只运行 light-template validator：`node scripts/validate-map-html.js <itinerary-map.html>`。

静态验证不能替代浏览器验证。完成前实际检查页面加载、底图、地点、日期与分类筛选、路线、地点详情、修改、撤销、修改汇总、刷新恢复、桌面、手机和 console。

新建 0.1 攻略的最终数据验收必须运行带 `--require-route-evidence` 的命令；只运行不带该 flag 的旧命令仅表示 legacy 数据结构仍可读取，不代表正式路线已经获得内容或证据认证。

最终交付使用自然语言，说明旅行主线和取舍、酒店与吃饭逻辑、关键路线、资料来源、需要临近复核的事项、地图位置和实际验证结果。没有运行过的验证不得声称通过。
