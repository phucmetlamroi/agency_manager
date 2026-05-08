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
    EyeOff,
    Forward,
    Pin,
    PinOff,
    Star,
    Megaphone,
    CornerDownRight,
} from 'lucide-react'
import type { ChatMessage } from '@/hooks/useChatMessages'
import {
    recallMessage,
    editMessage,
    markViewOnceViewed,
    deleteMessageForMe,
    pinMessage,
    unpinMessage,
    setMessageImportant,
} from '@/actions/chat-actions'
import { splitMentions, type MentionableUser } from '@/lib/mentions'
import { ForwardMessageDialog } from './ForwardMessageDialog'
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
    onMessageHidden?: (messageId: string) => void
    canPin?: boolean   // GROUP: only creator. DIRECT/TASK: any participant.
    participants?: MentionableUser[]
    currentUserId: string
}

export function MessageBubble({ message, isMine, onReply, onReact, onMessageUpdated, onMessageHidden, canPin = true, participants = [], currentUserId }: MessageBubbleProps) {
    const [showActions, setShowActions] = useState(false)
    const [showReactions, setShowReactions] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState(message.content || '')
    const [viewOnceModal, setViewOnceModal] = useState(false)
    const [viewOnceUrl, setViewOnceUrl] = useState<string | null>(null)
    const [showForward, setShowForward] = useState(false)
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
            <div data-message-id={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 rounded-2xl`}>
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

    const handleDeleteForMe = async () => {
        if (!confirm('Hide this message from your view? Other participants will still see it.')) return
        const res = await deleteMessageForMe(message.id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        onMessageHidden?.(message.id)
        setShowMenu(false)
    }

    const handlePin = async () => {
        const res = message.isPinned ? await unpinMessage(message.id) : await pinMessage(message.id)
        if (res.error) {
            toast.error(res.error)
            return
        }
        onMessageUpdated?.(message.id, { isPinned: !message.isPinned })
        toast.success(message.isPinned ? 'Unpinned' : 'Pinned')
        setShowMenu(false)
    }

    const handleToggleImportant = async () => {
        const next = !message.isImportant
        const res = await setMessageImportant(message.id, next)
        if (res.error) {
            toast.error(res.error)
            return
        }
        onMessageUpdated?.(message.id, { isImportant: next })
        setShowMenu(false)
    }

    const handleForward = () => {
        setShowForward(true)
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
    const isAnnouncement = message.type === 'ANNOUNCEMENT'
    const isForwarded = !!message.forwardedFromMessageId
    const isMentioningMe = (message.mentions || []).includes(currentUserId)

    // Render TEXT content with mention pills
    const renderContent = (content: string | null) => {
        if (!content) return null
        const segments = splitMentions(content, participants)
        return segments.map((seg, i) => {
            if (seg.type === 'text') return <span key={i}>{seg.value}</span>
            const isMe = seg.userId === currentUserId
            return (
                <span
                    key={i}
                    className={`inline-flex items-center font-semibold rounded px-1 ${
                        isMe
                            ? 'bg-amber-500/25 text-amber-200'
                            : 'bg-violet-500/20 text-violet-300'
                    }`}
                >
                    @{seg.handle}
                </span>
            )
        })
    }

    // Announcement renders as full-width banner instead of bubble
    if (isAnnouncement && !editing) {
        return (
            <div data-message-id={message.id} className="my-2 mx-2 rounded-2xl">
                <div className="rounded-2xl bg-gradient-to-br from-fuchsia-600/15 to-violet-600/15 border border-fuchsia-500/30 px-4 py-3 shadow-[0_0_24px_rgba(217,70,239,0.15)]">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Megaphone className="w-3.5 h-3.5 text-fuchsia-300" />
                        <span className="text-[10px] uppercase tracking-wide text-fuchsia-300 font-bold">Announcement</span>
                        <span className="text-[10px] text-zinc-500">· {message.sender.nickname || message.sender.username}</span>
                        <span className="text-[10px] text-zinc-600 ml-auto">{time}</span>
                    </div>
                    <p className="m-0 text-[14px] leading-relaxed text-zinc-100 break-words whitespace-pre-wrap">
                        {renderContent(message.content)}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <>
            <div
                data-message-id={message.id}
                className={`flex gap-2 mb-2 group rounded-2xl ${isMine ? 'flex-row-reverse' : ''}`}
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

                    {isForwarded && (
                        <div className="flex items-center gap-1 text-[10px] text-zinc-500 italic px-1 mb-0.5">
                            <CornerDownRight className="w-2.5 h-2.5" /> Forwarded
                        </div>
                    )}

                    <div className={`relative ${
                        message.type === 'IMAGE' && !isViewOnceCard && !isExpiredViewOnce ? 'p-1' : 'px-3.5 py-2'
                    } ${
                        message.isImportant
                            ? isMine
                                ? 'rounded-2xl rounded-tr-sm bg-amber-500/15 border border-amber-500/40 shadow-[0_0_16px_rgba(251,191,36,0.15)]'
                                : 'rounded-2xl rounded-tl-sm bg-amber-500/10 border border-amber-500/30 shadow-[0_0_16px_rgba(251,191,36,0.1)]'
                            : isMentioningMe
                                ? isMine
                                    ? 'rounded-2xl rounded-tr-sm bg-violet-500/25 border border-violet-500/40'
                                    : 'rounded-2xl rounded-tl-sm bg-violet-500/[0.10] border border-violet-500/30'
                                : isMine
                                    ? 'rounded-2xl rounded-tr-sm bg-violet-500/15 border border-violet-500/20'
                                    : 'rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/[0.06]'
                    }`}>
                        {message.isImportant && (
                            <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                                <Star className="w-2.5 h-2.5 text-white fill-white" />
                            </div>
                        )}
                        {message.isPinned && (
                            <div className="absolute -top-2 left-2 px-1.5 h-4 rounded-full bg-amber-500/30 border border-amber-500/40 flex items-center gap-0.5">
                                <Pin className="w-2 h-2 text-amber-300" />
                                <span className="text-[8px] text-amber-300 font-bold">PINNED</span>
                            </div>
                        )}
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
                                        {renderContent(message.content)}
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
                                            <button onClick={handleForward} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                <Forward className="w-3 h-3" /> Forward
                                            </button>
                                            {canPin && !message.isDeleted && message.type !== 'SYSTEM' && (
                                                <button onClick={handlePin} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                    {message.isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                                    {message.isPinned ? 'Unpin' : 'Pin message'}
                                                </button>
                                            )}
                                            {isMine && message.type === 'TEXT' && !message.isDeleted && (
                                                <button onClick={handleToggleImportant} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                    <Star className={`w-3 h-3 ${message.isImportant ? 'text-amber-400 fill-amber-400' : ''}`} />
                                                    {message.isImportant ? 'Unmark important' : 'Mark important'}
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button onClick={() => { setEditing(true); setShowMenu(false) }} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                    <Pencil className="w-3 h-3" /> Edit
                                                </button>
                                            )}
                                            <div className="h-px bg-white/[0.06] my-0.5" />
                                            <button onClick={handleDeleteForMe} className="w-full px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2">
                                                <EyeOff className="w-3 h-3" /> Delete for me
                                            </button>
                                            {canRecall && (
                                                <button onClick={handleRecall} className="w-full px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 cursor-pointer text-left flex items-center gap-2">
                                                    <Trash2 className="w-3 h-3" /> Delete for everyone
                                                </button>
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

            {/* Forward dialog */}
            <ForwardMessageDialog
                isOpen={showForward}
                onClose={() => setShowForward(false)}
                messageId={message.id}
                messagePreview={message.content || message.fileName || undefined}
            />

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
