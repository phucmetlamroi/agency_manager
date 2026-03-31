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
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Search,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

interface SidebarProps {
    user: {
        username: string
        role: string
        isTreasurer?: boolean
    }
    workspaceId: string
    onCollapsedChange?: (collapsed: boolean) => void
}

const getNavItems = (workspaceId: string) => [
    { label: "Dashboard", href: `/${workspaceId}/admin`, icon: LayoutDashboard },
    { label: "Task Queue", href: `/${workspaceId}/admin/queue`, icon: ListTodo },
    { label: "CRM & Clients", href: `/${workspaceId}/admin/crm`, icon: Smile },
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

    if (isMobile) {
        return (
            <div className="fixed top-0 left-0 right-0 h-16 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md flex items-center px-4 justify-between z-40 shadow-lg shadow-black/50">
                <div className="flex items-center gap-2 font-heading font-bold text-xl text-zinc-100">
                    <span>Agency<span className="text-indigo-400">Manager</span></span>
                </div>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[300px] sm:w-[400px] bg-zinc-950/95 backdrop-blur-xl border-r border-white/10">
                        <div className="flex flex-col h-full py-4">
                            <div className="px-2 mb-8 mt-4">
                                <h2 className="text-2xl font-bold font-heading text-zinc-100">Agency<span className="text-indigo-400">Manager</span></h2>
                                <p className="text-sm text-zinc-400 font-sans mt-1">Mobile Dashboard</p>
                            </div>
                            <nav className="flex-1 space-y-1">
                                {getNavItems(workspaceId).filter(item => {
                                    if (item.href.includes('/admin/finance')) return user.role === 'ADMIN' || user.isTreasurer
                                    if (item.href.includes('/admin/analytics')) return user.role === 'ADMIN'
                                    return true
                                }).map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-300 text-sm font-medium",
                                                isActive
                                                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shadow-md shadow-indigo-500/10"
                                                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                                            )}
                                        >
                                            <item.icon className="h-5 w-5" />
                                            {item.label}
                                        </Link>
                                    )
                                })}
                            </nav>
                            <div className="border-t pt-4 mt-auto">
                                <div className="flex items-center gap-3 px-2 mb-4">
                                    <Avatar>
                                        <AvatarImage src={`https://avatar.vercel.sh/${user.username}`} />
                                        <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="text-sm font-medium">{user.username}</p>
                                        <p className="text-xs text-muted-foreground">{user.role}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="destructive"
                                    className="w-full justify-start"
                                    onClick={() => window.location.href = '/api/auth/logout'}
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Sign Out
                                </Button>
                            </div>
                        </div>
                    </SheetContent>
                </Sheet>
            </div>
        )
    }

    return (
        <TooltipProvider delayDuration={0}>
            <div
                className={cn(
                    "fixed left-0 top-0 flex flex-col h-screen border-r border-white/10 bg-zinc-950/60 backdrop-blur-lg transition-all duration-300 ease-in-out z-40 shadow-xl",
                    collapsed ? "w-[80px]" : "w-[280px]"
                )}
            >
                {/* Header */}
                <div className="flex h-16 items-center border-b border-white/10 px-4 justify-between">
                    {!collapsed && (
                        <div className="flex items-center gap-2 font-bold text-xl animate-fade-in whitespace-nowrap overflow-hidden">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                                A
                            </div>
                            <span className="font-heading text-zinc-100">Agency<span className="text-zinc-400">Manager</span></span>
                        </div>
                    )}
                    {collapsed && (
                        <div className="mx-auto h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/20">
                            A
                        </div>
                    )}
                </div>

                {/* Toggle Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-4 top-20 h-8 w-8 rounded-full border border-white/10 bg-zinc-900 shadow-md z-50 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    onClick={handleToggleCollapse}
                >
                    {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>

                {/* Nav */}
                <div className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
                    {/* Command Trigger */}
                    <div className={cn("mb-4", collapsed ? "px-0 flex justify-center" : "px-2")}>
                        {collapsed ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-10 w-10 border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-100" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
                                        <Search className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Search (Cmd+K)</TooltipContent>
                            </Tooltip>
                        ) : (
                            <Button variant="outline" className="w-full justify-start text-zinc-400 bg-white/5 border-white/10 hover:bg-white/10 hover:text-zinc-100 transition-colors" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
                                <Search className="mr-2 h-4 w-4" />
                                <span className="flex-1 text-left">Search...</span>
                                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-black/40 px-1.5 font-mono text-[10px] font-medium text-zinc-500">
                                    <span className="text-xs">⌘</span>K
                                </kbd>
                            </Button>
                        )}
                    </div>

                    {getNavItems(workspaceId).filter(item => {
                        if (item.href.includes('/admin/finance')) return user.role === 'ADMIN' || user.isTreasurer
                        if (item.href.includes('/admin/analytics')) return user.role === 'ADMIN'
                        return true
                    }).map((item, index, filteredItems) => {
                        const isActive = pathname === item.href
                        
                        // Add a separator before "Staff" or "Staff Schedule"
                        const isStaffStart = item.label === "Staff" && index > 0;
                        
                        return (
                            <React.Fragment key={item.href}>
                                {isStaffStart && !collapsed && (
                                    <div className="px-4 pt-4 pb-2">
                                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                            Nhân sự
                                        </p>
                                    </div>
                                )}
                                {isStaffStart && collapsed && (
                                    <div className="mx-2 my-2 border-t border-zinc-800" />
                                )}

                                {collapsed ? (
                                    <Tooltip key={item.href}>
                                        <TooltipTrigger asChild>
                                            <Link 
                                                href={item.href} 
                                                className={cn(
                                                    "flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-300",
                                                    isActive ? "bg-indigo-500/20 text-indigo-400 shadow-md shadow-indigo-500/10 border border-indigo-500/20" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                                                )}
                                            >
                                                <item.icon className="h-5 w-5" />
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            {item.label}
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 text-sm font-medium mx-1",
                                            isActive
                                                ? "bg-indigo-500/20 text-indigo-400 shadow-md shadow-indigo-500/10 border border-indigo-500/20 translate-x-1"
                                                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100 hover:translate-x-1"
                                        )}
                                    >
                                        <item.icon className="h-5 w-5" />
                                        {item.label}
                                    </Link>
                                )}
                            </React.Fragment>
                        )
                    })}
                </div>

                {/* Footer User Profile */}
                <div className="border-t border-white/10 p-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className={cn("w-full hover:bg-white/5", collapsed ? "h-12 w-12 rounded-full p-0" : "justify-start px-2")}>
                                <Avatar className="h-8 w-8 border border-white/10 ring-2 ring-transparent transition-all hover:ring-indigo-500">
                                    <AvatarImage src={`https://avatar.vercel.sh/${user.username}`} />
                                    <AvatarFallback className="bg-zinc-800 text-zinc-100">{user.username[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                {!collapsed && (
                                    <div className="ml-3 flex flex-col items-start overflow-hidden">
                                        <span className="text-sm font-medium text-zinc-100 truncate w-full text-left">{user.username}</span>
                                        <span className="text-xs text-zinc-500 truncate w-full text-left">{user.role}</span>
                                    </div>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 bg-zinc-950/90 backdrop-blur-xl border border-white/10 shadow-2xl" align="end" side="right" forceMount>
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
                                <span>Đổi Team / Workspace</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => window.location.href = '/api/auth/logout'}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Log out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </TooltipProvider>
    )
}
