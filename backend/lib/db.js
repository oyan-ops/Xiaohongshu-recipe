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

export async function listFolders(client, userId) {
  const { data, error } = await client
    .from('folders')
    .select('id,name,owner_id,created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error('读取文件夹失败：' + error.message);
  const folders = data || [];
  const ids = folders.map((f) => f.id);
  let memberCounts = {};
  if (ids.length > 0) {
    const { data: members } = await client
      .from('folder_members')
      .select('folder_id')
      .in('folder_id', ids);
    for (const m of members || []) {
      memberCounts[m.folder_id] = (memberCounts[m.folder_id] || 0) + 1;
    }
  }
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    createdAt: f.created_at,
    isOwner: f.owner_id === userId,
    memberCount: memberCounts[f.id] || 0,
  }));
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
  const folders = await listFolders(client, userId);
  const owned = folders.find((f) => f.isOwner);
  if (owned) return owned;
  return createFolder(client, userId, '我的食谱');
}

export async function createInvite(client, userId, folderId, role, ttlDays) {
  const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) +
    Math.random().toString(36).slice(2);
  const expires_at = ttlDays > 0
    ? new Date(Date.now() + ttlDays * 86400000).toISOString()
    : null;
  const { data, error } = await client
    .from('folder_invites')
    .insert({ token, folder_id: folderId, role, created_by: userId, expires_at })
    .select()
    .single();
  if (error) throw new Error('创建邀请失败：' + error.message);
  return { token: data.token, role: data.role, expiresAt: data.expires_at };
}

// Look up invite without RLS — needs service-role client (caller passes adminClient).
export async function readInvite(adminClient, token) {
  const { data, error } = await adminClient
    .from('folder_invites')
    .select('token, folder_id, role, expires_at, created_by, folders(name, owner_id)')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error('读取邀请失败：' + error.message);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { expired: true };
  return {
    token: data.token,
    folderId: data.folder_id,
    folderName: data.folders?.name || null,
    ownerId: data.folders?.owner_id || null,
    role: data.role,
    expiresAt: data.expires_at,
  };
}

export async function acceptInvite(adminClient, userId, token) {
  const invite = await readInvite(adminClient, token);
  if (!invite || invite.expired) throw new Error('邀请链接已失效');
  if (invite.ownerId === userId) return { folderId: invite.folderId, alreadyOwner: true };
  const { error } = await adminClient
    .from('folder_members')
    .upsert({ folder_id: invite.folderId, user_id: userId, role: invite.role }, { onConflict: 'folder_id,user_id' });
  if (error) throw new Error('加入失败：' + error.message);
  return { folderId: invite.folderId, folderName: invite.folderName };
}

export function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
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
  // PostgREST .or() 对包含 :/?,& 等特殊字符的 URL 处理不好,改成两次独立查询合并去重。
  const collected = new Map();
  if (noteId) {
    const { data, error } = await client
      .from('recipes')
      .select('*')
      .ilike('source_url', `%${noteId}%`)
      .order('extracted_at', { ascending: false });
    if (error) throw new Error('查重失败：' + error.message);
    for (const r of data || []) collected.set(r.id, r);
  }
  if (sourceUrl) {
    const { data, error } = await client
      .from('recipes')
      .select('*')
      .eq('source_url', sourceUrl)
      .order('extracted_at', { ascending: false });
    if (error) throw new Error('查重失败：' + error.message);
    for (const r of data || []) collected.set(r.id, r);
  }
  return Array.from(collected.values()).map(fromRow);
}
