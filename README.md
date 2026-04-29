# 小红书食谱转换工具

粘贴小红书帖子链接 → Claude 自动提取结构化食谱 → 存入云端食谱库，附原帖与原视频链接。

## 功能

- 🔗 **粘贴链接**：输入小红书帖子 URL，后端自动抓取标题、正文、封面图、视频地址
- 📸 **上传图片**：直接上传美食截图作为备用方式
- ✨ Claude Opus 4.7 提取食材、步骤、份量、时间、标签、小贴士
- 📚 **云端食谱库**（Supabase）：跨设备同步，列表/详情/删除
- 🎬 食谱里保留**原帖链接**和**原视频链接**，随时回看
- 📥 单条食谱导出 JSON

## 技术栈

- **前端**：React + Vite
- **后端**：Node.js + Express
- **存储**：Supabase (Postgres)
- **AI**：Anthropic Claude Opus 4.7（图文混合输入）
- **小红书抓取**：带 cookies 请求帖子页面，解析 `__INITIAL_STATE__`

## 启动（本地开发）

### 1. 准备环境变量

`backend/.env`：
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
PORT=3001
```

### 2. 准备小红书 cookies

`backend/cookies.txt`（用于后端代抓帖子）：

1. Chrome 登录 https://www.xiaohongshu.com
2. F12 打开 DevTools → Console，运行 `copy(document.cookie)`
3. 把剪贴板内容粘到 `backend/cookies.txt` 保存

> cookies 会过期（数周到数月），失效后重新导出即可。

### 3. 准备 Supabase 表

在 Supabase SQL Editor 跑：

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

### 4. 启动

```bash
# 终端 1
cd backend && npm install && npm run dev   # http://localhost:3001

# 终端 2
cd frontend && npm install && npm run dev  # http://localhost:5173
```

打开 http://localhost:5173 即可使用。

## 使用流程

1. 顶部切到 **✨ 提取食谱** → **🔗 粘贴链接**
2. 贴入小红书美食帖子链接 → 「抓取并提取食谱」
3. 等 5–15 秒 → 看到结构化食谱
4. 切到 **📚 我的食谱** 浏览所有保存过的食谱

## 项目结构

```
backend/
  server.js                    # API 路由
  lib/
    xhs.js                     # 小红书抓取（cookies + __INITIAL_STATE__）
    db.js                      # Supabase 读写封装
  scripts/
    migrate-json-to-supabase.js # 一次性迁移旧 JSON 数据
frontend/
  src/
    App.jsx                    # 主界面（提取 + 食谱库 tabs）
    api.js                     # API base URL（支持 VITE_API_URL 配置）
```

## API

| Method | Path | 说明 |
|--------|------|------|
| POST   | `/api/recipe/from-link` | `{url}` → 抓取并提取 |
| POST   | `/api/recipe/extract`   | multipart `media` 图片上传 |
| GET    | `/api/recipes`          | 食谱列表 |
| GET    | `/api/recipes/:id`      | 食谱详情 |
| DELETE | `/api/recipes/:id`      | 删除 |

## 常见问题

**Q: 报错 "cookies 可能已过期"**
重新执行步骤 2 导出 cookies。

**Q: Anthropic 报 credit balance too low**
去 https://console.anthropic.com/settings/billing 充值。

**Q: 端口 3001 被占用**
`lsof -ti:3001 | xargs kill -9`

## 致谢

小红书 `__INITIAL_STATE__` 抓取思路参考自 [chenxiachan/xhs-claude-skills](https://github.com/chenxiachan/xhs-claude-skills)（MIT）。
