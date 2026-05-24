'use client'

/**
 * [Username Handle] Unified invite modal with autocomplete search.
 *
 * Replaces the previous 2-mode UI (select/search) with a single search-as-you-type
 * input. Debounced query (300ms) hits `searchInviteCandidates` server action which
 * matches against username OR email OR displayName, scoped to users with access
 * to the workspace's profile.
 *
 * UX flow:
 *   1. Admin types "bao" → dropdown shows matching users with handle + email
 *   2. Click a user → invite fires immediately (uses inviteToWorkspace by username)
 *   3. No match found + query looks like email → "Mời {email}" button to invite
 *      external email (creates pending invitation)
 */

import { useState, useEffect, useRef } from 'react'
import { UserPlus, X, Loader2, Search, Mail } from 'lucide-react'
import { inviteToWorkspace } from '@/actions/member-actions'
import { searchInviteCandidates } from '@/actions/username-actions'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { WorkspaceRole } from '@/lib/workspace-roles'

type Candidate = {
    id: string
    username: string
    displayName: string | null
    email: string | null
    avatarUrl: string | null
    role: string
}

type Props = {
    workspaceId: string
    onClose: () => void
    onSuccess?: () => void
}

const isEmailLike = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export default function InviteMemberModal({ workspaceId, onClose, onSuccess }: Props) {
    const [query, setQuery] = useState('')
    const [candidates, setCandidates] = useState<Candidate[]>([])
    const [searching, setSearching] = useState(false)
    const [inviting, setInviting] = useState(false)
    const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('MEMBER')
    const debounceRef = useRef<NodeJS.Timeout | null>(null)

    /* ── Debounced server search ───────────────────────────────────── */
    useEffect(() => {
        const trimmed = query.trim()
        if (trimmed.length === 0) {
            setCandidates([])
            setSearching(false)
            return
        }
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setSearching(true)
        debounceRef.current = setTimeout(async () => {
            try {
                const results = await searchInviteCandidates(workspaceId, trimmed)
                setCandidates(results)
            } catch {
                setCandidates([])
            } finally {
                setSearching(false)
            }
        }, 300)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [query, workspaceId])

    async function handleInvite(identifier: string) {
        setInviting(true)
        try {
            const result = await inviteToWorkspace(workspaceId, identifier, selectedRole)
            if (result.error) {
                toast.error(result.error)
            } else if (result.directAdd) {
                toast.success(`${result.username} đã được thêm vào workspace!`)
                setQuery('')
                onSuccess?.()
            } else {
                toast.success(`Đã gửi lời mời đến ${result.username}`)
                setQuery('')
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
                onClick={(e) => e.stopPropagation()}
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
                        {(['MEMBER', 'ADMIN', 'GUEST'] as WorkspaceRole[]).map((role) => (
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

                {/* Unified search input */}
                <div className="relative z-10 mb-3">
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Tìm người dùng
                    </label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Username, email hoặc tên hiển thị..."
                            autoFocus
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                        {searching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                        )}
                    </div>
                </div>

                {/* Results list */}
                <div className="relative z-10 max-h-[280px] overflow-y-auto pr-1 space-y-1.5">
                    {query.trim().length === 0 ? (
                        <div className="text-sm text-zinc-500 text-center py-8">
                            Gõ username, email, hoặc tên để tìm người dùng.
                        </div>
                    ) : candidates.length === 0 && !searching ? (
                        <div className="text-center py-6">
                            <div className="text-sm text-zinc-500 mb-3">
                                Không tìm thấy ai khớp với <span className="text-zinc-300 font-mono">"{query.trim()}"</span>
                            </div>
                            {/* Email-like → offer to send invite to external email */}
                            {isEmailLike(query) && (
                                <button
                                    onClick={() => handleInvite(query.trim())}
                                    disabled={inviting}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {inviting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                                    Mời {query.trim()} qua email
                                </button>
                            )}
                        </div>
                    ) : (
                        candidates.map((user) => {
                            const displayName = user.displayName?.trim() || user.username
                            return (
                                <button
                                    key={user.id}
                                    onClick={() => handleInvite(user.username)}
                                    disabled={inviting}
                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/30 border border-white/5 hover:border-indigo-500/30 hover:bg-zinc-900/60 transition-all text-left disabled:opacity-50"
                                >
                                    <Avatar className="h-9 w-9 border border-white/10 shrink-0">
                                        <AvatarImage src={user.avatarUrl || `https://avatar.vercel.sh/${user.username}`} />
                                        <AvatarFallback className="bg-zinc-800 text-zinc-200 text-xs font-bold">
                                            {displayName[0]?.toUpperCase() ?? '?'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-zinc-100 truncate">
                                            {displayName}
                                        </div>
                                        <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1.5">
                                            <span className="text-indigo-400 font-mono">@{user.username}</span>
                                            {user.email && (
                                                <>
                                                    <span className="opacity-50">·</span>
                                                    <span>{user.email}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <UserPlus className="w-4 h-4 text-zinc-500 shrink-0" />
                                </button>
                            )
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="relative z-10 mt-5 flex items-center justify-between gap-2">
                    <p className="text-[10px] text-zinc-600 leading-relaxed flex-1">
                        Tip: Gõ tên, @username hoặc email. Người cùng Team → thêm trực tiếp. Khác Team → gửi lời mời.
                    </p>
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
