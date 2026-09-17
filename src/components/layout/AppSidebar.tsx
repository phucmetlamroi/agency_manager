"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { roleLabel } from "@/lib/display-labels"
import { REVIEW_MODULE_LABEL } from "@/lib/review/labels"
import { Button } from "@/components/ui/button"
import {
    LayoutDashboard,
    UsersRound,
    Building2,
    Wallet,
    ListTodo,
    Inbox,
    LogOut,
    ChevronLeft,
    ChevronRight,
    UserCircle,
    Activity,
    CalendarDays,
    AlertOctagon,
    ArrowRightLeft,
    Settings,
    ScrollText,
    LifeBuoy,
    Clapperboard,
    LayoutGrid,
    CreditCard
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
import { Logo } from "@/components/brand/Logo"
import { getUnreadRequestCount } from "@/actions/client-request-actions"
import { setUiPref } from "@/actions/ui-actions"
// Chỉ lấy KIỂU — `import type` bị xoá lúc biên dịch nên không kéo lib server vào bundle.
import type { NavAccess } from "@/lib/nav-access"

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
    /** Workspace-scoped role (OWNER/ADMIN/MEMBER/GUEST). Used for nav filtering instead of global role. */
    workspaceRole?: string
    /**
     * [kiểm toán 2026-07 · S2-1 / Q1] Quyền điều hướng đã tính sẵn ở layout (server).
     * BỎ TRỐNG = không lọc gì cả — xem ghi chú "mở-khi-thiếu" ở getNavItems.
     */
    navAccess?: NavAccess
}

interface NavItem {
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    roles: ViewRole[]
    danger?: boolean
    /** Render as <a> with target="_blank" instead of next/link (for mailto: / external) */
    external?: boolean
    /**
     * [kiểm toán 2026-07 · S2-1] Cờ quyền TỐI THIỂU để mục này thật sự mở được.
     * Bỏ trống = ai cũng vào được (trang tự gác theo membership, không theo admin).
     * Xem bản đồ cờ ↔ cổng thật trong src/lib/nav-access.ts.
     */
    gate?: keyof NavAccess
}

const getNavItems = (workspaceId: string, viewRole: ViewRole, navAccess?: NavAccess): NavItem[] => {
    // [kiểm toán 2026-07 · S2-1 / Q1] Nav ĐÃ LỌC THEO QUYỀN.
    //
    // Thay cho quy ước [Sprint F.4] cũ ("hiện hết, để trang tự đá"): đo được 9 trên
    // 15 mục ném editor về /dashboard không một lời giải thích. Q1 chốt: không vào
    // được thì ẩn hẳn.
    //
    // `gate` dưới đây ánh xạ 1-1 với cổng THẬT của từng trang (đã đọc từng file).
    // [Sprint F.5] Hiệu suất entry removed entirely (page + actions deleted).
    const allItems: NavItem[] = [
        { label: "Tổng quan", href: viewRole === 'USER' ? `/${workspaceId}/dashboard` : `/${workspaceId}/admin`, icon: LayoutDashboard, roles: ['ADMIN', 'USER'] },
        { label: "Hàng chờ task", href: `/${workspaceId}/admin/queue`, icon: ListTodo, roles: ['ADMIN', 'USER'], gate: 'admin' },
        // [Client Task Submission v2] Client-submitted requests inbox (badge = NEW count).
        { label: "Hộp thư yêu cầu", href: `/${workspaceId}/admin/requests`, icon: Inbox, roles: ['ADMIN', 'USER'], gate: 'admin' },
        // [Review module P2 → sửa chú thích, kiểm toán 2026-07 F-10] KHÔNG còn admin-only:
        // team/layout.tsx gác bằng requireReviewAccess (MEMBERSHIP), editor vào được thật.
        // Vì vậy mục này KHÔNG có `gate` — đặt gate:'admin' ở đây sẽ giấu mất Tệp của editor.
        { label: REVIEW_MODULE_LABEL, href: `/${workspaceId}/team`, icon: Clapperboard, roles: ['ADMIN', 'USER'] },
        // [CM merge] "Clients Manager" đã gộp vào Dashboard → bỏ khỏi sidebar.
        { label: "Lịch", href: viewRole === 'USER' ? `/${workspaceId}/dashboard/schedule` : `/${workspaceId}/admin/schedule`, icon: CalendarDays, roles: ['ADMIN', 'USER'] },
        { label: "Lỗi của tôi", href: `/${workspaceId}/dashboard/errors`, icon: AlertOctagon, roles: ['USER'], danger: true },
        { label: "Hồ sơ", href: `/${workspaceId}/dashboard/profile`, icon: UserCircle, roles: ['USER'] },
        { label: "Bảng lương", href: `/${workspaceId}/admin/payroll`, icon: Wallet, roles: ['ADMIN', 'USER'], gate: 'admin' },
        // Tài chính gác bằng profileRole (page.tsx: getProfileRole ∈ OWNER|ADMIN), KHÔNG
        // phải cổng /admin — một ADMIN chỉ có hàng WorkspaceMember vào sẽ gặp "Quyền truy
        // cập bị từ chối".
        { label: "Tài chính", href: `/${workspaceId}/admin/finance`, icon: Building2, roles: ['ADMIN', 'USER'], gate: 'profileAdmin' },
        // [Merge: one membership menu] The per-workspace "Members" entry was merged into the
        // org-level membership page below (ProfileAccess, org-wide). Single roster + invite path.
        { label: "Thành viên", href: `/${workspaceId}/admin/profile-members`, icon: UsersRound, roles: ['ADMIN', 'USER'], gate: 'profileAdmin' },
        // [BILLING P5] Gói cước — subscription thuộc PROFILE (billing/page.tsx gác đúng
        // verifyProfileAdminAccess), nên gate 'profileAdmin' khớp cổng thật của trang.
        { label: "Gói cước", href: `/${workspaceId}/admin/billing`, icon: CreditCard, roles: ['ADMIN', 'USER'], gate: 'profileAdmin' },
        // [Sprint Z+1 → sửa chú thích, kiểm toán 2026-07 F-10] KHÔNG có cổng "Owner only" nào
        // ở trang này: nó chỉ đòi có phiên đăng nhập. Chính DỮ LIỆU mới giới hạn —
        // getMyTrashedProfiles chỉ liệt kê profile mà bạn là OWNER, nên người khác thấy
        // danh sách rỗng chứ không bị đá ra. Giữ ở mức cổng /admin.
        { label: "Thùng rác tổ chức", href: `/${workspaceId}/admin/profile-trash`, icon: UsersRound, roles: ['ADMIN', 'USER'], gate: 'admin' },
        { label: "Phân tích", href: `/${workspaceId}/admin/analytics`, icon: Activity, roles: ['ADMIN', 'USER'], gate: 'workspaceAdmin' },
        { label: "Nhật ký hoạt động", href: `/${workspaceId}/admin/audit-log`, icon: ScrollText, roles: ['ADMIN', 'USER'], gate: 'workspaceAdmin' },
        { label: "Cài đặt", href: `/${workspaceId}/admin/settings`, icon: Settings, roles: ['ADMIN', 'USER'], gate: 'workspaceAdmin' },
        // [User Dashboard Redesign D.7] Help & Feedback — placeholder mailto link
        { label: "Trợ giúp & Góp ý", href: "mailto:support@hustlytasker.xyz", icon: LifeBuoy, roles: ['USER'], external: true },
    ]
    // MỞ-KHI-THIẾU, có chủ đích: thiếu `navAccess` (một shell mới quên truyền) thì hiện
    // đủ như trước, KHÔNG phải giấu sạch. Ẩn ở đây thuần tuý là chuyện giao diện — mọi
    // trang vẫn tự gác — nên hỏng theo hướng "thừa một lối đi" rẻ hơn nhiều so với hướng
    // "một quản trị viên mất trắng thanh điều hướng".
    return allItems.filter(item =>
        item.roles.includes(viewRole) && (!item.gate || !navAccess || navAccess[item.gate])
    )
}

/* ── Neon Purple Dark palette constants ── */
const SIDEBAR_BG = "#0A0A0A"
const ACTIVE_BG = "#8B5CF6"
/**
 * [audit 2026-07 §12] The SAME violet, one step darker, for the places white text sits ON it.
 * Measured: #FFFFFF on #8B5CF6 = 4.23:1, just under the 4.5:1 AA floor — so the active nav
 * label and the unread badge were failing. violet-600 #7C3AED = 5.70:1 and reads as the same
 * brand colour. Deliberately NOT a global swap: ACTIVE_BG above still paints the decorative
 * dot and the glow, where no text sits and the contrast rule does not apply.
 */
const ACTIVE_FILL = "#7C3AED"
const ACTIVE_GLOW = "0 4px 20px rgba(139,92,246,0.35)"
const INACTIVE_TEXT = "#A1A1AA"
const INACTIVE_HOVER_BG = "#211B31"
const PROFILE_BORDER = "rgba(139,92,246,0.15)"
const SIDEBAR_BORDER = "rgba(139,92,246,0.1)"
const DIVIDER = "rgba(255,255,255,0.06)"
const AVATAR_GRADIENT = "linear-gradient(135deg,#A855F7,#6366F1)"
const LOGO_ICON_BG = "linear-gradient(135deg,#6366F1,#8B5CF6)"
const LOGO_ICON_GLOW = "0 0 18px rgba(139,92,246,0.40)"
// [Mobile font unification] Inherit system sans (--font-sans = Plus Jakarta Sans)
// thay vì hardcode → khi đổi font system sau này tự sync, mobile + desktop nhất quán.
const FONT = "var(--font-sans), 'Plus Jakarta Sans', sans-serif"

export function AppSidebar({ user, workspaceId, onCollapsedChange, viewRole = 'ADMIN', workspaceRole, navAccess }: SidebarProps) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = React.useState(false)
    // [kiểm toán 2026-07 · S2-1] Gác hai mục trong menu hồ sơ ("Chuyển sang chế độ Quản trị"
    // và "Giao diện 2 · Mission Control") bằng ĐÚNG cổng của đích đến: mọi trang /mc/** đều
    // gọi verifyProfileAdminAccess. Biểu thức cũ có nhánh `user.role === 'ADMIN'` — vai trò
    // TOÀN CỤC, không ràng buộc workspace — nên một quản trị viên của tổ chức khác đang là
    // thành viên thường ở đây vẫn thấy lối vào Mission Control rồi bị đá về /dashboard.
    // Thiếu navAccess thì giữ nguyên hành vi cũ (xem ghi chú mở-khi-thiếu ở getNavItems).
    const isAdminUser = navAccess
        ? navAccess.admin
        : workspaceRole
            ? (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' || user.role === 'ADMIN')
            : user.role === 'ADMIN'
    const otherViewRole: ViewRole = viewRole === 'ADMIN' ? 'USER' : 'ADMIN'
    const switchRoleHref = viewRole === 'ADMIN' ? `/${workspaceId}/dashboard` : `/${workspaceId}/admin`

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

    const filteredNavItems = getNavItems(workspaceId, viewRole, navAccess)

    // [Client Task Submission v2] Live NEW-request count for the inbox nav badge.
    const requestsHref = `/${workspaceId}/admin/requests`
    const [reqCount, setReqCount] = React.useState(0)
    React.useEffect(() => {
        let alive = true
        const load = () => getUnreadRequestCount(workspaceId).then((c) => { if (alive) setReqCount(c) }).catch(() => {})
        load()
        const t = setInterval(load, 60000)
        return () => { alive = false; clearInterval(t) }
    }, [workspaceId])

    // ── Sidebar (chỉ render qua AppShellDesktop — deviceType==='desktop') ──
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
                    {collapsed ? (
                        // Collapsed → small icon trong violet box (logo wordmark ratio 2:1 ko fit square)
                        <div
                            className="w-10 h-10 flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{
                                borderRadius: 12,
                                background: LOGO_ICON_BG,
                                boxShadow: LOGO_ICON_GLOW,
                            }}
                        >
                            <Logo className="h-6 w-auto text-white" />
                        </div>
                    ) : (
                        // Expanded → full wordmark + version badge
                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                            <Logo
                                className="h-9 w-auto text-white shrink-0"
                                style={{ filter: "drop-shadow(0 0 12px rgba(139,92,246,0.45))" }}
                            />
                            <span
                                className="text-[9px] uppercase font-mono tracking-[0.18em] whitespace-nowrap ml-auto"
                                style={{ color: INACTIVE_TEXT, fontFamily: FONT }}
                            >
                                {viewRole === 'ADMIN' ? 'Quản trị' : 'Nhân viên'} &middot; v2.4
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Collapse toggle ── */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3.5 top-20 h-7 w-7 rounded-full border shadow-md z-50 transition-colors"
                    style={{
                        borderColor: SIDEBAR_BORDER,
                        background: "hsl(var(--surface-1))",
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

                {/* [User dashboard redesign] Profile/Workspace switcher đã chuyển khỏi sidebar:
                    - Profile picker → UserHomeTopBar dropdown (top-right corner)
                    - Workspace picker → UserWorkspacePicker pill (inside dashboard content area, kế "This month") */}

                {/* ── Navigation ── */}
                <nav className={cn(
                    "flex-1 flex flex-col overflow-auto",
                    collapsed ? "px-3 py-5 gap-2" : "px-4 py-5 gap-[16px]"
                )}>
                    {filteredNavItems.map((item) => {
                        const isActive = !item.external && pathname === item.href
                        const dangerActiveBg = "#EF4444"
                        const dangerGlow = "0 4px 20px rgba(239,68,68,0.35)"
                        const activeBg = item.danger ? dangerActiveBg : ACTIVE_FILL
                        const activeGlow = item.danger ? dangerGlow : ACTIVE_GLOW
                        const inactiveColor = item.danger ? "#F87171" : INACTIVE_TEXT
                        // External links (mailto:, https://…) bypass next/link to avoid runtime warnings.
                        const NavAnchor: React.ElementType = item.external ? "a" : Link
                        const externalProps = item.external ? { target: "_blank", rel: "noopener noreferrer" } : {}

                        if (collapsed) {
                            return (
                                <Tooltip key={item.href}>
                                    <TooltipTrigger asChild>
                                        <NavAnchor
                                            href={item.href}
                                            {...externalProps}
                                            className="flex items-center justify-center w-[46px] h-[46px] mx-auto transition-all duration-200"
                                            style={{
                                                position: "relative",
                                                borderRadius: 23,
                                                background: isActive ? activeBg : "transparent",
                                                color: isActive ? "#FFFFFF" : inactiveColor,
                                                boxShadow: isActive ? activeGlow : "none",
                                            }}
                                            onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                                                if (!isActive) {
                                                    (e.currentTarget as HTMLElement).style.background = INACTIVE_HOVER_BG
                                                    ;(e.currentTarget as HTMLElement).style.color = "#FFFFFF"
                                                }
                                            }}
                                            onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                                                if (!isActive) {
                                                    (e.currentTarget as HTMLElement).style.background = "transparent"
                                                    ;(e.currentTarget as HTMLElement).style.color = inactiveColor
                                                }
                                            }}
                                        >
                                            <item.icon className="w-[20px] h-[20px] flex-shrink-0" />
                                            {item.href === requestsHref && reqCount > 0 && (
                                                <span style={{ position: "absolute", top: 8, right: 8, minWidth: 7, height: 7, borderRadius: 999, background: ACTIVE_BG, boxShadow: "0 0 6px rgba(139,92,246,0.7)" }} />
                                            )}
                                        </NavAnchor>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">{item.label}</TooltipContent>
                                </Tooltip>
                            )
                        }

                        return (
                            <NavAnchor
                                key={item.href}
                                href={item.href}
                                {...externalProps}
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
                                onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.background = INACTIVE_HOVER_BG
                                        ;(e.currentTarget as HTMLElement).style.color = "#FFFFFF"
                                    }
                                }}
                                onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.background = "transparent"
                                        ;(e.currentTarget as HTMLElement).style.color = inactiveColor
                                    }
                                }}
                            >
                                <item.icon className="w-[20px] h-[20px] flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                {item.href === requestsHref && reqCount > 0 && (
                                    <span style={{
                                        minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
                                        background: isActive ? '#FFFFFF' : ACTIVE_FILL,
                                        color: isActive ? ACTIVE_FILL : '#FFFFFF',
                                        fontSize: 11, fontWeight: 800, display: 'inline-flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        boxShadow: isActive ? 'none' : '0 0 10px rgba(139,92,246,0.5)',
                                    }}>
                                        {reqCount > 99 ? '99+' : reqCount}
                                    </span>
                                )}
                            </NavAnchor>
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
                                        <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: INACTIVE_TEXT, fontFamily: FONT }}>{roleLabel(user.role)}</div>
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
                                <span>Hồ sơ</span>
                            </DropdownMenuItem>
                            {user.isTreasurer && (
                                <DropdownMenuItem onClick={() => window.location.href = `/${workspaceId}/admin/finance`}>
                                    <Wallet className="mr-2 h-4 w-4" />
                                    <span>Cổng tài chính</span>
                                </DropdownMenuItem>
                            )}
                            {isAdminUser && (
                                <DropdownMenuItem onClick={() => window.location.href = switchRoleHref}>
                                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                                    <span>Chuyển sang chế độ {otherViewRole === 'ADMIN' ? 'Quản trị' : 'Nhân viên'}</span>
                                </DropdownMenuItem>
                            )}
                            {/* [Giao diện 2] additive toggle → Mission Control (admin-only; revenue-bearing UI).
                                Persist the preference so /admin auto-lands here next visit; the MC
                                "← Giao diện 1" control clears it. */}
                            {isAdminUser && (
                                <DropdownMenuItem onClick={async () => {
                                    try { await setUiPref('mc') } catch { /* navigate regardless */ }
                                    window.location.href = `/${workspaceId}/mc`
                                }}>
                                    <LayoutGrid className="mr-2 h-4 w-4" />
                                    <span>Giao diện 2 · Mission Control</span>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator style={{ background: DIVIDER }} />
                            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => window.location.href = '/api/auth/logout'}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>Đăng xuất</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>
        </TooltipProvider>
    )
}
