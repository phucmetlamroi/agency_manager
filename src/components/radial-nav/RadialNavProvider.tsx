'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { RadialMenu } from './RadialMenu'
import { RadialConfigModal } from './RadialConfigModal'
import { useRadialGesture } from './useRadialGesture'
import {
    DEFAULT_CONFIG,
    STORAGE_KEY,
    ROUTE_REGISTRY,
    RADIAL_SLOT_COUNT,
    createEmptySegment,
    isRouteAllowedForRole,
    toSegmentFromRoute,
} from './radial-nav.constants'
import type { RadialNavConfig, RadialNavContextValue, MenuState, RadialSegment, RouteEntry } from './radial-nav.types'

function loadConfig(): RadialNavConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_CONFIG
        const parsed = JSON.parse(raw) as RadialNavConfig
        if (parsed.version !== 1 || !Array.isArray(parsed.segments)) return DEFAULT_CONFIG
        return parsed
    } catch {
        return DEFAULT_CONFIG
    }
}

function saveConfig(config: RadialNavConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
        // localStorage unavailable
    }
}

function makeEmptySlot(index: number, id?: string): RadialSegment {
    const empty = createEmptySegment(index)
    return id ? { ...empty, id } : empty
}

function normalizeConfigByRole(config: RadialNavConfig, role: string | null): RadialNavConfig {
    const normalizedSegments: RadialSegment[] = Array.from({ length: RADIAL_SLOT_COUNT }, (_, index) => {
        const current = config.segments[index]
        const fallbackId = current?.id || `seg-${index}`

        if (!current || !current.path) {
            return makeEmptySlot(index, fallbackId)
        }

        const matchedRoute = ROUTE_REGISTRY.find(route => route.path === current.path)
        if (!matchedRoute || !isRouteAllowedForRole(matchedRoute, role)) {
            return makeEmptySlot(index, fallbackId)
        }

        return toSegmentFromRoute(matchedRoute, index, fallbackId)
    })

    return {
        version: 1,
        segments: normalizedSegments,
    }
}

const RadialNavContext = createContext<RadialNavContextValue | undefined>(undefined)

export function useRadialNav() {
    const ctx = useContext(RadialNavContext)
    if (!ctx) throw new Error('useRadialNav must be used within RadialNavProvider')
    return ctx
}

export function RadialNavProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const params = useParams()

    const [config, setConfig] = useState<RadialNavConfig>(() => {
        if (typeof window === 'undefined') return DEFAULT_CONFIG
        return loadConfig()
    })
    const [isConfigOpen, setConfigOpen] = useState(false)
    const [menuState, setMenuState] = useState<MenuState>({ open: false })
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
    const [roleState, setRoleState] = useState<{ role: string | null; loaded: boolean }>({ role: 'USER', loaded: false })

    const lastWorkspaceId = useRef<string | undefined>(undefined)

    useEffect(() => {
        let active = true

        const fetchRole = async () => {
            try {
                const res = await fetch('/api/auth/role', { cache: 'no-store' })
                if (!res.ok) {
                    if (active) setRoleState({ role: 'USER', loaded: true })
                    return
                }
                const data = await res.json()
                const role = typeof data?.role === 'string' ? data.role : 'USER'
                if (active) setRoleState({ role, loaded: true })
            } catch {
                if (active) setRoleState({ role: 'USER', loaded: true })
            }
        }

        fetchRole()

        return () => {
            active = false
        }
    }, [])

    useEffect(() => {
        const id = params?.workspaceId
        if (typeof id === 'string' && id) {
            lastWorkspaceId.current = id
            try {
                localStorage.setItem('agency-manager:last-workspace', id)
            } catch { }
        }
    }, [params?.workspaceId])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'K' && e.ctrlKey && e.shiftKey) {
                e.preventDefault()
                setConfigOpen(prev => !prev)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    const resolvePath = useCallback((path: string): string | null => {
        if (!path.includes('[workspaceId]')) return path

        const currentId = typeof params?.workspaceId === 'string' ? params.workspaceId : null
        const storedId = (() => {
            try { return localStorage.getItem('agency-manager:last-workspace') } catch { return null }
        })()
        const workspaceId = currentId ?? storedId ?? lastWorkspaceId.current

        if (!workspaceId) return null
        return path.replace('[workspaceId]', workspaceId)
    }, [params])

    const availableRoutes = useMemo<RouteEntry[]>(() => {
        return ROUTE_REGISTRY.filter(route => isRouteAllowedForRole(route, roleState.role))
    }, [roleState.role])

    const visibleConfig = useMemo(() => {
        return normalizeConfigByRole(config, roleState.role)
    }, [config, roleState.role])

    const navigateToSegment = useCallback((index: number) => {
        const segment = visibleConfig.segments[index]
        if (!segment || !segment.path) return

        const resolved = resolvePath(segment.path)
        if (resolved) {
            router.push(resolved)
        }
    }, [visibleConfig.segments, resolvePath, router])

    const handleOpen = useCallback((origin: { x: number; y: number }) => {
        setMenuState({ open: true, origin })
        setHoveredIndex(null)
    }, [])

    const handleClose = useCallback(() => {
        setMenuState({ open: false })
        setHoveredIndex(null)
    }, [])

    const handleHover = useCallback((index: number | null) => {
        setHoveredIndex(index)
    }, [])

    const handleSelect = useCallback((index: number) => {
        navigateToSegment(index)
    }, [navigateToSegment])

    useRadialGesture({
        onOpen: handleOpen,
        onClose: handleClose,
        onHover: handleHover,
        onSelect: handleSelect,
        segmentCount: visibleConfig.segments.length,
        disabled: isConfigOpen || !roleState.loaded,
    })

    const updateConfig = useCallback((newConfig: RadialNavConfig) => {
        const normalized = normalizeConfigByRole(newConfig, roleState.role)
        setConfig(normalized)
        saveConfig(normalized)
    }, [roleState.role])

    const resetConfig = useCallback(() => {
        const normalized = normalizeConfigByRole(DEFAULT_CONFIG, roleState.role)
        setConfig(normalized)
        saveConfig(normalized)
    }, [roleState.role])

    const contextValue: RadialNavContextValue = {
        config: visibleConfig,
        updateConfig,
        resetConfig,
        isConfigOpen,
        setConfigOpen,
    }

    return (
        <RadialNavContext.Provider value={contextValue}>
            {children}

            <AnimatePresence>
                {menuState.open && (
                    <RadialMenu
                        key="radial-menu"
                        segments={visibleConfig.segments}
                        origin={menuState.origin}
                        hoveredIndex={hoveredIndex}
                        onSelect={(i) => { handleSelect(i); handleClose() }}
                        onClose={handleClose}
                        onOpenConfig={() => setConfigOpen(true)}
                    />
                )}
            </AnimatePresence>

            <RadialConfigModal
                open={isConfigOpen}
                onOpenChange={setConfigOpen}
                config={visibleConfig}
                onSave={updateConfig}
                availableRoutes={availableRoutes}
            />
        </RadialNavContext.Provider>
    )
}
