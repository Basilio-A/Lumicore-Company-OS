import { useEffect, useState, useRef, useCallback } from 'react';
import { Hash, Send, Plus, Users as UsersIcon, X, Trash2, UserPlus } from 'lucide-react';
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
  const [members, setMembers] = useState<Record<string, Profile>>({});
  const [channelMembers, setChannelMembers] = useState<Profile[]>([]);
  const [channelMemberIds, setChannelMemberIds] = useState<Set<string>>(new Set());
  const [productMembers, setProductMembers] = useState<Profile[]>([]);
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const channelRef = useRef<string | null>(null);

  const loadChannels = useCallback(async () => {
    if (!product) return;
    const { data: chans } = await supabase.from('chat_channels').select('*').eq('product_id', product.id).order('name');
    setChannels(chans || []);
    if (chans && chans.length > 0 && !activeChannel) {
      setActiveChannel(chans[0]);
    }
  }, [product, activeChannel]);

  useEffect(() => {
    if (product) {
      // Load all active profiles as potential channel members (not just product_members)
      supabase.from('profiles').select('*').eq('status', 'active').then(({ data: profs }) => {
        setProductMembers(profs || []);
        // Also try product_members as a supplement
        supabase.from('product_members').select('user_id').eq('product_id', product.id).then(({ data: pms }) => {
          if (pms && pms.length > 0) {
            const pmIds = new Set(pms.map((p) => p.user_id));
            // merge: all active profiles are available, product members are highlighted
            setProductMembers((prev) => {
              const merged = [...(profs || [])];
              return merged;
            });
          }
        });
      });
    }
    loadChannels();
  }, [product, loadChannels]);

  useEffect(() => {
    if (!activeChannel) return;
    channelRef.current = activeChannel.id;
    const currentId = activeChannel.id;

    (async () => {
      const { data } = await supabase.from('chat_messages').select('*').eq('channel_id', currentId).order('created_at', { ascending: true });
      if (channelRef.current !== currentId) return;
      setMessages(data || []);

      const { data: cm } = await supabase.from('chat_memberships').select('user_id').eq('channel_id', currentId);
      if (channelRef.current !== currentId) return;
      const ids = new Set((cm || []).map((m) => m.user_id));
      setChannelMemberIds(ids);
      if (cm && cm.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('*').in('id', cm.map((m) => m.user_id));
        if (channelRef.current !== currentId) return;
        setChannelMembers(profs || []);
      } else {
        setChannelMembers([]);
      }
    })();

    const sub = supabase
      .channel(`chat-${currentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${currentId}` }, (payload) => {
        setMessages((prev) => {
          const newMsg = payload.new as ChatMessage;
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${currentId}` }, () => {
        (async () => {
          const { data } = await supabase.from('chat_messages').select('*').eq('channel_id', currentId).order('created_at', { ascending: true });
          if (channelRef.current === currentId) setMessages(data || []);
        })();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
      channelRef.current = null;
    };
  }, [activeChannel]);

  useEffect(() => {
    (async () => {
      if (messages.length === 0) { setMembers(profile ? { [profile.id]: profile } : {}); return; }
      const ids = [...new Set(messages.map((m) => m.user_id))];
      const { data } = await supabase.from('profiles').select('*').in('id', ids);
      const map: Record<string, Profile> = {};
      for (const p of data || []) map[p.id] = p as Profile;
      if (profile) map[profile.id] = profile;
      setMembers(map);
    })();
  }, [messages, profile]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !activeChannel || !profile) return;
    const content = input.trim();
    setInput('');
    const { data, error } = await supabase.from('chat_messages').insert({ channel_id: activeChannel.id, user_id: profile.id, content }).select('*').single();
    if (error) {
      setInput(content);
      return;
    }
    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (data as ChatMessage).id)) return prev;
        return [...prev, data as ChatMessage];
      });
    }
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('chat_messages').delete().eq('id', msgId);
  };

  const isFounder = profile?.role === 'founder';

  if (loading) return <PageContainer><div className="text-sm text-muted">Loading…</div></PageContainer>;
  if (accessDenied) return <PageContainer><EmptyState title="No access" /></PageContainer>;
  if (!product) return <PageContainer><EmptyState title="Product not found" /></PageContainer>;

  return (
    <PageContainer title="Chat" actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Channel</Button>}>
      <div className="grid lg:grid-cols-[220px_1fr] gap-4 h-[70vh]">
        <div className="space-y-0.5 overflow-y-auto">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-2 mb-1.5">Channels</div>
          {channels.map((c) => (
            <button key={c.id} onClick={() => { setActiveChannel(c); setMessages([]); }} className={cn('w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors', activeChannel?.id === c.id ? 'accent-tint-bg accent' : 'hover:surface-2 text-[var(--text-muted)]')}>
              <Hash className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{c.name}</span>
            </button>
          ))}
          {channels.length === 0 && <div className="text-xs text-muted px-3 py-4">No channels yet</div>}
        </div>
        <div className="surface rounded-xl flex flex-col overflow-hidden">
          {activeChannel ? (
            <>
              <div className="px-4 py-3 border-b border-app flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-muted" />
                  <span className="font-semibold text-[var(--text)]">{activeChannel.name}</span>
                  <span className="text-xs text-muted ml-2">{channelMembers.length} members</span>
                </div>
                <button onClick={() => setShowMembers(true)} className="flex items-center gap-1.5 rounded-lg surface-2 px-2.5 py-1.5 text-xs text-muted hover:text-[var(--text)] transition-colors">
                  <UsersIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline">Members</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const author = members[m.user_id];
                  const isMine = m.user_id === profile?.id;
                  const canDelete = isMine || isFounder;
                  return (
                    <div key={m.id} className={cn('flex gap-2.5 group', isMine && 'flex-row-reverse')}>
                      <Avatar name={author?.full_name || '?'} size="sm" />
                      <div className={cn('max-w-[70%]', isMine && 'text-right')}>
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-medium text-[var(--text)]">{author?.full_name || 'Unknown'}</span>
                          <span className="text-[10px] text-muted">{formatRelative(m.created_at)}</span>
                          {canDelete && <button onClick={() => deleteMessage(m.id)} className="text-muted hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>}
                        </div>
                        <div className={cn('inline-block rounded-xl px-3 py-2 text-sm', isMine ? 'accent-bg text-white' : 'surface-2 text-[var(--text)]')}>{m.content}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEnd} />
              </div>
              <div className="p-3 border-t border-app flex items-center gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} placeholder="Type a message…" />
                <Button size="icon" onClick={send} disabled={!input.trim()}><Send className="w-4 h-4" /></Button>
              </div>
            </>
          ) : (
            <EmptyState icon={<Hash className="w-8 h-8" />} title="No channel selected" description="Create a channel to start chatting." />
          )}
        </div>
      </div>
      {creating && <ChannelCreator product={product} userId={profile?.id || null} productMembers={productMembers} onClose={() => setCreating(false)} onCreated={(ch) => { loadChannels(); setCreating(false); setActiveChannel(ch); }} />}
      {showMembers && activeChannel && (
        <MembersModal
          channel={activeChannel}
          members={channelMembers}
          memberIds={channelMemberIds}
          candidates={productMembers}
          isFounder={isFounder}
          currentUserId={profile?.id || ''}
          onClose={() => setShowMembers(false)}
          onUpdated={() => {
            (async () => {
              const { data: cm } = await supabase.from('chat_memberships').select('user_id').eq('channel_id', activeChannel.id);
              const ids = new Set((cm || []).map((m) => m.user_id));
              setChannelMemberIds(ids);
              if (cm && cm.length > 0) {
                const { data: profs } = await supabase.from('profiles').select('*').in('id', cm.map((m) => m.user_id));
                setChannelMembers(profs || []);
              } else { setChannelMembers([]); }
            })();
          }}
        />
      )}
    </PageContainer>
  );
}

function ChannelCreator({ product, userId, productMembers, onClose, onCreated }: { product: { id: string }; userId: string | null; productMembers: Profile[]; onClose: () => void; onCreated: (ch: ChatChannel) => void }) {
  const [name, setName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [addAll, setAddAll] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim() || !userId) return;
    setSaving(true);
    setError('');
    const { data, error } = await supabase.from('chat_channels').insert({ product_id: product.id, name: name.trim(), type: 'channel' }).select('*').single();
    if (error) { setError(error.message); setSaving(false); return; }
    if (data) {
      const channelId = (data as ChatChannel).id;
      // Add creator always + selected members (or all if addAll)
      const memberIds = addAll
        ? [userId, ...productMembers.map((p) => p.id)]
        : [userId, ...Array.from(selectedMemberIds)];
      const uniqueIds = [...new Set(memberIds)];
      const rows = uniqueIds.map((uid) => ({ channel_id: channelId, user_id: uid }));
      const { error: memErr } = await supabase.from('chat_memberships').insert(rows);
      if (memErr) {
        // Non-fatal: channel was created, membership insertion failed
        console.warn('Membership insert error:', memErr.message);
      }
    }
    setSaving(false);
    onCreated(data as ChatChannel);
  };

  return (
    <Modal open onClose={onClose} title="New Channel">
      <div className="p-5 space-y-4">
        {error && <div className="text-sm text-rose-500 bg-rose-500/10 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Channel name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="general" autoFocus onKeyDown={(e) => e.key === 'Enter' && !addAll && save()} />
        </div>
        {productMembers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted">Members</label>
              <button
                type="button"
                onClick={() => setAddAll((v) => !v)}
                className={`text-xs rounded px-2 py-0.5 transition-colors ${addAll ? 'accent-bg text-white' : 'surface-2 text-muted hover:text-[var(--text)]'}`}
              >
                {addAll ? 'All members' : 'Select members'}
              </button>
            </div>
            {!addAll && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {productMembers.filter((p) => p.id !== userId).map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 rounded-lg surface-2 px-3 py-2 cursor-pointer hover:opacity-80">
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(p.id)}
                      onChange={() => toggleMember(p.id)}
                      className="accent-check"
                    />
                    <Avatar name={p.full_name} size="sm" />
                    <div>
                      <div className="text-sm font-medium text-[var(--text)]">{p.full_name}</div>
                      <div className="text-xs text-muted">{p.title || p.role}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {addAll && (
              <p className="text-xs text-muted">All {productMembers.length} active users will be added.</p>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create'}</Button>
      </div>
    </Modal>
  );
}

function MembersModal({ channel, members, memberIds, candidates, isFounder, currentUserId, onClose, onUpdated }: {
  channel: ChatChannel; members: Profile[]; memberIds: Set<string>; candidates: Profile[]; isFounder: boolean; currentUserId: string; onClose: () => void; onUpdated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const nonMembers = candidates.filter((p) => !memberIds.has(p.id));

  const removeMember = async (uid: string) => {
    if (uid === currentUserId && !isFounder) return;
    await supabase.from('chat_memberships').delete().eq('channel_id', channel.id).eq('user_id', uid);
    onUpdated();
  };

  const addMember = async (uid: string) => {
    await supabase.from('chat_memberships').insert({ channel_id: channel.id, user_id: uid });
    onUpdated();
    setAdding(false);
  };

  return (
    <Modal open onClose={onClose} title={`Members — #${channel.name}`}>
      <div className="p-5">
        <div className="space-y-2 mb-4">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg surface-2 px-3 py-2">
              <Avatar name={m.full_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--text)] truncate">{m.full_name}</div>
                <div className="text-xs text-muted truncate">{m.title || m.role}</div>
              </div>
              {(isFounder || m.id === currentUserId) && (
                <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg text-muted hover:text-rose-500 hover:surface-2"><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
          {members.length === 0 && <div className="text-sm text-muted text-center py-4">No members yet</div>}
        </div>
        {isFounder && nonMembers.length > 0 && (
          <div>
            <button onClick={() => setAdding(!adding)} className="flex items-center gap-1.5 text-xs accent hover:underline"><UserPlus className="w-3.5 h-3.5" /> Add member</button>
            {adding && (
              <div className="mt-2 space-y-1.5">
                {nonMembers.map((p) => (
                  <button key={p.id} onClick={() => addMember(p.id)} className="w-full flex items-center gap-2 rounded-lg surface-2 px-3 py-2 hover:opacity-80 transition-opacity">
                    <Avatar name={p.full_name} size="sm" />
                    <span className="text-sm text-[var(--text)] flex-1 text-left truncate">{p.full_name}</span>
                    <Plus className="w-3.5 h-3.5 text-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-app flex justify-end"><Button variant="secondary" size="sm" onClick={onClose}>Close</Button></div>
    </Modal>
  );
}
