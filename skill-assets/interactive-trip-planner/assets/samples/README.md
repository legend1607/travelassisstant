# Samples

这些 sample 是质量标尺和 feature inventory，不是视觉模板。不要照抄配色、排版或文案。每次做新目的地时，应根据目的地的空间、材料、导视、餐饮、自然条件和旅行主题重新选择视觉方向。

## 可用样例

- `urban-art-sample.json`：城市艺术 / 建筑线。关注博物馆、建筑、街区步行簇和视觉资源。
- `food-nightlife-sample.json`：吃喝夜生活线。关注餐厅角色、bar hopping、晚间安全半径和轻餐关系。
- `coastal-nature-sample.json`：海岛 / 自然 / 潜水线。关注海况、船程、潜点、禁飞缓冲、天气风险和恢复型节奏。

## Golden samples

`golden/` 里是打磨完整旅行地图用的高质量样本，不是轻量字段示例：

- `golden/barcelona-modernisme-night-atlas`：艺术建筑、预约景点、市场和夜生活。
- `golden/tokyo-rail-neon-craft`：高密度大城市、轨道交通和分区漫游。
这些目录当前只保留内容、字段和设计说明作为参考。旧地图实现已经移除，不能作为新攻略模板；新的基础地图统一从 `assets/guide-template/` 生成。

## 使用方式

1. 先读 sample 的字段完整度和交互需求。
2. 抽取适合当前目的地的 POI 字段、itinerary 结构和 popup 信息密度。
3. 重新做目的地 design direction，不照抄 sample 视觉。
4. 用 `validate-trip-data.js` 和 `validate-map-html.js` 做检查。
