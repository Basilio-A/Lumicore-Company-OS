import { useEffect, useState, useCallback } from 'react';
import { Plus, BookOpen, Search, Trash2, Tag } from 'lucide-react';
import { supabase, type KbEntry } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Badge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { formatRelative } from '@/lib/utils';

const CATEGORIES: { key: KbEntry['category']; label: string; color: string }[] = [
  { key: 'note', label: 'Note', color: '#3B82F6' },
  { key: 'interview', label: 'Interview', color: '#F59E0B' },
  { key: 'book', label: 'Book', color: '#8B5CF6' },
  { key: 'reference', label: 'Reference', color: '#10B981' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

export default function KnowledgeBasePage() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [selected, setSelected] = useState<KbEntry | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from('knowledge_base').select('*').order('updated_at', { ascending: false });
    if (product) q = q.eq('product_id', product.id);
    const { data } = await q;
    setEntries(data || []);
    if (data && data.length > 0 && !selected) setSelected(data[0]);
  }, [product]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;

  const allTags = [...new Set(entries.flatMap((e) => e.tags))];
  let filtered = entries.filter((e) => e.title.toLowerCase().includes(query.toLowerCase()));
  if (activeTag) filtered = filtered.filter((e) => e.tags.includes(activeTag));

  return (
    <PageContainer title="Knowledge Base" actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Entry</Button>}>
      <div className="grid lg:grid-cols-[280px_1fr] gap-4 min-h-[60vh]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <Input className="pl-8" placeholder="Search knowledge…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)} className={`text-xs rounded-md px-2 py-1 transition-colors ${activeTag === t ? 'accent-bg text-white' : 'surface-2 text-muted hover:text-[var(--text)]'}`}>
                  <Tag className="w-2.5 h-2.5 inline mr-1" />{t}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-0.5">
            {filtered.map((e) => {
              const cat = CATEGORIES.find((c) => c.key === e.category);
              return (
                <button key={e.id} onClick={() => setSelected(e)} className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${selected?.id === e.id ? 'accent-tint-bg accent' : 'hover:surface-2'}`}>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-sm font-medium truncate flex-1">{e.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-5">
                    {cat && <Badge color={cat.color}>{cat.label}</Badge>}
                    <span className="text-[10px] text-muted">{formatRelative(e.updated_at)}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="text-xs text-muted px-3 py-4">No entries found</div>}
          </div>
        </div>
        <div className="surface rounded-xl p-6">
          {selected ? <KbEditor entry={selected} currentUserId={profile?.id || null} onSaved={load} /> : <EmptyState icon={<BookOpen className="w-8 h-8" />} title="Select an entry" description="Choose from the list or create a new entry." />}
        </div>
      </div>
      {creating && <KbCreator product={product} currentUserId={profile?.id || null} onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); setSelected(e); load(); }} />}
    </PageContainer>
  );
}

function KbEditor({ entry, onSaved }: { entry: KbEntry; currentUserId: string | null; onSaved: () => void }) {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [tags, setTags] = useState(entry.tags.join(', '));
  const [category, setCategory] = useState<KbEntry['category']>(entry.category);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
    await supabase.from('knowledge_base').update({ title: title.trim(), content, tags: tagArr, category }).eq('id', entry.id);
    setSaving(false);
    setEditing(false);
    onSaved();
  };

  const del = async () => {
    await supabase.from('knowledge_base').delete().eq('id', entry.id);
    onSaved();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        {editing ? <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-semibold" /> : <h2 className="text-lg font-display font-semibold text-[var(--text)]">{entry.title}</h2>}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setTitle(entry.title); setContent(entry.content); }}>Cancel</Button>
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
        <div className="space-y-3">
          <div className="flex gap-3">
            <Select value={category} onChange={(e) => setCategory(e.target.value as KbEntry['category'])} className="w-40">
              {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated" />
          </div>
          <Textarea rows={20} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm" placeholder="Write in markdown…" />
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            {(() => { const cat = CATEGORIES.find((c) => c.key === entry.category); return cat ? <Badge color={cat.color}>{cat.label}</Badge> : null; })()}
            {entry.tags.map((t) => <Badge key={t} className="surface-2 text-muted">{t}</Badge>)}
          </div>
          {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-muted">Empty entry. Click Edit to add content.</p>}
        </div>
      )}
    </div>
  );
}

function KbCreator({ product, currentUserId, onClose, onCreated }: { product: { id: string } | null; currentUserId: string | null; onClose: () => void; onCreated: (e: KbEntry) => void }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KbEntry['category']>('note');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim() || !currentUserId) return;
    setSaving(true);
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const { data } = await supabase.from('knowledge_base').insert({ product_id: product?.id || null, title: title.trim(), content, category, tags: tagArr, created_by: currentUserId }).select('*').single();
    setSaving(false);
    if (data) onCreated(data as KbEntry);
  };
  return (
    <Modal open onClose={onClose} title="New Knowledge Base Entry" className="max-w-xl">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interview notes, book summary, etc." autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Category</label><Select value={category} onChange={(e) => setCategory(e.target.value as KbEntry['category'])}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Tags (comma-separated)</label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="research, q3, customer" /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Content (Markdown)</label><Textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Heading&#10;&#10;Write your entry content here…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create'}</Button></div>
    </Modal>
  );
}
