# 公开母版地图行为（Europe direct-copy interaction v1）

## 母版边界

- 这是完整攻略唯一默认公开母版。它把已经验收的欧洲地图交互壳、布局和样式直接复制为单文件 HTML，不再另做一套近似 Core。
- 派生攻略复制整套 `maps/` 后，优先只替换 `PUBLIC_TRIP_DATA`、旅行者标题/摘要、独立 storage key 和平面设计变量。
- validator 检查直接复制版的关键 DOM、行为签名、数据边界、脚本语法和隐私模式；Leaflet vendor 保持本地可用。

## 浏览方式

- 全程总览同时显示 `europe-autumn-2026-sample` 的 18 天路线、379 个公开地点速查和地图分布。
- 进入某一天后，左侧依次显示日期、当天顺序和统一地点详情；地图保持在右侧。当天列表用行内 `＋/−` 加入或移出普通地点。
- 地图标记、当天列表和地点速查都打开同一个详情，不重复显示另一套长弹窗。
- 地点详情兼容三档内容深度：`deep` 用于主锚点并展示 2–4 个类型化详情段，`standard` 用于路线支撑点，`compact` 与未迁移旧数据继续展示简洁的 `note`、`plan`、`tip`。详情先显示 `whyWorthIt`（缺失时回退到 `note`），再按数据顺序通用渲染 `detailSections`；市场、博物馆、餐厅、酒吧、街区、酒店与交通不被强制套用同一组标题。
- 当天地点使用编号；地图类别标识固定为 `H / 50 / W / S / C / F / A / L / T / E` 并使用各自主题色。当天视图显示当天地点、同城动态候选和当前选中地点，回到总览后显示完整地点池。
- 日期栏切换不反复强制缩放，并保留用户地图视野。桌面继续并排保留当前地点详情；手机若正处于地点详情，切换日期后会返回所选日期的当天路线，让日期变化、路线与候选立即可见，当前地点选择仍保留在状态中。
- 从地图、当天列表或地点速查选中地点时，先完成详情布局和地图尺寸更新，再按更新后地图短边选择 `14 / 15 / 16` 的聚焦基准；保留合理的当前 zoom，并限制过度放大，不能在布局变化前固定写死 zoom。
- 右上角控制行程与移动、地点分类图层。开关保存到当前攻略状态；进入某一天自动恢复行程图层，打开地点自动恢复对应分类图层。
- 全程总览只显示城市 marker，不用城市中心坐标画跨城直线。
- 当天用编号与虚线连接访问顺序；段间距离和时间只显示数据中已经标注为规划估算的内容，不把虚线当作道路导航。

## 修改行程

- 优先级、加入/移出日期与同日顺序沿用欧洲地图原交互并立即保存。优先级变化统一刷新动态候选排序、地点列表和地图可见 marker，保证移动端 top-8 候选口径一致；桌面与手机都从卡片左侧 44px 专用手柄启动排序，卡片正文仍打开详情，右侧按钮仍负责移出或精确上移/下移；移出的地点重新参与同城动态候选排序。
- 恢复浏览器中已保存的行程后，先执行结构 sanitizer：assignment 必须是普通对象，`dayId` 必须仍存在，`order` 必须是有限整数；负数、缺失、字符串、分数和无穷值都会被删除。已知普通 POI 只接受正整数，只有已知酒店/住宿基底接受 `order: 0`；未知未来 POI 只保留合法日期上的正整数，不能以未知身份保留 0。被删除的已知 saved override 会自然回退到仍合法的默认 assignment。
- 结构 sanitizer 之后才移除已经不再合格的 event assignment，再按用户当前有效的日期归类与移除状态，把每一天的正数路线序号归一化为连续的 `1..N`。sanitizer、event cleanup 与 normalization 合并成一次初始化写入；不改动 `removed`、优先级、dirty days、修改记录、撤销历史或默认行程，没有变化时不重复写入浏览器存储。
- 排序手柄按住 160ms 后才进入拖动状态。拖动卡片浮起，目标位置出现插入线；手指进入列表顶部或底部 48px 时只自动滚动当天路线列表，速度随靠近边缘而增加并限制在每帧 14px。`pointercancel`、页面级 `Escape` 或未改变位置都会取消本次排序，不写入修改。
- 松手改变顺序后调用原有 `reorderDayPois`，因此沿用已有的修改记录、撤销快照、浏览器保存、重新编号、路线弱化和“请 Codex 重新安排”闭环。受影响日期不再把旧相邻交通或规划估算描述成新顺序的有效交通，统一显示“顺序或安排已调整，交通待复核”。
- 每次上述修改会在同一份公开 itinerary plan 状态中保存包含 `type / before / after / affectedDays` 的结构化修改记录和最多 20 步撤销快照；移动端底部工具栏可撤销上一步、查看原值、新值与受影响日期。撤销后若没有剩余修改，汇总自动关闭。
- “请 Codex 重新安排”使用结构化记录生成一段包含旅行名、各项原值/新值、受影响日期和复核要求的自然语言请求；静态页面不会假装已经把请求发送给 Codex。Clipboard API 与兼容复制都失败时，完整请求保留在汇总内的只读 textarea，旅行者可以手动选择复制；后续新增修改或撤销会立即清空并隐藏旧请求，避免继续复制已经失效的文本。
- 任何重新安排都只改变规划状态；正式出发前仍需复核距离、营业、预约与交通。

## 同期活动

- `data/events.json` 是内部事实源并保留 `sourceIds` 溯源；builder 写入旅行者可见的 `PUBLIC_TRIP_DATA.events` 和 `window.TRIP_DATA.events` 时逐条移除 `sourceIds`，并在写入前把每个 `officialUrl` 解析为规范化 URL。URL 只允许 `http:` / `https:`、非空 hostname 且不得携带 username/password；任一活动不合格时两份公开输出都不写。写入内联 `<script>` 时使用 script-context serializer，把 `<`、`>`、`&`、U+2028 和 U+2029 编码为 Unicode escape，活动或用户文案中的 `</script>` 不能提前结束脚本。
- 只有 `scope: venue` 且能从 event 坐标或 `venuePoiId` 对应地点取得有效坐标的记录会在浏览器运行时生成 `event:<id>` synthetic POI；它使用 `E / 同期活动` marker 和独立图层。`hosted` 与 `citywide` 不生成额外 marker，避免把同一个活动重复画成多个地点。
- 浏览器以同一个 traveler visibility gate 消费活动：id 必须符合 `/^[A-Za-z0-9][A-Za-z0-9._-]*$/`，且 status 不能是 `historical-lead`。不符合 gate 的 venue 不生成 synthetic POI，hosted/citywide 也不进入任何 HTML renderer，避免历史线索伪装成当前活动或把未经约束的 id 带入 marker 的 data attribute。转换、状态清理、日期匹配和 event HTML 由同一个 bounded pure runtime block 提供，Node VM contract tests 直接执行这份 shipped logic。
- `hosted` 活动跟随 `hostPoiId`，在该地点原有类型化详情段之后显示日期、自然语言状态、安排建议和注意事项；只有 runtime 再次通过同一公开 URL gate 时才显示官网 anchor，不安全或带凭据的 URL 不渲染链接。页面不显示 schema enum 或 `sourceIds`。
- `citywide` 活动先取合法 ISO `day.date`；没有 ISO 时才按旅行年份解析当天 `MM/DD` 或 `MM-DD`，再与起止日期及城市（含可选 `affectedCities`）匹配，并显示在当天路线滚动列表顶部。它用于解释人流、交通、纪念或节庆语境，不进入地点详情，也不成为默认安排。
- 桌面日期说明、手机 app bar 与当天详情摘要统一把正式安排拆成“路线站点 / 住宿基底 / 体验与吃喝”三个计数。匹配当天与城市的 `citywide` 记录另显示“同期活动提示 N 条，不计入路线编号”；没有可见提示时不显示这句话，活动提示不会增加路线总数、体验数或站点序号。
- 普通 POI 始终可以加入日期；event synthetic POI 必须同时满足 `confirmed + venue + 当天落在活动窗口内 + day.city 命中 event.city/affectedCities`。详情日期下拉只列合格日期，速查加入按钮、当天候选、最终 `assignPoiToDay` mutation boundary 都调用同一 day-specific helper；其他状态显示“等待具体节目”或“等待场次确认”，已确认但日期/城市不符时显示“不在活动日期或城市”。
- 默认 assignment 与浏览器恢复 assignment 都先经过同一 `sanitizeEventAssignments`：活动被删除、status/scope 退回、活动日期或城市变化、目标日期消失或不再落在窗口内时，旧 `event:*` assignment 都会移除；未知的普通非 event POI id 仍保留，兼容旧地图状态。
- 当前公开 fixture 以 Art Basel Paris 官方公众开放日作为 confirmed venue 示例；Castanyada 和诸圣节只有官方传统日期、没有足够具体的 2026 街区节目，因此保持 `program-pending`，分别进入 host detail 与 Barcelona 当天城市提示。

## 状态恢复

- 保存当前日期、地点详情、筛选、图层开关、优先级、日期归类和顺序。
- storage key 独立使用 `europe-autumn-2026-sample-*`，不读取私人欧洲攻略或其他攻略状态。
- 地址中的 `lat`、`lng`、`z`、`poi` 和 `layers` 用于恢复地图视野、地点与图层；当前日期由独立浏览器状态恢复。

## 响应式布局

- 桌面端为左侧旅行工作台、右侧地图。
- 手机端地图使用明确的动态视口高度；跨越 820px breakpoint 或横竖屏切换后，在新布局完成的 animation frame 再让 Leaflet 重新量尺寸，避免不刷新页面时地图高度归零或沿用旧瓦片尺寸。
- `max-width: 820px` 使用独立的 map-first mobile shell；桌面端原有三栏详情布局和默认展开的 Leaflet 图层控制不变。
- 手机 app bar 显示返回/总览、当前旅行或 `MM/DD · 城市`、地点数、搜索和图层动作。Leaflet 图层控制在手机端默认收起，由 app bar 打开为 popover；跨过 820 px 响应式边界时恢复对应的收起/展开状态。
- 手机 bottom sheet 有 compact 和 expanded 两档；visible handle 可点击切换。compact 高度为约 43% viewport，地图在 app bar 下方保留更大的主要表面；expanded 仍填满 app bar 以下区域。
- 手机端当前日期与当天路线 guide 固定使用母版的 restrained teal；桌面端继续保留日期颜色和灰色路线 guide。
- 手机浏览状态为 `overview -> day -> detail`，并可由 day 或搜索进入 `candidates`。详情返回到进入前的 day/candidates 时会关闭持久化的 detail 恢复标记，保留当前 session 的日期、marker selection、地图视野、图层和已保存修改；刷新不会重新强制进入已关闭详情。
- overview 显示“全程安排”的城市/日期分组，不加载照片；day 使用横向连续日期 rail 和纵向滚动的当天路线、交通提示、排序/移出控制。active day 只在日期实际变化时自动滚入 rail 中部，同日 rerender 不重置旅行者的手动横向滚动。移动/移出 controls 在行内横向排列并保留 44 px touch targets，不越过当前 route row。
- detail 在同一 sheet 显示一个 16:9 主图、缩略图、说明、优先级/日期和外部入口；candidates 使用搜索与横向筛选行，并保留行内加入和优先级控制。day/candidates 默认复用同一套邻近排序，只显示最多 8 个非住宿顺路备选，而不是整座城市的未安排地点。
- compact detail 的地点标题、日期归类和优先级跟随正文一起滚动，不使用 sticky header；滚过这些控制后，照片、为什么值得去、怎么安排和注意事项可以使用完整的正文 viewport，不会被顶部控制区持续遮住。
- 手机选中地点后会在地图尺寸更新后，用 app bar 底部与当前 sheet 顶部计算真实可见地图区域，再把 marker 平移到该区域中部；当天首次聚焦继续使用 bottom-sheet padding。

## 图片

- 详情使用地点名称或 `imageQuery` 请求 Wikimedia Commons 图片，只展示 JPEG、PNG 和 WebP。
- 图片请求失败时显示 Google 图片搜索入口，地图、详情和修改功能继续可用。
- 旅行事实仍以官网和来源文件为准，图片只用于帮助识别地点。

## 语言与地点名称

- `PUBLIC_TRIP_DATA.trip.language` 是地图主语言的事实来源，并同步为 HTML 页面语言。派生攻略必须把它设置为用户明确指定的语言；用户未指定时跟随当前主要对话语言。
- 中文界面中，景点、艺术和本地生活地点的通行中文名作为主标题，正式原名作为详情副标题；品牌名保留原名并可补中文类型。
- `data/pois.json` 的 `name` 保留正式原名，`zh` 保存中文显示名。生成中文地图时必须补齐主要用户可见地点的 `zh`，不能依赖来源语言 fallback 充当最终界面。

## 公开内容来源

- 内容层来自工作区明确指定的公开样例数据，不读取或复制任何私人行程目录。
- 公开样例覆盖巴黎、尼斯、巴塞罗那和塞维利亚，住宿仅到片区级，交通不包含个人班次或订单。
- Art Basel Paris、Salon du Chocolat、Castanyada 和诸圣节等易变化事实仍按 sources 的复核日期处理；尚未公布的节目、票务和开放时间不能写成已确认安排。
- POI 的内部事实层可以在 `data/pois.json` 保存 `sourceIds`，并引用 `data/sources.json`。builder 会在发布边界解析引用，只向 `PUBLIC_TRIP_DATA` 与 `window.TRIP_DATA` 输出 `{ title, url, type, role, language, supports, checkedAt, status }` 组成的 `evidenceSources`；旅行者文件不保留原始 `sourceIds`。
- source id 必须唯一；POI 引用不存在的 source 会让 build 直接失败。所有 source URL 与 event `officialUrl` 共用同一公开边界：只允许 `http:` / `https:`、非空 hostname、空 username/password，并以 `new URL(...).href` 规范化后才序列化。浏览器 evidence/event renderer 会再次丢弃不安全 URL；标题、标签和复核日期统一按动态文本转义，外链固定使用 `target="_blank" rel="noopener noreferrer"`。
- Europe builder 先完成 source registry、events、traveler POIs、trip data、asset 字符串、HTML 中唯一 declaration/alias boundary 计数与完整 `nextHtml`，再开始第一次真实写入。缺失、损坏或重复的 `PUBLIC_TRIP_DATA` boundary 以及可预见数据错误都会让 asset 与 HTML 保持 byte-identical。
- 地点详情在“注意事项”后以紧凑的“资料依据”折叠区显示证据数量、来源角色、标题与复核日期。没有 `evidenceSources` 时才回退到旧 `source` 文本；两者都没有时不显示来源区。
- evidence 的语言标签只说明原资料使用的语言，方便旅行者判断阅读门槛；它不是来源质量、可信度或推荐强度评分。质量仍需结合来源类型、支持的事实范围、状态与复核日期判断。
