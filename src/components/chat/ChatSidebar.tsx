'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Plus, MessageSquare, Users, UserPlus, Check, X, Trash2 } from 'lucide-react'
import { getConversations, deleteConversation } from '@/actions/chat-actions'
import { getContacts, getContactRequests, respondToContactRequest } from '@/actions/contact-actions'
import { useChatContext } from './ChatProvider'
import { toast } from 'sonner'

type Tab = 'messages' | 'contacts' | 'requests'

interface ConversationItem {
    id: string
    type: string
    name: string | null
    avatarUrl: string | null
    taskId: string | null
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
    const { currentUserId, unreadCounts } = useChatContext()
    const [tab, setTab] = useState<Tab>('messages')
    const [search, setSearch] = useState('')
    const [conversations, setConversations] = useState<ConversationItem[]>([])
    const [contacts, setContacts] = useState<any[]>([])
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [contextMenu, setContextMenu] = useState<{ convId: string; x: number; y: number } | null>(null)
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
                                    <span className={`text-[13px] overflow-hidden text-ellipsis whitespace-nowrap ${
                                        unread ? 'font-bold text-white' : 'font-medium text-zinc-200'
                                    }`}>
                                        {name}
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
                            <div className="text-[13px] font-semibold text-zinc-200">
                                {r.requester.nickname || r.requester.username}
                            </div>
                            <div className="text-[11px] text-zinc-600">{r.requester.email}</div>
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
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[100] bg-zinc-900 border border-violet-500/20 rounded-lg shadow-2xl py-1 min-w-[180px]"
                    style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 80) }}
                >
                    <button
                        onClick={() => handleDeleteChat(contextMenu.convId)}
                        className="w-full px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 cursor-pointer text-left flex items-center gap-2"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Delete chat
                    </button>
                </div>
            )}
        </div>
    )
}
