'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Crown, Shield, Users, UserMinus, UserPlus,
    ArrowRightLeft, MoreVertical, ChevronDown,
    Loader2, LogOut, Clock, XCircle, Check
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    changeWorkspaceMemberRole,
    removeWorkspaceMember,
    leaveWorkspace,
    revokeWorkspaceInvitation,
} from '@/actions/member-actions'
import TransferOwnershipModal from './TransferOwnershipModal'
import InviteMemberModal from './InviteMemberModal'
import type { WorkspaceRole } from '@/lib/workspace-roles'

type MemberItem = {
    id: string
    userId: string
    role: string
    joinedAt: string
    user: {
        id: string
        username: string
        nickname: string | null
        email: string | null
        avatarUrl: string | null
        role: string // global role
    }
}

type InvitationItem = {
    id: string
    role: string
    status: string
    createdAt: string
    expiresAt: string
    invitedUser: {
        id: string
        username: string
        nickname: string | null
        email: string | null
        avatarUrl: string | null
    } | null
    invitedBy: {
        id: string
        username: string
        nickname: string | null
    }
}

type Props = {
    workspaceId: string
    members: MemberItem[]
    invitations: InvitationItem[]
    currentUserId: string
    currentUserRole: string // workspace role of current user
    isGlobalAdmin: boolean
}

const ROLE_BADGE: Record<string, { label: string; color: string; icon: any }> = {
    OWNER:  { label: 'Owner',  color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',  icon: Crown },
    ADMIN:  { label: 'Admin',  color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: Shield },
    MEMBER: { label: 'Member', color: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',      icon: Users },
    GUEST:  { label: 'Guest',  color: 'text-zinc-500 bg-zinc-800/50 border-zinc-600/20',      icon: Users },
}

export default function WorkspaceMembersPanel({
    workspaceId, members: initialMembers, invitations: initialInvitations,
    currentUserId, currentUserRole, isGlobalAdmin
}: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [showTransferModal, setShowTransferModal] = useState(false)
    const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    const canManage = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN' || isGlobalAdmin
    const isOwner = currentUserRole === 'OWNER' || isGlobalAdmin

    function refresh() {
        startTransition(() => {
            router.refresh()
        })
    }

    async function handleRoleChange(userId: string, newRole: WorkspaceRole) {
        setActionLoading(userId)
        try {
            const result = await changeWorkspaceMemberRole(workspaceId, userId, newRole)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã thay đổi vai trò.')
                refresh()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
            setExpandedMemberId(null)
        }
    }

    async function handleRemove(userId: string, username: string) {
        if (!confirm(`Xóa ${username} khỏi workspace?`)) return
        setActionLoading(userId)
        try {
            const result = await removeWorkspaceMember(workspaceId, userId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Đã xóa ${username} khỏi workspace.`)
                refresh()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
        }
    }

    async function handleLeave() {
        if (!confirm('Bạn có chắc muốn rời khỏi workspace này?')) return
        setActionLoading('self')
        try {
            const result = await leaveWorkspace(workspaceId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã rời khỏi workspace.')
                router.push('/workspace')
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
        }
    }

    async function handleRevokeInvite(inviteId: string) {
        setActionLoading(inviteId)
        try {
            const result = await revokeWorkspaceInvitation(workspaceId, inviteId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã thu hồi lời mời.')
                refresh()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Bar */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
                        Thành viên Workspace
                        <span className="text-sm font-normal text-zinc-500 ml-1">
                            ({initialMembers.length})
                        </span>
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    {isOwner && (
                        <button
                            onClick={() => setShowTransferModal(true)}
                            className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                        >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            Chuyển quyền
                        </button>
                    )}
                    {canManage && (
                        <button
                            onClick={() => setShowInviteModal(true)}
                            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
                        >
                            <UserPlus className="w-3.5 h-3.5" />
                            Mời thành viên
                        </button>
                    )}
                </div>
            </div>

            {/* Members List */}
            <div className="space-y-2">
                {initialMembers.map(member => {
                    const badge = ROLE_BADGE[member.role] || ROLE_BADGE.MEMBER
                    const BadgeIcon = badge.icon
                    const isSelf = member.user.id === currentUserId
                    const isExpanded = expandedMemberId === member.user.id
                    const isLoading = actionLoading === member.user.id

                    return (
                        <div
                            key={member.id}
                            className="bg-zinc-900/40 border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all group relative"
                        >
                            <div className="flex items-center gap-3">
                                {/* Avatar */}
                                <Avatar className="h-10 w-10 border border-white/10 shrink-0">
                                    <AvatarImage src={member.user.avatarUrl || `https://avatar.vercel.sh/${member.user.username}`} />
                                    <AvatarFallback className="bg-zinc-800 text-zinc-200 text-sm font-bold">
                                        {member.user.username[0].toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-zinc-100 truncate">
                                            {member.user.nickname || member.user.username}
                                        </span>
                                        {isSelf && (
                                            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                                Bạn
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 truncate">
                                        @{member.user.username}
                                        {member.user.email && ` · ${member.user.email}`}
                                    </div>
                                </div>

                                {/* Role Badge */}
                                <div className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 shrink-0 ${badge.color}`}>
                                    <BadgeIcon className="w-3 h-3" strokeWidth={2} />
                                    {badge.label}
                                </div>

                                {/* Actions */}
                                {canManage && !isSelf && (
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={() => setExpandedMemberId(isExpanded ? null : member.user.id)}
                                            disabled={isLoading}
                                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                        >
                                            {isLoading ? (
                                                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                                            ) : (
                                                <MoreVertical className="w-4 h-4 text-zinc-500" />
                                            )}
                                        </button>

                                        {/* Dropdown */}
                                        {isExpanded && (
                                            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-150">
                                                {/* Role Options */}
                                                {isOwner && (
                                                    <>
                                                        <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-white/5">
                                                            Đổi vai trò
                                                        </div>
                                                        {(['ADMIN', 'MEMBER', 'GUEST'] as WorkspaceRole[]).map(role => (
                                                            <button
                                                                key={role}
                                                                onClick={() => handleRoleChange(member.user.id, role)}
                                                                disabled={member.role === role}
                                                                className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors flex items-center justify-between ${
                                                                    member.role === role
                                                                        ? 'text-indigo-400 bg-indigo-500/10'
                                                                        : 'text-zinc-300 hover:bg-white/5'
                                                                }`}
                                                            >
                                                                {role}
                                                                {member.role === role && <Check className="w-3 h-3" />}
                                                            </button>
                                                        ))}
                                                    </>
                                                )}

                                                {/* Remove */}
                                                <div className="border-t border-white/5">
                                                    <button
                                                        onClick={() => handleRemove(member.user.id, member.user.nickname || member.user.username)}
                                                        className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                                    >
                                                        <UserMinus className="w-3.5 h-3.5" />
                                                        Xóa khỏi workspace
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Self-leave */}
                                {isSelf && member.role !== 'OWNER' && (
                                    <button
                                        onClick={handleLeave}
                                        disabled={actionLoading === 'self'}
                                        className="p-2 rounded-lg hover:bg-red-500/10 transition-colors group/leave"
                                        title="Rời workspace"
                                    >
                                        {actionLoading === 'self' ? (
                                            <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                                        ) : (
                                            <LogOut className="w-4 h-4 text-zinc-500 group-hover/leave:text-red-400 transition-colors" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Pending Invitations */}
            {initialInvitations.length > 0 && canManage && (
                <div>
                    <h4 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Lời mời đang chờ ({initialInvitations.length})
                    </h4>
                    <div className="space-y-2">
                        {initialInvitations.map(inv => (
                            <div key={inv.id} className="bg-zinc-900/30 border border-dashed border-white/10 rounded-xl p-3 flex items-center gap-3">
                                <Avatar className="h-8 w-8 border border-white/10 opacity-60 shrink-0">
                                    <AvatarImage src={inv.invitedUser?.avatarUrl || `https://avatar.vercel.sh/${inv.invitedUser?.username || 'unknown'}`} />
                                    <AvatarFallback className="bg-zinc-800 text-zinc-200 text-xs font-bold">
                                        {(inv.invitedUser?.username || '?')[0].toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-zinc-300 truncate">
                                        {inv.invitedUser?.nickname || inv.invitedUser?.username || 'Unknown'}
                                    </div>
                                    <div className="text-[10px] text-zinc-500">
                                        Mời bởi {inv.invitedBy.nickname || inv.invitedBy.username} · Vai trò: {inv.role}
                                    </div>
                                </div>
                                <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-bold shrink-0">
                                    Đang chờ
                                </span>
                                <button
                                    onClick={() => handleRevokeInvite(inv.id)}
                                    disabled={actionLoading === inv.id}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors shrink-0"
                                    title="Thu hồi lời mời"
                                >
                                    {actionLoading === inv.id ? (
                                        <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
                                    ) : (
                                        <XCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400 transition-colors" />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modals */}
            {showInviteModal && (
                <InviteMemberModal
                    workspaceId={workspaceId}
                    onClose={() => setShowInviteModal(false)}
                    onSuccess={refresh}
                />
            )}
            {showTransferModal && (
                <TransferOwnershipModal
                    workspaceId={workspaceId}
                    members={initialMembers}
                    currentUserId={currentUserId}
                    onClose={() => setShowTransferModal(false)}
                    onSuccess={refresh}
                />
            )}
        </div>
    )
}
