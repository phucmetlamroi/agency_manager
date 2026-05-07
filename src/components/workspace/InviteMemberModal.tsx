'use client'

import { useState, useEffect } from 'react'
import { UserPlus, X, Loader2, Search, Check } from 'lucide-react'
import { inviteToWorkspace, getAvailableUsersForInvite } from '@/actions/member-actions'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { WorkspaceRole } from '@/lib/workspace-roles'

type AvailableUser = {
    id: string
    username: string
    nickname: string | null
    email: string | null
    avatarUrl: string | null
    role: string
}

type Props = {
    workspaceId: string
    onClose: () => void
    onSuccess?: () => void
}

export default function InviteMemberModal({ workspaceId, onClose, onSuccess }: Props) {
    const [mode, setMode] = useState<'select' | 'search'>('select')
    const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
    const [loading, setLoading] = useState(true)
    const [inviting, setInviting] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('MEMBER')

    // For search mode
    const [searchUsername, setSearchUsername] = useState('')

    useEffect(() => {
        loadAvailableUsers()
    }, [workspaceId])

    async function loadAvailableUsers() {
        setLoading(true)
        try {
            const result = await getAvailableUsersForInvite(workspaceId)
            setAvailableUsers(result.users)
        } catch {
            toast.error('Không thể tải danh sách người dùng')
        } finally {
            setLoading(false)
        }
    }

    const filteredUsers = availableUsers.filter(u => {
        const q = searchQuery.toLowerCase()
        return !q
            || u.username.toLowerCase().includes(q)
            || (u.nickname && u.nickname.toLowerCase().includes(q))
            || (u.email && u.email.toLowerCase().includes(q))
    })

    async function handleInviteUser(userId: string) {
        const user = availableUsers.find(u => u.id === userId)
        if (!user) return

        setInviting(true)
        try {
            const result = await inviteToWorkspace(workspaceId, user.username, selectedRole)
            if (result.error) {
                toast.error(result.error)
            } else if (result.directAdd) {
                toast.success(`${result.username} đã được thêm vào workspace!`)
                onSuccess?.()
                // Remove from available list
                setAvailableUsers(prev => prev.filter(u => u.id !== userId))
            } else {
                toast.success(`Đã gửi lời mời đến ${result.username}`)
                onSuccess?.()
                setAvailableUsers(prev => prev.filter(u => u.id !== userId))
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi không xác định')
        } finally {
            setInviting(false)
        }
    }

    async function handleSearchInvite() {
        if (!searchUsername.trim()) return
        setInviting(true)
        try {
            const result = await inviteToWorkspace(workspaceId, searchUsername.trim(), selectedRole)
            if (result.error) {
                toast.error(result.error)
            } else if (result.directAdd) {
                toast.success(`${result.username} đã được thêm vào workspace!`)
                setSearchUsername('')
                onSuccess?.()
            } else {
                toast.success(`Đã gửi lời mời đến ${result.username}`)
                setSearchUsername('')
                onSuccess?.()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi không xác định')
        } finally {
            setInviting(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-zinc-950/95 border border-white/10 rounded-2xl p-6 w-[90%] max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Ambient Glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none bg-indigo-500" />

                {/* Header */}
                <div className="relative z-10 flex items-center justify-between mb-5">
                    <h3 className="text-xl font-bold text-indigo-400 flex items-center gap-2">
                        <UserPlus className="w-5 h-5" strokeWidth={2} />
                        Mời thành viên
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                        <X className="w-4 h-4 text-zinc-400" />
                    </button>
                </div>

                {/* Role Selector */}
                <div className="relative z-10 mb-4">
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Vai trò
                    </label>
                    <div className="flex gap-2">
                        {(['MEMBER', 'ADMIN', 'GUEST'] as WorkspaceRole[]).map(role => (
                            <button
                                key={role}
                                type="button"
                                onClick={() => setSelectedRole(role)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                    selectedRole === role
                                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                        : 'bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/10'
                                }`}
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mode Tabs */}
                <div className="relative z-10 flex gap-2 mb-4">
                    <button
                        onClick={() => setMode('select')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                            mode === 'select'
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Chọn từ Team ({availableUsers.length})
                    </button>
                    <button
                        onClick={() => setMode('search')}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                            mode === 'search'
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                : 'bg-zinc-900/40 border-white/5 text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        Tìm theo Username
                    </button>
                </div>

                {/* Select Mode */}
                {mode === 'select' && (
                    <div className="relative z-10">
                        {/* Search Filter */}
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Lọc theo tên..."
                                className="w-full bg-zinc-900/60 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                        </div>

                        {/* User List */}
                        <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className="text-sm text-zinc-500 text-center py-8">
                                    {searchQuery ? 'Không tìm thấy.' : 'Tất cả nhân sự đã là thành viên.'}
                                </div>
                            ) : (
                                filteredUsers.map(user => (
                                    <div key={user.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/30 border border-white/5 hover:border-white/10 hover:bg-zinc-900/50 transition-all group">
                                        <Avatar className="h-8 w-8 border border-white/10">
                                            <AvatarImage src={user.avatarUrl || `https://avatar.vercel.sh/${user.username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-200 text-xs font-bold">
                                                {user.username[0].toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-zinc-200 truncate">
                                                {user.nickname || user.username}
                                            </div>
                                            <div className="text-[10px] text-zinc-500 truncate">
                                                @{user.username} {user.email && `· ${user.email}`}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleInviteUser(user.id)}
                                            disabled={inviting}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-bold transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                        >
                                            {inviting ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                                            Thêm
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Search Mode */}
                {mode === 'search' && (
                    <div className="relative z-10">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchUsername}
                                onChange={e => setSearchUsername(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchInvite()}
                                placeholder="Nhập username hoặc email..."
                                className="flex-1 bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                            <button
                                onClick={handleSearchInvite}
                                disabled={inviting || !searchUsername.trim()}
                                className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                            >
                                {inviting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <UserPlus className="w-4 h-4" />
                                )}
                                Mời
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed">
                            Nhập chính xác username hoặc email. Nếu cùng Team, thành viên sẽ được thêm trực tiếp.
                            Nếu khác Team, một lời mời sẽ được gửi.
                        </p>
                    </div>
                )}

                {/* Footer */}
                <div className="relative z-10 mt-5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 font-bold text-sm hover:bg-white/10 hover:text-white transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    )
}
