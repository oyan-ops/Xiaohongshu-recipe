-- 按 (user, date, meal_type) 记录当天实际做的人份数，用于更精准估算做饭强度。
CREATE TABLE IF NOT EXISTS public.meal_servings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  meal_type text NOT NULL,
  servings numeric NOT NULL CHECK (servings > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_date, meal_type)
);

ALTER TABLE public.meal_servings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_servings_own_select" ON public.meal_servings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "meal_servings_own_insert" ON public.meal_servings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meal_servings_own_update" ON public.meal_servings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "meal_servings_own_delete" ON public.meal_servings
  FOR DELETE USING (auth.uid() = user_id);
