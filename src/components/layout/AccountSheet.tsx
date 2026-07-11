'use client'

// [Mobile P1 §3.2] Account sheet — vaul bottom sheet thu về đúng vai "tài khoản".
// Thay drawer tự viết (z-[100]) trong MobileLayoutShell/AppHeader-bridge. Đóng bằng
// nút / tap scrim / Back gesture (useHistoryBackClose). glass-3 + safe-area-bottom.
import { Drawer } from 'vaul'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { UserCircle, AlertTriangle, ArrowLeftRight, Settings, Monitor, LogOut, UsersRound, ScrollText } from 'lucide-react'
import { roleLabel } from '@/lib/display-labels'
import { useHistoryBackClose } from '@/hooks/useHistoryBackClose'
import { cn } from '@/lib/utils'

interface AccountSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    user: { username: string; role: string; avatarUrl?: string }
    workspaceId: string
    workspaceRole?: string
    handleLogout: () => void
}

export default function AccountSheet({ open, onOpenChange, user, workspaceId, workspaceRole, handleLogout }: AccountSheetProps) {
    const isAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN'
    const [confirmLogout, setConfirmLogout] = useState(false)
    const close = useCallback(() => onOpenChange(false), [onOpenChange])
    useHistoryBackClose(open, close)

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 z-sheet bg-black/60 backdrop-blur-sm" />
                <Drawer.Content className="fixed inset-x-0 bottom-0 z-sheet flex max-h-[86vh] flex-col rounded-t-2xl glass-3 border-t border-white/10 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none">
                    <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-white/15" />

                    <div className="flex items-center gap-3 px-5 pb-3 pt-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary text-lg font-black text-white ring-2 ring-primary/20">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                user.username?.[0]?.toUpperCase()
                            )}
                        </div>
                        <div className="min-w-0">
                            <Drawer.Title className="truncate text-base font-bold text-zinc-100">{user.username}</Drawer.Title>
                            <p className="text-xs uppercase tracking-widest text-muted-foreground">{roleLabel(user.role)}</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-2">
                        <SheetLink href={`/${workspaceId}/dashboard/profile`} icon={UserCircle} onClick={close}>Hồ sơ cá nhân</SheetLink>
                        <SheetLink href={`/${workspaceId}/dashboard/errors`} icon={AlertTriangle} danger onClick={close}>Hồ sơ vi phạm</SheetLink>
                        <SheetLink href={`/api/profile/select`} icon={ArrowLeftRight} onClick={close}>Đổi Team / Workspace</SheetLink>

                        {isAdmin && (
                            <>
                                <div className="my-1 h-px bg-white/10" />
                                <SheetLink href={`/${workspaceId}/admin/profile-members`} icon={UsersRound} onClick={close}>Thành viên</SheetLink>
                                <SheetLink href={`/${workspaceId}/admin/audit-log`} icon={ScrollText} onClick={close}>Nhật ký hoạt động</SheetLink>
                                <SheetLink href={`/${workspaceId}/admin/settings`} icon={Settings} onClick={close}>Cài đặt</SheetLink>
                            </>
                        )}

                        <div className="my-1 h-px bg-white/10" />
                        <form action={async () => { const { toggleMobileView } = await import('@/actions/ui-actions'); await toggleMobileView(false) }}>
                            <button type="submit" className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5">
                                <Monitor className="h-4 w-4 shrink-0" /> Chuyển sang giao diện máy tính
                            </button>
                        </form>

                        {confirmLogout ? (
                            <button onClick={handleLogout} className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-700 to-red-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/30">
                                <LogOut className="h-4 w-4" /> Xác nhận đăng xuất
                            </button>
                        ) : (
                            <button onClick={() => setConfirmLogout(true)} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10">
                                <LogOut className="h-4 w-4 shrink-0" /> Đăng xuất
                            </button>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}

function SheetLink({
    href, icon: Icon, children, onClick, danger,
}: {
    href: string
    icon: React.ComponentType<{ className?: string }>
    children: React.ReactNode
    onClick?: () => void
    danger?: boolean
}) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                'flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors',
                danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-200 hover:bg-white/5'
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {children}
        </Link>
    )
}
