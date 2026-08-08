import { useEffect, useState, useRef, useCallback } from 'react';
import { Sparkles, Send, X, Lightbulb, Compass, BookOpen, TrendingUp, DollarSign, Users } from 'lucide-react';
import { supabase, type Product, type Profile } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: { label: string; action: string }[];
  created_at: string;
}

const QUICK_ACTIONS = [
  { label: 'Company overview', query: 'Give me a company overview', icon: Compass },
  { label: 'Team summary', query: 'Summarize the team', icon: Users },
  { label: 'Product status', query: 'What is the status of all products?', icon: BookOpen },
  { label: 'Financial summary', query: 'Give me a financial summary', icon: DollarSign },
  { label: 'Equity overview', query: 'Show me the equity breakdown', icon: TrendingUp },
];

/** Strip markdown bold/italic markers so the AI writes plain text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')   // bold+italic
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/#{1,6}\s+/g, '')               // headings
    .replace(/`(.+?)`/g, '$1');              // inline code
}

export function AIAssistant() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [bankBalances, setBankBalances] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async () => {
    const [p, ppl, e, inc, h, bb, s] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('profiles').select('*').eq('status', 'active'),
      supabase.from('expenses').select('*'),
      supabase.from('income').select('*'),
      supabase.from('equity_holdings').select('*'),
      supabase.from('bank_balances').select('*').order('recorded_date', { ascending: false }).limit(1),
      supabase.from('company_settings').select('*').limit(1).maybeSingle(),
    ]);
    setProducts(p.data || []);
    setPeople(ppl.data || []);
    setExpenses(e.data || []);
    setIncome(inc.data || []);
    setHoldings(h.data || []);
    setBankBalances(bb.data || []);
    setSettings(s.data);
  }, []);

  useEffect(() => { if (open) loadContext(); }, [open, loadContext]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Helpers
  const recurringMonthly = (list: any[]) =>
    list.filter((e) => e.is_recurring && e.recurring_period === 'monthly').reduce((s: number, e: any) => s + Number(e.amount_usd), 0)
    + list.filter((e) => e.is_recurring && e.recurring_period === 'annually').reduce((s: number, e: any) => s + Number(e.amount_usd) / 12, 0)
    + list.filter((e) => e.is_recurring && e.recurring_period === 'quarterly').reduce((s: number, e: any) => s + Number(e.amount_usd) / 3, 0);

  const generateResponse = (query: string): Msg => {
    const q = query.toLowerCase();
    let content = '';
    const suggestions: { label: string; action: string }[] = [];

    const totalShares = holdings.reduce((s: number, h: any) => s + Number(h.shares), 0);
    const sharePrice = settings?.share_price_usd || 0.01;
    const totalEquity = totalShares * sharePrice;
    const monthlyBurn = recurringMonthly(expenses);
    const monthlyIncome = recurringMonthly(income);
    const latestBank = bankBalances[0]?.balance_usd || 0;

    if (q.includes('overview') || q.includes('company') || (q.includes('summary') && !q.includes('team') && !q.includes('finance') && !q.includes('financial'))) {
      const founders = people.filter((p) => p.role === 'founder');
      const employees = people.filter((p) => p.role === 'employee');
      content = `Lumicore Company Overview\n\n`;
      content += `Products: ${products.length}\n`;
      content += products.map((p: any) => `  - ${p.name} (${p.phase}, ${p.status})`).join('\n') || '  None yet';
      content += `\n\nTeam: ${people.length} total — ${founders.length} founder${founders.length !== 1 ? 's' : ''}, ${employees.length} employee${employees.length !== 1 ? 's' : ''}`;
      content += `\n\nFinancials: Monthly burn ${monthlyBurn > 0 ? '$' + monthlyBurn.toLocaleString() : 'not tracked'}, monthly income ${monthlyIncome > 0 ? '$' + monthlyIncome.toLocaleString() : 'not tracked'}`;
      if (latestBank > 0) content += `, bank balance $${latestBank.toLocaleString()}`;
      content += `\n\nEquity: ${holdings.length} holder${holdings.length !== 1 ? 's' : ''}, ${totalShares.toLocaleString()} total shares at $${sharePrice}/share (total value $${totalEquity.toLocaleString()})`;
      suggestions.push({ label: 'Financial summary', action: 'Give me a financial summary' });
      suggestions.push({ label: 'Equity breakdown', action: 'Show me the equity breakdown' });

    } else if (q.includes('team') || q.includes('people') || q.includes('member') || q.includes('staff') || q.includes('employee')) {
      const roles = ['founder', 'employee', 'investor', 'shareholder'] as const;
      content = `Team Summary\n\n`;
      for (const role of roles) {
        const members = people.filter((p) => p.role === role);
        if (members.length === 0) continue;
        content += `${role.charAt(0).toUpperCase() + role.slice(1)}s (${members.length}):\n`;
        content += members.map((m: any) => {
          const works = m.works_as && m.works_as.length > 0 ? ` [${m.works_as.join(', ')}]` : '';
          return `  - ${m.full_name}${m.title ? ' — ' + m.title : ''}${works}`;
        }).join('\n');
        content += '\n\n';
      }
      if (people.length === 0) content = 'No team members found.';
      suggestions.push({ label: 'Company overview', action: 'Give me a company overview' });

    } else if (q.includes('product') || q.includes('status')) {
      if (products.length === 0) {
        content = 'No products have been created yet.';
      } else {
        content = `Products (${products.length})\n\n`;
        content += products.map((p: any) => {
          return `${p.name}\n  Phase: ${p.phase}\n  Status: ${p.status}\n  ${p.description || 'No description'}`;
        }).join('\n\n');
      }
      suggestions.push({ label: 'Company overview', action: 'Give me a company overview' });

    } else if (q.includes('finance') || q.includes('burn') || q.includes('expense') || q.includes('income') || q.includes('revenue') || q.includes('bank') || q.includes('money')) {
      content = `Financial Summary\n\n`;
      content += `Monthly Burn: ${monthlyBurn > 0 ? '$' + monthlyBurn.toLocaleString() : 'Not tracked'}\n`;
      content += `Monthly Income: ${monthlyIncome > 0 ? '$' + monthlyIncome.toLocaleString() : 'Not tracked'}\n`;
      if (monthlyBurn > 0 && monthlyIncome > 0) {
        const net = monthlyIncome - monthlyBurn;
        content += `Net: ${net >= 0 ? '+' : ''}$${net.toLocaleString()}/month\n`;
      }
      content += `Bank Balance: ${latestBank > 0 ? '$' + latestBank.toLocaleString() : 'Not recorded'}\n`;
      if (monthlyBurn > 0 && latestBank > 0) {
        const runway = (latestBank / monthlyBurn).toFixed(1);
        content += `Runway: approx ${runway} months\n`;
      }
      content += `\nTotal Expenses: ${expenses.length}\n`;
      if (income.length > 0) {
        content += `\nIncome by product:\n`;
        const byProduct: Record<string, number> = {};
        for (const i of income) {
          const key = i.product_id || 'Company-wide';
          byProduct[key] = (byProduct[key] || 0) + Number(i.amount_usd);
        }
        for (const [pid, amt] of Object.entries(byProduct)) {
          const prod = products.find((p: any) => p.id === pid);
          content += `  - ${prod?.name || pid}: $${(amt as number).toLocaleString()}\n`;
        }
      }
      suggestions.push({ label: 'Equity overview', action: 'Show me the equity breakdown' });
      suggestions.push({ label: 'Company overview', action: 'Give me a company overview' });

    } else if (q.includes('equity') || q.includes('share') || q.includes('cap table') || q.includes('investor') || q.includes('ownership')) {
      content = `Equity Breakdown\n\n`;
      content += `Total shares: ${totalShares.toLocaleString()}\n`;
      content += `Share price: $${sharePrice}\n`;
      content += `Total equity value: $${totalEquity.toLocaleString()}\n\n`;
      if (holdings.length === 0) {
        content += 'No equity holdings recorded yet.';
      } else {
        content += `Holders (${holdings.length}):\n`;
        for (const h of holdings) {
          const pct = totalShares > 0 ? ((Number(h.shares) / totalShares) * 100).toFixed(1) : '0';
          content += `  - ${h.holder_name}: ${Number(h.shares).toLocaleString()} shares (${pct}%) — ${h.share_class}\n`;
        }
      }
      suggestions.push({ label: 'Financial summary', action: 'Give me a financial summary' });

    } else if (q.includes('help') || q.includes('what can') || q.includes('what do')) {
      content = `I'm the Lumicore AI assistant. I can help with:\n\n- Company overview and status\n- Team and people information\n- Product details and progress\n- Financial data: burn rate, income, bank balance, runway\n- Equity and cap table breakdown\n\nTry asking anything about your company data.`;
      suggestions.push(...QUICK_ACTIONS.map((a) => ({ label: a.label, action: a.query })));

    } else {
      // Attempt a best-effort response based on any matching data
      const matchedProduct = products.find((p: any) =>
        q.includes(p.name.toLowerCase()) || q.includes(p.slug.toLowerCase())
      );
      if (matchedProduct) {
        const p = matchedProduct as any;
        content = `${p.name}\n\nPhase: ${p.phase}\nStatus: ${p.status}\n${p.description ? '\n' + p.description : ''}\n${p.website ? '\nWebsite: ' + p.website : ''}`;
        const prodExpenses = expenses.filter((e: any) => e.product_id === p.id);
        if (prodExpenses.length > 0) content += `\n\nExpenses: ${prodExpenses.length} entries, $${recurringMonthly(prodExpenses).toLocaleString()}/mo`;
      } else {
        content = `I can answer questions about your company, team, products, finances, and equity. Try asking for a company overview, financial summary, or team summary.`;
        suggestions.push(...QUICK_ACTIONS.slice(0, 3).map((a) => ({ label: a.label, action: a.query })));
      }
    }

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: stripMarkdown(content),
      suggestions,
      created_at: new Date().toISOString(),
    };
  };

  const send = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text.trim(), created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    if (profile) {
      await supabase.from('ai_conversations').insert({ user_id: profile.id, role: 'user', content: text.trim() });
    }
    await new Promise((r) => setTimeout(r, 350));
    const response = generateResponse(text);
    setMessages((prev) => [...prev, response]);
    setLoading(false);
    if (profile) {
      await supabase.from('ai_conversations').insert({ user_id: profile.id, role: 'assistant', content: response.content });
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full accent-bg text-white shadow-soft-lg flex items-center justify-center hover:scale-105 transition-transform"
        title="AI Assistant"
      >
        <Sparkles className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[390px] max-w-[calc(100vw-2.5rem)] h-[540px] max-h-[calc(100vh-3rem)] rounded-2xl surface shadow-soft-lg flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-app flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">AI Assistant</div>
            <div className="text-[10px] text-muted">Lumicore OS — company-aware</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-xl accent-tint-bg flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 accent" />
            </div>
            <p className="text-sm font-medium text-[var(--text)]">How can I help?</p>
            <p className="text-xs text-muted mt-1 mb-4">Ask about your company, finances, equity, or team.</p>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => send(a.query)}
                  className="w-full flex items-center gap-2.5 rounded-lg surface-2 px-3 py-2.5 text-sm text-[var(--text)] hover:opacity-80 transition-opacity text-left"
                >
                  <a.icon className="w-4 h-4 accent shrink-0" /> {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className={cn('max-w-[82%]', m.role === 'user' && 'text-right')}>
              <div className={cn(
                'inline-block rounded-xl px-3 py-2 text-sm whitespace-pre-wrap text-left leading-relaxed',
                m.role === 'user' ? 'accent-bg text-white' : 'surface-2 text-[var(--text)]'
              )}>
                {m.content}
              </div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.suggestions.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => send(s.action)}
                      className="text-xs rounded-md surface-2 px-2.5 py-1 text-muted hover:opacity-80 transition-opacity"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="surface-2 rounded-xl px-3 py-2 text-sm text-muted animate-pulse">Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="p-3 border-t border-app flex items-center gap-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))}
          placeholder="Ask anything…"
          className="flex-1 rounded-lg surface-2 px-3 py-2 text-sm text-[var(--text)] placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          className="p-2 rounded-lg accent-bg text-white disabled:opacity-50 disabled:pointer-events-none hover:opacity-90 transition-opacity"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
