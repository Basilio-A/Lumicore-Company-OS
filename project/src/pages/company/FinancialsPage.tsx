import { useEffect, useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, TrendingDown, TrendingUp, DollarSign, Flame, BarChart3, Pencil, ChevronDown, ChevronUp, Banknote, RefreshCw, Users } from 'lucide-react';
import { supabase, type Expense, type Product, type Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const EXPENSE_CATEGORIES: { key: Expense['category']; label: string; color: string }[] = [
  { key: 'rent', label: 'Rent', color: '#3B82F6' },
  { key: 'materials', label: 'Materials', color: '#F59E0B' },
  { key: 'tech_stack', label: 'Tech Stack', color: '#8B5CF6' },
  { key: 'marketing', label: 'Marketing', color: '#EC4899' },
  { key: 'operations', label: 'Operations', color: '#06B6D4' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

const INCOME_CATEGORIES = [
  { key: 'revenue', label: 'Revenue', color: '#10B981' },
  { key: 'grant', label: 'Grant', color: '#3B82F6' },
  { key: 'investment', label: 'Investment', color: '#6C63FF' },
  { key: 'consulting', label: 'Consulting', color: '#F59E0B' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

type Tab = 'expenses' | 'income' | 'bank';

export default function FinancialsPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [bankBalances, setBankBalances] = useState<any[]>([]);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [techStack, setTechStack] = useState<any[]>([]);
  const [etbRate, setEtbRate] = useState<number>(145);
  const [loadingRate, setLoadingRate] = useState(false);
  const [tab, setTab] = useState<Tab>('expenses');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [editingIncome, setEditingIncome] = useState<any>(null);
  const [creatingIncome, setCreatingIncome] = useState(false);
  const [creatingBank, setCreatingBank] = useState(false);
  const [salariesOpen, setSalariesOpen] = useState(false);
  const [salaryTableMissing, setSalaryTableMissing] = useState(false);
  const isFounder = profile?.role === 'founder';

  const convert = useCallback((usd: number) => currency === 'ETB' ? usd * etbRate : usd, [currency, etbRate]);

  const fetchLiveRate = async () => {
    setLoadingRate(true);
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const json = await res.json();
      if (json?.rates?.ETB) setEtbRate(json.rates.ETB);
    } catch {
      try {
        const res2 = await fetch('https://open.er-api.com/v6/latest/USD');
        const json2 = await res2.json();
        if (json2?.rates?.ETB) setEtbRate(json2.rates.ETB);
      } catch { /* use stored rate */ }
    }
    setLoadingRate(false);
  };

  const load = async () => {
    const [e, p, ppl, ts] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('products').select('*').order('name'),
      supabase.from('profiles').select('*').eq('status', 'active').in('role', ['employee', 'founder']).order('full_name'),
      supabase.from('tech_stack').select('*'),
    ]);
    setExpenses(e.data || []);
    setProducts(p.data || []);
    setPeople(ppl.data || []);
    setTechStack(ts.data || []);

    // These tables may not exist yet if migration 0005 hasn't run — handle gracefully
    const incomeRes = await supabase.from('income').select('*').order('income_date', { ascending: false });
    if (!incomeRes.error) setIncome(incomeRes.data || []);

    const bbRes = await supabase.from('bank_balances').select('*').order('recorded_date', { ascending: false });
    if (!bbRes.error) setBankBalances(bbRes.data || []);

    const salRes = await supabase.from('employee_salaries').select('*').order('effective_date', { ascending: false });
    if (!salRes.error) setSalaries(salRes.data || []);
    else setSalaryTableMissing(true);
  };

  useEffect(() => { load(); fetchLiveRate(); }, []);

  // Tech stack monthly cost auto-sync: aggregate by product
  const techStackMonthly = useMemo(() => techStack.reduce((sum: number, t: any) => sum + Number(t.monthly_cost || 0), 0), [techStack]);

  const recurringMonthly = (list: any[]) =>
    list.filter((e) => e.is_recurring && e.recurring_period === 'monthly').reduce((s: number, e: any) => s + Number(e.amount_usd), 0)
    + list.filter((e) => e.is_recurring && e.recurring_period === 'annually').reduce((s: number, e: any) => s + Number(e.amount_usd) / 12, 0)
    + list.filter((e) => e.is_recurring && e.recurring_period === 'quarterly').reduce((s: number, e: any) => s + Number(e.amount_usd) / 3, 0)
    + list.filter((e) => e.is_recurring && e.recurring_period === 'custom' && e.custom_duration_days).reduce((s: number, e: any) => s + (Number(e.amount_usd) / Number(e.custom_duration_days)) * 30, 0);

  const totalSalaries = useMemo(() => {
    const latestByProfile: Record<string, number> = {};
    for (const s of salaries) {
      if (!latestByProfile[s.profile_id] || s.effective_date > latestByProfile[s.profile_id]) {
        latestByProfile[s.profile_id] = Number(s.monthly_salary_usd);
      }
    }
    return Object.values(latestByProfile).reduce((a: number, b) => a + b, 0);
  }, [salaries]);

  const totalMonthlyBurn = useMemo(() => recurringMonthly(expenses) + techStackMonthly, [expenses, techStackMonthly]);
  const totalMonthlyIncome = useMemo(() => recurringMonthly(income), [income]);
  const latestBankBalance = bankBalances[0]?.balance_usd || 0;

  const byCategory = useMemo(() =>
    EXPENSE_CATEGORIES.map((c) => {
      const catExpenses = expenses.filter((e) => e.category === c.key);
      const monthly = recurringMonthly(catExpenses);
      return { ...c, monthly, count: catExpenses.length };
    }).filter((c) => c.count > 0),
  [expenses]);

  const byProduct = useMemo(() =>
    products.map((p) => {
      const prodExpenses = expenses.filter((e) => e.product_id === p.id);
      const monthly = recurringMonthly(prodExpenses);
      const tsMonthly = techStack.filter((t: any) => t.product_id === p.id).reduce((s: number, t: any) => s + Number(t.monthly_cost || 0), 0);
      return { product: p, monthly: monthly + tsMonthly, count: prodExpenses.length };
    }).filter((p) => p.count > 0 || p.monthly > 0),
  [expenses, products, techStack]);

  const incomeByProduct = useMemo(() =>
    products.map((p) => {
      const prodIncome = income.filter((i) => i.product_id === p.id);
      const monthly = recurringMonthly(prodIncome);
      const oneTime = prodIncome.filter((i) => !i.is_recurring).reduce((s: number, i: any) => s + Number(i.amount_usd), 0);
      return { product: p, monthly, oneTime, count: prodIncome.length };
    }).filter((p) => p.count > 0),
  [income, products]);

  const maxCatBurn = Math.max(...byCategory.map((c) => c.monthly), 1);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'expenses', label: 'Expenses' },
    { key: 'income', label: 'Income' },
    { key: 'bank', label: 'Bank' },
  ];

  return (
    <PageContainer
      title="Financials & Burn Rate"
      actions={isFounder && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted surface-2 rounded-lg px-2.5 py-1.5">
            <span>1 USD = {etbRate.toFixed(2)} ETB</span>
            <button onClick={fetchLiveRate} disabled={loadingRate} title="Refresh rate" className="text-muted hover:text-[var(--text)]">
              <RefreshCw className={cn('w-3.5 h-3.5', loadingRate && 'animate-spin')} />
            </button>
          </div>
          {tab === 'expenses' && <Button size="sm" onClick={() => setCreatingExpense(true)}><Plus className="w-4 h-4" /> Add Expense</Button>}
          {tab === 'income' && <Button size="sm" onClick={() => setCreatingIncome(true)}><Plus className="w-4 h-4" /> Add Income</Button>}
          {tab === 'bank' && <Button size="sm" onClick={() => setCreatingBank(true)}><Plus className="w-4 h-4" /> Update Balance</Button>}
        </div>
      )}
    >
      <p className="text-sm text-muted -mt-2 mb-5">Track burn rate, income per product, bank balances, and salary breakdown.</p>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted">Monthly Burn</span><Flame className="w-4 h-4 text-rose-500" /></div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(totalMonthlyBurn), currency)}</div>
          <div className="text-xs text-muted mt-1">Incl. {formatCurrency(convert(techStackMonthly), currency)} tech stack</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted">Monthly Income</span><TrendingUp className="w-4 h-4 text-emerald-500" /></div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(totalMonthlyIncome), currency)}</div>
          <div className="text-xs text-muted mt-1">All recurring income</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted">Bank Balance</span><Banknote className="w-4 h-4 text-blue-500" /></div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(latestBankBalance), currency)}</div>
          <div className="text-xs text-muted mt-1">{bankBalances[0]?.account_name || 'Not recorded'}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted">Salary Burn</span><Users className="w-4 h-4 text-violet-500" /></div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(totalSalaries), currency)}</div>
          <div className="text-xs text-muted mt-1">{people.length} staff</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-app mb-6">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('px-4 py-2.5 text-sm font-medium transition-colors relative', tab === t.key ? 'accent' : 'text-muted hover:text-[var(--text)]')}>
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 accent-bg" />}
          </button>
        ))}
      </div>

      {/* EXPENSES TAB */}
      {tab === 'expenses' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-rose-500" /> Burn by Category</h3>
              {byCategory.length === 0 ? <p className="text-sm text-muted py-4">No expenses recorded.</p> : (
                <div className="space-y-3">
                  {byCategory.map((c) => (
                    <div key={c.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} /><span className="text-sm text-[var(--text)]">{c.label}</span></div>
                        <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(c.monthly), currency)}/mo</span>
                      </div>
                      <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full transition-all" style={{ width: `${(c.monthly / maxCatBurn) * 100}%`, backgroundColor: c.color }} /></div>
                      <div className="text-xs text-muted mt-0.5">{c.count} item{c.count !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                  {techStackMonthly > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /><span className="text-sm text-[var(--text)]">Tech Stack (auto)</span></div>
                        <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(techStackMonthly), currency)}/mo</span>
                      </div>
                      <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${(techStackMonthly / maxCatBurn) * 100}%` }} /></div>
                      <div className="text-xs text-muted mt-0.5">From Tech Stack page</div>
                    </div>
                  )}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 accent" /> Burn by Product</h3>
              {byProduct.length === 0 ? <p className="text-sm text-muted py-4">No product expenses.</p> : (
                <div className="space-y-3">
                  {byProduct.map((p) => (
                    <div key={p.product.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.product.color }} /><span className="text-sm text-[var(--text)]">{p.product.name}</span></div>
                        <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(p.monthly), currency)}/mo</span>
                      </div>
                      <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full transition-all" style={{ width: `${(p.monthly / Math.max(...byProduct.map((x) => x.monthly), 1)) * 100}%`, backgroundColor: p.product.color }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Salary section with per-employee dropdown */}
          <Card className="overflow-hidden">
            <button
              onClick={() => setSalariesOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:surface-2 transition-colors"
            >
              <h3 className="font-semibold text-[var(--text)] flex items-center gap-2"><Users className="w-4 h-4 text-violet-500" /> Salaries — {formatCurrency(convert(totalSalaries), currency)}/mo</h3>
              {salariesOpen ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
            </button>
            {salariesOpen && (
              <div className="border-t border-app">
                {salaryTableMissing && (
                  <div className="px-5 py-3 text-xs text-amber-600 bg-amber-500/10 border-b border-app">
                    The salary table hasn't been created yet. Run migration 0005 in your Supabase dashboard to enable salary tracking.
                  </div>
                )}
                {people.length === 0 ? (
                  <p className="text-sm text-muted p-5">No staff profiles found.</p>
                ) : (
                  <div className="divide-y divide-app">
                    {people.map((p) => {
                      const latestSal = salaries.filter((s) => s.profile_id === p.id).sort((a: any, b: any) => b.effective_date.localeCompare(a.effective_date))[0];
                      const monthlySal = latestSal ? Number(latestSal.monthly_salary_usd) : 0;
                      return (
                        <SalaryRow
                          key={p.id}
                          person={p}
                          monthlySalary={monthlySal}
                          currency={currency}
                          convert={convert}
                          isFounder={isFounder && !salaryTableMissing}
                          onSaved={load}
                          currentUserId={profile?.id || ''}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* All expenses table */}
          <AllExpensesTable expenses={expenses} products={products} isFounder={isFounder} convert={convert} currency={currency} onEdit={setEditingExpense} />
        </div>
      )}

      {/* INCOME TAB */}
      {tab === 'income' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> Income by Product</h3>
              {incomeByProduct.length === 0 ? <p className="text-sm text-muted py-4">No income recorded.</p> : (
                <div className="space-y-3">
                  {incomeByProduct.map((p) => (
                    <div key={p.product.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.product.color }} /><span className="text-sm text-[var(--text)]">{p.product.name}</span></div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(p.monthly), currency)}/mo</div>
                          {p.oneTime > 0 && <div className="text-xs text-muted">+{formatCurrency(convert(p.oneTime), currency)} one-time</div>}
                        </div>
                      </div>
                      <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(p.monthly / Math.max(...incomeByProduct.map((x) => x.monthly), 1)) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-500" /> Income by Category</h3>
              {INCOME_CATEGORIES.map((c) => {
                const items = income.filter((i) => i.category === c.key);
                const monthly = recurringMonthly(items);
                if (items.length === 0) return null;
                return (
                  <div key={c.key} className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} /><span className="text-sm text-[var(--text)]">{c.label}</span></div>
                      <span className="text-sm font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(monthly), currency)}/mo</span>
                    </div>
                    <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full transition-all" style={{ width: `${(monthly / Math.max(totalMonthlyIncome, 1)) * 100}%`, backgroundColor: c.color }} /></div>
                  </div>
                );
              })}
              {income.length === 0 && <p className="text-sm text-muted py-4">No income recorded.</p>}
            </Card>
          </div>
          <Card className="overflow-hidden">
            <h3 className="font-semibold text-[var(--text)] px-5 py-4 border-b border-app">All Income</h3>
            {income.length === 0 ? (
              <div className="p-8"><EmptyState icon={<TrendingUp className="w-8 h-8" />} title="No income yet" description={isFounder ? 'Add income entries to track revenue.' : 'Income will appear here.'} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-app text-left text-xs text-muted"><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Product</th><th className="px-4 py-3 font-medium text-right">Amount</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Recurring</th>{isFounder && <th></th>}</tr></thead>
                  <tbody>
                    {income.map((i) => {
                      const prod = products.find((p) => p.id === i.product_id);
                      const cat = INCOME_CATEGORIES.find((c) => c.key === i.category);
                      return (
                        <tr key={i.id} className="border-b border-app last:border-0 hover:surface-2 transition-colors">
                          <td className="px-4 py-3 font-medium text-[var(--text)]">{i.description}</td>
                          <td className="px-4 py-3"><Badge color={cat?.color}>{cat?.label || i.category}</Badge></td>
                          <td className="px-4 py-3 text-muted">{prod?.name || 'Company-wide'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">{formatCurrency(convert(Number(i.amount_usd)), currency)}</td>
                          <td className="px-4 py-3 text-xs text-muted">{formatDate(i.income_date)}</td>
                          <td className="px-4 py-3 text-xs text-muted">{i.is_recurring ? i.recurring_period : 'One-time'}</td>
                          {isFounder && <td className="px-4 py-3"><button onClick={() => setEditingIncome(i)} className="p-1 text-muted hover:text-[var(--text)]"><Pencil className="w-3.5 h-3.5" /></button></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* BANK TAB */}
      {tab === 'bank' && (
        <div className="space-y-6">
          {bankBalances.length > 0 && (
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="p-5 sm:col-span-1">
                <div className="text-sm text-muted mb-1">Current Balance</div>
                <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(convert(bankBalances[0].balance_usd), currency)}</div>
                <div className="text-xs text-muted mt-1">{bankBalances[0].account_name} · {formatDate(bankBalances[0].recorded_date)}</div>
              </Card>
              <Card className="p-5 sm:col-span-2">
                <div className="text-sm text-muted mb-3">Runway estimate</div>
                {totalMonthlyBurn > 0 ? (
                  <div className="text-xl font-display font-bold text-[var(--text)]">{(bankBalances[0].balance_usd / totalMonthlyBurn).toFixed(1)} months</div>
                ) : (
                  <div className="text-sm text-muted">Add recurring expenses to calculate runway.</div>
                )}
                {totalMonthlyIncome > 0 && totalMonthlyBurn > totalMonthlyIncome && (
                  <div className="text-xs text-muted mt-1">Net burn: {formatCurrency(convert(totalMonthlyBurn - totalMonthlyIncome), currency)}/mo</div>
                )}
              </Card>
            </div>
          )}
          <Card className="overflow-hidden">
            <h3 className="font-semibold text-[var(--text)] px-5 py-4 border-b border-app">Balance History</h3>
            {bankBalances.length === 0 ? (
              <div className="p-8"><EmptyState icon={<Banknote className="w-8 h-8" />} title="No balances recorded" description={isFounder ? 'Update your bank balance to track runway.' : 'Balance history will appear here.'} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-app text-left text-xs text-muted"><th className="px-4 py-3 font-medium">Account</th><th className="px-4 py-3 font-medium text-right">Balance</th><th className="px-4 py-3 font-medium">Date</th><th className="px-4 py-3 font-medium">Notes</th>{isFounder && <th></th>}</tr></thead>
                  <tbody>
                    {bankBalances.map((b) => (
                      <tr key={b.id} className="border-b border-app last:border-0 hover:surface-2">
                        <td className="px-4 py-3 font-medium text-[var(--text)]">{b.account_name}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(Number(b.balance_usd)), currency)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{formatDate(b.recorded_date)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{b.notes || '—'}</td>
                        {isFounder && <td className="px-4 py-3"><button onClick={async () => { await supabase.from('bank_balances').delete().eq('id', b.id); load(); }} className="p-1 text-muted hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modals */}
      {(creatingExpense || editingExpense) && (
        <ExpenseEditor expense={editingExpense} products={products} currentUserId={profile?.id || ''} onClose={() => { setCreatingExpense(false); setEditingExpense(null); }} onSaved={() => { setCreatingExpense(false); setEditingExpense(null); load(); }} />
      )}
      {(creatingIncome || editingIncome) && (
        <IncomeEditor income={editingIncome} products={products} currentUserId={profile?.id || ''} onClose={() => { setCreatingIncome(false); setEditingIncome(null); }} onSaved={() => { setCreatingIncome(false); setEditingIncome(null); load(); }} />
      )}
      {creatingBank && (
        <BankBalanceEditor currentUserId={profile?.id || ''} onClose={() => setCreatingBank(false)} onSaved={() => { setCreatingBank(false); load(); }} />
      )}
    </PageContainer>
  );
}

// Salary row with inline edit
function SalaryRow({ person, monthlySalary, currency, convert, isFounder, onSaved, currentUserId }: {
  person: Profile; monthlySalary: number; currency: 'USD' | 'ETB'; convert: (n: number) => number;
  isFounder: boolean; onSaved: () => void; currentUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(monthlySalary || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!currentUserId) { setError('Not authenticated'); return; }
    const amount = Number(value);
    if (isNaN(amount) || amount < 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    setError('');
    const { error: dbErr } = await supabase.from('employee_salaries').insert({
      profile_id: person.id,
      monthly_salary_usd: amount,
      effective_date: new Date().toISOString().slice(0, 10),
      created_by: currentUserId,
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    setEditing(false);
    onSaved();
  };

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <div className="text-sm font-medium text-[var(--text)]">{person.full_name}</div>
        <div className="text-xs text-muted">{person.title || person.role}</div>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="w-32 rounded-lg surface-2 border border-app px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
              placeholder="Monthly USD"
              autoFocus
            />
            {error && <span className="text-xs text-rose-500">{error}</span>}
          </div>
          <Button size="sm" onClick={save} disabled={saving}>{saving ? '…' : 'Save'}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text)] tabular-nums">
            {monthlySalary > 0 ? formatCurrency(convert(monthlySalary), currency) + '/mo' : 'Not set'}
          </span>
          {isFounder && (
            <button onClick={() => { setValue(String(monthlySalary || '')); setEditing(true); }} className="p-1 text-muted hover:text-[var(--text)]">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// All expenses table with collapsible employee sub-section
function AllExpensesTable({ expenses, products, isFounder, convert, currency, onEdit }: {
  expenses: Expense[]; products: Product[]; isFounder: boolean;
  convert: (n: number) => number; currency: 'USD' | 'ETB'; onEdit: (e: Expense) => void;
}) {
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const grouped = EXPENSE_CATEGORIES.map((c) => ({
    ...c,
    items: expenses.filter((e) => e.category === c.key),
  })).filter((g) => g.items.length > 0);

  return (
    <Card className="overflow-hidden">
      <h3 className="font-semibold text-[var(--text)] px-5 py-4 border-b border-app">All Expenses</h3>
      {grouped.length === 0 ? (
        <div className="p-8"><EmptyState icon={<DollarSign className="w-8 h-8" />} title="No expenses yet" description={isFounder ? 'Add your first expense.' : 'Expenses will appear here.'} /></div>
      ) : (
        <div>
          {grouped.map((g) => (
            <div key={g.key} className="border-b border-app last:border-0">
              <button
                onClick={() => setExpandedCats((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                className="w-full flex items-center justify-between px-5 py-3 hover:surface-2 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="text-sm font-semibold text-[var(--text)]">{g.label}</span>
                  <span className="text-xs text-muted">({g.items.length})</span>
                </div>
                {expandedCats[g.key] ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
              </button>
              {expandedCats[g.key] && (
                <div className="overflow-x-auto border-t border-app">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted border-b border-app"><th className="px-5 py-2 font-medium">Description</th><th className="px-4 py-2 font-medium">Product</th><th className="px-4 py-2 font-medium text-right">Amount</th><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Recurring</th>{isFounder && <th></th>}</tr></thead>
                    <tbody>
                      {g.items.map((e) => {
                        const prod = products.find((p) => p.id === e.product_id);
                        return (
                          <tr key={e.id} className="border-b border-app last:border-0 hover:surface-2">
                            <td className="px-5 py-2.5 font-medium text-[var(--text)]">{e.description}</td>
                            <td className="px-4 py-2.5 text-muted">{prod?.name || 'Company-wide'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-[var(--text)] tabular-nums">{formatCurrency(convert(Number(e.amount_usd)), currency)}</td>
                            <td className="px-4 py-2.5 text-xs text-muted">{formatDate(e.expense_date)}</td>
                            <td className="px-4 py-2.5 text-xs text-muted">{e.is_recurring ? (e.recurring_period === 'custom' ? `Custom (${(e as any).custom_duration_days}d)` : e.recurring_period) : 'One-time'}</td>
                            {isFounder && <td className="px-4 py-2.5"><button onClick={() => onEdit(e)} className="p-1 text-muted hover:text-[var(--text)]"><Pencil className="w-3.5 h-3.5" /></button></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Shared recurring period picker with custom duration support
function RecurringPicker({ isRecurring, setIsRecurring, period, setPeriod, customDays, setCustomDays }: {
  isRecurring: boolean; setIsRecurring: (v: boolean) => void;
  period: string | null; setPeriod: (v: string) => void;
  customDays: string; setCustomDays: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setIsRecurring(!isRecurring)}
          className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isRecurring ? 'accent-bg text-white' : 'surface text-muted hover:text-[var(--text)]')}
        >
          Recurring
        </button>
        {isRecurring && (
          <Select value={period || 'monthly'} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
            <option value="custom">Custom</option>
          </Select>
        )}
      </div>
      {isRecurring && period === 'custom' && (
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Repeat every N days</label>
          <Input type="number" value={customDays} onChange={(e) => setCustomDays(e.target.value)} placeholder="e.g. 14 for every 2 weeks" />
        </div>
      )}
    </div>
  );
}

function ExpenseEditor({ expense, products, currentUserId, onClose, onSaved }: {
  expense: Expense | null; products: Product[]; currentUserId: string; onClose: () => void; onSaved: () => void;
}) {
  const [description, setDescription] = useState(expense?.description || '');
  const [category, setCategory] = useState<Expense['category']>(expense?.category === 'employees' ? 'other' : (expense?.category || 'rent'));
  const [productId, setProductId] = useState(expense?.product_id || '');
  const [amount, setAmount] = useState(String(expense?.amount_usd || ''));
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date || new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(expense?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState<string>(expense?.recurring_period || 'monthly');
  const [customDays, setCustomDays] = useState(String((expense as any)?.custom_duration_days || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!description.trim() || !amount) return;
    if (!currentUserId) { setError('Not authenticated'); return; }
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = {
      description: description.trim(), category, product_id: productId || null,
      amount_usd: Number(amount), expense_date: expenseDate, is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null,
      custom_duration_days: isRecurring && recurringPeriod === 'custom' ? Number(customDays) || null : null,
      created_by: currentUserId,
    };
    let result;
    if (expense) result = await supabase.from('expenses').update(payload).eq('id', expense.id);
    else result = await supabase.from('expenses').insert(payload);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved();
  };

  const del = async () => { if (!expense) return; await supabase.from('expenses').delete().eq('id', expense.id); onSaved(); };

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'}>
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Office rent, AWS…" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Category</label><Select value={category} onChange={(e) => setCategory(e.target.value as Expense['category'])}>{EXPENSE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Product (optional)</label><Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Company-wide</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Amount (USD)</label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Date</label><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
        </div>
        <RecurringPicker isRecurring={isRecurring} setIsRecurring={setIsRecurring} period={recurringPeriod} setPeriod={setRecurringPeriod} customDays={customDays} setCustomDays={setCustomDays} />
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {expense ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !description.trim() || !amount}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}

function IncomeEditor({ income, products, currentUserId, onClose, onSaved }: {
  income: any; products: Product[]; currentUserId: string; onClose: () => void; onSaved: () => void;
}) {
  const [description, setDescription] = useState(income?.description || '');
  const [category, setCategory] = useState(income?.category || 'revenue');
  const [productId, setProductId] = useState(income?.product_id || '');
  const [amount, setAmount] = useState(String(income?.amount_usd || ''));
  const [incomeDate, setIncomeDate] = useState(income?.income_date || new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(income?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState(income?.recurring_period || 'monthly');
  const [customDays, setCustomDays] = useState(String(income?.custom_duration_days || ''));
  const [notes, setNotes] = useState(income?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!description.trim() || !amount) return;
    if (!currentUserId) { setError('Not authenticated'); return; }
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = {
      description: description.trim(), category, product_id: productId || null,
      amount_usd: Number(amount), income_date: incomeDate, is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null,
      custom_duration_days: isRecurring && recurringPeriod === 'custom' ? Number(customDays) || null : null,
      notes: notes || null, created_by: currentUserId,
    };
    let result;
    if (income?.id) result = await supabase.from('income').update(payload).eq('id', income.id);
    else result = await supabase.from('income').insert(payload);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved();
  };

  const del = async () => {
    if (!income?.id) return;
    await supabase.from('income').delete().eq('id', income.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={income ? 'Edit Income' : 'Add Income'}>
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Product subscription, grant…" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Category</label><Select value={category} onChange={(e) => setCategory(e.target.value)}>{INCOME_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Product (optional)</label><Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">Company-wide</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Amount (USD)</label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Date</label><Input type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} /></div>
        </div>
        <RecurringPicker isRecurring={isRecurring} setIsRecurring={setIsRecurring} period={recurringPeriod} setPeriod={setRecurringPeriod} customDays={customDays} setCustomDays={setCustomDays} />
        <div><label className="block text-xs font-medium text-muted mb-1.5">Notes</label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {income ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !description.trim() || !amount}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}

function BankBalanceEditor({ currentUserId, onClose, onSaved }: { currentUserId: string; onClose: () => void; onSaved: () => void }) {
  const [accountName, setAccountName] = useState('Main Account');
  const [balance, setBalance] = useState('');
  const [recordedDate, setRecordedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!balance) return;
    if (!currentUserId) { setError('Not authenticated'); return; }
    setSaving(true);
    setError('');
    const { error: dbErr } = await supabase.from('bank_balances').insert({
      account_name: accountName,
      balance_usd: Number(balance),
      recorded_date: recordedDate,
      notes: notes || null,
      created_by: currentUserId,
    });
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Update Bank Balance">
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div><label className="block text-xs font-medium text-muted mb-1.5">Account name</label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Main Account, CBE, etc." autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Balance (USD)</label><Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="50000" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">As of date</label><Input type="date" value={recordedDate} onChange={(e) => setRecordedDate(e.target.value)} /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Notes (optional)</label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="End of month reconciliation…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !balance}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>
  );
}
