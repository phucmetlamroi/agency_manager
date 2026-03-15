'use client'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
    EMPTY: 'Trong',
    FREE: 'Ranh',
    BUSY: 'Ban',
    TENTATIVE: 'Ban tam'
}

const STATUS_CLASS: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-zinc-950/60 border-zinc-800',
    FREE: 'bg-emerald-500/15 border-emerald-500/30',
    BUSY: 'bg-rose-500/15 border-rose-500/30',
    TENTATIVE: 'bg-amber-500/15 border-amber-500/30'
}

const STATUS_DOT: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-zinc-700/60',
    FREE: 'bg-emerald-400/90',
    BUSY: 'bg-rose-400/90',
    TENTATIVE: 'bg-amber-400/90'
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const formatDayLabel = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00+07:00`)
    const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date)
    const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date)
    return `${weekday} ${dayMonth}`
}

type UserRow = {
    id: string
    username: string
    nickname: string | null
    role: string
    schedules: Record<string, AvailabilityStatus[]>
}

export default function AdminAvailabilityWeekMatrix({
    days,
    users,
    todayKey,
    currentHour
}: {
    days: string[]
    users: UserRow[]
    todayKey: string
    currentHour: number
}) {
    return (
        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Legend</span>
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.35)] ${STATUS_DOT.FREE}`} />
                    <span>{STATUS_LABEL.FREE}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.35)] ${STATUS_DOT.BUSY}`} />
                    <span>{STATUS_LABEL.BUSY}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.35)] ${STATUS_DOT.TENTATIVE}`} />
                    <span>{STATUS_LABEL.TENTATIVE}</span>
                </div>
            </div>

            <div className="min-w-max space-y-0">
                <div className="grid grid-cols-[220px_repeat(168,minmax(36px,1fr))]">
                    <div className="sticky left-0 z-20 bg-zinc-950/90 border-r border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400">
                        Nhan su
                    </div>
                    {days.map(day => (
                        <div
                            key={`day-${day}`}
                            className={`col-span-24 h-10 border-b border-r border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-center ${day === todayKey ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                        >
                            {formatDayLabel(day)}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-[220px_repeat(168,minmax(36px,1fr))]">
                    <div className="sticky left-0 z-20 bg-zinc-950/90 border-r border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400">
                        Gio
                    </div>
                    {days.map(day =>
                        HOURS.map(hour => (
                            <div
                                key={`hour-${day}-${hour}`}
                                className={`h-9 border-b border-r border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-center ${day === todayKey && hour === currentHour ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                            >
                                {hour}:00
                            </div>
                        ))
                    )}
                </div>

                {users.map(user => (
                    <div key={user.id} className="grid grid-cols-[220px_repeat(168,minmax(36px,1fr))]">
                        <div className="sticky left-0 z-10 bg-zinc-950/95 border-r border-b border-zinc-800 px-4 py-3 text-xs text-zinc-200">
                            <div className="font-semibold">{user.nickname || user.username}</div>
                            <div className="text-[10px] text-zinc-500">{user.username}</div>
                        </div>
                        {days.map(day =>
                            (user.schedules[day] || Array.from({ length: 24 }, () => 'EMPTY')).map((status, hour) => (
                                <div
                                    key={`${user.id}-${day}-${hour}`}
                                    className={`h-11 border-b border-r border-zinc-800 ${STATUS_CLASS[status]} ${day === todayKey && hour === currentHour ? 'ring-1 ring-white/10 shadow-[0_0_14px_rgba(255,255,255,0.18)]' : ''}`}
                                    title={`${day} ${hour}:00 - ${STATUS_LABEL[status]}`}
                                />
                            ))
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
