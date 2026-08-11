# 大众点评调研工作流 (OpenCLI)

## 前提

大众点评用于餐厅硬信号：口味、排队、踩雷、价格、区域和是否值得。小红书只补氛围、近期体验、拍照和软性提醒。

OpenCLI 已提供大众点评 browser adapter，目标站点是 `www.dianping.com`。

## 环境要求

- Chrome 已登录 `dianping.com`
- 已安装 OpenCLI Browser Bridge 扩展
- 优先使用 PC 站；移动站对非移动 UA 限制较多

## 搜索餐厅

围绕当天主区域搜索，不搜泛词。

```bash
opencli dianping search "银座 午餐" --city 东京 --limit 5 -f json
opencli dianping search "有乐町 晚餐" --city 东京 --limit 5 -f json
opencli dianping search "新宿 居酒屋" --city 东京 --limit 5 -f json
```

命令格式：

```bash
opencli dianping search "<keyword>" --city <name-or-id> --limit <n> -f json
```

`--city` 可用中文、拼音或大众点评 cityId；省略时使用当前 cookie 里的城市。

## 查看店铺详情

搜索结果里的 `shop_id` 可以继续查详情。

```bash
opencli dianping shop <shop_id> -f json
opencli dianping detail <shop_id> -f json
```

也可以传完整店铺 URL：

```bash
opencli dianping shop "https://www.dianping.com/shop/<shop_id>"
```

## 判断标准

优先看：

- `rating`：基础稳定性
- `reviews`：评价量，太少说明信号弱
- `price`：是否符合预算
- `cuisine`：是否适合当前这顿饭
- `district`：是否落在当天区域
- 评价关键词：排队、踩雷、服务、游客店、性价比、是否值得专门去

不要为了高分店扭曲路线。餐厅默认是当天区域里的补给点，只有预约餐、强目的餐、用户明确指定的店，才允许成为路线锚点。

## 刷好评识别

### 识别信号

- 评分异常高（≥4.8）但评价数少（<50）
- 评价内容模板化/雷同（多条评价措辞高度相似）
- 短期内集中好评（近 30 天好评占比 >90%）
- 评价者账号活跃度低（新号/只评价过这一家）

### 处理方式

- 标记 `reviewCredibility` 为 `low-suspect`
- 在输出中明确提示"疑似刷好评，评价可信度低"
- 不直接排除，但降低其评价权重
- 对比同区域同类餐厅的评分分布，偏离均值过多的需警惕

### 可信度分级

| 等级 | 条件 | 处理 |
|------|------|------|
| `high` | 评价数 >200，评分 3.8-4.5，评价内容多样 | 正常使用 |
| `medium` | 评价数 50-200，或评分 4.5-4.8 | 正常使用但留意 |
| `low-suspect` | 评分 ≥4.8 且评价数 <50，或检测到模板化评价 | 降低权重，标注提示 |

## 写回格式

每顿饭只保留 2-3 个候选。

```md
午餐区域：银座 / 有乐町
主推：店名 A
- 大众点评：评分稳定，评价量够，适合午餐，不需要专门绕路
- 可信度：high
- 小红书：近期反馈氛围好，拍照友好

备选：店名 B
- 大众点评：离地铁近，排队风险低
- 可信度：medium（评价数偏少）
- 小红书：更像工作日简餐
```

## 常见坑

- 只按评分选店，不看它是否在当天区域
- 为了一家店反向规划半天路线
- 把小红书种草当成餐厅硬口碑
- 忽略排队、预约和营业时间
- 搜索词太泛，得到一堆游客店
- 不识别刷好评，被虚假高分误导

## 官方参考

- https://github.com/jackwener/OpenCLI/blob/main/docs/adapters/browser/dianping.md
