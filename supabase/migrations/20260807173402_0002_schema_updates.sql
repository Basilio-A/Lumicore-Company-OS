/*
# Company OS — schema update for feature expansion

## Changes
1. tasks: add `department` column for filtering
2. task_assignees: new junction table for multiple assignees per task
3. product_members: expand product_role CHECK to include dev, design, pm, qa, data, marketing, sales, ops
4. tech_stack: add `cost_type`, `monthly_cost`, `per_user_cost`, `contract_end` columns
5. account_requests: add `approval_code` column for code-based approval
6. chat_channels SELECT policy: allow product members to see channels
7. handle_new_user: support employee approval codes
8. admin_approve_employee: new function for founders to approve + generate code
9. admin_create_account: new function for founders to create accounts directly
10. profiles: add `department` column
11. investor_reports: new table for structured investor update reports
*/

-- 1. tasks: add department column
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'department') THEN
    ALTER TABLE public.tasks ADD COLUMN department text;
  END IF;
END $$;

-- 2. task_assignees junction table
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ta_select" ON public.task_assignees;
CREATE POLICY "ta_select" ON public.task_assignees FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id AND public.product_member(t.product_id)
    )
  );

DROP POLICY IF EXISTS "ta_insert" ON public.task_assignees;
CREATE POLICY "ta_insert" ON public.task_assignees FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id AND public.product_member(t.product_id)
    )
  );

DROP POLICY IF EXISTS "ta_delete" ON public.task_assignees;
CREATE POLICY "ta_delete" ON public.task_assignees FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignees.task_id AND public.product_member(t.product_id)
    )
  );

-- 3. product_members: expand product_role
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'product_members_product_role_check'
  ) THEN
    ALTER TABLE public.product_members DROP CONSTRAINT product_members_product_role_check;
  END IF;
END $$;
ALTER TABLE public.product_members ADD CONSTRAINT product_members_product_role_check
  CHECK (product_role IN ('lead','member','developer','designer','product_manager','qa_engineer','data_scientist','ml_engineer','devops','marketing','sales','operations'));

-- 4. tech_stack: add cost columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'cost_type') THEN
    ALTER TABLE public.tech_stack ADD COLUMN cost_type text DEFAULT 'free' CHECK (cost_type IN ('free','monthly','per_user','annual','one_time'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'monthly_cost') THEN
    ALTER TABLE public.tech_stack ADD COLUMN monthly_cost numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'per_user_cost') THEN
    ALTER TABLE public.tech_stack ADD COLUMN per_user_cost numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tech_stack' AND column_name = 'contract_end') THEN
    ALTER TABLE public.tech_stack ADD COLUMN contract_end date;
  END IF;
END $$;

-- 5. account_requests: add approval_code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_requests' AND column_name = 'approval_code') THEN
    ALTER TABLE public.account_requests ADD COLUMN approval_code text;
  END IF;
END $$;

-- 6. profiles: add department
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'department') THEN
    ALTER TABLE public.profiles ADD COLUMN department text DEFAULT '';
  END IF;
END $$;

-- 7. investor_reports: structured investor update reports
CREATE TABLE IF NOT EXISTS public.investor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  period text NOT NULL,
  summary text NOT NULL DEFAULT '',
  highlights text NOT NULL DEFAULT '',
  metrics text NOT NULL DEFAULT '',
  challenges text NOT NULL DEFAULT '',
  financials text NOT NULL DEFAULT '',
  next_steps text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.investor_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ir_select" ON public.investor_reports;
CREATE POLICY "ir_select" ON public.investor_reports FOR SELECT
  TO authenticated USING (public.is_founder() OR public.is_investor());

DROP POLICY IF EXISTS "ir_insert" ON public.investor_reports;
CREATE POLICY "ir_insert" ON public.investor_reports FOR INSERT
  TO authenticated WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "ir_update" ON public.investor_reports;
CREATE POLICY "ir_update" ON public.investor_reports FOR UPDATE
  TO authenticated USING (public.is_founder()) WITH CHECK (public.is_founder());

DROP POLICY IF EXISTS "ir_delete" ON public.investor_reports;
CREATE POLICY "ir_delete" ON public.investor_reports FOR DELETE
  TO authenticated USING (public.is_founder());

DROP TRIGGER IF EXISTS ir_touch ON public.investor_reports;
CREATE TRIGGER ir_touch BEFORE UPDATE ON public.investor_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Fix chat_channels SELECT: allow product members to see channels
DROP POLICY IF EXISTS "channels_select" ON public.chat_channels;
CREATE POLICY "channels_select" ON public.chat_channels FOR SELECT
  TO authenticated USING (
    public.is_founder()
    OR (
      product_id IS NOT NULL AND public.product_member(product_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_memberships cm
      WHERE cm.channel_id = chat_channels.id AND cm.user_id = auth.uid()
    )
  );

-- Fix chat_memberships INSERT: allow product members to join channels
DROP POLICY IF EXISTS "cm_insert" ON public.chat_memberships;
CREATE POLICY "cm_insert" ON public.chat_memberships FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR public.is_founder()
    OR (
      EXISTS (
        SELECT 1 FROM public.chat_channels ch
        WHERE ch.id = chat_memberships.channel_id
        AND ch.product_id IS NOT NULL
        AND public.product_member(ch.product_id)
      )
    )
  );

-- 9. admin_approve_employee: generates approval code for employee signup
CREATE OR REPLACE FUNCTION public.admin_approve_employee(req_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code text;
  v_email text;
  v_name text;
  v_title text;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can approve requests';
  END IF;
  SELECT email, full_name, title INTO v_email, v_name, v_title
    FROM public.account_requests WHERE id = req_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  v_code := encode(gen_random_bytes(9), 'hex');
  UPDATE public.account_requests
    SET status = 'approved', reviewed_by = auth.uid(),
        reviewed_at = now(), approval_code = v_code
    WHERE id = req_id;
  RETURN v_code;
END;
$$;

-- 10. admin_create_account: founder creates account directly, returns code
CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_email text,
  p_full_name text,
  p_role text,
  p_title text DEFAULT '',
  p_department text DEFAULT ''
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT public.is_founder() THEN
    RAISE EXCEPTION 'Only founders can create accounts';
  END IF;
  IF p_role NOT IN ('employee','investor') THEN
    RAISE EXCEPTION 'Can only create employee or investor accounts';
  END IF;
  v_code := encode(gen_random_bytes(9), 'hex');
  INSERT INTO public.account_requests (email, full_name, title, status, approval_code, reviewed_by, reviewed_at, message)
  VALUES (p_email, p_full_name, p_title, 'approved', v_code, auth.uid(), now(), p_department);
  RETURN v_code;
END;
$$;

-- 11. handle_new_user: support approval codes for employees
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
  v_founder_count int;
  v_invite text;
  v_approval_code text;
  v_req public.account_requests%ROWTYPE;
  v_title text;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'employee');
  v_status := 'pending';
  v_title := COALESCE(new.raw_user_meta_data->>'title', '');

  IF v_role = 'founder' THEN
    SELECT count(*) INTO v_founder_count
      FROM public.profiles WHERE role = 'founder' AND status = 'active';
    IF v_founder_count = 0 THEN
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
        v_role := 'employee';
        v_status := 'pending';
      END IF;
    END IF;
  ELSIF v_role = 'employee' THEN
    v_approval_code := new.raw_user_meta_data->>'approval_code';
    IF v_approval_code IS NOT NULL THEN
      SELECT * INTO v_req FROM public.account_requests
        WHERE approval_code = v_approval_code AND status = 'approved';
      IF FOUND THEN
        v_status := 'active';
        v_title := COALESCE(v_req.title, v_title);
        UPDATE public.account_requests
          SET approval_code = NULL WHERE id = v_req.id;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, title, role, status, department)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    v_title,
    v_role,
    v_status,
    COALESCE(new.raw_user_meta_data->>'department', '')
  );
  RETURN new;
END;
$$;
