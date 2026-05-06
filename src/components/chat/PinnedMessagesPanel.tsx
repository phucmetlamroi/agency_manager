'use client'

import { useState, useEffect, useCallback } from 'react'
import { Pin, X, Loader2, Trash2 } from 'lucide-react'
import { getPinnedMessages, unpinMessage } from '@/actions/chat-actions'
import { toast } from 'sonner'

interface PinnedMessage {
    id: string
    content: string | null
    type: string
    fileUrl: string | null
    fileName: string | null
    fileSize: number | null
    createdAt: string
    pinnedAt: string
    pinnedByName: string
    sender: {
        id: string
        username: string
        nickname: string | null
        avatarUrl: string | null
    }
}

interface PinnedMessagesPanelProps {
    isOpen: boolean
    onClose: () => void
    conversationId: string
    canManage: boolean
    onPinClick: (messageId: string) => void
    onUnpinned?: (messageId: string) => void
}

export function PinnedMessagesPanel({ isOpen, onClose, conversationId, canManage, onPinClick, onUnpinned }: PinnedMessagesPanelProps) {
    const [pins, setPins] = useState<PinnedMessage[]>([])
    const [loading, setLoading] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        const res = await getPinnedMessages(conversationId)
        if (res.data) setPins(res.data)
        setLoading(false)
    }, [conversationId])

    useEffect(() => {
        if (isOpen) load()
    }, [isOpen, load])

    const handleUnpin = async (messageId: string) => {
        if (!confirm('Unpin this message?')) return
        const res = await unpinMessage(messageId)
        if (res.error) {
            toast.error(res.error)
            return
        }
        setPins(prev => prev.filter(p => p.id !== messageId))
        toast.success('Unpinned')
        onUnpinned?.(messageId)
    }

    if (!isOpen) return null

    return (
        <div className="absolute top-[58px] right-0 left-0 mx-3 bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-amber-500/20 shadow-[0_24px_60px_rgba(0,0,0,0.5)] z-30 max-h-[60vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-amber-500/10">
                <div className="flex items-center gap-2">
                    <Pin className="w-3.5 h-3.5 text-amber-400" />
                    <h3 className="text-[13px] font-bold text-white m-0">Pinned messages</h3>
                    {pins.length > 0 && (
                        <span className="text-[10px] text-zinc-500">({pins.length})</span>
                    )}
                </div>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 cursor-pointer bg-transparent border-none">
                    <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {loading && (
                    <div className="flex justify-center p-4">
                        <Loader2 className="animate-spin w-4 h-4 text-amber-500" />
                    </div>
                )}

                {!loading && pins.length === 0 && (
                    <div className="text-center py-6 text-zinc-500 text-[12px]">No pinned messages yet</div>
                )}

                {!loading && pins.map(p => {
                    const senderName = p.sender.nickname || p.sender.username
                    const time = new Date(p.pinnedAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                    return (
                        <div key={p.id} className="group/pin px-3 py-2.5 border-b border-white/[0.03] hover:bg-amber-500/[0.04] transition-colors">
                            <div className="flex items-start gap-2">
                                <div
                                    className="flex-1 cursor-pointer min-w-0"
                                    onClick={() => onPinClick(p.id)}
                                >
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[11px] font-semibold text-amber-400">{senderName}</span>
                                        <span className="text-[10px] text-zinc-500">{time}</span>
                                    </div>
                                    {p.type === 'IMAGE' && p.fileUrl ? (
                                        <div className="text-[12px] text-zinc-400 italic">📷 Photo</div>
                                    ) : p.type === 'FILE' ? (
                                        <div className="text-[12px] text-zinc-400 italic">📎 {p.fileName || 'File'}</div>
                                    ) : (
                                        <div className="text-[12px] text-zinc-300 line-clamp-3">{p.content || <span className="italic text-zinc-500">(empty)</span>}</div>
                                    )}
                                    <div className="text-[10px] text-zinc-600 mt-1">Pinned by {p.pinnedByName}</div>
                                </div>
                                {canManage && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUnpin(p.id) }}
                                        className="opacity-0 group-hover/pin:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/15 cursor-pointer bg-transparent border-none"
                                        title="Unpin"
                                    >
                                        <Trash2 className="w-3 h-3 text-red-400" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
