'use client'

import { useState, useCallback, useEffect } from 'react'
import { FloatingMarketButton } from './FloatingMarketButton'
import { TaskMarketplace } from './TaskMarketplace'

interface MarketplaceProviderProps {
    workspaceId: string
    initialTaskCount?: number
    /**
     * Render mode for the trigger:
     *   - 'floating' (default): legacy floating bottom-right button (for admin pages)
     *   - 'event': no floating button; modal opens via `window` event 'open-marketplace'
     *     and dispatches 'marketplace-task-count' event for any external badge UI
     *     (e.g. <MarketplaceTriggerButton/> in top-bars).
     */
    triggerMode?: 'floating' | 'event'
}

export function MarketplaceProvider({
    workspaceId,
    initialTaskCount = 0,
    triggerMode = 'floating',
}: MarketplaceProviderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [taskCount, setTaskCount] = useState(initialTaskCount)

    const handleCountChange = useCallback((count: number) => {
        setTaskCount(count)
        // Broadcast count to any external subscribers (e.g. trigger button badge)
        window.dispatchEvent(
            new CustomEvent('marketplace-task-count', { detail: count }),
        )
    }, [])

    // Listen to global 'open-marketplace' event in event mode
    useEffect(() => {
        if (triggerMode !== 'event') return
        const handler = () => setIsOpen(true)
        window.addEventListener('open-marketplace', handler)
        // Broadcast initial count once mounted so triggers know the value
        window.dispatchEvent(
            new CustomEvent('marketplace-task-count', { detail: taskCount }),
        )
        return () => window.removeEventListener('open-marketplace', handler)
    }, [triggerMode, taskCount])

    return (
        <>
            {triggerMode === 'floating' && (
                <FloatingMarketButton
                    onClick={() => setIsOpen(true)}
                    taskCount={taskCount}
                />
            )}
            <TaskMarketplace
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                workspaceId={workspaceId}
                onTaskCountChange={handleCountChange}
            />
        </>
    )
}
