'use client'

import { useState, useCallback } from 'react'
import { FloatingMarketButton } from './FloatingMarketButton'
import { TaskMarketplace } from './TaskMarketplace'

interface MarketplaceProviderProps {
    workspaceId: string
    initialTaskCount?: number
}

export function MarketplaceProvider({ workspaceId, initialTaskCount = 0 }: MarketplaceProviderProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [taskCount, setTaskCount] = useState(initialTaskCount)

    const handleCountChange = useCallback((count: number) => {
        setTaskCount(count)
    }, [])

    return (
        <>
            <FloatingMarketButton
                onClick={() => setIsOpen(true)}
                taskCount={taskCount}
            />
            <TaskMarketplace
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                workspaceId={workspaceId}
                onTaskCountChange={handleCountChange}
            />
        </>
    )
}
