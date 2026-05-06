'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { searchMessages } from '@/actions/chat-actions'

interface MessageSearchPanelProps {
    isOpen: boolean
    onClose: () => void
    conversationId: string
    onResultClick: (messageId: string) => void
}

interface SearchResult {
    id: string
    content: string | null
    createdAt: string
    sender: {
        id: string
        username: string
        nickname: string | null
        avatarUrl: string | null
    }
}

function highlight(text: string, query: string) {
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return <>{text}</>
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + query.length)
    const after = text.slice(idx + query.length)
    return (
        <>
            {before}
            <mark className="bg-violet-500/30 text-violet-200 rounded px-0.5">{match}</mark>
            {after}
        </>
    )
}

export function MessageSearchPanel({ isOpen, onClose, conversationId, onResultClick }: MessageSearchPanelProps) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResult[]>([])
    const [loading, setLoading] = useState(false)
    const [searched, setSearched] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const runSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) {
            setResults([])
            setSearched(false)
            return
        }
        setLoading(true)
        setSearched(true)
        const res = await searchMessages(conversationId, q)
        setLoading(false)
        if (res.data) setResults(res.data)
        else setResults([])
    }, [conversationId])

    useEffect(() => {
        if (!isOpen) {
            setQuery('')
            setResults([])
            setSearched(false)
        }
    }, [isOpen])

    const handleChange = (val: string) => {
        setQuery(val)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => runSearch(val), 300)
    }

    if (!isOpen) return null

    return (
        <div className="absolute top-[58px] right-0 left-0 mx-3 bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-[0_24px_60px_rgba(0,0,0,0.5)] z-30 max-h-[60vh] flex flex-col overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05]">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                    value={query}
                    onChange={e => handleChange(e.target.value)}
                    placeholder="Search messages in this conversation..."
                    className="flex-1 bg-transparent border-none outline-none text-zinc-200 text-[13px] py-1 font-[inherit] placeholder:text-zinc-600"
                    autoFocus
                />
                <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 cursor-pointer bg-transparent border-none">
                    <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <div className="flex justify-center p-4">
                        <Loader2 className="animate-spin w-4 h-4 text-violet-500" />
                    </div>
                )}

                {!loading && query.trim().length < 2 && !searched && (
                    <div className="text-center py-6 text-zinc-500 text-[12px]">
                        Type at least 2 characters to search
                    </div>
                )}

                {!loading && searched && results.length === 0 && query.trim().length >= 2 && (
                    <div className="text-center py-6 text-zinc-500 text-[12px]">
                        No messages found
                    </div>
                )}

                {!loading && results.map(r => {
                    const time = new Date(r.createdAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                    const senderName = r.sender.nickname || r.sender.username
                    return (
                        <button
                            key={r.id}
                            onClick={() => onResultClick(r.id)}
                            className="w-full text-left px-3 py-2.5 hover:bg-violet-500/[0.08] cursor-pointer border-none bg-transparent border-b border-white/[0.03]"
                        >
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[11px] font-semibold text-violet-400">{senderName}</span>
                                <span className="text-[10px] text-zinc-500">{time}</span>
                            </div>
                            <div className="text-[12px] text-zinc-300 line-clamp-2">
                                {r.content ? highlight(r.content, query) : <span className="italic text-zinc-500">(empty)</span>}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Footer hint */}
            {results.length > 0 && (
                <div className="px-3 py-1.5 border-t border-white/[0.05] text-center">
                    <span className="text-[10px] text-zinc-600">{results.length} result{results.length === 1 ? '' : 's'} · click to jump</span>
                </div>
            )}
        </div>
    )
}
