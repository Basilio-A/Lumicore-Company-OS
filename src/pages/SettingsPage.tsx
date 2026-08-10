import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Check, Camera, User, Lock, Bell, Palette, Shield, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { usePrefs } from '@/context/PrefsContext';
import { PageContainer } from '@/components/AppLayout';
import { ImageUpload } from '@/components/ImageUpload';
import { Avatar, Button, Input, Textarea, Card, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

type Section = 'profile' | 'password' | 'appearance' | 'notifications' | 'security';

const SECTIONS: { key: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'profile',       label: 'Profile',      icon: User,    desc: 'Name, photo, bio, contact' },
  { key: 'password',      label: 'Password',     icon: Lock,    desc: 'Change your password' },
  { key: 'appearance',    label: 'Appearance',   icon: Palette, desc: 'Theme and display currency' },
  { key: 'notifications', label: 'Notifications',icon: Bell,    desc: 'Email and in-app alerts' },
  { key: 'security',      label: 'Security',     icon: Shield,  desc: 'Sessions and account safety' },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>('profile');
  const { profile, signOut } = useAuth();

  return (
    <PageContainer title="Settings">
      <div className="grid md:grid-cols-[220px_1fr] gap-6 max-w-4xl">
        {/* Sidebar nav */}
        <div className="space-y-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors',
                active === s.key
                  ? 'accent-tint-bg accent font-medium'
                  : 'text-muted hover:text-[var(--text)] hover:surface-2'
              )}
            >
              <s.icon className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight truncate">{s.label}</div>
                <div className="text-[10px] text-muted hidden sm:block truncate">{s.desc}</div>
              </div>
            </button>
          ))}

          {/* Sign out button at bottom of sidebar */}
          <div className="pt-4 mt-4 border-t border-app">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-rose-500 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>

        {/* Panel */}
        <div>
          {active === 'profile'       && <ProfileSection />}
          {active === 'password'      && <PasswordSection />}
          {active === 'appearance'    && <AppearanceSection />}
          {active === 'notifications' && <NotificationsSection />}
          {active === 'security'      && <SecuritySection signOut={signOut} />}
        </div>
      </div>
    </PageContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SECTION
// ─────────────────────────────────────────────────────────────────────────────
function ProfileSection() {
  const { profile, loadProfile } = useAuth();
  const [fullName, setFullName]   = useState(profile?.full_name || '');
  const [title, setTitle]         = useState(profile?.title || '');
  const [phone, setPhone]         = useState(profile?.phone || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [bio, setBio]             = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');

  // Sync when profile loads
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setTitle(profile.title || '');
    setPhone(profile.phone || '');
    setDepartment(profile.department || '');
    setBio(profile.bio || '');
    setAvatarUrl(profile.avatar_url || '');
  }, [profile]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setError('');
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:  fullName.trim(),
        title:      title.trim() || null,
        phone:      phone.trim() || null,
        department: department.trim() || null,
        bio:        bio.trim() || null,
        avatar_url: avatarUrl || null,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (error) { setError(error.message); return; }

    // Refresh auth context
    await loadProfile();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-display font-semibold text-[var(--text)]">Profile</h2>
        <p className="text-sm text-muted mt-0.5">Update your personal info visible to your team.</p>
      </div>

      {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}

      {/* Avatar */}
      <div>
        <label className="block text-xs font-medium text-muted mb-3">Profile photo</label>
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar name={fullName || profile?.full_name || '?'} src={avatarUrl || null} size="lg" className="w-20 h-20 text-lg" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full accent-bg flex items-center justify-center shadow-soft">
              <Camera className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <ImageUpload
            bucket="avatars"
            value={avatarUrl || null}
            onChange={(url) => setAvatarUrl(url || '')}
            shape="circle"
            size="sm"
            label="Upload new photo"
            className="flex-1"
          />
        </div>
      </div>

      {/* Fields */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Job title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Software Engineer" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Department</label>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
          <Input value={profile?.email || ''} disabled className="opacity-60 cursor-not-allowed" />
          <p className="text-[10px] text-muted mt-1">Email cannot be changed here.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted mb-1.5">Bio</label>
          <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short intro about yourself…" />
        </div>
      </div>

      {/* Role badge — read-only */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Role:</span>
        <Badge color={profile?.role === 'founder' ? '#6C63FF' : profile?.role === 'investor' ? '#10B981' : '#3B82F6'}>
          {profile?.role}
        </Badge>
        <span className="text-[10px] text-muted">(set by an admin)</span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </Button>
        {saved && <span className="text-sm text-emerald-500 flex items-center gap-1"><Check className="w-4 h-4" /> Changes saved</span>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSWORD SECTION
// ─────────────────────────────────────────────────────────────────────────────
function PasswordSection() {
  const [current, setCurrent]     = useState('');
  const [next, setNext]           = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showCurr, setShowCurr]   = useState(false);
  const [showNext, setShowNext]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  // Password strength
  const strength = [next.length >= 8, /[A-Z]/.test(next), /[0-9]/.test(next), /[^a-zA-Z0-9]/.test(next)];
  const score = strength.filter(Boolean).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const strengthColor = ['', 'bg-rose-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'][score];

  const save = async () => {
    setError('');
    if (next.length < 8)     { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm)    { setError('Passwords do not match.'); return; }

    setSaving(true);

    // Re-authenticate first using the current password
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user.email || '';

    if (current) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInErr) { setError('Current password is incorrect.'); setSaving(false); return; }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: next });
    setSaving(false);

    if (updateErr) { setError(updateErr.message); return; }

    setCurrent(''); setNext(''); setConfirm('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-display font-semibold text-[var(--text)]">Change Password</h2>
        <p className="text-sm text-muted mt-0.5">Choose a strong password you don't use elsewhere.</p>
      </div>

      {error   && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
      {success && <div className="text-sm text-emerald-600 bg-emerald-500/10 rounded-lg px-3 py-2 flex items-center gap-2"><Check className="w-4 h-4" /> Password updated successfully.</div>}

      <div className="space-y-4 max-w-sm">
        {/* Current password */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Current password</label>
          <div className="relative">
            <Input type={showCurr ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" className="pr-10" />
            <button type="button" onClick={() => setShowCurr(!showCurr)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
              {showCurr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">New password</label>
          <div className="relative">
            <Input type={showNext ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} placeholder="Min. 8 characters" className="pr-10" />
            <button type="button" onClick={() => setShowNext(!showNext)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
              {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {next.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1">
                {[0,1,2,3].map((i) => (
                  <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i < score ? strengthColor : 'surface-2')} />
                ))}
              </div>
              <p className={cn('text-[10px] font-medium', score <= 1 ? 'text-rose-500' : score === 2 ? 'text-amber-500' : score === 3 ? 'text-blue-500' : 'text-emerald-500')}>
                {strengthLabel} password
              </p>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Confirm new password</label>
          <Input type={showNext ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" />
          {confirm && next !== confirm && <p className="text-[11px] text-rose-500 mt-1">Passwords do not match</p>}
        </div>
      </div>

      <Button onClick={save} disabled={saving || !next || !confirm || next !== confirm}>
        {saving ? 'Updating…' : 'Update password'}
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APPEARANCE SECTION
// ─────────────────────────────────────────────────────────────────────────────
function AppearanceSection() {
  const { theme, toggleTheme, currency, toggleCurrency } = usePrefs();

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-display font-semibold text-[var(--text)]">Appearance</h2>
        <p className="text-sm text-muted mt-0.5">Control how the app looks for you.</p>
      </div>

      {/* Theme */}
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-3">Theme</label>
        <div className="flex gap-3">
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => theme !== t && toggleTheme()}
              className={cn(
                'flex-1 rounded-xl border-2 p-4 text-center transition-all',
                theme === t ? 'border-[var(--accent)] accent' : 'border-app text-muted hover:border-[var(--accent)]/40'
              )}
            >
              <div className={cn(
                'w-full h-16 rounded-lg mb-2.5 flex items-center justify-center text-2xl',
                t === 'light' ? 'bg-white border border-gray-200' : 'bg-[#0f0f14] border border-gray-800'
              )}>
                {t === 'light' ? '☀️' : '🌙'}
              </div>
              <span className="text-xs font-semibold capitalize">{t}</span>
              {theme === t && (
                <div className="mt-1 flex justify-center">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Currency */}
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-3">Display Currency</label>
        <div className="flex gap-3">
          {(['USD', 'ETB'] as const).map((c) => (
            <button
              key={c}
              onClick={() => currency !== c && toggleCurrency()}
              className={cn(
                'flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all',
                currency === c ? 'border-[var(--accent)] accent-tint-bg accent' : 'border-app text-muted hover:border-[var(--accent)]/40'
              )}
            >
              {c === 'USD' ? '$ USD — US Dollar' : 'Br ETB — Ethiopian Birr'}
              {currency === c && <Check className="w-3.5 h-3.5 inline ml-1.5" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">All money values across the app will display in the selected currency.</p>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS SECTION
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_PREFS_KEY = 'lumicore_notif_prefs';

const DEFAULT_PREFS = {
  chat_mentions:   true,
  task_assigned:   true,
  sprint_started:  true,
  kudos_received:  true,
  memo_published:  false,
};

type NotifKey = keyof typeof DEFAULT_PREFS;

const NOTIF_ITEMS: { key: NotifKey; label: string; desc: string }[] = [
  { key: 'chat_mentions',  label: 'Chat mentions',      desc: 'When someone @-mentions you in a channel or DM' },
  { key: 'task_assigned',  label: 'Task assigned to you', desc: 'When a task is assigned or re-assigned to you' },
  { key: 'sprint_started', label: 'Sprint started',     desc: 'When an active sprint begins for your products' },
  { key: 'kudos_received', label: 'Kudos received',     desc: 'When a teammate gives you kudos' },
  { key: 'memo_published', label: 'Investor memos',     desc: 'When a new investor update is published' },
];

function NotificationsSection() {
  const [prefs, setPrefs] = useState<typeof DEFAULT_PREFS>(() => {
    try {
      const stored = localStorage.getItem(NOTIF_PREFS_KEY);
      return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
    } catch { return DEFAULT_PREFS; }
  });
  const [saved, setSaved] = useState(false);

  const toggle = (key: NotifKey) => setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = () => {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-display font-semibold text-[var(--text)]">Notifications</h2>
        <p className="text-sm text-muted mt-0.5">Choose which events notify you.</p>
      </div>

      <div className="space-y-1">
        {NOTIF_ITEMS.map((item) => (
          <div key={item.key}
            className="flex items-center justify-between rounded-xl px-4 py-3 hover:surface-2 transition-colors cursor-pointer"
            onClick={() => toggle(item.key)}
          >
            <div>
              <div className="text-sm font-medium text-[var(--text)]">{item.label}</div>
              <div className="text-xs text-muted">{item.desc}</div>
            </div>
            {/* Toggle switch */}
            <div className={cn(
              'w-10 h-5.5 rounded-full transition-colors relative shrink-0 ml-4',
              prefs[item.key] ? 'accent-bg' : 'surface-2'
            )}
              style={{ height: '22px' }}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                prefs[item.key] ? 'left-[22px]' : 'left-0.5'
              )} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save}>Save preferences</Button>
        {saved && <span className="text-sm text-emerald-500 flex items-center gap-1"><Check className="w-4 h-4" /> Saved</span>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY SECTION
// ─────────────────────────────────────────────────────────────────────────────
function SecuritySection({ signOut }: { signOut: () => void }) {
  const { profile } = useAuth();
  const [sessions, setSessions] = useState<{ id: string; created_at: string; user_agent?: string }[]>([]);
  const [signingOut, setSigningOut] = useState(false);

  // Load active sessions (best-effort via auth admin — falls back gracefully)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessions([{
          id: 'current',
          created_at: data.session.expires_at
            ? new Date((data.session.expires_at - 3600) * 1000).toISOString()
            : new Date().toISOString(),
          user_agent: navigator.userAgent.slice(0, 80),
        }]);
      }
    });
  }, []);

  const signOutAll = async () => {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: 'global' });
    signOut();
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="font-display font-semibold text-[var(--text)]">Security</h2>
        <p className="text-sm text-muted mt-0.5">Manage your active sessions and account safety.</p>
      </div>

      {/* Account info */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Account</label>
        <div className="rounded-xl surface-2 px-4 py-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Email</span>
            <span className="text-[var(--text)] font-medium">{profile?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Role</span>
            <span className="text-[var(--text)] font-medium capitalize">{profile?.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Status</span>
            <span className="text-emerald-500 font-medium capitalize">{profile?.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Member since</span>
            <span className="text-[var(--text)] font-medium">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Active sessions */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-muted uppercase tracking-wider">Active Sessions</label>
        {sessions.map((s) => (
          <div key={s.id} className="rounded-xl surface-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
                  This device
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md accent-tint-bg accent font-semibold">Current</span>
                </div>
                <div className="text-xs text-muted mt-0.5 truncate">{s.user_agent}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-rose-500">Danger zone</p>
          <p className="text-xs text-muted mt-0.5">These actions are immediate and cannot be undone.</p>
        </div>
        <Button
          variant="ghost"
          onClick={signOutAll}
          disabled={signingOut}
          className="text-rose-500 hover:bg-rose-500/10 border border-rose-500/30"
        >
          {signingOut ? 'Signing out…' : 'Sign out all devices'}
        </Button>
      </div>
    </Card>
  );
}
