import { useEffect, useState } from 'react';
import { Mail, Phone, UserPlus, Trash2 } from 'lucide-react';
import { supabase, type Profile, type ProductMember, type ProductRole } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Avatar, Badge, Card, EmptyState, Modal, Select } from '@/components/ui';

const ROLE_OPTIONS: { key: ProductRole; label: string }[] = [
  { key: 'lead', label: 'Team Lead' },
  { key: 'task_coordinator', label: 'Task Coordinator' },
  { key: 'developer', label: 'Developer' },
  { key: 'designer', label: 'Designer' },
  { key: 'product_manager', label: 'Product Manager' },
  { key: 'qa_engineer', label: 'QA Engineer' },
  { key: 'data_scientist', label: 'Data Scientist' },
  { key: 'ml_engineer', label: 'ML Engineer' },
  { key: 'devops', label: 'DevOps' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'sales', label: 'Sales' },
  { key: 'operations', label: 'Operations' },
  { key: 'member', label: 'Member' },
];

export default function ProductTeamPage() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();
  const [members, setMembers] = useState<(ProductMember & { profile: Profile })[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!product) return;
    (async () => {
      const { data: pms } = await supabase.from('product_members').select('*').eq('product_id', product.id);
      const memberIds = (pms || []).map((pm) => pm.user_id);
      if (memberIds.length === 0) { setMembers([]); return; }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', memberIds);
      const profMap = new Map((profiles || []).map((p) => [p.id, p as Profile]));
      setMembers((pms || []).map((pm) => ({ ...pm, profile: profMap.get(pm.user_id)! })).filter((m) => m.profile));
    })();
  }, [product]);

  useEffect(() => {
    if (profile?.role === 'founder') {
      supabase.from('profiles').select('*').eq('status', 'active').then(({ data }) => setAllProfiles(data || []));
    }
  }, [profile]);

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  const isFounder = profile?.role === 'founder';
  const nonMembers = allProfiles.filter((p) => !members.some((m) => m.user_id === p.id));

  const removeMember = async (userId: string) => {
    await supabase.from('product_members').delete().eq('product_id', product.id).eq('user_id', userId);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const updateRole = async (userId: string, role: ProductRole) => {
    await supabase.from('product_members').update({ product_role: role }).eq('product_id', product.id).eq('user_id', userId);
    setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, product_role: role } : m));
  };

  return (
    <PageContainer title={`${product.name} Team`} actions={isFounder && <Button size="sm" onClick={() => setAdding(true)}><UserPlus className="w-4 h-4" /> Add Member</Button>}>
      <p className="text-sm text-muted -mt-2 mb-4">People assigned to {product.name}. Task Coordinators can assign people on the task board.</p>
      {members.length === 0 ? (
        <Card className="p-8"><EmptyState title="No team members yet" description={isFounder ? "Add people to this product's team." : 'No one is assigned to this product yet.'} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <Card key={m.user_id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={m.profile.full_name} src={m.profile.avatar_url} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[var(--text)] truncate">{m.profile.full_name}</div>
                  <div className="text-sm text-muted truncate">{m.profile.title || m.profile.role}</div>
                  {isFounder ? (
                    <Select value={m.product_role} onChange={(e) => updateRole(m.user_id, e.target.value as ProductRole)} className="mt-1.5 text-xs py-1 w-auto">
                      {ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </Select>
                  ) : (
                    <Badge className="mt-1.5 surface-2 text-muted">{ROLE_OPTIONS.find((r) => r.key === m.product_role)?.label || m.product_role}</Badge>
                  )}
                </div>
                {isFounder && <button onClick={() => removeMember(m.user_id)} className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:surface-2"><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="mt-3 pt-3 border-t border-app space-y-1.5 text-xs text-muted">
                <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {m.profile.email}</div>
                {m.profile.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {m.profile.phone}</div>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {adding && <AddMemberModal product={product} candidates={nonMembers} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); window.location.reload(); }} />}
    </PageContainer>
  );
}

function AddMemberModal({ product, candidates, onClose, onAdded }: { product: { id: string }; candidates: Profile[]; onClose: () => void; onAdded: () => void }) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ProductRole>('developer');
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!userId) return;
    setSaving(true);
    await supabase.from('product_members').insert({ product_id: product.id, user_id: userId, product_role: role });
    setSaving(false);
    onAdded();
  };
  return (
    <Modal open onClose={onClose} title="Add Team Member">
      <div className="p-5 space-y-4">
        <div><label className="block text-xs font-medium text-muted mb-1.5">Person</label>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select someone…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.title || p.role}</option>)}
          </Select>
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Role</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as ProductRole)}>
            {ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={add} disabled={saving || !userId}>{saving ? 'Adding…' : 'Add'}</Button></div>
    </Modal>
  );
}
