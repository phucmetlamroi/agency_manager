"use client"

import * as React from "react"
import { AppSidebar } from "./AppSidebar"
import { CommandMenu } from "./CommandMenu"

interface AdminShellProps {
    children: React.ReactNode
    user: {
        username: string
        role: string
        reputation?: number
        isTreasurer?: boolean
    }
}

import NotificationBell from "@/components/NotificationBell"

export function AdminShell({ children, user }: AdminShellProps) {
    const [collapsed, setCollapsed] = React.useState(false)

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <AppSidebar user={user} onCollapsedChange={setCollapsed} />
            <main
                className="flex-1 overflow-x-hidden pt-16 md:pt-0 relative transition-all duration-300"
                style={{ marginLeft: collapsed ? '80px' : '280px' }}
            >
                <div className="absolute top-4 right-4 z-30 hidden md:block">
                    <NotificationBell />
                </div>
                <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-fade-in">
                    {children}
                    {/* Safe spacer for bottom content */}
                    <div className="h-20"></div>
                </div>
            </main>
            <CommandMenu />
        </div>
    )
}
