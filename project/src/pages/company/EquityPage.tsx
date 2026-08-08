import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, PieChart, Pencil } from 'lucide-react';
import { supabase, type EquityHolding, type CompanySettings } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const CLASS_COLORS: Record<string, string> = {
  common: '#6C63FF', preferred: '#3B82F6', options: '#F59E0B', warrants: '#10B981',
};

// Role-based colors for cap table display
const ROLE_COLORS_EQUITY: Record<string, string> = {
  founder: '#6C63FF',
  investor: '#10B981',
  shareholder: '#F59E0B',
  employee: '#3B82F6',
};

export default function EquityPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const convert = (usd: number) => currency === 'ETB' ? usd * 161 : usd;
  const [holdings, setHoldings] = useState<EquityHolding[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string>>({});  // id -> role
  const [editing, setEditing] = useState<EquityHolding | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('equity_holdings').select('*').order('created_at');
    setHoldings(data || []);
    const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
    setSettings(s as CompanySettings | null);
    // Load profiles to map holder names to roles for coloring
    const { data: profs } = await supabase.from('profiles').select('id, full_name, role').eq('status', 'active');
    const roleMap: Record<string, string> = {};
    for (const p of profs || []) roleMap[p.full_name] = p.role;
    setProfiles(roleMap);
  };
  useEffect(() => { load(); }, []);

  // Helper: pick color by holder name (try role match, fall back to share class color)
  const holderColor = (h: EquityHolding) => {
    const role = profiles[h.holder_name];
    if (role && ROLE_COLORS_EQUITY[role]) return ROLE_COLORS_EQUITY[role];
    return CLASS_COLORS[h.share_class] || '#9CA3AF';
  };

  const totalShares = useMemo(() => holdings.reduce((sum, h) => sum + Number(h.shares), 0), [holdings]);

  // Share price is the only editable field; total equity always auto-calculates
  const sharePrice = settings?.share_price_usd || 0.01;
  const totalEquity = totalShares * sharePrice;

  const ownership = (shares: number) => totalShares > 0 ? (shares / totalShares) * 100 : 0;

  const segments = useMemo(() => {
    let angle = 0;
    return holdings.map((h) => {
      const pct = ownership(Number(h.shares));
      const color = holderColor(h);
      const seg = { color, start: angle, end: angle + pct * 3.6, pct, name: h.holder_name };
      angle += pct * 3.6;
      return seg;
    });
  }, [holdings, totalShares, profiles]);

  if (profile?.role !== 'founder') {
    return <PageContainer><EmptyState title="Access restricted" description="Equity management is only available to founders." /></PageContainer>;
  }

  return (
    <PageContainer
      title="Equity Management"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditingSettings(true)}><Pencil className="w-4 h-4" /> Share Price</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Add Holding</Button>
        </div>
      }
    >
      <p className="text-sm text-muted -mt-2 mb-6">
        Cap table — total equity auto-calculates from share count × share price. Only the price per share is editable.
      </p>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const pct = ownership(Number(h.shares));
                  const usdValue = Number(h.shares) * sharePrice;
                  const color = holderColor(h);
                  return (
                    <tr key={h.id} className="border-b border-app last:border-0 hover:surface-2 transition-colors cursor-pointer" onClick={() => setEditing(h)}>
                      <td className="px-4 py-3 font-medium text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          {h.holder_name}
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge color={CLASS_COLORS[h.share_class]}>{h.share_class}</Badge></td>
                      <td className="px-4 py-3 text-right text-[var(--text)]">{Number(h.shares).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full surface-2 overflow-hidden">
                            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                          <span className="font-semibold text-[var(--text)] tabular-nums">{pct.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums">{formatCurrency(convert(usdValue), currency)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{h.vesting_years}yr / {h.cliff_years}yr cliff</td>
                      <td className="px-4 py-3"><Pencil className="w-3.5 h-3.5 text-muted opacity-0 hover:opacity-100" /></td>
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
                    <td className="px-4 py-3 text-right text-[var(--text)] tabular-nums">{formatCurrency(convert(totalEquity), currency)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {holdings.length === 0 && (
            <EmptyState icon={<PieChart className="w-8 h-8" />} title="No holdings yet" description="Add equity holdings to build your cap table." />
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-[var(--text)] mb-4">Ownership Chart</h3>
            {totalShares > 0 ? (
              <div className="flex flex-col items-center">
                <Donut segments={segments} />
                <div className="mt-4 space-y-1.5 w-full">
                  {segments.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                      <span className="text-[var(--text)] flex-1 truncate">{s.name}</span>
                      <span className="text-muted tabular-nums">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted text-center py-8">Add holdings to see the chart.</p>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="font-semibold text-[var(--text)] mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <Row label="Total shares" value={totalShares.toLocaleString()} />
              <Row label="Holders" value={String(holdings.length)} />
              <Row label="Total value" value={formatCurrency(convert(totalEquity), currency)} highlight />
              <Row label="Share price (USD)" value={`$${sharePrice}`} />
              {currency === 'ETB' && settings && (
                <div className="text-xs text-muted pt-1">
                  ETB rate is applied from the live rate set in Financials.
                </div>
              )}
            </div>
            <button
              onClick={() => setEditingSettings(true)}
              className="mt-3 text-xs accent hover:underline"
            >
              Edit share price
            </button>
          </Card>
        </div>
      </div>

      {(creating || editing) && (
        <HoldingEditor
          holding={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { load(); setCreating(false); setEditing(null); }}
        />
      )}

      {editingSettings && (
        <SharePriceEditor
          settings={settings}
          onClose={() => setEditingSettings(false)}
          onSaved={() => { load(); setEditingSettings(false); }}
        />
      )}
    </PageContainer>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-medium tabular-nums ${highlight ? 'accent' : 'text-[var(--text)]'}`}>{value}</span>
    </div>
  );
}

function Donut({ segments }: { segments: { color: string; start: number; end: number }[] }) {
  const r = 60, cx = 75, cy = 75, sw = 24, circ = 2 * Math.PI * r;
  return (
    <svg width="150" height="150" viewBox="0 0 150 150">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={sw} />
      {segments.map((s, i) => {
        const len = ((s.end - s.start) / 360) * circ;
        const offset = ((s.start - 90) / 360) * circ;
        return (
          <circle
            key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
    </svg>
  );
}

// Only share price is editable — total equity derives from shares × price
function SharePriceEditor({ settings, onClose, onSaved }: { settings: CompanySettings | null; onClose: () => void; onSaved: () => void }) {
  const [sharePrice, setSharePrice] = useState(String(settings?.share_price_usd || '0.01'));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload = { share_price_usd: Number(sharePrice) || 0.01 };
    if (settings) {
      await supabase.from('company_settings').update(payload).eq('id', settings.id);
    } else {
      await supabase.from('company_settings').insert({ ...payload, total_equity_value_usd: 0, total_shares_issued: 1000000 });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Edit Share Price">
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted">
          Total equity value is always calculated automatically as total shares × price per share. You can only edit the price per share.
        </p>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Price per share (USD)</label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={sharePrice}
            onChange={(e) => setSharePrice(e.target.value)}
            placeholder="0.01"
            autoFocus
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </Modal>
  );
}

function HoldingEditor({ holding, onClose, onSaved }: { holding: EquityHolding | null; onClose: () => void; onSaved: () => void }) {
  const [holderName, setHolderName] = useState(holding?.holder_name || '');
  const [shares, setShares] = useState(String(holding?.shares || ''));
  const [shareClass, setShareClass] = useState<EquityHolding['share_class']>(holding?.share_class || 'common');
  const [vestingYears, setVestingYears] = useState(String(holding?.vesting_years || 4));
  const [cliffYears, setCliffYears] = useState(String(holding?.cliff_years || 1));
  const [vestingStart, setVestingStart] = useState(holding?.vesting_start || '');
  const [investmentAmount, setInvestmentAmount] = useState(String(holding?.investment_amount_usd || ''));
  const [notes, setNotes] = useState(holding?.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!holderName.trim() || !shares) return;
    setSaving(true);
    const payload = {
      holder_name: holderName.trim(),
      shares: Number(shares),
      share_class: shareClass,
      vesting_years: Number(vestingYears),
      cliff_years: Number(cliffYears),
      vesting_start: vestingStart || null,
      investment_amount_usd: investmentAmount ? Number(investmentAmount) : null,
      notes: notes || null,
    };
    if (holding) {
      // Accumulate shares: add new shares to existing count
      await supabase.from('equity_holdings').update({
        ...payload,
        shares: Number(shares), // editor shows current total; user sets final number
      }).eq('id', holding.id);
    } else {
      await supabase.from('equity_holdings').insert(payload);
    }
    setSaving(false);
    onSaved();
  };

  const del = async () => {
    if (!holding) return;
    await supabase.from('equity_holdings').delete().eq('id', holding.id);
    onSaved();
  };

  // When editing an existing holder, show helper to add MORE shares
  const [addMode, setAddMode] = useState(false);
  const [addShares, setAddShares] = useState('');

  const addToExisting = async () => {
    if (!holding || !addShares) return;
    setSaving(true);
    const newTotal = Number(holding.shares) + Number(addShares);
    await supabase.from('equity_holdings').update({ shares: newTotal }).eq('id', holding.id);
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={holding ? 'Edit Holding' : 'Add Holding'} className="max-w-lg">
      <div className="p-5 space-y-4">
        {holding && (
          <div className="rounded-lg surface-2 px-3 py-2.5 flex items-center justify-between">
            <div className="text-xs text-muted">Current shares: <span className="font-semibold text-[var(--text)]">{Number(holding.shares).toLocaleString()}</span></div>
            <button
              type="button"
              onClick={() => setAddMode((m) => !m)}
              className="text-xs accent hover:underline"
            >
              {addMode ? 'Edit directly' : '+ Add more shares'}
            </button>
          </div>
        )}

        {holding && addMode ? (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Shares to add</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
                placeholder="e.g. 50000"
                autoFocus
              />
              <Button size="sm" onClick={addToExisting} disabled={saving || !addShares}>
                {saving ? 'Adding…' : 'Add'}
              </Button>
            </div>
            <p className="text-xs text-muted mt-1">
              New total: {(Number(holding.shares) + Number(addShares || 0)).toLocaleString()}
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Holder name</label>
              <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Jane Doe" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Total shares</label>
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
                <label className="block text-xs font-medium text-muted mb-1.5">Vesting years</label>
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
              <label className="block text-xs font-medium text-muted mb-1.5">Investment amount (USD, optional)</label>
              <Input type="number" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="e.g. 50000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </>
        )}
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {holding ? (
          <Button variant="ghost" size="sm" onClick={del} className="text-rose-500">
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        ) : <div />}
        {!addMode && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !holderName.trim() || !shares}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
        {addMode && (
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        )}
      </div>
    </Modal>
  );
}
