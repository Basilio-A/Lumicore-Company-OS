import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

function formatAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('failed to fetch')) {
    return 'Cannot reach Supabase. Confirm the project is live and VITE_SUPABASE_URL is correct.';
  }
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'This email is not confirmed yet. Try signing in again in a moment, or use Forgot password.';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (m.includes('password should be') || m.includes('password is known')) {
    return message;
  }
  return message;
}

async function finishSignIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error;
}

export default function LoginPage({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const stored = localStorage.getItem('lumicore_last_email');
    if (stored) setEmail(stored);
  }, []);

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const normalized = email.trim().toLowerCase();
    const signInError = await finishSignIn(normalized, password);
    setLoading(false);
    if (signInError) {
      setError(formatAuthError(signInError.message));
      return;
    }
    localStorage.setItem('lumicore_last_email', normalized);
    navigate('/overview');
  };

  const onSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const normalized = email.trim().toLowerCase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    if (signUpError) {
      setLoading(false);
      setError(formatAuthError(signUpError.message));
      return;
    }

    if (!data.session) {
      const signInError = await finishSignIn(normalized, password);
      if (signInError) {
        setLoading(false);
        setError(formatAuthError(signInError.message));
        return;
      }
    }

    if (data.user?.id) {
      await supabase.rpc('self_promote_founder', { p_uid: data.user.id, p_code: '' });
    }

    localStorage.setItem('lumicore_last_email', normalized);
    setLoading(false);
    navigate('/overview');
  };

  const isSignup = mode === 'signup';

  return (
    <AuthShell
      title={isSignup ? 'Create an account' : 'Welcome back'}
      subtitle={
        isSignup
          ? 'The first account becomes founder. Later accounts join as teammates.'
          : 'Sign in to your Lumicore workspace.'
      }
      themeToggle
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg surface-2 p-1 mb-5">
        <button
          type="button"
          onClick={() => { setMode('signin'); setError(''); }}
          className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
            !isSignup ? 'accent-bg text-white' : 'text-muted hover:text-[var(--text)]'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode('signup'); setError(''); }}
          className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
            isSignup ? 'accent-bg text-white' : 'text-muted hover:text-[var(--text)]'
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={isSignup ? onSignUp : onSignIn} className="space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}

        {isSignup && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
            <Input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              autoFocus
              autoComplete="name"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@lumicore.com"
            autoFocus={!isSignup}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              required
              minLength={isSignup ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
              className="pr-10"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isSignup && (
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
            <Input
              type={showPw ? 'text' : 'password'}
              required
              minLength={8}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
            {confirmPw && password !== confirmPw && (
              <p className="text-[11px] text-rose-500 mt-1">Passwords do not match</p>
            )}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading || (isSignup && password !== confirmPw)}>
          {loading
            ? isSignup
              ? 'Creating account…'
              : 'Signing in…'
            : isSignup
              ? 'Create account'
              : 'Sign in'}
        </Button>

        {!isSignup && (
          <div className="flex justify-between text-xs">
            <Link to="/forgot-password" className="text-muted hover:text-[var(--text)]">Forgot password?</Link>
            <button type="button" onClick={() => setMode('signup')} className="accent hover:underline">
              Create an account
            </button>
          </div>
        )}

        {isSignup && (
          <p className="text-xs text-muted text-center">
            Already have an account?{' '}
            <button type="button" onClick={() => setMode('signin')} className="accent hover:underline">
              Sign in
            </button>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
