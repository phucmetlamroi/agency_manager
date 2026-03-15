'use client'

import { useState } from 'react'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

type UserRow = {
    id: string
    username: string
    nickname: string | null
    role: string
    schedules: Record<string, AvailabilityStatus[]>
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const STATUS_COLOR: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-transparent',
    FREE: 'bg-emerald-500',
    BUSY: 'bg-rose-500',
    TENTATIVE: 'bg-amber-500'
}

const STATUS_CLASS: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-slate-900/40 border-slate-800/50',
    FREE: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
    BUSY: 'bg-rose-500/20 border-rose-500/40 text-rose-400',
    TENTATIVE: 'bg-amber-500/20 border-amber-500/40 text-amber-400'
}

const formatDayLabel = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00+07:00`)
    const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date)
    const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date)
    return { weekday, dayMonth }
}

export default function AdminAvailabilityWeekMatrix({
    days,
    users,
    todayKey,
    currentHour,
    selectedUserId
}: {
    days: string[]
    users: UserRow[]
    todayKey: string
    currentHour: number
    selectedUserId: string
}) {
    const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number } | null>(null)

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-950 overflow-hidden relative">
            {/* Legend Overlay */}
            <div className="absolute bottom-6 right-6 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 pointer-events-none lg:pointer-events-auto">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Chú thích</div>
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500 opacity-60" />
                    <span className="text-xs text-slate-300">Rảnh</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm bg-rose-500 opacity-60" />
                    <span className="text-xs text-slate-300">Bận</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-sm bg-amber-500 opacity-60" />
                    <span className="text-xs text-slate-300">Bận tạm</span>
                </div>
            </div>

            {/* Grid Container */}
            <div className="flex-1 overflow-auto custom-scrollbar pt-2">
                <div className="inline-grid grid-cols-[70px_repeat(7,1fr)] min-w-[1000px] w-full border-collapse">
                    
                    {/* Header: Hours + Days */}
                    <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 border-r border-slate-800">
                        GIỜ
                    </div>
                    {days.map((day) => {
                        const { weekday, dayMonth } = formatDayLabel(day)
                        const isToday = day === todayKey
                        return (
                            <div 
                                key={day}
                                className={`sticky top-0 z-30 border-b border-r border-slate-800 h-16 flex flex-col items-center justify-center transition-colors
                                    ${isToday ? 'bg-indigo-600/10' : 'bg-slate-900'}
                                `}
                            >
                                <span className={`text-[10px] uppercase tracking-tighter ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                                    {weekday}
                                </span>
                                <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-200'}`}>
                                    {dayMonth}
                                </span>
                            </div>
                        )
                    })}

                    {/* Matrix Rows */}
                    {HOURS.map((hour) => (
                        <div key={`row-${hour}`} className="contents">
                            {/* Sticky Hour Side */}
                            <div className="sticky left-0 z-20 bg-slate-900 border-b border-r border-slate-800 h-16 flex items-center justify-center text-xs font-mono text-slate-500">
                                {hour.toString().padStart(2, '0')}:00
                            </div>

                            {/* Matrix Cells */}
                            {days.map((day) => {
                                const isCurrentHour = day === todayKey && hour === currentHour
                                
                                if (selectedUserId === 'all') {
                                    const staffStatuses = users.map(u => ({
                                        userId: u.id,
                                        name: u.nickname || u.username,
                                        status: u.schedules[day]?.[hour] || 'EMPTY'
                                    })).filter(s => s.status !== 'EMPTY')

                                    return (
                                        <div
                                            key={`${day}-${hour}`}
                                            onMouseEnter={() => setHoveredCell({ day, hour })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                            className={`relative border-b border-r border-slate-800/40 h-16 transition-all group overflow-hidden flex flex-col p-1 gap-0.5
                                                ${isCurrentHour ? 'bg-indigo-500/5' : 'bg-slate-950/20 hover:bg-slate-800/20'}
                                            `}
                                        >
                                            {/* Activity Heatmap Bars */}
                                            <div className="flex flex-wrap gap-0.5 w-full h-full content-start">
                                                {staffStatuses.map((s) => (
                                                    <div
                                                        key={s.userId}
                                                        className={`h-1.5 flex-1 min-w-[20%] rounded-full opacity-60 shadow-sm transition-opacity group-hover:opacity-100 ${STATUS_COLOR[s.status as AvailabilityStatus]}`}
                                                        title={`${s.name}: ${s.status}`}
                                                    />
                                                ))}
                                            </div>

                                            {/* User List Overlay (Visible on Hover) */}
                                            {hoveredCell?.day === day && hoveredCell?.hour === hour && staffStatuses.length > 0 && (
                                                <div className="absolute inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 p-2 shadow-2xl max-h-[120px] overflow-y-auto">
                                                    <div className="text-[9px] uppercase font-bold text-slate-500 mb-1 border-b border-slate-800 pb-1">
                                                        Nhân sự ({staffStatuses.length})
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        {staffStatuses.map(s => (
                                                            <div key={s.userId} className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] text-slate-200 truncate">{s.name}</span>
                                                                <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[s.status as AvailabilityStatus]}`} />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {isCurrentHour && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                                        </div>
                                    )
                                } else {
                                    // Single User View
                                    const user = users.find(u => u.id === selectedUserId)
                                    const status = user?.schedules[day]?.[hour] || 'EMPTY'

                                    return (
                                        <div
                                            key={`${day}-${hour}`}
                                            className={`relative border-b border-r border-slate-800/40 h-16 transition-all duration-75 p-1
                                                ${isCurrentHour ? 'ring-1 ring-inset ring-indigo-500/30 bg-indigo-500/5' : ''}
                                                ${STATUS_CLASS[status]}
                                            `}
                                        >
                                            {status !== 'EMPTY' && (
                                                <div className="text-[9px] font-bold uppercase tracking-tighter opacity-70">
                                                    {status === 'FREE' ? 'Rảnh' : status === 'BUSY' ? 'Bận' : 'Tạm'}
                                                </div>
                                            )}
                                            {isCurrentHour && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                                        </div>
                                    )
                                }
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155;
                }
            `}</style>
        </div>
    )
}
