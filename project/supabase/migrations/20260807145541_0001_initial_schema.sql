/*
# Company OS — initial schema for Lumicore

## Purpose
Multi-tenant internal "mission control" for Lumicore (software company) and its
products (currently Parallane). Supports products, profiles/roles, tasks,
sprints, docs, knowledge base, chat, kudos/points, equity cap table, investor
memos, tech stack, account requests, and founder invite codes.

## Roles
- founder  : full access (CEO/CTO)
- employee : product-scoped access for products they belong to
- investor : read-only investor portal + cap table summary

## Tables created
- products              : Lumicore products (Parallane, future ones)
- profiles              : user extension of auth.users (role, status, name, title)
- product_members       : which users belong to which products
- sprints               : sprint/cycle grouping per product
- tasks                 : kanban task board per product
- docs                  : lightweight markdown docs per product
- knowledge_base        : reference/notes library (interview notes, books, etc.)
- chat_channels         : channels (product-scoped or company-wide) + DMs
- chat_memberships      : who is in which channel
- chat_messages         : messages in channels
- kudos                 : peer shoutouts with point values
- equity_holdings       : cap table rows (shares, class, vesting)
- investor_memos        : investor portal update memos
- tech_stack            : per-product stack reference entries
- account_requests      : employee access requests pending founder approval
- founder_invites       : single-use invite codes for founder signup

## Security
- RLS enabled on every table.
- Helper SQL functions: is_founder(), is_employee(), is_investor(),
  is_active_user(), product_member(uuid).
- Founder-only mutations for equity, investor memos, account approval,
  founder invites, product/product-member management.
- Employees limited to products they belong to (via product_members).
- Investors read-only on investor_memos, equity_holdings, products, profiles.
- Role/status columns on profiles are non-writable by authenticated users
  (column-level revoke); changed only via SECURITY DEFINER admin functions or
  the service-role edge function.
- Trigger handle_new_user auto-creates a profile on auth.users insert.
  Founder bootstrap: the first founder (no active founders yet) becomes
  active immediately; subsequent founders require a valid invite code,
  otherwise they are downgraded to a pending employee.
*/

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  color text DEFAULT '#6C63FF',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- FOUNDER INVITES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.founder_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL,
  used_by uuid,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('founder','employee','investor')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('active','pending','rejected')),
  avatar_url text,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PRODUCT MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_role text NOT NULL DEFAULT 'member' CHECK (product_role IN ('lead','member')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (product_id, user_id)
);

ALTER TABLE public.product_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SPRINTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tasks_product ON public.tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON public.tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- ============================================================
-- DOCS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  folder text,
  tags text[] DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_docs_product ON public.docs(product_id);

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'note' CHECK (category IN ('note','interview','book','reference','other')),
  tags text[] DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kb_product ON public.knowledge_base(product_id);

-- ============================================================
-- CHAT
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'channel' CHECK (type IN ('channel','dm')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_memberships (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.chat_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON public.chat_messages(channel_id, created_at);

-- ============================================================
-- KUDOS (employee of the month)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text,
  points int NOT NULL DEFAULT 5 CHECK (points > 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_kudos_to ON public.kudos(to_user_id);
CREATE INDEX IF NOT EXISTS idx_kudos_product ON public.kudos(product_id);

-- ============================================================
-- EQUITY HOLDINGS (cap table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equity_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_name text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  shares numeric NOT NULL CHECK (shares >= 0),
  share_class text NOT NULL DEFAULT 'common' CHECK (share_class IN ('common','preferred','options','warrants')),
  vesting_years int NOT NULL DEFAULT 4,
  cliff_years int NOT NULL DEFAULT 1,
  vesting_start date,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.equity_holdings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INVESTOR MEMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.investor_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.investor_memos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TECH STACK
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tech_stack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('frontend','backend','database','hosting','devtools','other')),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tech_stack ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ACCOUNT REQUESTS (employee pre-approval)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  title text NOT NULL DEFAULT '',
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER, used by RLS policies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_founder()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'founder' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'employee' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_investor()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'investor' AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.product_member(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.product_members
    WHERE product_id = p_id AND user_id = auth.uid()
  ) OR public.is_founder();
$$;

-- ============================================================
-- PROFILE AUTO-CREATION TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
  v_founder_count int;
  v_invite text;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'employee');
  v_status := 'pending';
  IF v_role = 'founder' THEN
    SELECT count(*) INTO v_founder_count
      FROM public.profiles WHERE role = 'founder' AND status = 'active';
    IF v_founder_count = 0 THEN
      -- bootstrap: first founder becomes active immediately
      v_status := 'active';
    ELSE
      v_invite := new.raw_user_meta_data->>'invite_code';
      PERFORM 1 FROM public.founder_invites
        WHERE code = v_invite AND used_by IS NULL;
      IF FOUND THEN
        v_status := 'active';
        UPDATE public.founder_invites
          SET used_by = new.id, used_at = now()
          WHERE code = v_invite;
      ELSE
        -- no valid invite: downgrade to pending employee request
        v_role := 'employee';
        v_status := 'pending';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, title, role, status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'title', ''),
    v_role,
    v_status
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- updated_at maintenance
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_touch ON public.tasks;
CREATE TRIGGER tasks_touch BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS docs_touch ON public.docs;
CREATE TRIGGER docs_touch BEFORE UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS kb_touch ON public.knowledge_base;
CREATE TRIGGER kb_touch BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS memos_touch ON public.investor_memos;
CREATE TRIGGER memos_touch BEFORE UPDATE ON public.investor_memos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- ADMIN (SECURITY DEFINER) FUNCTIONS for role/status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_profile_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can change account status';
  END IF;
  UPDATE public.profiles SET status = p_status WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_founder_invite()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can create invites';
  END IF;
  v_code := encode(gen_random_bytes(9), 'hex');
  INSERT INTO public.founder_invites (code, created_by) VALUES (v_code, auth.uid());
  RETURN v_code;
END;
$$;

-- ============================================================
-- POLICIES: PROFILES
-- ============================================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR id = auth.uid()
    OR (public.is_active_user() AND status = 'active')
  );

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_founder() OR id = auth.uid())
  WITH CHECK (public.is_founder() OR id = auth.uid());

-- Prevent self-elevation: role and status are not directly updatable by users.
REVOKE UPDATE (role, status) ON public.profiles FROM authenticated, anon;

-- ============================================================
-- POLICIES: PRODUCTS
-- ============================================================
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select" ON public.products FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR public.is_investor()
    OR EXISTS (
      SELECT 1 FROM public.product_members pm
      WHERE pm.product_id = products.id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: PRODUCT MEMBERS
-- ============================================================
DROP POLICY IF EXISTS "pm_select" ON public.product_members;
CREATE POLICY "pm_select" ON public.product_members FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR user_id = auth.uid()
    OR public.is_active_user()
  );

DROP POLICY IF EXISTS "pm_insert" ON public.product_members;
CREATE POLICY "pm_insert" ON public.product_members FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "pm_update" ON public.product_members;
CREATE POLICY "pm_update" ON public.product_members FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "pm_delete" ON public.product_members;
CREATE POLICY "pm_delete" ON public.product_members FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: SPRINTS
-- ============================================================
DROP POLICY IF EXISTS "sprints_select" ON public.sprints;
CREATE POLICY "sprints_select" ON public.sprints FOR SELECT
  TO authenticated USING (public.product_member(product_id));

DROP POLICY IF EXISTS "sprints_insert" ON public.sprints;
CREATE POLICY "sprints_insert" ON public.sprints FOR INSERT
  TO authenticated WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "sprints_update" ON public.sprints;
CREATE POLICY "sprints_update" ON public.sprints FOR UPDATE
  TO authenticated USING (public.product_member(product_id))
  WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "sprints_delete" ON public.sprints;
CREATE POLICY "sprints_delete" ON public.sprints FOR DELETE
  TO authenticated USING (public.product_member(product_id));

-- ============================================================
-- POLICIES: TASKS
-- ============================================================
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT
  TO authenticated USING (public.product_member(product_id));

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  TO authenticated USING (public.product_member(product_id))
  WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  TO authenticated USING (public.product_member(product_id));

-- ============================================================
-- POLICIES: DOCS
-- ============================================================
DROP POLICY IF EXISTS "docs_select" ON public.docs;
CREATE POLICY "docs_select" ON public.docs FOR SELECT
  TO authenticated USING (public.product_member(product_id));

DROP POLICY IF EXISTS "docs_insert" ON public.docs;
CREATE POLICY "docs_insert" ON public.docs FOR INSERT
  TO authenticated WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "docs_update" ON public.docs;
CREATE POLICY "docs_update" ON public.docs FOR UPDATE
  TO authenticated USING (public.product_member(product_id))
  WITH CHECK (public.product_member(product_id));

DROP POLICY IF EXISTS "docs_delete" ON public.docs;
CREATE POLICY "docs_delete" ON public.docs FOR DELETE
  TO authenticated USING (public.product_member(product_id));

-- ============================================================
-- POLICIES: KNOWLEDGE BASE
-- ============================================================
DROP POLICY IF EXISTS "kb_select" ON public.knowledge_base;
CREATE POLICY "kb_select" ON public.knowledge_base FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR (product_id IS NOT NULL AND public.product_member(product_id))
    OR (product_id IS NULL AND public.is_active_user())
  );

DROP POLICY IF EXISTS "kb_insert" ON public.knowledge_base;
CREATE POLICY "kb_insert" ON public.knowledge_base FOR INSERT
  TO authenticated WITH CHECK (
    public.is_founder()
    OR (product_id IS NOT NULL AND public.product_member(product_id))
    OR (product_id IS NULL AND public.is_active_user())
  );

DROP POLICY IF EXISTS "kb_update" ON public.knowledge_base;
CREATE POLICY "kb_update" ON public.knowledge_base FOR UPDATE
  TO authenticated USING (
    public.is_founder()
    OR (product_id IS NOT NULL AND public.product_member(product_id))
    OR (product_id IS NULL AND public.is_active_user())
  ) WITH CHECK (
    public.is_founder()
    OR (product_id IS NOT NULL AND public.product_member(product_id))
    OR (product_id IS NULL AND public.is_active_user())
  );

DROP POLICY IF EXISTS "kb_delete" ON public.knowledge_base;
CREATE POLICY "kb_delete" ON public.knowledge_base FOR DELETE
  TO authenticated USING (
    public.is_founder()
    OR (product_id IS NOT NULL AND public.product_member(product_id))
    OR (product_id IS NULL AND public.is_active_user())
  );

-- ============================================================
-- POLICIES: CHAT CHANNELS
-- ============================================================
DROP POLICY IF EXISTS "channels_select" ON public.chat_channels;
CREATE POLICY "channels_select" ON public.chat_channels FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR EXISTS (
      SELECT 1 FROM public.chat_memberships cm
      WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "channels_insert" ON public.chat_channels;
CREATE POLICY "channels_insert" ON public.chat_channels FOR INSERT
  TO authenticated WITH CHECK (public.is_founder() OR public.is_active_user());

DROP POLICY IF EXISTS "channels_update" ON public.chat_channels;
CREATE POLICY "channels_update" ON public.chat_channels FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "channels_delete" ON public.chat_channels;
CREATE POLICY "channels_delete" ON public.chat_channels FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: CHAT MEMBERSHIPS
-- ============================================================
DROP POLICY IF EXISTS "cm_select" ON public.chat_memberships;
CREATE POLICY "cm_select" ON public.chat_memberships FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR public.is_founder()
    OR EXISTS (
      SELECT 1 FROM public.chat_memberships cm2
      WHERE cm2.channel_id = chat_memberships.channel_id AND cm2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cm_insert" ON public.chat_memberships;
CREATE POLICY "cm_insert" ON public.chat_memberships FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() OR public.is_founder()
  );

DROP POLICY IF EXISTS "cm_delete" ON public.chat_memberships;
CREATE POLICY "cm_delete" ON public.chat_memberships FOR DELETE
  TO authenticated USING (public.is_founder() OR user_id = auth.uid());

-- ============================================================
-- POLICIES: CHAT MESSAGES
-- ============================================================
DROP POLICY IF EXISTS "msg_select" ON public.chat_messages;
CREATE POLICY "msg_select" ON public.chat_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.chat_memberships cm
      WHERE cm.channel_id = chat_messages.channel_id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "msg_insert" ON public.chat_messages;
CREATE POLICY "msg_insert" ON public.chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_memberships cm
      WHERE cm.channel_id = chat_messages.channel_id AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "msg_update" ON public.chat_messages;
CREATE POLICY "msg_update" ON public.chat_messages FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "msg_delete" ON public.chat_messages;
CREATE POLICY "msg_delete" ON public.chat_messages FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR public.is_founder());

-- ============================================================
-- POLICIES: KUDOS
-- ============================================================
DROP POLICY IF EXISTS "kudos_select" ON public.kudos;
CREATE POLICY "kudos_select" ON public.kudos FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR public.is_active_user()
  );

DROP POLICY IF EXISTS "kudos_insert" ON public.kudos;
CREATE POLICY "kudos_insert" ON public.kudos FOR INSERT
  TO authenticated WITH CHECK (
    from_user_id = auth.uid() AND public.is_active_user()
  );

DROP POLICY IF EXISTS "kudos_delete" ON public.kudos;
CREATE POLICY "kudos_delete" ON public.kudos FOR DELETE
  TO authenticated USING (from_user_id = auth.uid() OR public.is_founder());

-- ============================================================
-- POLICIES: EQUITY HOLDINGS
-- ============================================================
DROP POLICY IF EXISTS "equity_select" ON public.equity_holdings;
CREATE POLICY "equity_select" ON public.equity_holdings FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "equity_insert" ON public.equity_holdings;
CREATE POLICY "equity_insert" ON public.equity_holdings FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "equity_update" ON public.equity_holdings;
CREATE POLICY "equity_update" ON public.equity_holdings FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "equity_delete" ON public.equity_holdings;
CREATE POLICY "equity_delete" ON public.equity_holdings FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: INVESTOR MEMOS
-- ============================================================
DROP POLICY IF EXISTS "memos_select" ON public.investor_memos;
CREATE POLICY "memos_select" ON public.investor_memos FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "memos_insert" ON public.investor_memos;
CREATE POLICY "memos_insert" ON public.investor_memos FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "memos_update" ON public.investor_memos;
CREATE POLICY "memos_update" ON public.investor_memos FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "memos_delete" ON public.investor_memos;
CREATE POLICY "memos_delete" ON public.investor_memos FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: TECH STACK
-- ============================================================
DROP POLICY IF EXISTS "tech_select" ON public.tech_stack;
CREATE POLICY "tech_select" ON public.tech_stack FOR SELECT
  TO authenticated USING (public.product_member(product_id));

DROP POLICY IF EXISTS "tech_insert" ON public.tech_stack;
CREATE POLICY "tech_insert" ON public.tech_stack FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "tech_update" ON public.tech_stack;
CREATE POLICY "tech_update" ON public.tech_stack FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "tech_delete" ON public.tech_stack;
CREATE POLICY "tech_delete" ON public.tech_stack FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: ACCOUNT REQUESTS
-- ============================================================
-- Anyone (anon too, since the requester is not yet authenticated) can create a
-- request; only founders can read/approve. We use anon+authenticated for INSERT.
DROP POLICY IF EXISTS "req_select" ON public.account_requests;
CREATE POLICY "req_select" ON public.account_requests FOR SELECT
  TO authenticated USING (public.is_founder());

DROP POLICY IF EXISTS "req_insert" ON public.account_requests;
CREATE POLICY "req_insert" ON public.account_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "req_update" ON public.account_requests;
CREATE POLICY "req_update" ON public.account_requests FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "req_delete" ON public.account_requests;
CREATE POLICY "req_delete" ON public.account_requests FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- POLICIES: FOUNDER INVITES
-- ============================================================
DROP POLICY IF EXISTS "invites_select" ON public.founder_invites;
CREATE POLICY "invites_select" ON public.founder_invites FOR SELECT
  TO authenticated USING (public.is_founder());

DROP POLICY IF EXISTS "invites_delete" ON public.founder_invites;
CREATE POLICY "invites_delete" ON public.founder_invites FOR DELETE
  TO authenticated USING (public.is_founder());

-- ============================================================
-- SEED: Parallane product (real, not demo)
-- ============================================================
INSERT INTO public.products (name, slug, description, color)
SELECT 'Parallane', 'parallane',
  'Construction project-management software for Ethiopian contractors.',
  '#6C63FF'
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE slug = 'parallane');
