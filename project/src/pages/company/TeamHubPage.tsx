import { useEffect, useState, useRef } from 'react';
import {
  Plus, Trash2, Pencil, ShieldCheck, Mail, Phone, UserCheck,
  Check, X, KeyRound, Users, ChevronDown, ChevronUp, Upload, Camera,
} from 'lucide-react';
import { supabase, type Profile, type AccountRequest, type Product } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Button, Avatar, Badge, Card, EmptyState, Modal, Input, Textarea, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

const ROLE_COLORS: Record<Profile['role'], string> = {
  founder: '#6C63FF',
  investor: '#10B981',
  shareholder: '#F59E0B',
  employee: '#3B82F6',
};

const SECTIONS: { key: Profile['role']; label: string }[] = [
  { key: 'founder', label: 'Founders' },
  { key: 'investor', label: 'Investors' },
  { key: 'shareholder', label: 'Shareholders' },
  { key: 'employee', label: 'Employees' },
];

const ROLE_OPTIONS: { key: Profile['role']; label: string }[] = [
  { key: 'founder', label: 'Founder / Executive' },
  { key: 'investor', label: 'Investor' },
  { key: 'shareholder', label: 'Shareholder' },
  { key: 'employee', label: 'Employee' },
];

const WORKS_AS_OPTIONS = [
  'CEO', 'CTO', 'COO', 'CFO', 'CPO', 'CMO',
  'VP Engineering', 'VP Product', 'VP Sales', 'VP Marketing',
  'Software Engineer', 'Senior Engineer', 'Lead Engineer',
  'ML Engineer', 'Data Scientist', 'Data Analyst',
  'Product Manager', 'Product Designer', 'UX Designer', 'UI Designer',
  'DevOps Engineer', 'Platform Engineer', 'SRE',
  'QA Engineer', 'Sales', 'Account Executive', 'Marketing',
  'Growth', 'Operations', 'HR', 'Finance', 'Legal', 'Intern',
];

export default function TeamHubPage() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Profile | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const isFounder = profile?.role === 'founder';

  const load = async () => {
    const { data: profs } = await supabase.from('profiles').select('*').eq('status', 'active').order('full_name');
    setPeople(profs || []);
    const { data: prods } = await supabase.from('products').select('*').order('name');
    setProducts(prods || []);
    if (isFounder) {
      const { data: reqs } = await supabase.from('account_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false });
      setRequests(reqs || []);
    }
  };

  useEffect(() => { load(); }, [isFounder]);

  const approveRequest = async (req: AccountRequest) => {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', req.email).maybeSingle();
    if (existing) {
      await supabase.rpc('admin_set_profile_status', { p_id: existing.id, p_status: 'active' });
    }
    await supabase.from('account_requests').update({
      status: 'approved',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    load();
  };

  const rejectRequest = async (req: AccountRequest) => {
    await supabase.from('account_requests').update({
      status: 'rejected',
      reviewed_by: profile?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  const createInvite = async () => {
    const { data } = await supabase.rpc('admin_create_founder_invite');
    setInviteCode(data as string);
  };

  const grouped = SECTIONS
    .map((s) => ({ ...s, color: ROLE_COLORS[s.key], members: people.filter((p) => p.role === s.key) }))
    .filter((g) => g.members.length > 0);

  return (
    <PageContainer title="Team Hub" actions={isFounder && (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={createInvite}><KeyRound className="w-4 h-4" /> Founder Invite</Button>
        <Button size="sm" onClick={() => setAddingMember(true)}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>
    )}>
      <p className="text-sm text-muted -mt-2 mb-6">Full company roster — everyone at Lumicore.</p>

      {isFounder && requests.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
            <UserCheck className="w-4 h-4 accent" /> Pending Access Requests
          </h3>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2.5">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--text)]">{r.full_name}</div>
                  <div className="text-xs text-muted">{r.email} {r.title && `· ${r.title}`}</div>
                  {r.message && <div className="text-xs text-muted mt-1 italic">"{r.message}"</div>}
                  {(r as any).desired_password && (
                    <div className="text-xs text-emerald-600 mt-0.5">Password set — account will be activated on approval</div>
                  )}
                </div>
                <Button size="sm" variant="secondary" onClick={() => approveRequest(r)}><Check className="w-3.5 h-3.5" /> Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => rejectRequest(r)} className="text-rose-500"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {grouped.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<Users className="w-8 h-8" />} title="No team members yet"
            description={isFounder ? 'Add members or approve access requests.' : 'Members will appear here.'} />
        </Card>
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
                  <Card key={p.id} className="p-4 group cursor-pointer hover:shadow-soft-lg transition-shadow"
                    onClick={() => isFounder && setEditingMember(p)}>
                    <div className="flex items-start gap-3">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt={p.full_name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                      ) : (
                        <Avatar name={p.full_name} size="lg" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[var(--text)] truncate">{p.full_name}</div>
                        <div className="text-sm text-muted truncate">{p.title || 'No title set'}</div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
                      {p.department && <div className="flex items-center gap-2"><span className="opacity-60">Assigned:</span> {p.department}</div>}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {inviteCode && (
        <Modal open onClose={() => setInviteCode(null)} title="Founder Invite Code">
          <div className="p-5">
            <p className="text-sm text-muted mb-3">Share this code with the new founder. It's single-use.</p>
            <div className="rounded-lg surface-2 p-4 text-center font-mono text-lg font-bold accent break-all">{inviteCode}</div>
          </div>
        </Modal>
      )}

      {(editingMember || addingMember) && (
        <MemberEditor
          member={editingMember}
          products={products}
          onClose={() => { setEditingMember(null); setAddingMember(false); }}
          onSaved={() => { setEditingMember(null); setAddingMember(false); load(); }}
        />
      )}
    </PageContainer>
  );
}

/* ── Avatar upload with pan/position ───────────────────────────────── */
function AvatarUpload({ currentUrl, name, onUploaded }: {
  currentUrl: string; name: string; onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(currentUrl);
  // objectPosition for the circle crop pan
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handleFile = async (file: File) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setPos({ x: 50, y: 50 });
    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `avatars/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setPreviewUrl(data.publicUrl);
      onUploaded(data.publicUrl);
    }
    setUploading(false);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!previewUrl) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPos((p) => ({
      x: Math.max(0, Math.min(100, p.x - dx * 0.5)),
      y: Math.max(0, Math.min(100, p.y - dy * 0.5)),
    }));
  };
  const onMouseUp = () => { dragging.current = false; };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-app cursor-grab active:cursor-grabbing select-none group"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={name}
            draggable={false}
            className="w-full h-full object-cover"
            style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
          />
        ) : (
          <Avatar name={name || 'U'} size="lg" className="w-full h-full rounded-full" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
          <Camera className="w-5 h-5 text-white" />
        </div>
      </div>
      {previewUrl && <p className="text-[10px] text-muted">Drag to reposition</p>}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-[var(--text)] transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        {uploading ? 'Uploading…' : 'Upload photo'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}

/* ── Works-as toggle dropdown ───────────────────────────────────────── */
function WorksAsSelector({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };
  const addCustom = () => {
    const t = custom.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setCustom('');
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-lg surface-2 border border-app px-3 py-2 text-sm text-[var(--text)] hover:opacity-80"
      >
        <span className="truncate">{selected.length > 0 ? selected.join(', ') : 'Select functions…'}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted shrink-0" />}
      </button>
      {open && (
        <div className="mt-1 rounded-xl border border-app surface shadow-soft-lg p-3 space-y-2 max-h-52 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {WORKS_AS_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border',
                  selected.includes(opt)
                    ? 'accent-bg text-white border-transparent'
                    : 'surface text-muted border-app hover:text-[var(--text)]'
                )}
              >
                {selected.includes(opt) && <Check className="w-3 h-3 inline mr-1" />}
                {opt}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-1 border-t border-app">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
              placeholder="Custom role…"
              className="flex-1 rounded-lg surface border border-app px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            />
            <button type="button" onClick={addCustom} className="rounded-lg accent-bg text-white px-2.5 py-1.5 text-xs font-medium">Add</button>
          </div>
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md surface-2 px-2 py-0.5 text-xs text-[var(--text)]">
              {s}
              <button type="button" onClick={() => toggle(s)} className="text-muted hover:text-rose-500">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Product assignment toggle ──────────────────────────────────────── */
function ProductAssignment({ selected, onChange, products }: {
  selected: string; onChange: (v: string) => void; products: Product[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange('')}
        className={cn(
          'rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors',
          selected === ''
            ? 'accent-bg text-white border-transparent'
            : 'surface text-muted border-app hover:text-[var(--text)]'
        )}
      >
        None
      </button>
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onChange(p.name)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors flex items-center gap-1.5',
            selected === p.name
              ? 'text-white border-transparent'
              : 'surface text-muted border-app hover:text-[var(--text)]'
          )}
          style={selected === p.name ? { backgroundColor: p.color } : {}}
        >
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}
        </button>
      ))}
    </div>
  );
}

/* ── Member editor modal ────────────────────────────────────────────── */
function MemberEditor({ member, products, onClose, onSaved }: {
  member: Profile | null; products: Product[]; onClose: () => void; onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(member?.full_name || '');
  const [email, setEmail] = useState(member?.email || '');
  const [role, setRole] = useState<Profile['role']>(member?.role || 'employee');
  const [phone, setPhone] = useState(member?.phone || '');
  const [assignedProduct, setAssignedProduct] = useState(member?.department || '');
  const [bio, setBio] = useState(member?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(member?.avatar_url || '');
  // Works-as stored in title field (comma-separated) since works_as column may not exist yet
  const [worksAs, setWorksAs] = useState<string[]>(
    member?.title ? member.title.split(',').map((s) => s.trim()).filter(Boolean) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!fullName.trim() || !email.trim()) return;
    setSaving(true);
    setError('');
    let result;
    if (member) {
      // Use SECURITY DEFINER RPC to bypass RLS column-level restrictions
      const { error: rpcErr } = await supabase.rpc('admin_update_profile', {
        p_id: member.id,
        p_full_name: fullName.trim(),
        p_title: worksAs.join(', ') || null,
        p_role: role,
        p_phone: phone || null,
        p_department: assignedProduct || null,
        p_bio: bio || null,
        p_avatar_url: avatarUrl || null,
      });
      result = { error: rpcErr };
    } else {
      // Use SECURITY DEFINER RPC to bypass RLS INSERT restriction
      const { error: rpcErr } = await supabase.rpc('admin_insert_profile', {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_title: worksAs.join(', ') || '',
        p_role: role,
        p_phone: phone || null,
        p_department: assignedProduct || null,
        p_bio: bio || null,
        p_avatar_url: avatarUrl || null,
      });
      result = { error: rpcErr };
    }
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSaved();
  };

  const del = async () => {
    if (!member) return;
    await supabase.rpc('admin_set_profile_status', { p_id: member.id, p_status: 'rejected' });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={member ? 'Edit Member' : 'Add Member'} className="max-w-lg">
      <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}

        <AvatarUpload currentUrl={avatarUrl} name={fullName} onUploaded={setAvatarUrl} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Full name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@lumicore.com" disabled={!!member} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Role type</label>
          <Select value={role} onChange={(e) => setRole(e.target.value as Profile['role'])}>
            {ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Works as (functions)</label>
          <WorksAsSelector selected={worksAs} onChange={setWorksAs} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251…" />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Assigned to product</label>
          <ProductAssignment selected={assignedProduct} onChange={setAssignedProduct} products={products} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Bio</label>
          <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Brief background and expertise…" />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-app flex items-center justify-between">
        {member
          ? <Button variant="ghost" size="sm" onClick={del} className="text-rose-500"><Trash2 className="w-4 h-4" /> Deactivate</Button>
          : <div />}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !fullName.trim() || !email.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
