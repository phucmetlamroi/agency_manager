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
    FREE: 'bg-emerald-500/30 border-emerald-500/50 text-emerald-100 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]',
    BUSY: 'bg-rose-500/30 border-rose-500/50 text-rose-100 shadow-[inset_0_0_20px_rgba(244,63,94,0.15)]',
    TENTATIVE: 'bg-amber-500/30 border-amber-500/50 text-amber-100 shadow-[inset_0_0_20px_rgba(245,158,11,0.15)]'
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
            {/* Grid Container */}
            <div className="flex-1 overflow-auto custom-scrollbar pt-2">
                <div className="inline-grid grid-cols-[70px_repeat(7,1fr)] min-w-[1000px] w-full border-collapse">
                    
                    {/* Header: Hours + Days */}
                    <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 border-r border-slate-800 h-16 uppercase tracking-widest">
                        Giờ
                    </div>
                    {days.map((day) => {
                        const { weekday, dayMonth } = formatDayLabel(day)
                        const isToday = day === todayKey
                        return (
                            <div 
                                key={day}
                                className={`sticky top-0 z-30 border-b border-r border-slate-800 h-16 flex flex-col items-center justify-center transition-colors
                                    ${isToday ? 'bg-indigo-600/20 border-b-2 border-b-indigo-500' : 'bg-slate-900'}
                                `}
                            >
                                <span className={`text-[10px] uppercase tracking-widest font-black ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                                    {weekday}
                                </span>
                                <span className={`text-sm font-black ${isToday ? 'text-white' : 'text-slate-200'}`}>
                                    {dayMonth}
                                </span>
                            </div>
                        )
                    })}

                    {/* Matrix Rows */}
                    {HOURS.map((hour) => (
                        <div key={`row-${hour}`} className="contents group/row">
                            {/* Sticky Hour Side */}
                            <div className={`sticky left-0 z-20 border-b border-r border-slate-800 h-16 flex items-center justify-center text-xs font-mono font-bold transition-colors
                                ${hour === currentHour ? 'bg-indigo-600/20 text-indigo-400' : 'bg-slate-900 text-slate-500'}
                                group-hover/row:bg-slate-800/50
                            `}>
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
                                            className={`relative border-b border-r border-slate-800/40 h-16 transition-all group overflow-visible flex flex-col p-1.5 gap-1
                                                ${isCurrentHour ? 'bg-indigo-500/10' : 'bg-slate-950/20 hover:bg-slate-800/40'}
                                            `}
                                        >
                                            {/* Activity Heatmap Bars - More Substantial */}
                                            <div className="flex flex-wrap gap-1 w-full h-full content-start overflow-hidden">
                                                {staffStatuses.map((s) => (
                                                    <div
                                                        key={s.userId}
                                                        className={`h-2.5 flex-1 min-w-[22%] rounded-sm opacity-80 shadow-md transition-all group-hover:opacity-100 hover:scale-110 border border-white/5 ${STATUS_COLOR[s.status as AvailabilityStatus]}`}
                                                        title={`${s.name}: ${s.status}`}
                                                    />
                                                ))}
                                            </div>

                                            {/* Count Badge */}
                                            {staffStatuses.length > 0 && (
                                                <div className="absolute top-1 right-1 text-[8px] font-black bg-slate-900/80 px-1 rounded text-slate-400 border border-slate-700 pointer-events-none">
                                                    {staffStatuses.length}
                                                </div>
                                            )}

                                            {/* User List Overlay (Visible on Hover) */}
                                            {hoveredCell?.day === day && hoveredCell?.hour === hour && staffStatuses.length > 0 && (
                                                <div className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 z-[60] bg-slate-900 border border-slate-700 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-xl min-w-[180px]">
                                                    <div className="text-[10px] uppercase font-black text-slate-400 mb-2 border-b border-slate-800 pb-1.5 flex justify-between">
                                                        <span>Nhân sự</span>
                                                        <span className="text-indigo-400">{staffStatuses.length}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                                                        {staffStatuses.map(s => (
                                                            <div key={s.userId} className="flex items-center justify-between gap-3 group/item">
                                                                <span className="text-[11px] font-bold text-slate-200 group-hover/item:text-white transition-colors truncate">{s.name}</span>
                                                                <div className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase text-white/90 ${STATUS_COLOR[s.status as AvailabilityStatus]}`}>
                                                                    {s.status === 'FREE' ? 'Rảnh' : s.status === 'BUSY' ? 'Bận' : 'Tạm'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {isCurrentHour && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[2px_0_10px_rgba(99,102,241,0.5)]" />}
                                        </div>
                                    )
                                } else {
                                    // Single User View - HIGHER CONTRAST
                                    const user = users.find(u => u.id === selectedUserId)
                                    const status = user?.schedules[day]?.[hour] || 'EMPTY'

                                    return (
                                        <div
                                            key={`${day}-${hour}`}
                                            className={`relative border-b border-r border-slate-800/40 h-16 transition-all duration-150 p-2 flex flex-col justify-start items-start
                                                ${isCurrentHour ? 'ring-1 ring-inset ring-indigo-500/40 bg-indigo-500/10' : 'hover:bg-slate-800/20'}
                                                ${STATUS_CLASS[status]}
                                            `}
                                        >
                                            {status !== 'EMPTY' && (
                                                <>
                                                    <div className="text-[10px] font-black uppercase tracking-widest mb-1">
                                                        {status === 'FREE' ? 'Rảnh' : status === 'BUSY' ? 'Bận' : 'Tạm'}
                                                    </div>
                                                    <div className={`w-full h-1.5 rounded-full ${STATUS_COLOR[status]} opacity-50 shadow-sm`} />
                                                </>
                                            )}
                                            {status === 'EMPTY' && (
                                              <div className="w-full h-full flex items-center justify-center opacity-[0.03] pointer-events-none">
                                                  <div className="w-4 h-4 rounded-full border border-white" />
                                              </div>
                                            )}
                                            {isCurrentHour && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[2px_0_10px_rgba(99,102,241,0.5)]" />}
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
