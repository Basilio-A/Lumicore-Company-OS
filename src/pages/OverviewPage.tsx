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
import { supabase, type Product, canManageProducts } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/context/ProductsContext';
import { PageContainer } from '@/components/AppLayout';
import { Card, Button, Badge, EmptyState } from '@/components/ui';
import { isPastDueDate } from '@/lib/utils';
import { ProductEditor, PRODUCT_PHASES } from '@/components/ProductEditor';

interface ProductStats {
  product: Product;
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  teamSize: number;
  recentDocs: number;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);

  const isInvestor = profile?.role === 'investor';
  const canEditProducts = canManageProducts(profile?.role);

  useEffect(() => {
    if (isInvestor) navigate('/company/investors', { replace: true });
  }, [isInvestor, navigate]);

  useEffect(() => {
    if (productsLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result: ProductStats[] = [];
      for (const p of products) {
        const [tasks, members, docs] = await Promise.all([
          supabase.from('tasks').select('id, status, due_date').eq('product_id', p.id),
          supabase.from('product_members').select('id').eq('product_id', p.id),
          supabase.from('docs').select('id, updated_at').eq('product_id', p.id).order('updated_at', { ascending: false }).limit(5),
        ]);
        if (cancelled) return;
        const overdue = (tasks.data || []).filter((t) => t.status !== 'done' && isPastDueDate(t.due_date)).length;
        result.push({
          product: p,
          totalTasks: tasks.data?.length || 0,
          doneTasks: (tasks.data || []).filter((t) => t.status === 'done').length,
          overdueTasks: overdue,
          teamSize: members.data?.length || 0,
          recentDocs: docs.data?.length || 0,
        });
      }
      if (!cancelled) {
        setStats(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [products, productsLoading]);

  if (isInvestor) return null;

  const displayStats = products.map((p) => {
    const existing = stats.find((s) => s.product.id === p.id);
    return existing
      ? { ...existing, product: p }
      : { product: p, totalTasks: 0, doneTasks: 0, overdueTasks: 0, teamSize: 0, recentDocs: 0 };
  });

  return (
    <PageContainer title="Company Overview" actions={canEditProducts && <Button size="sm" onClick={() => setCreatingProduct(true)}><Plus className="w-4 h-4" /> New Product</Button>}>
      <p className="text-sm text-muted -mt-2 mb-6">
        {canEditProducts ? 'Portfolio of every product Lumicore runs.' : 'Products you have access to.'}
      </p>

      {loading && displayStats.length === 0 ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : displayStats.length === 0 ? (
        <Card className="p-8 text-center"><EmptyState title="No products yet" description={canEditProducts ? 'Create your first product to get started.' : 'Products will appear here once created.'} action={canEditProducts && <Button size="sm" onClick={() => setCreatingProduct(true)}><Plus className="w-4 h-4" /> New Product</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayStats.map((s) => {
            const pct = s.totalTasks > 0 ? Math.round((s.doneTasks / s.totalTasks) * 100) : 0;
            return (
              <Card key={s.product.id} className={`p-5 cursor-pointer hover:shadow-soft-lg transition-shadow group ${s.product.status === 'archived' ? 'opacity-70' : ''}`}>
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
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <Badge color={s.product.color}>{s.product.slug}</Badge>
                          <Badge color="#6B7280">{PRODUCT_PHASES.find((p) => p.key === s.product.phase)?.label || s.product.phase}</Badge>
                          {s.product.status !== 'active' && (
                            <Badge color={s.product.status === 'archived' ? '#9CA3AF' : '#F59E0B'}>
                              {s.product.status === 'archived' ? 'Archived' : 'Paused'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEditProducts && (
                        <button onClick={(e) => { e.stopPropagation(); setEditingProduct(s.product); }} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2 transition-opacity" title="Edit product">
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
          key={editingProduct?.id ?? 'new'}
          product={editingProduct}
          onClose={() => { setEditingProduct(null); setCreatingProduct(false); }}
          onSaved={() => { setEditingProduct(null); setCreatingProduct(false); }}
          onDeleted={() => { setEditingProduct(null); setCreatingProduct(false); }}
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
