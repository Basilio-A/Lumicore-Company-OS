-- Chat attachments (photos, audio, voice, docs) and @mentions
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.chat_messages
  ALTER COLUMN content SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_chat_messages_mentions
  ON public.chat_messages USING gin (mentions);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-attachments', 'chat-attachments', true, 52428800, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "chat_attachments_read" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_upload" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;

CREATE POLICY "chat_attachments_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "chat_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments');
