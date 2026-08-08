import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/login'), 2000);
  };

  return (
    <AuthShell title="Set new password" subtitle="Enter your new password below.">
      {done ? (
        <p className="text-sm text-muted">Password updated. Redirecting to login…</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">New password</label>
            <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoFocus />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
