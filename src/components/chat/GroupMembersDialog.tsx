'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Search, UserPlus, UserMinus, Crown, Loader2, Mail } from 'lucide-react'
import { getGroupMembers, addGroupMembers, removeGroupMember } from '@/actions/chat-actions'
import { searchContacts } from '@/actions/contact-actions'
import { useChatContext } from './ChatProvider'
import { toast } from 'sonner'

interface GroupMembersDialogProps {
    isOpen: boolean
    onClose: () => void
    conversationId: string
}

interface Member {
    userId: string
    role: string
    username: string
    nickname: string | null
    avatarUrl: string | null
    email: string | null
}

export function GroupMembersDialog({ isOpen, onClose, conversationId }: GroupMembersDialogProps) {
    const { currentUserId } = useChatContext()
    const [members, setMembers] = useState<Member[]>([])
    const [isCreator, setIsCreator] = useState(false)
    const [loading, setLoading] = useState(false)
    const [showAddMode, setShowAddMode] = useState(false)
    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searchLoading, setSearchLoading] = useState(false)
    const [selectedToAdd, setSelectedToAdd] = useState<{ id: string; name: string }[]>([])
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadMembers = useCallback(async () => {
        setLoading(true)
        const res = await getGroupMembers(conversationId)
        if (res.data) {
            setMembers(res.data.members)
            setIsCreator(res.data.isCreator)
        }
        setLoading(false)
    }, [conversationId])

    useEffect(() => {
        if (isOpen) {
            loadMembers()
            setShowAddMode(false)
            setQuery('')
            setSearchResults([])
            setSelectedToAdd([])
        }
    }, [isOpen, loadMembers])

    const handleSearch = useCallback((q: string) => {
        setQuery(q)
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
        if (q.trim().length < 2) { setSearchResults([]); return }
        searchTimeoutRef.current = setTimeout(async () => {
            setSearchLoading(true)
            const res = await searchContacts(q)
            if (res.data) {
                // Filter out users already in the group
                const memberIds = new Set(members.map(m => m.userId))
                setSearchResults(res.data.filter((u: any) => !memberIds.has(u.id)))
            }
            setSearchLoading(false)
        }, 300)
    }, [members])

    const toggleSelect = (user: any) => {
        setSelectedToAdd(prev => {
            if (prev.some(s => s.id === user.id)) {
                return prev.filter(s => s.id !== user.id)
            }
            return [...prev, { id: user.id, name: user.nickname || user.username }]
        })
    }

    const handleAddMembers = async () => {
        if (selectedToAdd.length === 0) return
        const res = await addGroupMembers(conversationId, selectedToAdd.map(s => s.id))
        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success(`Added ${res.data?.added} member(s)`)
            setShowAddMode(false)
            setSelectedToAdd([])
            setQuery('')
            setSearchResults([])
            loadMembers()
        }
    }

    const handleRemove = async (targetUserId: string) => {
        const isLeaving = targetUserId === currentUserId
        const res = await removeGroupMember(conversationId, targetUserId)
        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success(isLeaving ? 'Left group' : 'Member removed')
            if (isLeaving) {
                onClose()
            } else {
                loadMembers()
            }
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[400px] max-h-[70vh] bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-white/[0.08] shadow-[0_24px_60px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-violet-500/10">
                    <h3 className="text-[15px] font-bold text-white m-0">
                        {showAddMode ? 'Add Members' : 'Group Members'}
                    </h3>
                    <div className="flex items-center gap-1.5">
                        {!showAddMode && (
                            <button
                                onClick={() => setShowAddMode(true)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-400 text-[11px] font-semibold cursor-pointer hover:bg-violet-500/25 transition-colors"
                            >
                                <UserPlus className="w-3 h-3" />
                                Add
                            </button>
                        )}
                        {showAddMode && (
                            <button
                                onClick={() => { setShowAddMode(false); setSelectedToAdd([]); setQuery('') }}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 text-zinc-400 text-[11px] font-semibold cursor-pointer hover:bg-white/10 transition-colors border-none"
                            >
                                Back
                            </button>
                        )}
                        <button onClick={onClose} className="bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors">
                            <X className="w-[18px] h-[18px] text-zinc-500" />
                        </button>
                    </div>
                </div>

                {/* Add Mode: Search */}
                {showAddMode && (
                    <div className="px-[18px] py-2.5 space-y-2 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2 bg-zinc-950 rounded-xl px-2.5 border border-zinc-700/50 focus-within:border-violet-500/30 transition-colors">
                            {query.includes('@') ? (
                                <Mail className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                            ) : (
                                <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                            )}
                            <input
                                value={query}
                                onChange={e => handleSearch(e.target.value)}
                                placeholder="Search by name or email..."
                                className="flex-1 bg-transparent border-none outline-none text-zinc-200 text-[13px] py-2 font-[inherit] placeholder:text-zinc-600"
                                autoFocus
                            />
                        </div>

                        {/* Selected chips */}
                        {selectedToAdd.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {selectedToAdd.map(s => (
                                    <span key={s.id} className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-violet-500/15 text-indigo-300 flex items-center gap-1">
                                        {s.name}
                                        <button onClick={() => toggleSelect(s)} className="bg-transparent border-none cursor-pointer p-0">
                                            <X className="w-2.5 h-2.5 text-indigo-300" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {loading && (
                        <div className="flex justify-center p-5">
                            <Loader2 className="animate-spin w-5 h-5 text-violet-500" />
                        </div>
                    )}

                    {/* Add Mode: Search results */}
                    {showAddMode && (
                        <>
                            {searchLoading && (
                                <div className="flex justify-center p-4">
                                    <Loader2 className="animate-spin w-4 h-4 text-violet-500" />
                                </div>
                            )}
                            {searchResults.map(user => {
                                const isSelected = selectedToAdd.some(s => s.id === user.id)
                                return (
                                    <div
                                        key={user.id}
                                        onClick={() => toggleSelect(user)}
                                        className={`flex items-center gap-2.5 py-2.5 px-[18px] cursor-pointer transition-colors hover:bg-zinc-800/50 ${isSelected ? 'bg-violet-500/[0.08]' : ''}`}
                                    >
                                        {user.avatarUrl ? (
                                            <div className="w-8 h-8 rounded-full shrink-0 bg-center bg-cover" style={{ backgroundImage: `url(${user.avatarUrl})` }} />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[12px] font-bold text-white">
                                                {(user.nickname || user.username).charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-medium text-zinc-200 truncate">{user.nickname || user.username}</div>
                                            <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                                                <span className="text-white text-xs font-bold">&#10003;</span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            {searchResults.length === 0 && !searchLoading && query.trim().length >= 2 && (
                                <div className="text-center py-6 text-zinc-500 text-[13px]">No users found</div>
                            )}
                        </>
                    )}

                    {/* View Mode: Member list */}
                    {!showAddMode && !loading && members.map(member => (
                        <div key={member.userId} className="flex items-center gap-2.5 py-2.5 px-[18px] hover:bg-zinc-800/30 transition-colors group/member">
                            {member.avatarUrl ? (
                                <div className="w-8 h-8 rounded-full shrink-0 bg-center bg-cover" style={{ backgroundImage: `url(${member.avatarUrl})` }} />
                            ) : (
                                <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[12px] font-bold text-white">
                                    {(member.nickname || member.username).charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-medium text-zinc-200 truncate">
                                        {member.nickname || member.username}
                                        {member.userId === currentUserId && <span className="text-zinc-500 ml-1">(you)</span>}
                                    </span>
                                    {member.role === 'ADMIN' && (
                                        <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                                    )}
                                </div>
                                <div className="text-[11px] text-zinc-500 truncate">{member.email}</div>
                            </div>
                            {/* Remove button */}
                            {(isCreator && member.userId !== currentUserId) && (
                                <button
                                    onClick={() => handleRemove(member.userId)}
                                    className="opacity-0 group-hover/member:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/15 cursor-pointer bg-transparent border-none"
                                    title="Remove member"
                                >
                                    <UserMinus className="w-3.5 h-3.5 text-red-400" />
                                </button>
                            )}
                            {/* Leave button for self */}
                            {member.userId === currentUserId && !isCreator && (
                                <button
                                    onClick={() => handleRemove(currentUserId)}
                                    className="opacity-0 group-hover/member:opacity-100 transition-opacity px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-[10px] font-semibold cursor-pointer border border-red-500/20 hover:bg-red-500/20"
                                >
                                    Leave
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Add Members Button */}
                {showAddMode && selectedToAdd.length > 0 && (
                    <div className="px-[18px] py-2.5 border-t border-violet-500/10">
                        <button
                            onClick={handleAddMembers}
                            className="w-full py-2.5 rounded-xl border-none text-[13px] font-bold cursor-pointer bg-violet-500 text-white shadow-[0_4px_20px_rgba(139,92,246,0.3)] hover:bg-violet-600 transition-all duration-200"
                        >
                            Add {selectedToAdd.length} Member{selectedToAdd.length > 1 ? 's' : ''}
                        </button>
                    </div>
                )}

                {/* Member count footer */}
                {!showAddMode && !loading && (
                    <div className="px-[18px] py-2 border-t border-white/[0.05] text-center">
                        <span className="text-[11px] text-zinc-600">{members.length} members</span>
                    </div>
                )}
            </div>
        </div>
    )
}
