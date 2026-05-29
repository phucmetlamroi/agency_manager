'use client'

import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'

interface Props {
    /** Optional className override */
    className?: string
}

/**
 * MarketplaceTriggerButton — compact top-bar variant of the marketplace
 * button. Renders next to the notification bell (replaces the old floating
 * bottom-right button).
 *
 * Click → dispatches `open-marketplace` event. `MarketplaceProvider` (with
 * `triggerMode='event'`) listens and opens the modal.
 *
 * Subscribes to `marketplace-task-count` event to render a live count badge.
 */
export function MarketplaceTriggerButton({ className = '' }: Props) {
    const [taskCount, setTaskCount] = useState(0)

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<number>).detail
            if (typeof detail === 'number') setTaskCount(detail)
        }
        window.addEventListener('marketplace-task-count', handler)
        return () => window.removeEventListener('marketplace-task-count', handler)
    }, [])

    return (
        <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-marketplace'))}
            title="Phiên chợ Task"
            className={`relative p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none ${className}`}
        >
            <Store
                className={`w-[18px] h-[18px] ${taskCount > 0 ? 'text-amber-400' : 'text-zinc-400'}`}
                strokeWidth={1.8}
            />
            {taskCount > 0 && (
                <span
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center px-1 shadow-[0_0_8px_rgba(245,158,11,0.4)] border-2 border-zinc-950"
                >
                    {taskCount > 99 ? '99+' : taskCount}
                </span>
            )}
        </button>
    )
}
