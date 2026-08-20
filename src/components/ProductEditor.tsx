import { useState } from 'react';
import { supabase, type Product } from '@/lib/supabase';
import { useProducts } from '@/context/ProductsContext';
import { Button, Input, Textarea, Select, Modal } from '@/components/ui';
import { ImageUpload } from '@/components/ImageUpload';

export const PRODUCT_PHASES: { key: Product['phase']; label: string }[] = [
  { key: 'ideation', label: 'Ideation' },
  { key: 'mvp', label: 'MVP' },
  { key: 'growth', label: 'Growth' },
  { key: 'scale', label: 'Scale' },
  { key: 'mature', label: 'Mature' },
];

export function ProductEditor({
  product,
  onClose,
  onSaved,
  onDeleted,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (saved?: Product) => void;
  onDeleted?: (id: string) => void;
}) {
  const { upsertProduct, removeProduct } = useProducts();
  const [name, setName] = useState(product?.name || '');
  const [slug, setSlug] = useState(product?.slug || '');
  const [description, setDescription] = useState(product?.description || '');
  const [color, setColor] = useState(product?.color || '#6C63FF');
  const [phase, setPhase] = useState<Product['phase']>(product?.phase || 'ideation');
  const [logoUrl, setLogoUrl] = useState(product?.logo_url || '');
  const [website, setWebsite] = useState(product?.website || '');
  const [status, setStatus] = useState<Product['status']>(product?.status || 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const colors = ['#6C63FF', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444'];

  const payload = () => ({
    name: name.trim(),
    slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'),
    description: description || null,
    color,
    phase,
    logo_url: logoUrl || null,
    website: website || null,
    status,
  });

  const save = async (nextStatus?: Product['status']) => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const body = { ...payload(), status: nextStatus ?? status };
    const result = product
      ? await supabase.from('products').update(body).eq('id', product.id).select('*').single()
      : await supabase.from('products').insert(body).select('*').single();
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    const saved = result.data as Product;
    upsertProduct(saved);
    onSaved(saved);
  };

  const destroy = async () => {
    if (!product || deleteName.trim() !== product.name) return;
    setDeleting(true);
    setError('');
    const result = await supabase.from('products').delete().eq('id', product.id);
    setDeleting(false);
    if (result.error) { setError(result.error.message); return; }
    removeProduct(product.id);
    onDeleted?.(product.id);
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit Product' : 'New Product'} className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Product name</label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!product) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            }}
            placeholder="Parallane"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Slug</label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="parallane" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this product do?" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Logo</label>
          <ImageUpload
            bucket="products"
            value={logoUrl || null}
            onChange={(url) => setLogoUrl(url || '')}
            shape="square"
            size="md"
            label="Upload logo"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Website</label>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://parallane.com" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Color theme</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border border-app bg-transparent p-0.5"
              title="Pick a brand color"
            />
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-[var(--accent)] scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted mt-1">Selected: <span className="font-mono">{color}</span></p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Phase</label>
            <Select value={phase} onChange={(e) => setPhase(e.target.value as Product['phase'])}>
              {PRODUCT_PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Product['status'])}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
        </div>

        {product && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 space-y-2">
            <p className="text-xs font-medium text-rose-500">Danger zone</p>
            {confirmDelete ? (
              <>
                <p className="text-xs text-muted">
                  This permanently deletes <span className="font-medium text-[var(--text)]">{product.name}</span> and its tasks, docs, chat, and team. Type the product name to confirm.
                </p>
                <Input
                  value={deleteName}
                  onChange={(e) => setDeleteName(e.target.value)}
                  placeholder={product.name}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setConfirmDelete(false); setDeleteName(''); }}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => void destroy()}
                    disabled={deleting || deleteName.trim() !== product.name}
                  >
                    {deleting ? 'Deleting…' : 'Delete forever'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">Archive hides it from the sidebar. Delete removes it completely.</p>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center gap-2">
        {product && !confirmDelete && (
          <div className="flex gap-2 mr-auto">
            {status !== 'archived' && (
              <Button variant="secondary" size="sm" onClick={() => void save('archived')} disabled={saving}>
                Archive
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
