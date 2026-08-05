# 生活品味与地区来源线上逻辑

## 产品验收边界

0.1.0 是尚未发布的 **developer-preview contract slice**，不等于 **PRD V1 public acceptance**。它只描述下方已有测试与 runtime 支撑的子集。Public V1 仍需 8 个海外 Regional Source Pack、每个 taste model 至少 3 个 unseen cities 的评估，以及更强的 representative evidence；三项未全部满足前，任何运行或发布说明都不得宣称 public V1 ready。

## 当前已实现（0.1.0）

- 阶段一可根据目的地、玩法、节奏、同行人与兴趣推荐最多 3 个生活品味模板；用户可单选、不选或选择一主一辅。
- Agent 可运行 `node skill/scripts/recommend-taste-models.js --context <context.json>` 或把同一 JSON 传给 `--stdin`。至少一个已知词命中时，结果包含推荐、inputVocabulary 与 unknownTerms；没有 known match 或没有有效偏好时返回 `mode: needs-clarification`、空 recommendations 和 explanation，不会按 registry 顺序推荐第一项。
- `node skill/scripts/build-source-query-matrix.js --context <context.json>` 要求有效 `countryCode`、`destination` 与 `yearMonth`。缺失时返回 `status: needs-context`、`missingContextFields` 与空 intents，错误类型或 country code 格式则抛错；`tasteTerms` 可选且默认为空。`localLanguageTags` 只接受合法字符串 tag；`localLanguageTerms` 及每个 tag 的词表必须是 plain object，token 和 value 必须合法，value 必须是不含占位符的非空字符串。拒绝输入时只输出固定 schema 错误，不回显 fragment 或 secret。所有输出 query 在 token 替换后再统一压缩 whitespace，`ready` 与 `needs-local-language-terms` 不会输出 `{...}` 或中文伪占位符。
- 阶段一记录 visitor mode：`first-visit`、`return-visit`、`landmark-light`、`local-only` 或 `balanced-visitor`；第一次使用 Skill、第一次咨询或第一次规划不等于到访史，未知时记录“到访史未知”并只暂定 `balanced-visitor`。每座两天以上城市会至少评估 3 个代表性景点并写明采用或舍弃理由；该城市停留段内的保留主锚点与同方向当地生活角色（市场、居民广场、社区空间、街区咖啡、社区饭馆、传统商业或短半径夜间体验）连接，除非有记录的 mode、预约或绕路例外。
- 一主一辅时，主模板拥有选点与节奏；辅模板只能补一个领域或视觉倾向。
- 0.1.0 必须保留“城市手艺与缓慢街区”和“地方风味与夜间半径”两个官方模板，但 registry 可追加 `curator-owned` community 模板；贡献者使用独立 owner、license 与 semantic version，不需要修改 Core validator。
- 城市手艺模板关联 Tokyo golden sample；地方风味模板关联 Barcelona golden sample。Barcelona 的 2 个 market、1 个 food、2 个 bar 与 local-food/market/nightlife 行程角色只构成最低代表证据，不声明完整 food-first 覆盖。
- 每个模板使用 JSON + Markdown，并关联完整 docs + data 代表行程；样本标为 owner 确认的代表性规划或已完成回顾，写明代表理由、授权和脱敏，不冒充亲历。两个 `official-playstyle` 可以继续引用项目共享 golden sample。
- `curator-owned` 的每个代表行程都必须位于自己的 model directory 内，推荐 `examples/<trip-id>/`，不得引用共享 golden、其他 model 或目录外样本。example 会随 model directory 一起递归执行 JSON/Markdown 扩展名、隐私、symlink 和可执行文件扫描；非法 owner、授权/隐私声明、受禁评分字段或外部样本引用都会被 validator 拒绝。
- 模板只提供轻量视觉偏好，不含地图 HTML。Europe direct-copy interaction v1 和既有地图状态合同未改变。
- 阶段二按 Global Base 与目的地地区选择来源包。Global、中国大陆、日本、法语区（法国与比利时）是 0.1.0 required subset；registry 可追加满足同一 JSON 合同的新地区包，首发包仍有固定回归。
- 每个来源包提供 10 类中文、英文和当地语言查询意图；来源记录包含 A/B/C 可访问性合同、检索方法、依赖、agentAccess、fallback、事实边界、复核日期与限制。
- Global Base 的当地语言模板以 `{local:<token>}` 解析为 `{ languageTag, query }` 变体。Lexicon 用 `countryCodes` 限定可用国家，用 `defaultCountryCodes` 定义每国唯一默认语言：Spain 默认 `es`，显式 `ca` 追加在其后；Brazil 显式 `es` 不复用 Spain 内置词。调用方仍可通过 `localLanguageTerms` 提供自己的任意 language tag 词条。词条不完整的变体不会输出，并在 `missingLocalTerms` 中报告；地区包自己的无 token 模板继续使用其首个当地语言 tag。
- `probe-source-access.js` 从 `--context <file>` 或 `--stdin` 读取 `{ sources, timeoutMs?, concurrency? }`，先校验全部 `http`/`https` URL（拒绝内嵌用户名/密码），保留原 URL 仅供内部请求、单独安全化输出 URL（移除 query/fragment），再以最多 4 并发执行 HEAD/manual redirect；仅 405/501 以 `Range: bytes=0-1023` 的 GET 降级并取消、不读取 body。输出为 `{ checkedAt, results }`；401/407 与其他非 404/429 的 4xx 是 `access-blocked`，只有 5xx 是 `server-error`。顶层 URL `fallback` 保持兼容并仅输出安全 URL；正式 `source.access.fallback` 字符串数组只输出 status、availability 和 optionCount，不回显原文。两种 fallback 都不自动访问；主访问 `reachable` 标为 `available`，其他状态标为 `fallback-required`。不会输出 headers、body、cookie、authorization 或 credentials。
- Probe 的状态只表示当时的有限网络访问结果：`reachable`、`redirected`、`rate-limited`、`access-blocked`、`server-error`、`not-found` 或 `network-error`。它不能证明 POI 或商家存在、营业、可订、符合行程或安全，且不能取代各来源的事实复核。
- 中国大陆可运行 check-amap-cli.js 探测可选增强；两个凭据变量必须是 trim 后非空字符串。探测不输出密钥、不执行路线，缺变量、空字符串、全空白、CLI 缺失时均返回结构化降级。
- 地点说明使用“为什么符合这个模板”和“为什么安排在这里”；只在真实异常时显示“需要临近复核”，不增加常驻来源 badge。

## 保持不变

- 六阶段 Core、Europe direct-copy interaction v1、地图日期/详情/修改/撤销/排序/重新安排和刷新恢复合同。
- 安全、法律、当前事实、预约、用户硬约束和真实路网始终高于模板。
- REDSkill 继续排除 Codex metadata，并只发布支持的文本与代码文件。

## 后续而非当前能力

- 更多经过资料维护的海外地区包、城市差异包，以及社区审核与发布流程。
- 在样本以外城市进行跨地区 blind evaluation。
- 社区在线目录、订阅、远程训练或自动学习。

这些内容不能在当前运行或发布说明中写成已完成。
