# Golden Samples

Golden samples 只用于内容完整度和视觉探索，不定义 Core 交互。Core 交互以 `assets/guide-template/` 和 `references/core-interaction-contract.md` 为准。

它们不是固定视觉模板，也不提供可直接复用的地图实现：

- `barcelona-modernisme-night-atlas`：艺术建筑 + 市场 + 夜生活，测试预约景点、白天/夜晚双路线和 bar 半径。
- `tokyo-rail-neon-craft`：高密度大城市 + 轨道交通 + 分区漫游，测试多街区信息密度和交通轴线。
## 使用原则

1. 先看 `docs/sample-brief.md`，理解该样本测试什么旅行类型和地图能力。
2. 再看 `docs/design-language.md` 和 `data/design-tokens.json`，理解目的地气质和信息重点。
3. 用 `data/pois.json` 和 `data/itinerary.json` 作为字段完整度和地点说明密度的 benchmark。
4. 旧地图实现已经移除。新地图统一从 `assets/guide-template/` 开始，不复用 sample 的页面结构或交互代码。
5. 这些样本是 benchmark draft，不等于实时可出行攻略；正式用于用户旅行前，必须重新复核营业时间、票务、预约、交通和同期活动。
