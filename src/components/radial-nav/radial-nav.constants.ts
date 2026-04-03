import {
    LayoutDashboard,
    ListTodo,
    Smile,
    Wallet,
    CreditCard,
    Users,
    CalendarDays,
    BarChart3,
    Home,
    User,
    Circle,
    TrendingUp,
    Zap,
    AlertOctagon,
    UserCircle,
    ArrowRightLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RadialNavConfig, RadialSegment, RouteEntry } from './radial-nav.types'

// Storage
export const STORAGE_KEY = 'agency-manager:radial-nav-config'

// Slot defaults
export const RADIAL_SLOT_COUNT = 6
export const EMPTY_SEGMENT_LABEL = 'Trong'
export const EMPTY_SEGMENT_PATH = ''

export function createEmptySegment(index: number): RadialSegment {
    return {
        id: `seg-${index}`,
        label: EMPTY_SEGMENT_LABEL,
        path: EMPTY_SEGMENT_PATH,
        icon: 'Circle',
        color: 'zinc',
    }
}

export function isEmptySegment(segment: RadialSegment): boolean {
    return !segment.path
}

// Icon map
export const ICON_MAP: Record<string, LucideIcon> = {
    LayoutDashboard,
    ListTodo,
    Smile,
    Wallet,
    CreditCard,
    Users,
    CalendarDays,
    BarChart3,
    Home,
    User,
    TrendingUp,
    Zap,
    AlertOctagon,
    UserCircle,
    ArrowRightLeft,
    Circle,
}

export function getIcon(name: string): LucideIcon {
    return ICON_MAP[name] ?? Circle
}

// Route registry (role-aware)
export const ROUTE_REGISTRY: RouteEntry[] = [
    // Admin scope
    { path: '/[workspaceId]/admin',             label: 'Dashboard',      icon: 'LayoutDashboard', color: 'indigo',  allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/queue',       label: 'Task Queue',     icon: 'ListTodo',        color: 'violet',  allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/crm',         label: 'CRM',            icon: 'Smile',           color: 'cyan',    allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/payroll',     label: 'Payroll',        icon: 'Wallet',          color: 'emerald', allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/finance',     label: 'Finance',        icon: 'CreditCard',      color: 'amber',   allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/users',       label: 'Staff',          icon: 'Users',           color: 'blue',    allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/schedule',    label: 'Schedule',       icon: 'CalendarDays',    color: 'pink',    allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/analytics',   label: 'Analytics',      icon: 'BarChart3',       color: 'orange',  allowedRoles: ['ADMIN'] },
    { path: '/[workspaceId]/admin/performance', label: 'Performance',    icon: 'TrendingUp',      color: 'rose',    allowedRoles: ['ADMIN'] },

    // User/member scope
    { path: '/[workspaceId]/dashboard',            label: 'My Dashboard', icon: 'Home',         color: 'teal',    allowedRoles: ['ADMIN', 'USER'] },
    { path: '/[workspaceId]/dashboard/schedule',   label: 'My Schedule',  icon: 'CalendarDays', color: 'pink',    allowedRoles: ['ADMIN', 'USER'] },
    { path: '/[workspaceId]/dashboard/errors',     label: 'My Errors',    icon: 'AlertOctagon', color: 'rose',    allowedRoles: ['ADMIN', 'USER'] },
    { path: '/[workspaceId]/dashboard/profile',    label: 'My Profile',   icon: 'UserCircle',   color: 'zinc',    allowedRoles: ['ADMIN', 'USER'] },
    { path: '/profile',                            label: 'Switch Team',  icon: 'ArrowRightLeft',color: 'indigo', allowedRoles: ['ADMIN', 'USER'] },
    { path: '/workspace',                          label: 'Workspace',    icon: 'Zap',          color: 'purple',  allowedRoles: ['ADMIN', 'USER'] },
]

export function isRouteAllowedForRole(route: RouteEntry, role: string | null | undefined): boolean {
    if (!route.allowedRoles || route.allowedRoles.length === 0) return true
    const normalizedRole = (role ?? '').toUpperCase()
    return route.allowedRoles.includes(normalizedRole)
}

export function toSegmentFromRoute(route: RouteEntry, index: number, id?: string): RadialSegment {
    return {
        id: id ?? `seg-${index}`,
        label: route.label,
        path: route.path,
        icon: route.icon,
        color: route.color,
    }
}

// Default config: 6 empty slots
export const DEFAULT_SEGMENTS: RadialSegment[] = Array.from({ length: RADIAL_SLOT_COUNT }, (_, i) => createEmptySegment(i))

export const DEFAULT_CONFIG: RadialNavConfig = {
    version: 1,
    segments: DEFAULT_SEGMENTS,
}

// Color map
export const COLOR_MAP: Record<string, { bg: string; border: string; glow: string; text: string }> = {
    indigo:  { bg: 'bg-indigo-950/60',  border: 'border-indigo-500/40',  glow: 'shadow-indigo-500/30',  text: 'text-indigo-300'  },
    violet:  { bg: 'bg-violet-950/60',  border: 'border-violet-500/40',  glow: 'shadow-violet-500/30',  text: 'text-violet-300'  },
    cyan:    { bg: 'bg-cyan-950/60',    border: 'border-cyan-500/40',    glow: 'shadow-cyan-500/30',    text: 'text-cyan-300'    },
    emerald: { bg: 'bg-emerald-950/60', border: 'border-emerald-500/40', glow: 'shadow-emerald-500/30', text: 'text-emerald-300' },
    amber:   { bg: 'bg-amber-950/60',   border: 'border-amber-500/40',   glow: 'shadow-amber-500/30',   text: 'text-amber-300'   },
    blue:    { bg: 'bg-blue-950/60',    border: 'border-blue-500/40',    glow: 'shadow-blue-500/30',    text: 'text-blue-300'    },
    pink:    { bg: 'bg-pink-950/60',    border: 'border-pink-500/40',    glow: 'shadow-pink-500/30',    text: 'text-pink-300'    },
    orange:  { bg: 'bg-orange-950/60',  border: 'border-orange-500/40',  glow: 'shadow-orange-500/30',  text: 'text-orange-300'  },
    rose:    { bg: 'bg-rose-950/60',    border: 'border-rose-500/40',    glow: 'shadow-rose-500/30',    text: 'text-rose-300'    },
    teal:    { bg: 'bg-teal-950/60',    border: 'border-teal-500/40',    glow: 'shadow-teal-500/30',    text: 'text-teal-300'    },
    zinc:    { bg: 'bg-zinc-900/60',    border: 'border-zinc-500/40',    glow: 'shadow-zinc-500/20',    text: 'text-zinc-300'    },
    purple:  { bg: 'bg-purple-950/60',  border: 'border-purple-500/40',  glow: 'shadow-purple-500/30',  text: 'text-purple-300'  },
}

export const FALLBACK_COLOR = { bg: 'bg-zinc-950/60', border: 'border-white/10', glow: 'shadow-black/30', text: 'text-zinc-300' }

// Radial geometry
export const RADIAL_RADIUS = 130
export const DEAD_ZONE_RADIUS = 45
export const DRAG_THRESHOLD = 8
export const SEGMENT_MIN = RADIAL_SLOT_COUNT
export const SEGMENT_MAX = RADIAL_SLOT_COUNT
