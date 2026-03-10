'use client'

import { useTransition } from 'react'
import { stopImpersonation } from '@/actions/impersonation-actions'
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react'

export default function ImpersonationBanner({
    username,
    workspaceId
}: {
    username: string
    workspaceId: string
}) {
    const [isPending, startTransition] = useTransition()

    const handleStop = () => {
        startTransition(() => {
            stopImpersonation(workspaceId)
        })
    }

    return (
        <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-2 flex items-center justify-between sticky top-0 z-[100] shadow-md border-b border-red-600">
            <div className="flex items-center gap-3">
                <ShieldAlert size={18} className="animate-pulse" />
                <div className="text-sm font-medium">
                    You are currently viewing and acting as <strong className="bg-black/20 px-1.5 py-0.5 rounded ml-1">{username}</strong>
                </div>
            </div>
            
            <button
                onClick={handleStop}
                disabled={isPending}
                className="bg-black/20 hover:bg-black/40 text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
            >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Return to Admin
            </button>
        </div>
    )
}
