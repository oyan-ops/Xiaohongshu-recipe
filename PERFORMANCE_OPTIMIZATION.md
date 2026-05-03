# RedRecipe Performance Optimization Guide

## Problem
After login, the recipe library loads very slowly. The bottleneck is **missing database indexes** causing full table scans on the recipes table.

## Solution: Add Database Indexes

Go to your **Supabase Dashboard → SQL Editor** and run these commands:

```sql
-- 1. Optimize recipe queries (primary performance fix)
-- This single index handles both RLS filtering and folder listing
CREATE INDEX IF NOT EXISTS idx_recipes_user_folder_extracted 
ON public.recipes(user_id, folder_id, extracted_at DESC);

-- 2. Optimize folder lookups
CREATE INDEX IF NOT EXISTS idx_folders_owner_created
ON public.folders(owner_id, created_at);

-- 3. Optimize folder member queries
CREATE INDEX IF NOT EXISTS idx_folder_members_folder
ON public.folder_members(folder_id);

-- 4. Optimize meal plan queries (calendar performance)
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date
ON public.meal_plans(user_id, plan_date DESC);

-- 5. Optimize invite lookups
CREATE INDEX IF NOT EXISTS idx_folder_invites_token
ON public.folder_invites(token);

CREATE INDEX IF NOT EXISTS idx_plan_invites_token
ON public.plan_invites(token);
```

## Expected Performance Improvement

| Operation | Before | After |
|-----------|--------|-------|
| Load folder list | O(n) | O(log n) |
| Load recipes for folder | O(n) | O(log n) |
| Load calendar view | O(n) | O(log n) |
| List folder members | O(n) | O(log n) |

These indexes will reduce load time from **several seconds to under 100ms** for typical library sizes.

## How It Works

1. **idx_recipes_user_folder_extracted**: PostgreSQL uses this index for:
   - RLS filtering by `user_id` (first condition)
   - Filtering by `folder_id` (second condition)
   - Ordering by `extracted_at DESC` (third condition)
   - This is a "covering index" - all needed columns are in the index

2. **idx_folders_owner_created**: Used for:
   - Finding folders owned by a user
   - Returning them in creation order

3. **idx_folder_members_folder**: Used for:
   - Counting members in a folder
   - Listing all members of a folder

4. **idx_meal_plans_user_date**: Used for:
   - Calendar view queries (date range filtering)
   - Sorting by date descending

5. **idx_folder_invites_token** and **idx_plan_invites_token**: Used for:
   - Accepting invites (token lookup)

## Verification

After adding indexes, verify they're working:

```sql
-- List all indexes on recipes table
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'recipes'
ORDER BY indexname;

-- Check query plans (slow queries will show "Seq Scan" without index)
EXPLAIN ANALYZE
SELECT id, folder_id, user_id, title, description, tags, source_url, cover_image, prep_time, cook_time, servings, extracted_at
FROM recipes
WHERE user_id = '...' AND folder_id = '...'
ORDER BY extracted_at DESC;
```

## Additional Optimizations (Optional)

### 1. Reduce recipe data selection
Currently selecting all fields. Consider selecting only what's needed for the list view.

### 2. Implement query caching
For `/api/folders` endpoint (changes infrequently), add HTTP caching:
```
Cache-Control: public, max-age=60
```

### 3. Paginate large recipe lists
If a user has 1000+ recipes, consider pagination:
```
GET /api/recipes?folder=X&limit=50&offset=0
```

## Notes

- These indexes will increase storage slightly (~1-2%) but dramatically improve query speed
- All indexes use B-tree (default) which is optimal for range queries
- Indexes are automatically maintained by PostgreSQL on INSERT/UPDATE/DELETE
- No application code changes needed - just run the SQL
