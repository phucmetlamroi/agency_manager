'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Crown, Shield, Users, UserMinus, UserPlus,
    ArrowRightLeft, MoreVertical, Loader2, Check, Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    changeProfileRoleAction,
    removeFromProfileAction,
} from '@/actions/profile-member-actions'
import InviteToProfileModal from './InviteToProfileModal'
import TransferProfileOwnershipModal from './TransferProfileOwnershipModal'
import GrantWorkspaceAccessModal from './GrantWorkspaceAccessModal'
import ProfileSettingsSection from './ProfileSettingsSection'
import type { ProfileRole } from '@prisma/client'

type MemberItem = {
    id: string
    userId: string
    role: ProfileRole
    grantedAt: string
    user: {
        id: string
        username: string
        nickname: string | null
        displayName: string | null
        email: string | null
        avatarUrl: string | null
    }
}

type Props = {
    profileId: string
    profileName: string
    workspaceId: string
    members: MemberItem[]
    currentUserId: string
    currentUserRole: ProfileRole
    /** [Sprint Z+1] Profile settings cho Settings section render (Owner only) */
    profileSettings?: {
        name: string
        bannerUrl: string | null
        logoUrl: string | null
    }
}

const ROLE_BADGE: Record<ProfileRole, { label: string; color: string; icon: any }> = {
    OWNER: { label: 'Owner', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Crown },
    ADMIN: { label: 'Admin', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: Shield },
    USER: { label: 'User', color: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20', icon: Users },
}

export default function ProfileMembersPanel({
    profileId,
    profileName,
    workspaceId,
    members,
    currentUserId,
    currentUserRole,
    profileSettings,
}: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [showTransferModal, setShowTransferModal] = useState(false)
    const [grantTarget, setGrantTarget] = useState<MemberItem | null>(null)
    const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    const isOwner = currentUserRole === 'OWNER'
    const canInvite = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'

    function refresh() {
        startTransition(() => router.refresh())
    }

    async function handleRoleChange(userId: string, newRole: ProfileRole) {
        setActionLoading(userId)
        try {
            const result = await changeProfileRoleAction(profileId, userId, newRole)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã cập nhật role.')
                setExpandedMemberId(null)
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    async function handleRemove(userId: string) {
        if (!confirm('Xóa thành viên này khỏi Profile? Tất cả workspace memberships trong profile sẽ bị xóa.')) {
            return
        }
        setActionLoading(userId)
        try {
            const result = await removeFromProfileAction(profileId, userId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã xóa thành viên.')
                setExpandedMemberId(null)
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    const ownerMember = members.find((m) => m.role === 'OWNER')

    return (
        <div className="space-y-4">
            {/* [Sprint Z+1] Profile Settings section — Owner only */}
            {isOwner && profileSettings && (
                <ProfileSettingsSection profileId={profileId} initial={profileSettings} />
            )}

            {/* Action buttons */}
            {canInvite && (
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition"
                    >
                        <UserPlus size={14} /> Mời thành viên
                    </button>
                    {isOwner && ownerMember && (
                        <button
                            onClick={() => setShowTransferModal(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-zinc-200 text-sm font-semibold transition border border-white/10"
                        >
                            <ArrowRightLeft size={14} /> Transfer ownership
                        </button>
                    )}
                </div>
            )}

            {/* Members list */}
            <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] overflow-hidden">
                <div className="p-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                        <Users size={14} /> Thành viên ({members.length})
                    </h3>
                </div>
                <div className="divide-y divide-white/5">
                    {members.map((m) => {
                        const badge = ROLE_BADGE[m.role]
                        const RoleIcon = badge.icon
                        const isSelf = m.userId === currentUserId
                        const isLoading = actionLoading === m.userId
                        const displayName = (m.user.displayName?.trim() || m.user.username)
                        const canManageThisMember = isOwner && !isSelf && m.role !== 'OWNER'

                        return (
                            <div key={m.id} className="p-4 flex items-center gap-3 hover:bg-white/[0.02]">
                                <Avatar className="h-9 w-9 shrink-0">
                                    {m.user.avatarUrl && <AvatarImage src={m.user.avatarUrl} />}
                                    <AvatarFallback className="bg-violet-500/20 text-violet-300 text-[11px]">
                                        {displayName.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-zinc-100 truncate">{displayName}</span>
                                        {isSelf && (
                                            <span className="text-[10px] text-violet-300 font-medium">(Bạn)</span>
                                        )}
                                    </div>
                                    {m.user.email && (
                                        <span className="text-[11px] text-zinc-500 truncate">{m.user.email}</span>
                                    )}
                                </div>
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${badge.color}`}>
                                    <RoleIcon size={11} /> {badge.label}
                                </div>

                                {canManageThisMember && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setExpandedMemberId(expandedMemberId === m.id ? null : m.id)}
                                            disabled={isLoading}
                                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400 disabled:opacity-50"
                                        >
                                            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={14} />}
                                        </button>

                                        {expandedMemberId === m.id && (
                                            <div className="absolute right-0 top-full mt-1 w-52 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl z-10 p-1 text-sm">
                                                {m.role === 'USER' && (
                                                    <button
                                                        onClick={() => handleRoleChange(m.userId, 'ADMIN')}
                                                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] text-indigo-300"
                                                    >
                                                        <Shield size={13} /> Promote to Admin
                                                    </button>
                                                )}
                                                {m.role === 'ADMIN' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleRoleChange(m.userId, 'USER')}
                                                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] text-zinc-300"
                                                        >
                                                            <Users size={13} /> Demote to User
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setGrantTarget(m)
                                                                setExpandedMemberId(null)
                                                            }}
                                                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] text-amber-300"
                                                        >
                                                            <Lock size={13} /> Cấp truy cập workspace cũ
                                                        </button>
                                                    </>
                                                )}
                                                <div className="h-px bg-white/5 my-1" />
                                                <button
                                                    onClick={() => handleRemove(m.userId)}
                                                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-red-500/10 text-red-400"
                                                >
                                                    <UserMinus size={13} /> Xóa khỏi Profile
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Modals */}
            {showInviteModal && (
                <InviteToProfileModal
                    profileId={profileId}
                    profileName={profileName}
                    onClose={() => setShowInviteModal(false)}
                    onSuccess={() => {
                        setShowInviteModal(false)
                        refresh()
                    }}
                />
            )}
            {showTransferModal && (
                <TransferProfileOwnershipModal
                    profileId={profileId}
                    profileName={profileName}
                    members={members.filter((m) => m.role !== 'OWNER' && m.userId !== currentUserId)}
                    onClose={() => setShowTransferModal(false)}
                    onSuccess={() => {
                        setShowTransferModal(false)
                        refresh()
                    }}
                />
            )}
            {grantTarget && (
                <GrantWorkspaceAccessModal
                    profileId={profileId}
                    targetUserId={grantTarget.userId}
                    targetUserName={grantTarget.user.displayName?.trim() || grantTarget.user.username}
                    onClose={() => setGrantTarget(null)}
                    onSuccess={() => {
                        setGrantTarget(null)
                        refresh()
                    }}
                />
            )}
        </div>
    )
}
