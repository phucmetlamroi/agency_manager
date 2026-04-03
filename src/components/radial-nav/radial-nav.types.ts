// ─────────────────────────────────────────────
// Radial Nav Types
// ─────────────────────────────────────────────

export type RadialSegment = {
    id: string
    label: string
    path: string         // empty string means unassigned slot
    icon: string         // lucide icon name string
    color?: string       // optional accent override (e.g. "emerald", "indigo")
}

export type RadialNavConfig = {
    version: 1
    segments: RadialSegment[]  // length: 6-10
}

export type RadialNavContextValue = {
    config: RadialNavConfig
    updateConfig: (config: RadialNavConfig) => void
    resetConfig: () => void
    isConfigOpen: boolean
    setConfigOpen: (open: boolean) => void
}

export type MenuState =
    | { open: false }
    | { open: true; origin: { x: number; y: number } }

export type GestureState = 'IDLE' | 'ARMED' | 'MENU_OPEN'

export type RouteEntry = {
    path: string
    label: string
    icon: string
    color?: string
    allowedRoles?: string[]  // undefined => available to all roles
}
