import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  FileText,
  MessageSquare,
  ArrowRight,
  Pencil,
  Quote,
} from 'lucide-react';
import { supabase, type Task, type Doc, type ChatMessage, type Profile, type ProductQuote, canManageProducts, productQuotes } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/context/ProductsContext';
import { PageContainer } from '@/components/AppLayout';
import { Card, Avatar, Badge, EmptyState, Button, Input, Textarea, Modal } from '@/components/ui';
import { formatDate, formatRelative, isPastDueDate } from '@/lib/utils';
import { ProductEditor } from '@/components/ProductEditor';

export default function ProductDashboard() {
  const navigate = useNavigate();
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const { upsertProduct } = useProducts();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editingQuotes, setEditingQuotes] = useState(false);

  useEffect(() => {
    if (!product) return;
    (async () => {
      const [t, d, m] = await Promise.all([
        supabase.from('tasks').select('*').eq('product_id', product.id).order('updated_at', { ascending: false }),
        supabase.from('docs').select('*').eq('product_id', product.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('product_members').select('user_id').eq('product_id', product.id),
      ]);
      setTasks(t.data || []);
      setDocs(d.data || []);

      // load member profiles
      const memberIds = (m.data || []).map((pm) => pm.user_id);
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', memberIds);
        setMembers(profiles as Profile[]);
      }

      // recent chat messages - get the product channel
      const { data: channel } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('product_id', product.id)
        .eq('type', 'channel')
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (channel) {
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .limit(5);
        setMessages(msgs || []);
      }
    })();
  }, [product]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" description="You don't have access to this product." /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const overdue = tasks.filter(
    (t) => t.status !== 'done' && isPastDueDate(t.due_date)
  );
  const myTasks = tasks.filter((t) => t.assignee_id === profile?.id && t.status !== 'done');

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const statusColors: Record<string, string> = {
    backlog: '#9CA3AF',
    todo: '#3B82F6',
    in_progress: '#F59E0B',
    review: '#8B5CF6',
    done: '#10B981',
  };

  const canEdit = canManageProducts(profile?.role);
  const quoteSet = productQuotes(product);

  return (
    <PageContainer title={`${product.name} Dashboard`} actions={
      <div className="flex items-center gap-2">
        <Badge color={product.color}>{product.slug}</Badge>
        {product.status !== 'active' && (
          <Badge color={product.status === 'archived' ? '#9CA3AF' : '#F59E0B'}>
            {product.status === 'archived' ? 'Archived' : 'Paused'}
          </Badge>
        )}
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setEditingProduct(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit product
          </Button>
        )}
      </div>
    }>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">Quotes</span>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setEditingQuotes(true)}>
              <Pencil className="w-3.5 h-3.5" /> Edit quotes
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {quoteSet.map((q, i) => (
            <Card key={i} className="p-4 relative overflow-hidden">
              <Quote className="w-5 h-5 accent opacity-40 mb-2" />
              {q.text ? (
                <>
                  <p className="text-sm text-[var(--text)] leading-relaxed">“{q.text}”</p>
                  {q.author && <p className="text-[11px] text-muted mt-2">— {q.author}</p>}
                </>
              ) : (
                <p className="text-sm text-muted">No quote yet</p>
              )}
            </Card>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">Task Progress</span>
            <TrendingUp className="w-4 h-4 accent" />
          </div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{pct}%</div>
          <div className="h-2 rounded-full surface-2 overflow-hidden mt-3">
            <div className="h-full accent-bg transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-muted mt-2">{done} of {total} tasks done</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">In Progress</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{inProgress}</div>
          <div className="text-xs text-muted mt-3">{total - done} tasks still open</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted">Overdue</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-display font-bold text-[var(--text)]">{overdue.length}</div>
          <div className="text-xs text-muted mt-3">tasks past due date</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* My tasks / overdue */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text)]">My Open Tasks</h3>
            <Link to={`/product/${product.slug}/tasks`} className="text-xs accent hover:underline flex items-center gap-1">
              View board <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="text-sm text-muted py-4">No tasks assigned to you. Nice!</p>
          ) : (
            <div className="space-y-2">
              {myTasks.slice(0, 6).map((t) => {
                const isOverdue = isPastDueDate(t.due_date);
                return (
                  <Link
                    key={t.id}
                    to={`/product/${product.slug}/tasks`}
                    className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2.5 hover:opacity-80 transition-opacity"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColors[t.status] }} />
                    <span className="text-sm text-[var(--text)] flex-1 truncate">{t.title}</span>
                    {t.due_date && (
                      <span className={`text-xs ${isOverdue ? 'text-rose-500' : 'text-muted'}`}>
                        {formatDate(t.due_date)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* Overdue */}
        <Card className="p-5">
          <h3 className="font-semibold text-[var(--text)] mb-4">Overdue Items</h3>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted py-4">Nothing overdue. You're on track.</p>
          ) : (
            <div className="space-y-2">
              {overdue.slice(0, 6).map((t) => (
                <Link
                  key={t.id}
                  to={`/product/${product.slug}/tasks`}
                  className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2.5 hover:opacity-80 transition-opacity"
                >
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="text-sm text-[var(--text)] flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-rose-500">{formatDate(t.due_date)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent docs */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text)]">Recent Doc Edits</h3>
            <Link to={`/product/${product.slug}/docs`} className="text-xs accent hover:underline flex items-center gap-1">
              All docs <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {docs.length === 0 ? (
            <p className="text-sm text-muted py-4">No docs yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <Link
                  key={d.id}
                  to={`/product/${product.slug}/docs`}
                  className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2.5 hover:opacity-80 transition-opacity"
                >
                  <FileText className="w-4 h-4 text-muted shrink-0" />
                  <span className="text-sm text-[var(--text)] flex-1 truncate">{d.title}</span>
                  <span className="text-xs text-muted">{formatRelative(d.updated_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent chat */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text)]">Recent Chat</h3>
            <Link to={`/product/${product.slug}/chat`} className="text-xs accent hover:underline flex items-center gap-1">
              Open chat <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {messages.length === 0 ? (
            <p className="text-sm text-muted py-4">No messages yet.</p>
          ) : (
            <div className="space-y-3">
              {messages.slice(0, 4).map((m) => {
                const author = members.find((p) => p.id === m.user_id);
                return (
                  <div key={m.id} className="flex gap-2.5">
                    <Avatar name={author?.full_name || '?'} src={author?.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-[var(--text)]">{author?.full_name || 'Unknown'}</span>
                        <span className="text-[10px] text-muted">{formatRelative(m.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted truncate">
                        {m.content || (m.attachments?.length ? 'Sent an attachment' : '')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Quick links */}
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-muted mb-3">Quick Links</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Task Board', to: 'tasks', icon: CheckCircle2 },
            { label: 'Sprints', to: 'sprints', icon: TrendingUp },
            { label: 'Docs', to: 'docs', icon: FileText },
            { label: 'Chat', to: 'chat', icon: MessageSquare },
          ].map((q) => (
            <Link
              key={q.to}
              to={`/product/${product.slug}/${q.to}`}
              className="flex items-center gap-3 rounded-xl surface p-4 hover:shadow-soft transition-shadow"
            >
              <q.icon className="w-5 h-5 accent" />
              <span className="text-sm font-medium text-[var(--text)]">{q.label}</span>
              <ArrowRight className="w-4 h-4 text-muted ml-auto" />
            </Link>
          ))}
        </div>
      </div>

      {editingQuotes && (
        <QuotesEditor
          quotes={quoteSet}
          onClose={() => setEditingQuotes(false)}
          onSave={async (quotes) => {
            const { data, error } = await supabase
              .from('products')
              .update({ quotes })
              .eq('id', product.id)
              .select('*')
              .single();
            if (error) throw error;
            upsertProduct(data as typeof product);
            setEditingQuotes(false);
          }}
        />
      )}
      {editingProduct && (
        <ProductEditor
          product={product}
          onClose={() => setEditingProduct(false)}
          onSaved={(saved) => {
            setEditingProduct(false);
            if (saved && saved.slug !== product.slug) {
              navigate(`/product/${saved.slug}/dashboard`, { replace: true });
            }
          }}
          onDeleted={() => {
            setEditingProduct(false);
            navigate('/overview', { replace: true });
          }}
        />
      )}
    </PageContainer>
  );
}

function QuotesEditor({
  quotes,
  onClose,
  onSave,
}: {
  quotes: ProductQuote[];
  onClose: () => void;
  onSave: (quotes: ProductQuote[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProductQuote[]>(quotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (index: number, field: keyof ProductQuote, value: string) => {
    setDraft((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(draft.map((q) => ({ text: q.text.trim(), author: q.author.trim() })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save quotes');
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title="Edit quotes" className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        {draft.map((q, i) => (
          <div key={i} className="space-y-2">
            <label className="block text-xs font-medium text-muted">Quote {i + 1}</label>
            <Textarea
              rows={3}
              value={q.text}
              onChange={(e) => update(i, 'text', e.target.value)}
              placeholder="The quote"
            />
            <Input
              value={q.author}
              onChange={(e) => update(i, 'author', e.target.value)}
              placeholder="Author"
            />
          </div>
        ))}
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save quotes'}
        </Button>
      </div>
    </Modal>
  );
}
