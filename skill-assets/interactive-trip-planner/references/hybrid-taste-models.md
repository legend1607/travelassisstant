# Hybrid Taste Model 运行规则

生活品味模板用于迁移选点理由、组合方式、一天的节奏和轻量视觉倾向，不是另一套地图，也不是独立训练的模型权重。

## 优先级

安全与法律优先；用户硬约束、当前事实和预约都高于模板。目的地现实高于样本表面；不得直接复制代表样本中的店名、类别比例、路线或视觉外观到新城市。

## 何时推荐

阶段一已经理解目的地、玩法、节奏、同行人与兴趣后，只有模板会显著改变选点或节奏时才推荐 1–3 个：

- 城市手艺与缓慢街区：强化建筑、手艺、市场、街区连续性和留白。
- 地方风味与夜间半径：强化地方饮食结构、市场、晚餐、夜间短半径和安全回程。

每个选项只说明会强化什么、会降低什么。用户可以单选、明确不使用现成模板，或做一主一辅的混合；不要把模板选择变成新的长问卷。

## 一主一辅

- 主模板负责选点和节奏。
- 辅模板只能补一个明确领域或一个视觉倾向。
- 不提供无限比例调参，不允许两套模板同时控制路线骨架。
- 用户本次选择只覆盖本次旅行，不自动改写公开模板。

Core 脚本 taste-model-runtime.js 可以给结构化上下文生成 1–3 个候选，也可以校验单选与混合边界。`recommend-taste-models.js` 是面向 Agent 的 JSON CLI：以 `--context <file>` 或 `--stdin` 读取一次 JSON，输出推荐、输入词表和按字段归类的未知输入词；未知词不会参与排序。如果没有任何 known match，包括只提供未知词或没有有效偏好，runtime 返回 `mode: needs-clarification`、空 recommendations、explanation、unknownTerms 与 inputVocabulary，不得用 registry 第一项兜底。Agent 仍需用自然语言解释推荐或补问，不向旅行者展示内部结构。

## 代表行程

0.1.0 必须包含两个官方模板，但 registry 不是只允许两个模板的封闭名单。官方模板是 required subset；贡献者可以追加 `curator-owned` 模板，使用独立 owner、license 与 semantic version，并以 `community` 状态加入 registry。通用 validator 不要求社区模板伪装成 official，也不把版本锁到 0.1.0。

两个首发官方模板分别关联一个现有 golden sample：城市手艺模板关联 Tokyo，地方风味模板关联 Barcelona。Barcelona 现有数据只有 2 个 market、1 个 food 与 2 个 bar，因此它只作为市场、地方小吃和夜间短半径组合的最低代表证据，不证明完整 food-first 店型与餐次。每个样本 brief 明确：

- 它是 owner 确认的代表性规划，不声明实际执行经历。
- 为什么能代表模板。
- 已授权公开复用并完成脱敏。
- 复用现有 docs + data，不复制地图 HTML。

模型目录及其子目录只允许 JSON 与 Markdown，不允许可执行脚本、HTML、symlink，也不能出现 `coverage`、`confidence`、`maturity` 字段。每个模板都必须关联完整 docs + data 代表行程，声明代表理由、公开复用授权和隐私复核。

`official-playstyle` 可以引用项目维护的共享 golden sample。`curator-owned` 必须把自己的完整代表行程放在该 model directory 内，推荐路径为 `examples/<trip-id>/`；不能引用 `../../samples/golden/`、其他 model 或 model directory 外的任何样本。curator example 的 docs + data 与 model directory 一起递归执行扩展名、可执行文件、symlink、受禁字段和隐私扫描。非法 owner、缺失授权/脱敏、外部样本引用或递归扫描失败时拒绝贡献。贡献校验、隐私扫描和运行时脚本全部位于 Core scripts。

## 视觉边界

每个模板只保存 3–5 个关键词、信息密度、语气、图片策略、marker、色彩、材质和文字 moodboard。最终视觉仍由模板倾向与目的地线索共同形成 design-language.md 与 design-tokens.json；Europe direct-copy interaction v1 的日期、路线、详情、修改、撤销、拖拽与重新安排语义不变。

## 地点解释

进入正式路线的地点优先写两句话：

1. 为什么符合这个模板。
2. 为什么安排在这里。

只有真实的可变事实、来源冲突或无法完成的高影响核实时显示“需要临近复核”。不增加常驻来源徽章。
