'use client'

import { useState, useCallback, useRef } from 'react'
import { X, Search, UserPlus, Users, MessageSquare, Loader2, Mail, Globe } from 'lucide-react'
import { searchContacts, sendContactRequest } from '@/actions/contact-actions'
import { getOrCreateDirectConversation, createGroupConversation } from '@/actions/chat-actions'
import { useChatContext } from './ChatProvider'
import { toast } from 'sonner'

interface NewChatDialogProps {
    isOpen: boolean
    onClose: () => void
    onConversationCreated: (id: string, name: string) => void
    workspaceId: string
    profileId?: string
}

export function NewChatDialog({ isOpen, onClose, onConversationCreated, workspaceId, profileId }: NewChatDialogProps) {
    const { currentUserId } = useChatContext()
    const [mode, setMode] = useState<'dm' | 'group'>('dm')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [groupName, setGroupName] = useState('')
    const [groupMembers, setGroupMembers] = useState<{ id: string; name: string }[]>([])
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleSearch = useCallback(async (q: string) => {
        setQuery(q)
        // Debounce search
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        if (q.trim().length < 2) { setResults([]); return }
        searchTimeoutRef.current = setTimeout(async () => {
            setLoading(true)
            const res = await searchContacts(q, profileId)
            if (res.data) setResults(res.data)
            setLoading(false)
        }, 300)
    }, [profileId])

    const handleDMSelect = async (user: any) => {
        if (user.contactStatus === 'ACCEPTED') {
            const res = await getOrCreateDirectConversation(user.id)
            if (res.data) {
                onConversationCreated(res.data.conversationId, user.nickname || user.username)
                onClose()
            }
            if (res.error) toast.error(res.error)
        } else if (!user.contactStatus || user.contactStatus === 'DECLINED') {
            const res = await sendContactRequest(user.id)
            if (res.data) toast.success('Friend request sent!')
            if (res.error) toast.error(res.error)
        } else if (user.contactStatus === 'PENDING') {
            toast.info('Request pending')
        }
    }

    const toggleGroupMember = (user: any) => {
        const exists = groupMembers.find(m => m.id === user.id)
        if (exists) {
            setGroupMembers(prev => prev.filter(m => m.id !== user.id))
        } else {
            setGroupMembers(prev => [...prev, { id: user.id, name: user.nickname || user.username }])
        }
    }

    const handleCreateGroup = async () => {
        if (!groupName.trim() || groupMembers.length === 0) return
        const res = await createGroupConversation(groupName, groupMembers.map(m => m.id), workspaceId)
        if (res.data) {
            onConversationCreated(res.data.conversationId, groupName)
            onClose()
        }
        if (res.error) toast.error(res.error)
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[420px] max-h-[80vh] bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-[18px] py-4 border-b border-violet-500/10">
                    <h3 className="m-0 text-[15px] font-bold text-white">New Chat</h3>
                    <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors">
                        <X className="w-[18px] h-[18px] text-zinc-500" />
                    </button>
                </div>

                {/* Mode Tabs */}
                <div className="flex gap-1 px-[18px] py-2.5 bg-zinc-800/30">
                    <button
                        onClick={() => setMode('dm')}
                        className={`flex-1 py-2 rounded-xl border-none cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            mode === 'dm'
                                ? 'bg-violet-500/20 text-violet-400'
                                : 'bg-white/5 text-zinc-500 hover:bg-white/10'
                        }`}
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> Message
                    </button>
                    <button
                        onClick={() => setMode('group')}
                        className={`flex-1 py-2 rounded-xl border-none cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            mode === 'group'
                                ? 'bg-violet-500/20 text-violet-400'
                                : 'bg-white/5 text-zinc-500 hover:bg-white/10'
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" /> Group
                    </button>
                </div>

                {/* Group Name Input + Selected Members */}
                {mode === 'group' && (
                    <div className="px-[18px] pb-2">
                        <input
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            placeholder="Group name..."
                            className="w-full px-3 py-2 bg-zinc-900/50 border border-zinc-700/50 rounded-xl text-zinc-200 text-[13px] outline-none font-[inherit] placeholder:text-zinc-600 focus:border-violet-500/30 transition-colors"
                        />
                        {groupMembers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {groupMembers.map(m => (
                                    <span key={m.id} className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-violet-500/15 text-indigo-300 flex items-center gap-1">
                                        {m.name}
                                        <button onClick={() => toggleGroupMember(m)} className="bg-transparent border-none cursor-pointer p-0">
                                            <X className="w-2.5 h-2.5 text-indigo-300" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Search */}
                <div className="px-[18px] pb-2 space-y-1.5">
                    <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-2.5 border border-zinc-700/50 focus-within:border-violet-500/30 transition-colors">
                        {query.includes('@') ? (
                            <Mail className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        ) : (
                            <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        )}
                        <input
                            value={query}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="Nhập tên hoặc email để tìm..."
                            className="flex-1 bg-transparent border-none outline-none text-zinc-200 text-[13px] py-2 font-[inherit] placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 px-1">
                        <Globe className="w-3 h-3 text-zinc-600" />
                        <span className="text-[10px] text-zinc-600">Tìm bất kỳ người dùng nào trong hệ thống bằng email</span>
                    </div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto max-h-[300px]">
                    {loading && (
                        <div className="flex justify-center p-5">
                            <Loader2 className="animate-spin w-[18px] h-[18px] text-violet-500" />
                        </div>
                    )}

                    {results.length === 0 && !loading && query.trim().length >= 2 && (
                        <div className="text-center py-8 px-4">
                            <Mail className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                            <p className="text-[13px] text-zinc-500 font-medium">Không tìm thấy người dùng</p>
                            <p className="text-[11px] text-zinc-600 mt-1">
                                {query.includes('@')
                                    ? 'Email này chưa có trong hệ thống'
                                    : 'Thử tìm bằng email chính xác'}
                            </p>
                        </div>
                    )}

                    {results.map(user => {
                        const isGroupSelected = groupMembers.some(m => m.id === user.id)
                        return (
                            <div
                                key={user.id}
                                onClick={() => mode === 'dm' ? handleDMSelect(user) : toggleGroupMember(user)}
                                className={`flex items-center gap-2.5 py-2.5 px-[18px] cursor-pointer transition-colors hover:bg-zinc-800/50 ${
                                    isGroupSelected ? 'bg-violet-500/[0.08]' : ''
                                }`}
                            >
                                {user.avatarUrl ? (
                                    <div
                                        className="w-[36px] h-[36px] rounded-full shrink-0 bg-center bg-cover"
                                        style={{ backgroundImage: `url(${user.avatarUrl})` }}
                                    />
                                ) : (
                                    <div className="w-[36px] h-[36px] rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[13px] font-bold text-white">
                                        {(user.nickname || user.username).charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-medium text-zinc-200 truncate">
                                            {user.nickname || user.username}
                                        </span>
                                        {user.isSameProfile ? (
                                            <span className="shrink-0 text-[9px] text-violet-400 font-bold px-1.5 py-px rounded bg-violet-500/10 border border-violet-500/20 uppercase">Team</span>
                                        ) : user.profileName ? (
                                            <span className="shrink-0 text-[9px] text-amber-400 font-bold px-1.5 py-px rounded bg-amber-500/10 border border-amber-500/20">{user.profileName}</span>
                                        ) : null}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
                                </div>
                                {mode === 'dm' && (
                                    <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                                        user.contactStatus === 'ACCEPTED'
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                            : user.contactStatus === 'PENDING'
                                                ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                                : 'bg-violet-500/15 text-violet-400 border border-violet-500/20'
                                    }`}>
                                        {user.contactStatus === 'ACCEPTED' ? 'Nhắn tin' : user.contactStatus === 'PENDING' ? (user.isRequester ? 'Đã gửi' : 'Chờ xác nhận') : 'Kết bạn'}
                                    </span>
                                )}
                                {mode === 'group' && isGroupSelected && (
                                    <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                                        <span className="text-white text-xs font-bold">&#10003;</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Create Group Button */}
                {mode === 'group' && groupMembers.length > 0 && (
                    <div className="px-[18px] py-2.5 border-t border-violet-500/10">
                        <button
                            onClick={handleCreateGroup}
                            disabled={!groupName.trim()}
                            className={`w-full py-2.5 rounded-xl border-none text-[13px] font-bold transition-all duration-200 ${
                                groupName.trim()
                                    ? 'cursor-pointer bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.3)] hover:bg-violet-600'
                                    : 'cursor-default bg-white/[0.06] text-zinc-600'
                            }`}
                        >
                            Create Group ({groupMembers.length} members)
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
