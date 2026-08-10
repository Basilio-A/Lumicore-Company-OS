import { useEffect, useState, useMemo } from 'react';
import { Plus, FileText, Trash2, TrendingUp, DollarSign, PieChart, Upload } from 'lucide-react';
import { supabase, type InvestorMemo, type EquityHolding, type Product, type Profile, type CompanySettings, type InvestorDocument } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState } from '@/components/ui';
import { Markdown } from '@/components/Markdown';
import { formatCurrency, formatRelative, formatDate, cn } from '@/lib/utils';

type Tab = 'overview' | 'updates' | 'documents';

const CLASS_COLORS: Record<string, string> = { common: '#6C63FF', preferred: '#3B82F6', options: '#F59E0B', warrants: '#10B981' };
const CLASS_LABELS: Record<string, string> = { common: 'Common', preferred: 'Preferred', options: 'Options Pool', warrants: 'Warrants' };

export default function InvestorPortalPage() {
  const { profile } = useAuth();
  const { currency } = usePrefs();
  const [tab, setTab] = useState<Tab>('overview');
  const [memos, setMemos] = useState<InvestorMemo[]>([]);
  const [selected, setSelected] = useState<InvestorMemo | null>(null);
  const [editing, setEditing] = useState(false);
  const [holdings, setHoldings] = useState<EquityHolding[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [documents, setDocuments] = useState<InvestorDocument[]>([]);
  const [creating, setCreating] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);

  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const { data: m } = await supabase.from('investor_memos').select('*').order('created_at', { ascending: false });
    setMemos(m || []);
    if (m && m.length > 0 && !selected) setSelected(m[0]);
    const { data: h } = await supabase.from('equity_holdings').select('*');
    setHoldings(h || []);
    const { data: p } = await supabase.from('products').select('*');
    setProducts(p || []);
    const { data: ppl } = await supabase.from('profiles').select('*').eq('status', 'active');
    setPeople(ppl || []);
    const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
    setSettings(s as CompanySettings | null);
    const { data: docs } = await supabase.from('investor_documents').select('*').order('created_at', { ascending: false });
    setDocuments(docs || []);
  };

  useEffect(() => { load(); }, []);

  const totalShares = useMemo(() => holdings.reduce((s, h) => s + Number(h.shares), 0), [holdings]);
  const sharePrice = settings?.share_price_usd || 0.01;
  // Total equity is always auto-calculated from shares × price — not manually editable
  const totalEquity = totalShares * sharePrice;
  const [expandedHolder, setExpandedHolder] = useState<string | null>(null);

  const sharesByClass = useMemo(() => {
    const classes = ['common', 'preferred', 'options', 'warrants'];
    return classes.map((c) => {
      const classHoldings = holdings.filter((h) => h.share_class === c);
      const shares = classHoldings.reduce((s, h) => s + Number(h.shares), 0);
      return { class: c, shares, holders: classHoldings.length, pct: totalShares > 0 ? (shares / totalShares) * 100 : 0 };
    }).filter((s) => s.shares > 0);
  }, [holdings, totalShares]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'updates', label: 'Investor Updates' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <PageContainer title="Investor Portal">
      <div className="flex items-center gap-1 mb-6 border-b border-app -mt-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('px-4 py-2.5 text-sm font-medium transition-colors relative', tab === t.key ? 'accent' : 'text-muted hover:text-[var(--text)]')}>
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 accent-bg" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid lg:grid-cols-3 gap-4 mb-6">
            <Card className="p-5">
              <div className="text-sm text-muted mb-1">Products</div>
              <div className="text-3xl font-display font-bold text-[var(--text)]">{products.length}</div>
              <div className="text-xs text-muted mt-1">{products.map((p) => p.name).join(', ') || 'None'}</div>
            </Card>
            <Card className="p-5">
              <div className="text-sm text-muted mb-1">Team Size</div>
              <div className="text-3xl font-display font-bold text-[var(--text)]">{people.length}</div>
              <div className="text-xs text-muted mt-1">{people.filter((p) => p.role === 'founder').length} founders · {people.filter((p) => p.role === 'employee').length} employees</div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-muted">Total Equity Value</div>
              </div>
              <div className="text-3xl font-display font-bold text-[var(--text)]">{formatCurrency(totalEquity, currency)}</div>
              <div className="text-xs text-muted mt-1">{holdings.length} holders · {totalShares.toLocaleString()} shares · {formatCurrency(sharePrice, currency)}/share</div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 accent" /> Cap Table</h3>
              {holdings.length === 0 ? <p className="text-sm text-muted py-4">No equity data available.</p> : (
                <div className="space-y-1">
                  {holdings.map((h) => {
                    const pct = totalShares > 0 ? (Number(h.shares) / totalShares) * 100 : 0;
                    const value = Number(h.shares) * sharePrice;
                    const isExpanded = expandedHolder === h.id;
                    return (
                      <div key={h.id} className="rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedHolder(isExpanded ? null : h.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:surface-2 transition-colors text-left"
                        >
                          <Badge color={CLASS_COLORS[h.share_class]} className="shrink-0">{CLASS_LABELS[h.share_class]}</Badge>
                          <span className="text-sm text-[var(--text)] flex-1 truncate font-medium">{h.holder_name}</span>
                          <div className="w-20 h-1.5 rounded-full surface-2 overflow-hidden shrink-0">
                            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: CLASS_COLORS[h.share_class] }} />
                          </div>
                          <span className="text-sm font-bold text-[var(--text)] tabular-nums w-14 text-right shrink-0">{pct.toFixed(1)}%</span>
                          <svg className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 surface-2 rounded-b-lg">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                              <DetailRow label="Shares" value={Number(h.shares).toLocaleString()} />
                              <DetailRow label="Share class" value={CLASS_LABELS[h.share_class]} />
                              <DetailRow label="Value" value={formatCurrency(value, currency)} />
                              <DetailRow label="Ownership" value={`${pct.toFixed(2)}%`} />
                              <DetailRow label="Vesting" value={`${h.vesting_years}yr / ${h.cliff_years}yr cliff`} />
                              {h.vesting_start && <DetailRow label="Vest start" value={new Date(h.vesting_start).toLocaleDateString()} />}
                              {h.investment_amount_usd && Number(h.investment_amount_usd) > 0 && (
                                <DetailRow label="Invested" value={formatCurrency(Number(h.investment_amount_usd), currency)} />
                              )}
                              {h.notes && <div className="col-span-2 text-muted mt-1 italic">"{h.notes}"</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><PieChart className="w-4 h-4 accent" /> Share Breakdown by Type</h3>
              {sharesByClass.length === 0 ? <p className="text-sm text-muted py-4">No share data available.</p> : (
                <div className="space-y-3">
                  {sharesByClass.map((s) => (
                    <div key={s.class}>
                      <div className="flex items-center justify-between mb-1">
                        <Badge color={CLASS_COLORS[s.class]}>{CLASS_LABELS[s.class]}</Badge>
                        <span className="text-sm font-medium text-[var(--text)] tabular-nums">{s.shares.toLocaleString()} ({s.pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 rounded-full surface-2 overflow-hidden"><div className="h-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: CLASS_COLORS[s.class] }} /></div>
                      <div className="text-xs text-muted mt-0.5">{s.holders} holder{s.holders !== 1 ? 's' : ''} · {formatCurrency(Number(s.shares) * sharePrice, currency)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'updates' && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[var(--text)]">Investor Updates & Memos</h3>
              {isFounder && <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Memo</Button>}
            </div>
            {selected ? (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-display font-semibold text-[var(--text)]">{selected.title}</h2>
                    <p className="text-xs text-muted">{formatDate(selected.created_at)}</p>
                  </div>
                  {isFounder && (
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={async () => { await supabase.from('investor_memos').delete().eq('id', selected.id); setMemos((p) => p.filter((m) => m.id !== selected.id)); setSelected(null); }} className="text-rose-500"><Trash2 className="w-4 h-4" /></Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    </div>
                  )}
                </div>
                {editing && isFounder ? (
                  <MemoEditor memo={selected} onClose={() => setEditing(false)} onSaved={async () => { await load(); setEditing(false); }} />
                ) : (
                  <Markdown content={selected.content} />
                )}
              </Card>
            ) : (
              <Card className="p-8"><EmptyState icon={<FileText className="w-8 h-8" />} title="No memo selected" description="Select a memo from the list." /></Card>
            )}
          </div>
          <Card className="p-5 h-fit">
            <h3 className="font-semibold text-[var(--text)] mb-4">All Updates</h3>
            {memos.length === 0 ? <p className="text-sm text-muted py-4">No updates yet.</p> : (
              <div className="space-y-1">
                {memos.map((m) => (
                  <button key={m.id} onClick={() => { setSelected(m); setEditing(false); }} className={cn('w-full text-left rounded-lg px-3 py-2 transition-colors', selected?.id === m.id ? 'accent-tint-bg accent' : 'hover:surface-2')}>
                    <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 shrink-0" /><span className="text-sm font-medium truncate flex-1">{m.title}</span></div>
                    <div className="text-[10px] text-muted mt-0.5 ml-5">{formatRelative(m.updated_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text)]">Documents</h3>
            {isFounder && <Button size="sm" onClick={() => setCreatingDoc(true)}><Plus className="w-4 h-4" /> Upload Document</Button>}
          </div>
          {documents.length === 0 ? (
            <Card className="p-8"><EmptyState icon={<FileText className="w-8 h-8" />} title="No documents" description={isFounder ? 'Upload reports, financials, or legal docs.' : 'Documents will appear here.'} /></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((d) => (
                <Card key={d.id} className="p-4 group">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg surface-2 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-muted" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[var(--text)] truncate">{d.title}</div>
                      <Badge color="#6B7280" className="mt-1">{d.doc_type}</Badge>
                      {d.description && <p className="text-xs text-muted mt-2 line-clamp-2">{d.description}</p>}
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted">{formatDate(d.created_at)}</span>
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs accent hover:underline">View</a>
                      </div>
                    </div>
                    {isFounder && <button onClick={async () => { await supabase.from('investor_documents').delete().eq('id', d.id); load(); }} className="p-1 text-muted hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {creating && isFounder && <MemoCreator currentUserId={profile?.id || null} onClose={() => setCreating(false)} onCreated={load} />}
      {creatingDoc && isFounder && <DocCreator currentUserId={profile?.id || null} onClose={() => setCreatingDoc(false)} onCreated={load} />}
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-[var(--text)] tabular-nums text-right">{value}</span>
    </div>
  );
}

function MemoEditor({ memo, onClose, onSaved }: { memo: InvestorMemo; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(memo.title);
  const [content, setContent] = useState(memo.content);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await supabase.from('investor_memos').update({ title: title.trim(), content }).eq('id', memo.id);
    setSaving(false);
    onSaved();
  };
  return (
    <div className="space-y-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-semibold" />
      <Textarea rows={16} value={content} onChange={(e) => setContent(e.target.value)} className="font-mono text-sm" placeholder="Write the full memo content — supports Markdown…" />
      <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
    </div>
  );
}

function MemoCreator({ currentUserId, onClose, onCreated }: { currentUserId: string | null; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim() || !currentUserId) return;
    setSaving(true);
    await supabase.from('investor_memos').insert({ title: title.trim(), content, created_by: currentUserId });
    setSaving(false);
    onCreated();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New Investor Memo" className="max-w-2xl">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly Update — August 2026" autoFocus /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Content (Markdown supported)</label><Textarea rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="# Highlights&#10;&#10;What went well this month…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !title.trim()}>{saving ? 'Creating…' : 'Create'}</Button></div>
    </Modal>
  );
}

function DocCreator({ currentUserId, onClose, onCreated }: { currentUserId: string | null; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [docType, setDocType] = useState<InvestorDocument['doc_type']>('report');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim() || !fileUrl.trim() || !currentUserId) return;
    setSaving(true);
    await supabase.from('investor_documents').insert({ title: title.trim(), description, file_url: fileUrl.trim(), doc_type: docType, created_by: currentUserId });
    setSaving(false);
    onCreated();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Upload Document">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Title</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 2026 Financial Report" autoFocus /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Description</label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of the document" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">File URL</label><Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://… (link to PDF, doc, etc.)" /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Type</label><Select value={docType} onChange={(e) => setDocType(e.target.value as InvestorDocument['doc_type'])}><option value="report">Report</option><option value="financial">Financial</option><option value="legal">Legal</option><option value="presentation">Presentation</option><option value="other">Other</option></Select></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !title.trim() || !fileUrl.trim()}>{saving ? 'Saving…' : 'Save'}</Button></div>
    </Modal>
  );
}


