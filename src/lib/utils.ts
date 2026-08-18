import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ETB_RATE = 145; // approx USD->ETB
export const USD_TO_ETB = ETB_RATE;

export function formatCurrency(
  usd: number,
  currency: 'USD' | 'ETB'
): string {
  if (currency === 'ETB') {
    const etb = usd * ETB_RATE;
    return `Br ${etb.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? 'UTC' : undefined,
  });
}

/** Calendar due dates are overdue only after that day has ended. */
export function isPastDueDate(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const due =
    typeof dueDate === 'string'
      ? dueDate.slice(0, 10)
      : `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return due < today;
}

export function formatRelative(d: string | Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absMin = Math.abs(diff) / 60000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (absMin < 60) return rtf.format(Math.round(diff / 60000), 'minute');
  if (absMin < 60 * 24) return rtf.format(Math.round(diff / 3600000), 'hour');
  if (absMin < 60 * 24 * 30)
    return rtf.format(Math.round(diff / 86400000), 'day');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-600',
  'bg-orange-600',
  'bg-emerald-600',
  'bg-cyan-600',
  'bg-indigo-600',
];

export function avatarColor(seed: string): string {
  // djb2-style hash for better distribution
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
