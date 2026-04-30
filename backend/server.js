import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { fetchXhsPost } from './lib/xhs.js';
import {
  clientForUser, adminClient,
  insertRecipe, listRecipes, getRecipe, deleteRecipe, findRecipesBySource,
  listFolders, createFolder, renameFolder, deleteFolder, moveRecipe, ensureDefaultFolder,
  createInvite, readInvite, acceptInvite,
} from './lib/db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RECIPE_PROMPT = `你是一位专业的中文菜谱整理师。请仔细分析这个小红书帖子（图片 + 文字），识别其中包含的所有菜品。

**重要**：一个帖子可能包含一道菜或多道菜（合集/食谱集）。请逐一识别每一道独立的菜品。

请严格以 JSON 格式返回（不要 markdown 代码块），结构是一个数组，每个元素是一道菜：
{
  "recipes": [
    {
      "title": "菜品名称",
      "description": "简短描述",
      "servings": "份量",
      "prepTime": "准备时间",
      "cookTime": "烹饪时间",
      "imageIndex": 0,
      "ingredients": [{"name": "食材名", "amount": "用量", "notes": "备注（可选）"}],
      "steps": [{"step": 1, "description": "步骤描述", "tips": "小贴士（可选）"}],
      "tags": ["标签1", "标签2"],
      "tips": ["整体建议1"]
    }
  ]
}

**imageIndex 说明**：图片按顺序输入（从 0 开始），请为每道菜选一张最能代表它的图片，填入它的 index。如果不确定，用 0。

如果只有一道菜，数组里就只放一条。所有内容使用中文。`;

function parseRecipeJson(text) {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

const MAX_IMAGES = 6;

async function fetchImageBlock(url) {
  try {
    const r = await fetch(url, { headers: { 'Referer': 'https://www.xiaohongshu.com/' } });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mediaType = r.headers.get('content-type') || 'image/jpeg';
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') },
    };
  } catch (_) { return null; }
}

// Auth middleware: require Bearer token, attach { client, userId } to req.
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const client = clientForUser(token);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: '登录已过期，请重新登录' });
    req.userId = data.user.id;
    req.userEmail = data.user.email;
    req.client = client;
    next();
  } catch (e) {
    return res.status(401).json({ error: '认证失败：' + e.message });
  }
}

app.post('/api/recipe/from-link', requireAuth, async (req, res) => {
  const url = (req.body?.url || '').trim();
  let folderId = req.body?.folderId || null;
  if (!url) return res.status(400).json({ error: '缺少链接' });

  try {
    // Always run ensureDefaultFolder — it backfills orphan recipes into the
    // default folder, even when the client supplies an explicit folderId.
    const def = await ensureDefaultFolder(req.client, req.userId);
    if (!folderId) folderId = def.id;

    const post = await fetchXhsPost(url);

    const existing = await findRecipesBySource(req.client, post.sourceUrl, post.noteId);
    if (existing.length > 0) {
      return res.json({ success: true, recipes: existing, count: existing.length, duplicate: true });
    }

    const imageUrls = (post.images || []).slice(0, MAX_IMAGES);
    const imageBlocks = (await Promise.all(imageUrls.map(fetchImageBlock))).filter(Boolean);

    const content = [
      ...imageBlocks,
      {
        type: 'text',
        text: `${RECIPE_PROMPT}\n\n---\n帖子标题：${post.title}\n作者：${post.author}\n正文：${post.desc}\n\n共输入 ${imageBlocks.length} 张图片（index 0 到 ${imageBlocks.length - 1}）。`,
      },
    ];

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    const parsed = parseRecipeJson(message.content[0].text);
    if (!parsed) return res.status(500).json({ error: '无法解析模型返回内容' });

    const recipes = Array.isArray(parsed.recipes) && parsed.recipes.length > 0
      ? parsed.recipes
      : [parsed];

    const saved = [];
    for (const r of recipes) {
      const idx = Number.isInteger(r.imageIndex) ? r.imageIndex : 0;
      const dishImage = imageUrls[idx] || post.coverImage || null;
      const row = await insertRecipe(req.client, req.userId, {
        ...r,
        folderId,
        sourceUrl: post.sourceUrl,
        videoUrl: post.videoUrl,
        coverImage: dishImage,
        author: post.author,
      });
      saved.push(row);
    }

    res.json({ success: true, recipes: saved, count: saved.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes', requireAuth, async (req, res) => {
  try {
    res.json({ recipes: await listRecipes(req.client, req.query.folder || null) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    let folders = await listFolders(req.client, req.userId);
    if (folders.length === 0) {
      const def = await ensureDefaultFolder(req.client, req.userId);
      folders = [def];
    }
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folders/:id/invite', requireAuth, async (req, res) => {
  try {
    const role = req.body?.role === 'viewer' ? 'viewer' : 'editor';
    const ttlDays = Number.isFinite(+req.body?.ttlDays) ? +req.body.ttlDays : 7;
    const invite = await createInvite(req.client, req.userId, req.params.id, role, ttlDays);
    res.json({ invite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public invite preview (so unlogged users can see what they're accepting).
app.get('/api/invites/:token', async (req, res) => {
  try {
    const invite = await readInvite(adminClient(), req.params.token);
    if (!invite) return res.status(404).json({ error: '邀请不存在' });
    if (invite.expired) return res.status(410).json({ error: '邀请已过期' });
    res.json({ invite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invites/:token/accept', requireAuth, async (req, res) => {
  try {
    const result = await acceptInvite(adminClient(), req.userId, req.params.token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/folders', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: '缺少文件夹名称' });
  try {
    res.json({ folder: await createFolder(req.client, req.userId, name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/folders/:id', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: '缺少新名称' });
  try {
    const folder = await renameFolder(req.client, req.params.id, name);
    if (!folder) return res.status(404).json({ error: '未找到' });
    res.json({ folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/folders/:id', requireAuth, async (req, res) => {
  try {
    const ok = await deleteFolder(req.client, req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/recipes/:id/folder', requireAuth, async (req, res) => {
  try {
    const updated = await moveRecipe(req.client, req.params.id, req.body?.folderId || null);
    if (!updated) return res.status(404).json({ error: '未找到' });
    res.json({ recipe: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes/:id', requireAuth, async (req, res) => {
  try {
    const recipe = await getRecipe(req.client, req.params.id);
    if (!recipe) return res.status(404).json({ error: '未找到' });
    res.json({ recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', requireAuth, async (req, res) => {
  try {
    const ok = await deleteRecipe(req.client, req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.userId, email: req.userEmail });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Recipe API running on http://localhost:${PORT}`));
