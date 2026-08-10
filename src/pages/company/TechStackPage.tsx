import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, Layers, Search, DollarSign } from 'lucide-react';
import { supabase, type TechStackEntry, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

const CATEGORIES: { key: TechStackEntry['category']; label: string; color: string; description: string }[] = [
  { key: 'infrastructure', label: 'Infrastructure', color: '#3B82F6', description: 'Cloud, hosting, networking' },
  { key: 'saas', label: 'SaaS', color: '#10B981', description: 'Hosted subscriptions' },
  { key: 'tooling', label: 'Tooling', color: '#F59E0B', description: 'CI/CD, observability' },
  { key: 'api', label: 'API', color: '#EC4899', description: 'Third-party integrations' },
  { key: 'frontend', label: 'Frontend', color: '#6C63FF', description: 'UI frameworks & libs' },
  { key: 'backend', label: 'Backend', color: '#8B5CF6', description: 'Server & runtimes' },
  { key: 'database', label: 'Database', color: '#06B6D4', description: 'Data stores & caches' },
  { key: 'hosting', label: 'Hosting', color: '#0EA5E9', description: 'Deploy & CDN' },
  { key: 'devtools', label: 'Dev Tools', color: '#F97316', description: 'Editors, linters, testing' },
  { key: 'other', label: 'Other', color: '#9CA3AF', description: 'Miscellaneous' },
];

export default function TechStackPage() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [entries, setEntries] = useState<TechStackEntry[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TechStackEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const { data: prods } = await supabase.from('products').select('*').order('name');
    setProducts(prods || []);
    const { data: ents } = await supabase.from('tech_stack').select('*').order('category, name');
    setEntries(ents || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = entries;
    if (selectedProduct !== 'all') list = list.filter((e) => e.product_id === selectedProduct);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, selectedProduct, query]);

  const grouped = CATEGORIES
    .map((c) => ({ ...c, items: filtered.filter((e) => e.category === c.key) }))
    .filter((g) => g.items.length > 0);

  const totalMonthlyCost = filtered.reduce((s, e) => s + Number(e.monthly_cost || 0), 0);
  const productName = (id: string) => products.find((p) => p.id === id)?.name || '—';

  return (
    <PageContainer
      title="Tech Stack"
      actions={isFounder && (
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> Add Entry
        </Button>
      )}
    >
      <p className="text-sm text-muted -mt-2 mb-4">
        All products combined — filter by product or search by name.
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Product filter tabs */}
        <div className="flex gap-1 overflow-x-auto p-0.5">
          <button
            onClick={() => setSelectedProduct('all')}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
              selectedProduct === 'all' ? 'accent-bg text-white' : 'surface text-muted hover:text-[var(--text)]')}
          >
            All products
          </button>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProduct(p.id)}
              className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                selectedProduct === p.id ? 'text-white' : 'surface text-muted hover:text-[var(--text)]')}
              style={selectedProduct === p.id ? { backgroundColor: p.color } : undefined}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input className="pl-8" placeholder="Search tools…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Stats bar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-6">
          <Card className="p-3 flex items-center gap-2">
            <Layers className="w-4 h-4 accent" />
            <span className="text-sm font-semibold text-[var(--text)]">{filtered.length}</span>
            <span className="text-xs text-muted">tools</span>
          </Card>
          <Card className="p-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-[var(--text)]">${totalMonthlyCost.toLocaleString()}</span>
            <span className="text-xs text-muted">/mo total cost</span>
          </Card>
          <Card className="p-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">
              {filtered.filter((e) => e.cost_type === 'free').length}
            </span>
            <span className="text-xs text-muted">free tools</span>
          </Card>
          <Card className="p-3 flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text)]">{grouped.length}</span>
            <span className="text-xs text-muted">categories</span>
          </Card>
        </div>
      )}

      {/* Grouped entries */}
      {grouped.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Layers className="w-8 h-8" />}
            title={query ? 'No results' : 'No tech stack entries'}
            description={
              query
                ? `No tools match "${query}". Try a different search.`
                : isFounder
                  ? 'Add entries to document the full stack.'
                  : 'No stack info has been added yet.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">{g.label}</h3>
                <span className="text-xs text-muted">{g.description}</span>
                <Badge color={g.color} className="ml-auto">{g.items.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((e) => {
                  const prod = products.find((p) => p.id === e.product_id);
                  return (
                    <Card
                      key={e.id}
                      className={cn('p-4 transition-shadow group', isFounder && 'cursor-pointer hover:shadow-soft-lg')}
                      onClick={() => isFounder && setEditing(e)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ backgroundColor: g.color }}
                        >
                          {e.name[0].toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--text)] truncate">{e.name}</span>
                            {isFounder && (
                              <Trash2 className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 hover:text-rose-500 shrink-0 ml-auto"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  supabase.from('tech_stack').delete().eq('id', e.id).then(() => load());
                                }}
                              />
                            )}
                          </div>

                          {e.description && (
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">{e.description}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <Badge color={e.cost_type === 'free' ? '#10B981' : '#6B7280'}>
                              {e.cost_type.replace('_', ' ')}
                            </Badge>
                            {Number(e.monthly_cost) > 0 && (
                              <span className="text-xs text-muted">${Number(e.monthly_cost)}/mo</span>
                            )}
                            {/* Product tag — only shown in "all products" view */}
                            {selectedProduct === 'all' && prod && (
                              <span
                                className="text-[10px] font-medium rounded-md px-1.5 py-0.5 text-white"
                                style={{ backgroundColor: prod.color }}
                              >
                                {prod.name}
                              </span>
                            )}
                          </div>

                          {e.contract_end && (
                            <div className="text-[10px] text-muted mt-1.5">
                              Contract ends {new Date(e.contract_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <EntryEditor
          entry={editing}
          products={products}
          defaultProductId={selectedProduct !== 'all' ? selectedProduct : ''}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { load(); setCreating(false); setEditing(null); }}
        />
      )}
    </PageContainer>
  );
}

function EntryEditor({
  entry, products, defaultProductId, onClose, onSaved,
}: {
  entry: TechStackEntry | null;
  products: Product[];
  defaultProductId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(entry?.name || '');
  const [productId, setProductId] = useState(entry?.product_id || defaultProductId || '');
  const [category, setCategory] = useState<TechStackEntry['category']>(entry?.category || 'infrastructure');
  const [description, setDescription] = useState(entry?.description || '');
  const [costType, setCostType] = useState<TechStackEntry['cost_type']>(entry?.cost_type || 'free');
  const [monthlyCost, setMonthlyCost] = useState(String(entry?.monthly_cost || '0'));
  const [perUserCost, setPerUserCost] = useState(String(entry?.per_user_cost || '0'));
  const [contractEnd, setContractEnd] = useState(entry?.contract_end || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !productId) return;
    setSaving(true);
    const payload = {
      product_id: productId,
      name: name.trim(),
      category,
      description: description.trim() || null,
      cost_type: costType,
      monthly_cost: Number(monthlyCost) || 0,
      per_user_cost: Number(perUserCost) || 0,
      contract_end: contractEnd || null,
    };
    let savedEntry: { id: string } | null = null;
    if (entry) {
      const { data } = await supabase.from('tech_stack').update(payload).eq('id', entry.id).select('id').single();
      savedEntry = data;
    } else {
      const { data } = await supabase.from('tech_stack').insert(payload).select('id').single();
      savedEntry = data;
    }

    // ── Sync to Financials expenses (category = 'tech_stack') ──────────────
    const monthlyCostNum = Number(monthlyCost) || 0;
    if (monthlyCostNum > 0) {
      const expPayload = {
        description: name.trim(),
        category: 'tech_stack' as const,
        product_id: productId,
        amount_usd: monthlyCostNum,
        expense_date: new Date().toISOString().slice(0, 10),
        is_recurring: true,
        recurring_period: 'monthly',
      };
      // Find existing expense linked to this tech_stack entry by description + category + product
      const { data: existingExp } = await supabase
        .from('expenses')
        .select('id')
        .eq('description', name.trim())
        .eq('category', 'tech_stack')
        .eq('product_id', productId)
        .maybeSingle();

      if (existingExp) {
        await supabase.from('expenses').update(expPayload).eq('id', existingExp.id);
      } else {
        // Need created_by — get current user from session
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (uid) await supabase.from('expenses').insert({ ...expPayload, created_by: uid });
      }
    }

    setSaving(false);
    onSaved();
  };

  const del = async () => {
    if (!entry) return;
    await supabase.from('tech_stack').delete().eq('id', entry.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={entry ? 'Edit Entry' : 'Add Tech Stack Entry'}>
      <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Product</label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="React, Supabase, Vercel…" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Category</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as TechStackEntry['category'])}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label} — {c.description}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do / why chosen?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Cost type</label>
            <Select value={costType} onChange={(e) => setCostType(e.target.value as TechStackEntry['cost_type'])}>
              <option value="free">Free</option>
              <option value="monthly">Monthly</option>
              <option value="per_user">Per user</option>
              <option value="annual">Annual</option>
              <option value="one_time">One-time</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Monthly cost ($)</label>
            <Input type="number" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0" disabled={costType === 'free'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Per-user cost ($)</label>
            <Input type="number" value={perUserCost} onChange={(e) => setPerUserCost(e.target.value)} placeholder="0" disabled={costType !== 'per_user'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Contract end</label>
            <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {entry
          ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button>
          : <div />}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim() || !productId}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
