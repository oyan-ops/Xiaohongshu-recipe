import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (p) => `${BASE}${p}`;

export async function authFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return fetch(apiUrl(path), { ...options, headers });
}

// ─── Direct Supabase helpers (no backend hop) ────────────────────────────────

const recipeFromRow = (row) => ({
  id: row.id,
  folderId: row.folder_id,
  userId: row.user_id,
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
  difficulty: row.difficulty,
  effortMinutes: row.effort_minutes,
  extractedAt: row.extracted_at,
});

export async function sbListFolders(userId) {
  const { data: rows, error } = await supabase
    .from('folders')
    .select('id,name,owner_id,created_at,position')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  let folders = rows || [];
  if (folders.length === 0) {
    const { data: created } = await supabase
      .from('folders')
      .insert({ owner_id: userId, name: '我的食谱' })
      .select()
      .single();
    if (created) folders = [created];
  }

  const ids = folders.map(f => f.id);
  const memberCounts = {};
  if (ids.length > 0) {
    const { data: members } = await supabase
      .from('folder_members')
      .select('folder_id')
      .in('folder_id', ids);
    for (const m of members || []) {
      memberCounts[m.folder_id] = (memberCounts[m.folder_id] || 0) + 1;
    }
  }

  return folders.map(f => ({
    id: f.id,
    name: f.name,
    createdAt: f.created_at,
    position: f.position ?? 0,
    isOwner: f.owner_id === userId,
    memberCount: memberCounts[f.id] || 0,
  }));
}

export async function sbListRecipes(folderId) {
  let q = supabase
    .from('recipes')
    .select('id,folder_id,user_id,title,description,cover_image,tags,extracted_at')
    .order('extracted_at', { ascending: false });
  if (folderId) q = q.eq('folder_id', folderId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({
    id: r.id,
    folderId: r.folder_id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    coverImage: r.cover_image,
    tags: r.tags || [],
    extractedAt: r.extracted_at,
  }));
}

export async function sbGetRecipe(id) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? recipeFromRow(data) : null;
}

export async function sbDeleteRecipe(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbUpdateRecipeTitle(id, title) {
  const { error } = await supabase.from('recipes').update({ title }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbMoveRecipe(id, folderId) {
  const { error } = await supabase
    .from('recipes')
    .update({ folder_id: folderId || null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbBatchMoveRecipes(ids, folderId) {
  const { error } = await supabase
    .from('recipes')
    .update({ folder_id: folderId || null })
    .in('id', ids);
  if (error) throw new Error(error.message);
}

export async function sbBatchDeleteRecipes(ids) {
  const { error } = await supabase.from('recipes').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function sbCreateFolder(name, userId) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ owner_id: userId, name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    position: data.position ?? 0,
    isOwner: true,
    memberCount: 0,
  };
}

export async function sbRenameFolder(id, name) {
  const { error } = await supabase.from('folders').update({ name }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbDeleteFolder(id) {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function sbReorderFolders(userId, orderedIds) {
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from('folders').update({ position: idx }).eq('id', id).eq('owner_id', userId)
    )
  );
}
