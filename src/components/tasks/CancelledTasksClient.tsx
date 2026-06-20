'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, RotateCcw, Loader2, Clock, User, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { restoreCancelledTask, type CancelledTaskRow } from '@/actions/task-actions'

type Props = {
    workspaceId: string
    tasks: CancelledTaskRow[]
}

/**
 * [Design decision — auto-archive on cancel] Admin-only view of cancelled /
 * archived tasks. Mirrors the Client Trash pattern: each row shows what was
 * cancelled + a Restore action. Restoring un-archives the task and resets it to
 * a visible status ('Nhận task' if it still has an assignee, else the pool).
 */
export default function CancelledTasksClient({ workspaceId, tasks }: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    function refresh() {
        startTransition(() => router.refresh())
    }

    async function handleRestore(id: string) {
        setActionLoading(id)
        try {
            const res = await restoreCancelledTask(id, workspaceId)
            if ('error' in res) {
                toast.error(res.error || 'Không thể khôi phục task.')
            } else {
                toast.success(`Đã khôi phục task → "${res.restoredStatus}".`)
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    if (tasks.length === 0) {
        return (
            <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-white/10 p-8 text-center">
                <XCircle size={32} className="mx-auto text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-400">Không có task nào đã hủy / lưu trữ.</p>
                <p className="text-[12px] text-zinc-600 mt-1">
                    Task chuyển sang “Đã hủy” sẽ xuất hiện ở đây và có thể khôi phục.
                </p>
            </div>
        )
    }

    return (
        <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="divide-y divide-white/5">
                {tasks.map((t) => {
                    const isLoading = actionLoading === t.id
                    return (
                        <div key={t.id} className="p-4 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <XCircle size={16} className="text-red-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-zinc-100 truncate">{t.title}</div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-0.5">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Clock size={10} /> {t.updatedAt?.slice(0, 10) ?? '—'}
                                    </span>
                                    {t.clientName && (
                                        <span className="text-zinc-500 flex items-center gap-1">
                                            <Building2 size={10} /> {t.clientName}
                                        </span>
                                    )}
                                    {t.assigneeName && (
                                        <span className="text-zinc-500 flex items-center gap-1">
                                            <User size={10} /> {t.assigneeName}
                                        </span>
                                    )}
                                    <span className="text-red-400/80 font-medium">{t.status}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => handleRestore(t.id)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/20 text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isLoading ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                    Khôi phục
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
