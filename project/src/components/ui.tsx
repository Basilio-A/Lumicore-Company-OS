import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { cn, initials, avatarColor } from '@/lib/utils';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'icon';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        size === 'sm' && 'text-xs px-2.5 py-1.5',
        size === 'md' && 'text-sm px-3.5 py-2',
        size === 'icon' && 'p-2',
        variant === 'primary' && 'accent-bg text-white hover:opacity-90',
        variant === 'secondary' &&
          'surface text-[var(--text)] hover:surface-2',
        variant === 'ghost' && 'text-[var(--text-muted)] hover:text-[var(--text)] hover:surface-2',
        variant === 'danger' && 'bg-rose-500 text-white hover:bg-rose-600',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg surface px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg surface px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] resize-y',
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg surface px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className={cn('rounded-xl surface shadow-soft', className)} onClick={onClick}>{children}</div>
  );
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
  };
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-semibold shrink-0',
        avatarColor(name || '?'),
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}

export function Badge({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
        className
      )}
      style={
        color
          ? { backgroundColor: `${color}1a`, color }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-2xl surface shadow-soft-lg animate-scale-in',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-5 py-4 border-b border-app">
            <h3 className="font-semibold text-base">{title}</h3>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      {icon && <div className="mb-3 text-[var(--text-muted)]">{icon}</div>}
      <h3 className="font-semibold text-[var(--text)]">{title}</h3>
      {description && (
        <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
