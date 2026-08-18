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
  Check,
} from 'lucide-react';
import {
  supabase,
  type Task,
  type Profile,
  type Sprint,
  type Subtask,
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
import { formatDate, cn, isPastDueDate } from '@/lib/utils';

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
  const [subtaskCounts, setSubtaskCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [canAssign, setCanAssign] = useState(false);

  const loadData = useCallback(async () => {
    if (!product) return;
    const [t, staff, s, a, sub, coordinators] = await Promise.all([
      supabase.from('tasks').select('*').eq('product_id', product.id).order('position'),
      supabase.from('profiles').select('*').eq('status', 'active').in('role', ['founder', 'employee']).order('full_name'),
      supabase.from('sprints').select('*').eq('product_id', product.id).order('start_date', { ascending: false }),
      supabase.from('task_assignees').select('task_id, user_id'),
      supabase.from('subtasks').select('task_id, completed'),
      supabase.from('product_members').select('user_id').eq('product_id', product.id).eq('product_role', 'task_coordinator'),
    ]);
    setTasks(t.data || []);
    setMembers((staff.data || []) as Profile[]);
    setCanAssign(
      profile?.role === 'founder' ||
      (profile?.id ? (coordinators.data || []).some((pm) => pm.user_id === profile.id) : false)
    );
    setSprints(s.data || []);
    const aMap: Record<string, string[]> = {};
    for (const ta of a.data || []) {
      (aMap[ta.task_id] ||= []).push(ta.user_id);
    }
    for (const task of t.data || []) {
      if (task.assignee_id) {
        const list = aMap[task.id] || [];
        if (!list.includes(task.assignee_id)) list.unshift(task.assignee_id);
        aMap[task.id] = list;
      }
    }
    setAssignees(aMap);
    // subtask counts
    const scMap: Record<string, { total: number; done: number }> = {};
    for (const st of sub.data || []) {
      if (!scMap[st.task_id]) scMap[st.task_id] = { total: 0, done: 0 };
      scMap[st.task_id].total++;
      if (st.completed) scMap[st.task_id].done++;
    }
    setSubtaskCounts(scMap);
  }, [product, profile?.id, profile?.role]);

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

  const assignedPeople = (task: Task) => {
    const ids = [...new Set([...(assignees[task.id] || []), ...(task.assignee_id ? [task.assignee_id] : [])])];
    return ids.map((id) => memberById(id)).filter((m): m is Profile => Boolean(m));
  };

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
                      const people = assignedPeople(task);
                      const isOverdue = task.status !== 'done' && isPastDueDate(task.due_date);
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
                          <div className="flex items-center gap-1.5 mt-2.5 ml-5 flex-wrap">
                            <Badge color={PRIORITY_COLORS[task.priority]}>
                              <Flag className="w-2.5 h-2.5" /> {PRIORITY_LABELS[task.priority]}
                            </Badge>
                            {task.sprint_id && sprints.find((s) => s.id === task.sprint_id) && (
                              <Badge className="surface text-muted">
                                {sprints.find((s) => s.id === task.sprint_id)?.name}
                              </Badge>
                            )}
                          </div>
                          <div className="ml-5 mt-2">
                            {people.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {people.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-center gap-1 rounded-full surface px-1.5 py-0.5 max-w-full"
                                    title={m.full_name}
                                  >
                                    <Avatar name={m.full_name} src={m.avatar_url} size="xs" />
                                    <span className="text-[11px] text-[var(--text)] truncate max-w-[7.5rem]">
                                      {m.full_name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted">Unassigned</span>
                            )}
                          </div>
                          {/* Subtask progress */}
                          {subtaskCounts[task.id] && subtaskCounts[task.id].total > 0 && (
                            <div className="ml-5 mt-2">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Check className="w-3 h-3 text-muted" />
                                <span className="text-[10px] text-muted tabular-nums">
                                  {subtaskCounts[task.id].done}/{subtaskCounts[task.id].total} subtasks
                                </span>
                              </div>
                              <div className="h-1 rounded-full surface overflow-hidden">
                                <div
                                  className="h-full accent-bg transition-all"
                                  style={{ width: `${(subtaskCounts[task.id].done / subtaskCounts[task.id].total) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
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
          canAssign={canAssign}
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
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const memberById = (id: string) => members.find((m) => m.id === id);

  const year = month.getFullYear();
  const mo = month.getMonth();
  const startWeekday = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();

  const days: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, mo, d));

  const tasksOnDay = (date: Date) => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return tasks.filter((t) => t.due_date?.slice(0, 10) === key);
  };

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const isPast = (d: Date) => d < today && !isToday(d);

  const STATUS_BG: Record<Task['status'], string> = {
    backlog: 'bg-[#9CA3AF]/15 border-[#9CA3AF]/30',
    todo: 'bg-blue-500/10 border-blue-400/30',
    in_progress: 'bg-amber-500/10 border-amber-400/30',
    review: 'bg-violet-500/10 border-violet-400/30',
    done: 'bg-emerald-500/10 border-emerald-400/30',
  };

  const monthName = month.toLocaleString('default', { month: 'long', year: 'numeric' });
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Summary counts for the legend
  const totalWithDue = tasks.filter((t) => t.due_date).length;
  const overdueCount = tasks.filter(
    (t) => t.status !== 'done' && isPastDueDate(t.due_date)
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-[var(--text)]">{monthName}</h2>
          <p className="text-xs text-muted mt-0.5">
            {totalWithDue} task{totalWithDue !== 1 ? 's' : ''} with due dates
            {overdueCount > 0 && <span className="text-rose-500 ml-2">· {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setMonth(new Date(year, mo - 1, 1))}>← Prev</Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => setMonth(new Date(year, mo + 1, 1))}>Next →</Button>
        </div>
      </div>

      {/* Priority legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(PRIORITY_COLORS) as [Task['priority'], string][]).map(([p, color]) => (
          <div key={p} className="flex items-center gap-1.5 text-xs text-muted">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {PRIORITY_LABELS[p]}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-rose-500 ml-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          Overdue
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-2xl surface overflow-hidden shadow-soft">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-app">
          {weekdays.map((w) => (
            <div key={w} className="py-3 text-center text-[11px] font-bold text-muted uppercase tracking-widest">
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-app">
          {days.map((date, i) => {
            if (!date) {
              return <div key={`empty-${i}`} className="min-h-[120px] surface-2 opacity-40" />;
            }
            const dayTasks = tasksOnDay(date);
            const todayCell = isToday(date);
            const pastCell = isPast(date);
            const hasOverdue = pastCell && dayTasks.some((t) => t.status !== 'done');

            return (
              <div
                key={date.toISOString()}
                className={cn(
                  'min-h-[120px] p-2 flex flex-col gap-1 relative transition-colors',
                  todayCell && 'bg-[var(--accent)]/5',
                  pastCell && !todayCell && 'opacity-80',
                  hasOverdue && !todayCell && 'bg-rose-500/5',
                )}
              >
                {/* Date number */}
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={cn(
                      'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      todayCell
                        ? 'accent-bg text-white'
                        : pastCell
                          ? 'text-muted'
                          : 'text-[var(--text)]'
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[10px] text-muted font-medium">{dayTasks.length}</span>
                  )}
                </div>

                {/* Task chips */}
                {dayTasks.slice(0, 3).map((t) => {
                  const isOverdue = t.status !== 'done' && isPastDueDate(t.due_date);
                  const ta = assignees[t.id] || [];
                  const isHovered = hoveredTask === t.id;
                  return (
                    <div key={t.id} className="relative">
                      <button
                        onClick={() => onTaskClick(t)}
                        onMouseEnter={() => setHoveredTask(t.id)}
                        onMouseLeave={() => setHoveredTask(null)}
                        className={cn(
                          'w-full text-left rounded-lg px-2 py-1.5 text-[11px] font-medium border transition-all',
                          'hover:shadow-soft hover:-translate-y-px',
                          isOverdue
                            ? 'bg-rose-500/15 border-rose-400/40 text-rose-700 dark:text-rose-400'
                            : t.status === 'done'
                              ? 'opacity-60 ' + STATUS_BG[t.status]
                              : STATUS_BG[t.status],
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isOverdue ? '#EF4444' : PRIORITY_COLORS[t.priority] }}
                          />
                          <span className={cn('truncate flex-1', t.status === 'done' && 'line-through')}>
                            {t.title}
                          </span>
                        </div>
                        {ta.length > 0 && (
                          <div className="flex -space-x-1 mt-1">
                            {ta.slice(0, 2).map((uid) => {
                              const mem = memberById(uid);
                              return mem ? (
                                <Avatar key={uid} name={mem.full_name} src={mem.avatar_url} size="xs"
                                  className="ring-1 ring-[var(--surface)]" />
                              ) : null;
                            })}
                            {ta.length > 2 && (
                              <div className="w-4 h-4 rounded-full surface flex items-center justify-center text-[8px] text-muted ring-1 ring-[var(--surface)]">
                                +{ta.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </button>

                      {/* Hover tooltip */}
                      {isHovered && (
                        <div className="absolute z-20 left-0 bottom-full mb-1.5 w-52 rounded-xl surface shadow-soft-lg p-3 pointer-events-none">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: PRIORITY_COLORS[t.priority] }} />
                            <span className="text-xs font-semibold text-[var(--text)] leading-tight">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded surface-2 text-muted capitalize">
                              {t.status.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded surface-2 text-muted capitalize">
                              {t.priority}
                            </span>
                            {isOverdue && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-500">
                                Overdue
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-[10px] text-muted mt-1.5 line-clamp-2">{t.description}</p>
                          )}
                          {ta.length > 0 && (
                            <p className="text-[10px] text-muted mt-1.5 truncate">
                              {ta.map((uid) => memberById(uid)?.full_name).filter(Boolean).join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* "+N more" overflow */}
                {dayTasks.length > 3 && (
                  <button
                    onClick={() => onTaskClick(dayTasks[3])}
                    className="text-[10px] text-muted hover:accent transition-colors font-medium px-1"
                  >
                    +{dayTasks.length - 3} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
  canAssign,
  onClose,
  onSaved,
  onDelete,
}: {
  task: Task | null;
  product: { id: string };
  members: Profile[];
  sprints: Sprint[];
  currentAssignees: string[];
  canAssign: boolean;
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
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);

  // Load subtasks when editing an existing task
  useEffect(() => {
    if (!task?.id) return;
    supabase
      .from('subtasks')
      .select('*')
      .eq('task_id', task.id)
      .order('position')
      .then(({ data }) => setSubtasks((data as Subtask[]) || []));
  }, [task?.id]);

  const addSubtask = async (taskId: string) => {
    if (!newSubtask.trim()) return;
    const row = { task_id: taskId, title: newSubtask.trim(), completed: false, position: subtasks.length };
    const { data } = await supabase.from('subtasks').insert(row).select('*').single();
    if (data) setSubtasks((prev) => [...prev, data as Subtask]);
    setNewSubtask('');
  };

  const toggleSubtask = async (st: Subtask) => {
    const updated = { ...st, completed: !st.completed };
    setSubtasks((prev) => prev.map((s) => s.id === st.id ? updated : s));
    await supabase.from('subtasks').update({ completed: !st.completed }).eq('id', st.id);
  };

  const deleteSubtask = async (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    await supabase.from('subtasks').delete().eq('id', id);
  };

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      product_id: product.id,
      title: title.trim(),
      description,
      status,
      priority,
      due_date: dueDate || null,
      sprint_id: sprintId || null,
      department: department || null,
    };
    if (canAssign) payload.assignee_id = assigneeId || null;
    let taskId = task?.id;
    if (task) {
      await supabase.from('tasks').update(payload).eq('id', task.id);
    } else {
      const { data } = await supabase.from('tasks').insert(payload).select('id').single();
      if (data) taskId = (data as { id: string }).id;
    }

    if (taskId && canAssign) {
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      if (selectedAssignees.length > 0) {
        await supabase.from('task_assignees').insert(selectedAssignees.map((uid) => ({ task_id: taskId, user_id: uid })));
      }
    }
    if (taskId && newSubtask.trim()) {
      await addSubtask(taskId);
    }

    setSaving(false);
    onSaved();
  };

  const doneCount = subtasks.filter((s) => s.completed).length;
  const assignable = [...members].sort((a, b) => {
    if (a.role === 'founder' && b.role !== 'founder') return -1;
    if (b.role === 'founder' && a.role !== 'founder') return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <Modal open onClose={onClose} title={task ? 'Edit Task' : 'New Task'} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
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
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!canAssign}>
              <option value="">Unassigned</option>
              {assignable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}{m.role === 'founder' ? ' (Founder)' : ''}
                </option>
              ))}
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

        {/* ── Subtasks ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-muted">
              Subtasks
              {subtasks.length > 0 && (
                <span className="ml-1.5 text-[10px] accent font-bold tabular-nums">
                  {doneCount}/{subtasks.length}
                </span>
              )}
            </label>
          </div>

          {/* Progress bar */}
          {subtasks.length > 0 && (
            <div className="h-1.5 rounded-full surface-2 overflow-hidden mb-2">
              <div
                className="h-full accent-bg transition-all"
                style={{ width: `${(doneCount / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          {/* Subtask list */}
          <div className="space-y-1 mb-2">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:surface-2 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleSubtask(st)}
                  className={cn(
                    'w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center transition-colors',
                    st.completed ? 'bg-emerald-500 border-emerald-500' : 'border-app hover:border-[var(--accent)]'
                  )}
                >
                  {st.completed && <Check className="w-2.5 h-2.5 text-white" />}
                </button>
                <span className={cn('text-sm flex-1', st.completed ? 'line-through text-muted' : 'text-[var(--text)]')}>
                  {st.title}
                </span>
                <button
                  type="button"
                  onClick={() => deleteSubtask(st.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-rose-500 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add new subtask */}
          <div className="flex items-center gap-2">
            <Input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (task?.id) addSubtask(task.id);
                  // If new task (no id yet), it'll be saved on main save
                }
              }}
              placeholder="Add a subtask…"
              className="text-sm"
            />
            {task?.id && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => addSubtask(task.id)}
                disabled={!newSubtask.trim()}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* ── Assignees ─────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-medium text-muted mb-2">Assignees (multiple)</label>
          {!canAssign && (
            <p className="text-[11px] text-muted mb-2">Only founders and task coordinators can assign people.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {assignable.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => canAssign && toggleAssignee(m.id)}
                disabled={!canAssign}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border',
                  !canAssign && 'cursor-not-allowed opacity-70',
                  selectedAssignees.includes(m.id)
                    ? 'accent-tint-bg accent border-transparent'
                    : 'surface text-muted border-app hover:text-[var(--text)] hover:surface-2'
                )}
              >
                <Avatar name={m.full_name} src={m.avatar_url} size="xs" />
                {m.full_name}
                {m.role === 'founder' && <span className="text-[10px] opacity-70">Founder</span>}
              </button>
            ))}
            {assignable.length === 0 && <span className="text-xs text-muted">No founders or employees yet</span>}
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

