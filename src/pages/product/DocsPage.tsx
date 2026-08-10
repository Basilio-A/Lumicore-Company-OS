import { useEffect, useState, useCallback } from 'react';
import { Plus, FileText, Search, Trash2, Folder } from 'lucide-react';
import { supabase, type Doc } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Modal, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { formatRelative } from '@/lib/utils';

export default function DocsPage() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!product) return;
    const { data } = await supabase.from('docs').select('*').eq('product_id', product.id).order('updated_at', { ascending: false });
    setDocs(data || []);
    if (data && data.length > 0 && !selected) setSelected(data[0]);
  }, [product]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase()));
  const folders = [...new Set(docs.map((d) => d.folder).filter(Boolean))] as string[];

  return (
    <PageContainer title="Docs" actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Doc</Button>}>
      <div className="grid lg:grid-cols-[260px_1fr] gap-4 min-h-[60vh]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input className="pl-8" placeholder="Search docs…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {folders.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-1">Folders</div>
              {folders.map((f) => (
                <div key={f} className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted rounded-lg hover:surface-2">
                  <Folder className="w-3.5 h-3.5" /> {f}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-0.5">
            {filtered.map((d) => (
              <button key={d.id} onClick={() => setSelected(d)} className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${selected?.id === d.id ? 'accent-tint-bg accent' : 'hover:surface-2'}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{d.title}</span>
                </div>
                <div className="text-[10px] text-muted mt-0.5 ml-5">{formatRelative(d.updated_at)}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-xs text-muted px-3 py-4">No docs found</div>}
          </div>
        </div>
        <div className="surface rounded-xl p-6">
          {selected ? <DocEditor doc={selected} currentUserId={profile?.id || null} onSaved={load} /> : <EmptyState icon={<FileText className="w-8 h-8" />} title="Select a doc" description="Choose a doc from the list or create a new one." />}
        </div>
      </div>
      {creating && <DocCreator product={product} currentUserId={profile?.id || null} onClose={() => setCreating(false)} onCreated={(d) => { setCreating(false); setSelected(d); load(); }} />}
    </PageContainer>
  );
}

function DocEditor({ doc, currentUserId, onSaved }: { doc: Doc; currentUserId: string | null; onSaved: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await supabase.from('docs').update({ title: title.trim(), content }).eq('id', doc.id);
    setSaving(false);
    setEditing(false);
    onSaved();
  };

  const del = async () => {
    await supabase.from('docs').delete().eq('id', doc.id);
    onSaved();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {editing ? <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" /> : <h2 className="text-lg font-display font-semibold text-[var(--text)]">{doc.title}</h2>}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setTitle(doc.title); setContent(doc.content); }}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /></Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <Textarea rows={24} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm" placeholder="Write in markdown…" />
      ) : (
        <div className="prose-sm">
          {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-muted">This doc is empty. Click Edit to add content.</p>}
        </div>
      )}
    </div>
  );
}

function DocCreator({ product, currentUserId, onClose, onCreated }: { product: { id: string }; currentUserId: string | null; onClose: () => void; onCreated: (d: Doc) => void }) {
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim() || !currentUserId) return;
    setSaving(true);
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const { data } = await supabase.from('docs').insert({ product_id: product.id, title: title.trim(), content, folder: folder.trim() || null, tags: tagArr, created_by: currentUserId }).select('*').single();
    setSaving(false);
    if (data) onCreated(data as Doc);
  };
  return (
    <Modal open onClose={onClose} title="New Doc" className="max-w-xl">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PRD, Meeting Notes, etc." autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Folder (optional)</label><Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Engineering, Product…" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Tags (comma-separated)</label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="spec, v1, draft" /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Content (Markdown)</label><Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Heading\n\nWrite your doc content here…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create'}</Button></div>
    </Modal>
  );
}
