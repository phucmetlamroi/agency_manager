'use client'

// [Mobile P4.2 / M8] Danh sách Thành viên (roster) dạng card cho mobile. Dispatcher ở
// profile-members/page.tsx chọn component này khi x-device-type=mobile; desktop giữ
// ProfileMembersPanel.tsx NGUYÊN VẸN. Header "Thành viên (N)" + search sticky realtime +
// list glass-1 (MemberRow) + kebab → action sheet (MobileSheet) + dialog đổi vai trò +
// useConfirm xóa. Tái dùng NGUYÊN các server action (changeProfileRoleAction /
// removeFromProfileAction) — không đổi chữ ký, không thêm action.
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, ShieldCheck, UserMinus, UserPlus, Users, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { ProfileRole } from '@prisma/client'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { MemberRow, type MemberRowData } from './MemberRow'
import InviteToProfileModal from '@/components/profile/InviteToProfileModal'
import {
    changeProfileRoleAction,
    removeFromProfileAction,
} from '@/actions/profile-member-actions'
import { getDisplayName } from '@/lib/display-name'
import { roleLabel } from '@/lib/display-labels'
import { cn } from '@/lib/utils'

type MobileMember = MemberRowData & {
    grantedAt?: string
    user: MemberRowData['user'] & { email?: string | null }
}

type Props = {
    profileId: string
    profileName: string
    workspaceId: string
    members: MobileMember[]
    currentUserId: string
    currentUserRole: ProfileRole
}

// Chỉ 2 vai trò gán được qua changeProfileRoleAction (OWNER dùng transfer, CLIENT bị chặn).
const ASSIGNABLE_ROLES: { value: 'ADMIN' | 'USER'; label: string; hint: string }[] = [
    { value: 'ADMIN', label: 'Quản trị', hint: 'Tạo workspace + mời thành viên' },
    { value: 'USER', label: 'Nhân viên', hint: 'Chỉ xem trong tổ chức' },
]

export default function MobileProfileMembersList({
    profileId,
    profileName,
    workspaceId,
    members,
    currentUserId,
    currentUserRole,
}: Props) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [, startTransition] = useTransition()

    const [searchQuery, setSearchQuery] = useState('')
    const [busy, setBusy] = useState(false)

    // Sheet tách khỏi `sheetMember` để body sheet còn mounted suốt animation đóng (~300ms).
    const [sheetMember, setSheetMember] = useState<MobileMember | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)

    // Dialog đổi vai trò
    const [roleTarget, setRoleTarget] = useState<MobileMember | null>(null)
    const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'USER'>('USER')

    // Modal mời (chỉ dùng trong empty-state single-member)
    const [showInvite, setShowInvite] = useState(false)

    const isOwner = currentUserRole === 'OWNER'
    const canInvite = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN'

    const profileHref = (m: MobileMember) => `/${workspaceId}/admin/analytics/staff/${m.userId}`

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        if (!q) return members
        return members.filter((m) => {
            const name = getDisplayName(m.user).toLowerCase()
            const username = (m.user.username ?? '').toLowerCase()
            const role = roleLabel(m.role).toLowerCase()
            return name.includes(q) || username.includes(q) || role.includes(q)
        })
    }, [members, searchQuery])

    function openKebab(m: MemberRowData) {
        setSheetMember(m as MobileMember)
        setSheetOpen(true)
    }

    function openRoleDialog(m: MobileMember) {
        setSheetOpen(false)
        setRoleTarget(m)
        setSelectedRole(m.role === 'ADMIN' ? 'ADMIN' : 'USER')
    }

    function goToProfile(m: MobileMember) {
        setSheetOpen(false)
        router.push(profileHref(m))
    }

    async function handleSaveRole() {
        if (!roleTarget) return
        if (selectedRole === roleTarget.role) {
            setRoleTarget(null)
            return
        }
        setBusy(true)
        try {
            const res = await changeProfileRoleAction(profileId, roleTarget.userId, selectedRole)
            if ((res as any).error) {
                toast.error((res as any).error)
            } else {
                toast.success('Đã cập nhật vai trò.')
                setRoleTarget(null)
                startTransition(() => router.refresh())
            }
        } finally {
            setBusy(false)
        }
    }

    async function handleRemove(m: MobileMember) {
        setSheetOpen(false)
        const ok = await confirm({
            title: `Xóa ${getDisplayName(m.user)} khỏi tổ chức?`,
            message: 'Người này sẽ mất quyền truy cập workspace ngay lập tức.',
            type: 'danger',
            confirmText: 'Xóa',
            cancelText: 'Hủy',
        })
        if (!ok) return
        setBusy(true)
        try {
            const res = await removeFromProfileAction(profileId, m.userId)
            if ((res as any).error) {
                toast.error((res as any).error)
            } else {
                toast.success('Đã xóa thành viên khỏi tổ chức.')
                startTransition(() => router.refresh())
            }
        } finally {
            setBusy(false)
        }
    }

    // Quyền quản lý 1 thành viên (khớp server: chỉ OWNER, không tự thao tác mình, không đụng OWNER).
    const sheetIsSelf = sheetMember?.userId === currentUserId
    const canManageSheet = !!sheetMember && isOwner && !sheetIsSelf && sheetMember.role !== 'OWNER'

    return (
        <div className="flex flex-col gap-3">
            {/* ── Header spoke "Thành viên (N)" ── */}
            <h1 className="text-page font-bold text-foreground">
                Thành viên <span className="font-normal text-muted-foreground">({members.length})</span>
            </h1>

            {/* ── Search sticky (h-12, ≥16px text-body chặn iOS zoom) ── */}
            <div className="sticky top-0 z-sticky -mx-4 bg-background/90 px-4 py-1 backdrop-blur-sm">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm theo tên, username, vai trò…"
                        className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 pl-10 pr-3 text-body text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/40"
                    />
                </div>
            </div>

            {/* ── List / EmptyState ── */}
            {filtered.length === 0 ? (
                <EmptyState
                    variant="no-results"
                    title={`Không tìm thấy thành viên khớp "${searchQuery.trim()}"`}
                    description="Thử một từ khóa khác."
                    cta={{ label: 'Xóa tìm kiếm', onClick: () => setSearchQuery('') }}
                />
            ) : (
                <div className="glass-1 divide-y divide-white/[0.06] rounded-xl">
                    {filtered.map((m) => (
                        <MemberRow
                            key={m.id}
                            member={m}
                            isSelf={m.userId === currentUserId}
                            /* [P4.2 review HIGH] Chỉ OWNER mới điều hướng "Xem hồ sơ" + có kebab.
                               Trang staff-analytics gate theo verifyWorkspaceAccess('ADMIN') mà một
                               profile-ADMIN trên workspace CŨ có thể trượt → redirect im lặng về
                               /dashboard. OWNER luôn qua (workspace tạo sau khi được cấp quyền); ADMIN
                               không-OWNER = read-only (khớp vai trò "chỉ xem" của họ, không có thao tác). */
                            profileHref={isOwner ? profileHref(m) : null}
                            onOpenKebab={isOwner ? openKebab : null}
                        />
                    ))}
                </div>
            )}

            {/* ── Single-member first-use (chỉ có bạn) — CTA mời tái dùng luồng có sẵn ── */}
            {members.length === 1 && !searchQuery.trim() && (
                <EmptyState
                    variant="first-use"
                    icon={Users}
                    title="Chỉ có bạn trong tổ chức"
                    description="Mời đồng đội để cùng quản lý task và workspace."
                    {...(canInvite
                        ? { cta: { label: 'Mời thành viên', onClick: () => setShowInvite(true) } }
                        : {})}
                />
            )}

            {/* ── Action sheet (kebab) ── */}
            <MobileSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                title={sheetMember ? getDisplayName(sheetMember.user) : undefined}
            >
                {sheetMember && (
                    <div className="flex flex-col pb-1">
                        <SheetAction
                            icon={User}
                            label="Xem hồ sơ"
                            onClick={() => goToProfile(sheetMember)}
                        />
                        {canManageSheet && (
                            <>
                                <SheetAction
                                    icon={ShieldCheck}
                                    label="Đổi vai trò"
                                    onClick={() => openRoleDialog(sheetMember)}
                                />
                                <div className="my-1 h-px bg-white/[0.06]" />
                                <SheetAction
                                    icon={UserMinus}
                                    label="Xóa khỏi tổ chức"
                                    destructive
                                    disabled={busy}
                                    onClick={() => handleRemove(sheetMember)}
                                />
                            </>
                        )}
                    </div>
                )}
            </MobileSheet>

            {/* ── Dialog đổi vai trò (radio 48px + Lưu thay đổi) ── */}
            <Dialog open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Đổi vai trò</DialogTitle>
                    </DialogHeader>
                    {roleTarget && (
                        <div className="flex flex-col gap-2 py-2">
                            <p className="text-body-sm text-muted-foreground">
                                {getDisplayName(roleTarget.user)}
                            </p>
                            <div role="radiogroup" className="flex flex-col gap-1.5">
                                {ASSIGNABLE_ROLES.map((r) => {
                                    const active = selectedRole === r.value
                                    return (
                                        <button
                                            key={r.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => setSelectedRole(r.value)}
                                            className={cn(
                                                'flex h-12 items-center gap-3 rounded-xl border px-3 text-left transition-colors',
                                                active
                                                    ? 'border-primary/40 bg-primary/10'
                                                    : 'border-white/8 bg-white/[0.02] hover:bg-white/[0.04]',
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                                                    active ? 'border-primary-accent' : 'border-white/20',
                                                )}
                                            >
                                                {active && <Check className="h-3.5 w-3.5 text-primary-accent" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-body-sm font-medium text-foreground">
                                                    {r.label}
                                                </span>
                                                <span className="block truncate text-caption text-muted-foreground">
                                                    {r.hint}
                                                </span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            className="h-12 w-full"
                            disabled={busy || !roleTarget || selectedRole === roleTarget?.role}
                            onClick={handleSaveRole}
                        >
                            Lưu thay đổi
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Modal mời (luồng InviteToProfileModal có sẵn) ── */}
            {showInvite && (
                <InviteToProfileModal
                    profileId={profileId}
                    profileName={profileName}
                    workspaceId={workspaceId}
                    onClose={() => setShowInvite(false)}
                    onSuccess={() => {
                        setShowInvite(false)
                        startTransition(() => router.refresh())
                    }}
                />
            )}
        </div>
    )
}

function SheetAction({
    icon: Icon,
    label,
    onClick,
    destructive,
    disabled,
}: {
    icon: typeof User
    label: string
    onClick: () => void
    destructive?: boolean
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-left text-body-sm font-medium transition-colors disabled:opacity-50',
                destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'text-foreground hover:bg-white/5',
            )}
        >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
    )
}
