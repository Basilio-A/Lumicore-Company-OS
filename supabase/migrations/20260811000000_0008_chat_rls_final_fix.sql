/*
 * Migration 0008 — Chat RLS final fix
 *
 * Drops and recreates ALL RLS policies on chat_channels, chat_memberships,
 * and chat_messages using only simple is_active_user() / is_founder() checks.
 * No policy queries into chat_memberships from within a chat_memberships policy.
 * This permanently eliminates the infinite recursion error.
 */

-- ── chat_channels ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "channels_select"   ON public.chat_channels;
DROP POLICY IF EXISTS "channels_insert"   ON public.chat_channels;
DROP POLICY IF EXISTS "channels_update"   ON public.chat_channels;
DROP POLICY IF EXISTS "channels_delete"   ON public.chat_channels;

-- Any active authenticated user can read and create channels
CREATE POLICY "channels_select" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "channels_insert" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_user());

-- Only founders can modify or delete channels
CREATE POLICY "channels_update" ON public.chat_channels
  FOR UPDATE TO authenticated
  USING (public.is_founder())
  WITH CHECK (public.is_founder());

CREATE POLICY "channels_delete" ON public.chat_channels
  FOR DELETE TO authenticated
  USING (public.is_founder());

-- ── chat_memberships ─────────────────────────────────────────────────────────
-- CRITICAL: these policies must NOT reference chat_memberships in subqueries
-- or they will cause infinite recursion. Use only is_active_user().
DROP POLICY IF EXISTS "cm_select"  ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_insert"  ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_update"  ON public.chat_memberships;
DROP POLICY IF EXISTS "cm_delete"  ON public.chat_memberships;

CREATE POLICY "cm_select" ON public.chat_memberships
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "cm_insert" ON public.chat_memberships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_user());

-- Founders can delete any membership; users can remove themselves
CREATE POLICY "cm_delete" ON public.chat_memberships
  FOR DELETE TO authenticated
  USING (public.is_founder() OR user_id = auth.uid());

-- ── chat_messages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "msg_select"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_insert"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_update"  ON public.chat_messages;
DROP POLICY IF EXISTS "msg_delete"  ON public.chat_messages;

CREATE POLICY "msg_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_active_user());

CREATE POLICY "msg_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "msg_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_founder());

-- ── Ensure chat_channels has a 'type' column (for DM support) ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_channels' AND column_name = 'type'
  ) THEN
    ALTER TABLE public.chat_channels
      ADD COLUMN type text NOT NULL DEFAULT 'channel'
      CHECK (type IN ('channel', 'dm'));
  END IF;
END $$;
