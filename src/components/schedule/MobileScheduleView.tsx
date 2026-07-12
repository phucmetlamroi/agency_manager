'use client'

// [Mobile design-handoff §1 (2d) / PR#5] Lịch mobile: segmented "Rảnh/Bận" (lưới sẵn có,
// OptimisticGrid — owner giữ, M13) | "Theo người" (ma trận tải: assignee × ngày = SỐ deadline;
// tap ô → sheet giao lại via bulkAssignTasks). Aggregate mới từ task đã fetch — không action mới.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Users2, UserPlus } from 'lucide-react'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { bulkAssignTasks } from '@/actions/bulk-task-actions'
import { getStatusInfo } from '@/lib/status-colors'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type SchedStaff = { id: string; name: string }
export type SchedDay = { key: string; label: string } // key = 'YYYY-M-D' (local parts)
export type SchedTask = { id: string; title: string; assigneeId: string | null; deadline: string; status: string; dayKey: string }

export default function MobileScheduleView({
    availabilitySlot,
    staff,
    days,
    tasks,
    workspaceId,
}: {
    availabilitySlot: React.ReactNode
    staff: SchedStaff[]
    days: SchedDay[]
    tasks: SchedTask[]
    workspaceId: string
}) {
    const router = useRouter()
    const [, startTransition] = useTransition()
    const [seg, setSeg] = useState<'avail' | 'person'>('person')
    const [cell, setCell] = useState<{ staff: SchedStaff; day: SchedDay } | null>(null)
    const [busy, setBusy] = useState(false)

    // matrix[staffId][dayKey] = tasks in that cell
    const matrix = useMemo(() => {
        const m: Record<string, Record<string, SchedTask[]>> = {}
        for (const s of staff) m[s.id] = {}
        for (const t of tasks) {
            if (!t.assigneeId || !m[t.assigneeId]) continue
            ;(m[t.assigneeId][t.dayKey] ??= []).push(t)
        }
        return m
    }, [staff, tasks])

    const cellTasks = cell ? matrix[cell.staff.id]?.[cell.day.key] ?? [] : []

    const reassignAll = async (assigneeId: string | null) => {
        if (!cell || busy) return
        const ids = cellTasks.map((t) => t.id)
        if (!ids.length) return
        setBusy(true)
        try {
            const res: any = await bulkAssignTasks(ids, assigneeId, workspaceId)
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success(assigneeId ? `Đã giao lại ${res?.count ?? ids.length} task` : `Đã trả ${res?.count ?? ids.length} task về kho`)
            setCell(null)
            startTransition(() => router.refresh())
        } catch {
            toast.error('Giao lại thất bại. Vui lòng thử lại.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Segmented */}
            <div className="flex gap-1 rounded-xl border border-white/8 bg-zinc-900/60 p-1">
                <button
                    type="button"
                    onClick={() => setSeg('avail')}
                    className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-caption font-bold transition-colors ${seg === 'avail' ? 'bg-primary text-white' : 'text-muted-foreground active:bg-white/5'}`}
                >
                    <CalendarClock className="h-4 w-4" /> Rảnh / Bận
                </button>
                <button
                    type="button"
                    onClick={() => setSeg('person')}
                    className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-caption font-bold transition-colors ${seg === 'person' ? 'bg-primary text-white' : 'text-muted-foreground active:bg-white/5'}`}
                >
                    <Users2 className="h-4 w-4" /> Theo người
                </button>
            </div>

            {seg === 'avail' ? (
                <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-white/8 bg-zinc-900/40 p-2">{availabilitySlot}</div>
            ) : staff.length === 0 ? (
                <p className="py-8 text-center text-body-sm italic text-muted-foreground">Chưa có nhân sự nào trong profile này.</p>
            ) : (
                <>
                    <p className="text-caption text-muted-foreground">Số deadline theo người / ngày — chạm ô để giao lại.</p>
                    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-white/8 bg-zinc-900/40">
                        <table className="w-full border-collapse text-caption">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-zinc-900 px-2 py-2 text-left font-bold text-muted-foreground">Người</th>
                                    {days.map((d) => (
                                        <th key={d.key} className="whitespace-nowrap px-1.5 py-2 text-center font-bold text-muted-foreground">
                                            {d.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {staff.map((s) => (
                                    <tr key={s.id} className="border-t border-white/5">
                                        <td className="sticky left-0 z-10 max-w-[110px] truncate bg-zinc-950 px-2 py-2 font-semibold text-foreground">{s.name}</td>
                                        {days.map((d) => {
                                            const n = matrix[s.id]?.[d.key]?.length ?? 0
                                            const tone =
                                                n === 0
                                                    ? 'text-zinc-600'
                                                    : n >= 3
                                                        ? 'bg-red-500/15 text-red-300'
                                                        : 'bg-primary/15 text-primary-accent'
                                            return (
                                                <td key={d.key} className="px-1.5 py-1.5 text-center">
                                                    <button
                                                        type="button"
                                                        disabled={n === 0}
                                                        onClick={() => setCell({ staff: s, day: d })}
                                                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2 font-bold transition-transform active:scale-95 disabled:cursor-default ${tone}`}
                                                    >
                                                        {n || '·'}
                                                    </button>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Reassign sheet */}
            <MobileSheet open={!!cell} onOpenChange={(o) => !o && setCell(null)} title={cell ? `${cell.staff.name} · ${cell.day.label}` : undefined}>
                {cell && (
                    <div className="flex flex-col gap-3 pt-1">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-body-sm text-muted-foreground">{cellTasks.length} task đến hạn</span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        disabled={busy}
                                        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-caption font-bold text-primary-accent transition-colors active:bg-primary/25 disabled:opacity-50"
                                    >
                                        <UserPlus className="h-4 w-4" /> Giao tất cả cho…
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-h-[45vh] overflow-y-auto">
                                    <DropdownMenuLabel>Giao lại cho</DropdownMenuLabel>
                                    {staff
                                        .filter((s) => s.id !== cell.staff.id)
                                        .map((s) => (
                                            <DropdownMenuItem key={s.id} onClick={() => reassignAll(s.id)}>
                                                {s.name}
                                            </DropdownMenuItem>
                                        ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => reassignAll(null)}>Trả về kho đợi</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="flex flex-col gap-2">
                            {cellTasks.map((t) => {
                                const st = getStatusInfo(t.status)
                                return (
                                    <div key={t.id} className="rounded-xl border border-white/8 bg-zinc-900/60 p-3">
                                        <div className="truncate text-body-sm font-semibold text-foreground">{t.title}</div>
                                        <span
                                            className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
                                            style={{ background: st.bg, color: st.color }}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                                            {st.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </MobileSheet>
        </div>
    )
}
