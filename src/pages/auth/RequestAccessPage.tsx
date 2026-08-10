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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
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
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);

    // Store the plaintext password in account_requests so the founder-approval
    // edge function can call supabase.auth.admin.createUser() with it.
    // This is acceptable because the table is founder-read-only via RLS and the
    // password will be cleared once the auth user is created.
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
      <AuthShell title="Request submitted" subtitle="Your access request is in." showGoogle={false} themeToggle>
        <div className="space-y-3 text-sm text-muted">
          <p>
            A founder will review your request. Once approved, your account will
            be created automatically and you can sign in with the email and
            password you just set.
          </p>
          <p className="font-medium text-[var(--text)]">
            You'll receive an email when your account is ready.
          </p>
        </div>
        <div className="mt-5">
          <Link to="/login" className="text-xs accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Request access"
      subtitle="Submit a request — a founder will review and approve it."
      showGoogle={false}
      themeToggle
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Work email</label>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@lumicore.com" />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Choose a password</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
          <Input
            type={showPassword ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-rose-500 mt-1">Passwords do not match</p>
          )}
        </div>

        {/* Role picker */}
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

        {/* Note */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Note (optional)</label>
          <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything you'd like the founders to know" />
        </div>

        <Button type="submit" className="w-full" disabled={loading || (!!confirmPassword && password !== confirmPassword)}>
          {loading ? 'Submitting…' : 'Submit request'}
        </Button>
      </form>

      <div className="mt-4 text-xs text-muted">
        <Link to="/login" className="accent hover:underline">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
