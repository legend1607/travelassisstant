# 体验调研工作流

## 双轨方案

Phase 2 提供两条调研路径，根据环境自动选择：

| 路径 | 方案 | 前提条件 | 数据质量 | 适用环境 |
|------|------|----------|----------|----------|
| A（主） | WebSearch + WebFetch 多源聚合 | 无 | 中（聚合数据） | 沙箱/无登录环境 |
| B（高级） | CDP 直连拦截 API | 已登录 Chrome | 高（原始 API 数据） | 本地已登录浏览器 |

### 路径选择规则

1. 检测是否有已登录的 Chrome 远程调试端口（`http://127.0.0.1:9222` 可达）
2. 可达 → 使用路径 B（CDP 直连）
3. 不可达 → 使用路径 A（WebSearch 多源聚合）

---

## 路径 A：WebSearch + WebFetch 多源聚合（无需登录）

### 数据源

| 数据源 | URL 模式 | 提供数据 | 优先级 |
|--------|----------|----------|--------|
| 携程旅拍 | `hk.trip.com/moments/detail/{city}-{id}` | 拍照点+摄影技巧+体验描述+季节建议 | 1（最高） |
| 什么值得买 | `post.m.smzdm.com/p/{id}/` | 详细体验记录+菜品分析+场景推荐 | 2 |
| 头条 | `m.toutiao.com/group/{id}/` | 深度攻略+景点介绍+实用建议 | 3 |
| 马蜂窝 | `m.mafengwo.cn/gl/poi/comment.php?id={id}` | 用户评价+体验分享 | 4 |

### 调研流程

#### Step 1：WebSearch 搜索体验内容

```
# 景点
WebSearch: "{景点名} {城市} 拍照 攻略 体验"

# 餐厅
WebSearch: "{餐厅名} {城市} 体验 拍照"
```

#### Step 2：WebFetch 抓取携程旅拍

获取：最佳拍照点、摄影技巧、季节性建议、体验描述、相关游记推荐。

#### Step 3：WebFetch 抓取什么值得买体验文

获取：菜品逐一分析、场景推荐、排队情况、价格明细、个人感受。

#### Step 4：信号合并

| 数据类型 | 来源 | 用途 |
|----------|------|------|
| 拍照点 | 携程旅拍 | 标记地图卡片 |
| 摄影技巧 | 携程旅拍 | 补充到 desc 字段 |
| 氛围描述 | 携程旅拍+什么值得买 | 补充到 desc 字段 |
| 近期体验 | 什么值得买+头条 | 判断是否值得去 |
| 季节建议 | 携程旅拍 | 标记天气敏感点 |

### 推广帖甄别

**推广信号**：过度美化无缺点、品牌词高频、链接导向购买、无个人体验细节
**真实信号**：有踩雷/排队/价格等真实细节、有主观感受、有实用建议

### 差评筛选

```
WebSearch: "{景点名/餐厅名} {城市} 踩雷 差评 不推荐"
```

---

## 路径 B：CDP 直连拦截 API（需已登录 Chrome）

### 2026-08-13 实测验证结果

在沙箱环境中使用 Puppeteer + CDP 进行了完整测试，结果如下：

| 测试项 | 结果 | 说明 |
|--------|------|------|
| Chrome 启动 | ✅ | headless 模式，需安装系统依赖库 |
| CDP 连接 | ✅ | `page.target().createCDPSession()` 成功 |
| 导航到搜索结果页 | ✅ | 直接路由 `search_result?keyword=...` 成功 |
| 拦截 API 调用 | ✅ | 成功拦截 66 个 API 请求 |
| 获取响应体 | ✅ | 成功获取 42 个 API 响应体 |
| `search/recommend` API | ✅ | 返回搜索联想词（无需登录） |
| `search/notes` API | ❌ | **未触发** — 前端检测到未登录，不发起搜索请求 |
| 页面笔记数据 | ❌ | 0 条 — 登录弹窗拦截 |
| Cookie 状态 | ⚠️ | 12 个匿名 Cookie，无登录态 |

### 关键发现

1. **CDP 技术完全可行** — 拦截、获取响应体、直接路由都成功
2. **`search/notes` API 需要登录态** — 前端 JS 检测到未登录后弹出登录弹窗，不调用搜索 API
3. **`search/recommend` API 不需要登录** — 返回搜索联想词，可用于扩展搜索词
4. **登录是唯一障碍** — 不是 CDP 技术问题，是平台登录策略

### 解决方案：连接已登录的 Chrome

在用户本地环境（非沙箱），用户的 Chrome 已登录小红书：

#### Step 1：启动 Chrome 远程调试

```bash
# macOS
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/Google/Chrome/Default" \
  'https://www.xiaohongshu.com'

# Linux
google-chrome --remote-debugging-port=9222 &

# Windows
chrome.exe --remote-debugging-port=9222
```

关键：使用用户的默认 user-data-dir（已包含登录 Cookie）。

#### Step 2：验证登录状态

```javascript
// 通过 CDP 检查登录状态
const client = await page.target().createCDPSession();
await client.send('Network.enable');

// 导航到搜索页
await page.goto('https://www.xiaohongshu.com/search_result?keyword=test');

// 检查是否有登录弹窗
const hasLoginModal = await page.evaluate(() => {
  return !!document.querySelector('.login-container, [class*="login"]');
});

if (!hasLoginModal) {
  console.log('✅ 已登录，可以拦截 search/notes API');
}
```

#### Step 3：拦截 search/notes API

```javascript
const client = await page.target().createCDPSession();
await client.send('Network.enable');

const notesData = [];

client.on('Network.responseReceived', async (event) => {
  const url = event.response.url;
  
  // 拦截搜索笔记 API
  if (url.includes('/api/sns/web/v1/search/notes')) {
    console.log(`[拦截] search/notes API`);
    
    // 等待响应完成
    setTimeout(async () => {
      try {
        const { body } = await client.send('Network.getResponseBody', {
          requestId: event.requestId
        });
        const data = JSON.parse(body);
        
        // 提取笔记数据
        if (data.success && data.data?.items) {
          data.data.items.forEach(item => {
            const note = item.note_card || item;
            notesData.push({
              id: note.note_id,
              title: note.display_title,
              type: note.type,
              user: note.user?.nick_name,
              likedCount: note.interact_info?.liked_count,
              cover: note.cover?.url,
              xsecToken: item.xsec_token,
            });
          });
          console.log(`[提取] ${notesData.length} 条笔记`);
        }
      } catch (e) {
        console.log(`[错误] ${e.message}`);
      }
    }, 3000);
  }
});

// 导航到搜索结果页
const keyword = encodeURIComponent('哈尔滨老昌春饼');
await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${keyword}`, {
  waitUntil: 'networkidle2',
  timeout: 30000
});

// 等待 API 响应
await new Promise(r => setTimeout(r, 10000));
```

#### Step 4：提取前排笔记详情

搜索结果拿到 `id` + `xsec_token` 后，拼接详情页 URL：

```
https://www.xiaohongshu.com/explore/{id}?xsec_token={token}&xsec_source=
```

```javascript
// 只开最相关的 2-3 条详情页
const topNotes = notesData.slice(0, 3);

for (const note of topNotes) {
  const detailUrl = `https://www.xiaohongshu.com/explore/${note.id}?xsec_token=${note.xsecToken}`;
  
  await page.goto(detailUrl, { waitUntil: 'networkidle2' });
  
  const detail = await page.evaluate(() => {
    return {
      title: document.querySelector('#detail-title')?.innerText,
      desc: document.querySelector('#detail-desc')?.innerText,
      author: document.querySelector('.author-container .username')?.innerText,
      bodyText: document.body.innerText.substring(0, 2000),
    };
  });
  
  console.log(`[详情] ${detail.title}`);
  note.detail = detail;
}
```

### 信号筛选

#### 保留（真店信号）

- 店名明确、地址明确、菜品明确
- 有自己体验
- 高频词在多条笔记里重复出现

#### 不保留

- 泛东京/泛哈尔滨合集里顺手带一句
- 标题写酒店/散步，正文才顺手提店
- 明显搬运

#### 能帮决策的信息

优先保留：
- 要不要排队
- 是主餐还是收尾
- 更适合白天还是晚上
- 更像打卡还是更像稳饭
- 容不容易踩空

### search/recommend API（无需登录可用）

即使未登录，`search/recommend` API 也能返回搜索联想词：

```javascript
// 已验证可用的 API（无需登录）
const recommendUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/search/recommend?keyword=${encodeURIComponent(keyword)}`;
```

返回数据示例：
```json
{
  "code": 1000,
  "success": true,
  "data": {
    "sug_items": [
      {"text": "哈尔滨老昌春饼哪家店好吃", "type": "top_note"},
      {"text": "哈尔滨老昌春饼好吃吗", "type": "top_note"}
    ]
  }
}
```

可用于扩展搜索词，但不包含笔记内容。

### 常见坑

1. **不要模拟输入框** — 小红书前端有双 input、透明 input、联想层、风控逻辑，直接导航到搜索结果页路由更稳
2. **fetch 直接调接口会被拦** — 返回 `code:300011` 要求切换账号，必须走真实页面 + CDP 抓响应
3. **搜索结果混地区内容** — 不是噪音，能看出店在片区里的角色，但不能直接当单店口碑
4. **headless 可能被检测** — 部分 API 会检测 headless 特征，如遇问题改用 `headless: false`（需 Xvfb）
5. **Cookie 过期** — `web_session` Cookie 有有效期，过期后需重新登录
6. **风控限制** — 短时间大量请求会触发风控，每次请求间隔 ≥2 秒

---

## 写回格式

```json
{
  "name": "太阳岛风景区",
  "type": "spot",
  "verified": true,
  "xhsData": {
    "source": "cdp",
    "link": "https://hk.trip.com/moments/detail/harbin-151-137296433",
    "verdict": "秋季限定的金色林荫道，鹿苑附近是最佳拍照点",
    "photoSpots": ["鹿苑外围金色林荫道", "树影斑驳的白墙", "湖边芦苇荡"],
    "photoTips": ["晴天下午3-4点光影效果最好", "对焦树叶虚化背景"],
    "noteCount": 15,
    "topNotes": [
      {"title": "...", "likedCount": 1200, "author": "..."}
    ],
    "negativeRatio": 0.1,
    "negativeImpact": "low",
    "promotionalPostsDetected": 0
  }
}
```

`source` 字段标注数据来源：`cdp`（路径 B）或 `websearch`（路径 A）。