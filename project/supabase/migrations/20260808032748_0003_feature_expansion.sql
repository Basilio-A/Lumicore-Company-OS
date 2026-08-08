/*
# Company OS — Feature expansion migration

## Purpose
Adds support for: company-wide settings (valuation/share price),
expense & burn rate tracking, investor documents, product metadata
(phase, logo, website), shareholder role, tech stack sub-categorization,
and AI assistant conversations.

## New Tables
1. company_settings — single-row table for company-wide financial settings
2. expenses — monthly expense entries with category and optional product link
3. investor_documents — document links/files for investor portal
4. ai_conversations — AI assistant chat history per user

## Modified Tables
1. products — add phase, logo_url, website, status columns
2. profiles — add bio column; expand role CHECK to include 'shareholder'
3. tech_stack — expand category CHECK to include infrastructure, saas, tooling, api
4. equity_holdings — add investment_amount_usd column for tracking cost basis

## Security
- RLS enabled on all new tables
- company_settings: founders can read/write; investors can read
- expenses: founders can CRUD; investors can read
- investor_documents: founders can CRUD; investors can read
- ai_conversations: each user can only access their own conversations
*/

-- 1. company_settings
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_equity_value_usd numeric NOT NULL DEFAULT 0,
  share_price_usd numeric NOT NULL DEFAULT 0.01,
  total_shares_issued numeric NOT NULL DEFAULT 1000000,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_select" ON public.company_settings;
CREATE POLICY "cs_select" ON public.company_settings FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor() OR public.is_active_user());

DROP POLICY IF EXISTS "cs_insert" ON public.company_settings;
CREATE POLICY "cs_insert" ON public.company_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "cs_update" ON public.company_settings;
CREATE POLICY "cs_update" ON public.company_settings FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

-- Seed a default row if none exists
INSERT INTO public.company_settings (total_equity_value_usd, share_price_usd, total_shares_issued)
SELECT 10000, 0.01, 1000000
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- 2. expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('rent','employees','materials','tech_stack','marketing','operations','other')),
  description text NOT NULL DEFAULT '',
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_period text DEFAULT 'monthly' CHECK (recurring_period IN ('monthly','quarterly','annually')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exp_select" ON public.expenses;
CREATE POLICY "exp_select" ON public.expenses FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "exp_insert" ON public.expenses;
CREATE POLICY "exp_insert" ON public.expenses FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "exp_update" ON public.expenses;
CREATE POLICY "exp_update" ON public.expenses FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "exp_delete" ON public.expenses;
CREATE POLICY "exp_delete" ON public.expenses FOR DELETE
  TO authenticated USING (public.is_founder());

CREATE INDEX IF NOT EXISTS idx_expenses_product ON public.expenses(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);

-- 3. investor_documents
CREATE TABLE IF NOT EXISTS public.investor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  doc_type text NOT NULL DEFAULT 'report' CHECK (doc_type IN ('report','financial','legal','presentation','other')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.investor_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idoc_select" ON public.investor_documents;
CREATE POLICY "idoc_select" ON public.investor_documents FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "idoc_insert" ON public.investor_documents;
CREATE POLICY "idoc_insert" ON public.investor_documents FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "idoc_update" ON public.investor_documents;
CREATE POLICY "idoc_update" ON public.investor_documents FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "idoc_delete" ON public.investor_documents;
CREATE POLICY "idoc_delete" ON public.investor_documents FOR DELETE
  TO authenticated USING (public.is_founder());

-- 4. ai_conversations
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_select" ON public.ai_conversations;
CREATE POLICY "ai_select" ON public.ai_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_insert" ON public.ai_conversations;
CREATE POLICY "ai_insert" ON public.ai_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_delete" ON public.ai_conversations;
CREATE POLICY "ai_delete" ON public.ai_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_user ON public.ai_conversations(user_id, created_at);

-- 5. products: add columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'phase') THEN
    ALTER TABLE public.products ADD COLUMN phase text DEFAULT 'ideation' CHECK (phase IN ('ideation','mvp','growth','scale','mature'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'logo_url') THEN
    ALTER TABLE public.products ADD COLUMN logo_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'website') THEN
    ALTER TABLE public.products ADD COLUMN website text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'status') THEN
    ALTER TABLE public.products ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active','paused','archived'));
  END IF;
END $$;

-- 6. profiles: add bio column + expand role check
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
    ALTER TABLE public.profiles ADD COLUMN bio text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('founder','employee','investor','shareholder'));

-- 7. tech_stack: expand category check
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'tech_stack_category_check'
  ) THEN
    ALTER TABLE public.tech_stack DROP CONSTRAINT tech_stack_category_check;
  END IF;
END $$;
ALTER TABLE public.tech_stack ADD CONSTRAINT tech_stack_category_check
  CHECK (category IN ('infrastructure','saas','tooling','api','frontend','backend','database','hosting','devtools','other'));

-- 8. equity_holdings: add investment amount
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'equity_holdings' AND column_name = 'investment_amount_usd') THEN
    ALTER TABLE public.equity_holdings ADD COLUMN investment_amount_usd numeric DEFAULT 0;
  END IF;
END $$;

-- 9. admin_set_profile_role: allow founders to change a user's role
CREATE OR REPLACE FUNCTION public.admin_set_profile_role(p_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can change roles';
  END IF;
  IF p_role NOT IN ('founder','employee','investor','shareholder') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_id;
END;
$$;

-- Grant execute on the new function
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(uuid, text) TO authenticated;
