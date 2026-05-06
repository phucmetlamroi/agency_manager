'use client'

import { useState, useEffect, useRef } from 'react'
import {
    SmilePlus,
    Reply,
    Download,
    MoreHorizontal,
    Pencil,
    Trash2,
    Copy,
    Lock,
    Eye,
} from 'lucide-react'
import type { ChatMessage } from '@/hooks/useChatMessages'
import { recallMessage, editMessage, markViewOnceViewed } from '@/actions/chat-actions'
import { toast } from 'sonner'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']
const RECALL_WINDOW_MS = 10 * 60 * 1000   // 10 minutes
const EDIT_WINDOW_MS = 15 * 60 * 1000     // 15 minutes

interface MessageBubbleProps {
    message: ChatMessage
    isMine: boolean
    onReply?: (message: ChatMessage) => void
    onReact?: (messageId: string, emoji: string) => void
    onMessageUpdated?: (messageId: string, updates: Partial<ChatMessage>) => void
    currentUserId: string
}

export function MessageBubble({ message, isMine, onReply, onReact, onMessageUpdated, currentUserId }: MessageBubbleProps) {
    const [showActions, setShowActions] = useState(false)
    const [showReactions, setShowReactions] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState(message.content || '')
    const [viewOnceModal, setViewOnceModal] = useState(false)
    const [viewOnceUrl, setViewOnceUrl] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Close action menu on outside click
    useEffect(() => {
        if (!showMenu) return
        const onClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [showMenu])

    if (message.isDeleted) {
        return (
            <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className="px-3.5 py-2 rounded-2xl bg-white/[0.03] text-zinc-500 text-[13px] italic flex items-center gap-2">
                    <Trash2 className="w-3 h-3" />
                    {isMine ? 'You recalled this message' : 'This message was recalled'}
                </div>
            </div>
        )
    }

    const senderName = message.sender.nickname || message.sender.username
    const initials = senderName.charAt(0).toUpperCase()
    const time = new Date(message.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    const ageMs = Date.now() - new Date(message.createdAt).getTime()
    const canRecall = isMine && ageMs < RECALL_WINDOW_MS
    const canEdit = isMine && message.type === 'TEXT' && ageMs < EDIT_WINDOW_MS

    const handleRecall = async () => {
        if (!confirm('Delete this message for everyone? This cannot be undone.')) return
        const res = await recallMessage(message.id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        onMessageUpdated?.(message.id, { isDeleted: true, deletedAt: res.data?.deletedAt })
        setShowMenu(false)
    }

    const handleEditSubmit = async () => {
        const trimmed = editValue.trim()
        if (!trimmed || trimmed === message.content) {
            setEditing(false)
            return
        }
        const res = await editMessage(message.id, trimmed)
        if (res.error) {
            toast.error(res.error)
            return
        }
        onMessageUpdated?.(message.id, {
            content: res.data?.content || trimmed,
            isEdited: true,
            editedAt: res.data?.editedAt,
        })
        setEditing(false)
    }

    const handleCopy = () => {
        if (message.content) navigator.clipboard.writeText(message.content)
        setShowMenu(false)
        toast.success('Copied')
    }

    const handleViewOnce = async () => {
        // For sender: show their own (no marking needed) — sender always sees content.
        // For recipient: call mark, fetch the URL once, then open modal.
        if (isMine) {
            setViewOnceUrl(message.fileUrl)
            setViewOnceModal(true)
            return
        }
        if (message.viewed) {
            toast.error('Already viewed — content has expired')
            return
        }
        const res = await markViewOnceViewed(message.id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        // Note: message.fileUrl is still set in current local state at this moment.
        setViewOnceUrl(message.fileUrl)
        setViewOnceModal(true)
        // After viewing, mark as viewed in local state so subsequent renders show "expired"
        onMessageUpdated?.(message.id, { viewed: true, expired: true, fileUrl: null, content: null })
    }

    const isViewOnce = !!message.viewOnce
    const isExpiredViewOnce = isViewOnce && message.expired
    const isViewOnceCard = isViewOnce && !isMine && !message.viewed && !message.expired

    return (
        <>
            <div
                className={`flex gap-2 mb-2 group ${isMine ? 'flex-row-reverse' : ''}`}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => { setShowActions(false); setShowReactions(false) }}
            >
                {!isMine && (
                    <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{
                            background: message.sender.avatarUrl
                                ? `url(${message.sender.avatarUrl}) center/cover`
                                : 'linear-gradient(135deg,#6366F1,#8B5CF6)',
                        }}
                    >
                        {!message.sender.avatarUrl && initials}
                    </div>
                )}

                <div className={`max-w-[70%] min-w-[80px] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!isMine && (
                        <span className="text-[11px] text-violet-400 font-semibold mb-0.5 pl-1">
                            {senderName}
                        </span>
                    )}

                    {message.replyTo && (
                        <div className="text-[11px] text-zinc-500 px-2.5 py-1 mb-0.5 border-l-2 border-violet-500 rounded-r-lg bg-violet-500/[0.08] max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                            <span className="font-semibold">{message.replyTo.sender.nickname || message.replyTo.sender.username}</span>
                            : {message.replyTo.content?.slice(0, 60)}
                        </div>
                    )}

                    <div className={`relative ${
                        message.type === 'IMAGE' && !isViewOnceCard && !isExpiredViewOnce ? 'p-1' : 'px-3.5 py-2'
                    } ${
                        isMine
                            ? 'rounded-2xl rounded-tr-sm bg-violet-500/15 border border-violet-500/20'
                            : 'rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/[0.06]'
                    }`}>
                        {/* Edit mode (TEXT only) */}
                        {editing ? (
                            <div className="flex flex-col gap-2 min-w-[200px]">
                                <textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    className="bg-zinc-900/60 text-zinc-100 text-[13px] rounded-md p-2 resize-none border border-violet-500/20 outline-none focus:border-violet-500/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit() }
                                        if (e.key === 'Escape') { setEditing(false); setEditValue(message.content || '') }
                                    }}
                                />
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => { setEditing(false); setEditValue(message.content || '') }} className="text-[11px] text-zinc-400 px-2 py-1 rounded hover:bg-white/5">Cancel</button>
                                    <button onClick={handleEditSubmit} className="text-[11px] text-white bg-violet-500 px-3 py-1 rounded hover:bg-violet-600">Save</button>
                                </div>
                            </div>
                        ) : isExpiredViewOnce ? (
                            <div className="flex items-center gap-2 text-zinc-500 italic text-[13px]">
                                <Lock className="w-3.5 h-3.5" />
                                Expired — view-once content
                            </div>
                        ) : isViewOnceCard ? (
                            <button
                                onClick={handleViewOnce}
                                className="flex items-center gap-2.5 px-2 py-1 cursor-pointer bg-transparent border-none text-violet-300 hover:text-violet-200"
                            >
                                <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center">
                                    <Lock className="w-4 h-4 text-violet-300" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-[13px] font-semibold">Tap to view once</span>
                                    <span className="text-[10px] text-zinc-500">{message.type === 'IMAGE' ? 'Photo' : 'File'} · view-once</span>
                                </div>
                            </button>
                        ) : (
                            <>
                                {message.type === 'IMAGE' && message.fileUrl && (
                                    <div className="relative">
                                        <img
                                            src={message.fileUrl}
                                            alt={message.fileName || 'image'}
                                            className="max-w-[280px] max-h-[300px] rounded-xl block cursor-pointer"
                                            loading="lazy"
                                            onClick={() => isViewOnce ? handleViewOnce() : null}
                                        />
                                        {isViewOnce && (
                                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur rounded-full px-2 py-0.5 flex items-center gap-1">
                                                <Eye className="w-3 h-3 text-violet-300" />
                                                <span className="text-[10px] text-violet-300 font-semibold">1×</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {message.type === 'FILE' && message.fileUrl && (
                                    <a
                                        href={isViewOnce ? undefined : message.fileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={isViewOnce ? (e) => { e.preventDefault(); handleViewOnce() } : undefined}
                                        className="flex items-center gap-2 text-indigo-300 no-underline cursor-pointer"
                                    >
                                        {isViewOnce ? <Lock className="w-4 h-4 shrink-0 text-violet-300" /> : <Download className="w-4 h-4 shrink-0" />}
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                                                {message.fileName}
                                            </div>
                                            {message.fileSize && (
                                                <div className="text-[10px] text-zinc-500">
                                                    {(message.fileSize / 1024).toFixed(0)} KB
                                                    {isViewOnce && ' · view-once'}
                                                </div>
                                            )}
                                        </div>
                                    </a>
                                )}

                                {message.type === 'TEXT' && (
                                    <p className="m-0 text-[13px] leading-relaxed text-zinc-200 break-words whitespace-pre-wrap">
                                        {message.content}
                                    </p>
                                )}

                                {message.type === 'SYSTEM' && (
                                    <p className="m-0 text-xs text-zinc-500 italic text-center">
                                        {message.content}
                                    </p>
                                )}
                            </>
                        )}

                        {showActions && !editing && !isExpiredViewOnce && (
                            <div
                                className={`absolute flex gap-1 ${isMine ? '-left-2' : '-right-2'} -top-2.5 bg-zinc-900 border border-violet-500/20 rounded-lg px-1 py-0.5 z-10`}
                            >
                                <button onClick={() => setShowReactions(!showReactions)} className="p-0.5 cursor-pointer bg-transparent border-none" title="React">
                                    <SmilePlus className="w-3.5 h-3.5 text-zinc-400 hover:text-violet-400" />
                                </button>
                                {onReply && (
                                    <button onClick={() => onReply(message)} className="p-0.5 cursor-pointer bg-transparent border-none" title="Reply">
                                        <Reply className="w-3.5 h-3.5 text-zinc-400 hover:text-violet-400" />
                                    </button>
                                )}
                                <div ref={menuRef} className="relative">
                                    <button onClick={() => setShowMenu(!showMenu)} className="p-0.5 cursor-pointer bg-transparent border-none" title="More">
                                        <MoreHorizontal className="w-3.5 h-3.5 text-zinc-400 hover:text-violet-400" />
                                    </button>
                                    {showMenu && (
                                        <div className={`absolute z-20 mt-1 ${isMine ? 'right-0' : 'left-0'} bg-zinc-900 border border-violet-500/20 rounded-lg shadow-xl py-1 min-w-[160px]`}>
                                            {message.type === 'TEXT' && message.content && (
                                                <button onClick={handleCopy} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                    <Copy className="w-3 h-3" /> Copy text
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button onClick={() => { setEditing(true); setShowMenu(false) }} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                    <Pencil className="w-3 h-3" /> Edit
                                                </button>
                                            )}
                                            {canRecall && (
                                                <button onClick={handleRecall} className="w-full px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 cursor-pointer text-left flex items-center gap-2">
                                                    <Trash2 className="w-3 h-3" /> Delete for everyone
                                                </button>
                                            )}
                                            {!canRecall && !canEdit && message.type !== 'TEXT' && (
                                                <div className="px-3 py-1.5 text-[11px] text-zinc-500 italic">No actions available</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {showReactions && (
                        <div className="flex gap-1 mt-1 px-2 py-1 bg-zinc-900 border border-violet-500/20 rounded-xl">
                            {QUICK_REACTIONS.map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => { onReact?.(message.id, emoji); setShowReactions(false) }}
                                    className="text-base cursor-pointer bg-transparent border-none p-0.5 rounded-md hover:bg-white/10 transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}

                    {message.reactions.length > 0 && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                            {message.reactions.map(r => (
                                <button
                                    key={r.emoji}
                                    onClick={() => onReact?.(message.id, r.emoji)}
                                    className={`text-xs px-1.5 py-0.5 rounded-full cursor-pointer text-zinc-200 ${
                                        r.userIds.includes(currentUserId)
                                            ? 'bg-violet-500/20 border border-violet-500/40'
                                            : 'bg-white/[0.06] border border-white/[0.08]'
                                    }`}
                                >
                                    {r.emoji} {r.count}
                                </button>
                            ))}
                        </div>
                    )}

                    <span className="text-[10px] text-zinc-500 mt-0.5 px-1">
                        {time}
                        {message.isEdited && <span className="italic"> · edited</span>}
                    </span>
                </div>
            </div>

            {/* View-once full-screen modal */}
            {viewOnceModal && viewOnceUrl && (
                <div
                    className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 cursor-pointer"
                    onClick={() => setViewOnceModal(false)}
                >
                    <div className="absolute top-4 right-4 text-white/60 text-xs flex items-center gap-2">
                        <Lock className="w-4 h-4" /> View once · tap anywhere to close
                    </div>
                    {message.type === 'IMAGE' ? (
                        <img src={viewOnceUrl} alt="" className="max-w-[90vw] max-h-[90vh] rounded-2xl" />
                    ) : (
                        <div className="bg-zinc-900 border border-violet-500/20 rounded-2xl p-6 text-zinc-200 max-w-md">
                            <div className="text-sm font-semibold mb-2">{message.fileName}</div>
                            <a href={viewOnceUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm underline">
                                Open file (you can only view this once)
                            </a>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
