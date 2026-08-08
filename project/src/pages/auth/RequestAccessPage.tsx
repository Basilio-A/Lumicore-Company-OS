import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'Software Engineer', label: 'Software Engineer' },
  { key: 'ML Engineer', label: 'ML Engineer' },
  { key: 'Data Scientist', label: 'Data Scientist' },
  { key: 'Product Manager', label: 'Product Manager' },
  { key: 'Product Designer', label: 'Product Designer' },
  { key: 'QA Engineer', label: 'QA Engineer' },
  { key: 'DevOps Engineer', label: 'DevOps Engineer' },
  { key: 'Sales', label: 'Sales' },
  { key: 'Marketing', label: 'Marketing' },
  { key: 'Operations', label: 'Operations' },
  { key: 'Other', label: 'Other' },
];

export default function RequestAccessPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [customRole, setCustomRole] = useState('');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const role = selectedRole === 'Other' ? customRole.trim() : selectedRole;

  const pwStrength = (pw: string): { label: string; color: string; pct: number } => {
    if (pw.length === 0) return { label: '', color: '', pct: 0 };
    if (pw.length < 6) return { label: 'Too short', color: 'bg-rose-500', pct: 20 };
    if (pw.length < 8) return { label: 'Weak', color: 'bg-orange-400', pct: 40 };
    const hasUpper = /[A-Z]/.test(pw);
    const hasNum = /\d/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);
    const score = [hasUpper, hasNum, hasSymbol].filter(Boolean).length;
    if (score === 0) return { label: 'Fair', color: 'bg-yellow-400', pct: 55 };
    if (score === 1) return { label: 'Good', color: 'bg-blue-400', pct: 75 };
    return { label: 'Strong', color: 'bg-emerald-500', pct: 100 };
  };

  const strength = pwStrength(password);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!role) { setError('Please select a role.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    // Try inserting with desired_password; if column doesn't exist yet, retry without it
    let insertErr: any = null;
    const { error: e1 } = await supabase.from('account_requests').insert({
      email, full_name: fullName, title: role, message, desired_password: password,
    });
    insertErr = e1;
    if (insertErr && (insertErr.message?.includes('desired_password') || insertErr.code === '42703')) {
      // Column not yet migrated — insert without it
      const { error: e2 } = await supabase.from('account_requests').insert({
        email, full_name: fullName, title: role, message,
      });
      insertErr = e2;
    }
    setLoading(false);
    if (insertErr) { setError(insertErr.message); return; }
    setDone(true);
  };

  if (done) {
    return (
      <AuthShell title="Request submitted" subtitle="Your access request is in.">
        <p className="text-sm text-muted">
          A founder will review your request. Once approved, you can sign in with your email and the password you just set.
        </p>
        <div className="mt-5">
          <Link to="/login" className="text-xs accent hover:underline">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Request access" subtitle="Submit a request — a founder will review and approve it.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>
        )}

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Work email</label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lumicore.com" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-2">Role / title</label>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelectedRole(r.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border',
                  selectedRole === r.key
                    ? 'accent-bg text-white border-transparent'
                    : 'surface text-muted border-app hover:text-[var(--text)] hover:surface-2'
                )}
              >
                {selectedRole === r.key && <Check className="w-3 h-3 inline mr-1" />}
                {r.label}
              </button>
            ))}
          </div>
          {selectedRole === 'Other' && (
            <Input
              className="mt-2"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder="Type your role…"
            />
          )}
        </div>

        {/* Password section */}
        <div className="space-y-3 pt-1">
          <div className="text-xs font-semibold text-[var(--text)] border-t border-app pt-3">Choose your password</div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
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
            {password.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <div className="h-1.5 rounded-full surface-2 overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', strength.color)} style={{ width: `${strength.pct}%` }} />
                </div>
                <div className="text-xs text-muted">{strength.label}</div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className={cn('pr-9', confirmPassword && password !== confirmPassword && 'border-rose-500')}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-rose-500 mt-1">Passwords do not match</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Note (optional)</label>
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything you'd like the founders to know" />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Submitting…' : 'Submit request'}
        </Button>
      </form>
      <div className="mt-5 text-xs text-muted">
        <Link to="/login" className="accent hover:underline">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
