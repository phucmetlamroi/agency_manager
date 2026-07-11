// src/lib/agenda.ts
// [P3 / FR-C4] Server-safe builder for the WeekStrip + AgendaList (next-7-days deadlines).
// Shared by the admin (M3, team-wide) and editor (M2, own) Today-first homes. Pure — no
// DB, no client APIs. Past-due tasks are intentionally excluded here (they surface as
// "quá hạn" in the Attention block, not the forward agenda).

import { getStatusInfo } from '@/lib/status-colors'
import { isReviewPhaseStatus } from '@/lib/task-statuses'
import type { WeekStripDay } from '@/components/dashboard/WeekStrip'
import type { AgendaGroup } from '@/components/dashboard/AgendaList'

/** Statuses that mean "an editor still has to fix this" (classic Revision + the two
 *  feedback-fixing video statuses). Shared by the admin Attention block + editor Today. */
export const REVISION_STATUSES = ['Revision', 'Đang sửa feedback (nội bộ)', 'Đã nhận feedback (khách)']

export type AgendaTask = {
    id: string
    title: string
    deadline: Date | string | null
    status: string
    assigneeName?: string | null
    assigneeAvatarUrl?: string | null
}

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] // indexed by Date.getDay()

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function dayKey(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
}
function hhmm(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function buildWeekAndAgenda(
    tasks: AgendaTask[],
    now: Date,
    opts?: { withAssignee?: boolean },
): { week: WeekStripDay[]; agenda: AgendaGroup[] } {
    const today0 = startOfDay(now)
    const withAssignee = opts?.withAssignee ?? false

    // Bucket tasks (that have a deadline in the next 7 days) by day key.
    const byDay = new Map<string, { at: Date; task: AgendaTask }[]>()
    for (const t of tasks) {
        if (!t.deadline) continue
        const at = new Date(t.deadline)
        if (isNaN(at.getTime())) continue
        const d0 = startOfDay(at)
        const diffDays = Math.round((d0.getTime() - today0.getTime()) / 86400000)
        if (diffDays < 0 || diffDays > 6) continue
        const key = dayKey(d0)
        if (!byDay.has(key)) byDay.set(key, [])
        byDay.get(key)!.push({ at, task: t })
    }

    const week: WeekStripDay[] = []
    const agenda: AgendaGroup[] = []

    for (let i = 0; i < 7; i++) {
        const d = new Date(today0.getTime() + i * 86400000)
        const key = dayKey(d)
        const bucket = (byDay.get(key) || []).slice().sort((a, b) => a.at.getTime() - b.at.getTime())

        // WeekStrip: up to 3 unique status colors as dots.
        const dots: string[] = []
        for (const { task } of bucket) {
            const c = getStatusInfo(task.status).color
            if (!dots.includes(c)) dots.push(c)
            if (dots.length >= 3) break
        }
        week.push({
            key,
            weekday: WEEKDAY_VI[d.getDay()],
            dayNum: d.getDate(),
            isToday: i === 0,
            dots,
        })

        if (bucket.length > 0) {
            const label =
                i === 0
                    ? 'Hôm nay'
                    : i === 1
                        ? 'Ngày mai'
                        : `${WEEKDAY_VI[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
            agenda.push({
                key,
                label,
                items: bucket.map(({ at, task }) => ({
                    id: task.id,
                    title: task.title,
                    time: hhmm(at),
                    statusColor: getStatusInfo(task.status).color,
                    ...(withAssignee && task.assigneeName
                        ? { assigneeName: task.assigneeName, assigneeAvatarUrl: task.assigneeAvatarUrl }
                        : {}),
                })),
            })
        }
    }

    return { week, agenda }
}

export type TodayItem = {
    id: string
    title: string
    statusColor: string
    /** Short meta line, e.g. "Quá hạn 2 ngày" / "Sửa lại" / "Hạn 18:00 hôm nay". */
    meta: string
}

/**
 * [M2.2 · FR-C2.1] The editor "Hôm nay" block — ≤5 tasks that need attention today,
 * in priority order: quá hạn → cần sửa (Revision) → đến hạn hôm nay. Tasks that are
 * neither overdue, in revision, nor due today are omitted.
 */
export function buildTodayTasks(tasks: AgendaTask[], now: Date, limit = 5): TodayItem[] {
    const today0 = startOfDay(now)
    const tomorrow0 = new Date(today0.getTime() + 86400000)

    type Ranked = { p: number; sortKey: number; item: TodayItem }
    const ranked: Ranked[] = []

    for (const t of tasks) {
        const dl = t.deadline ? new Date(t.deadline) : null
        const dlValid = dl && !isNaN(dl.getTime())
        const isRevision = REVISION_STATUSES.includes(t.status)
        const isOverdue =
            !!dlValid &&
            (dl as Date) < now &&
            !isReviewPhaseStatus(t.status) &&
            t.status !== 'Hoàn tất' &&
            t.status !== 'Đã hủy'
        const isDueToday = !!dlValid && (dl as Date) >= today0 && (dl as Date) < tomorrow0

        let p: number
        let meta: string
        if (isOverdue) {
            p = 0
            // startOfDay rounds to day boundaries → integer day diff. Same-day-overdue
            // (deadline earlier today) = 0 days → "Quá hạn hôm nay" (not "1 ngày").
            const days = Math.round((today0.getTime() - startOfDay(dl as Date).getTime()) / 86400000)
            meta = days <= 0 ? 'Quá hạn hôm nay' : `Quá hạn ${days} ngày`
        } else if (isRevision) {
            p = 1
            meta = getStatusInfo(t.status).label
        } else if (isDueToday) {
            p = 2
            meta = `Hạn ${hhmm(dl as Date)} hôm nay`
        } else {
            continue
        }

        ranked.push({
            p,
            sortKey: dlValid ? (dl as Date).getTime() : Number.MAX_SAFE_INTEGER,
            item: { id: t.id, title: t.title, statusColor: getStatusInfo(t.status).color, meta },
        })
    }

    ranked.sort((a, b) => (a.p !== b.p ? a.p - b.p : a.sortKey - b.sortKey))
    return ranked.slice(0, limit).map((r) => r.item)
}
