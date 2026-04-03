'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useParams, useRouter } from 'next/navigation'
import { RadialMenu } from './RadialMenu'
import { RadialConfigModal } from './RadialConfigModal'
import { useRadialGesture } from './useRadialGesture'
import {
    DEFAULT_CONFIG,
    STORAGE_KEY,
} from './radial-nav.constants'
import type { RadialNavConfig, RadialNavContextValue, MenuState } from './radial-nav.types'

// ─────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────
function loadConfig(): RadialNavConfig {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_CONFIG
        const parsed = JSON.parse(raw) as RadialNavConfig
        if (parsed.version !== 1 || !Array.isArray(parsed.segments)) return DEFAULT_CONFIG
        if (parsed.segments.length < 6 || parsed.segments.length > 10) return DEFAULT_CONFIG
        return parsed
    } catch {
        return DEFAULT_CONFIG
    }
}

function saveConfig(config: RadialNavConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
        // localStorage unavailable (private browsing / SSR)
    }
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
const RadialNavContext = createContext<RadialNavContextValue | undefined>(undefined)

export function useRadialNav() {
    const ctx = useContext(RadialNavContext)
    if (!ctx) throw new Error('useRadialNav must be used within RadialNavProvider')
    return ctx
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────
export function RadialNavProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const params = useParams()

    // Config state — starts with default, hydrates from localStorage on mount
    const [config, setConfig] = useState<RadialNavConfig>(DEFAULT_CONFIG)
    const [isConfigOpen, setConfigOpen] = useState(false)
    const [menuState, setMenuState] = useState<MenuState>({ open: false })
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    // Track last known workspaceId for path resolution when on non-workspace pages
    const lastWorkspaceId = useRef<string | undefined>(undefined)

    // Hydrate config from localStorage (after mount to avoid SSR mismatch)
    useEffect(() => {
        setConfig(loadConfig())
    }, [])

    // Track workspaceId from route params
    useEffect(() => {
        const id = params?.workspaceId
        if (typeof id === 'string' && id) {
            lastWorkspaceId.current = id
            try {
                localStorage.setItem('agency-manager:last-workspace', id)
            } catch { }
        }
    }, [params?.workspaceId])

    // Ctrl+Shift+K — open config modal
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

    // Resolve [workspaceId] token in path
    const resolvePath = useCallback((path: string): string | null => {
        if (!path.includes('[workspaceId]')) return path

        // Prefer current route param
        const currentId = typeof params?.workspaceId === 'string' ? params.workspaceId : null
        const storedId = (() => {
            try { return localStorage.getItem('agency-manager:last-workspace') } catch { return null }
        })()
        const workspaceId = currentId ?? storedId ?? lastWorkspaceId.current

        if (!workspaceId) return null
        return path.replace('[workspaceId]', workspaceId)
    }, [params?.workspaceId])

    // Navigate to segment
    const navigateToSegment = useCallback((index: number) => {
        const segment = config.segments[index]
        if (!segment) return
        const resolved = resolvePath(segment.path)
        if (resolved) {
            router.push(resolved)
        }
    }, [config.segments, resolvePath, router])

    // Gesture handlers
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

    // Wire up gesture detection
    useRadialGesture({
        onOpen: handleOpen,
        onClose: handleClose,
        onHover: handleHover,
        onSelect: handleSelect,
        segmentCount: config.segments.length,
        disabled: isConfigOpen,
    })

    // Config actions
    const updateConfig = useCallback((newConfig: RadialNavConfig) => {
        setConfig(newConfig)
        saveConfig(newConfig)
    }, [])

    const resetConfig = useCallback(() => {
        setConfig(DEFAULT_CONFIG)
        saveConfig(DEFAULT_CONFIG)
    }, [])

    const contextValue: RadialNavContextValue = {
        config,
        updateConfig,
        resetConfig,
        isConfigOpen,
        setConfigOpen,
    }

    return (
        <RadialNavContext.Provider value={contextValue}>
            {children}

            {/* Radial Menu — rendered via Portal to document.body */}
            <AnimatePresence>
                {menuState.open && (
                    <RadialMenu
                        key="radial-menu"
                        segments={config.segments}
                        origin={menuState.origin}
                        hoveredIndex={hoveredIndex}
                        onSelect={(i) => { handleSelect(i); handleClose() }}
                        onClose={handleClose}
                        onOpenConfig={() => setConfigOpen(true)}
                    />
                )}
            </AnimatePresence>

            {/* Config Modal */}
            <RadialConfigModal
                open={isConfigOpen}
                onOpenChange={setConfigOpen}
                config={config}
                onSave={updateConfig}
            />
        </RadialNavContext.Provider>
    )
}
