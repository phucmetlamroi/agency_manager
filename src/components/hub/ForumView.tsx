'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Send, MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { HubChannelDTO } from '@/actions/channel-actions'
import { getMessages, sendMessage, type MessageDTO } from '@/actions/message-actions'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { CHAT_EVENTS, getChannelBroadcastTopic } from '@/lib/chat-channels'
import ThreadPanel from './ThreadPanel'

function initials(name: string) {
    return name.trim().slice(0, 2).toUpperCase()
}
function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * [Chat Phase 3] FORUM channel — each top-level message is a "post"; clicking opens its
 * thread (reuses ThreadPanel). New posts via the composer. Reuses the channel realtime
 * topic (replies are ignored here — they live in the thread).
 */
export default function ForumView({ workspaceId, channel }: { workspaceId: string; channel: HubChannelDTO }) {
    const [posts, setPosts] = useState<MessageDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [composing, setComposing] = useState(false)
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [openPost, setOpenPost] = useState<MessageDTO | null>(null)

    const load = useCallback(
        () =>
            getMessages(workspaceId, channel.id)
                .then((res) => {
                    const fresh = res.messages.filter((m) => !m.deletedAt).reverse() // newest first, drop soft-deleted
                    // Merge — preserve just-posted optimistic posts not yet in the DB result.
                    setPosts((prev) => {
                        const seen = new Set(fresh.map((m) => m.id))
                        const optimistic = prev.filter((m) => !seen.has(m.id) && !m.deletedAt)
                        return [...optimistic, ...fresh]
                    })
                })
                .catch(() => {}),
        [workspaceId, channel.id],
    )

    useEffect(() => {
        setLoading(true)
        load().finally(() => setLoading(false))
    }, [load])

    useEffect(() => {
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            load()
        }, 15000)
        return () => clearInterval(id)
    }, [load])

    const { broadcast } = useSupabaseChannel(
        getChannelBroadcastTopic(channel.id),
        (event, payload) => {
            if (event === CHAT_EVENTS.MESSAGE_NEW) {
                const m = payload as MessageDTO
                if (m.parentId) return // replies belong to the thread, not the post list
                setPosts((p) => (p.some((x) => x.id === m.id) ? p : [m, ...p]))
            } else if (event === CHAT_EVENTS.MESSAGE_EDIT) {
                const m = payload as MessageDTO
                setPosts((p) => p.map((x) => (x.id === m.id ? m : x)))
            } else if (event === CHAT_EVENTS.MESSAGE_DELETE) {
                const id = (payload as { id: string }).id
                setPosts((p) => p.filter((x) => x.id !== id))
            }
        },
        true,
    )

    async function handlePost() {
        const t = text.trim()
        if (!t || sending) return
        setSending(true)
        try {
            const res = await sendMessage(workspaceId, channel.id, t)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            setPosts((p) => [res.message, ...p])
            broadcast(CHAT_EVENTS.MESSAGE_NEW, res.message)
            setText('')
            setComposing(false)
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 shrink-0">
                <MessageSquare className="w-4 h-4 text-zinc-500" />
                <span className="font-bold text-zinc-100">{channel.name}</span>
                <span className="text-xs text-zinc-500">· Diễn đàn</span>
                <button
                    onClick={() => setComposing((v) => !v)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-3 py-1.5"
                >
                    <Plus className="w-4 h-4" /> Bài mới
                </button>
            </div>

            {composing && (
                <div className="border-b border-white/10 p-3 shrink-0 space-y-2">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={3}
                        placeholder="Nội dung bài đăng…"
                        maxLength={4000}
                        autoFocus
                        className="w-full resize-none bg-zinc-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setComposing(false); setText('') }} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-sm">
                            Huỷ
                        </button>
                        <button onClick={handlePost} disabled={sending || !text.trim()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-40">
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Đăng
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 gap-2 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                    </div>
                ) : posts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 text-sm">Chưa có bài đăng nào. Tạo bài đầu tiên 👋</div>
                ) : (
                    posts.map((m) => {
                        const name = m.author?.displayName || m.author?.username || 'Người dùng'
                        return (
                            <button key={m.id} onClick={() => setOpenPost(m)} className="w-full text-left rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 p-3 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    {m.author?.avatarUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.author.avatarUrl} alt={name} className="w-6 h-6 rounded-full object-cover" />
                                    ) : (
                                        <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 grid place-items-center text-[10px] font-bold">{initials(name)}</span>
                                    )}
                                    <span className="text-sm font-semibold text-zinc-100">{name}</span>
                                    <span className="text-[11px] text-zinc-500">{fmtTime(m.createdAt)}</span>
                                </div>
                                <p className="text-sm text-zinc-300 line-clamp-3 whitespace-pre-wrap break-words">{m.content || '(tệp đính kèm)'}</p>
                                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                                    <MessageSquare className="w-3.5 h-3.5" /> {m.replyCount} trả lời
                                </div>
                            </button>
                        )
                    })
                )}
            </div>

            {openPost && <ThreadPanel workspaceId={workspaceId} channel={channel} parent={openPost} onClose={() => setOpenPost(null)} />}
        </div>
    )
}
