// src/lib/agenda.ts
// [P3 / FR-C4] Server-safe builder for the WeekStrip + AgendaList (next-7-days deadlines).
// Shared by the admin (M3, team-wide) and editor (M2, own) Today-first homes. Pure — no
// DB, no client APIs. Past-due tasks are intentionally excluded here (they surface as
// "quá hạn" in the Attention block, not the forward agenda).

import { getStatusInfo } from '@/lib/status-colors'
import type { WeekStripDay } from '@/components/dashboard/WeekStrip'
import type { AgendaGroup } from '@/components/dashboard/AgendaList'

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
