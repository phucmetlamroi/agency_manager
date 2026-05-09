"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"

interface DeadlineTask {
    id: string
    title: string
    deadline: string | Date | null
    status: string
}

interface Props {
    /** Tasks of CURRENT user only — pre-filtered upstream */
    tasks: DeadlineTask[]
}

const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const
const MONTHS_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

const NP = {
    surface: "#0A0A0A",
    border: "rgba(139,92,246,0.15)",
    borderSubtle: "rgba(139,92,246,0.10)",
    accent: "#8B5CF6",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
}

/**
 * Calendar grid widget showing days with deadline dots.
 *
 * - Dot color rules per ui-ux-standards.md:
 *     - emerald (success)  → status === 'Hoàn tất'
 *     - red (overdue)      → deadline < now AND status !== 'Hoàn tất'
 *     - indigo (pending)   → otherwise
 * - Prev/next month navigation, "Today" pill highlights current day.
 */
export default function WidgetUpcomingDeadlines({ tasks }: Props) {
    const [cursor, setCursor] = useState(() => {
        const now = new Date()
        return { year: now.getFullYear(), month: now.getMonth() }
    })

    // Pre-bucket tasks by yyyy-mm-dd for O(1) lookup during render.
    const tasksByDay = useMemo(() => {
        const map: Record<string, DeadlineTask[]> = {}
        for (const t of tasks) {
            if (!t.deadline) continue
            const d = new Date(t.deadline)
            if (isNaN(d.getTime())) continue
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            if (!map[key]) map[key] = []
            map[key].push(t)
        }
        return map
    }, [tasks])

    // Build 6x7 calendar grid for current cursor month
    const cells = useMemo(() => {
        const { year, month } = cursor
        const firstOfMonth = new Date(year, month, 1)
        const lastOfMonth = new Date(year, month + 1, 0)
        const totalDays = lastOfMonth.getDate()
        // JS getDay: Sun=0..Sat=6 → convert so Mon=0..Sun=6
        const firstDayIdx = (firstOfMonth.getDay() + 6) % 7
        const result: { day: number | null; isCurrentMonth: boolean; key: string | null }[] = []
        // Leading blanks
        for (let i = 0; i < firstDayIdx; i++) result.push({ day: null, isCurrentMonth: false, key: null })
        // Actual days
        for (let d = 1; d <= totalDays; d++) {
            result.push({
                day: d,
                isCurrentMonth: true,
                key: `${year}-${month}-${d}`,
            })
        }
        // Trailing blanks to fill 42 cells (6 rows × 7 cols)
        while (result.length < 42) {
            result.push({ day: null, isCurrentMonth: false, key: null })
        }
        return result
    }, [cursor])

    const today = new Date()
    const isTodayCell = (year: number, month: number, day: number | null) =>
        day !== null
        && today.getFullYear() === year
        && today.getMonth() === month
        && today.getDate() === day

    const goPrev = () => setCursor(({ year, month }) => {
        const m = month - 1
        return m < 0 ? { year: year - 1, month: 11 } : { year, month: m }
    })
    const goNext = () => setCursor(({ year, month }) => {
        const m = month + 1
        return m > 11 ? { year: year + 1, month: 0 } : { year, month: m }
    })

    function dotColorForTasks(items: DeadlineTask[]): string {
        const allDone = items.every(t => t.status === "Hoàn tất")
        if (allDone) return "#10B981" // emerald
        const hasOverdue = items.some(t => {
            if (t.status === "Hoàn tất" || !t.deadline) return false
            const d = new Date(t.deadline)
            return d.getTime() < Date.now()
        })
        if (hasOverdue) return "#EF4444" // red
        return "#6366F1" // indigo
    }

    return (
        <div
            className="relative overflow-hidden rounded-[26px] flex flex-col h-full"
            style={{
                background: NP.surface,
                border: `1px solid ${NP.border}`,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
            }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-lg font-bold text-white leading-tight tracking-tight flex items-center gap-1.5">
                        <CalendarIcon className="w-4 h-4" style={{ color: NP.accent }} />
                        Upcoming Deadlines
                    </h3>
                    <span className="text-xs" style={{ color: NP.textSecondary }}>
                        {MONTHS_EN[cursor.month]} {cursor.year}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={goPrev}
                        aria-label="Previous month"
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                        style={{ background: "transparent", border: `1px solid ${NP.border}`, color: NP.textSecondary }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#211B31" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={goNext}
                        aria-label="Next month"
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                        style={{ background: "transparent", border: `1px solid ${NP.border}`, color: NP.textSecondary }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#211B31" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Weekday header ── */}
            <div className="grid grid-cols-7 px-5 pb-1">
                {WEEKDAYS_EN.map((w) => (
                    <span
                        key={w}
                        className="text-center"
                        style={{ fontSize: 11, fontWeight: 600, color: NP.textMuted, letterSpacing: "0.04em" }}
                    >
                        {w}
                    </span>
                ))}
            </div>

            {/* ── Calendar grid ── */}
            <div className="grid grid-cols-7 px-3 pb-4 gap-y-1 flex-1">
                {cells.map((cell, idx) => {
                    if (cell.day === null) {
                        return <div key={idx} aria-hidden />
                    }
                    const dayItems = cell.key ? (tasksByDay[cell.key] || []) : []
                    const isToday = isTodayCell(cursor.year, cursor.month, cell.day)
                    const dot = dayItems.length > 0 ? dotColorForTasks(dayItems) : null
                    return (
                        <div
                            key={idx}
                            title={dayItems.length > 0 ? dayItems.map(t => t.title).join(" • ") : undefined}
                            className="relative flex flex-col items-center justify-start py-1"
                        >
                            <span
                                className="flex items-center justify-center"
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: "50%",
                                    background: isToday ? NP.accent : "transparent",
                                    color: isToday ? "#FFFFFF" : NP.textPrimary,
                                    fontSize: 12,
                                    fontWeight: isToday ? 700 : 500,
                                    boxShadow: isToday ? "0 0 12px rgba(139,92,246,0.4)" : "none",
                                }}
                            >
                                {cell.day}
                            </span>
                            {dot && (
                                <span
                                    className="mt-0.5"
                                    style={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: "50%",
                                        background: dot,
                                        boxShadow: `0 0 6px ${dot}`,
                                    }}
                                />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
