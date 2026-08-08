import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('lumicore_last_email');
    if (stored) { setEmail(stored); setIsReturning(true); }
  }, []);

  const checkEmail = async (emailValue: string) => {
    if (!emailValue.trim()) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', emailValue.trim())
        .limit(1);
      if (data && data.length > 0) setIsReturning(true);
    } catch {
      // ignore
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    localStorage.setItem('lumicore_last_email', email.trim());
    navigate('/overview');
  };

  return (
    <AuthShell
      title={isReturning ? 'Welcome Back' : 'Welcome'}
      subtitle="Sign in to your Lumicore workspace."
      themeToggle
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>
        )}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); checkEmail(e.target.value); }}
            placeholder="you@lumicore.com"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <div className="mt-3 flex items-center justify-between text-xs">
        <button onClick={() => navigate('/forgot-password')} className="text-muted hover:text-[var(--text)]">
          Forgot password?
        </button>
        <button onClick={() => navigate('/request-access')} className="accent hover:underline">
          Request access
        </button>
      </div>
    </AuthShell>
  );
}
