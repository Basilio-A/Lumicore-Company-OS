import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, ShieldCheck, Mail, Phone, UserCheck, Check, X, Users, Eye, EyeOff } from 'lucide-react';
import { supabase, type Profile, type AccountRequest } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Avatar, Badge, Card, EmptyState, Modal, Input, Textarea, Select } from '@/components/ui';
import { ImageUpload } from '@/components/ImageUpload';

const SECTIONS: { key: Profile['role']; label: string; color: string }[] = [
  { key: 'founder', label: 'Founders', color: '#6C63FF' },
  { key: 'investor', label: 'Investors', color: '#10B981' },
  { key: 'shareholder', label: 'Shareholders', color: '#F59E0B' },
  { key: 'employee', label: 'Employees', color: '#3B82F6' },
];

const ROLE_OPTIONS: { key: Profile['role']; label: string }[] = [
  { key: 'founder', label: 'Founder / Executive' },
  { key: 'investor', label: 'Investor' },
  { key: 'shareholder', label: 'Shareholder' },
  { key: 'employee', label: 'Employee' },
];

export default function TeamHubPage() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [addingRole, setAddingRole] = useState<Profile['role'] | null>(null);

  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const { data: profs } = await supabase.from('profiles').select('*').eq('status', 'active').order('full_name');
    setPeople(profs || []);
    if (isFounder) {
      const { data: reqs } = await supabase.from('account_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      setRequests(reqs || []);
    }
  };

  useEffect(() => { load(); }, [isFounder]);

  const approveRequest = async (req: AccountRequest) => {
    // Create the Supabase auth user with the password they chose, then activate
    const { error } = await supabase.rpc('admin_approve_request', { p_request_id: req.id });
    if (error) {
      // Fallback: if the auth user already exists, just activate the profile
      const { data: existing } = await supabase.from('profiles').select('id').eq('email', req.email).maybeSingle();
      if (existing) {
        await supabase.rpc('admin_set_profile_status', { p_id: existing.id, p_status: 'active' });
      }
      await supabase.from('account_requests').update({
        status: 'approved',
        reviewed_by: profile?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);
    }
    load();
  };

  const rejectRequest = async (req: AccountRequest) => {
    await supabase.from('account_requests').update({ status: 'rejected', reviewed_by: profile?.id, reviewed_at: new Date().toISOString() }).eq('id', req.id);
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  const grouped = SECTIONS.map((s) => ({ ...s, members: people.filter((p) => p.role === s.key) })).filter((g) => g.members.length > 0);

  return (
    <PageContainer title="Team Hub" actions={isFounder && (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAddingRole('founder')}><ShieldCheck className="w-4 h-4" /> Add Founder</Button>
        <Button size="sm" onClick={() => setAddingRole('employee')}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>
    )}>
      <p className="text-sm text-muted -mt-2 mb-6">Full company roster — everyone at Lumicore.</p>

      {isFounder && requests.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold text-[var(--text)] mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4 accent" /> Pending Access Requests</h3>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2.5">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text)]">{r.full_name}</div>
                  <div className="text-xs text-muted">{r.email} {r.title && `· ${r.title}`}</div>
                  {r.message && <div className="text-xs text-muted mt-1 italic">"{r.message}"</div>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => approveRequest(r)}><Check className="w-3.5 h-3.5" /> Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => rejectRequest(r)} className="text-rose-500"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {grouped.length === 0 ? (
        <Card className="p-8"><EmptyState icon={<Users className="w-8 h-8" />} title="No team members yet" description={isFounder ? 'Add members or approve access requests.' : 'Members will appear here.'} /></Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wider">{g.label}</h2>
                <span className="text-xs text-muted">({g.members.length})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.members.map((p) => (
                  <Card key={p.id} className="p-4 group cursor-pointer hover:shadow-soft-lg transition-shadow" onClick={() => isFounder && setEditingMember(p)}>
                    <div className="flex items-start gap-3">
                      <Avatar name={p.full_name} src={p.avatar_url} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[var(--text)] truncate">{p.full_name}</div>
                        <div className="text-sm text-muted truncate">{p.title || 'No title set'}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge color={g.color}>{p.role}</Badge>
                          {p.role === 'founder' && <ShieldCheck className="w-3.5 h-3.5 accent" />}
                        </div>
                      </div>
                      {isFounder && <Pencil className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                    {p.bio && <p className="text-xs text-muted mt-3 line-clamp-2">{p.bio}</p>}
                    <div className="mt-3 pt-3 border-t border-app space-y-1.5 text-xs text-muted">
                      <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> {p.email}</div>
                      {p.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {p.phone}</div>}
                      {p.department && <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-wider">Dept:</span> {p.department}</div>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(editingMember || addingRole) && (
        <MemberEditor
          member={editingMember}
          defaultRole={addingRole || 'employee'}
          onClose={() => { setEditingMember(null); setAddingRole(null); }}
          onSaved={() => { setEditingMember(null); setAddingRole(null); load(); }}
        />
      )}
    </PageContainer>
  );
}

function MemberEditor({ member, defaultRole, onClose, onSaved }: {
  member: Profile | null;
  defaultRole: Profile['role'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(member?.full_name || '');
  const [email, setEmail] = useState(member?.email || '');
  const [title, setTitle] = useState(member?.title || (defaultRole === 'founder' ? 'Founder' : ''));
  const [role, setRole] = useState<Profile['role']>(member?.role || defaultRole);
  const [phone, setPhone] = useState(member?.phone || '');
  const [department, setDepartment] = useState(member?.department || '');
  const [bio, setBio] = useState(member?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(member?.avatar_url || '');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const creating = !member;

  const save = async () => {
    if (!fullName.trim() || !email.trim()) return;
    setSaving(true);
    setError('');
    if (member) {
      const { error } = await supabase.rpc('admin_update_profile', {
        p_id: member.id,
        p_full_name: fullName.trim(),
        p_title: title.trim() || null,
        p_role: role,
        p_phone: phone || null,
        p_department: department || null,
        p_bio: bio || null,
        p_avatar_url: avatarUrl || null,
      });
      setSaving(false);
      if (error) { setError(error.message); return; }
    } else {
      if (password.length < 8) { setError('Password must be at least 8 characters.'); setSaving(false); return; }
      if (password !== confirmPw) { setError('Passwords do not match.'); setSaving(false); return; }
      const { error } = await supabase.rpc('admin_create_user', {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: fullName.trim(),
        p_role: role,
        p_title: title.trim() || '',
        p_phone: phone || '',
        p_department: department || '',
        p_bio: bio || '',
        p_avatar_url: avatarUrl || '',
      });
      setSaving(false);
      if (error) { setError(error.message); return; }
    }
    onSaved();
  };

  const del = async () => {
    if (!member) return;
    await supabase.rpc('admin_set_profile_status', { p_id: member.id, p_status: 'rejected' });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={member ? 'Edit Member' : role === 'founder' ? 'Add Founder' : 'Add Member'} className="max-w-lg">
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        {creating && (
          <p className="text-xs text-muted -mt-1">
            This creates a login they can use immediately. Share the email and password with them.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Full name</label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Email</label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@lumicore.com" disabled={!!member} /></div>
        </div>
        {creating && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" className="pr-10" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text)]">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Confirm password</label>
              <Input type={showPw ? 'text' : 'password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Re-enter password" />
              {confirmPw && password !== confirmPw && <p className="text-[11px] text-rose-500 mt-1">Passwords do not match</p>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Title / Role</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CEO, CTO, Engineer…" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Role type</label><Select value={role} onChange={(e) => setRole(e.target.value as Profile['role'])}>{ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</Select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-muted mb-1.5">Phone</label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251…" /></div>
          <div><label className="block text-xs font-medium text-muted mb-1.5">Department</label><Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering, Product…" /></div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-2">Profile photo</label>
          <ImageUpload
            bucket="avatars"
            value={avatarUrl || null}
            onChange={(url) => setAvatarUrl(url || '')}
            shape="circle"
            size="lg"
            label="Upload photo"
            placeholder={<Avatar name={fullName || '?'} size="lg" />}
          />
        </div>
        <div><label className="block text-xs font-medium text-muted mb-1.5">Bio</label><Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Brief background and expertise…" /></div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {member ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Deactivate</Button> : <div />}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !fullName.trim() || !email.trim() || (creating && (password.length < 8 || password !== confirmPw))}
          >
            {saving ? 'Saving…' : creating ? 'Create account' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
