import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

type Tab = 'signin' | 'founder' | 'request';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'signin';
  const [tab, setTab] = useState<Tab>(initialTab);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'signin', label: 'Sign in' },
    { key: 'founder', label: 'Create account' },
    { key: 'request', label: 'Request access' },
  ];

  return (
    <AuthShell
      title={tab === 'signin' ? 'Welcome back' : tab === 'founder' ? 'Create founder account' : 'Request access'}
      subtitle={
        tab === 'signin'
          ? 'Sign in to your Lumicore workspace.'
          : tab === 'founder'
          ? 'Set up a new founder workspace.'
          : 'Submit a request — a founder will review and approve it.'
      }
      showGoogle={false}
      themeToggle
    >
      {/* Tab bar */}
      <div className="flex rounded-xl surface-2 p-1 mb-5 gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
              tab === t.key
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-soft'
                : 'text-muted hover:text-[var(--text)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'signin' && <SignInForm navigate={navigate} />}
      {tab === 'founder' && <FounderSignUpForm navigate={navigate} />}
      {tab === 'request' && <RequestAccessForm navigate={navigate} />}
    </AuthShell>
  );
}

// ── Sign In ──────────────────────────────────────────────────────────────────
function SignInForm({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('lumicore_last_email');
    if (stored) setEmail(stored);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    localStorage.setItem('lumicore_last_email', email.trim());
    navigate('/overview');
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lumicore.com" autoFocus />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
        <div className="relative">
          <Input type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
      <div className="flex justify-between text-xs">
        <Link to="/forgot-password" className="text-muted hover:text-[var(--text)]">Forgot password?</Link>
      </div>
    </form>
  );
}

// ── Founder Sign Up ───────────────────────────────────────────────────────────
function FounderSignUpForm({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [founderCode, setFounderCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Password strength
  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ];
  const strengthScore = strength.filter(Boolean).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strengthScore];
  const strengthColor = ['', 'bg-rose-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'][strengthScore];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }

    // Optional founder invite code gate — env-configurable
    const requiredCode = import.meta.env.VITE_FOUNDER_CODE as string | undefined;
    if (requiredCode && founderCode.trim() !== requiredCode) {
      setError('Invalid founder code. Contact your system administrator.');
      return;
    }

    setLoading(true);

    // 1. Create Supabase auth user
    const { data, error: authErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    if (authErr) { setError(authErr.message); setLoading(false); return; }

    const uid = data.user?.id;
    if (!uid) { setError('Signup failed — no user returned. Please try again.'); setLoading(false); return; }

    // 2. Upsert profile with role = founder
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: uid,
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      title: 'Founder',
      role: 'founder',
      status: 'active',
    }, { onConflict: 'id' });

    setLoading(false);

    if (profileErr) {
      // Profile upsert failed — show warning but don't block (trigger may have already created it)
      console.warn('Profile upsert warning:', profileErr.message);
    }

    setDone(true);
  };

  if (done) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">Account created!</p>
          <p className="text-sm text-muted mt-1">Check your email to confirm your address, then sign in.</p>
        </div>
        <Button className="w-full" onClick={() => navigate('/login?tab=signin')}>Go to Sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
        <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Work email</label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourcompany.com" />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
        <div className="relative">
          <Input
            type={showPw ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className="pr-10"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {/* Strength bar */}
        {password.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i < strengthScore ? strengthColor : 'surface-2')} />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className={cn('text-[10px] font-medium', strengthScore <= 1 ? 'text-rose-500' : strengthScore === 2 ? 'text-amber-500' : strengthScore === 3 ? 'text-blue-500' : 'text-emerald-500')}>
                {strengthLabel}
              </p>
              <div className="flex gap-2">
                {[
                  { ok: strength[0], label: '8+ chars' },
                  { ok: strength[1], label: 'A-Z' },
                  { ok: strength[2], label: '0-9' },
                  { ok: strength[3], label: '#!@' },
                ].map((r) => (
                  <span key={r.label} className={cn('text-[10px]', r.ok ? 'text-emerald-500' : 'text-muted')}>
                    {r.ok ? '✓' : '·'} {r.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
        <Input
          type={showPw ? 'text' : 'password'}
          required
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          placeholder="Re-enter password"
        />
        {confirmPw && password !== confirmPw && (
          <p className="text-[11px] text-rose-500 mt-1">Passwords do not match</p>
        )}
      </div>

      {/* Optional founder code */}
      {import.meta.env.VITE_FOUNDER_CODE && (
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">
            Founder code <span className="font-normal">(required)</span>
          </label>
          <Input
            value={founderCode}
            onChange={(e) => setFounderCode(e.target.value)}
            placeholder="Enter your founder invite code"
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading || (!!confirmPw && password !== confirmPw)}>
        {loading ? 'Creating account…' : 'Create founder account'}
      </Button>

      <p className="text-[11px] text-muted text-center">
        Founder accounts have full admin access to the workspace.
      </p>
    </form>
  );
}

// ── Request Access ────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  'Software Engineer', 'ML Engineer', 'Data Scientist', 'Product Manager',
  'Product Designer', 'QA Engineer', 'DevOps Engineer', 'Sales', 'Marketing', 'Operations', 'Other',
];

function RequestAccessForm({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const role = selectedRole === 'Other' ? customRole.trim() : selectedRole;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!role) { setError('Please select a role.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }

    setLoading(true);
    const { error: insertErr } = await supabase.from('account_requests').insert({
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      title: role,
      message: message.trim() || null,
      desired_password: password,
    });
    setLoading(false);
    if (insertErr) { setError(insertErr.message); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">Request submitted!</p>
          <p className="text-sm text-muted mt-1">
            A founder will review your request. Once approved you can sign in with the email and password you set.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate('/login?tab=signin')}>Back to Sign in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
        <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Work email</label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
      </div>

      {/* Password */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Choose a password</label>
        <div className="relative">
          <Input type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" className="pr-10" />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
        <Input type={showPw ? 'text' : 'password'} required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Re-enter password" />
        {confirmPw && password !== confirmPw && <p className="text-[11px] text-rose-500 mt-1">Passwords do not match</p>}
      </div>

      {/* Role picker */}
      <div>
        <label className="block text-xs font-medium text-muted mb-2">Role / title</label>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_OPTIONS.map((r) => (
            <button key={r} type="button" onClick={() => setSelectedRole(r)}
              className={cn('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border',
                selectedRole === r ? 'accent-bg text-white border-transparent' : 'surface text-muted border-app hover:text-[var(--text)]')}>
              {r}
            </button>
          ))}
        </div>
        {selectedRole === 'Other' && (
          <Input className="mt-2" value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Type your role…" />
        )}
      </div>

      {/* Optional note */}
      <div>
        <label className="block text-xs font-medium text-muted mb-1.5">Note <span className="font-normal">(optional)</span></label>
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything the founder should know" />
      </div>

      <Button type="submit" className="w-full" disabled={loading || (!!confirmPw && password !== confirmPw) || !role}>
        {loading ? 'Submitting…' : 'Submit request'}
      </Button>
    </form>
  );
}
