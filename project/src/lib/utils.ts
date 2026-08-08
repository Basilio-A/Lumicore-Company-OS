import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ETB_RATE = 145; // approx USD->ETB
export const USD_TO_ETB = ETB_RATE;

export function formatCurrency(
  amount: number,
  currency: 'USD' | 'ETB'
): string {
  // amount is already in the target currency — no conversion done here
  if (currency === 'ETB') {
    return `Br ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
