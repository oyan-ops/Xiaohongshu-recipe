# 小红书食谱转换工具 / Xiaohongshu Recipe Extractor

[中文](#中文) · [English](#english)

---

## 中文

粘贴小红书帖子链接 → Claude 自动提取结构化食谱 → 存入云端食谱库，附原帖与原视频链接。

### 功能

- 🔗 **粘贴链接**：输入小红书帖子 URL，后端自动抓取标题、正文、封面图、视频地址
- 📸 **上传图片**：直接上传美食截图作为备用方式
- ✨ Claude Opus 4.7 提取食材、步骤、份量、时间、标签、小贴士
- 📚 **云端食谱库**（Supabase）：跨设备同步，列表/详情/删除
- 🎬 食谱里保留**原帖链接**和**原视频链接**
- 📥 单条食谱导出 JSON

### 技术栈

- 前端：React + Vite
- 后端：Node.js + Express
- 存储：Supabase (Postgres)
- AI：Anthropic Claude Opus 4.7（图文混合输入）
- 小红书抓取：带 cookies 请求帖子页面，解析 `__INITIAL_STATE__`

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

#### 3. Supabase 建表（SQL Editor 里跑一次）

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

### 使用

1. 顶部 **✨ 提取食谱** → **🔗 粘贴链接**
2. 贴入小红书美食帖链接 → 「抓取并提取食谱」
3. 5–15 秒后看到结构化食谱
4. **📚 我的食谱** 浏览所有保存过的食谱

### API

| Method | Path | 说明 |
|--------|------|------|
| POST   | `/api/recipe/from-link` | `{url}` → 抓取并提取 |
| POST   | `/api/recipe/extract`   | multipart `media` 图片上传 |
| GET    | `/api/recipes`          | 食谱列表 |
| GET    | `/api/recipes/:id`      | 食谱详情 |
| DELETE | `/api/recipes/:id`      | 删除 |

### 常见问题

- **"cookies 可能已过期"** → 重新导出 cookies
- **Anthropic credit balance too low** → 去 https://console.anthropic.com/settings/billing 充值
- **端口 3001 被占用** → `lsof -ti:3001 | xargs kill -9`

### 致谢

小红书 `__INITIAL_STATE__` 抓取思路参考自 [chenxiachan/xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills)（MIT）。

---

## English

Paste a Xiaohongshu (Little Red Book) post URL → Claude extracts a structured recipe → saved to a cloud recipe library, with links back to the original post and video.

### Features

- 🔗 **Paste a link**: backend fetches title, body, cover image, and video URL from any Xiaohongshu post
- 📸 **Image upload**: alternative path — drop a food screenshot
- ✨ Claude Opus 4.7 extracts ingredients, steps, servings, timing, tags, tips
- 📚 **Cloud recipe library** (Supabase): syncs across devices, list / detail / delete
- 🎬 Each recipe keeps the **original post URL** and **video URL**
- 📥 One-click export to JSON

### Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Storage: Supabase (Postgres)
- AI: Anthropic Claude Opus 4.7 (image + text input)
- Xiaohongshu scraping: cookie-authed HTTP request, parses `window.__INITIAL_STATE__`

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
3. Paste the clipboard contents into `backend/cookies.txt`

Cookies expire (weeks to months); re-export when scraping fails.

#### 3. Create the Supabase table (run once in SQL Editor)

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

#### 4. Run

```bash
# Terminal 1
cd backend && npm install && npm run dev   # http://localhost:3001

# Terminal 2
cd frontend && npm install && npm run dev  # http://localhost:5173
```

### Usage

1. Top tabs → **✨ Extract** → **🔗 Paste link**
2. Paste a Xiaohongshu food post URL → "Fetch & extract"
3. Wait 5–15s for the structured recipe
4. Switch to **📚 My recipes** to browse the library

### API

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/recipe/from-link` | `{url}` → scrape + extract |
| POST   | `/api/recipe/extract`   | multipart `media` image upload |
| GET    | `/api/recipes`          | List recipes |
| GET    | `/api/recipes/:id`      | Recipe detail |
| DELETE | `/api/recipes/:id`      | Delete |

### Troubleshooting

- **"cookies expired"** → re-export from Chrome
- **Anthropic credit balance too low** → top up at https://console.anthropic.com/settings/billing
- **Port 3001 in use** → `lsof -ti:3001 | xargs kill -9`

### Credits

The `__INITIAL_STATE__` scraping approach is adapted from [chenxiachan/xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills) (MIT).
