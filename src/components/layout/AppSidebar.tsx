"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    LayoutDashboard,
    Users,
    Building2,
    Wallet,
    ListTodo,
    Smile,
    LogOut,
    ChevronLeft,
    ChevronRight,
    UserCircle,
    Activity,
    Menu,
    CalendarDays
} from "lucide-react"

import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

interface SidebarProps {
    user: {
        username: string
        role: string
        isTreasurer?: boolean
        avatarUrl?: string
    }
    workspaceId: string
    onCollapsedChange?: (collapsed: boolean) => void
}

const getNavItems = (workspaceId: string) => [
    { label: "Dashboard", href: `/${workspaceId}/admin`, icon: LayoutDashboard },
    { label: "Task Queue", href: `/${workspaceId}/admin/queue`, icon: ListTodo },
    { label: "Clients Manager", href: `/${workspaceId}/admin/crm`, icon: Smile },
    { label: "Schedule", href: `/${workspaceId}/admin/schedule`, icon: CalendarDays },
    { label: "Payroll", href: `/${workspaceId}/admin/payroll`, icon: Wallet },
    { label: "Finance", href: `/${workspaceId}/admin/finance`, icon: Building2 },
    { label: "Staff", href: `/${workspaceId}/admin/users`, icon: Users },
    { label: "Analytics", href: `/${workspaceId}/admin/analytics`, icon: Activity },
]

export function AppSidebar({ user, workspaceId, onCollapsedChange }: SidebarProps) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = React.useState(false)
    const [isMobile, setIsMobile] = React.useState(false)

    // Handle resize
    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

    // Notify parent of collapse changes
    const handleToggleCollapse = () => {
        const newCollapsed = !collapsed
        setCollapsed(newCollapsed)
        onCollapsedChange?.(newCollapsed)
    }

    // Get user initials for avatar
    const getInitials = (name: string) => {
        const parts = name.trim().split(/\s+/)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return name.slice(0, 2).toUpperCase()
    }

    // Filtered nav items based on role
    const filteredNavItems = getNavItems(workspaceId).filter(item => {
        if (item.href.includes('/admin/finance')) return user.role === 'ADMIN' || user.isTreasurer
        if (item.href.includes('/admin/analytics')) return user.role === 'ADMIN'
        return true
    })

    // ── Mobile: top bar + sheet drawer ──
    if (isMobile) {
        return (
            <div
                className="fixed top-0 left-0 right-0 h-[72px] flex items-center px-5 justify-between z-40"
                style={{
                    background: "rgba(10,10,10,0.85)",
                    backdropFilter: "blur(20px)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
            >
                {/* Mobile logo */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                        style={{
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                            boxShadow: "0 0 18px rgba(139,92,246,0.40)",
                        }}
                    >
                        <span className="text-white font-extrabold text-lg" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>H</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-extrabold text-base text-zinc-100 tracking-tight">
                            Hustly<span className="text-zinc-400">Tasker</span>
                        </span>
                    </div>
                </div>

                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-100">
                            <Menu className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent
                        side="left"
                        className="w-[280px] p-0 border-r"
                        style={{
                            background: "rgba(10,10,10,0.95)",
                            backdropFilter: "blur(20px)",
                            borderColor: "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="flex flex-col h-full">
                            {/* Sheet logo */}
                            <div
                                className="flex items-center gap-3 h-[72px] px-5"
                                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                            >
                                <div
                                    className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                                    style={{
                                        borderRadius: 10,
                                        background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                                        boxShadow: "0 0 18px rgba(139,92,246,0.40)",
                                    }}
                                >
                                    <span className="text-white font-extrabold text-lg" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>H</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-extrabold text-base text-zinc-100 tracking-tight">
                                        Hustly<span className="text-zinc-400">Tasker</span>
                                    </span>
                                    <span className="text-[9px] text-zinc-500 uppercase font-mono tracking-[0.18em]">
                                        Admin &middot; v2.4
                                    </span>
                                </div>
                            </div>

                            {/* Sheet nav */}
                            <nav className="flex-1 p-3 flex flex-col gap-1 overflow-auto">
                                {filteredNavItems.map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-full text-[13px] font-semibold transition-all duration-200",
                                                "py-[10px] px-[14px]",
                                                isActive
                                                    ? "text-indigo-300"
                                                    : "text-zinc-400 hover:text-zinc-100 hover:translate-x-0.5"
                                            )}
                                            style={{
                                                background: isActive ? "rgba(99,102,241,0.18)" : "transparent",
                                                border: isActive ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent",
                                                boxShadow: isActive ? "0 4px 16px rgba(99,102,241,0.15)" : "none",
                                            }}
                                        >
                                            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                                            <span className="flex-1">{item.label}</span>
                                        </Link>
                                    )
                                })}
                            </nav>

                            {/* Sheet profile */}
                            <div
                                className="flex items-center gap-[10px] p-[14px]"
                                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                            >
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-[13px] flex-shrink-0"
                                    style={{ background: "linear-gradient(135deg,#A855F7,#6366F1)" }}
                                >
                                    {getInitials(user.username)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[12px] font-bold text-zinc-100 truncate">{user.username}</div>
                                    <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.14em]">{user.role}</div>
                                </div>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        )
    }

    // ── Desktop: full sidebar ──
    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "fixed left-0 top-0 flex flex-col h-screen flex-shrink-0 z-40 transition-all duration-300 ease-in-out",
                    collapsed ? "w-[72px]" : "w-[240px]"
                )}
                style={{
                    background: "rgba(10,10,10,0.85)",
                    backdropFilter: "blur(20px)",
                    borderRight: "1px solid rgba(255,255,255,0.06)",
                }}
            >
                {/* ── Logo section ── */}
                <div
                    className={cn(
                        "flex items-center h-[72px] flex-shrink-0",
                        collapsed ? "justify-center px-0" : "gap-3 px-5"
                    )}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                >
                    <div
                        className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                        style={{
                            borderRadius: 10,
                            background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                            boxShadow: "0 0 18px rgba(139,92,246,0.40)",
                        }}
                    >
                        <span className="text-white font-extrabold text-lg" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>H</span>
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col overflow-hidden">
                            <span className="font-extrabold text-base text-zinc-100 tracking-tight whitespace-nowrap" style={{ letterSpacing: "-0.02em" }}>
                                Hustly<span className="text-zinc-400">Tasker</span>
                            </span>
                            <span className="text-[9px] text-zinc-500 uppercase font-mono tracking-[0.18em] whitespace-nowrap">
                                Admin &middot; v2.4
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Collapse toggle ── */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3.5 top-20 h-7 w-7 rounded-full border bg-zinc-900 shadow-md z-50 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.10)" }}
                    onClick={handleToggleCollapse}
                >
                    {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </Button>

                {/* ── Navigation ── */}
                <nav className="flex-1 p-3 flex flex-col gap-1 overflow-auto">
                    {filteredNavItems.map((item) => {
                        const isActive = pathname === item.href

                        if (collapsed) {
                            return (
                                <Tooltip key={item.href}>
                                    <TooltipTrigger asChild>
                                        <Link
                                            href={item.href}
                                            className={cn(
                                                "flex items-center justify-center w-[46px] h-[46px] mx-auto rounded-full transition-all duration-200",
                                                isActive
                                                    ? "text-indigo-300"
                                                    : "text-zinc-400 hover:text-zinc-100"
                                            )}
                                            style={{
                                                background: isActive ? "rgba(99,102,241,0.18)" : "transparent",
                                                border: isActive ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent",
                                                boxShadow: isActive ? "0 4px 16px rgba(99,102,241,0.15)" : "none",
                                            }}
                                        >
                                            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">{item.label}</TooltipContent>
                                </Tooltip>
                            )
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "group flex items-center gap-3 rounded-full text-[13px] font-semibold transition-all duration-200",
                                    "py-[10px] px-[14px]",
                                    isActive
                                        ? "text-indigo-300"
                                        : "text-zinc-400 hover:text-zinc-100 hover:translate-x-0.5"
                                )}
                                style={{
                                    background: isActive ? "rgba(99,102,241,0.18)" : undefined,
                                    border: isActive ? "1px solid rgba(99,102,241,0.30)" : "1px solid transparent",
                                    boxShadow: isActive ? "0 4px 16px rgba(99,102,241,0.15)" : "none",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = "transparent"
                                    }
                                }}
                            >
                                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                {/* ── Profile card ── */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "flex items-center w-full cursor-pointer transition-colors hover:bg-white/[0.04]",
                                    collapsed ? "justify-center p-3" : "gap-[10px] p-[14px]"
                                )}
                                style={{ background: "transparent", border: "none", outline: "none" }}
                            >
                                <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-[13px] flex-shrink-0"
                                    style={{ background: "linear-gradient(135deg,#A855F7,#6366F1)" }}
                                >
                                    {getInitials(user.username)}
                                </div>
                                {!collapsed && (
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="text-[12px] font-bold text-zinc-100 truncate">{user.username}</div>
                                        <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.14em]">{user.role}</div>
                                    </div>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-56 bg-zinc-950/90 backdrop-blur-xl border shadow-2xl"
                            style={{ borderColor: "rgba(255,255,255,0.10)" }}
                            align="end"
                            side="right"
                            forceMount
                        >
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none text-zinc-100">{user.username}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem onClick={() => window.location.href = `/${workspaceId}/dashboard/profile`}>
                                <UserCircle className="mr-2 h-4 w-4" />
                                <span>Profile</span>
                            </DropdownMenuItem>
                            {user.isTreasurer && (
                                <DropdownMenuItem onClick={() => window.location.href = `/${workspaceId}/admin/finance`}>
                                    <Wallet className="mr-2 h-4 w-4" />
                                    <span>Finance Portal</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => window.location.href = '/profile'}>
                                <LayoutDashboard className="mr-2 h-4 w-4" />
                                <span>Switch Workspace</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => window.location.href = '/api/auth/logout'}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>
        </TooltipProvider>
    )
}
