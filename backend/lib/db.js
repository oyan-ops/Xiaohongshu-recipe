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
  difficulty: Number.isInteger(recipe.difficulty) ? recipe.difficulty : null,
  effort_minutes: Number.isInteger(recipe.effortMinutes) ? recipe.effortMinutes : null,
});

const fromRow = (row) => ({
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

export async function insertRecipe(client, userId, recipe) {
  const { data, error } = await client.from('recipes').insert(toRow(recipe, userId)).select().single();
  if (error) throw new Error('保存失败：' + error.message);
  return fromRow(data);
}

export async function listRecipes(client, folderId) {
  let q = client
    .from('recipes')
    .select('id,folder_id,user_id,title,description,tags,source_url,cover_image,prep_time,cook_time,servings,extracted_at')
    .order('extracted_at', { ascending: false });
  if (folderId) q = q.eq('folder_id', folderId);
  const { data, error } = await q;
  if (error) throw new Error('读取失败：' + error.message);
  return (data || []).map((r) => ({
    id: r.id,
    folderId: r.folder_id,
    userId: r.user_id,
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

export async function getFolderMembers(adminCli, folderId) {
  const { data: folder, error: fErr } = await adminCli
    .from('folders')
    .select('id, name, owner_id')
    .eq('id', folderId)
    .maybeSingle();
  if (fErr || !folder) throw new Error('文件夹不存在');
  const { data: members, error: mErr } = await adminCli
    .from('folder_members')
    .select('user_id, role, joined_at')
    .eq('folder_id', folderId);
  if (mErr) throw new Error('读取成员失败：' + mErr.message);
  const userIds = Array.from(new Set([folder.owner_id, ...(members || []).map((m) => m.user_id)]));
  const profiles = await getUserProfiles(adminCli, userIds);
  const byId = (id) => profiles[id] || { email: null, name: null };
  return {
    folder: { id: folder.id, name: folder.name, ownerId: folder.owner_id },
    owner: { userId: folder.owner_id, ...byId(folder.owner_id) },
    members: (members || []).map((m) => ({
      userId: m.user_id,
      role: m.role,
      joinedAt: m.joined_at,
      ...byId(m.user_id),
    })),
  };
}

export async function getUserProfiles(adminCli, userIds) {
  if (!userIds || userIds.length === 0) return {};
  const out = {};
  for (const id of userIds) {
    if (!id) continue;
    try {
      const { data, error } = await adminCli.auth.admin.getUserById(id);
      if (!error && data?.user) {
        out[id] = {
          email: data.user.email || null,
          name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || null,
        };
      }
    } catch (_) { /* skip */ }
  }
  return out;
}

export async function removeFolderMember(adminCli, folderId, userId) {
  const { error, count } = await adminCli
    .from('folder_members')
    .delete({ count: 'exact' })
    .eq('folder_id', folderId)
    .eq('user_id', userId);
  if (error) throw new Error('移除失败：' + error.message);
  return count > 0;
}

export async function listFolders(client, userId) {
  const { data, error } = await client
    .from('folders')
    .select('id,name,owner_id,created_at,position')
    .order('position', { ascending: true })
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
    position: f.position ?? 0,
    isOwner: f.owner_id === userId,
    memberCount: memberCounts[f.id] || 0,
  }));
}

export async function reorderFolders(client, userId, orderedIds) {
  const updates = orderedIds.map((id, idx) =>
    client.from('folders').update({ position: idx }).eq('id', id).eq('owner_id', userId)
  );
  const results = await Promise.all(updates);
  for (const r of results) if (r.error) throw new Error('排序失败：' + r.error.message);
  return true;
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

export async function updateRecipeTitle(client, recipeId, title) {
  const { data, error } = await client
    .from('recipes')
    .update({ title: title || null })
    .eq('id', recipeId)
    .select()
    .maybeSingle();
  if (error) throw new Error('更新失败：' + error.message);
  return data ? fromRow(data) : null;
}

export async function listAllRecipeIdsAndCovers(client) {
  const { data, error } = await client
    .from('recipes')
    .select('id, cover_image, source_url');
  if (error) throw new Error('读取失败：' + error.message);
  return data || [];
}

export async function updateRecipeCover(client, recipeId, coverImage) {
  const { error } = await client
    .from('recipes')
    .update({ cover_image: coverImage })
    .eq('id', recipeId);
  if (error) throw new Error('更新封面失败：' + error.message);
}

export async function ensureDefaultFolder(client, userId) {
  const folders = await listFolders(client, userId);
  let owned = folders.find((f) => f.isOwner);
  if (!owned) owned = await createFolder(client, userId, '我的食谱');
  // Backfill orphan recipes (folder_id NULL, e.g. created before folders existed)
  // into the default folder. RLS limits this to the calling user's own rows.
  await client.from('recipes').update({ folder_id: owned.id }).is('folder_id', null);
  return owned;
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

export async function listPlans(client, fromDate, toDate) {
  let q = client
    .from('meal_plans')
    .select('id, plan_date, cooked, recipe_id, meal_type, recipes(id, title, description, cover_image, prep_time, cook_time, servings, ingredients, difficulty, effort_minutes)')
    .order('plan_date', { ascending: true });
  if (fromDate) q = q.gte('plan_date', fromDate);
  if (toDate) q = q.lte('plan_date', toDate);
  const { data, error } = await q;
  if (error) throw new Error('读取计划失败：' + error.message);
  return (data || []).map((p) => ({
    id: p.id,
    date: p.plan_date,
    cooked: !!p.cooked,
    recipeId: p.recipe_id,
    mealType: p.meal_type || 'dinner',
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
  }));
}

export async function updatePlanCooked(client, id, cooked) {
  const { data, error } = await client
    .from('meal_plans')
    .update({ cooked })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error('更新失败：' + error.message);
  return data ? { id: data.id, cooked: !!data.cooked } : null;
}

export async function createPlan(client, userId, recipeId, date, mealType = 'dinner') {
  const { data, error } = await client
    .from('meal_plans')
    .insert({ user_id: userId, recipe_id: recipeId, plan_date: date, meal_type: mealType })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return null; // 已存在(unique 约束)
    throw new Error('加入计划失败：' + error.message);
  }
  return { id: data.id, date: data.plan_date, recipeId: data.recipe_id, mealType: data.meal_type };
}

export async function deletePlan(client, id) {
  const { error, count } = await client
    .from('meal_plans')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new Error('删除计划失败：' + error.message);
  return count > 0;
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

export async function createPlanInvite(client, userId, role, ttlDays, dates) {
  const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) +
    Math.random().toString(36).slice(2);
  const expires_at = ttlDays > 0
    ? new Date(Date.now() + ttlDays * 86400000).toISOString()
    : null;
  const { data, error } = await client
    .from('plan_invites')
    .insert({ token, owner_id: userId, role, created_by: userId, expires_at, dates: dates || null })
    .select()
    .single();
  if (error) throw new Error('创建邀请失败：' + error.message);
  return { token: data.token, role: data.role, expiresAt: data.expires_at, dates: data.dates };
}

export async function readPlanInvite(adminClient, token) {
  const { data, error } = await adminClient
    .from('plan_invites')
    .select('token, owner_id, role, expires_at, dates')
    .eq('token', token)
    .maybeSingle();
  if (error) throw new Error('读取邀请失败：' + error.message);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { expired: true };
  const ownerProfile = await getUserProfiles(adminClient, [data.owner_id]);
  const owner = ownerProfile[data.owner_id] || { email: null, name: null };
  return {
    token: data.token,
    ownerId: data.owner_id,
    ownerName: owner.name,
    ownerEmail: owner.email,
    role: data.role,
    expiresAt: data.expires_at,
    dates: data.dates,
  };
}

export async function acceptPlanInvite(adminClient, userId, token) {
  const invite = await readPlanInvite(adminClient, token);
  if (!invite || invite.expired) throw new Error('邀请链接已失效');
  if (invite.ownerId === userId) return { ownerId: invite.ownerId, alreadyOwner: true };
  const { error } = await adminClient
    .from('plan_members')
    .upsert({ owner_id: invite.ownerId, user_id: userId, role: invite.role }, { onConflict: 'owner_id,user_id' });
  if (error) throw new Error('加入失败：' + error.message);
  return { ownerId: invite.ownerId, ownerName: invite.ownerName };
}

export async function listPlanMembers(adminClient, ownerId) {
  const { data: members, error } = await adminClient
    .from('plan_members')
    .select('user_id, role, joined_at')
    .eq('owner_id', ownerId);
  if (error) throw new Error('读取成员失败：' + error.message);
  const userIds = (members || []).map((m) => m.user_id);
  const profiles = await getUserProfiles(adminClient, userIds);
  return (members || []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    ...profiles[m.user_id] || { email: null, name: null },
  }));
}

export async function removePlanMember(adminClient, ownerId, userId) {
  const { error, count } = await adminClient
    .from('plan_members')
    .delete({ count: 'exact' })
    .eq('owner_id', ownerId)
    .eq('user_id', userId);
  if (error) throw new Error('移除失败：' + error.message);
  return count > 0;
}

export async function listSharedOwners(adminClient, userId) {
  const { data, error } = await adminClient
    .from('plan_members')
    .select('owner_id')
    .eq('user_id', userId);
  if (error) throw new Error('读取共享计划失败：' + error.message);
  return (data || []).map((m) => m.owner_id);
}

