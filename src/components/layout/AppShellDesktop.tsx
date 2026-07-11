"use client"

// [Mobile P1 — công tắc lớn] Nhánh DESKTOP của AppShell hợp nhất.
// Nội dung y hệt AdminShell cũ (đã xóa) — giữ desktop BẤT BIẾN về mặt nhìn
// (R4 / DR-3): AppSidebar 261/72px + main + CommandMenu ⌘K + UploadTray.
import * as React from "react"
import { AppSidebar } from "./AppSidebar"
import { CommandMenu } from "./CommandMenu"
import { UploadTray } from "@/components/review/UploadTray"
import { cn } from "@/lib/utils"

interface AppShellDesktopProps {
    children: React.ReactNode
    user: {
        username: string
        role: string
        isTreasurer?: boolean
        avatarUrl?: string
    }
    workspaceId: string
    viewRole?: 'ADMIN' | 'USER'
    /** Workspace-scoped role for nav filtering */
    workspaceRole?: string
}

export function AppShellDesktop({ children, user, workspaceId, viewRole = 'ADMIN', workspaceRole }: AppShellDesktopProps) {
    const [collapsed, setCollapsed] = React.useState(false)

    return (
        <div className="flex min-h-dvh bg-background text-foreground">
            <AppSidebar user={user} workspaceId={workspaceId} onCollapsedChange={setCollapsed} viewRole={viewRole} workspaceRole={workspaceRole} />
            <main
                className={cn(
                    "flex-1 overflow-x-hidden pt-16 md:pt-0 relative transition-all duration-300",
                    collapsed ? "md:ml-[72px]" : "md:ml-[261px]"
                )}
            >
                <div className="container mx-auto p-4 md:p-8 max-w-[2000px] animate-fade-in">
                    {children}
                    {/* Safe spacer for bottom content */}
                    <div className="h-20"></div>
                </div>
            </main>
            <CommandMenu />
            {/* [Review P1.10] global upload sheet — persists across admin navigation */}
            <UploadTray />
        </div>
    )
}
