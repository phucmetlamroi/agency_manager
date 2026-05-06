'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, MessageSquare, Users, UserPlus, Check, X, Trash2, Pencil, Bell, BellOff, ShieldAlert } from 'lucide-react'
import {
    getConversations,
    deleteConversation,
    deleteGroupForAll,
    setConversationMuted,
} from '@/actions/chat-actions'
import { getContacts, getContactRequests, respondToContactRequest } from '@/actions/contact-actions'
import { useChatContext } from './ChatProvider'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { RenameGroupDialog } from './RenameGroupDialog'
import { supabase } from '@/lib/supabase'
import { getConversationChannel, getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { toast } from 'sonner'

// Fire-and-forget broadcast to a channel: subscribe → send → cleanup
function fireBroadcast(channelName: string, event: string, payload: any) {
    const ch = supabase.channel(channelName)
    ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
            ch.send({ type: 'broadcast', event, payload })
                .finally(() => setTimeout(() => supabase.removeChannel(ch), 500))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            supabase.removeChannel(ch)
        }
    })
}

type Tab = 'messages' | 'contacts' | 'requests'

interface ConversationItem {
    id: string
    type: string
    name: string | null
    avatarUrl: string | null
    taskId: string | null
    createdById?: string
    isCreator?: boolean
    task: { title: string; clientName: string | null; assigneeName: string | null } | null
    updatedAt: string
    participants: { userId: string; user: { id: string; username: string; nickname: string | null; avatarUrl: string | null } }[]
    lastMessage: { content: string | null; type: string; senderName: string; createdAt: string } | null
    unreadCount: number
    isMuted: boolean
}

interface ChatSidebarProps {
    onSelectConversation: (id: string, name: string) => void
    onNewChat: () => void
    selectedId: string | null
}

export function ChatSidebar({ onSelectConversation, onNewChat, selectedId }: ChatSidebarProps) {
    const { currentUserId, unreadCounts, setConversationMutedLocal } = useChatContext()
    const [tab, setTab] = useState<Tab>('messages')
    const [search, setSearch] = useState('')
    const [conversations, setConversations] = useState<ConversationItem[]>([])
    const [contacts, setContacts] = useState<any[]>([])
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ convId: string; x: number; y: number } | null>(null)
    const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
    const contextMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!contextMenu) return
        const onClick = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [contextMenu])

    const handleDeleteChat = useCallback(async (convId: string) => {
        if (!confirm('Delete this conversation? It will only disappear from your list — others will still see it.')) {
            setContextMenu(null)
            return
        }
        const res = await deleteConversation(convId)
        if (res.error) {
            toast.error(res.error)
        } else {
            setConversations(prev => prev.filter(c => c.id !== convId))
            toast.success('Conversation deleted')
        }
        setContextMenu(null)
    }, [])

    const handleDeleteGroupForAll = useCallback(async (convId: string) => {
        if (!confirm('Permanently delete this group for ALL members? This cannot be undone.')) {
            setContextMenu(null)
            return
        }
        // Fetch participant IDs BEFORE delete (for broadcast targeting)
        const conv = conversations.find(c => c.id === convId)
        const participantIds = conv?.participants.map(p => p.userId) || []

        // Broadcast on conversation channel BEFORE deleting (so members receive event)
        fireBroadcast(getConversationChannel(convId), CHAT_EVENTS.CONVERSATION_DELETED, {
            conversationId: convId,
            byUserId: currentUserId,
            hardDelete: true,
        })

        // Also notify each participant's user channel so their sidebars update
        participantIds.forEach(uid => {
            if (uid === currentUserId) return
            fireBroadcast(getUserNotificationChannel(uid), CHAT_EVENTS.CONVERSATION_DELETED, {
                conversationId: convId,
                byUserId: currentUserId,
                hardDelete: true,
            })
        })

        const res = await deleteGroupForAll(convId)
        if (res.error) {
            toast.error(res.error)
        } else {
            setConversations(prev => prev.filter(c => c.id !== convId))
            toast.success('Group deleted for everyone')
        }
        setContextMenu(null)
    }, [conversations, currentUserId])

    const handleToggleMute = useCallback(async (convId: string, currentMuted: boolean) => {
        const next = !currentMuted
        // Optimistic update
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, isMuted: next } : c))
        setConversationMutedLocal(convId, next)
        const res = await setConversationMuted(convId, next)
        if (res.error) {
            toast.error(res.error)
            // Revert
            setConversations(prev => prev.map(c => c.id === convId ? { ...c, isMuted: currentMuted } : c))
            setConversationMutedLocal(convId, currentMuted)
            return
        }
        toast.success(next ? 'Notifications muted' : 'Notifications unmuted')
        setContextMenu(null)
    }, [setConversationMutedLocal])

    const handleOpenRename = useCallback((convId: string) => {
        const conv = conversations.find(c => c.id === convId)
        if (!conv) return
        setRenameTarget({ id: conv.id, name: conv.name || '' })
        setContextMenu(null)
    }, [conversations])

    const handleRenamed = useCallback((newName: string) => {
        if (!renameTarget) return
        setConversations(prev => prev.map(c => c.id === renameTarget.id ? { ...c, name: newName } : c))
    }, [renameTarget])

    const loadConversations = useCallback(async () => {
        setLoading(true)
        const res = await getConversations()
        if (res.data) setConversations(res.data)
        setLoading(false)
    }, [])

    const loadContacts = useCallback(async () => {
        const res = await getContacts()
        if (res.data) setContacts(res.data)
    }, [])

    const loadRequests = useCallback(async () => {
        const res = await getContactRequests()
        if (res.data) setRequests(res.data)
    }, [])

    useEffect(() => {
        loadConversations()
        loadContacts()
        loadRequests()
    }, [])

    useEffect(() => {
        loadConversations()
    }, [unreadCounts])

    // Listen for hard-delete events on the user notification channel
    const handleSidebarEvent = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.CONVERSATION_DELETED && payload.hardDelete) {
            // Conversation was nuked by creator — remove from local list immediately
            setConversations(prev => prev.filter(c => c.id !== payload.conversationId))
        }
        if (event === CHAT_EVENTS.CONVERSATION_UPDATED && payload.conversationId && payload.name) {
            setConversations(prev => prev.map(c => c.id === payload.conversationId ? { ...c, name: payload.name } : c))
        }
    }, [])

    useSupabaseChannel(getUserNotificationChannel(currentUserId), handleSidebarEvent)

    const getDisplayName = (conv: ConversationItem) => {
        if (conv.type === 'DIRECT') {
            const other = conv.participants.find(p => p.userId !== currentUserId)
            return other?.user.nickname || other?.user.username || 'Unknown'
        }
        if (conv.type === 'TASK') {
            return conv.task?.title || conv.name || 'Task Chat'
        }
        return conv.name || 'Group'
    }

    const getTaskSubtitle = (conv: ConversationItem) => {
        if (conv.type !== 'TASK' || !conv.task) return null
        const parts: string[] = []
        if (conv.task.clientName) parts.push(conv.task.clientName)
        if (conv.task.assigneeName) parts.push(conv.task.assigneeName)
        return parts.length > 0 ? parts.join(' · ') : null
    }

    const getInitials = (name: string) => name.charAt(0).toUpperCase()

    const filteredConversations = conversations.filter(c => {
        if (!search.trim()) return true
        const name = getDisplayName(c).toLowerCase()
        return name.includes(search.toLowerCase())
    })

    const handleRespond = async (contactId: string, accept: boolean) => {
        await respondToContactRequest(contactId, accept)
        loadRequests()
        if (accept) loadConversations()
    }

    const formatTime = (iso: string) => {
        const d = new Date(iso)
        const now = new Date()
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }
        return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })
    }

    return (
        <div className="flex flex-col h-full bg-zinc-950 border-r border-violet-500/10">
            {/* Header */}
            <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2.5">
                <h2 className="text-base font-extrabold text-white m-0">Chat</h2>
                <button
                    onClick={onNewChat}
                    className="w-[30px] h-[30px] rounded-lg border-none cursor-pointer bg-violet-500/15 flex items-center justify-center hover:bg-violet-500/25 transition-colors"
                >
                    <Plus className="w-4 h-4 text-violet-500" />
                </button>
            </div>

            {/* Search */}
            <div className="px-3.5 pb-2.5">
                <div className="flex items-center gap-2 bg-white/5 rounded-[10px] px-2.5 border border-violet-500/10">
                    <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="flex-1 bg-transparent border-none outline-none text-zinc-200 text-[13px] py-2 font-[inherit] placeholder:text-zinc-600"
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 px-3.5 pb-2">
                {([
                    { id: 'messages' as Tab, icon: MessageSquare, label: 'Messages' },
                    { id: 'contacts' as Tab, icon: Users, label: 'Contacts' },
                    { id: 'requests' as Tab, icon: UserPlus, label: `Requests${requests.length > 0 ? ` (${requests.length})` : ''}` },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 py-1.5 rounded-lg border-none cursor-pointer text-[11px] font-semibold flex items-center justify-center gap-1 transition-all duration-150 ${
                            tab === t.id
                                ? 'bg-violet-500/15 text-violet-500'
                                : 'bg-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-400'
                        }`}
                    >
                        <t.icon className="w-[13px] h-[13px]" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {tab === 'messages' && filteredConversations.map(conv => {
                    const name = getDisplayName(conv)
                    const unread = unreadCounts[conv.id] || conv.unreadCount || 0
                    const isActive = selectedId === conv.id

                    return (
                        <div
                            key={conv.id}
                            onClick={() => onSelectConversation(conv.id, name)}
                            onContextMenu={(e) => {
                                e.preventDefault()
                                setContextMenu({ convId: conv.id, x: e.clientX, y: e.clientY })
                            }}
                            className={`flex items-center gap-2.5 py-2.5 px-3.5 cursor-pointer transition-colors duration-150 hover:bg-white/[0.03] ${
                                isActive
                                    ? 'bg-violet-500/[0.12] border-l-[3px] border-l-violet-500'
                                    : 'border-l-[3px] border-l-transparent'
                            }`}
                        >
                            {/* Avatar */}
                            {conv.avatarUrl ? (
                                <div
                                    className="w-10 h-10 rounded-full shrink-0 bg-center bg-cover"
                                    style={{ backgroundImage: `url(${conv.avatarUrl})` }}
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[15px] font-bold text-white">
                                    {getInitials(name)}
                                </div>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center">
                                    <span className={`text-[13px] overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1 ${
                                        unread ? 'font-bold text-white' : 'font-medium text-zinc-200'
                                    }`}>
                                        {name}
                                        {conv.isMuted && <BellOff className="w-3 h-3 text-zinc-600 shrink-0" />}
                                    </span>
                                    {conv.lastMessage && (
                                        <span className="text-[10px] text-zinc-600 shrink-0 ml-2">
                                            {formatTime(conv.lastMessage.createdAt)}
                                        </span>
                                    )}
                                </div>
                                {conv.type === 'TASK' && getTaskSubtitle(conv) && (
                                    <div className="text-[10px] text-violet-400/70 truncate mt-px">
                                        {getTaskSubtitle(conv)}
                                    </div>
                                )}
                                {conv.lastMessage ? (
                                    <div className="flex justify-between items-center mt-0.5">
                                        <span className={`text-xs overflow-hidden text-ellipsis whitespace-nowrap ${
                                            unread ? 'text-zinc-400' : 'text-zinc-600'
                                        }`}>
                                            {conv.lastMessage.type === 'IMAGE' ? '📷 Photo' : conv.lastMessage.type === 'FILE' ? '📎 File' : conv.lastMessage.content?.slice(0, 40)}
                                        </span>
                                        {unread > 0 && (
                                            <span className="min-w-[18px] h-[18px] rounded-full px-[5px] bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                                {unread}
                                            </span>
                                        )}
                                    </div>
                                ) : conv.type === 'TASK' && !getTaskSubtitle(conv) ? (
                                    <div className="text-[11px] text-zinc-600 mt-0.5">No messages yet</div>
                                ) : null}
                            </div>
                        </div>
                    )
                })}

                {tab === 'contacts' && contacts.map(c => (
                    <div
                        key={c.contactId}
                        onClick={() => {
                            const conv = conversations.find(cv =>
                                cv.type === 'DIRECT' && cv.participants.some(p => p.userId === c.user.id)
                            )
                            if (conv) onSelectConversation(conv.id, c.user.nickname || c.user.username)
                        }}
                        className="flex items-center gap-2.5 py-2.5 px-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
                    >
                        <div className="relative">
                            {c.user.avatarUrl ? (
                                <div
                                    className="w-9 h-9 rounded-full bg-center bg-cover"
                                    style={{ backgroundImage: `url(${c.user.avatarUrl})` }}
                                />
                            ) : (
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm font-bold text-white">
                                    {(c.user.nickname || c.user.username).charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                                c.user.presenceStatus === 'ONLINE'
                                    ? 'bg-emerald-500'
                                    : c.user.presenceStatus === 'AWAY'
                                        ? 'bg-yellow-500'
                                        : 'bg-zinc-600'
                            }`} />
                        </div>
                        <div>
                            <div className="text-[13px] font-medium text-zinc-200">
                                {c.user.nickname || c.user.username}
                            </div>
                            <div className="text-[11px] text-zinc-600">
                                {c.user.presenceStatus === 'ONLINE' ? 'Online' : c.user.presenceStatus === 'AWAY' ? 'Away' : 'Offline'}
                            </div>
                        </div>
                    </div>
                ))}

                {tab === 'requests' && requests.map(r => (
                    <div key={r.id} className="flex items-center gap-2.5 py-2.5 px-3.5">
                        {r.requester.avatarUrl ? (
                            <div
                                className="w-9 h-9 rounded-full shrink-0 bg-center bg-cover"
                                style={{ backgroundImage: `url(${r.requester.avatarUrl})` }}
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm font-bold text-white">
                                {(r.requester.nickname || r.requester.username).charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-zinc-200 truncate">
                                    {r.requester.nickname || r.requester.username}
                                </span>
                                {(r.requester as any).profileName && (
                                    <span className="shrink-0 text-[9px] text-amber-400 font-bold px-1.5 py-px rounded bg-amber-500/10 border border-amber-500/20">
                                        {(r.requester as any).profileName}
                                    </span>
                                )}
                            </div>
                            <div className="text-[11px] text-zinc-600 truncate">{r.requester.email}</div>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handleRespond(r.id, true)}
                                className="w-7 h-7 rounded-lg border-none cursor-pointer bg-emerald-500/15 flex items-center justify-center hover:bg-emerald-500/25 transition-colors"
                            >
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            </button>
                            <button
                                onClick={() => handleRespond(r.id, false)}
                                className="w-7 h-7 rounded-lg border-none cursor-pointer bg-red-500/15 flex items-center justify-center hover:bg-red-500/25 transition-colors"
                            >
                                <X className="w-3.5 h-3.5 text-red-500" />
                            </button>
                        </div>
                    </div>
                ))}

                {tab === 'messages' && filteredConversations.length === 0 && !loading && (
                    <div className="text-center p-8 text-zinc-700 text-xs">
                        No conversations yet
                    </div>
                )}

                {tab === 'contacts' && contacts.length === 0 && (
                    <div className="text-center p-8 text-zinc-700 text-xs">
                        No contacts yet
                    </div>
                )}

                {tab === 'requests' && requests.length === 0 && (
                    <div className="text-center p-8 text-zinc-700 text-xs">
                        No requests
                    </div>
                )}
            </div>

            {/* Context menu for conversation row */}
            {contextMenu && (() => {
                const conv = conversations.find(c => c.id === contextMenu.convId)
                if (!conv) return null
                const isGroup = conv.type === 'GROUP'
                const isCreator = !!conv.isCreator
                return (
                    <div
                        ref={contextMenuRef}
                        className="fixed z-[100] bg-zinc-900 border border-violet-500/20 rounded-lg shadow-2xl py-1 min-w-[200px]"
                        style={{ left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
                    >
                        {/* Mute / Unmute */}
                        <button
                            onClick={() => handleToggleMute(conv.id, conv.isMuted)}
                            className="w-full px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2"
                        >
                            {conv.isMuted
                                ? <><Bell className="w-3.5 h-3.5" /> Unmute notifications</>
                                : <><BellOff className="w-3.5 h-3.5" /> Mute notifications</>}
                        </button>

                        {/* Rename — group creator only */}
                        {isGroup && isCreator && (
                            <button
                                onClick={() => handleOpenRename(conv.id)}
                                className="w-full px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2"
                            >
                                <Pencil className="w-3.5 h-3.5" /> Rename group
                            </button>
                        )}

                        <div className="h-px bg-white/[0.06] my-0.5" />

                        {/* Delete for me */}
                        <button
                            onClick={() => handleDeleteChat(conv.id)}
                            className="w-full px-3 py-2 text-[12px] text-zinc-300 hover:bg-white/5 cursor-pointer text-left flex items-center gap-2"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {isGroup && isCreator ? 'Leave & remove from my list' : 'Delete chat'}
                        </button>

                        {/* Delete group for everyone — creator only */}
                        {isGroup && isCreator && (
                            <button
                                onClick={() => handleDeleteGroupForAll(conv.id)}
                                className="w-full px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 cursor-pointer text-left flex items-center gap-2"
                            >
                                <ShieldAlert className="w-3.5 h-3.5" /> Delete group for everyone
                            </button>
                        )}
                    </div>
                )
            })()}

            {/* Rename group dialog */}
            {renameTarget && (
                <RenameGroupDialog
                    isOpen={!!renameTarget}
                    onClose={() => setRenameTarget(null)}
                    conversationId={renameTarget.id}
                    currentName={renameTarget.name}
                    onRenamed={handleRenamed}
                />
            )}
        </div>
    )
}
