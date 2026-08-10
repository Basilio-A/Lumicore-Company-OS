import { useEffect, useState, useRef, useCallback } from 'react';
import { Sparkles, Send, X, Lightbulb, Compass, BookOpen } from 'lucide-react';
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
  { label: 'Team summary', query: 'Summarize the team', icon: BookOpen },
  { label: 'Product status', query: 'What is the status of all products?', icon: Lightbulb },
];

export function AIAssistant() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const loadContext = useCallback(async () => {
    const { data: p } = await supabase.from('products').select('*').order('name');
    setProducts(p || []);
    const { data: ppl } = await supabase.from('profiles').select('*').eq('status', 'active');
    setPeople(ppl || []);
  }, []);

  useEffect(() => { if (open && products.length === 0) loadContext(); }, [open, loadContext, products.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const generateResponse = (query: string): Msg => {
    const q = query.toLowerCase();
    let content = '';
    const suggestions: { label: string; action: string }[] = [];

    if (q.includes('overview') || q.includes('company') || (q.includes('summary') && !q.includes('team'))) {
      const founders = people.filter((p) => p.role === 'founder');
      const employees = people.filter((p) => p.role === 'employee');
      content = `**Lumicore Company Overview**\n\nLumicore has ${products.length} product${products.length !== 1 ? 's' : ''} and ${people.length} team member${people.length !== 1 ? 's' : ''}.\n\n`;
      content += `**Products:**\n${products.map((p) => `• ${p.name} — ${p.phase} phase, ${p.status}`).join('\n') || 'None yet'}\n\n`;
      content += `**Team:** ${founders.length} founder${founders.length !== 1 ? 's' : ''}, ${employees.length} employee${employees.length !== 1 ? 's' : ''}`;
      suggestions.push({ label: 'Show product details', action: 'What is the status of all products?' });
      suggestions.push({ label: 'List team members', action: 'Summarize the team' });
    } else if (q.includes('team') || q.includes('people') || q.includes('member')) {
      const roles = ['founder', 'employee', 'investor', 'shareholder'] as const;
      content = `**Team Summary**\n\n`;
      for (const role of roles) {
        const members = people.filter((p) => p.role === role);
        if (members.length > 0) {
          content += `**${role.charAt(0).toUpperCase() + role.slice(1)}s (${members.length}):**\n`;
          content += members.map((m) => `• ${m.full_name} — ${m.title || 'No title'}`).join('\n');
          content += '\n\n';
        }
      }
      if (people.length === 0) content = 'No team members found.';
    } else if (q.includes('product') || q.includes('status')) {
      content = products.length > 0
        ? `**Product Status**\n\n` + products.map((p) => `**${p.name}** (${p.slug})\n• Phase: ${p.phase}\n• Status: ${p.status}\n• ${p.description || 'No description'}`).join('\n\n')
        : 'No products have been created yet.';
    } else {
      content = `I'm the Lumicore AI assistant. I can answer questions about your company data, help you navigate modules, and summarize information.\n\nTry asking about:\n• Company overview\n• Team members\n• Product status\n\nOr use the quick actions below.`;
      suggestions.push(...QUICK_ACTIONS.map((a) => ({ label: a.label, action: a.query })));
    }
    return { id: crypto.randomUUID(), role: 'assistant', content, suggestions, created_at: new Date().toISOString() };
  };

  const send = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: 'user', content: text.trim(), created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    if (profile) await supabase.from('ai_conversations').insert({ user_id: profile.id, role: 'user', content: text.trim() });
    await new Promise((r) => setTimeout(r, 400));
    const response = generateResponse(text);
    setMessages((prev) => [...prev, response]);
    setLoading(false);
    if (profile) await supabase.from('ai_conversations').insert({ user_id: profile.id, role: 'assistant', content: response.content });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full accent-bg text-white shadow-soft-lg flex items-center justify-center hover:scale-105 transition-transform" title="AI Assistant">
        <Sparkles className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-3rem)] rounded-2xl surface shadow-soft-lg flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-app flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">AI Assistant</div>
            <div className="text-[10px] text-muted">Context-aware — Lumicore OS</div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-xl accent-tint-bg flex items-center justify-center mx-auto mb-3"><Sparkles className="w-6 h-6 accent" /></div>
            <p className="text-sm font-medium text-[var(--text)]">How can I help?</p>
            <p className="text-xs text-muted mt-1 mb-4">Ask about company data, navigate modules, or summarize docs.</p>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((a) => (
                <button key={a.label} onClick={() => send(a.query)} className="w-full flex items-center gap-2.5 rounded-lg surface-2 px-3 py-2.5 text-sm text-[var(--text)] hover:opacity-80 transition-opacity text-left">
                  <a.icon className="w-4 h-4 accent shrink-0" /> {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
            {m.role === 'assistant' && <div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center shrink-0"><Sparkles className="w-3.5 h-3.5 text-white" /></div>}
            <div className={cn('max-w-[80%]', m.role === 'user' && 'text-right')}>
              <div className={cn('inline-block rounded-xl px-3 py-2 text-sm whitespace-pre-wrap text-left', m.role === 'user' ? 'accent-bg text-white' : 'surface-2 text-[var(--text)]')}>{m.content}</div>
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.suggestions.map((s) => <button key={s.label} onClick={() => send(s.action)} className="text-xs rounded-md surface-2 px-2.5 py-1 text-muted hover:opacity-80 transition-opacity">{s.label}</button>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="flex gap-2.5"><div className="w-7 h-7 rounded-lg accent-bg flex items-center justify-center shrink-0"><Sparkles className="w-3.5 h-3.5 text-white" /></div><div className="surface-2 rounded-xl px-3 py-2 text-sm text-muted animate-pulse">Thinking…</div></div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 border-t border-app flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send(input))} placeholder="Ask anything…" className="flex-1 rounded-lg surface-2 px-3 py-2 text-sm text-[var(--text)] placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
        <button onClick={() => send(input)} disabled={!input.trim() || loading} className="p-2 rounded-lg accent-bg text-white disabled:opacity-50 disabled:pointer-events-none hover:opacity-90 transition-opacity"><Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
