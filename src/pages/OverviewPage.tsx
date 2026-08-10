import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  KanbanSquare,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Plus,
  Pencil,
} from 'lucide-react';
import { supabase, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Card, Button, Modal, Input, Textarea, Select, Badge, EmptyState } from '@/components/ui';
import { ImageUpload } from '@/components/ImageUpload';

interface ProductStats {
  product: Product;
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  teamSize: number;
  recentDocs: number;
}

const PHASES: { key: Product['phase']; label: string }[] = [
  { key: 'ideation', label: 'Ideation' },
  { key: 'mvp', label: 'MVP' },
  { key: 'growth', label: 'Growth' },
  { key: 'scale', label: 'Scale' },
  { key: 'mature', label: 'Mature' },
];

export default function OverviewPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);

  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';

  useEffect(() => {
    if (isInvestor) navigate('/company/investors', { replace: true });
  }, [isInvestor, navigate]);

  const load = async () => {
    const { data: products } = await supabase.from('products').select('*').order('name');
    if (!products) { setLoading(false); return; }
    const result: ProductStats[] = [];
    for (const p of products as Product[]) {
      const [tasks, members, docs] = await Promise.all([
        supabase.from('tasks').select('id, status, due_date').eq('product_id', p.id),
        supabase.from('product_members').select('id').eq('product_id', p.id),
        supabase.from('docs').select('id, updated_at').eq('product_id', p.id).order('updated_at', { ascending: false }).limit(5),
      ]);
      const now = new Date();
      const overdue = (tasks.data || []).filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== 'done').length;
      result.push({ product: p, totalTasks: tasks.data?.length || 0, doneTasks: (tasks.data || []).filter((t) => t.status === 'done').length, overdueTasks: overdue, teamSize: members.data?.length || 0, recentDocs: docs.data?.length || 0 });
    }
    setStats(result);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (isInvestor) return null;

  return (
    <PageContainer title="Company Overview" actions={isFounder && <Button size="sm" onClick={() => setCreatingProduct(true)}><Plus className="w-4 h-4" /> New Product</Button>}>
      <p className="text-sm text-muted -mt-2 mb-6">
        {isFounder ? 'Portfolio of every product Lumicore runs.' : 'Products you have access to.'}
      </p>

      {loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : stats.length === 0 ? (
        <Card className="p-8 text-center"><EmptyState title="No products yet" description={isFounder ? 'Create your first product to get started.' : 'Products will appear here once created.'} action={isFounder && <Button size="sm" onClick={() => setCreatingProduct(true)}><Plus className="w-4 h-4" /> New Product</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => {
            const pct = s.totalTasks > 0 ? Math.round((s.doneTasks / s.totalTasks) * 100) : 0;
            return (
              <Card key={s.product.id} className="p-5 cursor-pointer hover:shadow-soft-lg transition-shadow group">
                <div onClick={() => navigate(`/product/${s.product.slug}/dashboard`)}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {s.product.logo_url ? (
                        <img src={s.product.logo_url} alt={s.product.name} className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: s.product.color }}>{s.product.name[0]}</div>
                      )}
                      <div>
                        <h3 className="font-display font-semibold text-[var(--text)]">{s.product.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge color={s.product.color}>{s.product.slug}</Badge>
                          <Badge color="#6B7280">{PHASES.find((p) => p.key === s.product.phase)?.label || s.product.phase}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isFounder && (
                        <button onClick={(e) => { e.stopPropagation(); setEditingProduct(s.product); }} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className="text-sm text-muted mb-4 line-clamp-2 min-h-[2.5rem]">{s.product.description || 'No description'}</p>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted">Task progress</span>
                      <span className="font-medium text-[var(--text)]">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full surface-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.product.color }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat icon={CheckCircle2} label="Done" value={s.doneTasks} color="text-emerald-500" />
                    <Stat icon={Clock} label="Open" value={s.totalTasks - s.doneTasks} color="text-blue-500" />
                    <Stat icon={AlertCircle} label="Overdue" value={s.overdueTasks} color="text-rose-500" />
                  </div>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-app text-xs text-muted">
                    <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {s.teamSize} members</span>
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {s.recentDocs} docs</span>
                    {s.product.website && <span className="flex items-center gap-1.5 truncate"><a href={s.product.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">{s.product.website}</a></span>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(editingProduct || creatingProduct) && (
        <ProductEditor
          product={editingProduct}
          onClose={() => { setEditingProduct(null); setCreatingProduct(false); }}
          onSaved={() => { setEditingProduct(null); setCreatingProduct(false); load(); }}
        />
      )}
    </PageContainer>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof KanbanSquare; label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
      <div className="text-lg font-semibold text-[var(--text)]">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function ProductEditor({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
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

  const colors = ['#6C63FF', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444'];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      name: name.trim(),
      slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-'),
      description: description || null,
      color,
      phase,
      logo_url: logoUrl || null,
      website: website || null,
      status,
    };
    let result;
    if (product) result = await supabase.from('products').update(payload).eq('id', product.id);
    else result = await supabase.from('products').insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit Product' : 'New Product'} className="max-w-lg">
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div><label className="block text-xs font-medium text-muted mb-1.5">Product name</label><Input value={name} onChange={(e) => { setName(e.target.value); if (!product) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }} placeholder="Parallane" autoFocus /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Slug</label><Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="parallane" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this product do?" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Logo</label>
          <ImageUpload
            bucket="product-logos"
            value={logoUrl || null}
            onChange={(url) => setLogoUrl(url || '')}
            shape="square"
            size="md"
            label="Upload logo"
          />
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Website</label><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://parallane.com" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Color theme</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border border-app bg-transparent p-0.5"
              title="Pick a brand color"
            />
            <div className="flex flex-wrap gap-2">
              {colors.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-lg transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-[var(--accent)] scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />)}
            </div>
          </div>
          <p className="text-xs text-muted mt-1">Selected: <span className="font-mono">{color}</span></p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Phase</label><Select value={phase} onChange={(e) => setPhase(e.target.value as Product['phase'])}>{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Status</label><Select value={status} onChange={(e) => setStatus(e.target.value as Product['status'])}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></Select></div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button></div>
    </Modal>
  );
}
