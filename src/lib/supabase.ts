import { createClient } from '@supabase/supabase-js';

function envString(value: unknown) {
  return String(value ?? '').trim();
}

function jwtProjectRef(anonKey: string) {
  try {
    const payload = anonKey.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.ref === 'string' ? json.ref : null;
  } catch {
    return null;
  }
}

function hostProjectRef(url: string) {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

const supabaseUrl = envString(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const supabaseAnonKey = envString(import.meta.env.VITE_SUPABASE_ANON_KEY);
const loadedViteKeys = Object.keys(import.meta.env).filter((key) => key.startsWith('VITE_'));

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabase] Env vars were not loaded', {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    viteKeys: loadedViteKeys,
  });
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Put them in .env at the project root and restart npm run dev.',
  );
}

const urlRef = hostProjectRef(supabaseUrl);
const keyRef = jwtProjectRef(supabaseAnonKey);

if (!urlRef) {
  console.error('[supabase] Invalid project URL (expected https://<ref>.supabase.co)', supabaseUrl);
}

if (urlRef && keyRef && urlRef !== keyRef) {
  console.error('[supabase] URL project ref does not match anon key ref', { url: supabaseUrl, urlRef, keyRef });
}

console.info('[supabase] Client target', {
  url: supabaseUrl,
  projectRef: urlRef,
  keyRef,
  hasAnonKey: true,
});

async function loggedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      console.warn('[supabase] HTTP error', { target, status: response.status, statusText: response.statusText });
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[supabase] Fetch failed', { target, message });
    throw new TypeError(
      `Failed to fetch ${target}. The project URL in .env must be a live Supabase project (paused projects do not resolve in DNS).`,
    );
  }
}

if (import.meta.env.DEV) {
  fetch(`${supabaseUrl}/auth/v1/health`, { method: 'GET' })
    .then((res) => {
      console.info('[supabase] Health check', { url: `${supabaseUrl}/auth/v1/health`, status: res.status });
    })
    .catch((error) => {
      console.error('[supabase] Health check failed', {
        url: `${supabaseUrl}/auth/v1/health`,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: loggedFetch,
  },
});

export type Role = 'founder' | 'admin' | 'employee' | 'investor' | 'shareholder';

export function canManageProducts(role?: Role | null) {
  return role === 'founder' || role === 'admin';
}
export type ProfileStatus = 'active' | 'pending' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  title: string;
  role: Role;
  status: ProfileStatus;
  avatar_url: string | null;
  phone: string | null;
  department: string | null;
  bio: string | null;
  created_at: string;
}

export interface ProductQuote {
  text: string;
  author: string;
}

export const DEFAULT_PRODUCT_QUOTES: ProductQuote[] = [
  { text: 'The best way to predict the future is to invent it.', author: 'Alan Kay' },
  { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
  { text: 'Make it simple, but significant.', author: 'Don Draper' },
];

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  phase: 'ideation' | 'mvp' | 'growth' | 'scale' | 'mature';
  logo_url: string | null;
  website: string | null;
  status: 'active' | 'paused' | 'archived';
  quotes: ProductQuote[];
  created_at: string;
}

export function productQuotes(product: Pick<Product, 'quotes'>): ProductQuote[] {
  const raw = Array.isArray(product.quotes) ? product.quotes : [];
  const filled = raw.length > 0 ? [...raw] : [...DEFAULT_PRODUCT_QUOTES];
  while (filled.length < 3) filled.push({ text: '', author: '' });
  return filled.slice(0, 3).map((q) => ({
    text: typeof q?.text === 'string' ? q.text : '',
    author: typeof q?.author === 'string' ? q.author : '',
  }));
}

export type ProductRole = 'lead' | 'member' | 'developer' | 'designer' | 'product_manager' | 'qa_engineer' | 'data_scientist' | 'ml_engineer' | 'devops' | 'marketing' | 'sales' | 'operations' | 'task_coordinator';

export interface ProductMember {
  id: string;
  product_id: string;
  user_id: string;
  product_role: ProductRole;
  created_at: string;
}

export interface Sprint {
  id: string;
  product_id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed';
  created_at: string;
}

export interface Task {
  id: string;
  product_id: string;
  sprint_id: string | null;
  title: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignee {
  task_id: string;
  user_id: string;
  created_at: string;
}

export interface Doc {
  id: string;
  product_id: string;
  title: string;
  content: string;
  folder: string | null;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface KbEntry {
  id: string;
  product_id: string | null;
  title: string;
  content: string;
  category: 'note' | 'interview' | 'book' | 'reference' | 'other';
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChatChannel {
  id: string;
  product_id: string | null;
  name: string;
  type: 'channel' | 'dm';
  created_at: string;
}

export type ChatAttachmentKind = 'image' | 'audio' | 'voice' | 'video' | 'document' | 'other';

export interface ChatAttachment {
  id: string;
  url: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: ChatAttachmentKind;
  duration?: number | null;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  attachments: ChatAttachment[];
  mentions: string[];
  created_at: string;
}

export interface Kudos {
  id: string;
  product_id: string | null;
  from_user_id: string;
  to_user_id: string;
  reason: string | null;
  points: number;
  created_at: string;
}

export interface EquityHolding {
  id: string;
  holder_name: string;
  user_id: string | null;
  shares: number;
  share_class: 'common' | 'preferred' | 'options' | 'warrants';
  vesting_years: number;
  cliff_years: number;
  vesting_start: string | null;
  notes: string | null;
  investment_amount_usd: number | null;
  created_at: string;
}

export interface InvestorMemo {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TechStackEntry {
  id: string;
  product_id: string;
  category: 'infrastructure' | 'saas' | 'tooling' | 'api' | 'frontend' | 'backend' | 'database' | 'hosting' | 'devtools' | 'other';
  name: string;
  description: string | null;
  cost_type: 'free' | 'monthly' | 'per_user' | 'annual' | 'one_time';
  monthly_cost: number;
  per_user_cost: number;
  contract_end: string | null;
  created_at: string;
}

export interface AccountRequest {
  id: string;
  email: string;
  full_name: string;
  title: string;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  approval_code: string | null;
  created_at: string;
}

export interface InvestorReport {
  id: string;
  title: string;
  period: string;
  summary: string;
  highlights: string;
  metrics: string;
  challenges: string;
  financials: string;
  next_steps: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CompanySettings {
  id: string;
  total_equity_value_usd: number;
  share_price_usd: number;
  total_shares_issued: number;
  updated_at: string;
}

export interface Expense {
  id: string;
  product_id: string | null;
  category: 'rent' | 'employees' | 'materials' | 'tech_stack' | 'marketing' | 'operations' | 'other';
  description: string;
  amount_usd: number;
  expense_date: string;
  is_recurring: boolean;
  recurring_period: 'monthly' | 'quarterly' | 'annually' | null;
  created_by: string;
  created_at: string;
}

export interface InvestorDocument {
  id: string;
  title: string;
  description: string;
  file_url: string;
  doc_type: 'report' | 'financial' | 'legal' | 'presentation' | 'other';
  created_by: string;
  created_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface AiConversation {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}
