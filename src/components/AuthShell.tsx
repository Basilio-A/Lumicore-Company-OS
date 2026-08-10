import { type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export function Logo({
  size = 'md',
  showWordmark = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}) {
  const sizes = {
    sm: { dot: 'w-2 h-2', text: 'text-base' },
    md: { dot: 'w-2.5 h-2.5', text: 'text-lg' },
    lg: { dot: 'w-3 h-3', text: 'text-2xl' },
  };
  return (
    <div className="flex items-center gap-1.5 font-display font-bold tracking-tight text-[var(--text)]">
      {showWordmark && <span className={sizes[size].text}>Lumicore</span>}
      <span className={`${sizes[size].dot} rounded-full accent-bg shrink-0`} />
    </div>
  );
}

export function GoogleButton({ onError }: { onError?: (msg: string) => void }) {
  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/overview` },
    });
    if (error && onError) onError(error.message);
  };

  return (
    <button
      type="button"
      onClick={handleGoogle}
      className="w-full flex items-center justify-center gap-2.5 rounded-lg surface border border-app px-3.5 py-2.5 text-sm font-medium text-[var(--text)] hover:surface-2 transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Continue with Google
    </button>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  showGoogle = false,
  themeToggle = false,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  showGoogle?: boolean;
  themeToggle?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg)]">
      {themeToggle && <AuthThemeToggle />}
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="md" />
        </div>
        <div className="rounded-2xl surface shadow-soft p-6">
          <h1 className="font-display font-semibold text-lg text-[var(--text)]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted mt-1 mb-5">{subtitle}</p>
          )}
          {showGoogle && (
            <>
              <GoogleButton />
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] text-muted uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
            </>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthThemeToggle() {
  const apply = (t: 'light' | 'dark') => {
    const root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('lumicore_theme', t);
    window.dispatchEvent(new Event('lumicore-theme-change'));
  };
  const current = (localStorage.getItem('lumicore_theme') as 'light' | 'dark') || 'light';
  return (
    <button
      onClick={() => apply(current === 'dark' ? 'light' : 'dark')}
      className="fixed top-5 right-5 p-2.5 rounded-lg surface border border-app text-muted hover:text-[var(--text)] hover:surface-2 transition-colors"
      title="Toggle theme"
    >
      {current === 'dark' ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  );
}
