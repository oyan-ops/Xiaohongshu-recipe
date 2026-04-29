# 小红书食谱转换工具 / Xiaohongshu Recipe Extractor

[中文](#中文) · [English](#english)

---

## 中文

把小红书帖子链接 → AI 自动整理成结构化食谱 → 存入云端食谱库。  
**安装为 PWA 后**，可以从小红书 app 直接「分享」帖子到这个工具，自动生成。

🔗 在线地址：https://xiaohongshu-recipe-web.onrender.com

### 功能

- 🔗 **粘贴链接**：输入小红书帖子 URL，后端自动抓取标题、正文、封面图、视频地址
- 📱 **PWA + Share Target**：装到主屏幕，从小红书直接分享帖子进来（Android 完整支持）
- ✨ Claude Opus 4.7 提取食材、步骤、份量、时间、标签、小贴士
- 📚 **云端食谱库**（Supabase）：跨设备同步，列表 / 详情 / 删除
- 🎬 食谱里保留**原帖链接**和**原视频链接**
- 📥 单条食谱导出 JSON

### 技术栈

- 前端：React + Vite + PWA（manifest + share_target + service worker）
- 后端：Node.js + Express，部署在 Render
- 存储：Supabase (Postgres)
- AI：Anthropic Claude Opus 4.7（图文混合输入）
- 小红书抓取：带 cookies 请求帖子页面，解析 `window.__INITIAL_STATE__`

### 安装到手机

#### Android（推荐，share 一步到位）
1. Chrome 打开线上地址
2. 浏览器菜单 → **添加到主屏幕 / 安装应用**
3. 在小红书 app 里看到喜欢的帖子 → 右上角分享 → 选「**小红书食谱**」
4. 自动跳转到 app 并开始抓取

#### iOS（变通方案）
Safari 暂不支持 PWA share target。  
小红书帖子点「分享 → 复制链接」→ 打开主屏幕的 PWA → 粘贴 → 抓取。

### 本地启动

#### 1. 环境变量 `backend/.env`

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
PORT=3001
```

#### 2. 准备小红书 cookies → `backend/cookies.txt`

1. Chrome 登录 https://www.xiaohongshu.com
2. F12 → Console 运行 `copy(document.cookie)`
3. 粘贴到 `backend/cookies.txt` 保存

cookies 会过期（数周到数月），失效后重新导出即可。  
线上部署时将同样的内容设置为环境变量 `XHS_COOKIES`。

#### 3. Supabase 建表（SQL Editor 跑一次）

```sql
create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  servings text,
  prep_time text,
  cook_time text,
  ingredients jsonb,
  steps jsonb,
  tags jsonb,
  tips jsonb,
  source_url text,
  video_url text,
  cover_image text,
  author text,
  extracted_at timestamptz default now()
);
create index on recipes (extracted_at desc);
```

#### 4. 启动

```bash
# 终端 1
cd backend && npm install && npm run dev   # http://localhost:3001

# 终端 2
cd frontend && npm install && npm run dev  # http://localhost:5173
```

### 项目结构

```
backend/
  server.js                          # API 路由
  lib/
    xhs.js                           # 小红书抓取
    db.js                            # Supabase 读写
  scripts/migrate-json-to-supabase.js
frontend/
  public/
    manifest.webmanifest             # PWA + share_target 配置
    sw.js                            # service worker（最小化）
    icon-192.png / icon-512.png      # 应用图标
    _redirects                       # Render 静态站 SPA 路由
  scripts/gen-icons.js               # 从 icon.svg 生成 PNG 图标
  src/
    App.jsx                          # 主界面 + share target 处理
    api.js                           # API base URL
    styles.css                       # 卡通风样式
```

### API

| Method | Path | 说明 |
|--------|------|------|
| POST   | `/api/recipe/from-link` | `{url}` → 抓取并提取 |
| GET    | `/api/recipes`          | 食谱列表 |
| GET    | `/api/recipes/:id`      | 食谱详情 |
| DELETE | `/api/recipes/:id`      | 删除 |

### 部署架构

- 后端：Render Web Service，从 GitHub 自动部署
- 前端：Render Static Site，从 GitHub 自动部署
- 数据库：Supabase（免费层）
- 推送 `main` 分支触发自动重新部署

### 常见问题

- **"cookies 可能已过期"** → 重新导出 cookies
- **Anthropic credit balance too low** → 去 https://console.anthropic.com/settings/billing 充值
- **端口 3001 被占用** → `lsof -ti:3001 | xargs kill -9`
- **iOS 分享后没有这个 app 选项** → 苹果暂不支持 PWA share target，目前只能手动复制粘贴

### 致谢

小红书 `__INITIAL_STATE__` 抓取思路参考自 [chenxiachan/xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills)（MIT）。

---

## English

Paste a Xiaohongshu (Little Red Book) post URL → Claude turns it into a structured recipe → saved to a cloud recipe library.  
**Install as a PWA** to share posts directly from Xiaohongshu into the app (Android).

🔗 Live: https://xiaohongshu-recipe-web.onrender.com

### Features

- 🔗 **Paste a link**: backend fetches title, body, cover image, and video URL from any Xiaohongshu post
- 📱 **PWA + Share Target**: install to home screen and share posts straight from Xiaohongshu (Android)
- ✨ Claude Opus 4.7 extracts ingredients, steps, servings, timing, tags, tips
- 📚 **Cloud recipe library** (Supabase): syncs across devices
- 🎬 Each recipe keeps the **original post URL** and **video URL**
- 📥 One-click export to JSON

### Stack

- Frontend: React + Vite + PWA (manifest + share_target + service worker)
- Backend: Node.js + Express, deployed on Render
- Storage: Supabase (Postgres)
- AI: Anthropic Claude Opus 4.7 (image + text input)
- Xiaohongshu scraping: cookie-authed HTTP request, parses `window.__INITIAL_STATE__`

### Install on phone

#### Android (recommended)
1. Open the live URL in Chrome
2. Menu → **Add to Home Screen / Install app**
3. In Xiaohongshu, share any post → pick **小红书食谱**
4. Auto-redirects and starts extracting

#### iOS (workaround)
Safari doesn't support PWA share targets yet.  
Tap **Share → Copy Link** in Xiaohongshu → open the PWA → paste → extract.

### Local setup

#### 1. Env vars — `backend/.env`

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
PORT=3001
```

#### 2. Xiaohongshu cookies → `backend/cookies.txt`

1. Log into https://www.xiaohongshu.com in Chrome
2. F12 → Console → run `copy(document.cookie)`
3. Paste into `backend/cookies.txt`

For cloud deployment, set the same value as the `XHS_COOKIES` env var.

#### 3. Create the Supabase table

Same SQL as above.

#### 4. Run

```bash
# Terminal 1
cd backend && npm install && npm run dev   # http://localhost:3001

# Terminal 2
cd frontend && npm install && npm run dev  # http://localhost:5173
```

### API

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/recipe/from-link` | `{url}` → scrape + extract |
| GET    | `/api/recipes`          | List |
| GET    | `/api/recipes/:id`      | Detail |
| DELETE | `/api/recipes/:id`      | Delete |

### Deployment

- Backend: Render Web Service, auto-deploys from GitHub
- Frontend: Render Static Site, auto-deploys from GitHub
- Database: Supabase (free tier)
- Push to `main` → auto redeploy

### Troubleshooting

- **"cookies expired"** → re-export from Chrome
- **Anthropic credit balance too low** → top up at https://console.anthropic.com/settings/billing
- **Port 3001 in use** → `lsof -ti:3001 | xargs kill -9`
- **No "share to app" option on iOS** → not supported by iOS yet; copy-paste workaround above

### Credits

The `__INITIAL_STATE__` scraping approach is adapted from [chenxiachan/xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills) (MIT).
