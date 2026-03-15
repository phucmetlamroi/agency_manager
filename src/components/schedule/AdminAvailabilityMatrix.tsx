'use client'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

const STATUS_CLASS: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-zinc-950/60 border-zinc-800',
    FREE: 'bg-emerald-500/15 border-emerald-500/30',
    BUSY: 'bg-rose-500/15 border-rose-500/30',
    TENTATIVE: 'bg-amber-500/15 border-amber-500/30'
}

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
    EMPTY: 'Trá»‘ng',
    FREE: 'Ráº£nh',
    BUSY: 'Báº­n',
    TENTATIVE: 'Báº­n táº¡m'
}

const STATUS_DOT: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-zinc-700/60',
    FREE: 'bg-emerald-400/90',
    BUSY: 'bg-rose-400/90',
    TENTATIVE: 'bg-amber-400/90'
}

type UserRow = {
    id: string
    username: string
    nickname: string | null
    role: string
    schedule: AvailabilityStatus[]
}

export default function AdminAvailabilityMatrix({
    dateKey,
    users,
    currentHour
}: {
    dateKey: string
    users: UserRow[]
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
                <div className="grid grid-cols-[220px_repeat(24,minmax(40px,1fr))]">
                    <div className="sticky left-0 z-20 bg-zinc-950/90 border-r border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400">
                        Nhân sự
                    </div>
                    {Array.from({ length: 24 }).map((_, hour) => (
                        <div
                            key={`header-${hour}`}
                            className={`h-10 border-b border-r border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-center ${hour === currentHour ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                        >
                            {hour}:00
                        </div>
                    ))}
                </div>

                {users.map(user => (
                    <div key={user.id} className="grid grid-cols-[220px_repeat(24,minmax(40px,1fr))]">
                        <div className="sticky left-0 z-10 bg-zinc-950/95 border-r border-b border-zinc-800 px-4 py-3 text-xs text-zinc-200">
                            <div className="font-semibold">{user.nickname || user.username}</div>
                            <div className="text-[10px] text-zinc-500">{user.username}</div>
                        </div>
                        {user.schedule.map((status, index) => (
                            <div
                                key={`${user.id}-${index}`}
                                className={`h-12 border-b border-r border-zinc-800 ${STATUS_CLASS[status]} ${index === currentHour ? 'ring-1 ring-white/10 shadow-[0_0_14px_rgba(255,255,255,0.18)]' : ''}`}
                                title={`${dateKey} ${index}:00 â€¢ ${STATUS_LABEL[status]}`}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
