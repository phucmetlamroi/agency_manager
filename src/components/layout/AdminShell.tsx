"use client"

import * as React from "react"
import { AppSidebar } from "./AppSidebar"
import { CommandMenu } from "./CommandMenu"
import { cn } from "@/lib/utils"


interface AdminShellProps {
    children: React.ReactNode
    user: {
        username: string
        role: string
        isTreasurer?: boolean
        avatarUrl?: string
    }
    workspaceId: string
}



export function AdminShell({ children, user, workspaceId }: AdminShellProps) {
    const [collapsed, setCollapsed] = React.useState(false)

    return (
        <div className="flex min-h-dvh bg-background text-foreground">
            <AppSidebar user={user} workspaceId={workspaceId} onCollapsedChange={setCollapsed} />
            <main
                className={cn(
                    "flex-1 overflow-x-hidden pt-16 md:pt-0 relative transition-all duration-300",
                    collapsed ? "md:ml-[80px]" : "md:ml-[280px]"
                )}
            >
                    {/* Leaderboard will go here */}
                <div className="container mx-auto p-4 md:p-8 max-w-[2000px] animate-fade-in">
                    {children}
                    {/* Safe spacer for bottom content */}
                    <div className="h-20"></div>
                </div>
            </main>
            <CommandMenu />
        </div>
    )
}
