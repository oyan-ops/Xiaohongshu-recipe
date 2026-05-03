-- Performance Optimization: Add Missing Database Indexes
-- This script adds indexes to speed up recipe list loading from seconds to under 100ms
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Primary index for recipe queries (RLS + folder filtering + ordering)
-- This is the most critical index for fast recipe library loading
CREATE INDEX IF NOT EXISTS idx_recipes_user_folder_extracted
ON public.recipes(user_id, folder_id, extracted_at DESC);

-- 2. Index for folder lookups and ownership checks
CREATE INDEX IF NOT EXISTS idx_folders_owner_created
ON public.folders(owner_id, created_at);

-- 3. Index for folder member queries
CREATE INDEX IF NOT EXISTS idx_folder_members_folder
ON public.folder_members(folder_id);

-- 4. Index for meal plan calendar queries
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_date
ON public.meal_plans(user_id, plan_date DESC);

-- 5. Index for invite token lookups
CREATE INDEX IF NOT EXISTS idx_folder_invites_token
ON public.folder_invites(token);

CREATE INDEX IF NOT EXISTS idx_plan_invites_token
ON public.plan_invites(token);

-- Verification: Check that indexes were created successfully
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'recipes'
-- ORDER BY indexname;
