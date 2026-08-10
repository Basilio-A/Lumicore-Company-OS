import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, TrendingDown, TrendingUp, DollarSign, Flame, BarChart3, Pencil,
  Building2, Users, ChevronDown, ChevronRight, CreditCard, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { supabase, type Expense, type Product, type Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState, Avatar } from '@/components/ui';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
interface Income {
  id: string; product_id: string | null; description: string;
  amount_usd: number; income_date: string;
  category: 'revenue' | 'grant' | 'investment' | 'consulting' | 'other';
  is_recurring: boolean; recurring_period: string | null; notes: string | null;
  created_by: string; created_at: string;
}
interface BankBalance {
  id: string; account_name: string; balance_usd: number;
  recorded_date: string; notes: string | null; created_by: string; created_at: string;
}
interface EmployeeSalary {
  id: string; profile_id: string; monthly_salary_usd: number;
  effective_date: string; notes: string | null; created_by: string; created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────
const EXP_CATEGORIES: { key: Expense['category']; label: string; color: string }[] = [
  { key: 'rent', label: 'Rent', color: '#3B82F6' },
  { key: 'employees', label: 'Employees', color: '#10B981' },
  { key: 'materials', label: 'Materials', color: '#F59E0B' },
  { key: 'tech_stack', label: 'Tech Stack', color: '#8B5CF6' },
  { key: 'marketing', label: 'Marketing', color: '#EC4899' },
  { key: 'operations', label: 'Operations', color: '#06B6D4' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

const INC_CATEGORIES: { key: Income['category']; label: string; color: string }[] = [
  { key: 'revenue', label: 'Revenue', color: '#10B981' },
  { key: 'grant', label: 'Grant', color: '#3B82F6' },
  { key: 'investment', label: 'Investment', color: '#6C63FF' },
  { key: 'consulting', label: 'Consulting', color: '#F59E0B' },
  { key: 'other', label: 'Other', color: '#9CA3AF' },
];

type FinTab = 'overview' | 'expenses' | 'income' | 'salaries' | 'bank';

// ── Main component ─────────────────────────────────────────────────────────
export default function FinancialsPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const [tab, setTab] = useState<FinTab>('overview');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [bankBalances, setBankBalances] = useState<BankBalance[]>([]);
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [creatingExp, setCreatingExp] = useState(false);
  const [editingInc, setEditingInc] = useState<Income | null>(null);
  const [creatingInc, setCreatingInc] = useState(false);
  const [editingBank, setEditingBank] = useState<BankBalance | null>(null);
  const [creatingBank, setCreatingBank] = useState(false);
  const [editingSal, setEditingSal] = useState<EmployeeSalary | null>(null);
  const [creatingSal, setCreatingSal] = useState(false);
  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const [e, inc, bb, sal, profs, prods] = await Promise.all([
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('income').select('*').order('income_date', { ascending: false }),
      supabase.from('bank_balances').select('*').order('recorded_date', { ascending: false }),
      supabase.from('employee_salaries').select('*').order('effective_date', { ascending: false }),
      supabase.from('profiles').select('*').eq('status', 'active').order('full_name'),
      supabase.from('products').select('*').order('name'),
    ]);
    // Only update state if no error — silently ignore table-not-found (42P01) while migrations are pending
    if (!e.error) setExpenses(e.data || []);
    if (!inc.error) setIncome(inc.data || []);
    if (!bb.error) setBankBalances(bb.data || []);
    if (!sal.error) setSalaries(sal.data || []);
    if (!profs.error) setProfiles(profs.data || []);
    if (!prods.error) setProducts(prods.data || []);
  };

  useEffect(() => { load(); }, []);

  // ── derived numbers (all in USD, converted on display) ────────────────
  const monthlyBurn = useMemo(() => {
    const r = expenses.filter((e) => e.is_recurring && e.recurring_period === 'monthly')
      .reduce((s, e) => s + Number(e.amount_usd), 0);
    const a = expenses.filter((e) => e.is_recurring && e.recurring_period === 'annually')
      .reduce((s, e) => s + Number(e.amount_usd) / 12, 0);
    const q = expenses.filter((e) => e.is_recurring && e.recurring_period === 'quarterly')
      .reduce((s, e) => s + Number(e.amount_usd) / 3, 0);
    return r + a + q;
  }, [expenses]);

  const monthlyIncome = useMemo(() => {
    const r = income.filter((i) => i.is_recurring && i.recurring_period === 'monthly')
      .reduce((s, i) => s + Number(i.amount_usd), 0);
    const a = income.filter((i) => i.is_recurring && i.recurring_period === 'annually')
      .reduce((s, i) => s + Number(i.amount_usd) / 12, 0);
    return r + a;
  }, [income]);

  const totalSalaries = useMemo(() =>
    salaries.reduce((s, sal) => s + Number(sal.monthly_salary_usd), 0), [salaries]);

  const latestBank = bankBalances[0]?.balance_usd ?? 0;
  const netMonthly = monthlyIncome - monthlyBurn - totalSalaries;

  const TABS: { key: FinTab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'expenses', label: 'Expenses', icon: TrendingDown },
    { key: 'income', label: 'Income', icon: TrendingUp },
    { key: 'salaries', label: 'Salaries', icon: Users },
    { key: 'bank', label: 'Bank', icon: Building2 },
  ];

  return (
    <PageContainer title="Financials">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-app -mt-2 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap',
              tab === t.key ? 'accent' : 'text-muted hover:text-[var(--text)]')}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 accent-bg" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab expenses={expenses} income={income} salaries={salaries}
          bankBalances={bankBalances} products={products} currency={currency}
          monthlyBurn={monthlyBurn} monthlyIncome={monthlyIncome}
          totalSalaries={totalSalaries} latestBank={latestBank} netMonthly={netMonthly} />
      )}
      {tab === 'expenses' && (
        <ExpensesTab expenses={expenses} products={products} currency={currency}
          isFounder={isFounder} onEdit={setEditingExp} onNew={() => setCreatingExp(true)} />
      )}
      {tab === 'income' && (
        <IncomeTab income={income} products={products} currency={currency}
          isFounder={isFounder} onEdit={setEditingInc} onNew={() => setCreatingInc(true)} />
      )}
      {tab === 'salaries' && (
        <SalariesTab salaries={salaries} profiles={profiles} currency={currency}
          isFounder={isFounder} onEdit={setEditingSal} onNew={() => setCreatingSal(true)} />
      )}
      {tab === 'bank' && (
        <BankTab balances={bankBalances} currency={currency}
          isFounder={isFounder} onEdit={setEditingBank} onNew={() => setCreatingBank(true)} />
      )}

      {(creatingExp || editingExp) && (
        <ExpenseEditor expense={editingExp} products={products} currentUserId={profile?.id || ''}
          onClose={() => { setCreatingExp(false); setEditingExp(null); }}
          onSaved={(row) => {
            setCreatingExp(false); setEditingExp(null);
            if (row) setExpenses((prev) => editingExp ? prev.map((e) => e.id === row.id ? row : e) : [row, ...prev]);
            load();
          }} />
      )}
      {(creatingInc || editingInc) && (
        <IncomeEditor income={editingInc} products={products} currentUserId={profile?.id || ''}
          onClose={() => { setCreatingInc(false); setEditingInc(null); }}
          onSaved={(row) => {
            setCreatingInc(false); setEditingInc(null);
            if (row) setIncome((prev) => editingInc ? prev.map((i) => i.id === row.id ? row : i) : [row, ...prev]);
            load();
          }} />
      )}
      {(creatingBank || editingBank) && (
        <BankEditor balance={editingBank} currentUserId={profile?.id || ''}
          onClose={() => { setCreatingBank(false); setEditingBank(null); }}
          onSaved={(row) => {
            setCreatingBank(false); setEditingBank(null);
            if (row) setBankBalances((prev) => editingBank ? prev.map((b) => b.id === row.id ? row : b) : [row, ...prev]);
            load();
          }} />
      )}
      {(creatingSal || editingSal) && (
        <SalaryEditor salary={editingSal} profiles={profiles} currentUserId={profile?.id || ''}
          onClose={() => { setCreatingSal(false); setEditingSal(null); }}
          onSaved={(row) => {
            setCreatingSal(false); setEditingSal(null);
            if (row) setSalaries((prev) => editingSal ? prev.map((s) => s.id === row.id ? row : s) : [row, ...prev]);
            load();
          }} />
      )}
    </PageContainer>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────
function OverviewTab({ expenses, income, salaries, bankBalances, products, currency,
  monthlyBurn, monthlyIncome, totalSalaries, latestBank, netMonthly }:
  { expenses: Expense[]; income: Income[]; salaries: EmployeeSalary[]; bankBalances: BankBalance[];
    products: Product[]; currency: string; monthlyBurn: number; monthlyIncome: number;
    totalSalaries: number; latestBank: number; netMonthly: number; }) {

  const byCategory = EXP_CATEGORIES.map((c) => {
    const items = expenses.filter((e) => e.category === c.key);
    const monthly = items.filter((e) => e.is_recurring && e.recurring_period === 'monthly')
      .reduce((s, e) => s + Number(e.amount_usd), 0)
      + items.filter((e) => e.is_recurring && e.recurring_period === 'annually')
        .reduce((s, e) => s + Number(e.amount_usd) / 12, 0)
      + items.filter((e) => e.is_recurring && e.recurring_period === 'quarterly')
        .reduce((s, e) => s + Number(e.amount_usd) / 3, 0);
    return { ...c, monthly, count: items.length };
  }).filter((c) => c.count > 0);

  const maxBurn = Math.max(...byCategory.map((c) => c.monthly), 1);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Monthly Burn" value={formatCurrency(monthlyBurn, currency as 'USD'|'ETB')}
          sub="Recurring expenses" icon={Flame} iconClass="text-rose-500" />
        <KpiCard label="Monthly Income" value={formatCurrency(monthlyIncome, currency as 'USD'|'ETB')}
          sub="Recurring revenue" icon={TrendingUp} iconClass="text-emerald-500" />
        <KpiCard label="Net Monthly" value={formatCurrency(netMonthly, currency as 'USD'|'ETB')}
          sub={netMonthly >= 0 ? 'Profitable' : 'Cash negative'}
          icon={netMonthly >= 0 ? ArrowUpRight : ArrowDownLeft}
          iconClass={netMonthly >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
        <KpiCard label="Bank Balance" value={formatCurrency(latestBank, currency as 'USD'|'ETB')}
          sub={bankBalances[0] ? `as of ${formatDate(bankBalances[0].recorded_date)}` : 'No data'}
          icon={Building2} iconClass="accent" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-rose-500" /> Expenses by Category
          </h3>
          {byCategory.length === 0
            ? <p className="text-sm text-muted py-4">No expenses recorded.</p>
            : <div className="space-y-3">
              {byCategory.map((c) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-sm text-[var(--text)]">{c.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text)] tabular-nums">
                      {formatCurrency(c.monthly, currency as 'USD'|'ETB')}/mo
                    </span>
                  </div>
                  <div className="h-2 rounded-full surface-2 overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${(c.monthly / maxBurn) * 100}%`, backgroundColor: c.color }} />
                  </div>
                  <div className="text-xs text-muted mt-0.5">{c.count} expense{c.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          }
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 accent" /> Summary
          </h3>
          <div className="space-y-2 text-sm">
            <Row label="Monthly burn rate" value={formatCurrency(monthlyBurn, currency as 'USD'|'ETB')} />
            <Row label="Monthly income" value={formatCurrency(monthlyIncome, currency as 'USD'|'ETB')} />
            <Row label="Monthly salaries" value={formatCurrency(totalSalaries, currency as 'USD'|'ETB')} />
            <div className="border-t border-app pt-2 mt-2">
              <Row label="Net monthly" value={formatCurrency(netMonthly, currency as 'USD'|'ETB')}
                valueClass={netMonthly >= 0 ? 'text-emerald-500' : 'text-rose-500'} />
            </div>
            <Row label="Annual run rate" value={formatCurrency((monthlyBurn + totalSalaries) * 12, currency as 'USD'|'ETB')} />
            <Row label="Bank balance" value={formatCurrency(latestBank, currency as 'USD'|'ETB')} />
            {monthlyBurn + totalSalaries > 0 && latestBank > 0 && (
              <Row label="Runway (months)"
                value={`${Math.floor(latestBank / (monthlyBurn + totalSalaries))} mo`} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, iconClass }:
  { label: string; value: string; sub: string; icon: React.ElementType; iconClass: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">{label}</span>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
      <div className="text-2xl font-display font-bold text-[var(--text)]">{value}</div>
      <div className="text-xs text-muted mt-1">{sub}</div>
    </Card>
  );
}

function Row({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-medium text-[var(--text)] tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── Expenses tab ───────────────────────────────────────────────────────────
function ExpensesTab({ expenses, products, currency, isFounder, onEdit, onNew }:
  { expenses: Expense[]; products: Product[]; currency: string;
    isFounder: boolean; onEdit: (e: Expense) => void; onNew: () => void; }) {

  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const grouped = EXP_CATEGORIES.map((c) => ({
    ...c, items: expenses.filter((e) => e.category === c.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--text)]">All Expenses</h3>
        {isFounder && <Button size="sm" onClick={onNew}><Plus className="w-4 h-4" /> Add Expense</Button>}
      </div>
      {grouped.length === 0
        ? <Card className="p-8"><EmptyState icon={<DollarSign className="w-8 h-8" />} title="No expenses yet"
            description={isFounder ? 'Add your first expense.' : 'Expenses will appear here.'} /></Card>
        : <div className="space-y-3">
          {grouped.map((g) => {
            const isOpen = expandedCat === g.key;
            const monthlyTotal = g.items.filter((e) => e.is_recurring && e.recurring_period === 'monthly')
              .reduce((s, e) => s + Number(e.amount_usd), 0);
            return (
              <Card key={g.key} className="overflow-hidden">
                <button
                  onClick={() => setExpandedCat(isOpen ? null : g.key)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:surface-2 transition-colors text-left"
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="font-semibold text-[var(--text)] flex-1">{g.label}</span>
                  <Badge color={g.color}>{g.items.length}</Badge>
                  {monthlyTotal > 0 && (
                    <span className="text-sm text-muted tabular-nums">
                      {formatCurrency(monthlyTotal, currency as 'USD'|'ETB')}/mo recurring
                    </span>
                  )}
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                </button>
                {isOpen && (
                  <div className="border-t border-app divide-y divide-app">
                    {g.items.map((e) => {
                      const prod = products.find((p) => p.id === e.product_id);
                      return (
                        <div key={e.id} className="px-5 py-3 flex items-center gap-3 hover:surface-2 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--text)] truncate">{e.description}</div>
                            <div className="text-xs text-muted mt-0.5">
                              {formatDate(e.expense_date)} · {prod?.name || 'Company-wide'}
                              {e.is_recurring && ` · ${e.recurring_period}`}
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-[var(--text)] tabular-nums shrink-0">
                            {formatCurrency(Number(e.amount_usd), currency as 'USD'|'ETB')}
                          </span>
                          {e.is_recurring && <Badge className="surface-2 text-muted shrink-0">{e.recurring_period}</Badge>}
                          {isFounder && (
                            <button onClick={() => onEdit(e)} className="p-1 text-muted hover:text-[var(--text)] shrink-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      }
    </div>
  );
}

// ── Income tab ─────────────────────────────────────────────────────────────
function IncomeTab({ income, products, currency, isFounder, onEdit, onNew }:
  { income: Income[]; products: Product[]; currency: string;
    isFounder: boolean; onEdit: (i: Income) => void; onNew: () => void; }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--text)]">Income</h3>
        {isFounder && <Button size="sm" onClick={onNew}><Plus className="w-4 h-4" /> Add Income</Button>}
      </div>
      {income.length === 0
        ? <Card className="p-8"><EmptyState icon={<TrendingUp className="w-8 h-8" />} title="No income recorded"
            description={isFounder ? 'Add revenue, grants, or investment entries.' : 'Income will appear here.'} /></Card>
        : <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-app text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Recurring</th>
                {isFounder && <th />}
              </tr></thead>
              <tbody>
                {income.map((i) => {
                  const prod = products.find((p) => p.id === i.product_id);
                  const cat = INC_CATEGORIES.find((c) => c.key === i.category);
                  return (
                    <tr key={i.id} className="border-b border-app last:border-0 hover:surface-2 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{i.description}</td>
                      <td className="px-4 py-3"><Badge color={cat?.color}>{cat?.label || i.category}</Badge></td>
                      <td className="px-4 py-3 text-muted">{prod?.name || 'Company-wide'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">
                        +{formatCurrency(Number(i.amount_usd), currency as 'USD'|'ETB')}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(i.income_date)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{i.is_recurring ? i.recurring_period : 'One-time'}</td>
                      {isFounder && <td className="px-4 py-3">
                        <button onClick={() => onEdit(i)} className="p-1 text-muted hover:text-[var(--text)]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>
  );
}

// ── Salaries tab ───────────────────────────────────────────────────────────
function SalariesTab({ salaries, profiles, currency, isFounder, onEdit, onNew }:
  { salaries: EmployeeSalary[]; profiles: Profile[]; currency: string;
    isFounder: boolean; onEdit: (s: EmployeeSalary) => void; onNew: () => void; }) {

  const profMap = new Map(profiles.map((p) => [p.id, p]));
  const totalMonthly = salaries.reduce((s, sal) => s + Number(sal.monthly_salary_usd), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-[var(--text)]">Employee Salaries</h3>
          {salaries.length > 0 && (
            <p className="text-xs text-muted mt-0.5">
              Total monthly: <span className="font-semibold accent">{formatCurrency(totalMonthly, currency as 'USD'|'ETB')}</span>
            </p>
          )}
        </div>
        {isFounder && <Button size="sm" onClick={onNew}><Plus className="w-4 h-4" /> Add Salary</Button>}
      </div>
      {salaries.length === 0
        ? <Card className="p-8"><EmptyState icon={<Users className="w-8 h-8" />} title="No salaries recorded"
            description={isFounder ? 'Add salary records per employee.' : 'Salary data is confidential.'} /></Card>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {salaries.map((sal) => {
            const prof = profMap.get(sal.profile_id);
            return (
              <Card key={sal.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={prof?.full_name || '?'} src={prof?.avatar_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[var(--text)] truncate">{prof?.full_name || 'Unknown'}</div>
                    <div className="text-xs text-muted truncate">{prof?.title || prof?.role}</div>
                    <div className="text-lg font-display font-bold accent mt-1">
                      {formatCurrency(Number(sal.monthly_salary_usd), currency as 'USD'|'ETB')}/mo
                    </div>
                    {sal.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{sal.notes}</div>}
                    <div className="text-[10px] text-muted mt-1">Effective {formatDate(sal.effective_date)}</div>
                  </div>
                  {isFounder && (
                    <button onClick={() => onEdit(sal)} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      }
    </div>
  );
}

// ── Bank tab ───────────────────────────────────────────────────────────────
function BankTab({ balances, currency, isFounder, onEdit, onNew }:
  { balances: BankBalance[]; currency: string;
    isFounder: boolean; onEdit: (b: BankBalance) => void; onNew: () => void; }) {

  const latest = balances[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[var(--text)]">Bank Accounts</h3>
        {isFounder && <Button size="sm" onClick={onNew}><Plus className="w-4 h-4" /> Record Balance</Button>}
      </div>
      {latest && (
        <Card className="p-6 mb-4 accent-tint-bg">
          <div className="text-xs font-semibold accent uppercase tracking-wider mb-1">Current Balance</div>
          <div className="text-4xl font-display font-bold text-[var(--text)]">
            {formatCurrency(Number(latest.balance_usd), currency as 'USD'|'ETB')}
          </div>
          <div className="text-sm text-muted mt-1">{latest.account_name} · as of {formatDate(latest.recorded_date)}</div>
        </Card>
      )}
      {balances.length === 0
        ? <Card className="p-8"><EmptyState icon={<Building2 className="w-8 h-8" />} title="No bank records"
            description={isFounder ? 'Record your current balance to track runway.' : 'No bank data available.'} /></Card>
        : <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-app text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Notes</th>
                {isFounder && <th />}
              </tr></thead>
              <tbody>
                {balances.map((b, idx) => {
                  const prev = balances[idx + 1];
                  const change = prev ? Number(b.balance_usd) - Number(prev.balance_usd) : null;
                  return (
                    <tr key={b.id} className="border-b border-app last:border-0 hover:surface-2 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{b.account_name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--text)] tabular-nums">
                        {formatCurrency(Number(b.balance_usd), currency as 'USD'|'ETB')}
                        {change !== null && (
                          <span className={`ml-2 text-xs ${change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {change >= 0 ? '+' : ''}{formatCurrency(change, currency as 'USD'|'ETB')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{formatDate(b.recorded_date)}</td>
                      <td className="px-4 py-3 text-xs text-muted max-w-xs truncate">{b.notes || '—'}</td>
                      {isFounder && <td className="px-4 py-3">
                        <button onClick={() => onEdit(b)} className="p-1 text-muted hover:text-[var(--text)]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      }
    </div>
  );
}

// ── Expense editor ─────────────────────────────────────────────────────────
function ExpenseEditor({ expense, products, currentUserId, onClose, onSaved }:
  { expense: Expense | null; products: Product[]; currentUserId: string; onClose: () => void; onSaved: (row?: Expense) => void; }) {
  const [description, setDescription] = useState(expense?.description || '');
  const [category, setCategory] = useState<Expense['category']>(expense?.category || 'rent');
  const [productId, setProductId] = useState(expense?.product_id || '');
  const [amount, setAmount] = useState(String(expense?.amount_usd || ''));
  const [expenseDate, setExpenseDate] = useState(expense?.expense_date || new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(expense?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState<Expense['recurring_period']>(expense?.recurring_period || 'monthly');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!description.trim() || !amount) return;
    setSaving(true);
    const payload = { description: description.trim(), category, product_id: productId || null,
      amount_usd: Number(amount), expense_date: expenseDate, is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null, created_by: currentUserId };
    if (expense) {
      const { data } = await supabase.from('expenses').update(payload).eq('id', expense.id).select('*').single();
      setSaving(false); onSaved(data as Expense || undefined);
    } else {
      const { data } = await supabase.from('expenses').insert(payload).select('*').single();
      setSaving(false); onSaved(data as Expense || undefined);
    }
  };
  const del = async () => { if (!expense) return; await supabase.from('expenses').delete().eq('id', expense.id); onSaved(); };

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit Expense' : 'Add Expense'}>
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Office rent, AWS…" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Expense['category'])}>
              {EXP_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Product</label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Company-wide</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Amount (USD)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Date</label>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsRecurring(!isRecurring)}
            className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isRecurring ? 'accent-bg text-white' : 'surface text-muted')}>
            Recurring
          </button>
          {isRecurring && (
            <Select value={recurringPeriod || 'monthly'} onChange={(e) => setRecurringPeriod(e.target.value as Expense['recurring_period'])} className="w-40">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </Select>
          )}
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {expense ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !description.trim() || !amount}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}

// ── Income editor ──────────────────────────────────────────────────────────
function IncomeEditor({ income, products, currentUserId, onClose, onSaved }:
  { income: Income | null; products: Product[]; currentUserId: string; onClose: () => void; onSaved: (row?: Income) => void; }) {
  const [description, setDescription] = useState(income?.description || '');
  const [category, setCategory] = useState<Income['category']>(income?.category || 'revenue');
  const [productId, setProductId] = useState(income?.product_id || '');
  const [amount, setAmount] = useState(String(income?.amount_usd || ''));
  const [incomeDate, setIncomeDate] = useState(income?.income_date || new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(income?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState(income?.recurring_period || 'monthly');
  const [notes, setNotes] = useState(income?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!description.trim() || !amount) return;
    setSaving(true);
    const payload = { description: description.trim(), category, product_id: productId || null,
      amount_usd: Number(amount), income_date: incomeDate, is_recurring: isRecurring,
      recurring_period: isRecurring ? recurringPeriod : null, notes: notes || null, created_by: currentUserId };
    if (income) {
      const { data } = await supabase.from('income').update(payload).eq('id', income.id).select('*').single();
      setSaving(false); onSaved(data as Income || undefined);
    } else {
      const { data } = await supabase.from('income').insert(payload).select('*').single();
      setSaving(false); onSaved(data as Income || undefined);
    }
  };
  const del = async () => { if (!income) return; await supabase.from('income').delete().eq('id', income.id); onSaved(); };

  return (
    <Modal open onClose={onClose} title={income ? 'Edit Income' : 'Add Income'}>
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Client payment, grant…" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Income['category'])}>
              {INC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Product</label>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Company-wide</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Amount (USD)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Date</label>
            <Input type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsRecurring(!isRecurring)}
            className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isRecurring ? 'accent-bg text-white' : 'surface text-muted')}>
            Recurring
          </button>
          {isRecurring && (
            <Select value={recurringPeriod} onChange={(e) => setRecurringPeriod(e.target.value)} className="w-40">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </Select>
          )}
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {income ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !description.trim() || !amount}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}

// ── Bank editor ────────────────────────────────────────────────────────────
function BankEditor({ balance, currentUserId, onClose, onSaved }:
  { balance: BankBalance | null; currentUserId: string; onClose: () => void; onSaved: (row?: BankBalance) => void; }) {
  const [accountName, setAccountName] = useState(balance?.account_name || 'Main Account');
  const [balanceUsd, setBalanceUsd] = useState(String(balance?.balance_usd || ''));
  const [recordedDate, setRecordedDate] = useState(balance?.recorded_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(balance?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!balanceUsd) return;
    setSaving(true);
    const payload = { account_name: accountName.trim() || 'Main Account',
      balance_usd: Number(balanceUsd), recorded_date: recordedDate, notes: notes || null, created_by: currentUserId };
    if (balance) {
      const { data } = await supabase.from('bank_balances').update(payload).eq('id', balance.id).select('*').single();
      setSaving(false); onSaved(data as BankBalance || undefined);
    } else {
      const { data } = await supabase.from('bank_balances').insert(payload).select('*').single();
      setSaving(false); onSaved(data as BankBalance || undefined);
    }
  };
  const del = async () => { if (!balance) return; await supabase.from('bank_balances').delete().eq('id', balance.id); onSaved(); };

  return (
    <Modal open onClose={onClose} title={balance ? 'Edit Balance' : 'Record Balance'}>
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Account name</label>
          <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Main Account" autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Balance (USD)</label>
            <Input type="number" value={balanceUsd} onChange={(e) => setBalanceUsd(e.target.value)} placeholder="50000" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Date</label>
            <Input type="date" value={recordedDate} onChange={(e) => setRecordedDate(e.target.value)} /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {balance ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !balanceUsd}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}

// ── Salary editor ──────────────────────────────────────────────────────────
function SalaryEditor({ salary, profiles, currentUserId, onClose, onSaved }:
  { salary: EmployeeSalary | null; profiles: Profile[]; currentUserId: string; onClose: () => void; onSaved: (row?: EmployeeSalary) => void; }) {
  const [profileId, setProfileId] = useState(salary?.profile_id || '');
  const [monthlyUsd, setMonthlyUsd] = useState(String(salary?.monthly_salary_usd || ''));
  const [effectiveDate, setEffectiveDate] = useState(salary?.effective_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(salary?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!profileId || !monthlyUsd) return;
    setSaving(true);
    const payload = { profile_id: profileId, monthly_salary_usd: Number(monthlyUsd),
      effective_date: effectiveDate, notes: notes || null, created_by: currentUserId };
    if (salary) {
      const { data } = await supabase.from('employee_salaries').update(payload).eq('id', salary.id).select('*').single();
      setSaving(false); onSaved(data as EmployeeSalary || undefined);
    } else {
      const { data } = await supabase.from('employee_salaries').insert(payload).select('*').single();
      setSaving(false); onSaved(data as EmployeeSalary || undefined);
    }
  };
  const del = async () => { if (!salary) return; await supabase.from('employee_salaries').delete().eq('id', salary.id); onSaved(); };

  return (
    <Modal open onClose={onClose} title={salary ? 'Edit Salary' : 'Add Salary'}>
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Employee</label>
          <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select employee…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.title || p.role}</option>)}
          </Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Monthly salary (USD)</label>
            <Input type="number" value={monthlyUsd} onChange={(e) => setMonthlyUsd(e.target.value)} placeholder="3000" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Effective date</label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Performance note, contract type…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {salary ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !profileId || !monthlyUsd}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}
