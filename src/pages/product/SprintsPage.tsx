import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, GitBranch, Calendar, ChevronDown, ChevronRight, Check, Pencil } from 'lucide-react';
import { supabase, type Sprint, type Task, type Profile } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState, Avatar } from '@/components/ui';
import { formatDate, cn, isPastDueDate } from '@/lib/utils';

const STATUS_COLORS: Record<Task['status'], string> = {
  backlog: '#9CA3AF', todo: '#3B82F6', in_progress: '#F59E0B', review: '#8B5CF6', done: '#10B981',
};
const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: '#9CA3AF', medium: '#3B82F6', high: '#F59E0B', urgent: '#EF4444',
};
const SPRINT_STATUS_COLORS: Record<Sprint['status'], string> = {
  planned: '#9CA3AF', active: '#10B981', completed: '#6C63FF',
};

type StatusFilter = 'all' | Sprint['status'];

export default function SprintsPage() {
  const { product, loading, accessDenied } = useProduct();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasksBySprint, setTasksBySprint] = useState<Record<string, Task[]>>({});
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [creating, setCreating] = useState(false);
  // collapsed by default — only user-toggled sprints are stored
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    if (!product) return;
    const { data } = await supabase
      .from('sprints')
      .select('*')
      .eq('product_id', product.id)
      .order('start_date', { ascending: false });
    setSprints(data || []);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('product_id', product.id)
      .not('sprint_id', 'is', null)
      .order('position');
    const map: Record<string, Task[]> = {};
    for (const t of tasks || []) {
      if (t.sprint_id) (map[t.sprint_id] ||= []).push(t);
    }
    setTasksBySprint(map);

    const { data: ta } = await supabase.from('task_assignees').select('task_id, user_id');
    const aMap: Record<string, string[]> = {};
    for (const r of ta || []) (aMap[r.task_id] ||= []).push(r.user_id);
    setAssignees(aMap);

    const { data: staff } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .in('role', ['founder', 'employee']);
    setMembers(staff || []);
  }, [product]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  const toggleTaskStatus = async (taskId: string, currentStatus: Task['status']) => {
    const next: Task['status'] = currentStatus === 'done' ? 'todo' : 'done';
    const payload: Partial<Task> = { status: next, completed_at: next === 'done' ? new Date().toISOString() : null };
    setTasksBySprint((prev) => {
      const out = { ...prev };
      for (const sid of Object.keys(out)) {
        out[sid] = out[sid].map((t) => t.id === taskId ? { ...t, ...payload } as Task : t);
      }
      return out;
    });
    await supabase.from('tasks').update(payload).eq('id', taskId);
  };

  const memberById = (id: string) => members.find((m) => m.id === id);
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Sort: active first, planned second, completed last
  const sortedSprints = [...sprints].sort((a, b) => {
    const order: Record<Sprint['status'], number> = { active: 0, planned: 1, completed: 2 };
    return order[a.status] - order[b.status];
  });

  const filtered = statusFilter === 'all'
    ? sortedSprints
    : sortedSprints.filter((s) => s.status === statusFilter);

  const counts: Record<StatusFilter, number> = {
    all: sprints.length,
    planned: sprints.filter((s) => s.status === 'planned').length,
    active: sprints.filter((s) => s.status === 'active').length,
    completed: sprints.filter((s) => s.status === 'completed').length,
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'planned', label: 'Planned' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <PageContainer
      title="Sprints"
      actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Sprint</Button>}
    >
      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-app -mt-2 overflow-x-auto">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap',
              statusFilter === t.key ? 'accent' : 'text-muted hover:text-[var(--text)]'
            )}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                statusFilter === t.key ? 'accent-bg text-white' : 'surface-2 text-muted'
              )}>
                {counts[t.key]}
              </span>
            )}
            {statusFilter === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 accent-bg" />
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<GitBranch className="w-8 h-8" />}
            title={statusFilter === 'all' ? 'No sprints yet' : `No ${statusFilter} sprints`}
            description={statusFilter === 'all' ? 'Create a sprint to group tasks into cycles.' : 'Try switching the filter above.'}
            action={statusFilter === 'all' ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Sprint</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const tasks = tasksBySprint[s.id] || [];
            const done = tasks.filter((t) => t.status === 'done').length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            // Default collapsed — only open when user explicitly toggles
            const isOpen = expanded[s.id] === true;
            const isCompleted = s.status === 'completed';

            return (
              <Card
                key={s.id}
                className={cn('overflow-hidden transition-opacity', isCompleted && 'opacity-80')}
              >
                {/* Sprint header row */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:surface-2 transition-colors select-none"
                  onClick={() => toggle(s.id)}
                >
                  {/* Expand chevron */}
                  <div className="mt-0.5 text-muted shrink-0">
                    {isOpen
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('font-display font-semibold text-[var(--text)]', isCompleted && 'line-through decoration-muted')}>{s.name}</span>
                      <Badge color={SPRINT_STATUS_COLORS[s.status]}>{s.status}</Badge>
                    </div>
                    {s.goal && <p className="text-xs text-muted mb-1.5 line-clamp-1">{s.goal}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDate(s.start_date)} → {formatDate(s.end_date)}</span>
                      <span>{tasks.length} task{tasks.length !== 1 ? 's' : ''} · {done} done</span>
                    </div>
                  </div>

                  {/* Progress % + edit button */}
                  <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="text-right">
                      <div className={cn('text-2xl font-display font-bold tabular-nums', isCompleted ? 'text-muted' : 'text-[var(--text)]')}>{pct}%</div>
                      <div className="text-[10px] text-muted">{done}/{tasks.length}</div>
                    </div>
                    <button
                      onClick={() => setEditing(s)}
                      className="p-1.5 rounded-lg text-muted hover:text-[var(--text)] hover:surface-2 transition-colors"
                      title="Edit sprint"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 surface-2 mx-4 mb-0 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all', isCompleted ? 'bg-[#6C63FF]' : 'accent-bg')}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Task list — only visible when expanded */}
                {isOpen && (
                  <div className="border-t border-app mt-3">
                    {tasks.length === 0 ? (
                      <div className="px-5 py-4 text-xs text-muted">
                        No tasks assigned to this sprint yet. Add tasks from the Task Board and select this sprint.
                      </div>
                    ) : (
                      <>
                        <div className="px-5 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider">
                          Tasks ({tasks.length})
                        </div>
                        <div className="divide-y divide-app">
                          {tasks.map((t) => {
                            const ta = assignees[t.id] || [];
                            const isOverdue = t.status !== 'done' && isPastDueDate(t.due_date);
                            return (
                              <div key={t.id} className="px-5 py-2.5 flex items-center gap-3 hover:surface-2 transition-colors">
                                <button
                                  onClick={() => toggleTaskStatus(t.id, t.status)}
                                  className={cn(
                                    'w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors',
                                    t.status === 'done'
                                      ? 'bg-emerald-500 border-emerald-500'
                                      : 'border-app hover:border-[var(--accent)]'
                                  )}
                                >
                                  {t.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
                                </button>
                                <span className={cn('text-sm flex-1 truncate', t.status === 'done' ? 'text-muted line-through' : 'text-[var(--text)]')}>
                                  {t.title}
                                </span>
                                <Badge color={STATUS_COLORS[t.status]}>{t.status.replace('_', ' ')}</Badge>
                                <Badge color={PRIORITY_COLORS[t.priority]}>{t.priority}</Badge>
                                {t.due_date && (
                                  <span className={cn('text-xs hidden sm:inline', isOverdue ? 'text-rose-500' : 'text-muted')}>
                                    {formatDate(t.due_date)}
                                  </span>
                                )}
                                <div className="flex -space-x-1.5">
                                  {ta.slice(0, 3).map((uid) => {
                                    const m = memberById(uid);
                                    return m ? (
                                      <Avatar key={uid} name={m.full_name} src={m.avatar_url} size="xs" className="ring-2 ring-[var(--surface)]" />
                                    ) : null;
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <SprintEditor
          sprint={editing}
          product={product}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { load(); setCreating(false); setEditing(null); }}
        />
      )}
    </PageContainer>
  );
}

function SprintEditor({
  sprint,
  product,
  onClose,
  onSaved,
}: {
  sprint: Sprint | null;
  product: { id: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sprint?.name || '');
  const [goal, setGoal] = useState(sprint?.goal || '');
  const [startDate, setStartDate] = useState(sprint?.start_date || '');
  const [endDate, setEndDate] = useState(sprint?.end_date || '');
  const [status, setStatus] = useState<Sprint['status']>(sprint?.status || 'planned');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    setSaving(true);
    const payload = { product_id: product.id, name: name.trim(), goal: goal || null, start_date: startDate, end_date: endDate, status };
    if (sprint) await supabase.from('sprints').update(payload).eq('id', sprint.id);
    else await supabase.from('sprints').insert(payload);
    setSaving(false);
    onSaved();
  };

  const del = async () => {
    if (!sprint) return;
    // Unlink tasks first
    await supabase.from('tasks').update({ sprint_id: null }).eq('sprint_id', sprint.id);
    await supabase.from('sprints').delete().eq('id', sprint.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={sprint ? 'Edit Sprint' : 'New Sprint'}>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 1" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Goal</label>
          <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What's the goal of this sprint?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">End date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Status</label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as Sprint['status'])}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </Select>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        <div>
          {sprint && !confirmDelete && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-rose-500">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
          {sprint && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-500">This will unlink all tasks. Sure?</span>
              <Button variant="ghost" size="sm" onClick={del} className="text-rose-600 font-semibold">Yes, delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim() || !startDate || !endDate}>
            {saving ? 'Saving…' : sprint ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
