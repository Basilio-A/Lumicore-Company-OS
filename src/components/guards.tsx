import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/AuthShell';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <Logo size="md" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && profile.status === 'pending' && profile.role !== 'founder') {
    return <Navigate to="/pending" replace />;
  }

  if (profile && profile.status === 'rejected') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RequireFounder({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (profile?.role !== 'founder') return <Navigate to="/overview" replace />;
  return <>{children}</>;
}
