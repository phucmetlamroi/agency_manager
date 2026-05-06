'use client'

import { BellOff } from 'lucide-react'

export function EmptyNotification({ message = 'No notifications yet' }: { message?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-3">
                <BellOff className="w-6 h-6 text-violet-400" />
            </div>
            <div className="text-[13px] font-medium text-zinc-400">{message}</div>
            <div className="text-[11px] text-zinc-600 mt-0.5">You'll see updates here as they happen</div>
        </div>
    )
}
