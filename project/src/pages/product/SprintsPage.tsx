import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, GitBranch, Calendar, ChevronDown, ChevronRight, Check, GripVertical } from 'lucide-react';
import { supabase, type Sprint, type Task, type Profile } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { PageContainer } from '@/components/AppLayout';
import { Button, Input, Textarea, Select, Modal, Card, Badge, EmptyState, Avatar } from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';

const STATUS_COLORS: Record<Task['status'], string> = {
  backlog: '#9CA3AF', todo: '#3B82F6', in_progress: '#F59E0B', review: '#8B5CF6', done: '#10B981',
};
const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: '#9CA3AF', medium: '#3B82F6', high: '#F59E0B', urgent: '#EF4444',
};

export default function SprintsPage() {
  const { product, loading, accessDenied } = useProduct();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasksBySprint, setTasksBySprint] = useState<Record<string, Task[]>>({});
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [members, setMembers] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

    const { data: pms } = await supabase.from('product_members').select('user_id').eq('product_id', product.id);
    if (pms && pms.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', pms.map((p) => p.user_id));
      setMembers(profiles || []);
    }
  }, [product]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  const statusColors: Record<Sprint['status'], string> = {
    planned: '#9CA3AF', active: '#10B981', completed: '#6C63FF',
  };

  const toggleTaskStatus = async (taskId: string, currentStatus: Task['status']) => {
    const next: Task['status'] = currentStatus === 'done' ? 'todo' : 'done';
    const payload: Partial<Task> = { status: next };
    if (next === 'done') payload.completed_at = new Date().toISOString();
    else payload.completed_at = null;
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

  return (
    <PageContainer title="Sprints" actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Sprint</Button>}>
      {sprints.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<GitBranch className="w-8 h-8" />} title="No sprints yet" description="Create a sprint to group tasks into cycles." action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Sprint</Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          {sprints.map((s) => {
            const tasks = tasksBySprint[s.id] || [];
            const done = tasks.filter((t) => t.status === 'done').length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            const isOpen = expanded[s.id] !== false;
            return (
              <Card key={s.id} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <button
                          onClick={() => setExpanded((prev) => ({ ...prev, [s.id]: !isOpen }))}
                          className="p-0.5 rounded text-muted hover:text-[var(--text)] hover:surface-2"
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <h3 className="font-display font-semibold text-[var(--text)]">{s.name}</h3>
                        <Badge color={statusColors[s.status]}>{s.status}</Badge>
                      </div>
                      {s.goal && <p className="text-sm text-muted mb-3 ml-8">{s.goal}</p>}
                      <div className="flex items-center gap-4 text-xs text-muted ml-8">
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {formatDate(s.start_date)} → {formatDate(s.end_date)}</span>
                        <span>{tasks.length} tasks</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-display font-bold text-[var(--text)]">{pct}%</div>
                      <div className="text-xs text-muted">{done}/{tasks.length} done</div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full surface-2 overflow-hidden mt-4 ml-8">
                    <div className="h-full accent-bg transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {isOpen && tasks.length > 0 && (
                  <div className="border-t border-app">
                    <div className="px-5 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider">Tasks in this sprint</div>
                    <div className="divide-y divide-app">
                      {tasks.map((t) => {
                        const ta = assignees[t.id] || [];
                        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                        return (
                          <div key={t.id} className="px-5 py-2.5 flex items-center gap-3 hover:surface-2 transition-colors">
                            <button
                              onClick={() => toggleTaskStatus(t.id, t.status)}
                              className={cn(
                                'w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors',
                                t.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-app hover:border-[var(--accent)]'
                              )}
                            >
                              {t.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
                            </button>
                            <span className={cn('text-sm flex-1 truncate', t.status === 'done' ? 'text-muted line-through' : 'text-[var(--text)]')}>{t.title}</span>
                            <Badge color={STATUS_COLORS[t.status]}>{t.status.replace('_', ' ')}</Badge>
                            <Badge color={PRIORITY_COLORS[t.priority]}>{t.priority}</Badge>
                            {t.due_date && (
                              <span className={cn('text-xs', isOverdue ? 'text-rose-500' : 'text-muted')}>{formatDate(t.due_date)}</span>
                            )}
                            <div className="flex -space-x-1.5">
                              {ta.slice(0, 3).map((uid) => {
                                const m = memberById(uid);
                                return m ? <Avatar key={uid} name={m.full_name} size="xs" className="ring-2 ring-[var(--surface)]" /> : null;
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isOpen && tasks.length === 0 && (
                  <div className="border-t border-app px-5 py-4 text-xs text-muted">No tasks assigned to this sprint yet. Add tasks from the Task Board and select this sprint.</div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {(creating || editing) && (
        <SprintEditor sprint={editing} product={product} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { load(); setCreating(false); setEditing(null); }} />
      )}
    </PageContainer>
  );
}

function SprintEditor({ sprint, product, onClose, onSaved }: { sprint: Sprint | null; product: { id: string }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(sprint?.name || '');
  const [goal, setGoal] = useState(sprint?.goal || '');
  const [startDate, setStartDate] = useState(sprint?.start_date || '');
  const [endDate, setEndDate] = useState(sprint?.end_date || '');
  const [status, setStatus] = useState<Sprint['status']>(sprint?.status || 'planned');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !startDate || !endDate) return;
    setSaving(true);
    const payload = { product_id: product.id, name: name.trim(), goal, start_date: startDate, end_date: endDate, status };
    if (sprint) await supabase.from('sprints').update(payload).eq('id', sprint.id);
    else await supabase.from('sprints').insert(payload);
    setSaving(false);
    onSaved();
  };

  const del = async () => {
    if (!sprint) return;
    await supabase.from('sprints').delete().eq('id', sprint.id);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={sprint ? 'Edit Sprint' : 'New Sprint'}>
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 1" autoFocus /></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Goal</label><Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What's the goal of this sprint?" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Start date</label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">End date</label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Status</label><Select value={status} onChange={(e) => setStatus(e.target.value as Sprint['status'])}><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></Select></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {sprint ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Delete</Button> : <div />}
        <div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} disabled={saving || !name.trim() || !startDate || !endDate}>{saving ? 'Saving…' : 'Save'}</Button></div>
      </div>
    </Modal>
  );
}
