import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, PieChart, Pencil, DollarSign } from 'lucide-react';
import { supabase, type EquityHolding, type CompanySettings } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const CLASS_COLORS: Record<string, string> = {
  common: '#6C63FF', preferred: '#3B82F6', options: '#F59E0B', warrants: '#10B981',
};
const CLASS_LABELS: Record<string, string> = {
  common: 'Common', preferred: 'Preferred', options: 'Options', warrants: 'Warrants',
};

export default function EquityPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const [holdings, setHoldings] = useState<EquityHolding[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [editing, setEditing] = useState<EquityHolding | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);

  const load = async () => {
    const [{ data: h }, { data: s }] = await Promise.all([
      supabase.from('equity_holdings').select('*').order('created_at'),
      supabase.from('company_settings').select('*').limit(1).maybeSingle(),
    ]);
    setHoldings(h || []);
    setSettings(s as CompanySettings | null);
  };

  useEffect(() => { load(); }, []);

  const totalShares = useMemo(() => holdings.reduce((sum, h) => sum + Number(h.shares), 0), [holdings]);
  // Share price is the ONLY editable valuation input — total equity always = shares × price
  const sharePrice = settings?.share_price_usd ?? 0.01;
  const totalEquity = totalShares * sharePrice;

  const ownership = (shares: number) => totalShares > 0 ? (shares / totalShares) * 100 : 0;

  const segments = useMemo(() => {
    let angle = 0;
    return holdings.map((h) => {
      const pct = ownership(Number(h.shares));
      const seg = { color: CLASS_COLORS[h.share_class] || '#9CA3AF', start: angle, end: angle + pct * 3.6, pct, name: h.holder_name };
      angle += pct * 3.6;
      return seg;
    });
  }, [holdings, totalShares]);

  if (profile?.role !== 'founder') {
    return <PageContainer><EmptyState title="Access restricted" description="Equity management is only available to founders." /></PageContainer>;
  }

  return (
    <PageContainer title="Equity Management" actions={
      <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Add Holding</Button>
    }>
      <p className="text-sm text-muted -mt-2 mb-6">
        Cap table — ownership % auto-calculates from share counts.
        Only the share price can be changed to sync total valuation.
      </p>

      {/* Cap table */}
      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Holder</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium text-right">Shares</th>
                  <th className="px-4 py-3 font-medium text-right">Ownership</th>
                  <th className="px-4 py-3 font-medium text-right">Value ({currency})</th>
                  <th className="px-4 py-3 font-medium">Vesting</th>
                  <th className="px-4 py-3 font-medium">Vest Start</th>
                  <th className="px-4 py-3 font-medium">Invested</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const pct = ownership(Number(h.shares));
                  const usdValue = Number(h.shares) * sharePrice;
                  return (
                    <tr key={h.id} className="border-b border-app last:border-0 hover:surface-2 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{h.holder_name}</td>
                      <td className="px-4 py-3"><Badge color={CLASS_COLORS[h.share_class]}>{CLASS_LABELS[h.share_class]}</Badge></td>
                      <td className="px-4 py-3 text-right text-[var(--text)] tabular-nums">{Number(h.shares).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full surface-2 overflow-hidden">
                            <div className="h-full accent-bg" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-semibold text-[var(--text)] tabular-nums">{pct.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums">{formatCurrency(usdValue, currency)}</td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{h.vesting_years}yr / {h.cliff_years}yr cliff</td>
                      <td className="px-4 py-3 text-xs text-muted">{h.vesting_start ? formatDate(h.vesting_start) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted tabular-nums">
                        {h.investment_amount_usd && Number(h.investment_amount_usd) > 0
                          ? formatCurrency(Number(h.investment_amount_usd), currency)
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setEditing(h)} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {holdings.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-app font-semibold">
                    <td className="px-4 py-3 text-[var(--text)]" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right text-[var(--text)] tabular-nums">{totalShares.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right accent tabular-nums">100.00%</td>
                    <td className="px-4 py-3 text-right text-[var(--text)] tabular-nums">{formatCurrency(totalEquity, currency)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {holdings.length === 0 && (
            <EmptyState icon={<PieChart className="w-8 h-8" />} title="No holdings yet" description="Add equity holdings to build your cap table." />
          )}
        </Card>

        {/* Side panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-[var(--text)] mb-4">Ownership Chart</h3>
            {totalShares > 0 ? (
              <div className="flex flex-col items-center">
                <Donut segments={segments} />
                <div className="mt-4 space-y-1.5 w-full">
                  {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[var(--text)] flex-1 truncate">{s.name}</span>
                      <span className="text-muted tabular-nums">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-muted text-center py-8">Add holdings to see the chart.</p>}
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-[var(--text)] mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <SRow label="Total shares" value={totalShares.toLocaleString()} />
              <SRow label="Holders" value={String(holdings.length)} />
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">Share price</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-[var(--text)] tabular-nums">{formatCurrency(sharePrice, currency)}</span>
                  <button onClick={() => setEditingPrice(true)} className="p-1 rounded text-muted hover:text-[var(--accent)] hover:surface-2 transition-colors" title="Edit share price">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="border-t border-app pt-2">
                <SRow label="Total value" value={formatCurrency(totalEquity, currency)} />
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {(creating || editing) && (
        <HoldingEditor
          holding={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { load(); setCreating(false); setEditing(null); }}
        />
      )}
      {editingPrice && (
        <SharePriceEditor
          settings={settings}
          onClose={() => setEditingPrice(false)}
          onSaved={() => { load(); setEditingPrice(false); }}
        />
      )}
    </PageContainer>
  );
}

function SRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-[var(--text)] tabular-nums">{value}</span>
    </div>
  );
}

function Donut({ segments }: { segments: { color: string; start: number; end: number }[] }) {
  const r = 60, cx = 75, cy = 75, sw = 24, circ = 2 * Math.PI * r;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2, #e5e7eb)" strokeWidth={sw} />
      {segments.map((s, i) => {
        const len = ((s.end - s.start) / 360) * circ;
        const offset = -((s.start - 90) / 360) * circ;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={offset}
          />
        );
      })}
    </svg>
  );
}

// ── Share price editor — the ONLY thing that changes valuation ─────────────
function SharePriceEditor({ settings, onClose, onSaved }:
  { settings: CompanySettings | null; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(String(settings?.share_price_usd ?? '0.01'));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!price || Number(price) <= 0) return;
    setSaving(true);
    const payload = { share_price_usd: Number(price) };
    if (settings) {
      await supabase.from('company_settings').update(payload).eq('id', settings.id);
    } else {
      await supabase.from('company_settings').insert({ ...payload, total_equity_value_usd: 0, total_shares_issued: 0 });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Edit Share Price">
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted">
          Changing the share price will automatically recalculate the total equity value
          for all holders. Shares counts are not affected.
        </p>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Share price (USD)</label>
          <Input type="number" step="0.0001" min="0.0001" value={price}
            onChange={(e) => setPrice(e.target.value)} placeholder="0.01" autoFocus />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !price || Number(price) <= 0}>
          {saving ? 'Saving…' : 'Update Price'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Holding editor — full detail fields ───────────────────────────────────
function HoldingEditor({ holding, onClose, onSaved }:
  { holding: EquityHolding | null; onClose: () => void; onSaved: () => void }) {
  const [holderName, setHolderName] = useState(holding?.holder_name || '');
  const [shares, setShares] = useState(String(holding?.shares || ''));
  const [shareClass, setShareClass] = useState<EquityHolding['share_class']>(holding?.share_class || 'common');
  const [vestingYears, setVestingYears] = useState(String(holding?.vesting_years ?? 4));
  const [cliffYears, setCliffYears] = useState(String(holding?.cliff_years ?? 1));
  const [vestingStart, setVestingStart] = useState(holding?.vesting_start || '');
  const [investmentUsd, setInvestmentUsd] = useState(String(holding?.investment_amount_usd || ''));
  const [notes, setNotes] = useState(holding?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!holderName.trim() || !shares) return;
    setSaving(true);
    const payload = {
      holder_name: holderName.trim(),
      shares: Number(shares),
      share_class: shareClass,
      vesting_years: Number(vestingYears) || 4,
      cliff_years: Number(cliffYears) || 1,
      vesting_start: vestingStart || null,
      investment_amount_usd: Number(investmentUsd) || null,
      notes: notes.trim() || null,
    };
    if (holding) await supabase.from('equity_holdings').update(payload).eq('id', holding.id);
    else await supabase.from('equity_holdings').insert(payload);
    setSaving(false);
    onSaved();
  };

  const del = async () => {
    if (!holding) return;
    await supabase.from('equity_holdings').delete().eq('id', holding.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={holding ? 'Edit Holding' : 'Add Holding'} className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Holder name</label>
          <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Shares</label>
            <Input type="number" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="100000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Share class</label>
            <Select value={shareClass} onChange={(e) => setShareClass(e.target.value as EquityHolding['share_class'])}>
              <option value="common">Common</option>
              <option value="preferred">Preferred</option>
              <option value="options">Options</option>
              <option value="warrants">Warrants</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Vesting (years)</label>
            <Input type="number" value={vestingYears} onChange={(e) => setVestingYears(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Cliff (years)</label>
            <Input type="number" value={cliffYears} onChange={(e) => setCliffYears(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Vesting start date</label>
          <Input type="date" value={vestingStart} onChange={(e) => setVestingStart(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Amount invested (USD) <span className="font-normal text-muted">— optional</span></label>
          <Input type="number" value={investmentUsd} onChange={(e) => setInvestmentUsd(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {holding
          ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button>
          : <div />
        }
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !holderName.trim() || !shares}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
