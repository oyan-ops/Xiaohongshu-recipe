import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

// Per-request client scoped to the user's JWT — RLS filters everything by auth.uid().
export function clientForUser(accessToken) {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const toRow = (recipe, userId) => ({
  user_id: userId,
  title: recipe.title || null,
  description: recipe.description || null,
  servings: recipe.servings || null,
  prep_time: recipe.prepTime || null,
  cook_time: recipe.cookTime || null,
  ingredients: recipe.ingredients || [],
  steps: recipe.steps || [],
  tags: recipe.tags || [],
  tips: recipe.tips || [],
  source_url: recipe.sourceUrl || null,
  video_url: recipe.videoUrl || null,
  cover_image: recipe.coverImage || null,
  author: recipe.author || null,
});

const fromRow = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  servings: row.servings,
  prepTime: row.prep_time,
  cookTime: row.cook_time,
  ingredients: row.ingredients || [],
  steps: row.steps || [],
  tags: row.tags || [],
  tips: row.tips || [],
  sourceUrl: row.source_url,
  videoUrl: row.video_url,
  coverImage: row.cover_image,
  author: row.author,
  extractedAt: row.extracted_at,
});

export async function insertRecipe(client, userId, recipe) {
  const { data, error } = await client.from('recipes').insert(toRow(recipe, userId)).select().single();
  if (error) throw new Error('保存失败：' + error.message);
  return fromRow(data);
}

export async function listRecipes(client) {
  const { data, error } = await client
    .from('recipes')
    .select('id,title,description,tags,source_url,cover_image,prep_time,cook_time,servings,extracted_at')
    .order('extracted_at', { ascending: false });
  if (error) throw new Error('读取失败：' + error.message);
  return (data || []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    tags: r.tags || [],
    sourceUrl: r.source_url,
    coverImage: r.cover_image,
    prepTime: r.prep_time,
    cookTime: r.cook_time,
    servings: r.servings,
    extractedAt: r.extracted_at,
  }));
}

export async function getRecipe(client, id) {
  const { data, error } = await client.from('recipes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('读取失败：' + error.message);
  return data ? fromRow(data) : null;
}

export async function deleteRecipe(client, id) {
  const { error, count } = await client.from('recipes').delete({ count: 'exact' }).eq('id', id);
  if (error) throw new Error('删除失败：' + error.message);
  return count > 0;
}

export async function findRecipesBySource(client, sourceUrl, noteId) {
  const ors = [];
  if (sourceUrl) ors.push(`source_url.eq.${sourceUrl}`);
  if (noteId) ors.push(`source_url.ilike.%${noteId}%`);
  if (ors.length === 0) return [];
  const { data, error } = await client
    .from('recipes')
    .select('*')
    .or(ors.join(','))
    .order('extracted_at', { ascending: false });
  if (error) throw new Error('查重失败：' + error.message);
  return (data || []).map(fromRow);
}
