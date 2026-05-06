'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatMessages, type ChatMessage } from '@/hooks/useChatMessages'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { useChatContext } from './ChatProvider'
import { getConversationChannel, getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { supabase } from '@/lib/supabase'
import { markAsRead, toggleReaction, getConversations, getMessages as fetchMessages, setConversationMuted } from '@/actions/chat-actions'
import { uploadChatFile } from '@/actions/chat-upload-actions'
import { playNotificationSound } from '@/lib/notification-sound'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { GroupMembersDialog } from './GroupMembersDialog'
import { RenameGroupDialog } from './RenameGroupDialog'
import { MessageSearchPanel } from './MessageSearchPanel'
import { Loader2, ClipboardList, User, Briefcase, Users, Pencil, Bell, BellOff, Search } from 'lucide-react'
import { toast } from 'sonner'

// ★ Fire-and-forget: properly subscribe → send → cleanup
// The old code created channels without subscribe() so send() silently failed.
function notifyParticipantChannels(conversationId: string, senderId: string, message: any) {
    fetch(`/api/chat/participants?conversationId=${conversationId}`)
        .then(r => r.json())
        .then(({ userIds }) => {
            const senderName = message.sender?.nickname || message.sender?.username || ''
            ;(userIds || []).forEach((uid: string) => {
                if (uid === senderId) return
                const channelName = getUserNotificationChannel(uid)
                const ch = supabase.channel(channelName)
                ch.subscribe((status: string) => {
                    if (status === 'SUBSCRIBED') {
                        ch.send({
                            type: 'broadcast',
                            event: CHAT_EVENTS.NEW_MESSAGE,
                            payload: { conversationId, senderId, senderName, message },
                        }).finally(() => {
                            setTimeout(() => supabase.removeChannel(ch), 500)
                        })
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        supabase.removeChannel(ch)
                    }
                })
            })
        })
        .catch(() => { /* Non-critical — polling catches up */ })
}

interface ConversationMeta {
    type: string
    name?: string | null
    isCreator?: boolean
    isMuted?: boolean
    taskTitle?: string
    clientName?: string | null
    assigneeName?: string | null
    participantNames?: string[]
}

interface ChatWindowProps {
    conversationId: string
    conversationName: string
}

export function ChatWindow({ conversationId, conversationName }: ChatWindowProps) {
    const { currentUserId, setActiveConversationId, setConversationMutedLocal, setIsPanelOpen } = useChatContext()
    const [meta, setMeta] = useState<ConversationMeta | null>(null)
    const [displayName, setDisplayName] = useState(conversationName)
    const { messages, hasMore, isLoading, loadMessages, sendMessage, addIncomingMessage, addOptimisticMessage, updateMessage, removeMessage, reset } = useChatMessages(conversationId as string)
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
    const [typingUsers, setTypingUsers] = useState<string[]>([])
    const [showGroupMembers, setShowGroupMembers] = useState(false)
    const [showRenameDialog, setShowRenameDialog] = useState(false)
    const [showSearchPanel, setShowSearchPanel] = useState(false)
    const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const lastTypingSentRef = useRef(0)

    // ── Load messages on conversation change ──────────────────
    useEffect(() => {
        setDisplayName(conversationName)
        setActiveConversationId(conversationId)
        reset()
        loadMessages(true)
        markAsRead(conversationId)

        getConversations().then(res => {
            if (res.data) {
                const conv = res.data.find((c: any) => c.id === conversationId)
                if (conv) {
                    const otherNames = conv.participants
                        .filter((p: any) => p.userId !== currentUserId)
                        .map((p: any) => p.user.nickname || p.user.username)
                    setMeta({
                        type: conv.type,
                        name: conv.name,
                        isCreator: conv.isCreator,
                        isMuted: conv.isMuted,
                        taskTitle: conv.task?.title,
                        clientName: conv.task?.clientName,
                        assigneeName: conv.task?.assigneeName,
                        participantNames: otherNames,
                    })
                    if (conv.name && conv.type === 'GROUP') setDisplayName(conv.name)
                }
            }
        })

        return () => setActiveConversationId(null)
    }, [conversationId])

    // ── Polling fallback — fetch new messages every 4s ──────
    const lastMessageTimestampRef = useRef<string | null>(null)
    useEffect(() => {
        // Track the latest message timestamp for comparison
        if (messages.length > 0) {
            lastMessageTimestampRef.current = messages[0].createdAt
        }
    }, [messages])

    useEffect(() => {
        if (!conversationId) return

        const pollInterval = setInterval(async () => {
            // Only poll when tab is visible
            if (document.hidden) return
            try {
                const res = await fetchMessages(conversationId, undefined, 10)
                if (res.data && res.data.length > 0) {
                    // Add any messages we don't already have
                    res.data.forEach((msg: any) => {
                        addIncomingMessage(msg)
                    })
                }
            } catch {
                // Polling failed silently — will retry next interval
            }
        }, 2000)

        return () => clearInterval(pollInterval)
    }, [conversationId, addIncomingMessage])

    // ── Refresh on tab visibility change ────────────────────
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden && conversationId) {
                loadMessages(true)
                markAsRead(conversationId)
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [conversationId, loadMessages])

    const handleChannelEvent = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.NEW_MESSAGE && payload.senderId !== currentUserId) {
            addIncomingMessage(payload.message)
            markAsRead(conversationId)
            // Play sound when tab is not focused (user is away but in this conversation)
            if (document.hidden) {
                playNotificationSound()
            }
        }
        if (event === CHAT_EVENTS.MESSAGE_EDITED && payload.messageId) {
            updateMessage(payload.messageId, {
                content: payload.content,
                isEdited: true,
                editedAt: payload.editedAt,
            })
        }
        if (event === CHAT_EVENTS.MESSAGE_DELETED && payload.messageId) {
            updateMessage(payload.messageId, {
                isDeleted: true,
                deletedAt: payload.deletedAt,
                content: null,
                fileUrl: null,
            })
        }
        if (event === CHAT_EVENTS.VIEW_ONCE_VIEWED && payload.messageId) {
            // If I'm not the sender and someone (me) viewed it, hide content locally.
            if (payload.viewerId === currentUserId) {
                updateMessage(payload.messageId, { viewed: true, expired: true, fileUrl: null, content: null })
            }
        }
        if (event === CHAT_EVENTS.TYPING && payload.userId !== currentUserId) {
            setTypingUsers(prev => prev.includes(payload.userName) ? prev : [...prev, payload.userName])
            setTimeout(() => {
                setTypingUsers(prev => prev.filter(n => n !== payload.userName))
            }, 3000)
        }
        if (event === CHAT_EVENTS.CONVERSATION_UPDATED && payload.name) {
            setDisplayName(payload.name)
            setMeta(prev => prev ? { ...prev, name: payload.name } : prev)
        }
        if (event === CHAT_EVENTS.CONVERSATION_DELETED && payload.hardDelete) {
            toast.error('This group was deleted by the creator')
            setActiveConversationId(null)
            setIsPanelOpen(false)
        }
    }, [currentUserId, conversationId, addIncomingMessage, updateMessage, setActiveConversationId, setIsPanelOpen])

    const { broadcast } = useSupabaseChannel(getConversationChannel(conversationId), handleChannelEvent)
    const { broadcast: broadcastUser } = useSupabaseChannel(getUserNotificationChannel(currentUserId), () => {}, false)

    const handleSend = useCallback(async (content: string, replyToId?: string) => {
        const optimistic: ChatMessage = {
            id: `temp-${Date.now()}`,
            conversationId,
            senderId: currentUserId,
            content,
            type: 'TEXT',
            fileUrl: null,
            fileName: null,
            fileSize: null,
            replyToId: replyToId || null,
            isEdited: false,
            isDeleted: false,
            createdAt: new Date().toISOString(),
            sender: { id: currentUserId, username: '', nickname: null, avatarUrl: null },
            replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, sender: replyTo.sender } : null,
            reactions: [],
        }
        addOptimisticMessage(optimistic)

        // ★ KEY FIX: Broadcast optimistic message IMMEDIATELY — don't wait for server save.
        // The receiver gets the message in <100ms instead of waiting 2-4s for DB round-trip.
        broadcast(CHAT_EVENTS.NEW_MESSAGE, {
            conversationId,
            senderId: currentUserId,
            senderName: '',
            message: optimistic,
        })

        // Server save runs after broadcast — receiver already has the message
        const result = await sendMessage(content, 'TEXT', replyToId)
        if (result) {
            // Replace sender's optimistic with confirmed
            addIncomingMessage(result)

            // Broadcast confirmed message → receiver deduplicates temp-* and gets real ID
            broadcast(CHAT_EVENTS.NEW_MESSAGE, {
                conversationId,
                senderId: currentUserId,
                senderName: result.sender.nickname || result.sender.username,
                message: result,
            })

            // ★ FIX: Notify other participants via personal channels (properly subscribe first)
            void notifyParticipantChannels(conversationId, currentUserId, result)
        }
    }, [conversationId, currentUserId, replyTo, sendMessage, addOptimisticMessage, addIncomingMessage, broadcast])

    const handleFileUpload = useCallback(async (file: File, viewOnce = false) => {
        const formData = new FormData()
        formData.append('file', file)
        if (viewOnce) formData.append('viewOnce', 'true')
        const result = await uploadChatFile(conversationId, formData)
        if (result.error) {
            const { toast } = await import('sonner')
            toast.error(result.error)
            return
        }
        if (result.data) {
            addIncomingMessage(result.data as ChatMessage)
            broadcast(CHAT_EVENTS.NEW_MESSAGE, {
                conversationId,
                senderId: currentUserId,
                senderName: '',
                message: result.data,
            })
        }
    }, [conversationId, currentUserId, addIncomingMessage, broadcast])

    const handleReact = useCallback(async (messageId: string, emoji: string) => {
        await toggleReaction(messageId, emoji)
        broadcast(CHAT_EVENTS.REACTION, { messageId, userId: currentUserId, emoji })
    }, [currentUserId, broadcast])

    const handleMessageUpdated = useCallback((messageId: string, updates: Partial<ChatMessage>) => {
        updateMessage(messageId, updates)
        // Broadcast appropriate event based on what changed
        if (updates.isDeleted) {
            broadcast(CHAT_EVENTS.MESSAGE_DELETED, {
                messageId,
                deletedAt: updates.deletedAt,
            })
        } else if (updates.isEdited && updates.content !== undefined) {
            broadcast(CHAT_EVENTS.MESSAGE_EDITED, {
                messageId,
                content: updates.content,
                editedAt: updates.editedAt,
            })
        } else if (updates.viewed) {
            broadcast(CHAT_EVENTS.VIEW_ONCE_VIEWED, {
                messageId,
                viewerId: currentUserId,
            })
        }
    }, [broadcast, updateMessage, currentUserId])

    const handleTyping = useCallback(() => {
        const now = Date.now()
        if (now - lastTypingSentRef.current > 2000) {
            broadcast(CHAT_EVENTS.TYPING, { userId: currentUserId, userName: '' })
            lastTypingSentRef.current = now
        }
    }, [currentUserId, broadcast])

    const handleScroll = () => {
        const el = scrollRef.current
        if (!el || isLoading || !hasMore) return
        if (el.scrollTop + el.scrollHeight - el.clientHeight < 50) {
            loadMessages()
        }
    }

    const handleRenamed = useCallback((newName: string) => {
        setDisplayName(newName)
        setMeta(prev => prev ? { ...prev, name: newName } : prev)
        broadcast(CHAT_EVENTS.CONVERSATION_UPDATED, { conversationId, name: newName })
        // Also notify each participant's user channel so their sidebar updates
        fetch(`/api/chat/participants?conversationId=${conversationId}`)
            .then(r => r.json())
            .then(({ userIds }) => {
                ;(userIds || []).forEach((uid: string) => {
                    if (uid === currentUserId) return
                    const ch = supabase.channel(getUserNotificationChannel(uid))
                    ch.subscribe((status: string) => {
                        if (status === 'SUBSCRIBED') {
                            ch.send({
                                type: 'broadcast',
                                event: CHAT_EVENTS.CONVERSATION_UPDATED,
                                payload: { conversationId, name: newName },
                            }).finally(() => setTimeout(() => supabase.removeChannel(ch), 500))
                        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                            supabase.removeChannel(ch)
                        }
                    })
                })
            })
            .catch(() => {})
    }, [conversationId, currentUserId, broadcast])

    const handleMuteToggle = useCallback(async () => {
        const next = !meta?.isMuted
        setMeta(prev => prev ? { ...prev, isMuted: next } : prev)
        setConversationMutedLocal(conversationId, next)
        const res = await setConversationMuted(conversationId, next)
        if (res.error) {
            toast.error(res.error)
            // Revert
            setMeta(prev => prev ? { ...prev, isMuted: !next } : prev)
            setConversationMutedLocal(conversationId, !next)
            return
        }
        toast.success(next ? 'Notifications muted' : 'Notifications unmuted')
    }, [meta?.isMuted, conversationId, setConversationMutedLocal])

    // Scroll to message when search result is clicked
    useEffect(() => {
        if (!scrollToMessageId) return
        const el = document.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-violet-500/60', 'transition-all')
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-violet-500/60')
            }, 1500)
        }
        setScrollToMessageId(null)
    }, [scrollToMessageId, messages])

    return (
        <div className="flex flex-col h-full bg-zinc-950 relative">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center gap-2.5 bg-zinc-950/90 backdrop-blur-xl">
                {meta?.type === 'TASK' ? (
                    <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-violet-500/15 border border-violet-500/20">
                        <ClipboardList className="w-4 h-4 text-violet-400" />
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-500">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-zinc-100 truncate flex items-center gap-1.5">
                        {displayName}
                        {meta?.isMuted && <BellOff className="w-3 h-3 text-zinc-500 shrink-0" />}
                    </div>
                    {meta?.type === 'TASK' && (meta.clientName || meta.assigneeName) ? (
                        <div className="flex items-center gap-2 mt-px">
                            {meta.clientName && (
                                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                                    <Briefcase className="w-2.5 h-2.5 text-zinc-500" />
                                    {meta.clientName}
                                </span>
                            )}
                            {meta.clientName && meta.assigneeName && (
                                <span className="text-[10px] text-zinc-700">·</span>
                            )}
                            {meta.assigneeName && (
                                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                                    <User className="w-2.5 h-2.5 text-zinc-500" />
                                    {meta.assigneeName}
                                </span>
                            )}
                        </div>
                    ) : meta?.type !== 'TASK' && meta?.participantNames && meta.participantNames.length > 0 ? (
                        <div className="text-[10px] text-zinc-500 truncate mt-px">
                            {meta.participantNames.join(', ')}
                        </div>
                    ) : null}
                    {typingUsers.length > 0 && (
                        <div className="text-[11px] text-violet-400 italic animate-pulse">
                            {typingUsers.join(', ')} is typing...
                        </div>
                    )}
                </div>
                {/* Header action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    {/* Search messages */}
                    <button
                        onClick={() => setShowSearchPanel(p => !p)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer bg-transparent border-none ${showSearchPanel ? 'bg-violet-500/15' : 'hover:bg-white/10'}`}
                        title="Search messages"
                    >
                        <Search className={`w-4 h-4 ${showSearchPanel ? 'text-violet-400' : 'text-zinc-400'}`} />
                    </button>

                    {/* Mute toggle */}
                    <button
                        onClick={handleMuteToggle}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
                        title={meta?.isMuted ? 'Unmute notifications' : 'Mute notifications'}
                    >
                        {meta?.isMuted
                            ? <BellOff className="w-4 h-4 text-zinc-400" />
                            : <Bell className="w-4 h-4 text-zinc-400" />}
                    </button>

                    {/* Rename — creator-only for groups */}
                    {meta?.type === 'GROUP' && meta?.isCreator && (
                        <button
                            onClick={() => setShowRenameDialog(true)}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
                            title="Rename group"
                        >
                            <Pencil className="w-4 h-4 text-zinc-400" />
                        </button>
                    )}

                    {/* Group members button — only for GROUP conversations */}
                    {meta?.type === 'GROUP' && (
                        <button
                            onClick={() => setShowGroupMembers(true)}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
                            title="Group members"
                        >
                            <Users className="w-4 h-4 text-zinc-400" />
                        </button>
                    )}
                </div>
            </div>

            {/* Messages area */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col-reverse gap-0.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
            >
                {messages.map(msg => (
                    <MessageBubble
                        key={msg.id}
                        message={msg}
                        isMine={msg.senderId === currentUserId}
                        onReply={setReplyTo}
                        onReact={handleReact}
                        onMessageUpdated={handleMessageUpdated}
                        onMessageHidden={removeMessage}
                        currentUserId={currentUserId}
                    />
                ))}

                {isLoading && (
                    <div className="flex justify-center p-3">
                        <Loader2 className="animate-spin w-5 h-5 text-violet-500" />
                    </div>
                )}

                {!isLoading && messages.length === 0 && (
                    <div className="text-center text-zinc-500 text-[13px] py-10">
                        No messages yet. Start the conversation!
                    </div>
                )}
            </div>

            {/* Input */}
            <ChatInput
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
            />

            {/* Group members dialog */}
            <GroupMembersDialog
                isOpen={showGroupMembers}
                onClose={() => setShowGroupMembers(false)}
                conversationId={conversationId}
            />

            {/* Rename group dialog */}
            <RenameGroupDialog
                isOpen={showRenameDialog}
                onClose={() => setShowRenameDialog(false)}
                conversationId={conversationId}
                currentName={meta?.name || displayName}
                onRenamed={handleRenamed}
            />

            {/* Message search panel */}
            <MessageSearchPanel
                isOpen={showSearchPanel}
                onClose={() => setShowSearchPanel(false)}
                conversationId={conversationId}
                onResultClick={(messageId) => {
                    setShowSearchPanel(false)
                    setScrollToMessageId(messageId)
                }}
            />
        </div>
    )
}
