/*
 * Migration 0006 — Comprehensive fixes
 *
 * 1. Fix chat_memberships RLS infinite recursion
 * 2. Add subtasks table
 * 3. Ensure desired_password column on account_requests
 * 4. Storage buckets for avatars and product logos
 * 5. Admin approve request RPC
 * 6. Ensure all financial tables exist with correct columns
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FIX CHAT RLS INFINITE RECURSION
--    The old policy checked chat_memberships INSIDE a chat_memberships policy
--    which caused the infinite recursion error. Replace with simple active-user check.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop ALL old chat policies to start clean
DROP POLICY IF EXISTS "cm_select"   ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_insert"   ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_update"   ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_delete"   ON public.chat_memberships;
DROP POLICY IF EXISTS "channels_select" ON public.chat_channels;
DROP POLICY IF EXISTS "channels_insert" ON public.chat_channels;
DROP POLICY IF EXISTS "channels_update" ON public.chat_channels;
DROP POLICY IF EXISTS "channels_delete" ON public.chat_channels;
DROP POLICY IF EXISTS "msg_select"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_insert"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_update"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_delete"  ON public.chat_messages;

-- Re-create using ONLY is_active_user() — no self-referencing subqueries
CREATE POLICY "channels_select" ON public.chat_channels FOR SELECT
  TO authenticated USING (public.is_active_user());

CREATE POLICY "channels_insert" ON public.chat_channels FOR INSERT
  TO authenticated WITH CHECK (public.is_active_user());

CREATE POLICY "channels_update" ON public.chat_channels FOR UPDATE
  TO authenticated USING (public.is_founder());

CREATE POLICY "channels_delete" ON public.chat_channels FOR DELETE
  TO authenticated USING (public.is_founder());

-- chat_memberships: no subquery into chat_memberships itself
CREATE POLICY "cm_select" ON public.chat_memberships FOR SELECT
  TO authenticated USING (public.is_active_user());

CREATE POLICY "cm_insert" ON public.chat_memberships FOR INSERT
  TO authenticated WITH CHECK (public.is_active_user());

CREATE POLICY "cm_delete" ON public.chat_memberships FOR DELETE
  TO authenticated USING (public.is_founder() OR user_id = auth.uid());

-- chat_messages
CREATE POLICY "msg_select" ON public.chat_messages FOR SELECT
  TO authenticated USING (public.is_active_user());

CREATE POLICY "msg_insert" ON public.chat_messages FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "msg_delete" ON public.chat_messages FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR public.is_founder());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SUBTASKS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subtasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '',
  completed   boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subtasks_select" ON public.subtasks;
CREATE POLICY "subtasks_select" ON public.subtasks FOR SELECT
  TO authenticated USING (public.is_active_user());

DROP POLICY IF EXISTS "subtasks_insert" ON public.subtasks;
CREATE POLICY "subtasks_insert" ON public.subtasks FOR INSERT
  TO authenticated WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "subtasks_update" ON public.subtasks;
CREATE POLICY "subtasks_update" ON public.subtasks FOR UPDATE
  TO authenticated USING (public.is_active_user()) WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "subtasks_delete" ON public.subtasks;
CREATE POLICY "subtasks_delete" ON public.subtasks FOR DELETE
  TO authenticated USING (public.is_active_user());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. account_requests — ensure desired_password column
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_requests' AND column_name = 'desired_password'
  ) THEN
    ALTER TABLE public.account_requests ADD COLUMN desired_password text;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. STORAGE BUCKETS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',      'avatars',      true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('product-logos','product-logos',true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to avatars
DROP POLICY IF EXISTS "avatars_upload"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_read"     ON storage.objects;
DROP POLICY IF EXISTS "logos_upload"     ON storage.objects;
DROP POLICY IF EXISTS "logos_read"       ON storage.objects;

CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_read" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'avatars');

CREATE POLICY "logos_upload" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'product-logos');

CREATE POLICY "logos_read" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'product-logos');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_approve_request RPC
--    Creates a real Supabase auth user then activates the profile.
--    Uses SECURITY DEFINER so it runs with postgres privileges.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req  public.account_requests%ROWTYPE;
  v_uid  uuid;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can approve access requests';
  END IF;

  SELECT * INTO v_req FROM public.account_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- Try to find an existing auth user with this email
  SELECT id INTO v_uid FROM auth.users WHERE email = v_req.email LIMIT 1;

  IF v_uid IS NULL THEN
    -- Create the auth user with the password they chose
    -- (supabase admin functions are not available in plpgsql; we insert directly)
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, aud, role
    ) VALUES (
      v_uid,
      v_req.email,
      crypt(COALESCE(v_req.desired_password, gen_random_uuid()::text), gen_salt('bf')),
      now(),
      jsonb_build_object('full_name', v_req.full_name),
      now(),
      now(),
      'authenticated',
      'authenticated'
    );
  END IF;

  -- Upsert profile row
  INSERT INTO public.profiles (id, email, full_name, title, role, status)
  VALUES (
    v_uid,
    v_req.email,
    v_req.full_name,
    COALESCE(v_req.title, ''),
    'employee',
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    status    = 'active',
    full_name = EXCLUDED.full_name,
    title     = COALESCE(EXCLUDED.title, profiles.title);

  -- Mark request as approved
  UPDATE public.account_requests
  SET status      = 'approved',
      reviewed_at = now(),
      auth_user_created = true
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_request(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Ensure financial tables exist (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- income
CREATE TABLE IF NOT EXISTS public.income (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid REFERENCES public.products(id) ON DELETE CASCADE,
  description      text NOT NULL DEFAULT '',
  amount_usd       numeric NOT NULL DEFAULT 0 CHECK (amount_usd >= 0),
  income_date      date NOT NULL DEFAULT CURRENT_DATE,
  category         text NOT NULL DEFAULT 'revenue'
                     CHECK (category IN ('revenue','grant','investment','consulting','other')),
  is_recurring     boolean NOT NULL DEFAULT false,
  recurring_period text CHECK (recurring_period IN ('monthly','quarterly','annually') OR recurring_period IS NULL),
  notes            text,
  created_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now()
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

-- bank_balances
CREATE TABLE IF NOT EXISTS public.bank_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name  text NOT NULL DEFAULT 'Main Account',
  balance_usd   numeric NOT NULL DEFAULT 0,
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  created_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now()
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

-- employee_salaries
CREATE TABLE IF NOT EXISTS public.employee_salaries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  monthly_salary_usd  numeric NOT NULL DEFAULT 0 CHECK (monthly_salary_usd >= 0),
  effective_date      date NOT NULL DEFAULT CURRENT_DATE,
  notes               text,
  created_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at          timestamptz DEFAULT now()
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
