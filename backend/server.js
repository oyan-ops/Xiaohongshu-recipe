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
  getFolderMembers, removeFolderMember, getUserProfiles,
  listPlans, createPlan, deletePlan, updatePlanCooked,
  createPlanInvite, readPlanInvite, acceptPlanInvite, listPlanMembers, removePlanMember, listSharedOwners,
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
      "difficulty": 3,
      "effortMinutes": 30,
      "ingredients": [{"name": "食材名", "amount": "用量", "notes": "备注（可选）"}],
      "steps": [{"step": 1, "description": "步骤描述", "tips": "小贴士（可选）"}],
      "tags": ["标签1", "标签2"],
      "tips": ["整体建议1"]
    }
  ]
}

**imageIndex 说明**：图片按顺序输入（从 0 开始），请为每道菜选一张最能代表它的图片，填入它的 index。如果不确定，用 0。

**difficulty（1-5 整数）**：实际操作难度。1=零基础(冲泡/凉拌)，2=简单家常，3=中等(需要掌握火候/手法)，4=有挑战(发酵/精确控温)，5=很难(高级技法)。考虑刀工、火候、调味的精细度，**忽略时间长短**(发酵慢但不难)。

**effortMinutes（整数,分钟）**：实际需要人手操作的总分钟数(不算等待/发酵/烤箱里的时间)。比如"和面静置 1 小时"实际人手只需 5 分钟,effortMinutes=5。这是估"占人时间"的指标,跟 cookTime 不一样。

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

app.get('/api/folders/:id/members', requireAuth, async (req, res) => {
  try {
    // Verify caller can access this folder (RLS-scoped client check).
    const { data: f } = await req.client.from('folders').select('id').eq('id', req.params.id).maybeSingle();
    if (!f) return res.status(404).json({ error: '未找到或无权限' });
    const result = await getFolderMembers(adminClient(), req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/folders/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    // Only the owner may remove members.
    const { data: f } = await req.client
      .from('folders')
      .select('owner_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!f || f.owner_id !== req.userId) return res.status(403).json({ error: '只有文件夹拥有者可以移除成员' });
    const ok = await removeFolderMember(adminClient(), req.params.id, req.params.userId);
    if (!ok) return res.status(404).json({ error: '该成员不存在' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/lookup', requireAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (ids.length === 0) return res.json({ users: {} });
    const users = await getUserProfiles(adminClient(), ids);
    res.json({ users });
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

app.patch('/api/recipes/batch/move', requireAuth, async (req, res) => {
  try {
    const { ids, folderId } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '至少选择一条食谱' });
    const results = await Promise.all(ids.map(id => moveRecipe(req.client, id, folderId || null)));
    res.json({ moved: results.filter(r => r).length });
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

app.get('/api/plans', requireAuth, async (req, res) => {
  try {
    const fromDate = req.query.from || null;
    const toDate = req.query.to || null;

    // 查询用户自己的计划
    const ownPlans = await listPlans(req.client, fromDate, toDate);
    const plansWithOwner = ownPlans.map(p => ({ ...p, ownerId: req.userId }));

    // 查询用户作为成员能访问的其他owner的计划
    const admin = adminClient();
    const sharedOwnerIds = await listSharedOwners(admin, req.userId);
    let allPlans = plansWithOwner;

    for (const ownerId of sharedOwnerIds) {
      let q = admin
        .from('meal_plans')
        .select('id, plan_date, cooked, recipe_id, recipes(id, title, description, cover_image, prep_time, cook_time, servings, ingredients, difficulty, effort_minutes)')
        .eq('user_id', ownerId)
        .order('plan_date', { ascending: true });
      if (fromDate) q = q.gte('plan_date', fromDate);
      if (toDate) q = q.lte('plan_date', toDate);
      const { data, error } = await q;

      if (!error && data) {
        const ownerPlans = (data || []).map((p) => ({
          id: p.id,
          date: p.plan_date,
          cooked: !!p.cooked,
          recipeId: p.recipe_id,
          recipe: p.recipes ? {
            id: p.recipes.id,
            title: p.recipes.title,
            description: p.recipes.description,
            coverImage: p.recipes.cover_image,
            prepTime: p.recipes.prep_time,
            cookTime: p.recipes.cook_time,
            servings: p.recipes.servings,
            ingredients: p.recipes.ingredients || [],
            difficulty: p.recipes.difficulty,
            effortMinutes: p.recipes.effort_minutes,
          } : null,
          ownerId,
        }));
        allPlans = allPlans.concat(ownerPlans);
      }
    }

    res.json({ plans: allPlans });
    // 后台异步评估未评分的菜谱，不阻塞用户请求
    (async () => {
      try {
        const { data, error } = await req.client.from('recipes').select('*').is('difficulty', null);
        if (error || !data) return;
        for (const row of data) {
          try {
            const score = await evaluateRecipe({
              title: row.title,
              ingredients: row.ingredients,
              steps: row.steps,
              cookTime: row.cook_time,
              prepTime: row.prep_time,
            });
            if (!score) continue;
            await req.client.from('recipes')
              .update({ difficulty: score.difficulty, effort_minutes: score.effortMinutes })
              .eq('id', row.id);
          } catch (_) {}
        }
      } catch (_) {}
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans', requireAuth, async (req, res) => {
  const recipeId = req.body?.recipeId;
  const date = req.body?.date;
  if (!recipeId || !date) return res.status(400).json({ error: '缺少 recipeId 或 date' });
  try {
    const plan = await createPlan(req.client, req.userId, recipeId, date);
    res.json({ plan, duplicate: !plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/plans/:id', requireAuth, async (req, res) => {
  try {
    const cooked = !!req.body?.cooked;
    const plan = await updatePlanCooked(req.client, req.params.id, cooked);
    if (!plan) return res.status(404).json({ error: '未找到' });
    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plans/invite', requireAuth, async (req, res) => {
  try {
    const role = req.body?.role === 'viewer' ? 'viewer' : 'editor';
    const ttlDays = Number.isFinite(+req.body?.ttlDays) ? +req.body.ttlDays : 7;
    const invite = await createPlanInvite(req.client, req.userId, role, ttlDays);
    res.json({ invite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/plan-invites/:token', async (req, res) => {
  try {
    const invite = await readPlanInvite(adminClient(), req.params.token);
    if (!invite) return res.status(404).json({ error: '邀请不存在' });
    if (invite.expired) return res.status(410).json({ error: '邀请已过期' });
    res.json({ invite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/plan-invites/:token/accept', requireAuth, async (req, res) => {
  try {
    const result = await acceptPlanInvite(adminClient(), req.userId, req.params.token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/plans/members', requireAuth, async (req, res) => {
  try {
    const members = await listPlanMembers(adminClient(), req.userId);
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/plans/members/:userId', requireAuth, async (req, res) => {
  try {
    const ok = await removePlanMember(adminClient(), req.userId, req.params.userId);
    if (!ok) return res.status(404).json({ error: '该成员不存在' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/plans/:id', requireAuth, async (req, res) => {
  try {
    const ok = await deletePlan(req.client, req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const EVAL_PROMPT = `下面是一道菜的食材和步骤,请严格输出 JSON(不要 markdown):
{"difficulty": 1-5 整数, "effortMinutes": 整数}

difficulty 评分标准：1=零基础(冲泡/凉拌), 2=简单家常, 3=中等(掌握火候/手法), 4=有挑战(发酵/精确控温), 5=很难(高级技法)。考虑刀工/火候/调味,**忽略时间长短**(发酵慢但不难)。

effortMinutes：实际人手操作的总分钟数(不算等待/发酵/烤箱里的时间)。`;

async function evaluateRecipe(recipe) {
  const text = `菜名:${recipe.title || '?'}
食材:
${(recipe.ingredients || []).map(i => `- ${i.name} ${i.amount || ''} ${i.notes || ''}`).join('\n')}
步骤:
${(recipe.steps || []).map((s, i) => `${i + 1}. ${s.description}${s.tips ? ' [小贴士:' + s.tips + ']' : ''}`).join('\n')}
原烹饪时间:${recipe.cookTime || '未知'}, 准备:${recipe.prepTime || '未知'}`;
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 256,
    messages: [{ role: 'user', content: EVAL_PROMPT + '\n\n' + text }],
  });
  const json = parseRecipeJson(message.content[0].text);
  if (!json) return null;
  return {
    difficulty: Number.isInteger(json.difficulty) ? Math.max(1, Math.min(5, json.difficulty)) : null,
    effortMinutes: Number.isInteger(json.effortMinutes) ? Math.max(0, json.effortMinutes) : null,
  };
}

app.post('/api/recipes/:id/evaluate', requireAuth, async (req, res) => {
  try {
    const recipe = await getRecipe(req.client, req.params.id);
    if (!recipe) return res.status(404).json({ error: '未找到' });
    const score = await evaluateRecipe(recipe);
    if (!score) return res.status(500).json({ error: '评估失败' });
    const { error } = await req.client
      .from('recipes')
      .update({ difficulty: score.difficulty, effort_minutes: score.effortMinutes })
      .eq('id', recipe.id);
    if (error) throw new Error(error.message);
    res.json({ score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 一键评估当前用户所有未评分的菜谱(后台串行,避免速率限制)
app.post('/api/recipes/evaluate-all', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.client
      .from('recipes')
      .select('*')
      .is('difficulty', null);
    if (error) throw new Error(error.message);
    const list = data || [];
    let done = 0, failed = 0;
    for (const row of list) {
      try {
        const score = await evaluateRecipe({
          title: row.title,
          ingredients: row.ingredients,
          steps: row.steps,
          cookTime: row.cook_time,
          prepTime: row.prep_time,
        });
        if (!score) { failed++; continue; }
        await req.client
          .from('recipes')
          .update({ difficulty: score.difficulty, effort_minutes: score.effortMinutes })
          .eq('id', row.id);
        done++;
      } catch (_) { failed++; }
    }
    res.json({ total: list.length, done, failed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ id: req.userId, email: req.userEmail });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Recipe API running on http://localhost:${PORT}`));
