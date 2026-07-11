// src/components/dashboard/WeekStrip.tsx
// [P3 / M2.2 · FR-C4 · Pattern 13] 7-day deadline strip above the agenda. Tapping a
// cell scrolls to that day's agenda group — done with a pure `#anchor` link so the
// component stays server-rendered (no client JS). Cells are ≥44px touch incl. gap.

export type WeekStripDay = {
    /** Stable day key, matches the AgendaList group anchor id (e.g. "2026-07-12"). */
    key: string
    /** Weekday label: "T2".."T7","CN". */
    weekday: string
    /** Day-of-month number. */
    dayNum: number
    isToday: boolean
    /** Up to 3 status dot colors (hex) for deadlines that day. */
    dots: string[]
}

export default function WeekStrip({ days }: { days: WeekStripDay[] }) {
    return (
        <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
                const hasDeadline = d.dots.length > 0
                const body = (
                    <div
                        className={`flex h-12 min-w-[40px] flex-col items-center justify-center rounded-lg ${
                            d.isToday ? 'bg-primary/15 text-primary-accent' : 'text-foreground'
                        }`}
                    >
                        <span className="text-caption text-muted-foreground">{d.weekday}</span>
                        <span className="text-body-sm font-medium tabular-nums">{d.dayNum}</span>
                        <span className="mt-0.5 flex h-1 items-center gap-0.5">
                            {d.dots.slice(0, 3).map((c, i) => (
                                <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: c }} />
                            ))}
                        </span>
                    </div>
                )
                // Only deadline days link/scroll; empty days are inert.
                return hasDeadline ? (
                    <a key={d.key} href={`#agenda-${d.key}`} className="block active:scale-[0.97] transition-transform">
                        {body}
                    </a>
                ) : (
                    <div key={d.key}>{body}</div>
                )
            })}
        </div>
    )
}
