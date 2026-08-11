/*
 * Migration 0007 — Founder signup & profile settings support
 *
 * 1. Allow founders to self-register via supabase.auth.signUp() and upsert
 *    their own profile row with role = 'founder'.
 * 2. Allow any authenticated user to update their own profile row (for Settings page).
 * 3. Ensure the auth trigger creates a stub profile on every new auth.users insert
 *    so the profile row always exists after sign-up.
 * 4. Allow avatars storage bucket uploads (update policy to also cover updates/deletes).
 * 5. Ensure account_requests.desired_password column exists (idempotent).
 * 6. Expose a safe loadProfile() path — allow users to SELECT their own profile.
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — tighten & extend RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow every authenticated user to read their own profile (needed for Settings)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Allow authenticated users to update only their own profile row.
-- Employees cannot promote themselves — role/status are locked unless they are already a founder.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      -- Founders can update anything on their own row
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'founder'
      OR
      -- Non-founders: the incoming role and status must match what is already stored
      -- We enforce this by only allowing the update if role = existing role and status = existing status.
      -- Since we cannot use NEW here, we restrict non-founders to never change role or status
      -- by checking that the supplied values equal the current stored values.
      (
        role   = (SELECT role   FROM public.profiles WHERE id = auth.uid()) AND
        status = (SELECT status FROM public.profiles WHERE id = auth.uid())
      )
    )
  );

-- Allow a brand-new auth user to INSERT their own profile row (needed for founder signup)
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AUTH TRIGGER — create stub profile on every new sign-up
--    This ensures a profile row always exists after supabase.auth.signUp().
--    We use ON CONFLICT DO NOTHING so it doesn't overwrite founder upserts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, title, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    '',          -- title — filled in by user later
    'employee',  -- default role; founder flow upserts to 'founder' immediately after
    'active'
  )
  ON CONFLICT (id) DO NOTHING;   -- don't overwrite if the app already upserted with role=founder
  RETURN NEW;
END;
$$;

-- Drop old trigger name variants and re-create cleanly
DROP TRIGGER IF EXISTS on_auth_user_created   ON auth.users;
DROP TRIGGER IF EXISTS on_new_auth_user        ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. STORAGE — avatars bucket: allow update & delete of own uploads
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_upload"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete"  ON storage.objects;
DROP POLICY IF EXISTS "avatars_read"    ON storage.objects;

CREATE POLICY "avatars_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');

-- product-logos bucket renamed to products
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('products', 'products', true, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "logos_upload"  ON storage.objects;
DROP POLICY IF EXISTS "logos_update"  ON storage.objects;
DROP POLICY IF EXISTS "logos_delete"  ON storage.objects;
DROP POLICY IF EXISTS "logos_read"    ON storage.objects;

CREATE POLICY "logos_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'products');

CREATE POLICY "logos_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'products');

CREATE POLICY "logos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'products');

CREATE POLICY "logos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'products');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. account_requests — ensure desired_password column (idempotent)
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
-- 5. HELPER: promote_to_founder(uid)
--    Founders can call this on their own uid after signup to guarantee role=founder.
--    The LoginPage upserts via the client, but this provides a server-side fallback.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.self_promote_founder(p_uid uuid, p_code text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_required_code text;
BEGIN
  -- Only allow self-promotion
  IF p_uid <> auth.uid() THEN
    RAISE EXCEPTION 'You can only promote your own account';
  END IF;

  -- Optional env-level code check (stored in app_config table if present)
  BEGIN
    SELECT value INTO v_required_code FROM public.app_config WHERE key = 'founder_code' LIMIT 1;
  EXCEPTION WHEN undefined_table THEN
    v_required_code := NULL;
  END;

  IF v_required_code IS NOT NULL AND v_required_code <> '' AND p_code <> v_required_code THEN
    RAISE EXCEPTION 'Invalid founder code';
  END IF;

  UPDATE public.profiles
  SET role   = 'founder',
      status = 'active',
      title  = COALESCE(NULLIF(title, ''), 'Founder')
  WHERE id = p_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.self_promote_founder(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. app_config table (used by self_promote_founder for optional code gate)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_read"  ON public.app_config;
DROP POLICY IF EXISTS "app_config_write" ON public.app_config;

-- Only founders can read/write config
CREATE POLICY "app_config_read" ON public.app_config
  FOR SELECT TO authenticated USING (public.is_founder());

CREATE POLICY "app_config_write" ON public.app_config
  FOR ALL TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());
