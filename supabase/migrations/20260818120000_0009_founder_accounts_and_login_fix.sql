/*
 * Migration 0009 — Login-only auth + founder-created accounts
 *
 * 1. Repair existing founder logins (unconfirmed email, missing identity, pending status).
 * 2. Let a signed-in founder create a real login for another founder/member.
 * 3. After sign-in, auto-activate a founder's own pending profile so they are not stuck.
 */

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Repair existing accounts so founders can sign in
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

UPDATE public.profiles
SET status = 'active'
WHERE role = 'founder' AND status IS DISTINCT FROM 'active';

-- GoTrue will not issue a session if the email identity row is missing.
DO $$
BEGIN
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email',
    u.id::text,
    now(),
    now(),
    now()
  FROM auth.users u
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'identity repair skipped: %', SQLERRM;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Founder creates a real auth user + profile (does not switch sessions)
-- ─────────────────────────────────────────────────────────────────────────────

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
LANGUAGE plpgsql
SECURITY DEFINER
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
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'Full name is required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  v_role := CASE
    WHEN p_role IN ('founder', 'employee', 'investor', 'shareholder') THEN p_role
    ELSE 'employee'
  END;
  v_title := COALESCE(NULLIF(trim(p_title), ''), CASE WHEN v_role = 'founder' THEN 'Founder' ELSE '' END);

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An account with this email already exists';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'role', v_role),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email',
    v_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id, email, full_name, title, role, status, phone, department, bio, avatar_url
  ) VALUES (
    v_id,
    v_email,
    trim(p_full_name),
    v_title,
    v_role,
    'active',
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_department), ''),
    NULLIF(trim(p_bio), ''),
    NULLIF(trim(p_avatar_url), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = EXCLUDED.email,
    full_name  = EXCLUDED.full_name,
    title      = EXCLUDED.title,
    role       = EXCLUDED.role,
    status     = 'active',
    phone      = EXCLUDED.phone,
    department = EXCLUDED.department,
    bio        = EXCLUDED.bio,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, text, text, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. After sign-in, make sure this user has a usable profile
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_own_profile_access()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_founder_count int;
BEGIN
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Confirm this user's email so they are never stuck behind confirmation
  IF v_user.email_confirmed_at IS NULL THEN
    UPDATE auth.users
    SET email_confirmed_at = now()
    WHERE id = v_user.id;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();

  IF NOT FOUND THEN
    SELECT count(*) INTO v_founder_count
    FROM public.profiles
    WHERE role = 'founder' AND status = 'active';

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
    UPDATE public.profiles
    SET status = 'active'
    WHERE id = v_profile.id
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_own_profile_access() TO authenticated;
