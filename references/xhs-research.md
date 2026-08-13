# 体验调研工作流

## 双轨方案

Phase 2 提供两条调研路径，根据环境自动选择：

| 路径 | 方案 | 前提条件 | 数据质量 | 适用环境 |
|------|------|----------|----------|----------|
| A（主） | WebSearch + WebFetch 多源聚合 | 无 | 中（聚合数据） | 沙箱/无登录环境 |
| B（高级） | CDP 直连拦截 API | 已登录 Chrome | 高（原始 API 数据） | 本地已登录浏览器 |

### 路径选择逻辑

```
if (已登录 Chrome + OpenCLI 可用) {
  → 路径 B：opencli xiaohongshu search（CDP 直连拦截 search/notes API）
} else if (CDP 可达 && user/me 返回 guest=false) {
  → 路径 B：裸 Puppeteer CDP 拦截
} else {
  → 路径 A：WebSearch + WebFetch 多源聚合
}
```

## 路径 A：WebSearch + WebFetch 多源聚合

### 搜索策略

对每个调研目标，执行三轮搜索：

1. **正面搜索**：`"{店名}" "{城市}" 小红书 笔记 评价`
2. **负面搜索**：`"{店名}" 难吃 踩雷 差评`
3. **聚合搜索**：`"{店名}" site:xiaohongshu.com`

### 数据提取

从 WebFetch 获取的页面内容中提取：
- 笔记标题、作者、点赞数
- 正文摘要（关键评价语句）
- 地址、菜品、价格信息
- 差评关键词命中

### 输出格式

```json
{
  "keyword": "哈尔滨老昌春饼",
  "source": "websearch_aggregation",
  "notes": [
    {
      "title": "笔记标题",
      "author": "作者",
      "summary": "关键评价摘要",
      "sentiment": "positive|negative|neutral",
      "keyPoints": ["排队30分钟", "春饼量大", "性价比高"]
    }
  ],
  "summary": "整体评价摘要"
}
```

## 路径 B：CDP 直连拦截 API（需已登录 Chrome）

### 2026-08-13 本地实测（OpenCLI adapter，已登录 Chrome）✅ 全通

在本地 Windows 环境中使用 **OpenCLI v1.8.6 内置 xiaohongshu adapter**（比裸 Puppeteer CDP 更省事）完成实测：

```bash
opencli xiaohongshu whoami
# → logged_in: true, username: 高乐高高

opencli xiaohongshu search "哈尔滨 中央大街 美食" --limit 5 -f json
# → 返回 rank/author/likes/title/url(带 xsec_token)/published_at
```

| 测试项 | 结果 |
|--------|------|
| 登录态检测 | ✅ `whoami` 返回 logged_in: true |
| 搜索笔记 | ✅ 返回带 xsec_token 的笔记链接（可直接进详情页） |
| 前提 | 已登录 Chrome + Browser Bridge 扩展 v1.0.22 + `opencli doctor` 全绿 |

**要点**：OpenCLI 的 xiaohongshu adapter 底层就是 CDP 走真实页面，绕过了登录墙。登录态是唯一硬前提——`opencli xiaohongshu search` 全部命令标记 `[cookie]`。

### 2026-08-13 CDP 测试验证结果（沙箱·未登录）

在沙箱环境中使用 Puppeteer + CDP 进行了完整测试，结果如下：

| 测试项 | 结果 | 说明 |
|--------|------|------|
| Chrome 启动 | ✅ | headless 模式，需安装系统依赖库 |
| CDP 连接 | ✅ | `puppeteer.connect({ browserURL })` 成功 |
| 导航到搜索结果页 | ✅ | 直接路由 `search_result?keyword=...` 成功 |
| 拦截 API 调用 | ✅ | 成功拦截 82 个 API 请求 |
| 获取响应体 | ✅ | 成功获取 42 个 API 响应体 |
| `search/recommend` API | ✅ | 返回搜索联想词（无需登录） |
| `search/notes` API | ❌ | **未触发** — 前端检测到未登录，不发起搜索请求 |
| 页面笔记数据 | ❌ | 0 条 — 登录弹窗拦截，页面显示"登录后查看搜索结果" |
| Cookie 状态 | ⚠️ | 13 个匿名 Cookie，`web_session` 存在但为访客会话 |
| `user/me` API | ✅ | 正确返回 `guest=true`（访客模式） |

### 关键发现

1. **`search/notes` API 需要登录态**：小红书前端在检测到 `user/me` 返回 `guest=true` 时，不会发起 `search/notes` 请求，而是显示登录弹窗
2. **Cookie 检测不可靠**：`web_session` Cookie 即使在访客模式下也存在，不能用作登录态判断。必须通过 `user/me` API 的 `guest` 字段判断
3. **`search/recommend` 无需登录**：搜索联想词 API 可以在访客模式下正常调用
4. **CDP 网络拦截完全可用**：`Network.responseReceived` + `Network.getResponseBody` 可以获取所有 API 响应

### 技术实现

#### Step 1：启动可调试 Chrome

```bash
# Linux 沙箱环境
/root/.cache/puppeteer/chrome/linux-151.0.7922.71/chrome-linux64/chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/data/user/work/chrome-profile \
  --no-first-run --no-default-browser-check \
  --no-sandbox --disable-setuid-sandbox \
  --disable-gpu --disable-dev-shm-usage \
  --window-size=1280,900 about:blank

# macOS 本地环境
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.travel-assistant/chrome-profile" \
  'https://www.xiaohongshu.com'
```

#### Step 2：CDP 连接 + 网络拦截

```javascript
const puppeteer = require('puppeteer-core');

const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null,
});

const page = await browser.newPage();
const client = await page.target().createCDPSession();
await client.send('Network.enable');

// 拦截 search/notes API
client.on('Network.responseReceived', async (event) => {
  const url = event.response.url;

  if (url.includes('search/notes')) {
    setTimeout(async () => {
      const { body } = await client.send('Network.getResponseBody', {
        requestId: event.requestId
      });
      const data = JSON.parse(body);
      // data.data.items → 笔记列表
    }, 3000);
  }

  // 检查登录状态
  if (url.includes('user/me')) {
    const { body } = await client.send('Network.getResponseBody', {
      requestId: event.requestId
    });
    const data = JSON.parse(body);
    if (data.data?.guest === false) {
      console.log('真实登录:', data.data.nickname);
    }
  }
});
```

#### Step 3：登录检测（关键）

```javascript
// ❌ 错误：Cookie 检测（web_session 在访客模式下也存在）
const isLoggedIn = cookies.some(c => c.name === 'web_session' && c.value.length > 20);

// ✅ 正确：通过 user/me API 检测
const { body } = await client.send('Network.getResponseBody', { requestId });
const data = JSON.parse(body);
const isRealLogin = data.success && data.data?.guest === false && !!data.data?.nickname;
```

#### Step 4：导航到搜索结果页

```javascript
const keyword = encodeURIComponent('哈尔滨美食');
await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${keyword}`, {
  waitUntil: 'networkidle2',
  timeout: 30000
});
// 登录后，前端会自动发起 POST /api/sns/web/v1/search/notes
```

#### Step 5：提取笔记数据

`search/notes` API 返回结构：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "note_id",
        "xsec_token": "token",
        "note_card": {
          "note_id": "xxx",
          "display_title": "笔记标题",
          "type": "normal|video",
          "user": { "nick_name": "作者" },
          "interact_info": { "liked_count": "123" },
          "cover": { "url": "封面图URL" }
        }
      }
    ]
  }
}
```

### 拦截到的 API 列表（访客模式）

以下 API 在访客模式下可以被拦截：

| API | 用途 | 需登录 |
|-----|------|--------|
| `/api/sns/web/v2/user/me` | 用户信息 | 否（返回 guest=true） |
| `/api/sns/web/v1/login/qrcode/create` | 创建登录二维码 | 否 |
| `/api/qrcode/userinfo` | 二维码状态轮询 | 否 |
| `/api/sns/web/v1/search/recommend` | 搜索联想词 | 否 |
| `/api/sns/web/v1/config` | 全局配置 | 否 |
| `/api/sns/web/v1/system/config` | 系统配置 | 否 |
| `/api/sns/web/v1/search/notes` | **搜索笔记** | **是** |
| `/api/sns/web/v1/feed` | 笔记详情 | 是 |
| `/api/sns/web/v1/note/like` | 点赞 | 是 |

## 筛选标准

### 保留（真店信号）

- 店名明确、地址明确、菜品明确
- 有自己体验
- 高频词在多条笔记里重复出现

### 不保留

- 泛东京合集里顺手带一句
- 标题写酒店/散步，正文才顺手提店
- 明显搬运

### 能帮决策的信息

优先保留：
- 要不要排队
- 是主餐还是收尾
- 更适合白天还是晚上
- 更像打卡还是更像稳饭
- 容不容易踩空

不优先：纯情绪表达、漂亮但没用的形容、重复三遍的"氛围很好"

## 差评筛选

### 搜索负面关键词

在提取笔记时，专门搜索负面关键词：
- 难吃/排队太久/服务差/踩雷/不推荐/失望/翻车/坑/不值

### 统计差评占比

差评占比 = 差评笔记数 / 总相关笔记数（排除推广帖后计算）

### 评估差评影响程度

| 影响程度 | 差评占比 | 涉及问题类型 | 处理方式 |
|----------|----------|-------------|----------|
| 低 | <15% | 非核心问题（排队时间、环境一般） | 正常推荐，注明小问题 |
| 中 | 15-30% | 部分核心问题（口味一般、服务态度差） | 降为备选，提示风险 |
| 高 | >30% | 核心问题（食品安全、欺骗消费者） | 不推荐，建议替代 |

## 推广帖甄别

### 识别信号

- 内容过于完美，无任何缺点提及
- 使用营销话术（"绝绝子"/"yyds"/"必打卡"/"宝藏店铺"等高频营销词）
- 图片过于精致统一，疑似专业拍摄
- 账号只发布商业场所推广内容
- 评论区有大量无意义的正面回复
- 带有品牌合作标记或 @商家账号

### 处理方式

- 标记 `postType` 为 `promotional`
- 推广帖不参与差评占比统计（排除推广帖后再计算差评比例）
- 在输出中注明"检测到 N 条疑似推广帖，已排除"
- 推广帖中的正面信息降低权重，不作为独立推荐依据

## 写回格式

写回时只留一层结论，不搬笔记原文：

```md
店名：XXX
- 代表链接：https://xiaohongshu.com/explore/xxx
- 判断：氛围好，拍照友好，适合晚餐
- 差评占比：12%（低 — 主要涉及排队时间）
- 推广帖：检测到 2 条，已排除
```

## 常见坑

1. **Cookie 检测不可靠** — `web_session` 在访客模式下也存在，必须通过 `user/me` API 的 `guest` 字段判断登录态
2. **search/notes 需要登录** — 访客模式下前端不会发起此 API 请求，页面会显示"登录后查看搜索结果"
3. **搜索结果页路由是更稳入口** — 不要模拟输入框，直接导航到 `search_result?keyword=...`
4. **fetch 直接调接口会被拦** — 返回 `code:300011` 要求切换账号。最稳还是走真实页面 + CDP 抓响应
5. **搜索结果混地区内容** — 不是噪音，能看出店在片区里的角色，但不能直接当单店口碑
6. **不甄别推广帖** — 推广帖会严重扭曲评价，必须先排除再计算差评占比
7. **只看正面笔记** — 差评笔记往往更有参考价值，必须主动搜索
8. **沙箱环境限制** — 在沙箱中 Chrome 可以启动并连接 CDP，但用户无法扫码登录。路径 B 仅适用于本地已登录 Chrome 环境
9. **OpenCLI 是路径 B 的最简实现** — 裸 CDP 需自己写拦截逻辑；OpenCLI 的 `xiaohongshu search` 已封装好，Windows 上记得先 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
