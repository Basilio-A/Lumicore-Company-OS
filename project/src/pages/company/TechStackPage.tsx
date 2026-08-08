import { useEffect, useState } from 'react';
import { Plus, Trash2, Layers, DollarSign } from 'lucide-react';
import { supabase, type TechStackEntry, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

const USD_TO_ETB_RATE = 161; // updated rate — FinancialsPage fetches live, others use this fallback

const CATEGORIES: { key: TechStackEntry['category']; label: string; color: string; description: string }[] = [
  { key: 'infrastructure', label: 'Infrastructure', color: '#3B82F6', description: 'Cloud, hosting, compute, networking' },
  { key: 'saas', label: 'SaaS', color: '#10B981', description: 'Subscriptions and hosted services' },
  { key: 'tooling', label: 'Tooling', color: '#F59E0B', description: 'Developer tools, CI/CD, observability' },
  { key: 'api', label: 'API', color: '#EC4899', description: 'Third-party APIs and integrations' },
  { key: 'frontend', label: 'Frontend', color: '#6C63FF', description: 'UI frameworks and libraries' },
  { key: 'backend', label: 'Backend', color: '#8B5CF6', description: 'Server frameworks and runtimes' },
  { key: 'database', label: 'Database', color: '#06B6D4', description: 'Data stores and caches' },
  { key: 'devtools', label: 'Dev Tools', color: '#F97316', description: 'Editors, linters, testing' },
  { key: 'other', label: 'Other', color: '#9CA3AF', description: 'Miscellaneous tools' },
];

const ALL_PRODUCTS_ID = '__all__';

export default function TechStackPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const convert = (usd: number) => currency === 'ETB' ? usd * USD_TO_ETB_RATE : usd;
  const [products, setProducts] = useState<Product[]>([]);
  const [allEntries, setAllEntries] = useState<TechStackEntry[]>([]);
  const [entries, setEntries] = useState<TechStackEntry[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>(ALL_PRODUCTS_ID);
  const [editing, setEditing] = useState<TechStackEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const { data: prods } = await supabase.from('products').select('*').order('name');
    setProducts(prods || []);
    const { data: all } = await supabase.from('tech_stack').select('*').order('category, name');
    setAllEntries(all || []);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedProduct === ALL_PRODUCTS_ID) {
      setEntries(allEntries);
    } else {
      setEntries(allEntries.filter((e) => e.product_id === selectedProduct));
    }
  }, [selectedProduct, allEntries]);

  const grouped = CATEGORIES.map((c) => ({ ...c, items: entries.filter((e) => e.category === c.key) })).filter((g) => g.items.length > 0);
  const totalMonthlyCost = entries.reduce((sum, e) => sum + Number(e.monthly_cost || 0), 0);

  const productForEntry = (e: TechStackEntry) => products.find((p) => p.id === e.product_id);

  const reloadEntries = async () => {
    const { data: all } = await supabase.from('tech_stack').select('*').order('category, name');
    setAllEntries(all || []);
  };

  return (
    <PageContainer title="Tech Stack" actions={isFounder && <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Add Entry</Button>}>
      <p className="text-sm text-muted -mt-2 mb-4">Technology stack organized by tier — Infrastructure, SaaS, Tooling, and APIs.</p>

      {/* Product tabs — "All" first */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedProduct(ALL_PRODUCTS_ID)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${selectedProduct === ALL_PRODUCTS_ID ? 'accent-bg text-white' : 'surface text-muted hover:text-[var(--text)]'}`}
        >
          All Products
        </button>
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProduct(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${selectedProduct === p.id ? 'text-white' : 'surface text-muted hover:text-[var(--text)]'}`}
            style={selectedProduct === p.id ? { backgroundColor: p.color } : {}}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-xs text-muted">Total Entries</div><div className="text-xl font-display font-bold text-[var(--text)]">{entries.length}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted">Monthly Cost</div><div className="text-xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(totalMonthlyCost), currency)}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted">Categories Used</div><div className="text-xl font-display font-bold text-[var(--text)]">{grouped.length}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted">Free Tools</div><div className="text-xl font-display font-bold text-[var(--text)]">{entries.filter((e) => e.cost_type === 'free').length}</div></Card>
        </div>
      )}

      {grouped.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<Layers className="w-8 h-8" />} title="No tech stack entries"
            description={isFounder ? 'Add entries to document the stack.' : 'No stack info has been added yet.'} />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">{g.label}</h3>
                <span className="text-xs text-muted">{g.description}</span>
                <Badge color={g.color} className="ml-auto">{g.items.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((e) => {
                  const prod = productForEntry(e);
                  return (
                    <Card key={e.id} className="p-4 cursor-pointer hover:shadow-soft transition-shadow group" onClick={() => isFounder && setEditing(e)}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: g.color }}>{e.name[0]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[var(--text)] truncate">{e.name}</div>
                          {/* Show product badge in All Products view */}
                          {selectedProduct === ALL_PRODUCTS_ID && prod && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: prod.color }} />
                              <span className="text-[10px] text-muted">{prod.name}</span>
                            </div>
                          )}
                          {e.description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{e.description}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <Badge color={e.cost_type === 'free' ? '#10B981' : '#6B7280'}>{e.cost_type.replace('_', ' ')}</Badge>
                            {Number(e.monthly_cost) > 0 && (
                              <span className="text-xs text-muted flex items-center gap-0.5">
                                <DollarSign className="w-3 h-3" />{Number(e.monthly_cost)}/mo
                              </span>
                            )}
                          </div>
                        </div>
                        {isFounder && <Trash2 className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 hover:text-rose-500 shrink-0" />}
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
          defaultProductId={selectedProduct === ALL_PRODUCTS_ID ? (products[0]?.id || '') : selectedProduct}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); reloadEntries(); }}
        />
      )}
    </PageContainer>
  );
}

function EntryEditor({ entry, products, defaultProductId, onClose, onSaved }: {
  entry: TechStackEntry | null; products: Product[]; defaultProductId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(entry?.name || '');
  const [productId, setProductId] = useState(entry?.product_id || defaultProductId);
  const [category, setCategory] = useState<TechStackEntry['category']>(entry?.category || 'infrastructure');
  const [description, setDescription] = useState(entry?.description || '');
  const [costType, setCostType] = useState<TechStackEntry['cost_type']>(entry?.cost_type || 'free');
  const [monthlyCost, setMonthlyCost] = useState(String(entry?.monthly_cost || '0'));
  const [perUserCost, setPerUserCost] = useState(String(entry?.per_user_cost || '0'));
  const [contractEnd, setContractEnd] = useState(entry?.contract_end || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim() || !productId) return;
    setSaving(true);
    setError('');
    const payload = {
      product_id: productId, name: name.trim(), category,
      description: description || null, cost_type: costType,
      monthly_cost: Number(monthlyCost) || 0, per_user_cost: Number(perUserCost) || 0,
      contract_end: contractEnd || null,
    };
    let result;
    if (entry) result = await supabase.from('tech_stack').update(payload).eq('id', entry.id);
    else result = await supabase.from('tech_stack').insert(payload);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved();
  };

  const del = async () => {
    if (!entry) return;
    await supabase.from('tech_stack').delete().eq('id', entry.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={entry ? 'Edit Entry' : 'Add Tech Stack Entry'}>
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Product</label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="React, Supabase, etc." autoFocus /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Category / Tier</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as TechStackEntry['category'])}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do?" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Cost Type</label>
            <Select value={costType} onChange={(e) => setCostType(e.target.value as TechStackEntry['cost_type'])}>
              <option value="free">Free</option>
              <option value="monthly">Monthly</option>
              <option value="per_user">Per User</option>
              <option value="annual">Annual</option>
              <option value="one_time">One-time</option>
            </Select>
          </div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Monthly Cost ($)</label>
            <Input type="number" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0" disabled={costType === 'free'} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Per-User Cost ($)</label>
            <Input type="number" value={perUserCost} onChange={(e) => setPerUserCost(e.target.value)} placeholder="0" disabled={costType !== 'per_user'} />
          </div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Contract End</label>
            <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {entry ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}
