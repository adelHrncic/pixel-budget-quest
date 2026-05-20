CREATE TABLE public.budgets (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  income NUMERIC NOT NULL DEFAULT 75000,
  hysa_pct NUMERIC NOT NULL DEFAULT 10,
  k401_pct NUMERIC NOT NULL DEFAULT 10,
  roth_pct NUMERIC NOT NULL DEFAULT 5,
  student_loan NUMERIC NOT NULL DEFAULT 4800,
  pocket JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.budgets FOR DELETE USING (auth.uid() = user_id);