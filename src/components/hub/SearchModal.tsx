'use client'

import { useEffect, useState } from 'react'
import { Search, Loader2, X, Hash } from 'lucide-react'
import { searchMessages, type SearchHitDTO } from '@/actions/search-actions'

function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * [Chat] Workspace-wide message search, scoped server-side to the caller's viewable
 * channels (searchMessages → visibleChannelWhere). Click a hit to jump to its channel.
 */
export default function SearchModal({
    workspaceId,
    onClose,
    onJump,
}: {
    workspaceId: string
    onClose: () => void
    onJump: (channelId: string) => void
}) {
    const [q, setQ] = useState('')
    const [hits, setHits] = useState<SearchHitDTO[]>([])
    const [loading, setLoading] = useState(false)
    const [searched, setSearched] = useState(false)

    useEffect(() => {
        const term = q.trim()
        if (term.length < 2) {
            setHits([])
            setSearched(false)
            return
        }
        setLoading(true)
        let cancelled = false
        const id = setTimeout(() => {
            searchMessages(workspaceId, term)
                .then((res) => {
                    if (cancelled) return // a newer query superseded this one
                    setHits(res)
                    setSearched(true)
                })
                .finally(() => {
                    if (!cancelled) setLoading(false)
                })
        }, 300)
        return () => {
            cancelled = true
            clearTimeout(id)
        }
    }, [q, workspaceId])

    return (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-[10vh]" onClick={onClose}>
            <div
                className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                    <Search className="w-4 h-4 text-zinc-500 shrink-0" />
                    <input
                        autoFocus
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Tìm tin nhắn trong các kênh của bạn…"
                        className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                    />
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
                    <button onClick={onClose} className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="max-h-[55vh] overflow-y-auto">
                    {!searched && q.trim().length < 2 && (
                        <p className="px-4 py-8 text-center text-sm text-zinc-500">Nhập ít nhất 2 ký tự để tìm.</p>
                    )}
                    {searched && hits.length === 0 && !loading && (
                        <p className="px-4 py-8 text-center text-sm text-zinc-500">Không tìm thấy kết quả.</p>
                    )}
                    {hits.map((h) => (
                        <button
                            key={h.id}
                            onClick={() => {
                                onJump(h.channelId)
                                onClose()
                            }}
                            className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-0.5">
                                <Hash className="w-3 h-3" /> {h.channelName}
                                <span className="ml-auto">{fmtDate(h.createdAt)}</span>
                            </div>
                            <div className="text-sm text-zinc-200">
                                <span className="font-semibold text-zinc-100">{h.authorName}: </span>
                                <span className="line-clamp-2">{h.content}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
