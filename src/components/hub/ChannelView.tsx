'use client'

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react'
import { Hash, Lock, Loader2, Send, Trash2, SmilePlus, Settings, Bell, BellOff, Video, PhoneCall, Paperclip, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ChannelVisibility, PostPolicy } from '@prisma/client'
import type { HubChannelDTO } from '@/actions/channel-actions'
import { getMyChannelMute, setChannelMuted, getChannelMembers, markChannelRead } from '@/actions/channel-actions'
import ChannelSettingsModal from './ChannelSettingsModal'
import { getMessages, sendMessage, deleteMessage, type MessageDTO, type ReactionDTO } from '@/actions/message-actions'
import { uploadChatAttachment, type ChatAttachmentMeta } from '@/actions/upload-actions'
import { toggleReaction } from '@/actions/reaction-actions'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { usePresence } from '@/hooks/usePresence'
import { CHAT_EVENTS, getChannelBroadcastTopic } from '@/lib/chat-channels'
import dynamic from 'next/dynamic'

// ~3MB LiveKit SDK — keep it out of the main chat bundle until a call opens.
const CallRoomModal = dynamic(() => import('./CallRoomModal'), { ssr: false })

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '✅', '🔥', '🙏']

interface Props {
    workspaceId: string
    channel: HubChannelDTO
    currentUserId: string
    isAdmin: boolean
    /** Called after channel settings change so the parent can update its state. */
    onChannelUpdated?: (patch: { visibility: ChannelVisibility; postPolicy: PostPolicy }) => void
}

function initials(name: string) {
    return name.trim().slice(0, 2).toUpperCase()
}

function fmtTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatBytes(n: number) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function ChannelView({ workspaceId, channel, currentUserId, isAdmin, onChannelUpdated }: Props) {
    const [messages, setMessages] = useState<MessageDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [pickerFor, setPickerFor] = useState<string | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [muted, setMuted] = useState(false)
    const [isMember, setIsMember] = useState(false)
    const [muteBusy, setMuteBusy] = useState(false)
    const [showCall, setShowCall] = useState(false)
    const [callCount, setCallCount] = useState(0)
    const [pendingFiles, setPendingFiles] = useState<ChatAttachmentMeta[]>([])
    const [uploadingFile, setUploadingFile] = useState(false)
    const [members, setMembers] = useState<Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }>>([])
    const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({})
    const fileInputRef = useRef<HTMLInputElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const lastTypingSent = useRef(0)
    const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

    const onlineIds = usePresence(`presence:${workspaceId}`, currentUserId)

    // UX-only: hide composer when the channel is admins-only and the user isn't an admin.
    // (Server-side authorizeChannel is the real guard; channel MODERATORs are allowed there.)
    const readOnly = channel.postPolicy === 'ADMINS_ONLY' && !isAdmin

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
        })
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setMessages([])
        getMessages(workspaceId, channel.id)
            .then((res) => {
                if (cancelled) return
                setMessages(res.messages)
                scrollToBottom()
            })
            .catch(() => {
                if (!cancelled) toast.error('Không tải được tin nhắn')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId, channel.id, scrollToBottom])

    // [nối dây] load this user's mute state for the channel (drives the bell toggle).
    useEffect(() => {
        let cancelled = false
        getMyChannelMute(workspaceId, channel.id)
            .then((res) => {
                if (cancelled) return
                setIsMember(res.isMember)
                setMuted(res.muted)
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [workspaceId, channel.id])

    // [Phase 2 · @-autocomplete + read receipts] load mention-eligible members and
    // mark the channel read on open; reset transient typing state on channel switch.
    useEffect(() => {
        let cancelled = false
        getChannelMembers(workspaceId, channel.id)
            .then((res) => {
                if (!cancelled) setMembers(res)
            })
            .catch(() => {})
        void markChannelRead(workspaceId, channel.id)
        setTypingUsers({})
        Object.values(typingTimers.current).forEach(clearTimeout)
        typingTimers.current = {}
        return () => {
            cancelled = true
        }
    }, [workspaceId, channel.id])

    // [Phase 2 · call] LiveKit (not our DB) is the source of truth for "is a call
    // live" → poll /active on open + every 20s + on focus + on call_started/ended.
    const refreshCallCount = useCallback(() => {
        if (channel.type === 'TASK') return
        fetch(`/api/livekit/active?workspaceId=${encodeURIComponent(workspaceId)}&channelId=${encodeURIComponent(channel.id)}`)
            .then((r) => r.json())
            .then((d) => setCallCount(typeof d?.count === 'number' ? d.count : 0))
            .catch(() => {})
    }, [workspaceId, channel.id, channel.type])

    useEffect(() => {
        refreshCallCount()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            refreshCallCount()
        }, 20000)
        const onFocus = () => refreshCallCount()
        window.addEventListener('focus', onFocus)
        return () => {
            clearInterval(id)
            window.removeEventListener('focus', onFocus)
        }
    }, [refreshCallCount])

    // [Realtime fallback] Supabase realtime có thể bị chặn (CHANNEL_ERROR: project
    // paused / Realtime Authorization / RLS) → client subscribe + broadcast đều
    // không tới. Poll nhẹ mỗi 15s (chỉ khi tab hiện) để vẫn thấy tin của người
    // khác mà không cần reload. Chỉ THÊM tin mới (dedupe theo id) — không phá
    // optimistic/realtime nếu realtime đang chạy.
    useEffect(() => {
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            getMessages(workspaceId, channel.id)
                .then((res) => {
                    setMessages((prev) => {
                        const ids = new Set(prev.map((m) => m.id))
                        const additions = res.messages.filter((m) => !ids.has(m.id))
                        return additions.length
                            ? [...prev, ...additions].sort(
                                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                              )
                            : prev
                    })
                })
                .catch(() => {})
        }, 15000)
        return () => clearInterval(id)
    }, [workspaceId, channel.id])

    // Phase 2: live updates via Supabase broadcast. Subscribers dedupe by DB id.
    // [Realtime fix] Ngoài server REST broadcast, người gửi bắn event CLIENT-SIDE
    // qua WebSocket (`broadcast(...)`) — hoạt động chỉ với anon key, không cần
    // SUPABASE_SERVICE_ROLE_KEY. `self:false` nên người gửi không nhận echo.
    const { broadcast } = useSupabaseChannel(
        getChannelBroadcastTopic(channel.id),
        (event, payload) => {
            if (event === CHAT_EVENTS.MESSAGE_NEW) {
                const msg = payload as MessageDTO
                setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
                scrollToBottom()
                // advance read marker while actively viewing the channel
                if (typeof document !== 'undefined' && !document.hidden) void markChannelRead(workspaceId, channel.id)
            } else if (event === CHAT_EVENTS.MESSAGE_EDIT) {
                const msg = payload as MessageDTO
                setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
            } else if (event === CHAT_EVENTS.MESSAGE_DELETE) {
                const id = (payload as { id: string }).id
                setMessages((prev) =>
                    prev.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m)),
                )
            } else if (event === CHAT_EVENTS.REACTION) {
                const { messageId, reactions } = payload as { messageId: string; reactions: ReactionDTO[] }
                setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
            } else if (event === CHAT_EVENTS.CALL_STARTED) {
                setCallCount((c) => Math.max(c, 1)) // optimistic; the poll confirms the real count
                refreshCallCount()
            } else if (event === CHAT_EVENTS.CALL_ENDED) {
                refreshCallCount()
            } else if (event === CHAT_EVENTS.TYPING) {
                const uid = (payload as { userId?: string })?.userId
                if (!uid || uid === currentUserId) return
                const u = members.find((m) => m.id === uid)
                const nm = u ? u.displayName || u.username : 'Ai đó'
                setTypingUsers((prev) => ({ ...prev, [uid]: { name: nm, at: Date.now() } }))
                if (typingTimers.current[uid]) clearTimeout(typingTimers.current[uid])
                typingTimers.current[uid] = setTimeout(() => {
                    setTypingUsers((prev) => {
                        const n = { ...prev }
                        delete n[uid]
                        return n
                    })
                    delete typingTimers.current[uid]
                }, 4000)
            }
        },
        true,
    )

    async function handleToggleReaction(messageId: string, emoji: string) {
        setPickerFor(null)
        const res = await toggleReaction(workspaceId, messageId, emoji)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m)))
        broadcast(CHAT_EVENTS.REACTION, { messageId, reactions: res.reactions })
    }

    async function handleSend() {
        const text = content.trim()
        if ((!text && pendingFiles.length === 0) || sending) return
        setSending(true)
        try {
            const res = await sendMessage(workspaceId, channel.id, text, null, pendingFiles.length ? pendingFiles : undefined)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            // Append (dedupe by id — Phase 2 realtime echo will reuse this).
            setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]))
            broadcast(CHAT_EVENTS.MESSAGE_NEW, res.message)
            setContent('')
            setPendingFiles([])
            scrollToBottom()
        } finally {
            setSending(false)
        }
    }

    async function handlePickFile(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = '' // allow re-picking the same file
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
            toast.error('Tệp tối đa 10MB.')
            return
        }
        setUploadingFile(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await uploadChatAttachment(workspaceId, channel.id, fd)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            setPendingFiles((prev) => [...prev, res.attachment])
        } catch {
            toast.error('Lỗi tải tệp.')
        } finally {
            setUploadingFile(false)
        }
    }

    async function handleDelete(id: string) {
        const res = await deleteMessage(workspaceId, id)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m)))
        broadcast(CHAT_EVENTS.MESSAGE_DELETE, { id })
    }

    async function handleToggleMute() {
        const next = !muted
        setMuted(next) // optimistic
        setMuteBusy(true)
        try {
            const res = await setChannelMuted(workspaceId, channel.id, next)
            if ('error' in res) {
                setMuted(!next) // revert
                toast.error(res.error)
            } else {
                toast.success(next ? 'Đã tắt thông báo kênh này' : 'Đã bật lại thông báo kênh')
            }
        } catch {
            setMuted(!next)
            toast.error('Không đổi được trạng thái thông báo')
        } finally {
            setMuteBusy(false)
        }
    }

    function handleStartCall() {
        setShowCall(true)
        broadcast(CHAT_EVENTS.CALL_STARTED, { by: currentUserId })
    }

    function handleContentChange(e: ChangeEvent<HTMLTextAreaElement>) {
        setContent(e.target.value)
        const now = Date.now()
        if (now - lastTypingSent.current > 2500) {
            lastTypingSent.current = now
            broadcast(CHAT_EVENTS.TYPING, { userId: currentUserId })
        }
    }

    function insertMention(username: string) {
        setContent((prev) => prev.replace(/(^|\s)@(\w*)$/, `$1@${username} `))
    }

    // [Phase 2 · @-autocomplete] active @-token at the caret (end of text).
    const mentionMatch = content.match(/(^|\s)@(\w*)$/)
    const mentionQuery = mentionMatch ? mentionMatch[2].toLowerCase() : null
    const mentionResults =
        mentionQuery !== null
            ? members
                  .filter(
                      (m) =>
                          m.id !== currentUserId &&
                          (m.username.toLowerCase().includes(mentionQuery) ||
                              (m.displayName || '').toLowerCase().includes(mentionQuery)),
                  )
                  .slice(0, 6)
            : []
    const typingNames = Object.values(typingUsers).map((t) => t.name)

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 shrink-0">
                {channel.visibility === 'PRIVATE' ? (
                    <Lock className="w-4 h-4 text-zinc-500" />
                ) : (
                    <Hash className="w-4 h-4 text-zinc-500" />
                )}
                <span className="font-bold text-zinc-100">{channel.name}</span>
                {channel.postPolicy === 'ADMINS_ONLY' && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-400/80 border border-amber-400/20 rounded-full px-2 py-0.5">
                        Chỉ admin đăng
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                    {isMember && (
                        <button
                            onClick={handleToggleMute}
                            disabled={muteBusy}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors disabled:opacity-50"
                            title={muted ? 'Bật lại thông báo kênh' : 'Tắt thông báo kênh này'}
                        >
                            {muted ? <BellOff className="w-4 h-4 text-amber-400/80" /> : <Bell className="w-4 h-4" />}
                        </button>
                    )}
                    {channel.type !== 'TASK' && (
                        <button
                            onClick={handleStartCall}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-300 hover:bg-white/5 transition-colors"
                            title="Bắt đầu / tham gia cuộc gọi video"
                        >
                            <Video className="w-4 h-4" />
                        </button>
                    )}
                    {isAdmin && channel.type !== 'TASK' && (
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                            title="Cài đặt kênh"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* [Phase 2 · call] Join-call banner — driven by /active count + broadcast */}
            {channel.type !== 'TASK' && callCount > 0 && !showCall && (
                <button
                    onClick={() => setShowCall(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-200 bg-emerald-500/15 border-b border-emerald-500/20 hover:bg-emerald-500/25 transition-colors shrink-0"
                >
                    <PhoneCall className="w-4 h-4 animate-pulse" />
                    Có cuộc gọi đang diễn ra ({callCount}) — Tham gia
                </button>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 gap-2 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                        Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện 👋
                    </div>
                ) : (
                    messages.map((m) => {
                        const name = m.author?.displayName || m.author?.username || 'Người dùng'
                        const mine = m.authorId === currentUserId
                        const canDelete = mine || isAdmin
                        return (
                            <div key={m.id} className="group flex gap-3">
                                <div className="relative shrink-0">
                                    {m.author?.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.author.avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-violet-500/20 text-violet-300 grid place-items-center text-xs font-bold">
                                            {initials(name)}
                                        </div>
                                    )}
                                    {onlineIds.has(m.authorId) && (
                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950" title="Đang online" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-semibold text-zinc-100">{name}</span>
                                        <span className="text-[11px] text-zinc-500">{fmtTime(m.createdAt)}</span>
                                        {m.editedAt && !m.deletedAt && <span className="text-[10px] text-zinc-600">(đã sửa)</span>}
                                        {canDelete && !m.deletedAt && (
                                            <button
                                                onClick={() => handleDelete(m.id)}
                                                className="ml-auto opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-opacity"
                                                title="Xoá"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    {m.deletedAt ? (
                                        <p className="text-sm italic text-zinc-600">(tin nhắn đã xoá)</p>
                                    ) : (
                                        <>
                                            {m.content && (
                                                <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{m.content}</p>
                                            )}
                                            {m.attachments.length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {m.attachments.map((a) =>
                                                        a.mimeType.startsWith('image/') ? (
                                                            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img src={a.url} alt={a.fileName} className="max-h-60 max-w-[280px] rounded-lg border border-white/10 object-cover" />
                                                            </a>
                                                        ) : (
                                                            <a
                                                                key={a.id}
                                                                href={a.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-zinc-200 max-w-[280px]"
                                                            >
                                                                <FileText className="w-4 h-4 shrink-0 text-violet-300" />
                                                                <span className="truncate">{a.fileName}</span>
                                                                <span className="text-zinc-500 shrink-0">{formatBytes(a.sizeBytes)}</span>
                                                            </a>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                {m.reactions.map((r) => {
                                                    const mine = currentUserId ? r.userIds.includes(currentUserId) : false
                                                    return (
                                                        <button
                                                            key={r.emoji}
                                                            type="button"
                                                            onClick={() => handleToggleReaction(m.id, r.emoji)}
                                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                                                                mine
                                                                    ? 'border-violet-500/50 bg-violet-500/15 text-zinc-100'
                                                                    : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                                                            }`}
                                                        >
                                                            <span>{r.emoji}</span>
                                                            <span className="tabular-nums">{r.userIds.length}</span>
                                                        </button>
                                                    )
                                                })}
                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                                                        className="opacity-0 group-hover:opacity-100 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-zinc-400 hover:text-zinc-100 transition-opacity"
                                                        title="Thêm cảm xúc"
                                                    >
                                                        <SmilePlus className="w-3.5 h-3.5" />
                                                    </button>
                                                    {pickerFor === m.id && (
                                                        <div className="absolute z-20 mt-1 flex gap-0.5 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl">
                                                            {QUICK_EMOJIS.map((e) => (
                                                                <button
                                                                    key={e}
                                                                    type="button"
                                                                    onClick={() => handleToggleReaction(m.id, e)}
                                                                    className="rounded-lg px-1.5 py-0.5 text-base hover:bg-white/10"
                                                                >
                                                                    {e}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-white/10 p-3 shrink-0">
                {readOnly ? (
                    <p className="text-center text-xs text-zinc-500 py-2">Kênh này chỉ admin được đăng bài.</p>
                ) : (
                    <div className="space-y-2 relative">
                        {mentionQuery !== null && mentionResults.length > 0 && (
                            <div className="absolute bottom-full left-0 mb-2 w-64 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 shadow-2xl z-30">
                                {mentionResults.map((mem) => (
                                    <button
                                        key={mem.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            insertMention(mem.username)
                                        }}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/5 transition-colors"
                                    >
                                        {mem.avatarUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={mem.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                                        ) : (
                                            <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 grid place-items-center text-[10px] font-bold">
                                                {initials(mem.displayName || mem.username)}
                                            </span>
                                        )}
                                        <span className="text-sm text-zinc-200 truncate">{mem.displayName || mem.username}</span>
                                        <span className="ml-auto text-[11px] text-zinc-500">@{mem.username}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {typingNames.length > 0 && (
                            <p className="text-[11px] text-zinc-500 italic px-1">
                                {typingNames.slice(0, 2).join(', ')}
                                {typingNames.length > 2 ? ` +${typingNames.length - 2}` : ''} đang gõ…
                            </p>
                        )}
                        {pendingFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {pendingFiles.map((f, i) => (
                                    <div key={i} className="relative">
                                        {f.mimeType.startsWith('image/') ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={f.url} alt={f.fileName} className="h-16 w-16 rounded-lg object-cover border border-white/10" />
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-white/10 bg-white/5 text-[11px] text-zinc-300 max-w-[180px]">
                                                <FileText className="w-3.5 h-3.5 shrink-0 text-violet-300" />
                                                <span className="truncate">{f.fileName}</span>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-zinc-800 border border-white/20 text-zinc-300 hover:text-white hover:bg-red-600 transition-colors"
                                            title="Bỏ tệp"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-2">
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingFile}
                                className="h-11 w-11 shrink-0 grid place-items-center rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 disabled:opacity-40 transition-colors"
                                title="Đính kèm tệp / ảnh"
                            >
                                {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                            </button>
                            <textarea
                                value={content}
                                onChange={handleContentChange}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        if (mentionQuery !== null && mentionResults.length > 0) {
                                            e.preventDefault()
                                            insertMention(mentionResults[0].username)
                                            return
                                        }
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                rows={1}
                                placeholder={`Nhắn vào #${channel.name}`}
                                maxLength={4000}
                                className="flex-1 resize-none bg-zinc-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 max-h-40"
                            />
                            <button
                                onClick={handleSend}
                                disabled={sending || (!content.trim() && pendingFiles.length === 0)}
                                className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
                                title="Gửi"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showSettings && (
                <ChannelSettingsModal
                    workspaceId={workspaceId}
                    channel={channel}
                    onClose={() => setShowSettings(false)}
                    onSaved={(patch) => onChannelUpdated?.(patch)}
                />
            )}

            {showCall && (
                <CallRoomModal
                    workspaceId={workspaceId}
                    channelId={channel.id}
                    channelName={channel.name}
                    onClose={() => {
                        setShowCall(false)
                        broadcast(CHAT_EVENTS.CALL_ENDED, {})
                        refreshCallCount()
                    }}
                    onConnected={() => {
                        broadcast(CHAT_EVENTS.CALL_STARTED, { by: currentUserId })
                        refreshCallCount()
                    }}
                />
            )}
        </div>
    )
}
