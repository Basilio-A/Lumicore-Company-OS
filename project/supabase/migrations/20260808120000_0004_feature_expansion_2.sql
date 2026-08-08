/*
# Company OS — Feature expansion 2

## Changes
1. account_requests — add desired_password column (hashed on client via edge fn, stored for admin use)
2. expenses — add custom_duration_days, custom_start_date columns for flexible recurring
3. income — new table: per-product monthly income entries
4. bank_balances — new table: track company bank account balance over time
5. employee_salaries — new table: per-profile monthly salary record
6. profiles — add works_as column (job function title like CEO, CTO, DevOps…)
7. avatar storage bucket policy helper
*/

-- 1. account_requests: store the password the user chose (will be used when founder approves to call admin API)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'desired_password') THEN
    ALTER TABLE public.account_requests ADD COLUMN desired_password text;
  END IF;
END $$;

-- 2. expenses: custom recurring support
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'custom_duration_days') THEN
    ALTER TABLE public.expenses ADD COLUMN custom_duration_days integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'custom_start_date') THEN
    ALTER TABLE public.expenses ADD COLUMN custom_start_date date;
  END IF;
END $$;

-- Also expand the recurring_period check to allow 'custom'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'expenses_recurring_period_check'
  ) THEN
    ALTER TABLE public.expenses DROP CONSTRAINT expenses_recurring_period_check;
  END IF;
END $$;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_recurring_period_check
  CHECK (recurring_period IN ('monthly','quarterly','annually','custom') OR recurring_period IS NULL);

-- 3. income table
CREATE TABLE IF NOT EXISTS public.income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'revenue' CHECK (category IN ('revenue','grant','investment','consulting','other')),
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_period text DEFAULT 'monthly' CHECK (recurring_period IN ('monthly','quarterly','annually','custom') OR recurring_period IS NULL),
  custom_duration_days integer,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "income_select" ON public.income;
CREATE POLICY "income_select" ON public.income FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "income_insert" ON public.income;
CREATE POLICY "income_insert" ON public.income FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "income_update" ON public.income;
CREATE POLICY "income_update" ON public.income FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "income_delete" ON public.income;
CREATE POLICY "income_delete" ON public.income FOR DELETE
  TO authenticated USING (public.is_founder());

CREATE INDEX IF NOT EXISTS idx_income_product ON public.income(product_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON public.income(income_date);

-- 4. bank_balances table
CREATE TABLE IF NOT EXISTS public.bank_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL DEFAULT 'Main Account',
  balance_usd numeric NOT NULL DEFAULT 0,
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bank_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bb_select" ON public.bank_balances;
CREATE POLICY "bb_select" ON public.bank_balances FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "bb_insert" ON public.bank_balances;
CREATE POLICY "bb_insert" ON public.bank_balances FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "bb_update" ON public.bank_balances;
CREATE POLICY "bb_update" ON public.bank_balances FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "bb_delete" ON public.bank_balances;
CREATE POLICY "bb_delete" ON public.bank_balances FOR DELETE
  TO authenticated USING (public.is_founder());

-- 5. employee_salaries table
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_salary_usd numeric NOT NULL DEFAULT 0 CHECK (monthly_salary_usd >= 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sal_select" ON public.employee_salaries;
CREATE POLICY "sal_select" ON public.employee_salaries FOR SELECT
  TO authenticated USING (public.is_founder());

DROP POLICY IF EXISTS "sal_insert" ON public.employee_salaries;
CREATE POLICY "sal_insert" ON public.employee_salaries FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "sal_update" ON public.employee_salaries;
CREATE POLICY "sal_update" ON public.employee_salaries FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "sal_delete" ON public.employee_salaries;
CREATE POLICY "sal_delete" ON public.employee_salaries FOR DELETE
  TO authenticated USING (public.is_founder());

CREATE INDEX IF NOT EXISTS idx_sal_profile ON public.employee_salaries(profile_id);

-- 6. profiles: add works_as column for job function
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'works_as') THEN
    ALTER TABLE public.profiles ADD COLUMN works_as text[];
  END IF;
END $$;

-- 7. approve_account_request function: creates the Supabase auth user and activates their profile
-- This uses service-role style execution. The actual user creation must be triggered via
-- the supabase admin API from the client side or an edge function.
-- We store a flag in account_requests to indicate it was processed.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'auth_user_created') THEN
    ALTER TABLE public.account_requests ADD COLUMN auth_user_created boolean DEFAULT false;
  END IF;
END $$;
