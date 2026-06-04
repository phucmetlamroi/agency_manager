'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RotateCcw, Loader2, Clock, FileText, Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { restoreClient, permanentlyDeleteClient } from '@/actions/crm-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'

type TrashedClient = {
    id: number
    name: string
    deletedAt: string | null
    taskCount: number
    subCount: number
    invoiceCount: number
}

type Props = {
    workspaceId: string
    clients: TrashedClient[]
}

export default function ClientTrashClient({ workspaceId, clients }: Props) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [actionLoading, setActionLoading] = useState<number | null>(null)
    const { confirm } = useConfirm()

    function refresh() {
        startTransition(() => router.refresh())
    }

    async function handleRestore(id: number) {
        setActionLoading(id)
        try {
            const res = await restoreClient(id, workspaceId)
            if (!res.success) toast.error(res.error || 'Không thể khôi phục khách hàng.')
            else {
                toast.success('Đã khôi phục khách hàng.')
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    async function handlePurge(c: TrashedClient) {
        const ok = await confirm({
            title: 'Xoá vĩnh viễn?',
            message: `Xoá vĩnh viễn "${c.name}"${c.subCount > 0 ? ` và ${c.subCount} brand con` : ''}? KHÔNG THỂ hoàn tác. Task liên quan sẽ được gỡ liên kết (giữ lại); Project con sẽ bị xoá.`,
            type: 'danger',
            confirmText: 'Xoá vĩnh viễn',
            cancelText: 'Huỷ',
        })
        if (!ok) return
        setActionLoading(c.id)
        try {
            const res = await permanentlyDeleteClient(c.id, workspaceId)
            if (!res.success) toast.error(res.error || 'Không thể xoá vĩnh viễn.')
            else {
                toast.success('Đã xoá vĩnh viễn.')
                refresh()
            }
        } finally {
            setActionLoading(null)
        }
    }

    if (clients.length === 0) {
        return (
            <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] p-8 text-center">
                <Trash2 size={32} className="mx-auto text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-400">Không có khách hàng nào trong thùng rác.</p>
                <p className="text-[12px] text-zinc-600 mt-1">Khách hàng đã xoá sẽ xuất hiện ở đây và có thể khôi phục.</p>
            </div>
        )
    }

    return (
        <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] overflow-hidden">
            <div className="divide-y divide-white/5">
                {clients.map((c) => {
                    const isLoading = actionLoading === c.id
                    return (
                        <div key={c.id} className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                                <Trash2 size={16} className="text-red-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-zinc-100 truncate">{c.name}</div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-0.5">
                                    <span className="text-zinc-500 flex items-center gap-1">
                                        <Clock size={10} /> Đã xoá {c.deletedAt?.slice(0, 10) ?? '—'}
                                    </span>
                                    {c.taskCount > 0 && (
                                        <span className="text-zinc-500 flex items-center gap-1">
                                            <FileText size={10} /> {c.taskCount} task
                                        </span>
                                    )}
                                    {c.subCount > 0 && (
                                        <span className="text-zinc-500 flex items-center gap-1">
                                            <Users size={10} /> {c.subCount} brand con
                                        </span>
                                    )}
                                    {c.invoiceCount > 0 && (
                                        <span className="text-amber-400/80 flex items-center gap-1">
                                            <AlertTriangle size={10} /> {c.invoiceCount} hoá đơn
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => handleRestore(c.id)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/20 text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isLoading ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                    Khôi phục
                                </button>
                                <button
                                    onClick={() => handlePurge(c)}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <Trash2 size={11} /> Xoá vĩnh viễn
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
