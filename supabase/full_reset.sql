-- =============================================================================
-- Lumicore Company OS — complete database reset + rebuild
--
-- APPLY: Supabase Dashboard → SQL Editor → paste this entire file → Run
-- Project must be the same one as VITE_SUPABASE_URL in .env
--
-- This drops public app tables/functions/policies, then recreates a schema
-- that matches the frontend types and supabase.from() / .rpc() calls.
-- Does not delete auth.users. Existing users keep their login; a profile
-- row is created automatically on next sign-in (or immediately via trigger
-- for new sign-ups).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. DROP existing app objects
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_new_auth_user ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user','handle_new_auth_user','touch_updated_at',
        'is_founder','is_employee','is_investor','is_active_user','product_member',
        'admin_set_profile_status','admin_update_profile','admin_insert_profile',
        'admin_create_user','admin_approve_request','admin_approve_employee',
        'admin_create_account','admin_create_founder_invite','self_promote_founder',
        'ensure_own_profile_access'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', r.name, r.args);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP TABLE IF EXISTS public.employee_salaries CASCADE;
DROP TABLE IF EXISTS public.bank_balances CASCADE;
DROP TABLE IF EXISTS public.income CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.investor_documents CASCADE;
DROP TABLE IF EXISTS public.investor_reports CASCADE;
DROP TABLE IF EXISTS public.investor_memos CASCADE;
DROP TABLE IF EXISTS public.equity_holdings CASCADE;
DROP TABLE IF EXISTS public.company_settings CASCADE;
DROP TABLE IF EXISTS public.tech_stack CASCADE;
DROP TABLE IF EXISTS public.kudos CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_memberships CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;
DROP TABLE IF EXISTS public.knowledge_base CASCADE;
DROP TABLE IF EXISTS public.docs CASCADE;
DROP TABLE IF EXISTS public.subtasks CASCADE;
DROP TABLE IF EXISTS public.task_assignees CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.sprints CASCADE;
DROP TABLE IF EXISTS public.product_members CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.account_requests CASCADE;
DROP TABLE IF EXISTS public.founder_invites CASCADE;
DROP TABLE IF EXISTS public.app_config CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  title text DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('founder','employee','investor','shareholder')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','rejected')),
  avatar_url text,
  phone text,
  department text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text NOT NULL DEFAULT '#6C63FF',
  phase text NOT NULL DEFAULT 'ideation' CHECK (phase IN ('ideation','mvp','growth','scale','mature')),
  logo_url text,
  website text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_role text NOT NULL DEFAULT 'member' CHECK (product_role IN (
    'lead','member','developer','designer','product_manager','qa_engineer',
    'data_scientist','ml_engineer','devops','marketing','sales','operations'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE TABLE public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','todo','in_progress','review','done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  position int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.task_assignees (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  folder text,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'note' CHECK (category IN ('note','interview','book','reference','other')),
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel','dm')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_memberships (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  points int NOT NULL DEFAULT 5 CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_equity_value_usd numeric NOT NULL DEFAULT 0,
  share_price_usd numeric NOT NULL DEFAULT 0,
  total_shares_issued numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.equity_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_name text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  shares numeric NOT NULL CHECK (shares >= 0),
  share_class text NOT NULL DEFAULT 'common' CHECK (share_class IN ('common','preferred','options','warrants')),
  vesting_years int NOT NULL DEFAULT 4,
  cliff_years int NOT NULL DEFAULT 1,
  vesting_start date,
  notes text,
  investment_amount_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.investor_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.investor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  file_url text NOT NULL,
  doc_type text NOT NULL DEFAULT 'other' CHECK (doc_type IN ('report','financial','legal','presentation','other')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.investor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  period text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  highlights text NOT NULL DEFAULT '',
  metrics text NOT NULL DEFAULT '',
  challenges text NOT NULL DEFAULT '',
  financials text NOT NULL DEFAULT '',
  next_steps text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tech_stack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'infrastructure','saas','tooling','api','frontend','backend','database','hosting','devtools','other'
  )),
  name text NOT NULL,
  description text,
  cost_type text NOT NULL DEFAULT 'free' CHECK (cost_type IN ('free','monthly','per_user','annual','one_time')),
  monthly_cost numeric NOT NULL DEFAULT 0,
  per_user_cost numeric NOT NULL DEFAULT 0,
  contract_end date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  title text NOT NULL DEFAULT '',
  message text,
  desired_password text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approval_code text,
  auth_user_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'rent','employees','materials','tech_stack','marketing','operations','other'
  )),
  description text NOT NULL,
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_period text CHECK (recurring_period IN ('monthly','quarterly','annually','custom') OR recurring_period IS NULL),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  amount_usd numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'revenue' CHECK (category IN ('revenue','grant','investment','consulting','other')),
  is_recurring boolean NOT NULL DEFAULT false,
  recurring_period text CHECK (recurring_period IN ('monthly','quarterly','annually','custom') OR recurring_period IS NULL),
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bank_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL DEFAULT 'Main Account',
  balance_usd numeric NOT NULL DEFAULT 0,
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employee_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_salary_usd numeric NOT NULL DEFAULT 0 CHECK (monthly_salary_usd >= 0),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_product ON public.tasks(product_id);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX idx_tasks_sprint ON public.tasks(sprint_id);
CREATE INDEX idx_docs_product ON public.docs(product_id);
CREATE INDEX idx_kb_product ON public.knowledge_base(product_id);
CREATE INDEX idx_chat_messages_channel ON public.chat_messages(channel_id, created_at);
CREATE INDEX idx_kudos_to ON public.kudos(to_user_id);
CREATE INDEX idx_product_members_user ON public.product_members(user_id);
CREATE INDEX idx_profiles_email ON public.profiles(lower(email));

INSERT INTO public.company_settings (total_equity_value_usd, share_price_usd, total_shares_issued)
VALUES (0, 0, 0);

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER docs_touch BEFORE UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER kb_touch BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER memos_touch BEFORE UPDATE ON public.investor_memos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER reports_touch BEFORE UPDATE ON public.investor_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Role helpers (SECURITY DEFINER — no RLS recursion)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'founder' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_investor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'investor' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

-- -----------------------------------------------------------------------------
-- 5. Auth → profile trigger
--    First user becomes an active founder. Later users become active employees
--    (founders create additional founder accounts via admin_create_user).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_founder_count int;
  v_role text;
  v_status text;
BEGIN
  SELECT count(*) INTO v_founder_count
  FROM public.profiles
  WHERE role = 'founder' AND status = 'active';

  IF v_founder_count = 0 THEN
    v_role := 'founder';
    v_status := 'active';
  ELSE
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
    IF v_role NOT IN ('founder','employee','investor','shareholder') THEN
      v_role := 'employee';
    END IF;
    v_status := 'active';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, title, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'title', CASE WHEN v_role = 'founder' THEN 'Founder' ELSE '' END),
    v_role,
    v_status
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill profiles for any existing auth users (oldest user becomes founder)
INSERT INTO public.profiles (id, email, full_name, title, role, status)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(COALESCE(u.email, ''), '@', 1)),
  CASE WHEN u.id = (SELECT id FROM auth.users ORDER BY created_at ASC NULLS LAST LIMIT 1)
       THEN 'Founder' ELSE COALESCE(u.raw_user_meta_data->>'title', '') END,
  CASE WHEN u.id = (SELECT id FROM auth.users ORDER BY created_at ASC NULLS LAST LIMIT 1)
       THEN 'founder' ELSE 'employee' END,
  'active'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Promote the oldest remaining user to founder if none exist after backfill
UPDATE public.profiles
SET role = 'founder', status = 'active', title = COALESCE(NULLIF(title, ''), 'Founder')
WHERE id = (
  SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'founder' AND status = 'active');

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- -----------------------------------------------------------------------------
-- 6. Admin RPCs used by the frontend
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_profile_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can change account status';
  END IF;
  IF p_status NOT IN ('active','pending','rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.profiles SET status = p_status WHERE id = p_id;
END;
$$;

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
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text DEFAULT 'employee',
  p_title text DEFAULT '',
  p_phone text DEFAULT '',
  p_department text DEFAULT '',
  p_bio text DEFAULT '',
  p_avatar_url text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text;
  v_role text;
  v_title text;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can create accounts';
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email = '' THEN RAISE EXCEPTION 'Email is required'; END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN RAISE EXCEPTION 'Password must be at least 8 characters'; END IF;

  v_role := CASE WHEN p_role IN ('founder','employee','investor','shareholder') THEN p_role ELSE 'employee' END;
  v_title := COALESCE(NULLIF(trim(p_title), ''), CASE WHEN v_role = 'founder' THEN 'Founder' ELSE '' END);

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
    now(), now(), '', '', '', ''
  );

  BEGIN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_id,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email', v_id::text, now(), now(), now()
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.profiles (id, email, full_name, title, role, status, phone, department, bio, avatar_url)
  VALUES (
    v_id, v_email, trim(p_full_name), v_title, v_role, 'active',
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_department), ''),
    NULLIF(trim(p_bio), ''), NULLIF(trim(p_avatar_url), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    title = EXCLUDED.title,
    role = EXCLUDED.role,
    status = 'active';

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_req public.account_requests%ROWTYPE;
  v_uid uuid;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can approve access requests';
  END IF;

  SELECT * INTO v_req FROM public.account_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_req.email) LIMIT 1;

  IF v_uid IS NULL THEN
    v_uid := public.admin_create_user(
      v_req.email,
      COALESCE(v_req.desired_password, encode(gen_random_bytes(12), 'hex')),
      v_req.full_name,
      'employee',
      COALESCE(v_req.title, ''),
      '', '', '', ''
    );
  ELSE
    INSERT INTO public.profiles (id, email, full_name, title, role, status)
    VALUES (v_uid, v_req.email, v_req.full_name, COALESCE(v_req.title, ''), 'employee', 'active')
    ON CONFLICT (id) DO UPDATE SET status = 'active', full_name = EXCLUDED.full_name;
  END IF;

  UPDATE public.account_requests
  SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), auth_user_created = true
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_own_profile_access()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_founder_count int;
BEGIN
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF v_user.email_confirmed_at IS NULL THEN
    UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user.id;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF NOT FOUND THEN
    SELECT count(*) INTO v_founder_count FROM public.profiles WHERE role = 'founder' AND status = 'active';
    INSERT INTO public.profiles (id, email, full_name, title, role, status)
    VALUES (
      v_user.id,
      COALESCE(v_user.email, ''),
      COALESCE(v_user.raw_user_meta_data->>'full_name', split_part(COALESCE(v_user.email, ''), '@', 1)),
      CASE WHEN v_founder_count = 0 THEN 'Founder' ELSE '' END,
      CASE WHEN v_founder_count = 0 THEN 'founder' ELSE 'employee' END,
      'active'
    )
    RETURNING * INTO v_profile;
  ELSIF v_profile.role = 'founder' AND v_profile.status IS DISTINCT FROM 'active' THEN
    UPDATE public.profiles SET status = 'active' WHERE id = v_profile.id
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_founder() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_investor() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile_access() TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. RLS — authenticated users can operate; founders write sensitive tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON public.account_requests TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

REVOKE SELECT ON public.employee_salaries, public.expenses, public.income,
  public.bank_balances, public.equity_holdings, public.company_settings,
  public.account_requests FROM anon;

-- Profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_active_user());
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_founder())
  WITH CHECK (id = auth.uid() OR public.is_founder());

REVOKE UPDATE (role, status) ON public.profiles FROM authenticated, anon;

-- Open operational tables for signed-in users (matches UI usage)
CREATE POLICY products_all ON public.products FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY product_members_all ON public.product_members FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY sprints_all ON public.sprints FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY tasks_all ON public.tasks FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY task_assignees_all ON public.task_assignees FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY subtasks_all ON public.subtasks FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY docs_all ON public.docs FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY kb_all ON public.knowledge_base FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY channels_all ON public.chat_channels FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY cm_all ON public.chat_memberships FOR ALL TO authenticated
  USING (public.is_active_user()) WITH CHECK (public.is_active_user());
CREATE POLICY msg_select ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_active_user());
CREATE POLICY msg_insert ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());
CREATE POLICY msg_delete ON public.chat_messages FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_founder());
CREATE POLICY kudos_select ON public.kudos FOR SELECT TO authenticated
  USING (public.is_active_user());
CREATE POLICY kudos_insert ON public.kudos FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid() AND public.is_active_user());
CREATE POLICY tech_select ON public.tech_stack FOR SELECT TO authenticated
  USING (public.is_active_user());
CREATE POLICY tech_write ON public.tech_stack FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());

-- Founder / investor financial + cap-table data
CREATE POLICY settings_select ON public.company_settings FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY settings_write ON public.company_settings FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY equity_select ON public.equity_holdings FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY equity_write ON public.equity_holdings FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY memos_select ON public.investor_memos FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY memos_write ON public.investor_memos FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY idoc_select ON public.investor_documents FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY idoc_write ON public.investor_documents FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY irep_select ON public.investor_reports FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY irep_write ON public.investor_reports FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY exp_select ON public.expenses FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY exp_write ON public.expenses FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY income_select ON public.income FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY income_write ON public.income FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY bb_select ON public.bank_balances FOR SELECT TO authenticated
  USING (public.is_founder() OR public.is_investor());
CREATE POLICY bb_write ON public.bank_balances FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());
CREATE POLICY sal_select ON public.employee_salaries FOR SELECT TO authenticated
  USING (public.is_founder() OR profile_id = auth.uid());
CREATE POLICY sal_write ON public.employee_salaries FOR ALL TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());

CREATE POLICY ai_own ON public.ai_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY req_select ON public.account_requests FOR SELECT TO authenticated
  USING (public.is_founder());
CREATE POLICY req_insert_auth ON public.account_requests FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY req_insert_anon ON public.account_requests FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY req_update ON public.account_requests FOR UPDATE TO authenticated
  USING (public.is_founder()) WITH CHECK (public.is_founder());

-- -----------------------------------------------------------------------------
-- 8. Storage
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('products', 'products', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
DROP POLICY IF EXISTS "logos_read" ON storage.objects;
DROP POLICY IF EXISTS "logos_upload" ON storage.objects;
DROP POLICY IF EXISTS "logos_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_delete" ON storage.objects;

CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "logos_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'products');
CREATE POLICY "logos_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products');
CREATE POLICY "logos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'products');
CREATE POLICY "logos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'products');

-- -----------------------------------------------------------------------------
-- 9. Realtime (chat)
-- -----------------------------------------------------------------------------

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
