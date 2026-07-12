'use client'

// [Mobile design-handoff §1 (2d) / PR#5 · visual-parity redo] Lịch mobile: segment "Rảnh/Bận"
// (lưới OptimisticGrid sẵn có — owner giữ, M13) | "Theo người" (HEATMAP dạng CSS grid: assignee ×
// ngày = SỐ deadline; ô quá tải ≥3 viền+glow đỏ; tap ô → sheet giao lại). Styling qua lớp
// `.mroot .m-*` (indigo #6366F1), desktop OptimisticGrid KHÔNG đụng. LOGIC giữ nguyên: matrix
// aggregate từ task đã fetch + reassignAll → bulkAssignTasks (không action mới).

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

function initials(name: string): string {
    const parts = name.replace(/^@/, '').trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

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
    const gridCols = `64px repeat(${days.length}, minmax(40px, 1fr))`

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
        <section className="mroot m-scr flex flex-col gap-3">
            {/* Segmented */}
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, border: '1px solid var(--m-border-2)', background: 'var(--m-glass-zinc)' }}>
                <button type="button" onClick={() => setSeg('avail')} className={seg === 'avail' ? 'm-seg on' : 'm-seg'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <CalendarClock className="h-4 w-4" /> Rảnh / Bận
                </button>
                <button type="button" onClick={() => setSeg('person')} className={seg === 'person' ? 'm-seg on' : 'm-seg'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Users2 className="h-4 w-4" /> Theo người
                </button>
            </div>

            {seg === 'avail' ? (
                <div className="m-card" style={{ padding: 8, overflowX: 'auto', overscrollBehaviorX: 'contain' }}>{availabilitySlot}</div>
            ) : staff.length === 0 ? (
                <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: 'var(--m-fg-4)' }}>Chưa có nhân sự nào trong profile này.</p>
            ) : (
                <>
                    <p style={{ fontSize: 12, color: 'var(--m-fg-4)' }}>Số deadline theo người / ngày — chạm ô để giao lại.</p>
                    <div className="m-card" style={{ overflowX: 'auto', overscrollBehaviorX: 'contain', padding: 8 }}>
                        {/* day header */}
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4, textAlign: 'center', fontSize: 9.5, color: 'var(--m-fg-4)', marginBottom: 8 }}>
                            <span />
                            {days.map((d, i) => {
                                const [dow, date] = d.label.split(/\s+/)
                                const isToday = i === 0
                                return (
                                    <span key={d.key} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, color: isToday ? 'var(--m-primary-fg)' : undefined, fontWeight: isToday ? 700 : undefined }}>
                                        <span>{dow}</span>
                                        {date && <span>{date}</span>}
                                    </span>
                                )
                            })}
                        </div>
                        {/* staff rows */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {staff.map((s) => (
                                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4, alignItems: 'center' }}>
                                    <span className="m-row" style={{ fontSize: 11, gap: 5, minWidth: 0 }}>
                                        <span className="m-av" style={{ width: 20, height: 20, fontSize: 9 }}>{initials(s.name)}</span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90, color: 'var(--m-fg-2)' }}>{s.name}</span>
                                    </span>
                                    {days.map((d) => {
                                        const n = matrix[s.id]?.[d.key]?.length ?? 0
                                        if (n === 0) return <span key={d.key} style={{ height: 30 }} />
                                        const overload = n >= 3
                                        return (
                                            <button
                                                key={d.key}
                                                type="button"
                                                onClick={() => setCell({ staff: s, day: d })}
                                                className="m-card m-press"
                                                style={{
                                                    height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 11, fontWeight: overload ? 700 : 600,
                                                    color: overload ? 'var(--m-danger-fg)' : 'var(--m-fg-1)',
                                                    ...(overload ? { background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.45)', boxShadow: '0 0 14px rgba(239,68,68,.25)' } : {}),
                                                }}
                                            >
                                                {n}
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* legend */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', fontSize: 10, color: 'var(--m-fg-4)' }}>
                        <span>số = deadline ngày đó</span>
                        <span style={{ color: 'var(--m-danger-fg)' }}>đỏ = quá tải ≥3</span>
                        <span>tap ô = xem task</span>
                    </div>
                </>
            )}

            {/* Reassign sheet */}
            <MobileSheet open={!!cell} onOpenChange={(o) => !o && setCell(null)} title={cell ? `${cell.staff.name} · ${cell.day.label}` : undefined}>
                {cell && (
                    <div className="flex flex-col gap-3 pt-1">
                        <div className="m-row" style={{ justifyContent: 'space-between' }}>
                            <span className="m-pill dan">{cellTasks.length} deadline</span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        disabled={busy}
                                        style={{ height: 40, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '0 12px', fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.35)', color: 'var(--m-primary-fg)', opacity: busy ? 0.5 : 1 }}
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
                                    <div key={t.id} className="m-card" style={{ padding: 12, borderRadius: 14 }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: 'var(--m-fg-1)' }}>{t.title}</div>
                                        <span
                                            style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}
                                        >
                                            <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color }} />
                                            {st.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </MobileSheet>
        </section>
    )
}
