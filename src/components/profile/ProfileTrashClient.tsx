'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RotateCcw, Loader2, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { restoreProfileAction } from '@/actions/profile-actions'

type TrashedProfile = {
    id: string
    name: string
    deletedAt: string | null
    hardDeleteAfter: string | null
    daysUntilHardDelete: number
}

type Props = {
    workspaceId: string
    profiles: TrashedProfile[]
}

export default function ProfileTrashClient({ workspaceId, profiles }: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    function refresh() {
        startTransition(() => router.refresh())
    }

    async function handleRestore(profileId: string) {
        setActionLoading(profileId)
        try {
            const result = await restoreProfileAction(profileId)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success('Profile đã được restore.')
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    if (profiles.length === 0) {
        return (
            <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] p-8 text-center">
                <Trash2 size={32} className="mx-auto text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-400">Không có profile nào trong thùng rác.</p>
                <p className="text-[12px] text-zinc-600 mt-1">Profiles đã xóa sẽ xuất hiện ở đây.</p>
            </div>
        )
    }

    return (
        <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] overflow-hidden">
            <div className="divide-y divide-white/5">
                {profiles.map((p) => {
                    const isLoading = actionLoading === p.id
                    const isExpiringSoon = p.daysUntilHardDelete <= 7
                    return (
                        <div key={p.id} className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <Trash2 size={16} className="text-red-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-zinc-100 truncate">{p.name}</div>
                                <div className="flex items-center gap-3 text-[11px] mt-0.5">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Clock size={10} /> Xóa {p.deletedAt?.slice(0, 10)}
                                    </span>
                                    <span className={isExpiringSoon ? 'text-red-300 flex items-center gap-1 font-semibold' : 'text-amber-400 flex items-center gap-1'}>
                                        {isExpiringSoon && <AlertTriangle size={10} />}
                                        Còn {p.daysUntilHardDelete} ngày
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRestore(p.id)}
                                disabled={isLoading}
                                className="px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/20 text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                Restore
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
