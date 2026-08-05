# Regional Source Pack 运行规则

Regional Source Pack 描述地区信息生态和检索方法。一次任务只加载 Global Base、一个匹配的地区包和未来可能存在的必要城市差异，不把全球目录整体塞入上下文。

0.1.0 当前提供：

- Global Base
- 中国大陆
- 日本
- 法语区：法国与比利时

这四个包是首发 required subset，不是 registry 的封闭全集。贡献者可以添加采用同一 10 类意图与来源合同的新 JSON pack，使用自己的 semantic version 与 countryCodes；通用 validator 无需为每个新地区改代码。首发四包继续由固定回归测试锁定。其他尚无有效 pack 的地区使用 Global Base、目的地官方入口与三语动态搜索；不能创建空壳来源包冒充已覆盖。

## Global Base 当地语言词库

Global Base 的当地语言 query 使用 `{local:<token>}`，由 `assets/source-packs/local-language-lexicons/` 内置的轻量词库解析。它们只提供稳定检索词，不包含来源、访问性或地区信息生态，因此不是 Regional Source Pack，也不表示一个国家已经有地区包覆盖。

调用 `buildQueryMatrix` 时，runtime 先按 `countryCode` 选择 lexicon 中的默认语言，再把显式 `localLanguageTags` 按顺序追加并去重。Spain 默认是 `es`；显式请求 `ca` 时结果为 `es`、`ca`。内置 lexicon 只在其 `countryCodes` 内生效，因此 Brazil 显式请求 `es` 也不会复用 Spain 词条；调用方仍可用 `localLanguageTerms` 提供自己的 `es` 词条。每个 intent 只输出词条完整的 `{ languageTag, query }` 变体；缺词时省略该变体，并返回 `status: needs-local-language-terms` 与按语言、intent、token 列出的 `missingLocalTerms`。完整时状态为 `ready`。已有地区包不依赖词库：其当地语言模板仍按该包的首个当地语言 tag 输出。

`build-source-query-matrix.js` 是面向 Agent 的 JSON CLI：以 `--context <file>` 或 `--stdin` 读取一次 JSON，并原样输出 runtime 的 query matrix。`countryCode`、`destination` 和 `yearMonth` 是必需 context；缺失时返回 `status: needs-context`、`missingContextFields` 和空 intents，错误类型或 country code 格式则拒绝。`tasteTerms` 可选且默认为空；输出 query 会压缩多余 whitespace。调用方必须检查 `status`；`needs-local-language-terms` 时先补全 `localLanguageTerms`。`ready` 和 `needs-local-language-terms` 输出的所有 query 都不会包含 `{...}`、`[目的地]`、`[旅行月份 年份]` 或 `[本次偏好词]`。

## 可访问性

- A：可重复检索。当前环境可以通过公开网页或已配置工具稳定查询，可进入默认漏斗。
- B：条件可检索。可能依赖登录、验证码、地区、已配置 CLI 或页面状态；每次先探测，失败就降级。
- C：仅人工或共享链接。只在用户主动提供内容或授权浏览时使用，不进入无人默认流程。

等级只描述可访问性，不评价内容质量。每条来源仍必须记录 search method、登录或工具依赖、agentAccess、fallback、fact boundary、lastVerified 和 limitations。

对已明确选择的 URL，可运行 `probe-source-access.js` 取得有界的 access-only 信号：它只检查 `http`/`https`、最多 4 并发、HEAD 不跟随 redirect，405/501 才做小范围 GET；请求使用原始 URL，输出 URL 才移除 query/fragment，并附 `httpStatus`（网络失败为 `null`），绝不回显 header、正文或凭据。顶层 URL `fallback` 保持兼容，仅输出安全化 URL；正式 pack 的 `source.access.fallback` 字符串数组也可直接识别，但只输出 `{ status, available: true, optionCount }`，不回显任意文本或 secret。两种 fallback 都不会被自动访问：主访问 `reachable` 时标为 `available`，其他状态标为 `fallback-required`。401 与 407 归为 `access-blocked`；只有 5xx 归为 `server-error`。任何 probe 状态都不能代替来源的 fact boundary，更不能证明地点存在、营业、可订或安全。

## 具名本地编辑源

不得使用“当地媒体”或 “local media” 作为来源记录。每个本地编辑源必须有名称、URL、覆盖地区、beat、search method、可用于什么和不能证明什么，并选择一个 subtype：

- city-life-culture
- food-drink
- events-listing
- local-news
- industry-specialist

本地编辑源用于发现与语境，不单独证明实时营业、票务、法规、安全、交通或活动确定发生。

## 十类查询意图

每个正式包按相同顺序维护日期绑定活动、地方饮食结构、时令物产、市场与传统商业、社区生活与第三空间、艺术音乐与夜生活、手艺产业与迁移史、家庭低体力雨天与无障碍、当前异常与风险、模板专属发现。

每类都必须有中文、英文、目的地当地语言词族和可组合 query。先确认目的地当地正式名称，再按目的地、旅行月份和 taste brief 生成查询。

## 搜索漏斗

1. 建立官方事实骨架。
2. 用地区词族寻找地方菜、物产、市场与社区生活。
3. 用 taste brief 发现符合本次玩法的候选。
4. 先探测来源访问性，再使用可访问的编辑或社区线索。
5. 对短名单回到官网、经营方、主办方、票务和交通方核实。
6. 用真实地图或已配置工具检查移动关系。
7. 排除互相转载造成的假一致。
8. 正式与替代路线成立且新结果重复时停止。

## 中国大陆地图增强

运行 check-amap-cli.js 只探测命令是否存在，并确认两个凭据变量是 trim 后非空的字符串；不输出值，也不执行路线。空字符串或全空白字符串视为缺少凭据。只有 CLI 与非空环境配置都存在时才表示路线能力可调用；它仍不代表某条路线已经核实。

未安装、缺少环境配置或调用失败时，降级到高德公开网页或 URI 与其他公开地图，并明确“未完成 amap-gui 路网复核”。不得用坐标直线、估算速度或虚构输出替代 CLI 路线。
