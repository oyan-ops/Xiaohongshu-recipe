import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fetchXhsPost } from './lib/xhs.js';
import { insertRecipe, listRecipes, getRecipe, deleteRecipe } from './lib/db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RECIPE_PROMPT = `你是一位专业的中文菜谱整理师。请仔细分析这张小红书美食图片，识别其中的菜品并提取完整食谱信息。

请严格以 JSON 格式返回，不要包含任何其他文字或 markdown 代码块标记，结构如下：
{
  "title": "菜品名称",
  "description": "简短描述",
  "servings": "份量（如：2人份）",
  "prepTime": "准备时间",
  "cookTime": "烹饪时间",
  "ingredients": [
    {"name": "食材名", "amount": "用量", "notes": "备注（可选）"}
  ],
  "steps": [
    {"step": 1, "description": "步骤描述", "tips": "小贴士（可选）"}
  ],
  "tags": ["标签1", "标签2"],
  "tips": ["整体建议1", "建议2"]
}

如果图片中信息不完整，请根据菜品常识合理补充。所有内容使用中文。`;

function parseRecipeJson(text) {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[0]);
}

app.post('/api/recipe/extract', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });

  const filePath = req.file.path;
  try {
    const mimeType = req.file.mimetype;

    if (mimeType.startsWith('video/')) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: '视频暂不支持直接识别，请上传截图或关键帧图片',
      });
    }

    if (!mimeType.startsWith('image/')) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: '仅支持图片文件' });
    }

    const imageData = fs.readFileSync(filePath).toString('base64');

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
            { type: 'text', text: RECIPE_PROMPT },
          ],
        },
      ],
    });

    fs.unlinkSync(filePath);

    const parsed = parseRecipeJson(message.content[0].text);
    if (!parsed) return res.status(500).json({ error: '无法解析模型返回内容' });

    parsed.sourceUrl = (req.body.sourceUrl || '').trim() || null;
    const saved = await insertRecipe(parsed);
    res.json({ success: true, recipe: saved });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipe/from-link', async (req, res) => {
  const url = (req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: '缺少链接' });

  try {
    const post = await fetchXhsPost(url);

    const content = [];
    if (post.coverImage) {
      try {
        const imgResp = await fetch(post.coverImage, {
          headers: { 'Referer': 'https://www.xiaohongshu.com/' },
        });
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          const mediaType = imgResp.headers.get('content-type') || 'image/jpeg';
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') },
          });
        }
      } catch (_) { /* 封面图拿不到就靠文字 */ }
    }

    content.push({
      type: 'text',
      text: `${RECIPE_PROMPT}\n\n---\n帖子标题：${post.title}\n作者：${post.author}\n正文：${post.desc}`,
    });

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    });

    const parsed = parseRecipeJson(message.content[0].text);
    if (!parsed) return res.status(500).json({ error: '无法解析模型返回内容' });

    parsed.sourceUrl = post.sourceUrl;
    parsed.videoUrl = post.videoUrl;
    parsed.coverImage = post.coverImage;
    parsed.author = post.author;

    const saved = await insertRecipe(parsed);
    res.json({ success: true, recipe: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes', async (_req, res) => {
  try {
    res.json({ recipes: await listRecipes() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recipes/:id', async (req, res) => {
  try {
    const recipe = await getRecipe(req.params.id);
    if (!recipe) return res.status(404).json({ error: '未找到' });
    res.json({ recipe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const ok = await deleteRecipe(req.params.id);
    if (!ok) return res.status(404).json({ error: '未找到' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Recipe API running on http://localhost:${PORT}`));
