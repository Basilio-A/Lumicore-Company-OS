import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Role = 'founder' | 'employee' | 'investor' | 'shareholder';
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
  created_at: string;
}

export type ProductRole = 'lead' | 'member' | 'developer' | 'designer' | 'product_manager' | 'qa_engineer' | 'data_scientist' | 'ml_engineer' | 'devops' | 'marketing' | 'sales' | 'operations';

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

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
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
