# Design Language: Barcelona Modernisme Night Atlas

## 视觉关键词

Modernisme、地中海光线、陶土、铁艺曲线、夜色酒吧、克制旅行手册。

## 元素来源

- Gaudi 建筑曲线和 trencadis 马赛克，只抽象为 marker 边缘和 route accent。
- Eixample 街区网格，用于路线和日期卡的秩序感。
- Barcelona 当代 cocktail bar 的深色面和小面积高亮，用于夜间 POI。
- 市场和 tapas 场景，用于资源抽屉和餐饮 badge。

## 字号系统

- title：28-32px，serif 或高对比 display，用于地图标题。
- section：14-16px，uppercase 或小标题，用于筛选组。
- card title：15-17px，粗体，用于 POI 和日期卡。
- body：13-14px，行高 1.45。
- meta：11-12px，字距略开，用于区域、日期和来源。
- button：12-13px，语义清楚，短标签。
- popup：13px，信息密度高但不堆大字。

## 色彩角色

背景使用 warm paper，不用纯白。路线主色为深酒红，建筑类 marker 用陶土和蓝绿，夜生活用墨蓝。warning 使用暖琥珀，不使用刺眼红。

## 组件语言

- 卡片圆角小，边框像展签，不做大块浮动卡。
- marker 可以有马赛克切角或细描边，但必须可读。
- route line 使用实线/点线区分已安排和候选夜线。
- popup 是地图上的轻量定位卡，只保留短理由、状态和操作。
- 资源抽屉承载三段完整解释：为什么去、怎么安排、注意点；可以使用深色标题条，但内容区保持浅色可读。

## 地图元素规则

- 已安排点：编号圆 marker。
- 候选点：小尺寸图标 marker。
- 夜生活：深色 marker，带短半径提示。
- 必去但未安排：高亮描边并显示“待重排”。
- 市场/吃喝：暖色 badge，不能压过路线编号。

## 禁止事项

- 不使用满屏马赛克纹理。
- 不把地图变成艺术海报。
- 不用高饱和红黄铺满界面。
- 不把所有 Gaudi 点都做成同等优先级。
