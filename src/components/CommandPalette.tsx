import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  KanbanSquare,
  GitBranch,
  FileText,
  BookOpen,
  MessageSquare,
  Users,
  Building2,
  TrendingUp,
  PieChart,
  Layers,
  Award,
  ArrowLeft,
  Hash,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/context/ProductsContext';

interface CommandItem {
  label: string;
  hint?: string;
  icon: LucideIcon;
  action: () => void;
  group: string;
}

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  href: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { products } = useProducts();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';

  const baseCommands: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      { label: 'Company Overview', icon: ArrowLeft, group: 'Navigate', action: () => navigate('/overview') },
    ];

    for (const p of products.filter((item) => item.status !== 'archived')) {
      const base = `/product/${p.slug}`;
      items.push(
        { label: `${p.name} Dashboard`, hint: p.slug, icon: LayoutDashboard, group: p.name, action: () => navigate(`${base}/dashboard`) },
        { label: `${p.name} Task Board`, icon: KanbanSquare, group: p.name, action: () => navigate(`${base}/tasks`) },
        { label: `${p.name} Sprints`, icon: GitBranch, group: p.name, action: () => navigate(`${base}/sprints`) },
        { label: `${p.name} Docs`, icon: FileText, group: p.name, action: () => navigate(`${base}/docs`) },
        { label: `${p.name} Knowledge Base`, icon: BookOpen, group: p.name, action: () => navigate(`${base}/knowledge-base`) },
        { label: `${p.name} Chat`, icon: MessageSquare, group: p.name, action: () => navigate(`${base}/chat`) },
        { label: `${p.name} Team`, icon: Users, group: p.name, action: () => navigate(`${base}/team`) },
      );
    }

    items.push(
      { label: 'Team Hub', icon: Building2, group: 'Company', action: () => navigate('/company/team-hub') },
      { label: 'Employee of the Month', icon: Award, group: 'Company', action: () => navigate('/company/employee-of-the-month') },
    );

    if (isFounder || isInvestor) {
      items.push({ label: 'Investor Portal', icon: TrendingUp, group: 'Company', action: () => navigate('/company/investors') });
    }
    if (isFounder) {
      items.push(
        { label: 'Equity Management', icon: PieChart, group: 'Company', action: () => navigate('/company/equity') },
        { label: 'Tech Stack', icon: Layers, group: 'Company', action: () => navigate('/company/tech-stack') },
      );
    }

    return items;
  }, [products, navigate, isFounder, isInvestor]);

  useEffect(() => {
    if (!query.trim() || !profile) {
      setResults([]);
      return;
    }
    const q = query.trim();
    let cancelled = false;
    (async () => {
      const out: SearchResult[] = [];
      const productMap = new Map(products.map((p) => [p.id, p.slug]));

      // tasks
      const { data: tasks } = await supabase
        .from('tasks').select('id, title, product_id, status').ilike('title', `%${q}%`).limit(5);
      for (const t of tasks || []) {
        const slug = productMap.get(t.product_id);
        if (slug) out.push({ type: 'Task', label: t.title, sub: t.status, href: `/product/${slug}/tasks` });
      }

      // docs
      const { data: docs } = await supabase
        .from('docs').select('id, title, product_id').ilike('title', `%${q}%`).limit(5);
      for (const d of docs || []) {
        const slug = productMap.get(d.product_id);
        if (slug) out.push({ type: 'Doc', label: d.title, sub: '', href: `/product/${slug}/docs` });
      }

      // knowledge base
      const { data: kb } = await supabase
        .from('knowledge_base').select('id, title, category, product_id').ilike('title', `%${q}%`).limit(5);
      for (const k of kb || []) {
        const slug = k.product_id ? productMap.get(k.product_id) : null;
        out.push({ type: 'Note', label: k.title, sub: k.category, href: slug ? `/product/${slug}/knowledge-base` : '/overview' });
      }

      // chat channels
      const { data: chans } = await supabase
        .from('chat_channels').select('id, name, product_id, type').ilike('name', `%${q}%`).limit(5);
      for (const c of chans || []) {
        const slug = c.product_id ? productMap.get(c.product_id) : null;
        if (slug) out.push({ type: 'Channel', label: `#${c.name}`, sub: '', href: `/product/${slug}/chat` });
      }

      // chat messages
      const { data: msgs } = await supabase
        .from('chat_messages').select('id, content, channel_id').ilike('content', `%${q}%`).limit(5);
      if (msgs && msgs.length > 0) {
        const chanIds = [...new Set(msgs.map((m) => m.channel_id))];
        const { data: chanData } = await supabase
          .from('chat_channels').select('id, name, product_id').in('id', chanIds);
        const chanMap = new Map((chanData || []).map((c) => [c.id, c]));
        for (const m of msgs) {
          const chan = chanMap.get(m.channel_id);
          if (chan) {
            const slug = chan.product_id ? productMap.get(chan.product_id) : null;
            if (slug) out.push({ type: 'Message', label: m.content.slice(0, 60), sub: `#${chan.name}`, href: `/product/${slug}/chat` });
          }
        }
      }

      // people
      const { data: people } = await supabase
        .from('profiles').select('id, full_name, title, role').or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5);
      for (const p of people || []) {
        out.push({ type: 'Person', label: p.full_name || 'Unknown', sub: p.title || p.role, href: '/company/team-hub' });
      }

      if (!cancelled) setResults(out);
    })();
    return () => { cancelled = true; };
  }, [query, profile, products]);

  const filtered = useMemo(() => {
    if (!query.trim()) return baseCommands;
    const q = query.toLowerCase();
    return baseCommands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [query, baseCommands]);

  const allItems: (CommandItem | SearchResult)[] = query.trim() && results.length > 0 ? results : filtered;
  const flat = allItems as (CommandItem | SearchResult)[];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, flat.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const item = flat[activeIndex];
        if (item) {
          if ('action' in item) (item as CommandItem).action();
          else navigate((item as SearchResult).href);
          onClose();
        }
      } else if (e.key === 'Escape') { onClose(); }
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, activeIndex, onClose, navigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl surface shadow-soft-lg animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-app">
          <Search className="w-4 h-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search tasks, docs, notes, chats, people, or jump to a page…"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-muted focus:outline-none"
          />
          <kbd className="text-[10px] text-muted surface-2 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {flat.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted">No results found</div>
          )}
          {flat.map((item, idx) => {
            const isCmd = 'action' in item;
            const Icon = isCmd ? (item as CommandItem).icon : item.type === 'Channel' || item.type === 'Message' ? Hash : Search;
            return (
              <button
                key={idx}
                onClick={() => {
                  if (isCmd) (item as CommandItem).action();
                  else navigate((item as SearchResult).href);
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${idx === activeIndex ? 'surface-2' : ''}`}
              >
                <Icon className="w-4 h-4 text-muted shrink-0" />
                <span className="text-[var(--text)] flex-1 truncate">{item.label}</span>
                <span className="text-xs text-muted">{isCmd ? (item as CommandItem).group : (item as SearchResult).type}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
