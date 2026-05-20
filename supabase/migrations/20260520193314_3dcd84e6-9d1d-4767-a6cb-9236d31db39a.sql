CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  current_amount NUMERIC NOT NULL DEFAULT 0,
  deadline DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_select_goals" ON public.goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert_goals" ON public.goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update_goals" ON public.goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete_goals" ON public.goals FOR DELETE USING (auth.uid() = user_id);