import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Calendar,
  Flag,
  Trash2,
  X,
  GripVertical,
  KanbanSquare,
  CalendarDays,
  Filter,
  Users as UsersIcon,
} from 'lucide-react';
import {
  supabase,
  type Task,
  type Profile,
  type Sprint,
} from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { PageContainer } from '@/components/AppLayout';
import {
  Button,
  Input,
  Textarea,
  Select,
  Modal,
  Avatar,
  Badge,
  EmptyState,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatDate, cn } from '@/lib/utils';

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: '#9CA3AF' },
  { key: 'todo', label: 'To Do', color: '#3B82F6' },
  { key: 'in_progress', label: 'In Progress', color: '#F59E0B' },
  { key: 'review', label: 'Review', color: '#8B5CF6' },
  { key: 'done', label: 'Done', color: '#10B981' },
];

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
};
const PRIORITY_COLORS: Record<Task['priority'], string> = {
  low: '#9CA3AF', medium: '#3B82F6', high: '#F59E0B', urgent: '#EF4444',
};

const DEPARTMENTS = ['Engineering', 'Design', 'Product', 'QA', 'Data', 'ML', 'DevOps', 'Marketing', 'Sales', 'Operations'];

type ViewMode = 'board' | 'calendar';

export default function TaskBoard() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [assignees, setAssignees] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!product) return;
    const [t, m, s, a] = await Promise.all([
      supabase.from('tasks').select('*').eq('product_id', product.id).order('position'),
      supabase.from('product_members').select('user_id').eq('product_id', product.id),
      supabase.from('sprints').select('*').eq('product_id', product.id).order('start_date', { ascending: false }),
      supabase.from('task_assignees').select('task_id, user_id'),
    ]);
    setTasks(t.data || []);
    const memberIds = (m.data || []).map((pm) => pm.user_id);
    if (memberIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', memberIds);
      setMembers(profiles as Profile[]);
    }
    setSprints(s.data || []);
    const aMap: Record<string, string[]> = {};
    for (const ta of a.data || []) {
      (aMap[ta.task_id] ||= []).push(ta.user_id);
    }
    setAssignees(aMap);
  }, [product]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const payload: Record<string, unknown> = { ...updates };
    if (updates.status === 'done' && !tasks.find((t) => t.id === id)?.completed_at) {
      payload.completed_at = new Date().toISOString();
    }
    if (updates.status && updates.status !== 'done') {
      payload.completed_at = null;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } as Task : t)));
    await supabase.from('tasks').update(payload).eq('id', id);
  };

  const moveTask = async (id: string, status: Task['status']) => {
    await updateTask(id, { status });
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
    setEditing(null);
  };

  const memberById = (id: string) => members.find((m) => m.id === id);

  const filteredTasks = useMemo(() => {
    if (deptFilter === 'all') return tasks;
    return tasks.filter((t) => t.department === deptFilter);
  }, [tasks, deptFilter]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" description="You don't have access to this product." /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  return (
    <PageContainer
      title="Task Board"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-auto text-xs py-1.5">
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <div className="flex gap-0.5 p-0.5 rounded-lg surface-2">
            <button
              onClick={() => setViewMode('board')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'board' ? 'accent-bg text-white' : 'text-muted hover:text-[var(--text)]')}
              title="Board view"
            >
              <KanbanSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'calendar' ? 'accent-bg text-white' : 'text-muted hover:text-[var(--text)]')}
              title="Calendar view"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Task</Button>
        </div>
      }
    >
      {viewMode === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
          {COLUMNS.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className="w-72 shrink-0"
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverCol(null);
                  if (draggingId) moveTask(draggingId, col.key);
                  setDraggingId(null);
                }}
              >
                <div className={cn('rounded-xl surface p-3 h-full transition-colors', dragOverCol === col.key && 'ring-2 ring-[var(--accent)]')}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                      <span className="text-sm font-semibold text-[var(--text)]">{col.label}</span>
                    </div>
                    <span className="text-xs text-muted">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colTasks.map((task) => {
                      const taskAssignees = assignees[task.id] || [];
                      const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => setDraggingId(task.id)}
                          onDragEnd={() => setDraggingId(null)}
                          onClick={() => setEditing(task)}
                          className="rounded-lg surface-2 p-3 cursor-pointer hover:shadow-soft transition-shadow group"
                        >
                          <div className="flex items-start gap-1.5">
                            <GripVertical className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 mt-0.5 shrink-0" />
                            <span className="text-sm text-[var(--text)] flex-1">{task.title}</span>
                          </div>
                          {task.department && (
                            <Badge className="ml-5 mt-1.5 surface text-muted">{task.department}</Badge>
                          )}
                          {task.due_date && (
                            <div className={cn('flex items-center gap-1 text-xs mt-2 ml-5', isOverdue ? 'text-rose-500' : 'text-muted')}>
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.due_date)}
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2.5 ml-5">
                            <div className="flex items-center gap-1.5">
                              <Badge color={PRIORITY_COLORS[task.priority]}>
                                <Flag className="w-2.5 h-2.5" /> {PRIORITY_LABELS[task.priority]}
                              </Badge>
                              {task.sprint_id && sprints.find((s) => s.id === task.sprint_id) && (
                                <Badge className="surface text-muted">
                                  {sprints.find((s) => s.id === task.sprint_id)?.name}
                                </Badge>
                              )}
                            </div>
                            <div className="flex -space-x-1.5">
                              {taskAssignees.slice(0, 3).map((uid) => {
                                const m = memberById(uid);
                                return m ? <Avatar key={uid} name={m.full_name} size="xs" className="ring-2 ring-[var(--surface)]" /> : null;
                              })}
                              {taskAssignees.length > 3 && (
                                <div className="w-5 h-5 rounded-full surface-2 flex items-center justify-center text-[9px] text-muted ring-2 ring-[var(--surface)]">
                                  +{taskAssignees.length - 3}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {colTasks.length === 0 && (
                      <div className="text-xs text-muted text-center py-4">Drop tasks here</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarView tasks={filteredTasks} assignees={assignees} members={members} sprints={sprints} onTaskClick={(t) => setEditing(t)} />
      )}

      {(creating || editing) && (
        <TaskEditor
          task={editing}
          product={product}
          members={members}
          sprints={sprints}
          currentAssignees={editing ? assignees[editing.id] || [] : []}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { loadData(); setCreating(false); setEditing(null); }}
          onDelete={editing ? () => deleteTask(editing.id) : undefined}
        />
      )}
    </PageContainer>
  );
}

function CalendarView({
  tasks,
  assignees,
  members,
  sprints,
  onTaskClick,
}: {
  tasks: Task[];
  assignees: Record<string, string[]>;
  members: Profile[];
  sprints: Sprint[];
  onTaskClick: (t: Task) => void;
}) {
  const [month, setMonth] = useState(new Date());
  const memberById = (id: string) => members.find((m) => m.id === id);

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, m, d));

  const tasksOnDay = (date: Date) => {
    return tasks.filter((t) => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      return due.getFullYear() === date.getFullYear() && due.getMonth() === date.getMonth() && due.getDate() === date.getDate();
    });
  };

  const today = new Date();
  const isToday = (d: Date) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  const monthName = month.toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="surface rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-[var(--text)]">{monthName}</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(year, m - 1, 1))}>Prev</Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>Today</Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(year, m + 1, 1))}>Next</Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {weekdays.map((w) => (
          <div key={w} className="text-center text-[10px] font-semibold text-muted uppercase tracking-wider py-1.5">{w}</div>
        ))}
        {days.map((date, i) => {
          if (!date) return <div key={i} />;
          const dayTasks = tasksOnDay(date);
          return (
            <div
              key={i}
              className={cn(
                'min-h-[80px] sm:min-h-[100px] rounded-lg surface-2 p-1.5 overflow-y-auto',
                isToday(date) && 'ring-1 ring-[var(--accent)]'
              )}
            >
              <div className={cn('text-xs mb-1', isToday(date) ? 'accent font-bold' : 'text-muted')}>{date.getDate()}</div>
              <div className="space-y-1">
                {dayTasks.map((t) => {
                  const ta = assignees[t.id] || [];
                  return (
                    <button
                      key={t.id}
                      onClick={() => onTaskClick(t)}
                      className="w-full text-left rounded-md surface px-1.5 py-1 text-[11px] hover:shadow-soft transition-shadow"
                    >
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[t.priority] }} />
                        <span className="text-[var(--text)] truncate">{t.title}</span>
                      </div>
                      {ta.length > 0 && (
                        <div className="flex -space-x-1 mt-0.5">
                          {ta.slice(0, 2).map((uid) => {
                            const mem = memberById(uid);
                            return mem ? <Avatar key={uid} name={mem.full_name} size="xs" className="ring-1 ring-[var(--surface)]" /> : null;
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskEditor({
  task,
  product,
  members,
  sprints,
  currentAssignees,
  onClose,
  onSaved,
  onDelete,
}: {
  task: Task | null;
  product: { id: string };
  members: Profile[];
  sprints: Sprint[];
  currentAssignees: string[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<Task['status']>(task?.status || 'backlog');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || '');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [sprintId, setSprintId] = useState(task?.sprint_id || '');
  const [department, setDepartment] = useState(task?.department || '');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(currentAssignees);
  const [saving, setSaving] = useState(false);

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      product_id: product.id,
      title: title.trim(),
      description,
      status,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      sprint_id: sprintId || null,
      department: department || null,
    };
    let taskId = task?.id;
    if (task) {
      await supabase.from('tasks').update(payload).eq('id', task.id);
    } else {
      const { data } = await supabase.from('tasks').insert(payload).select('id').single();
      if (data) taskId = (data as { id: string }).id;
    }

    if (taskId) {
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      if (selectedAssignees.length > 0) {
        const rows = selectedAssignees.map((uid) => ({ task_id: taskId, user_id: uid }));
        await supabase.from('task_assignees').insert(rows);
      }
    }

    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={task ? 'Edit Task' : 'New Task'} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Description</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Task['status'])}>
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Priority</label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
              {(Object.keys(PRIORITY_LABELS) as Task['priority'][]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Primary assignee</label>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5">Department</label>
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">No department</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5">Sprint</label>
            <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">No sprint</option>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-2">Assignees (multiple)</label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAssignee(m.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border',
                  selectedAssignees.includes(m.id)
                    ? 'accent-tint-bg accent border-transparent'
                    : 'surface text-muted border-app hover:text-[var(--text)] hover:surface-2'
                )}
              >
                <Avatar name={m.full_name} size="xs" />
                {m.full_name}
              </button>
            ))}
            {members.length === 0 && <span className="text-xs text-muted">No team members yet</span>}
          </div>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        <div>
          {onDelete && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-rose-500 hover:text-rose-600">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
