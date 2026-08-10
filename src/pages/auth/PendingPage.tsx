import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/AuthShell';
import { Button } from '@/components/ui';

export default function PendingPage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)]">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center">
          <Logo size="md" />
        </div>
        <div className="rounded-2xl surface shadow-soft p-8">
          <div className="w-12 h-12 rounded-full accent-tint-bg flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⏳</span>
          </div>
          <h1 className="font-display font-semibold text-lg text-[var(--text)]">
            Account pending approval
          </h1>
          <p className="text-sm text-muted mt-2">
            Hi{profile?.full_name ? `, ${profile.full_name}` : ''}. Your account
            is awaiting a founder's approval. You'll get access as soon as it's
            approved.
          </p>
          <Button variant="secondary" size="sm" className="mt-5" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
