-- Admin company role can create and edit products, same as founders.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('founder','admin','employee','investor','shareholder'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_products()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_founder() OR public.is_admin();
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_products() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_products() TO authenticated;

DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated
  USING (
    public.is_founder()
    OR public.is_admin()
    OR public.is_investor()
    OR EXISTS (
      SELECT 1 FROM public.product_members pm
      WHERE pm.product_id = products.id
        AND pm.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_products());

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE TO authenticated
  USING (public.can_manage_products())
  WITH CHECK (public.can_manage_products());

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE TO authenticated
  USING (public.can_manage_products());

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can update profiles';
  END IF;
  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    title       = COALESCE(p_title, title),
    role        = CASE WHEN p_role IN ('founder','admin','employee','investor','shareholder') THEN p_role ELSE role END,
    phone       = p_phone,
    department  = p_department,
    bio         = p_bio,
    avatar_url  = COALESCE(p_avatar_url, avatar_url)
  WHERE id = p_id;
END;
$$;

