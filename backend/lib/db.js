import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

const toRow = (recipe) => ({
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

export async function insertRecipe(recipe) {
  const { data, error } = await supabase
    .from('recipes')
    .insert(toRow(recipe))
    .select()
    .single();
  if (error) throw new Error('保存失败：' + error.message);
  return fromRow(data);
}

export async function listRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('id,title,description,tags,source_url,cover_image,prep_time,cook_time,servings,extracted_at')
    .order('extracted_at', { ascending: false });
  if (error) throw new Error('读取失败：' + error.message);
  return data.map((r) => ({
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

export async function getRecipe(id) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('读取失败：' + error.message);
  return data ? fromRow(data) : null;
}

export async function findRecipesBySource(sourceUrl, noteId) {
  const ors = [];
  if (sourceUrl) ors.push(`source_url.eq.${sourceUrl}`);
  if (noteId) ors.push(`source_url.ilike.%${noteId}%`);
  if (ors.length === 0) return [];
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .or(ors.join(','))
    .order('extracted_at', { ascending: false });
  if (error) throw new Error('查重失败：' + error.message);
  return (data || []).map(fromRow);
}

export async function deleteRecipe(id) {
  const { error, count } = await supabase
    .from('recipes')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw new Error('删除失败：' + error.message);
  return count > 0;
}
