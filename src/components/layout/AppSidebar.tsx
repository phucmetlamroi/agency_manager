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
    CalendarDays,
    MessageSquare,
    AlertOctagon,
    ArrowRightLeft
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
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { ProfileWorkspaceSwitcher } from "./ProfileWorkspaceSwitcher"

type ViewRole = 'ADMIN' | 'USER'

interface SidebarProps {
    user: {
        username: string
        role: string
        isTreasurer?: boolean
        avatarUrl?: string
    }
    workspaceId: string
    onCollapsedChange?: (collapsed: boolean) => void
    /** Which role's navigation set to show. Defaults to 'ADMIN' for backward compatibility. */
    viewRole?: ViewRole
}

interface NavItem {
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    roles: ViewRole[]
    danger?: boolean
}

const getNavItems = (workspaceId: string, viewRole: ViewRole): NavItem[] => {
    const allItems: NavItem[] = [
        { label: "Dashboard", href: viewRole === 'USER' ? `/${workspaceId}/dashboard` : `/${workspaceId}/admin`, icon: LayoutDashboard, roles: ['ADMIN', 'USER'] },
        { label: "Task Queue", href: `/${workspaceId}/admin/queue`, icon: ListTodo, roles: ['ADMIN'] },
        { label: "Clients Manager", href: `/${workspaceId}/admin/crm`, icon: Smile, roles: ['ADMIN'] },
        { label: "Chat", href: viewRole === 'USER' ? `/${workspaceId}/dashboard/chat` : `/${workspaceId}/admin/chat`, icon: MessageSquare, roles: ['ADMIN', 'USER'] },
        { label: "Schedule", href: viewRole === 'USER' ? `/${workspaceId}/dashboard/schedule` : `/${workspaceId}/admin/schedule`, icon: CalendarDays, roles: ['ADMIN', 'USER'] },
        { label: "My Errors", href: `/${workspaceId}/dashboard/errors`, icon: AlertOctagon, roles: ['USER'], danger: true },
        { label: "Profile", href: `/${workspaceId}/dashboard/profile`, icon: UserCircle, roles: ['USER'] },
        { label: "Payroll", href: `/${workspaceId}/admin/payroll`, icon: Wallet, roles: ['ADMIN'] },
        { label: "Finance", href: `/${workspaceId}/admin/finance`, icon: Building2, roles: ['ADMIN'] },
        { label: "Staff", href: `/${workspaceId}/admin/users`, icon: Users, roles: ['ADMIN'] },
        { label: "Analytics", href: `/${workspaceId}/admin/analytics`, icon: Activity, roles: ['ADMIN'] },
    ]
    return allItems.filter(item => item.roles.includes(viewRole))
}

/* ── Neon Purple Dark palette constants ── */
const SIDEBAR_BG = "#0A0A0A"
const ACTIVE_BG = "#8B5CF6"
const ACTIVE_GLOW = "0 4px 20px rgba(139,92,246,0.35)"
const INACTIVE_TEXT = "#A1A1AA"
const INACTIVE_HOVER_BG = "#211B31"
const PROFILE_BORDER = "rgba(139,92,246,0.15)"
const SIDEBAR_BORDER = "rgba(139,92,246,0.1)"
const DIVIDER = "rgba(255,255,255,0.06)"
const AVATAR_GRADIENT = "linear-gradient(135deg,#A855F7,#6366F1)"
const LOGO_ICON_BG = "linear-gradient(135deg,#6366F1,#8B5CF6)"
const LOGO_ICON_GLOW = "0 0 18px rgba(139,92,246,0.40)"
const FONT = "'Plus Jakarta Sans', sans-serif"

export function AppSidebar({ user, workspaceId, onCollapsedChange, viewRole = 'ADMIN' }: SidebarProps) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = React.useState(false)
    const [isMobile, setIsMobile] = React.useState(false)
    const isAdminUser = user.role === 'ADMIN'
    const otherViewRole: ViewRole = viewRole === 'ADMIN' ? 'USER' : 'ADMIN'
    const switchRoleHref = viewRole === 'ADMIN' ? `/${workspaceId}/dashboard` : `/${workspaceId}/admin`

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

    // Filtered nav items based on view role + treasurer access
    const filteredNavItems = getNavItems(workspaceId, viewRole).filter(item => {
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
                    background: SIDEBAR_BG,
                    backdropFilter: "blur(20px)",
                    borderBottom: `1px solid ${DIVIDER}`,
                    fontFamily: FONT,
                }}
            >
                {/* Mobile logo */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                        style={{
                            borderRadius: 10,
                            background: LOGO_ICON_BG,
                            boxShadow: LOGO_ICON_GLOW,
                        }}
                    >
                        <span className="text-white font-extrabold text-lg" style={{ fontFamily: FONT }}>H</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-extrabold text-base text-white tracking-tight" style={{ fontFamily: FONT }}>
                            Hustly<span style={{ color: "#8B5CF6" }}>Tasker</span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <NotificationBell />
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
                            background: SIDEBAR_BG,
                            backdropFilter: "blur(20px)",
                            borderColor: SIDEBAR_BORDER,
                            fontFamily: FONT,
                        }}
                    >
                        <div className="flex flex-col h-full">
                            {/* Sheet logo */}
                            <div
                                className="flex items-center gap-3 h-[72px] px-5"
                                style={{ borderBottom: `1px solid ${DIVIDER}` }}
                            >
                                <div
                                    className="w-9 h-9 flex items-center justify-center flex-shrink-0"
                                    style={{
                                        borderRadius: 10,
                                        background: LOGO_ICON_BG,
                                        boxShadow: LOGO_ICON_GLOW,
                                    }}
                                >
                                    <span className="text-white font-extrabold text-lg" style={{ fontFamily: FONT }}>H</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-extrabold text-base text-white tracking-tight" style={{ fontFamily: FONT }}>
                                        Hustly<span style={{ color: "#8B5CF6" }}>Tasker</span>
                                    </span>
                                    <span className="text-[9px] uppercase font-mono tracking-[0.18em]" style={{ color: INACTIVE_TEXT }}>
                                        {viewRole === 'ADMIN' ? 'Admin' : 'User'} &middot; v2.4
                                    </span>
                                </div>
                            </div>

                            {/* Profile & Workspace Switcher */}
                            <ProfileWorkspaceSwitcher workspaceId={workspaceId} viewRole={viewRole} />

                            {/* Sheet nav */}
                            <nav className="flex-1 px-4 py-5 flex flex-col gap-[16px] overflow-auto">
                                {filteredNavItems.map((item) => {
                                    const isActive = pathname === item.href
                                    const activeBg = item.danger ? "#EF4444" : ACTIVE_BG
                                    const activeGlow = item.danger ? "0 4px 20px rgba(239,68,68,0.35)" : ACTIVE_GLOW
                                    const inactiveColor = item.danger ? "#F87171" : INACTIVE_TEXT
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="flex items-center gap-3 text-[14px] font-semibold transition-all duration-200"
                                            style={{
                                                height: 52,
                                                paddingLeft: 16,
                                                paddingRight: 16,
                                                borderRadius: 26,
                                                fontFamily: FONT,
                                                background: isActive ? activeBg : "transparent",
                                                color: isActive ? "#FFFFFF" : inactiveColor,
                                                boxShadow: isActive ? activeGlow : "none",
                                            }}
                                        >
                                            <item.icon className="w-[20px] h-[20px] flex-shrink-0" />
                                            <span className="flex-1">{item.label}</span>
                                        </Link>
                                    )
                                })}
                                {isAdminUser && (
                                    <Link
                                        href={switchRoleHref}
                                        className="flex items-center gap-3 text-[14px] font-semibold transition-all duration-200 mt-2"
                                        style={{
                                            height: 52,
                                            paddingLeft: 16,
                                            paddingRight: 16,
                                            borderRadius: 26,
                                            fontFamily: FONT,
                                            background: "rgba(99,102,241,0.1)",
                                            color: "#818CF8",
                                            border: "1px solid rgba(99,102,241,0.2)",
                                        }}
                                    >
                                        <ArrowRightLeft className="w-[20px] h-[20px] flex-shrink-0" />
                                        <span className="flex-1">Switch to {otherViewRole === 'ADMIN' ? 'Admin' : 'User'} View</span>
                                    </Link>
                                )}
                            </nav>

                            {/* Sheet profile */}
                            <div
                                className="flex items-center gap-3 mx-4 mb-4 px-4"
                                style={{
                                    borderTop: `1px solid ${DIVIDER}`,
                                    paddingTop: 16,
                                }}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
                                    style={{ background: AVATAR_GRADIENT }}
                                >
                                    {getInitials(user.username)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-bold text-white truncate" style={{ fontFamily: FONT }}>{user.username}</div>
                                    <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: INACTIVE_TEXT, fontFamily: FONT }}>{user.role}</div>
                                </div>
                            </div>
                        </div>
                    </SheetContent>
                    </Sheet>
                </div>
            </div>
        )
    }

    // ── Desktop: full sidebar ──
    return (
        <TooltipProvider delayDuration={0}>
            <aside
                className={cn(
                    "fixed left-0 top-0 flex flex-col h-screen flex-shrink-0 z-40 transition-all duration-300 ease-in-out",
                    collapsed ? "w-[72px]" : "w-[261px]"
                )}
                style={{
                    background: SIDEBAR_BG,
                    borderRight: `1px solid ${SIDEBAR_BORDER}`,
                    fontFamily: FONT,
                }}
            >
                {/* ── Logo section ── */}
                <div
                    className={cn(
                        "flex items-center h-[72px] flex-shrink-0",
                        collapsed ? "justify-center px-0" : "gap-3 px-6"
                    )}
                    style={{ borderBottom: `1px solid ${DIVIDER}` }}
                >
                    <div
                        className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                        style={{
                            borderRadius: 12,
                            background: LOGO_ICON_BG,
                            boxShadow: LOGO_ICON_GLOW,
                        }}
                    >
                        <span className="text-white font-extrabold text-xl" style={{ fontFamily: FONT }}>H</span>
                    </div>
                    {!collapsed && (
                        <div className="flex flex-col overflow-hidden flex-1">
                            <span className="font-extrabold text-[18px] text-white tracking-tight whitespace-nowrap" style={{ fontFamily: FONT, letterSpacing: "-0.02em" }}>
                                Hustly<span style={{ color: "#8B5CF6" }}>Tasker</span>
                            </span>
                            <span className="text-[9px] uppercase font-mono tracking-[0.18em] whitespace-nowrap" style={{ color: INACTIVE_TEXT }}>
                                {viewRole === 'ADMIN' ? 'Admin' : 'User'} &middot; v2.4
                            </span>
                        </div>
                    )}
                    {!collapsed && <NotificationBell />}
                </div>

                {/* ── Collapse toggle ── */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3.5 top-20 h-7 w-7 rounded-full border shadow-md z-50 transition-colors"
                    style={{
                        borderColor: SIDEBAR_BORDER,
                        background: "#18181B",
                        color: INACTIVE_TEXT,
                    }}
                    onClick={handleToggleCollapse}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = INACTIVE_HOVER_BG
                        e.currentTarget.style.color = "#FFFFFF"
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#18181B"
                        e.currentTarget.style.color = INACTIVE_TEXT
                    }}
                >
                    {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </Button>

                {/* ── Profile & Workspace Switcher ── */}
                <ProfileWorkspaceSwitcher workspaceId={workspaceId} collapsed={collapsed} viewRole={viewRole} />
                <div style={{ borderBottom: `1px solid ${DIVIDER}` }} />

                {/* ── Navigation ── */}
                <nav className={cn(
                    "flex-1 flex flex-col overflow-auto",
                    collapsed ? "px-3 py-5 gap-2" : "px-4 py-5 gap-[16px]"
                )}>
                    {filteredNavItems.map((item) => {
                        const isActive = pathname === item.href
                        const dangerActiveBg = "#EF4444"
                        const dangerGlow = "0 4px 20px rgba(239,68,68,0.35)"
                        const activeBg = item.danger ? dangerActiveBg : ACTIVE_BG
                        const activeGlow = item.danger ? dangerGlow : ACTIVE_GLOW
                        const inactiveColor = item.danger ? "#F87171" : INACTIVE_TEXT

                        if (collapsed) {
                            return (
                                <Tooltip key={item.href}>
                                    <TooltipTrigger asChild>
                                        <Link
                                            href={item.href}
                                            className="flex items-center justify-center w-[46px] h-[46px] mx-auto transition-all duration-200"
                                            style={{
                                                borderRadius: 23,
                                                background: isActive ? activeBg : "transparent",
                                                color: isActive ? "#FFFFFF" : inactiveColor,
                                                boxShadow: isActive ? activeGlow : "none",
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isActive) {
                                                    e.currentTarget.style.background = INACTIVE_HOVER_BG
                                                    e.currentTarget.style.color = "#FFFFFF"
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isActive) {
                                                    e.currentTarget.style.background = "transparent"
                                                    e.currentTarget.style.color = inactiveColor
                                                }
                                            }}
                                        >
                                            <item.icon className="w-[20px] h-[20px] flex-shrink-0" />
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
                                className="group flex items-center gap-3 text-[14px] font-semibold transition-all duration-200"
                                style={{
                                    height: 52,
                                    paddingLeft: 16,
                                    paddingRight: 16,
                                    borderRadius: 26,
                                    fontFamily: FONT,
                                    background: isActive ? activeBg : "transparent",
                                    color: isActive ? "#FFFFFF" : inactiveColor,
                                    boxShadow: isActive ? activeGlow : "none",
                                }}
                                onMouseEnter={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = INACTIVE_HOVER_BG
                                        e.currentTarget.style.color = "#FFFFFF"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isActive) {
                                        e.currentTarget.style.background = "transparent"
                                        e.currentTarget.style.color = inactiveColor
                                    }
                                }}
                            >
                                <item.icon className="w-[20px] h-[20px] flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                {/* ── Divider before profile ── */}
                <div style={{ borderTop: `1px solid ${DIVIDER}` }} />

                {/* ── Profile card ── */}
                <div className={cn("flex-shrink-0", collapsed ? "p-3" : "p-4")}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={cn(
                                    "flex items-center w-full cursor-pointer transition-all duration-200",
                                    collapsed ? "justify-center p-2 rounded-full" : "gap-3 px-4 py-3 rounded-[20px]"
                                )}
                                style={{
                                    background: "transparent",
                                    border: collapsed ? "none" : `1px solid ${PROFILE_BORDER}`,
                                    outline: "none",
                                    fontFamily: FONT,
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = INACTIVE_HOVER_BG
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent"
                                }}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
                                    style={{ background: AVATAR_GRADIENT }}
                                >
                                    {getInitials(user.username)}
                                </div>
                                {!collapsed && (
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="text-[13px] font-bold text-white truncate" style={{ fontFamily: FONT }}>{user.username}</div>
                                        <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: INACTIVE_TEXT, fontFamily: FONT }}>{user.role}</div>
                                    </div>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-56 backdrop-blur-xl border shadow-2xl"
                            style={{
                                background: "rgba(10,10,10,0.95)",
                                borderColor: SIDEBAR_BORDER,
                                fontFamily: FONT,
                            }}
                            align="end"
                            side="right"
                            forceMount
                        >
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none text-white" style={{ fontFamily: FONT }}>{user.username}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator style={{ background: DIVIDER }} />
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
                            {isAdminUser && (
                                <DropdownMenuItem onClick={() => window.location.href = switchRoleHref}>
                                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                                    <span>Switch to {otherViewRole === 'ADMIN' ? 'Admin' : 'User'} View</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator style={{ background: DIVIDER }} />
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
