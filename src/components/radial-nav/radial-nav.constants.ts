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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RadialNavConfig, RadialSegment, RouteEntry } from './radial-nav.types'

// ─────────────────────────────────────────────
// Storage Key
// ─────────────────────────────────────────────
export const STORAGE_KEY = 'agency-manager:radial-nav-config'

// ─────────────────────────────────────────────
// Icon Map (string -> LucideIcon component)
// Tree-shakeable: only imported icons are bundled
// ─────────────────────────────────────────────
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
    Circle,
}

export function getIcon(name: string): LucideIcon {
    return ICON_MAP[name] ?? Circle
}

// ─────────────────────────────────────────────
// Route Registry — all navigable deep links
// ─────────────────────────────────────────────
export const ROUTE_REGISTRY: RouteEntry[] = [
    { path: '/[workspaceId]/admin',            label: 'Dashboard',    icon: 'LayoutDashboard', color: 'indigo'   },
    { path: '/[workspaceId]/admin/queue',      label: 'Task Queue',   icon: 'ListTodo',        color: 'violet'   },
    { path: '/[workspaceId]/admin/crm',        label: 'CRM',          icon: 'Smile',           color: 'cyan'     },
    { path: '/[workspaceId]/admin/payroll',    label: 'Payroll',      icon: 'Wallet',          color: 'emerald'  },
    { path: '/[workspaceId]/admin/finance',    label: 'Finance',      icon: 'CreditCard',      color: 'amber'    },
    { path: '/[workspaceId]/admin/users',      label: 'Staff',        icon: 'Users',           color: 'blue'     },
    { path: '/[workspaceId]/admin/schedule',   label: 'Schedule',     icon: 'CalendarDays',    color: 'pink'     },
    { path: '/[workspaceId]/admin/analytics',  label: 'Analytics',    icon: 'BarChart3',       color: 'orange'   },
    { path: '/[workspaceId]/admin/performance',label: 'Performance',  icon: 'TrendingUp',      color: 'rose'     },
    { path: '/[workspaceId]/dashboard',        label: 'My Dashboard', icon: 'Home',            color: 'teal'     },
    { path: '/profile',                        label: 'Profile',      icon: 'User',            color: 'zinc'     },
    { path: '/workspace',                      label: 'Workspace',    icon: 'Zap',             color: 'purple'   },
]

// ─────────────────────────────────────────────
// Default Segments (8 segments on first load)
// ─────────────────────────────────────────────
export const DEFAULT_SEGMENTS: RadialSegment[] = ROUTE_REGISTRY.slice(0, 8).map((r, i) => ({
    id: `seg-${i}`,
    label: r.label,
    path: r.path,
    icon: r.icon,
    color: r.color,
}))

export const DEFAULT_CONFIG: RadialNavConfig = {
    version: 1,
    segments: DEFAULT_SEGMENTS,
}

// ─────────────────────────────────────────────
// Color accent map for segment glow
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Radial Geometry
// ─────────────────────────────────────────────
export const RADIAL_RADIUS = 130       // px from origin to segment center
export const DEAD_ZONE_RADIUS = 45     // px — no selection near center
export const DRAG_THRESHOLD = 8        // px — min drag distance to open menu
export const SEGMENT_MIN = 6
export const SEGMENT_MAX = 10
