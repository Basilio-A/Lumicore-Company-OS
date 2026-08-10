import { useEffect, useState, useRef, useCallback } from 'react';
import { Hash, Send, Plus, Users as UsersIcon, X, Trash2, UserPlus, MessageSquare, MessageCircle } from 'lucide-react';
import { supabase, type ChatChannel, type ChatMessage, type Profile } from '@/lib/supabase';
import { useProduct } from '@/hooks/useProduct';
import { useAuth } from '@/context/AuthContext';
import { PageContainer } from '@/components/AppLayout';
import { Input, Modal, Button, Avatar, EmptyState } from '@/components/ui';
import { formatRelative, cn } from '@/lib/utils';

export default function ChatPage() {
  const { product, loading, accessDenied } = useProduct();
  const { profile } = useAuth();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, Profile>>({});
  const [channelMembers, setChannelMembers] = useState<Profile[]>([]);
  const [channelMemberIds, setChannelMemberIds] = useState<Set<string>>(new Set());
  const [productMembers, setProductMembers] = useState<Profile[]>([]);
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  // ── load product members ────────────────────────────────────────────────
  useEffect(() => {
    if (!product) return;
    (async () => {
      const { data: pms } = await supabase.from('product_members').select('user_id').eq('product_id', product.id);
      if (!pms?.length) return;
      const { data: profs } = await supabase.from('profiles').select('*').in('id', pms.map((p) => p.user_id));
      const list = (profs || []) as Profile[];
      setProductMembers(list);
      const map: Record<string, Profile> = {};
      for (const p of list) map[p.id] = p;
      setMemberMap((prev) => ({ ...prev, ...map }));
    })();
  }, [product]);

  // ── load channels ───────────────────────────────────────────────────────
  const loadChannels = useCallback(async (selectId?: string) => {
    if (!product) return;
    const { data, error } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('product_id', product.id)
      .order('name');
    if (error) { console.error('loadChannels:', error.message); return; }
    const chans = (data || []) as ChatChannel[];
    setChannels(chans);
    if (chans.length > 0) {
      const target = selectId ? chans.find((c) => c.id === selectId) ?? chans[0] : chans[0];
      setActiveChannel((prev) => prev ?? target);
    }
  }, [product]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  // ── load messages + memberships for active channel ──────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    const chanId = activeChannel.id;
    activeChannelIdRef.current = chanId;
    setMessages([]);

    (async () => {
      const { data: msgs } = await supabase
        .from('chat_messages').select('*').eq('channel_id', chanId).order('created_at', { ascending: true });
      if (activeChannelIdRef.current !== chanId) return;
      setMessages((msgs || []) as ChatMessage[]);

      // Resolve unknown authors
      const unknownIds = [...new Set((msgs || []).map((m) => m.user_id))].filter((id) => !memberMap[id]);
      if (unknownIds.length) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', unknownIds);
        if (activeChannelIdRef.current !== chanId) return;
        setMemberMap((prev) => { const n = { ...prev }; for (const p of profs || []) n[p.id] = p as Profile; return n; });
      }

      // Channel memberships
      const { data: cm } = await supabase.from('chat_memberships').select('user_id').eq('channel_id', chanId);
      if (activeChannelIdRef.current !== chanId) return;
      const ids = new Set((cm || []).map((m) => m.user_id));
      setChannelMemberIds(ids);
      if (ids.size > 0) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', [...ids]);
        if (activeChannelIdRef.current !== chanId) return;
        setChannelMembers((profs || []) as Profile[]);
      } else { setChannelMembers([]); }
    })();

    // Realtime
    const sub = supabase.channel(`chat-${chanId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${chanId}` }, (payload) => {
        const msg = payload.new as ChatMessage;
        setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
        setMemberMap((prev) => {
          if (prev[msg.user_id]) return prev;
          supabase.from('profiles').select('*').eq('id', msg.user_id).single().then(({ data }) => {
            if (data) setMemberMap((p) => ({ ...p, [data.id]: data as Profile }));
          });
          return prev;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${chanId}` }, async () => {
        const { data } = await supabase.from('chat_messages').select('*').eq('channel_id', chanId).order('created_at', { ascending: true });
        if (activeChannelIdRef.current === chanId) setMessages((data || []) as ChatMessage[]);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [activeChannel]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── send ────────────────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || !activeChannel || !profile) return;
    const content = input.trim();
    setInput('');
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ channel_id: activeChannel.id, user_id: profile.id, content })
      .select('*').single();
    if (error) { setInput(content); return; }
    if (data) setMessages((prev) => prev.some((m) => m.id === (data as ChatMessage).id) ? prev : [...prev, data as ChatMessage]);
  };

  const deleteMessage = async (msgId: string) => { await supabase.from('chat_messages').delete().eq('id', msgId); };

  const refreshChannelMembers = async () => {
    if (!activeChannel) return;
    const { data: cm } = await supabase.from('chat_memberships').select('user_id').eq('channel_id', activeChannel.id);
    const ids = new Set((cm || []).map((m) => m.user_id));
    setChannelMemberIds(ids);
    if (ids.size > 0) {
      const { data: profs } = await supabase.from('profiles').select('*').in('id', [...ids]);
      setChannelMembers((profs || []) as Profile[]);
    } else { setChannelMembers([]); }
  };

  // ── DM: find or create a DM channel between current user and target ─────
  const openDm = async (targetUser: Profile) => {
    if (!product || !profile) return;
    const dmName = [profile.id, targetUser.id].sort().join('_');

    // Check for existing DM channel on this product
    const { data: existing } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('product_id', product.id)
      .eq('type', 'dm')
      .eq('name', dmName)
      .maybeSingle();

    if (existing) {
      setActiveChannel(existing as ChatChannel);
      setMessages([]);
      setShowMembers(false);
      return;
    }

    // Create new DM channel
    const { data: created, error } = await supabase
      .from('chat_channels')
      .insert({ product_id: product.id, name: dmName, type: 'dm' })
      .select('*').single();
    if (error || !created) return;

    // Add both users as members
    await supabase.from('chat_memberships').insert([
      { channel_id: (created as ChatChannel).id, user_id: profile.id },
      { channel_id: (created as ChatChannel).id, user_id: targetUser.id },
    ]);

    await loadChannels((created as ChatChannel).id);
    setActiveChannel(created as ChatChannel);
    setMessages([]);
  };

  const isFounder = profile?.role === 'founder';

  // Friendly display name for a channel (DMs show the other person's name)
  const channelDisplayName = (c: ChatChannel) => {
    if (c.type !== 'dm') return c.name;
    const otherId = c.name.split('_').find((id) => id !== profile?.id);
    return memberMap[otherId || '']?.full_name || 'DM';
  };

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" description="You don't have access to this product." /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  return (
    <PageContainer title="Chat" actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Channel</Button>}>
      <div className="grid lg:grid-cols-[220px_1fr] gap-4 h-[72vh]">
        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {/* Team members (clickable for DM) */}
          {productMembers.length > 0 && (
            <div className="surface rounded-xl p-3">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Team ({productMembers.length})</div>
              <div className="space-y-0.5">
                {productMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => m.id !== profile?.id && openDm(m)}
                    disabled={m.id === profile?.id}
                    title={m.id === profile?.id ? 'You' : `Message ${m.full_name}`}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors text-left',
                      m.id === profile?.id
                        ? 'opacity-50 cursor-default'
                        : 'hover:surface-2 cursor-pointer group'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={m.full_name} src={m.avatar_url} size="xs" />
                    </div>
                    <span className="text-xs text-[var(--text)] truncate flex-1">{m.full_name}</span>
                    <span className="text-[10px] text-muted capitalize truncate hidden sm:block">{m.title || m.role}</span>
                    {m.id !== profile?.id && (
                      <MessageCircle className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto">
            {/* Channels */}
            {channels.filter((c) => c.type === 'channel').length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2 mb-1">Channels</div>
                <div className="space-y-0.5">
                  {channels.filter((c) => c.type === 'channel').map((c) => (
                    <button key={c.id} onClick={() => { setActiveChannel(c); setMessages([]); setShowMembers(false); }}
                      className={cn('w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                        activeChannel?.id === c.id ? 'accent-tint-bg accent font-medium' : 'hover:surface-2 text-[var(--text-muted)]')}>
                      <Hash className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* DMs */}
            {channels.filter((c) => c.type === 'dm').length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2 mb-1">Direct Messages</div>
                <div className="space-y-0.5">
                  {channels.filter((c) => c.type === 'dm').map((c) => {
                    const otherId = c.name.split('_').find((id) => id !== profile?.id);
                    const other = memberMap[otherId || ''];
                    return (
                      <button key={c.id} onClick={() => { setActiveChannel(c); setMessages([]); setShowMembers(false); }}
                        className={cn('w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                          activeChannel?.id === c.id ? 'accent-tint-bg accent font-medium' : 'hover:surface-2 text-[var(--text-muted)]')}>
                        <Avatar name={other?.full_name || '?'} src={other?.avatar_url} size="xs" />
                        <span className="truncate text-xs">{other?.full_name || 'DM'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {channels.length === 0 && (
              <div className="text-xs text-muted px-2 py-3">
                No channels yet — <button onClick={() => setCreating(true)} className="accent hover:underline">create one</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Main chat area ── */}
        <div className="surface rounded-xl flex flex-col overflow-hidden">
          {activeChannel ? (
            <>
              <div className="px-4 py-3 border-b border-app flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {activeChannel.type === 'dm'
                    ? <MessageCircle className="w-4 h-4 text-muted" />
                    : <Hash className="w-4 h-4 text-muted" />}
                  <span className="font-semibold text-[var(--text)]">{channelDisplayName(activeChannel)}</span>
                  {activeChannel.type === 'channel' && (
                    <span className="text-xs text-muted ml-1">{channelMembers.length} members</span>
                  )}
                </div>
                {activeChannel.type === 'channel' && (
                  <button onClick={() => setShowMembers(true)}
                    className="flex items-center gap-1.5 rounded-lg surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-[var(--text)] transition-colors">
                    <UsersIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline">Members</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <MessageSquare className="w-10 h-10 text-muted mb-3" />
                    <p className="text-sm font-medium text-[var(--text)]">No messages yet</p>
                    <p className="text-xs text-muted mt-1">
                      {activeChannel.type === 'dm'
                        ? `Say hi to ${channelDisplayName(activeChannel)}`
                        : `Be the first to say something in #${activeChannel.name}`}
                    </p>
                  </div>
                )}
                {messages.map((m) => {
                  const author = memberMap[m.user_id];
                  const isMine = m.user_id === profile?.id;
                  const canDelete = isMine || isFounder;
                  return (
                    <div key={m.id} className={cn('flex gap-2.5 group', isMine && 'flex-row-reverse')}>
                      <Avatar name={author?.full_name || '?'} src={author?.avatar_url} size="sm" className="shrink-0 mt-0.5" />
                      <div className={cn('max-w-[72%]', isMine && 'text-right')}>
                        <div className={cn('flex items-baseline gap-1.5 mb-0.5', isMine && 'flex-row-reverse')}>
                          <span className="text-xs font-semibold text-[var(--text)]">{isMine ? 'You' : author?.full_name || 'Unknown'}</span>
                          <span className="text-[10px] text-muted">{formatRelative(m.created_at)}</span>
                          {canDelete && (
                            <button onClick={() => deleteMessage(m.id)} className="text-muted hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className={cn('inline-block rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                          isMine ? 'accent-bg text-white rounded-tr-sm' : 'surface-2 text-[var(--text)] rounded-tl-sm')}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-app flex items-center gap-2 shrink-0">
                <Input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={activeChannel.type === 'dm' ? `Message ${channelDisplayName(activeChannel)}…` : `Message #${activeChannel.name}…`} />
                <Button size="icon" onClick={send} disabled={!input.trim()}><Send className="w-4 h-4" /></Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={<Hash className="w-8 h-8" />} title="No channel selected"
                description="Create a channel or click a team member to start a DM."
                action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New Channel</Button>} />
            </div>
          )}
        </div>
      </div>

      {creating && (
        <ChannelCreator product={product} userId={profile?.id ?? null} productMembers={productMembers}
          onClose={() => setCreating(false)}
          onCreated={(ch) => { loadChannels(ch.id); setActiveChannel(ch); setCreating(false); }} />
      )}
      {showMembers && activeChannel && (
        <MembersModal channel={activeChannel} members={channelMembers} memberIds={channelMemberIds}
          candidates={productMembers} isFounder={isFounder} currentUserId={profile?.id ?? ''}
          onClose={() => setShowMembers(false)} onUpdated={refreshChannelMembers} />
      )}
    </PageContainer>
  );
}

// ── Channel creator ────────────────────────────────────────────────────────
function ChannelCreator({
  product, userId, productMembers, onClose, onCreated,
}: {
  product: { id: string };
  userId: string | null;
  productMembers: Profile[];
  onClose: () => void;
  onCreated: (ch: ChatChannel) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim() || !userId) return;
    setSaving(true);
    setError('');
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error: insertErr } = await supabase
      .from('chat_channels')
      .insert({ product_id: product.id, name: slug, type: 'channel' })
      .select('*').single();
    if (insertErr) { setError(insertErr.message); setSaving(false); return; }

    if (data) {
      const allIds = [...new Set([userId, ...productMembers.map((p) => p.id)])];
      await supabase.from('chat_memberships').insert(
        allIds.map((uid) => ({ channel_id: (data as ChatChannel).id, user_id: uid }))
      );
    }
    setSaving(false);
    onCreated(data as ChatChannel);
  };

  return (
    <Modal open onClose={onClose} title="New Channel">
      <div className="p-5 space-y-3">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <label className="block text-xs font-medium text-muted mb-1">Channel name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="general" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && save()} />
        <p className="text-xs text-muted">
          All {productMembers.length} product team members will be added automatically.
        </p>
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
          {saving ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Members modal ──────────────────────────────────────────────────────────
function MembersModal({
  channel, members, memberIds, candidates, isFounder, currentUserId, onClose, onUpdated,
}: {
  channel: ChatChannel;
  members: Profile[];
  memberIds: Set<string>;
  candidates: Profile[];
  isFounder: boolean;
  currentUserId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const nonMembers = candidates.filter((p) => !memberIds.has(p.id));

  const removeMember = async (uid: string) => {
    await supabase.from('chat_memberships').delete().eq('channel_id', channel.id).eq('user_id', uid);
    onUpdated();
  };

  const addMember = async (uid: string) => {
    await supabase.from('chat_memberships').insert({ channel_id: channel.id, user_id: uid });
    onUpdated();
    setAdding(false);
  };

  return (
    <Modal open onClose={onClose} title={`#${channel.name} — Members`}>
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          {members.length === 0 && <p className="text-sm text-muted text-center py-3">No members yet</p>}
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2">
              <Avatar name={m.full_name} src={m.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text)] truncate">{m.full_name}</div>
                <div className="text-xs text-muted truncate">{m.title || m.role}</div>
              </div>
              {(isFounder || m.id === currentUserId) && (
                <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:surface-2">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {isFounder && nonMembers.length > 0 && (
          <div>
            <button onClick={() => setAdding(!adding)}
              className="flex items-center gap-1.5 text-xs accent hover:underline">
              <UserPlus className="w-3.5 h-3.5" /> Add member
            </button>
            {adding && (
              <div className="mt-2 space-y-1.5">
                {nonMembers.map((p) => (
                  <button key={p.id} onClick={() => addMember(p.id)}
                    className="w-full flex items-center gap-2 rounded-lg surface-2 px-3 py-2 hover:opacity-80 transition-opacity">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <span className="text-sm text-[var(--text)] flex-1 text-left truncate">{p.full_name}</span>
                    <Plus className="w-3.5 h-3.5 text-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}
