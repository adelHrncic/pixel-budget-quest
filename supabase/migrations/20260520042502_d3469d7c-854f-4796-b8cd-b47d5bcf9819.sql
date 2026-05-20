CREATE TABLE public.paychecks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  allocations JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX paychecks_user_date_idx ON public.paychecks (user_id, received_at);

ALTER TABLE public.paychecks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_pc" ON public.paychecks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert_pc" ON public.paychecks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update_pc" ON public.paychecks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete_pc" ON public.paychecks FOR DELETE USING (auth.uid() = user_id);