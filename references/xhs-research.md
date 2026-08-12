# 小红书调研工作流 (OpenCLI + Chrome CDP)

## 前提

`agent-reach` 的小红书 MCP 通道不稳定。稳定方案是 OpenCLI + Chrome CDP。

## OpenCLI 安装

GitHub: https://github.com/jackwener/OpenCLI

```bash
npm install -g @jackwener/opencli
```

安装后确认 PATH 能找到它。如果全局 npm 装在 `~/.npm-global/bin`，需要在 `~/.zshenv` 里加：

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

验证：

```bash
opencli --version   # 应返回 1.7.0+
opencli doctor      # 检查 daemon、extension、Chrome 连通性
```

### Browser Bridge 扩展

OpenCLI 需要一个 Chrome 扩展来桥接浏览器：

1. 从 [GitHub Releases](https://github.com/jackwener/OpenCLI/releases) 下载 `opencli-extension.zip`
2. 解压到 `~/.opencli/extensions/opencli-extension`
3. Chrome 打开 `chrome://extensions` → 开启「开发者模式」→ 「加载已解压的扩展程序」→ 选上面的目录

### OpenCLI 内置小红书命令（备选方案）

OpenCLI 自带 xiaohongshu 适配器，支持 `search`、`note`、`feed` 等命令：

```bash
opencli xiaohongshu search '玉ひで 东京' --limit 10 -f json
```

但这条路依赖 Browser Bridge 扩展 + daemon 全部在线，实测不一定稳定。
如果不稳定，走下面的 CDP 直连方案更可靠。

## 环境路径参考

- `opencli` 可执行文件：`~/.npm-global/bin/opencli`
- `opencli` 安装目录：`~/.npm-global/lib/node_modules/@jackwener/opencli`
- CDP 实现：`~/.npm-global/lib/node_modules/@jackwener/opencli/dist/src/browser/cdp.js`
- Browser Bridge 扩展：`~/.opencli/extensions/opencli-extension`

## 最小复现流程

### Step 1：启动可调试 Chrome

```bash
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --user-data-dir=/tmp/opencli-chrome-cdp \
  --profile-directory=Default \
  --remote-debugging-port=9223 \
  'https://www.xiaohongshu.com/explore'
```

用单独的 `user-data-dir`，开 `9223` 调试口，先打开小红书。

### Step 2：CDPBridge 连接

```js
import { CDPBridge } from '@jackwener/opencli/dist/src/browser/cdp.js';

const bridge = new CDPBridge();
const page = await bridge.connect({
  cdpEndpoint: 'http://127.0.0.1:9223',
  timeout: 10
});
```

### Step 3：搜索 — 直接进路由

**关键：不要模拟输入框。** 小红书前端有双 input、透明 input、联想层、风控逻辑，模拟输入会假成功。

直接导航到搜索结果页：

```js
await bridge.send('Page.navigate', {
  url: 'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(query)
});
```

### Step 4：拦截搜索 API

监听网络请求，抓：

```
POST https://edith.xiaohongshu.com/api/sns/web/v1/search/notes
```

返回：笔记 id、xsec_token、标题、作者、点赞、收藏、评论。

第一轮筛选不需要开详情页。搜索前排结果就够判断信号强弱。

### Step 5：详情页提取

搜索结果拿到 `id` + `xsec_token`，拼详情页 URL：

```
https://www.xiaohongshu.com/explore/<id>?xsec_token=<token>&xsec_source=
```

DOM 提取：

```js
document.querySelector('#detail-title')?.innerText     // 标题
document.querySelector('#detail-desc')?.innerText      // 正文
document.querySelector('.author-container .username')?.innerText  // 作者
```

### Step 6：两段式流程

1. 搜索结果页抓前 10-20 条
2. 只开最相关的 2-3 条详情页

好处：快、不容易被风控、先判断信号强弱、写进 `.md` 更干净。

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

## CDP 验证结论（2026-08-12）

### 验证环境

- OpenCLI v1.8.6，daemon 运行正常
- Chrome 150.0.7871.181，CDP 端口 9222
- Browser Bridge 扩展未连接（sandbox 环境限制）

### 验证结果

| 测试项 | 结果 | 说明 |
|--------|------|------|
| CDP 连接 | PASS | `bridge.connect()` 成功建立连接 |
| 搜索路由导航 | PASS | 直接导航到 `search_result?keyword=...` 成功 |
| 页面标题 | PASS | 正确显示"北京烤鸭 - 小红书搜索" |
| 笔记卡片渲染 | BLOCKED | 0 条笔记（未登录态下内容不渲染） |
| 风控检测 | DETECTED | 页面文本中出现风控相关提示 |

### 分析

1. **CDP 直连路由方案完全可用** — `Page.navigate` + 搜索结果页 URL 方案验证通过
2. **搜索结果页标题正确** — 说明小红书服务端正常响应了搜索请求
3. **笔记内容需要登录态** — 未登录时前端不渲染笔记卡片，页面文本仅 843 字符
4. **风控提示存在** — 页面文本中检测到风控相关词汇，说明小红书对未登录访问有风控

### 建议

- 在真实使用环境中，先用 Chrome 手动登录 `xiaohongshu.com`，再启动 CDP
- 登录后重新执行搜索路由导航，笔记卡片应正常渲染
- 如仍触发风控，等待 10-30 分钟后重试，或模拟更多真实浏览行为（先访问首页，再搜索）

### 降级策略

当小红书不可用时，Phase 2 的降级优先级：

1. **AMap PlaceSearch** — 提供结构化 POI 数据
2. **大众点评** — 提供餐饮硬信号（同样需要登录态）
3. **手动补充** — Agent 根据已有信息给出最佳建议，标注"小红书数据缺失"

## 常见坑

1. **agent-reach ≠ 小红书可用** — 先跑 `agent-reach doctor`，小红书 MCP 没配就别浪费时间
2. **输入框不好惹** — 搜索结果页路由是更稳入口
3. **fetch 直接调接口可能被拦** — 返回 `code:300011` 要求切换账号。最稳还是走真实页面 + CDP 抓响应
4. **搜索结果混地区内容** — 不是噪音，能看出店在片区里的角色，但不能直接当单店口碑
5. **不甄别推广帖** — 推广帖会严重扭曲评价，必须先排除再计算差评占比
6. **只看正面笔记** — 差评笔记往往更有参考价值，必须主动搜索
7. **未登录直接搜索** — 搜索结果页能打开，但笔记卡片不渲染，必须先登录
