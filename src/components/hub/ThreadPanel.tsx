'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, Send, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { HubChannelDTO } from '@/actions/channel-actions'
import { getThreadReplies, sendMessage, type MessageDTO } from '@/actions/message-actions'

function initials(name: string) {
    return name.trim().slice(0, 2).toUpperCase()
}
function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
function formatBytes(n: number) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Row({ m }: { m: MessageDTO }) {
    const name = m.author?.displayName || m.author?.username || 'Người dùng'
    return (
        <div className="flex gap-3">
            <div className="shrink-0">
                {m.author?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.author.avatarUrl} alt={name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 grid place-items-center text-[11px] font-bold">
                        {initials(name)}
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{name}</span>
                    <span className="text-[11px] text-zinc-500">{fmtTime(m.createdAt)}</span>
                </div>
                {m.deletedAt ? (
                    <p className="text-sm italic text-zinc-600">(tin nhắn đã xoá)</p>
                ) : (
                    <>
                        {m.content && <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{m.content}</p>}
                        {m.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {m.attachments.map((a) =>
                                    a.mimeType.startsWith('image/') ? (
                                        <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={a.url} alt={a.fileName} className="max-h-44 max-w-[220px] rounded-lg border border-white/10 object-cover" />
                                        </a>
                                    ) : (
                                        <a
                                            key={a.id}
                                            href={a.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-zinc-200 max-w-[220px]"
                                        >
                                            <FileText className="w-4 h-4 shrink-0 text-violet-300" />
                                            <span className="truncate">{a.fileName}</span>
                                            <span className="text-zinc-500 shrink-0">{formatBytes(a.sizeBytes)}</span>
                                        </a>
                                    ),
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

/**
 * [Chat threads] Right-side drawer showing a message's thread (parent + replies) with a
 * reply composer. No dedicated realtime topic — own replies append optimistically; a
 * light 8s poll surfaces others' replies (reuses getThreadReplies).
 */
export default function ThreadPanel({
    workspaceId,
    channel,
    parent,
    onClose,
}: {
    workspaceId: string
    channel: HubChannelDTO
    parent: MessageDTO
    onClose: () => void
}) {
    const [replies, setReplies] = useState<MessageDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const load = useCallback(() => {
        return getThreadReplies(workspaceId, parent.id).then((res) => {
            if ('error' in res) return
            // Merge — keep just-sent optimistic replies that haven't propagated to the DB yet.
            setReplies((prev) => {
                const seen = new Set(res.replies.map((m) => m.id))
                const optimistic = prev.filter((m) => !seen.has(m.id))
                return [...res.replies, ...optimistic]
            })
        })
    }, [workspaceId, parent.id])

    useEffect(() => {
        setLoading(true)
        load().finally(() => setLoading(false))
    }, [load])

    useEffect(() => {
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            load()
        }, 8000)
        return () => clearInterval(id)
    }, [load])

    useEffect(() => {
        requestAnimationFrame(() => {
            const el = scrollRef.current
            if (el) el.scrollTop = el.scrollHeight
        })
    }, [replies.length])

    async function handleSend() {
        const t = text.trim()
        if (!t || sending) return
        setSending(true)
        try {
            const res = await sendMessage(workspaceId, channel.id, t, parent.id)
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            setReplies((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]))
            setText('')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[110] flex justify-end bg-black/40" onClick={onClose}>
            <div className="w-full max-w-md h-full bg-zinc-950 border-l border-white/10 flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                    <div className="font-bold text-zinc-100">Thread</div>
                    <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <Row m={parent} />
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        <span className="h-px flex-1 bg-white/10" />
                        {replies.length} trả lời
                        <span className="h-px flex-1 bg-white/10" />
                    </div>
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                        </div>
                    ) : (
                        replies.map((m) => <Row key={m.id} m={m} />)
                    )}
                </div>
                <div className="border-t border-white/10 p-3 shrink-0">
                    <div className="flex items-end gap-2">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            rows={1}
                            placeholder="Trả lời thread…"
                            maxLength={4000}
                            className="flex-1 resize-none bg-zinc-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 max-h-40"
                        />
                        <button
                            onClick={handleSend}
                            disabled={sending || !text.trim()}
                            className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
