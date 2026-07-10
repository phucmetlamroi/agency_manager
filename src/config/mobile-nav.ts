// [Mobile P1 §3.5 / QĐ-2] Bottom tab bar config-driven theo role — 1 nguồn dữ liệu,
// thay 2 nhánh hardcode trong BottomNav cũ. Mỗi tab đích THẬT (không 404) + KHÔNG đè
// nhau (active match dài-nhất-trước ở BottomNav → mỗi route sáng đúng 1 tab, Rủi ro #11).
//
// LƯU Ý sequencing:
//  • USER: dashboard = trang chủ + danh sách task (một màn) → không tách tab "Task"
//    riêng (sẽ đè /dashboard). Bộ 4 tab = Trang chủ · Lịch · Lương(mới) · Hồ sơ.
import { Home, ListTodo, CalendarDays, Wallet, UserCircle, Users, Menu, type LucideIcon } from 'lucide-react'

export interface MobileTab {
    key: string
    /** Nhãn 1 từ tiếng Việt (11px). */
    label: string
    href: string
    icon: LucideIcon
    /** Badge count (≤4 ký tự khi render, "99+"). Optional — wire live count sau. */
    badge?: number
}

const USER_TABS = (ws: string): MobileTab[] => [
    { key: 'home', label: 'Trang chủ', href: `/${ws}/dashboard`, icon: Home },
    { key: 'schedule', label: 'Lịch', href: `/${ws}/dashboard/schedule`, icon: CalendarDays },
    { key: 'salary', label: 'Lương', href: `/${ws}/dashboard/salary`, icon: Wallet },
    { key: 'profile', label: 'Hồ sơ', href: `/${ws}/dashboard/profile`, icon: UserCircle },
]

const ADMIN_TABS = (ws: string): MobileTab[] => [
    { key: 'home', label: 'Trang chủ', href: `/${ws}/admin`, icon: Home },
    { key: 'queue', label: 'Task', href: `/${ws}/admin/queue`, icon: ListTodo },
    { key: 'crm', label: 'Khách', href: `/${ws}/admin/crm`, icon: Users },
    { key: 'schedule', label: 'Lịch', href: `/${ws}/admin/schedule`, icon: CalendarDays },
    { key: 'menu', label: 'Menu', href: `/${ws}/admin/menu`, icon: Menu },
]

export function getTabsForRole(role: string, workspaceId: string): MobileTab[] {
    return role === 'ADMIN' ? ADMIN_TABS(workspaceId) : USER_TABS(workspaceId)
}
