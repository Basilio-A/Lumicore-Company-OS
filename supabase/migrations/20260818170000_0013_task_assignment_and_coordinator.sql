-- Task assignment: founders + task coordinators can assign.
-- Product role task_coordinator can assign on that product.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_members_product_role_check'
      AND conrelid = 'public.product_members'::regclass
  ) THEN
    ALTER TABLE public.product_members DROP CONSTRAINT product_members_product_role_check;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_members_product_role_check'
      AND conrelid = 'public.product_members'::regclass
  ) THEN
    ALTER TABLE public.product_members
      ADD CONSTRAINT product_members_product_role_check
      CHECK (product_role IN (
        'lead','member','developer','designer','product_manager','qa_engineer',
        'data_scientist','ml_engineer','devops','marketing','sales','operations',
        'task_coordinator'
      ));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.can_assign_tasks(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_founder()
  OR EXISTS (
    SELECT 1 FROM public.product_members
    WHERE product_id = p_product_id
      AND user_id = (SELECT auth.uid())
      AND product_role = 'task_coordinator'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_assign_tasks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_assign_tasks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assignee_id IS NOT NULL AND NOT public.can_assign_tasks(NEW.product_id) THEN
      RAISE EXCEPTION 'Only founders and task coordinators can assign tasks';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     AND NOT public.can_assign_tasks(NEW.product_id) THEN
    RAISE EXCEPTION 'Only founders and task coordinators can assign tasks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enforce_assignment ON public.tasks;
CREATE TRIGGER tasks_enforce_assignment
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_task_assignment();

DROP POLICY IF EXISTS task_assignees_all ON public.task_assignees;
DROP POLICY IF EXISTS "ta_insert" ON public.task_assignees;
CREATE POLICY "ta_insert" ON public.task_assignees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND public.can_assign_tasks(t.product_id)
    )
  );

DROP POLICY IF EXISTS "ta_delete" ON public.task_assignees;
CREATE POLICY "ta_delete" ON public.task_assignees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND public.can_assign_tasks(t.product_id)
    )
  );
