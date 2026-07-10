'use client'

// [Mobile P1 §3.5] Header 56px "root variant", partially-persistent (ẩn khi cuộn xuống,
// hiện khi cuộn lên). Nền/blur token .glass-2 + z-nav + safe-area-top. Avatar mở
// AccountSheet (vaul bottom sheet).
import { useState } from 'react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { cn } from '@/lib/utils'
import AccountSheet from '@/components/layout/AccountSheet'

interface AppHeaderProps {
    user: { username: string; role: string; avatarUrl?: string }
    workspaceId: string
    /** Workspace-scoped role — gates admin links trong AccountSheet. */
    workspaceRole?: string
    handleLogout: () => void
}

export default function AppHeader({ user, workspaceId, workspaceRole, handleLogout }: AppHeaderProps) {
    const [sheetOpen, setSheetOpen] = useState(false)
    const hidden = useScrollDirection(80)

    return (
        <>
            <header
                className={cn(
                    'sticky top-0 z-nav glass-2 rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)] transition-transform duration-300 will-change-transform',
                    hidden ? '-translate-y-full' : 'translate-y-0'
                )}
            >
                <div className="flex h-14 items-center justify-between gap-3 px-4">
                    <BrandLogo />
                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        <button
                            onClick={() => setSheetOpen(true)}
                            className="group relative cursor-pointer"
                            aria-label="Mở tài khoản"
                        >
                            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-900 shadow-md shadow-primary/20 ring-2 ring-white/10 transition-all duration-300 group-hover:ring-primary/50">
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.username} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary text-xs font-bold text-white">
                                        {user.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                        </button>
                    </div>
                </div>
            </header>

            <AccountSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                user={user}
                workspaceId={workspaceId}
                workspaceRole={workspaceRole}
                handleLogout={handleLogout}
            />
        </>
    )
}
