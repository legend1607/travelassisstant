# 交通查询工作流（携程 WebSearch + WebFetch）

## 概述

Phase 1 行程规划时，通过 WebSearch + WebFetch 查询携程获取火车/高铁车次和飞机航班信息。无需登录，在沙箱环境中验证通过。

## 火车/高铁查询

### Step 1：WebSearch 搜索车次

```
WebSearch: "携程 {出发城市}到{到达城市} 高铁 火车 车次 时刻表"
```

搜索结果中识别高价值页面：
- `trains.ctrip.com/TrainBooking/{from}-{to}/gaotie/` — 携程高铁列表页（优先抓取）
- `m.ctrip.com/html5/trains/{from}-{to}-g/` — 携程移动版火车票
- `www.gaotie.com.cn/lieche/{from}-{to}.html` — 高铁网时刻表
- `trains.ctrip.com/trainschedule/{车次号}` — 单个车次经停站详情

### Step 2：WebFetch 抓取完整车次列表

对携程高铁列表页执行 WebFetch：

```
WebFetch: https://trains.ctrip.com/TrainBooking/{出发城市拼音}-{到达城市拼音}/gaotie/
```

获取数据（每个车次）：

| 字段 | 示例 | 说明 |
|------|------|------|
| 车次号 | G701 | 高铁G/动车D/普快K |
| 出发站 | 大连北 | |
| 到达站 | 哈尔滨西 | |
| 出发时间 | 05:55 | |
| 到达时间 | 10:14 | |
| 运行时长 | 4时19分 | |
| 二等座票价 | 437.5 | |
| 一等座票价 | 700.5 | |
| 商务座/特等座票价 | 1476.5 | |
| 无座票价 | 437.5 | |
| 余票数量 | 99张/13张/12张 | 各等级余票 |
| 预订成功率 | 40% | 携程预估 |
| 状态 | 预订/抢票 | |

### Step 3：WebFetch 抓取单次列车经停站

```
WebFetch: https://trains.ctrip.com/trainschedule/{车次号}
```

获取：经停站列表、到站时间、发车时间、停留时间。

### Step 4：中转方案

携程列表页底部自动推荐中转方案，包含：
- 中转站
- 换乘停留时间
- 两段车次分别的余票和票价

### URL 构造规则

| 路线类型 | URL 模式 |
|----------|----------|
| 高铁 | `trains.ctrip.com/TrainBooking/{from}-{to}/gaotie/` |
| 全部火车 | `m.ctrip.com/html5/trains/{from}-{to}-other/t1` |
| 单次经停 | `trains.ctrip.com/trainschedule/{车次号}` |

城市拼音用全拼，如：
- 大连 → dalian
- 哈尔滨 → haerbin
- 北京 → beijing
- 上海 → shanghai

## 飞机航班查询

### Step 1：WebSearch 搜索航班

```
WebSearch: "携程 {出发城市}到{到达城市} 飞机 航班 时刻表 票价"
```

搜索结果中识别高价值页面：
- `flights.ctrip.com/international/search/schedule/{出发代码}-{到达代码}.html` — 航班时刻表
- `flights.ctrip.com/booking/{出发代码}-{到达代码}-day-1.html` — 机票预订页
- `m.ctrip.com/html5/flight/{出发代码}-{到达代码}-day-{N}.html` — 移动版

### Step 2：WebFetch 抓取航班时刻表

```
WebFetch: https://flights.ctrip.com/international/search/schedule/{出发机场代码}-{到达机场代码}.html
```

获取数据（每个航班）：

| 字段 | 示例 | 说明 |
|------|------|------|
| 航空公司 | 华夏航空 | |
| 航班号 | G51763R | |
| 起飞时间 | 13:20 | |
| 到达时间 | 19:55 | |
| 出发机场 | 周水子国际机场 | |
| 到达机场 | 太平国际机场T2 | |
| 机型 | 空客320(中) | |
| 经停 | 直飞/中转1次 | |
| 票价 | ¥880起 | 经济舱折扣价 |

### Step 3：WebFetch 抓取票价详情

```
WebFetch: https://flights.ctrip.com/booking/{出发代码}-{到达代码}-day-1.html
```

获取：具体票价、舱位等级、折扣信息、中转详情。

### 机场代码参考

| 城市 | 机场 | 代码 |
|------|------|------|
| 大连 | 周水子国际机场 | DLC |
| 哈尔滨 | 太平国际机场 | HRB |
| 北京 | 首都/大兴 | PEK/PKX |
| 上海 | 浦东/虹桥 | PVG/SHA |
| 广州 | 白云 | CAN |
| 深圳 | 宝安 | SZX |
| 成都 | 天府/双流 | TFU/CTU |
| 重庆 | 江北 | CKG |
| 西安 | 咸阳 | XIY |
| 杭州 | 萧山 | HGH |
| 武汉 | 天河 | WUH |
| 长沙 | 黄花 | CSX |
| 青岛 | 胶东 | TAO |
| 厦门 | 高崎 | XMN |
| 昆明 | 长水 | KMG |
| 三亚 | 凤凰 | SYX |
| 海口 | 美兰 | HAK |

## 写回 route-schema.json

交通信息写入 `trip.transport`：

```json
{
  "trip": {
    "transport": {
      "outbound": {
        "type": "train",
        "number": "G701",
        "from": "大连北",
        "to": "哈尔滨西",
        "departTime": "05:55",
        "arriveTime": "10:14",
        "duration": "4时19分",
        "price": 437.5,
        "seatClass": "二等座",
        "availability": "99张",
        "bookingUrl": "https://trains.ctrip.com/TrainBooking/dalian-haerbin/gaotie/"
      },
      "return": {
        "type": "train",
        "number": "G720",
        "from": "哈尔滨西",
        "to": "大连北",
        "departTime": "14:05",
        "arriveTime": "18:39",
        "duration": "4时34分",
        "price": 437.5,
        "seatClass": "二等座"
      }
    }
  }
}
```

## 选择原则

### 火车 vs 飞机

| 因素 | 火车/高铁 | 飞机 |
|------|-----------|------|
| ≤800km | ✅ 优先 | ❌ 不推荐 |
| 800-1500km | ✅ 推荐 | ✅ 可选 |
| >1500km | ⚠️ 时间长 | ✅ 优先 |
| 市区到市区 | ✅ 门到门 | ❌ 机场偏远 |
| 价格 | 通常更稳定 | 波动大，提前买便宜 |
| 时间准点率 | 高（>95%） | 中（受天气影响） |
| 行李 | 无限制 | 有重量限制 |

### 用户偏好优先

- 用户说"火车优先" → 先查火车，时间不合适再查飞机
- 用户说"飞机次之" → 火车不可行时查飞机
- 用户说"时间灵活" → 对比总价和时间后推荐

## 常见坑

- 携程页面默认显示"明天"的车次，需要确认日期匹配
- 高铁票价因车次不同有差异（如 G727 二等座¥403.5 vs G701 二等座¥437.5）
- 飞机票价波动大，搜索时的价格不一定等于购买时的价格
- 部分车次显示"抢票"意味着已售罄，需候补
- 中转方案可能总时长更短但更折腾，需权衡
- 节假日期间车次可能增加临客，WebSearch 可能搜不到