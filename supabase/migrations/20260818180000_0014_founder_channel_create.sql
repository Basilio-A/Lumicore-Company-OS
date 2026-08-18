-- Only founders can create named channels. Anyone active can still open DMs.
DROP POLICY IF EXISTS "channels_insert" ON public.chat_channels;
CREATE POLICY "channels_insert" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND (type = 'dm' OR public.is_founder())
  );
