'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Search, Forward, Loader2, ClipboardList } from 'lucide-react'
import { getConversations, forwardMessage } from '@/actions/chat-actions'
import { useChatContext } from './ChatProvider'
import { toast } from 'sonner'

interface ForwardMessageDialogProps {
    isOpen: boolean
    onClose: () => void
    messageId: string
    messagePreview?: string
}

interface ConversationOption {
    id: string
    type: string
    name: string | null
    avatarUrl: string | null
    task: { title: string } | null
    participants: { userId: string; user: { id: string; username: string; nickname: string | null; avatarUrl: string | null } }[]
}

export function ForwardMessageDialog({ isOpen, onClose, messageId, messagePreview }: ForwardMessageDialogProps) {
    const { currentUserId } = useChatContext()
    const [conversations, setConversations] = useState<ConversationOption[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const res = await getConversations()
        if (res.data) setConversations(res.data as any)
        setLoading(false)
    }, [])

    useEffect(() => {
        if (isOpen) {
            load()
            setSelected(new Set())
            setSearch('')
        }
    }, [isOpen, load])

    const getDisplayName = (conv: ConversationOption) => {
        if (conv.type === 'DIRECT') {
            const other = conv.participants.find(p => p.userId !== currentUserId)
            return other?.user.nickname || other?.user.username || 'Unknown'
        }
        if (conv.type === 'TASK') return conv.task?.title || conv.name || 'Task Chat'
        return conv.name || 'Group'
    }

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleSubmit = async () => {
        if (selected.size === 0) return
        setSubmitting(true)
        const res = await forwardMessage(messageId, Array.from(selected))
        setSubmitting(false)
        if (res.error) {
            toast.error(res.error)
            return
        }
        toast.success(`Forwarded to ${res.data?.count || selected.size} conversation(s)`)
        onClose()
    }

    const filtered = conversations.filter(c => {
        if (!search.trim()) return true
        return getDisplayName(c).toLowerCase().includes(search.toLowerCase())
    })

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[420px] max-h-[70vh] bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-violet-500/10">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                            <Forward className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <h3 className="text-[15px] font-bold text-white m-0">Forward Message</h3>
                    </div>
                    <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors">
                        <X className="w-[18px] h-[18px] text-zinc-500" />
                    </button>
                </div>

                {/* Preview */}
                {messagePreview && (
                    <div className="px-[18px] py-2 border-b border-white/[0.05]">
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Forwarding</div>
                        <div className="text-[12px] text-zinc-300 line-clamp-2 italic">"{messagePreview.slice(0, 120)}{messagePreview.length > 120 ? '...' : ''}"</div>
                    </div>
                )}

                {/* Search */}
                <div className="px-[18px] py-2 border-b border-white/[0.05]">
                    <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-2.5 border border-zinc-700/50">
                        <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search conversations..."
                            className="flex-1 bg-transparent border-none outline-none text-zinc-200 text-[13px] py-2 placeholder:text-zinc-600"
                            autoFocus
                        />
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading && (
                        <div className="flex justify-center p-5">
                            <Loader2 className="animate-spin w-5 h-5 text-violet-500" />
                        </div>
                    )}
                    {!loading && filtered.length === 0 && (
                        <div className="text-center py-6 text-zinc-500 text-[13px]">No conversations found</div>
                    )}
                    {!loading && filtered.map(conv => {
                        const name = getDisplayName(conv)
                        const isSelected = selected.has(conv.id)
                        return (
                            <button
                                key={conv.id}
                                onClick={() => toggle(conv.id)}
                                className={`w-full flex items-center gap-2.5 py-2.5 px-[18px] cursor-pointer transition-colors hover:bg-zinc-800/50 border-none bg-transparent text-left ${isSelected ? 'bg-violet-500/[0.08]' : ''}`}
                            >
                                {conv.type === 'TASK' ? (
                                    <div className="w-8 h-8 rounded-lg shrink-0 bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                                        <ClipboardList className="w-4 h-4 text-violet-400" />
                                    </div>
                                ) : conv.avatarUrl ? (
                                    <div className="w-8 h-8 rounded-full shrink-0 bg-center bg-cover" style={{ backgroundImage: `url(${conv.avatarUrl})` }} />
                                ) : (
                                    <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[12px] font-bold text-white">
                                        {name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-medium text-zinc-200 truncate">{name}</div>
                                    <div className="text-[10px] text-zinc-500">{conv.type === 'DIRECT' ? 'Direct' : conv.type === 'GROUP' ? 'Group' : 'Task chat'}</div>
                                </div>
                                {isSelected && (
                                    <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                                        <span className="text-white text-xs font-bold">&#10003;</span>
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Footer */}
                <div className="px-[18px] py-3 border-t border-violet-500/10">
                    <button
                        onClick={handleSubmit}
                        disabled={selected.size === 0 || submitting}
                        className="w-full py-2.5 rounded-xl border-none text-[13px] font-bold cursor-pointer bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.3)] hover:bg-violet-600 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Forward to {selected.size > 0 ? selected.size : ''} {selected.size === 1 ? 'conversation' : 'conversations'}
                    </button>
                </div>
            </div>
        </div>
    )
}
