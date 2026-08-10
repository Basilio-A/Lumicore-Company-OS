import { useEffect, useState } from 'react';
import { Trophy, Star, TrendingUp, Award } from 'lucide-react';
import { supabase, type Profile, type Kudos, type Task } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Avatar, Badge, Card, Modal, Select, Textarea, EmptyState } from '@/components/ui';
import { formatRelative } from '@/lib/utils';

interface ScoreRow {
  profile: Profile;
  points: number;
  tasksDone: number;
  kudosCount: number;
}

export default function EmployeeOfTheMonthPage() {
  const { profile } = useAuth();
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [kudos, setKudos] = useState<(Kudos & { fromName: string })[]>([]);
  const [giving, setGiving] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);

  const load = async () => {
    const { data: profs } = await supabase.from('profiles').select('*').eq('status', 'active').neq('role', 'investor').order('full_name');
    const profiles = profs || [];
    setPeople(profiles);

    // Tasks completed on time (due_date >= completed_at or no due date)
    const { data: tasks } = await supabase.from('tasks').select('*').not('assignee_id', 'is', null);
    const taskPoints: Record<string, number> = {};
    for (const t of (tasks || []) as Task[]) {
      if (t.status === 'done' && t.assignee_id) {
        let pts = 10; // base for completion
        if (t.due_date && t.completed_at && new Date(t.completed_at) <= new Date(t.due_date)) pts += 5; // on-time bonus
        taskPoints[t.assignee_id] = (taskPoints[t.assignee_id] || 0) + pts;
      }
    }

    // Kudos
    const { data: allKudos } = await supabase.from('kudos').select('*').order('created_at', { ascending: false }).limit(20);
    const kudosPoints: Record<string, number> = {};
    const kudosCount: Record<string, number> = {};
    const nameMap = new Map(profiles.map((p) => [p.id, p.full_name]));
    for (const k of (allKudos || []) as Kudos[]) {
      kudosPoints[k.to_user_id] = (kudosPoints[k.to_user_id] || 0) + k.points;
      kudosCount[k.to_user_id] = (kudosCount[k.to_user_id] || 0) + 1;
    }
    setKudos((allKudos || []).map((k) => ({ ...(k as Kudos), fromName: nameMap.get(k.from_user_id) || 'Unknown' })));

    const rows: ScoreRow[] = profiles.map((p) => ({
      profile: p,
      points: (taskPoints[p.id] || 0) + (kudosPoints[p.id] || 0),
      tasksDone: (tasks || []).filter((t) => t.assignee_id === p.id && t.status === 'done').length,
      kudosCount: kudosCount[p.id] || 0,
    }));
    rows.sort((a, b) => b.points - a.points);
    setScores(rows);
  };

  useEffect(() => { load(); }, []);

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const winner = scores[0];

  return (
    <PageContainer title="Employee of the Month" actions={<Button size="sm" onClick={() => setGiving(true)}><Star className="w-4 h-4" /> Give Kudos</Button>}>
      <p className="text-sm text-muted -mt-2 mb-6">{currentMonth} — points are transparent and visible to everyone.</p>

      {winner && winner.points > 0 && (
        <Card className="p-6 mb-6 accent-tint-bg border-[var(--accent)]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl accent-bg flex items-center justify-center"><Trophy className="w-8 h-8 text-white" /></div>
            <div>
              <div className="text-xs accent font-semibold uppercase tracking-wider">Current Leader</div>
              <div className="text-2xl font-display font-bold text-[var(--text)]">{winner.profile.full_name}</div>
              <div className="text-sm text-muted">{winner.points} points · {winner.tasksDone} tasks done · {winner.kudosCount} kudos received</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <Card className="p-5">
          <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 accent" /> Leaderboard</h3>
          {scores.length === 0 || scores.every((s) => s.points === 0) ? (
            <EmptyState title="No points earned yet" description="Complete tasks on time and give kudos to earn points." />
          ) : (
            <div className="space-y-2">
              {scores.filter((s) => s.points > 0).map((s, idx) => (
                <div key={s.profile.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${idx === 0 ? 'surface-2' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'accent-bg text-white' : 'surface-2 text-muted'}`}>{idx + 1}</div>
                  <Avatar name={s.profile.full_name} src={s.profile.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium text-[var(--text)] truncate">{s.profile.full_name}</div><div className="text-xs text-muted">{s.tasksDone} tasks · {s.kudosCount} kudos</div></div>
                  <div className="text-lg font-display font-bold accent">{s.points}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-[var(--text)] mb-4 flex items-center gap-2"><Award className="w-4 h-4 accent" /> Recent Kudos</h3>
          {kudos.length === 0 ? (
            <p className="text-sm text-muted py-4">No kudos given yet.</p>
          ) : (
            <div className="space-y-3">
              {kudos.slice(0, 8).map((k) => (
                <div key={k.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[var(--text)]"><span className="font-medium">{k.fromName}</span> gave <span className="font-medium accent">+{k.points}</span></span>
                  </div>
                  {k.reason && <p className="text-xs text-muted mt-0.5 ml-6">"{k.reason}"</p>}
                  <p className="text-[10px] text-muted mt-0.5 ml-6">{formatRelative(k.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {giving && <GiveKudosModal people={people} currentUserId={profile?.id || null} onClose={() => setGiving(false)} onGiven={load} />}
    </PageContainer>
  );
}

function GiveKudosModal({ people, currentUserId, onClose, onGiven }: { people: Profile[]; currentUserId: string | null; onClose: () => void; onGiven: () => void }) {
  const [toId, setToId] = useState('');
  const [points, setPoints] = useState(5);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const send = async () => {
    if (!toId || !currentUserId) return;
    setSaving(true);
    await supabase.from('kudos').insert({ from_user_id: currentUserId, to_user_id: toId, points, reason: reason || null });
    setSaving(false);
    onGiven();
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Give Kudos">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">To</label><Select value={toId} onChange={(e) => setToId(e.target.value)}><option value="">Select someone…</option>{people.filter((p) => p.id !== currentUserId).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Points</label><Select value={points} onChange={(e) => setPoints(Number(e.target.value))}><option value={5}>5 — Thank you</option><option value={10}>10 — Great work</option><option value={20}>20 — Above and beyond</option></Select></div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Reason (optional)</label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What did they do well?" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={send} disabled={saving || !toId}>{saving ? 'Sending…' : 'Send Kudos'}</Button></div>
    </Modal>
  );
}
