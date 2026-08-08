/*
# Company OS — Bug-fix migration 0005

## Changes
1. Add SECURITY DEFINER function admin_insert_profile so founders can add members
2. Ensure account_requests has approval_code column
3. Create income table (if not exists from 0004)
4. Create bank_balances table (if not exists from 0004)
5. Create employee_salaries table (if not exists from 0004)
6. Add cost_type + monthly_cost + per_user_cost + contract_end to tech_stack
7. Broaden chat RLS so all active users can see all channels and chat
8. Add profiles INSERT policy for founders (via SECURITY DEFINER fn)
*/

-- 1. SECURITY DEFINER function to insert a profile (bypasses RLS for founders)
CREATE OR REPLACE FUNCTION public.admin_insert_profile(
  p_email text,
  p_full_name text,
  p_title text,
  p_role text,
  p_phone text,
  p_department text,
  p_bio text,
  p_avatar_url text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can add members';
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.profiles (id, email, full_name, title, role, status, phone, department, bio, avatar_url)
  VALUES (
    v_id, p_email, p_full_name, p_title,
    CASE WHEN p_role IN ('founder','employee','investor','shareholder') THEN p_role ELSE 'employee' END,
    'active', p_phone, p_department, p_bio, p_avatar_url
  );
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_insert_profile(text,text,text,text,text,text,text,text) TO authenticated;

-- Also allow founders to UPDATE all profile fields (not just their own)
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_id uuid,
  p_full_name text,
  p_title text,
  p_role text,
  p_phone text,
  p_department text,
  p_bio text,
  p_avatar_url text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can update profiles';
  END IF;
  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    title       = COALESCE(p_title, title),
    role        = CASE WHEN p_role IN ('founder','employee','investor','shareholder') THEN p_role ELSE role END,
    phone       = p_phone,
    department  = p_department,
    bio         = p_bio,
    avatar_url  = COALESCE(p_avatar_url, avatar_url)
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid,text,text,text,text,text,text,text) TO authenticated;

-- 2. account_requests: ensure approval_code column exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'approval_code') THEN
    ALTER TABLE public.account_requests ADD COLUMN approval_code text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'desired_password') THEN
    ALTER TABLE public.account_requests ADD COLUMN desired_password text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'auth_user_created') THEN
    ALTER TABLE public.account_requests ADD COLUMN auth_user_created boolean DEFAULT false;
  END IF;
END $$;

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
  TO authenticated USING (public.is_founder() OR profile_id = auth.uid());

DROP POLICY IF EXISTS "sal_insert" ON public.employee_salaries;
CREATE POLICY "sal_insert" ON public.employee_salaries FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "sal_update" ON public.employee_salaries;
CREATE POLICY "sal_update" ON public.employee_salaries FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "sal_delete" ON public.employee_salaries;
CREATE POLICY "sal_delete" ON public.employee_salaries FOR DELETE
  TO authenticated USING (public.is_founder());

-- 6. tech_stack: add missing columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'cost_type') THEN
    ALTER TABLE public.tech_stack ADD COLUMN cost_type text NOT NULL DEFAULT 'free' CHECK (cost_type IN ('free','monthly','per_user','annual','one_time'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'monthly_cost') THEN
    ALTER TABLE public.tech_stack ADD COLUMN monthly_cost numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'per_user_cost') THEN
    ALTER TABLE public.tech_stack ADD COLUMN per_user_cost numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'contract_end') THEN
    ALTER TABLE public.tech_stack ADD COLUMN contract_end date;
  END IF;
END $$;

-- 7. Chat: allow all active users to see all channels (not just ones they're members of)
-- This fixes the empty chat issue where product_members table is empty
DROP POLICY IF EXISTS "channels_select" ON public.chat_channels;
CREATE POLICY "channels_select" ON public.chat_channels FOR SELECT
  TO authenticated USING (public.is_active_user());

-- Allow all active users to see all messages (not just channels they're members of)
DROP POLICY IF EXISTS "msg_select" ON public.chat_messages;
CREATE POLICY "msg_select" ON public.chat_messages FOR SELECT
  TO authenticated USING (public.is_active_user());

-- Allow all active users to insert messages
DROP POLICY IF EXISTS "msg_insert" ON public.chat_messages;
CREATE POLICY "msg_insert" ON public.chat_messages FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_active_user());

-- Allow all active users to read memberships
DROP POLICY IF EXISTS "cm_select" ON public.chat_memberships;
CREATE POLICY "cm_select" ON public.chat_memberships FOR SELECT
  TO authenticated USING (public.is_active_user());

-- Allow active users to add themselves to channels
DROP POLICY IF EXISTS "cm_insert" ON public.chat_memberships;
CREATE POLICY "cm_insert" ON public.chat_memberships FOR INSERT
  TO authenticated WITH CHECK (public.is_active_user());

-- 8. expenses: allow custom recurring period
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'custom_duration_days') THEN
    ALTER TABLE public.expenses ADD COLUMN custom_duration_days integer;
  END IF;
END $$;

-- 9. profiles: add department column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'department') THEN
    ALTER TABLE public.profiles ADD COLUMN department text;
  END IF;
END $$;
