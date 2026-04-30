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
  folder_id: recipe.folderId || null,
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
  folderId: row.folder_id,
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

export async function listRecipes(client, folderId) {
  let q = client
    .from('recipes')
    .select('id,folder_id,title,description,tags,source_url,cover_image,prep_time,cook_time,servings,extracted_at')
    .order('extracted_at', { ascending: false });
  if (folderId) q = q.eq('folder_id', folderId);
  const { data, error } = await q;
  if (error) throw new Error('读取失败：' + error.message);
  return (data || []).map((r) => ({
    id: r.id,
    folderId: r.folder_id,
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

export async function listFolders(client) {
  const { data, error } = await client
    .from('folders')
    .select('id,name,created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error('读取文件夹失败：' + error.message);
  return (data || []).map((f) => ({ id: f.id, name: f.name, createdAt: f.created_at }));
}

export async function createFolder(client, userId, name) {
  const { data, error } = await client
    .from('folders')
    .insert({ owner_id: userId, name })
    .select()
    .single();
  if (error) throw new Error('创建文件夹失败：' + error.message);
  return { id: data.id, name: data.name, createdAt: data.created_at };
}

export async function renameFolder(client, id, name) {
  const { data, error } = await client
    .from('folders')
    .update({ name })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error('改名失败：' + error.message);
  return data ? { id: data.id, name: data.name, createdAt: data.created_at } : null;
}

export async function deleteFolder(client, id) {
  const { error, count } = await client
    .from('folders')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new Error('删除文件夹失败：' + error.message);
  return count > 0;
}

export async function moveRecipe(client, recipeId, folderId) {
  const { data, error } = await client
    .from('recipes')
    .update({ folder_id: folderId || null })
    .eq('id', recipeId)
    .select()
    .maybeSingle();
  if (error) throw new Error('移动失败：' + error.message);
  return data ? fromRow(data) : null;
}

export async function ensureDefaultFolder(client, userId) {
  const folders = await listFolders(client);
  if (folders.length > 0) return folders[0];
  return createFolder(client, userId, '我的食谱');
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
