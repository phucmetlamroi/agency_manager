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
    Menu
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
        reputation?: number
        isTreasurer?: boolean
    }
    onCollapsedChange?: (collapsed: boolean) => void
}

const NAV_ITEMS = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Task Queue", href: "/admin/queue", icon: ListTodo },
    { label: "CRM & Clients", href: "/admin/crm", icon: Smile },
    { label: "Payroll", href: "/admin/payroll", icon: Wallet },
    { label: "Finance", href: "/admin/finance", icon: Building2 }, // Re-added Finance
    { label: "Staff", href: "/admin/users", icon: Users },
    { label: "Agencies", href: "/admin/agencies", icon: Building2 },
    // { label: "Settings", href: "/admin/settings", icon: Settings },
]

export function AppSidebar({ user, onCollapsedChange }: SidebarProps) {
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
            <div className="fixed top-0 left-0 right-0 h-16 border-b bg-background/80 backdrop-blur-md flex items-center px-4 justify-between z-40">
                <div className="flex items-center gap-2 font-bold text-xl title-gradient">
                    <span>AgencyManager</span>
                </div>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu className="h-6 w-6" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[300px] sm:w-[400px]">
                        <div className="flex flex-col h-full py-4">
                            <div className="px-2 mb-8">
                                <h2 className="text-2xl font-bold title-gradient">AgencyManager</h2>
                                <p className="text-sm text-muted-foreground">Mobile Dashboard</p>
                            </div>
                            <nav className="flex-1 space-y-1">
                                {NAV_ITEMS.filter(item => {
                                    if (item.href === '/admin/finance') return user.role === 'ADMIN' || user.isTreasurer
                                    return true
                                }).map((item) => {
                                    const isActive = pathname === item.href
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-sm font-medium",
                                                isActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    "fixed left-0 top-0 flex flex-col h-screen border-r bg-card/50 backdrop-blur-sm transition-all duration-300 ease-in-out z-40",
                    collapsed ? "w-[80px]" : "w-[280px]"
                )}
            >
                {/* Header */}
                <div className="flex h-16 items-center border-b px-4 justify-between">
                    {!collapsed && (
                        <div className="flex items-center gap-2 font-bold text-xl animate-fade-in whitespace-nowrap overflow-hidden">
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                                A
                            </div>
                            <span className="title-gradient">AgencyManager</span>
                        </div>
                    )}
                    {collapsed && (
                        <div className="mx-auto h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
                            A
                        </div>
                    )}
                </div>

                {/* Toggle Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-4 top-20 h-8 w-8 rounded-full border bg-background shadow-md z-50 text-muted-foreground hover:text-foreground"
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
                                    <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
                                        <Search className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Search (Cmd+K)</TooltipContent>
                            </Tooltip>
                        ) : (
                            <Button variant="outline" className="w-full justify-start text-muted-foreground bg-muted/50 border-input/50" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
                                <Search className="mr-2 h-4 w-4" />
                                <span className="flex-1 text-left">Search...</span>
                                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                                    <span className="text-xs">⌘</span>K
                                </kbd>
                            </Button>
                        )}
                    </div>

                    {NAV_ITEMS.filter(item => {
                        if (item.href === '/admin/finance') return user.role === 'ADMIN' || user.isTreasurer
                        return true
                    }).map((item) => {
                        const isActive = pathname === item.href
                        if (collapsed) {
                            return (
                                <Tooltip key={item.href}>
                                    <TooltipTrigger asChild>
                                        <Link href={item.href} className={cn(
                                            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                                            isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                        )}>
                                            <item.icon className="h-5 w-5" />
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {item.label}
                                    </TooltipContent>
                                </Tooltip>
                            )
                        }
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium mx-1",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 translate-x-1"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        )
                    })}
                </div>

                {/* Footer User Profile */}
                <div className="border-t p-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className={cn("w-full", collapsed ? "h-12 w-12 rounded-full p-0" : "justify-start px-2")}>
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={`https://avatar.vercel.sh/${user.username}`} />
                                    <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                {!collapsed && (
                                    <div className="ml-3 flex flex-col items-start overflow-hidden">
                                        <span className="text-sm font-medium truncate w-full text-left">{user.username}</span>
                                        <span className="text-xs text-muted-foreground truncate w-full text-left">{user.role}</span>
                                    </div>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="end" side="right" forceMount>
                            <DropdownMenuLabel className="font-normal">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium leading-none">{user.username}</p>
                                    <p className="text-xs leading-none text-muted-foreground">Reputation: {user.reputation ?? 100}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => window.location.href = '/profile'}>
                                <UserCircle className="mr-2 h-4 w-4" />
                                <span>Profile</span>
                            </DropdownMenuItem>
                            {user.isTreasurer && (
                                <DropdownMenuItem onClick={() => window.location.href = '/admin/finance'}>
                                    <Wallet className="mr-2 h-4 w-4" />
                                    <span>Finance Portal</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
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
