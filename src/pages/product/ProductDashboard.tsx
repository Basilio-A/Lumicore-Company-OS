import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  FileText,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { supabase, type Task, type Doc, type ChatMessage, type Profile } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Card, Avatar, Badge, EmptyState, Button } from '@/components/ui';
import { formatDate, formatRelative } from '@/lib/utils';

export default function ProductDashboard() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);

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
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done'
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

  return (
    <PageContainer title={`${product.name} Dashboard`} actions={
      <div className="flex items-center gap-2">
        <Badge color={product.color}>{product.slug}</Badge>
      </div>
    }>
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
                const isOverdue = t.due_date && new Date(t.due_date) < new Date();
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
                      <p className="text-sm text-muted truncate">{m.content}</p>
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
    </PageContainer>
  );
}
