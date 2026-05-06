'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useChatMessages, type ChatMessage } from '@/hooks/useChatMessages'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { useChatContext } from './ChatProvider'
import { getConversationChannel, getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { markAsRead, toggleReaction, getConversations } from '@/actions/chat-actions'
import { uploadChatFile } from '@/actions/chat-upload-actions'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { Loader2, ClipboardList, User, Briefcase } from 'lucide-react'

interface ConversationMeta {
    type: string
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
    const { currentUserId, setActiveConversationId } = useChatContext()
    const [meta, setMeta] = useState<ConversationMeta | null>(null)
    const { messages, hasMore, isLoading, loadMessages, sendMessage, addIncomingMessage, addOptimisticMessage, updateMessage, reset } = useChatMessages(conversationId as string)
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
    const [typingUsers, setTypingUsers] = useState<string[]>([])
    const scrollRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const lastTypingSentRef = useRef(0)

    useEffect(() => {
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
                        taskTitle: conv.task?.title,
                        clientName: conv.task?.clientName,
                        assigneeName: conv.task?.assigneeName,
                        participantNames: otherNames,
                    })
                }
            }
        })

        return () => setActiveConversationId(null)
    }, [conversationId])

    const handleChannelEvent = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.NEW_MESSAGE && payload.senderId !== currentUserId) {
            addIncomingMessage(payload.message)
            markAsRead(conversationId)
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
    }, [currentUserId, conversationId, addIncomingMessage, updateMessage])

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

        const result = await sendMessage(content, 'TEXT', replyToId)
        if (result) {
            broadcast(CHAT_EVENTS.NEW_MESSAGE, {
                conversationId,
                senderId: currentUserId,
                senderName: result.sender.nickname || result.sender.username,
                message: result,
            })

            const participants = await fetch(`/api/chat/participants?conversationId=${conversationId}`).then(r => r.json()).catch(() => ({ userIds: [] }))
            ;(participants.userIds || []).forEach((uid: string) => {
                if (uid !== currentUserId) {
                    const userChannel = getUserNotificationChannel(uid)
                    const ch = (window as any).__supabase_channels?.[userChannel]
                }
            })
        }
    }, [conversationId, currentUserId, replyTo, sendMessage, addOptimisticMessage, broadcast])

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

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center gap-2.5 bg-zinc-950/90 backdrop-blur-xl">
                {meta?.type === 'TASK' ? (
                    <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-violet-500/15 border border-violet-500/20">
                        <ClipboardList className="w-4 h-4 text-violet-400" />
                    </div>
                ) : (
                    <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white bg-gradient-to-br from-indigo-500 to-violet-500">
                        {conversationName.charAt(0).toUpperCase()}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-zinc-100 truncate">{conversationName}</div>
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
        </div>
    )
}
