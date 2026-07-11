'use client'

// [Mobile P4.2 / M8 — FR-E2.2, FR-E5] Hàng thành viên (roster) cho mobile. Thuần trình bày:
// avatar 40px + tên (getDisplayName — KHÔNG lộ handle kỹ thuật g_… ) + username + badge vai trò
// (CHỈ vai trò nâng cao; "Nhân viên" mặc định KHÔNG badge) + nút kebab 44px. Body hàng bấm →
// "Xem hồ sơ" (Link); kebab mở action sheet. Container cha bọc list trong glass-1 + divide-y.
import Link from 'next/link'
import { MoreVertical } from 'lucide-react'
import type { ProfileRole } from '@prisma/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getDisplayName, isTechnicalHandle } from '@/lib/display-name'
import { roleLabel } from '@/lib/display-labels'
import { cn } from '@/lib/utils'

export type MemberRowUser = {
    id: string
    username: string
    nickname: string | null
    displayName: string | null
    email?: string | null
    avatarUrl: string | null
}

export type MemberRowData = {
    id: string
    userId: string
    role: ProfileRole
    user: MemberRowUser
}

// [FR-E2.2] Badge CHỈ cho vai trò nâng cao. USER ("Nhân viên") + mọi vai trò khác → KHÔNG badge.
// OWNER lấy sắc cảnh báo (amber, khớp Crown desktop); ADMIN lấy sắc primary như spec.
const ROLE_BADGE: Partial<Record<ProfileRole, string>> = {
    OWNER: 'bg-warning/15 text-warning',
    ADMIN: 'bg-primary/15 text-primary-accent',
}

export function MemberRow({
    member,
    isSelf,
    profileHref,
    onOpenKebab,
}: {
    member: MemberRowData
    isSelf: boolean
    /** Link tới trang hồ sơ nhân sự — null khi người xem KHÔNG có quyền vào trang đó
     *  (khi đó body không điều hướng, tránh dead-end im lặng). */
    profileHref: string | null
    /** null khi người xem không có thao tác nào (read-only) → ẩn kebab thay vì mở sheet rỗng. */
    onOpenKebab: ((member: MemberRowData) => void) | null
}) {
    const name = getDisplayName(member.user)
    const badgeClass = ROLE_BADGE[member.role]
    // [FR-E5] username phụ đề: ẩn nếu là handle kỹ thuật (g_<hex>) để không lộ ra UI.
    const usernameLabel =
        member.user.username && !isTechnicalHandle(member.user.username)
            ? `@${member.user.username}`
            : null

    const body = (
        <>
            <Avatar className="h-10 w-10 shrink-0">
                {member.user.avatarUrl && <AvatarImage src={member.user.avatarUrl} alt={name} />}
                <AvatarFallback className="bg-primary/15 text-[13px] font-semibold text-primary-accent">
                    {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-body-sm font-medium text-foreground">{name}</span>
                    {isSelf && <span className="shrink-0 text-caption text-primary-accent">(Bạn)</span>}
                </div>
                {usernameLabel && (
                    <span className="block truncate text-caption text-muted-foreground">{usernameLabel}</span>
                )}
            </div>
        </>
    )

    return (
        <div className="flex min-h-14 items-center gap-3 px-3">
            {profileHref ? (
                <Link
                    href={profileHref}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2 transition-opacity active:opacity-70"
                >
                    {body}
                </Link>
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3 py-2">{body}</div>
            )}

            {badgeClass && (
                <span
                    className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                        badgeClass,
                    )}
                >
                    {roleLabel(member.role)}
                </span>
            )}

            {onOpenKebab && (
                <button
                    type="button"
                    aria-label={`Thao tác với ${name}`}
                    onClick={() => onOpenKebab(member)}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 active:bg-white/10"
                >
                    <MoreVertical className="h-5 w-5" />
                </button>
            )}
        </div>
    )
}

export default MemberRow
