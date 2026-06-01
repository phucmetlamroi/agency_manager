'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Hash, Lock, Loader2, Send, Trash2, SmilePlus, Settings } from 'lucide-react'
import { toast } from 'sonner'
import type { ChannelVisibility, PostPolicy } from '@prisma/client'
import type { HubChannelDTO } from '@/actions/channel-actions'
import ChannelSettingsModal from './ChannelSettingsModal'
import { getMessages, sendMessage, deleteMessage, type MessageDTO, type ReactionDTO } from '@/actions/message-actions'
import { toggleReaction } from '@/actions/reaction-actions'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { CHAT_EVENTS, getChannelBroadcastTopic } from '@/lib/chat-channels'

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

export default function ChannelView({ workspaceId, channel, currentUserId, isAdmin, onChannelUpdated }: Props) {
    const [messages, setMessages] = useState<MessageDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [content, setContent] = useState('')
    const [sending, setSending] = useState(false)
    const [pickerFor, setPickerFor] = useState<string | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

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

    // Phase 2: live updates via Supabase broadcast. Server broadcasts reach all
    // subscribers (incl. the sender), so we dedupe by DB id against the optimistic append.
    useSupabaseChannel(
        getChannelBroadcastTopic(channel.id),
        (event, payload) => {
            if (event === CHAT_EVENTS.MESSAGE_NEW) {
                const msg = payload as MessageDTO
                setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
                scrollToBottom()
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
    }

    async function handleSend() {
        const text = content.trim()
        if (!text || sending) return
        setSending(true)
        try {
            const res = await sendMessage(workspaceId, channel.id, text)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            // Append (dedupe by id — Phase 2 realtime echo will reuse this).
            setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]))
            setContent('')
            scrollToBottom()
        } finally {
            setSending(false)
        }
    }

    async function handleDelete(id: string) {
        const res = await deleteMessage(workspaceId, id)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString(), content: '' } : m)))
    }

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
                {isAdmin && channel.type !== 'TASK' && (
                    <button
                        onClick={() => setShowSettings(true)}
                        className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                        title="Cài đặt kênh"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                )}
            </div>

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
                                {m.author?.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={m.author.avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-violet-500/20 text-violet-300 grid place-items-center text-xs font-bold shrink-0">
                                        {initials(name)}
                                    </div>
                                )}
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
                                            <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{m.content}</p>
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
                    <div className="flex items-end gap-2">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
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
                            disabled={sending || !content.trim()}
                            className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-colors"
                            title="Gửi"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
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
        </div>
    )
}
