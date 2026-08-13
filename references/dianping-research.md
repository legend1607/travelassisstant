# 餐厅调研工作流（双轨：WebSearch 聚合 / OpenCLI 直连）

## 双轨方案

Phase 2 提供两条调研路径，根据环境自动选择：

| 路径 | 方案 | 前提条件 | 数据质量 | 适用环境 |
|------|------|----------|----------|----------|
| A（主） | WebSearch + WebFetch 多源聚合 | 无 | 中（聚合数据） | 沙箱/无登录环境 |
| B（高级） | OpenCLI dianping adapter 直连 | 已登录 Chrome + Browser Bridge 扩展 | 高（原始店铺数据） | 本地已登录浏览器 |

### 路径选择逻辑

```
if (已登录 Chrome + OpenCLI 可用) {
  → 路径 B：opencli dianping search/shop 直连
} else {
  → 路径 A：WebSearch + WebFetch 多源聚合
}
```

## 路径 A：WebSearch + WebFetch 多源聚合

## 数据源

| 数据源 | URL 模式 | 提供数据 | 优先级 |
|--------|----------|----------|--------|
| 携程美食 | `you.ctrip.com/food/{city}/{id}-dianping*.html` | 总评分+口味/环境/服务子分+人均+特色菜+用户点评 | 1（最高） |
| 什么值得买 | `post.m.smzdm.com/p/{id}/` | 菜品分析+排队+价格+个人体验 | 2 |
| 途牛 | `m.tuniu.com/restaurant/{id}/` | 用户评价+基本信息 | 3 |
| 去哪儿 | `touch.go.qunar.com/poi/{id}` | 餐厅基本信息+简介 | 4 |
| 马蜂窝 | `m.mafengwo.cn/gl/poi/comment.php?id={id}` | 用户评价 | 5 |

**关键发现**：携程美食页面 URL 中包含 `dianping` 字样，其数据来源于大众点评。通过携程美食可以间接获取大众点评的评分和用户点评数据。

## 调研流程

### Step 1：WebSearch 搜索餐厅

对每个餐厅执行搜索：

```
WebSearch: "{餐厅名} {城市} 评价 排队 好吃吗"
```

从搜索结果中识别高价值页面：
- `you.ctrip.com/food/...` → 携程美食页（优先抓取）
- `post.m.smzdm.com/p/...` → 什么值得买体验文（优先抓取）
- `m.tuniu.com/restaurant/...` → 途牛餐厅页
- `touch.go.qunar.com/poi/...` → 去哪儿餐厅页

### Step 2：WebFetch 抓取携程美食详情

对搜索到的携程美食 URL 执行 WebFetch，获取：

```json
{
  "name": "张飞扒肉·四代传承(道外店)",
  "rating": 4.6,
  "reviewCount": 123,
  "taste": 4.6,
  "environment": 4.4,
  "service": 4.4,
  "avgPrice": 53,
  "cuisine": "东北菜",
  "address": "道外区靖宇街道南大六道街210号",
  "featuredDishes": ["张飞扒肉", "古法扒豆腐", "风味茄子", "苏伯汤", "扒肘子"],
  "reviews": [
    {
      "user": "会飞的蚂蚁1",
      "date": "2024-12-22",
      "taste": 4, "environment": 4, "service": 4,
      "avgPrice": 64,
      "text": "按着导航找到这里，估计生意太好了，店员的脸蛋都不见笑容。扒肉可圈可点...",
      "useful": 7
    }
  ]
}
```

### Step 3：WebFetch 抓取什么值得买体验文

对搜索到的什么值得买 URL 执行 WebFetch，获取：

- 菜品逐一分析（味道、口感、推荐度）
- 排队情况（"小桌需排队"）
- 价格明细（"单人点小份约九十二元"）
- 个人体验感受
- 适合场景（多人聚餐/单人/情侣）

### Step 4：信号合并

| 数据类型 | 来源 | 判断标准 |
|----------|------|----------|
| 基础评分 | 携程美食 | 总分≥4.5为优，4.0-4.5为良，<4.0需谨慎 |
| 口味 | 携程子分 | ≥4.5为优 |
| 排队风险 | 什么值得买+点评 | "需排队"=中等风险，"排队30min+"=高风险 |
| 性价比 | 人均+用户反馈 | 对比预算范围判断 |
| 踩雷信号 | 差评+体验文 | 关注"太油"、"服务差"、"等待长"等关键词 |
| 评价可信度 | 点评分布 | 好评/差评比、点评时间跨度、账号活跃度 |

### Step 5：刷好评识别

从携程用户点评中识别：

**可疑信号**：
- 多条点评日期集中（同一周内大量好评）
- 文案雷同（模板化表达）
- 只评满分无细节（"好吃"、"不错"而无具体描述）
- 新账号集中好评

**可信信号**：
- 点评跨度长（几个月甚至几年内持续有评价）
- 有具体菜品/排队/价格细节
- 有差评存在（说明未过滤负面反馈）
- 老账号点评（有历史点评记录）

在 route-schema.json 中标注 `dianping.reviewCredibility`：
- `high` — 点评跨度长、有细节、有差评
- `medium` — 正常分布
- `low-suspect` — 集中好评、文案雷同、无差评

## 写回格式

每顿饭只保留 2-3 个候选，写回 route-schema.json：

```json
{
  "name": "张飞扒肉",
  "type": "food",
  "verified": true,
  "amap": {
    "rating": 4.5,
    "tel": "0451-xxxxxxx",
    "openHours": "10:30-21:00"
  },
  "dianping": {
    "taste": 4.6,
    "environment": 4.4,
    "service": 4.4,
    "avgPrice": 53,
    "reviewCount": 123,
    "featuredDishes": ["张飞扒肉", "风味茄子", "苏伯汤"],
    "verdict": "老字号扒肉，瘦肉不柴肥肉不腻，风味茄子和火爆腰花是隐藏必点",
    "queueRisk": "medium",
    "reviewCredibility": "high"
  }
}
```

## 常见坑

- 不要只看总分，要看口味子分和差评内容
- 什么值得买的体验文比携程点评更详细，但样本量小
- 节假日排队时间可能翻倍，用户点评中的排队信息要结合季节判断
- 携程美食的数据可能不是最新的，注意点评日期
- 人均消费受点菜影响大，取中位数而非平均值

## 路径 B：OpenCLI 直连大众点评（需已登录 Chrome）

### 2026-08-13 本地实测验证结果

在本地 Windows + 已登录 Chrome 环境中使用 OpenCLI 完成了完整测试：

| 测试项 | 结果 | 说明 |
|--------|------|------|
| OpenCLI | ✅ v1.8.6，daemon 端口 19825 | `opencli doctor` 全绿 |
| Browser Bridge 扩展 | ✅ v1.0.22 | `~/.opencli/extensions`，Chrome 开发者模式加载 |
| 登录态 | ✅ | 未登录时报 `AUTH_REQUIRED`（exit 77，验证码/需登录），登录后通过 |
| `dianping search` | ✅ | 返回 shop_id/rating/reviews/price/cuisine/district |
| `dianping shop` | ✅ | 返回 taste/environment/service/hours/address/subway/features |
| 数字 cityId | ✅ | 必须显式传，省略时 cityId=0 被重定向到首页 |

### 命令

```bash
# 搜索（必须传数字 cityId；哈尔滨=79）
opencli dianping search "中央大街 火锅" --city 79 --limit 3 -f json

# 店铺详情
opencli dianping shop <shop_id> -f json
```

### 实测注意事项

- **必须传数字 cityId，不要省略 `--city`**：省略时 adapter 用 `search/keyword/0/...`（cityId=0），当前大众点评会把该 URL 重定向到首页，报 `COMMAND_EXEC`
- **拼音城市别用 harbin**：`/harbin` 拼音路由已失效（重定向到 citylist），哈尔滨正确拼音是 `haerbin`，cityId=79
- **解析其他城市 cityId**：`dianping.com/citylist` 拿拼音 → `dianping.com/<拼音>` 提取页面上 `/search/keyword/{id}/` 链接里的数字
- **Windows**：敲 `opencli` 前先 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，否则 `.ps1` 被策略拦截
- **未登录/被验证码拦截**：报 `AUTH_REQUIRED`，打开 `verify.meituan.com` 链接手动过验证码，登录后重试

### 信号合并（路径 B 直连字段）

| 字段 | 判断标准 |
|------|----------|
| rating（综合分） | ≥4.5 为优，4.0-4.5 为良，<4.0 需谨慎 |
| reviews（评价量） | 太少说明信号弱 |
| taste/environment/service | 子分拆解综合分 |
| price（人均） | 对照餐饮预算 |
| cuisine/district | 是否落在当天区域 |
| hours/subway/features | 营业时间、交通、有无包间/宝宝椅 |