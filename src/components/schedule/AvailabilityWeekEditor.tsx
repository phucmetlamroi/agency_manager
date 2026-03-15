'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveMyAvailability } from '@/actions/availability-actions'
import { getVietnamCurrentHour, getVietnamDateKey } from '@/lib/date-utils'
import { Loader2, Save } from 'lucide-react'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

type WeekDay = {
    dateKey: string
    schedule: AvailabilityStatus[]
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const STATUS_CLASS: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-slate-900/40 border-slate-800/50',
    FREE: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
    BUSY: 'bg-rose-500/20 border-rose-500/40 text-rose-400',
    TENTATIVE: 'bg-amber-500/20 border-amber-500/40 text-amber-400'
}

const STATUS_ACTIVE_CLASS: Record<AvailabilityStatus, string> = {
    EMPTY: 'bg-slate-800/60',
    FREE: 'bg-emerald-500/40 border-emerald-400 shadow-[inset_0_0_15px_rgba(16,185,129,0.3)]',
    BUSY: 'bg-rose-500/40 border-rose-400 shadow-[inset_0_0_15px_rgba(244,63,94,0.3)]',
    TENTATIVE: 'bg-amber-500/40 border-amber-400 shadow-[inset_0_0_15px_rgba(251,191,36,0.3)]'
}

const formatDayLabel = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00+07:00`)
    const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date)
    const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date)
    return { weekday, dayMonth }
}

type Props = {
    workspaceId: string
    days: WeekDay[]
    activeTool: AvailabilityStatus
}

export default function AvailabilityWeekEditor({ workspaceId, days, activeTool }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [scheduleByDate, setScheduleByDate] = useState<Record<string, AvailabilityStatus[]>>({})
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<{ dayKey: string; hour: number } | null>(null)
    const [dragCurrent, setDragCurrent] = useState<{ dayKey: string; hour: number } | null>(null)
    const [modifiedDates, setModifiedDates] = useState<Set<string>>(new Set())

    const scheduleRef = useRef(scheduleByDate)

    useEffect(() => {
        const map: Record<string, AvailabilityStatus[]> = {}
        for (const day of days) {
            map[day.dateKey] = (day.schedule as AvailabilityStatus[]) || Array.from({ length: 24 }, () => 'EMPTY')
        }
        setScheduleByDate(map)
        scheduleRef.current = map
        setModifiedDates(new Set())
    }, [days])

    useEffect(() => {
        scheduleRef.current = scheduleByDate
    }, [scheduleByDate])

    const todayKey = getVietnamDateKey()
    const currentHour = getVietnamCurrentHour()

    const isCellLocked = (dayKey: string, hour: number) => {
        if (dayKey < todayKey) return true
        if (dayKey === todayKey && hour < currentHour) return true
        return false
    }

    const handleMouseDown = (dayKey: string, hour: number) => {
        if (isCellLocked(dayKey, hour)) return
        setIsDragging(true)
        setDragStart({ dayKey, hour })
        setDragCurrent({ dayKey, hour })
    }

    const handleMouseEnter = (dayKey: string, hour: number) => {
        if (!isDragging) return
        setDragCurrent({ dayKey, hour })
    }

    const handleMouseUp = () => {
        if (!isDragging || !dragStart || !dragCurrent) {
            setIsDragging(false)
            return
        }

        // Apply changes
        const startH = Math.min(dragStart.hour, dragCurrent.hour)
        const endH = Math.max(dragStart.hour, dragCurrent.hour)
        const targetDay = dragStart.dayKey // We only drag within one day for now to keep it simple and intuitive

        setScheduleByDate(prev => {
            const daySchedule = [...(prev[targetDay] || Array.from({ length: 24 }, () => 'EMPTY'))]
            for (let h = startH; h <= endH; h++) {
                if (!isCellLocked(targetDay, h)) {
                    daySchedule[h] = activeTool
                }
            }
            return { ...prev, [targetDay]: daySchedule }
        })

        setModifiedDates(prev => new Set(prev).add(targetDay))
        setIsDragging(false)
        setDragStart(null)
        setDragCurrent(null)
    }

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [isDragging, dragStart, dragCurrent, activeTool])

    const handleSave = () => {
        if (modifiedDates.size === 0) return

        startTransition(async () => {
            try {
                for (const dayKey of Array.from(modifiedDates)) {
                    const payload = scheduleByDate[dayKey]
                    const res = await saveMyAvailability(dayKey, payload, workspaceId)
                    if (res?.error) {
                        toast.error(`Lỗi lưu ngày ${dayKey}: ${res.error}`)
                        return
                    }
                }
                toast.success('Đã lưu tất cả thay đổi')
                setModifiedDates(new Set())
                router.refresh()
            } catch (e) {
                toast.error('Đã xảy ra lỗi khi lưu')
            }
        })
    }

    // Helper to check if a cell is within the current drag selection
    const isInSelection = (dayKey: string, hour: number) => {
        if (!isDragging || !dragStart || !dragCurrent) return false
        if (dayKey !== dragStart.dayKey) return false
        const startH = Math.min(dragStart.hour, dragCurrent.hour)
        const endH = Math.max(dragStart.hour, dragCurrent.hour)
        return hour >= startH && hour <= endH
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 overflow-hidden relative">
            {/* Grid Container */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <div className="inline-grid grid-cols-[80px_repeat(7,1fr)] min-w-[800px] w-full border-collapse">
                    
                    {/* Sticky Header Row */}
                    <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-500 h-16 flex items-center justify-center border-r border-slate-800">
                        GIỜ
                    </div>
                    {days.map((day) => {
                        const { weekday, dayMonth } = formatDayLabel(day.dateKey)
                        const isToday = day.dateKey === todayKey
                        return (
                            <div 
                                key={day.dateKey}
                                className={`sticky top-0 z-20 border-b border-r border-slate-800 h-16 flex flex-col items-center justify-center transition-colors
                                    ${isToday ? 'bg-indigo-600/10' : 'bg-slate-900'}
                                `}
                            >
                                <span className={`text-[10px] uppercase tracking-tighter ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                                    {weekday}
                                </span>
                                <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-200'}`}>
                                    {dayMonth}
                                </span>
                                {isToday && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />}
                            </div>
                        )
                    })}

                    {/* Time Rows */}
                    {HOURS.map((hour) => (
                        <div key={`row-${hour}`} className="contents">
                            {/* Sticky Hour Label */}
                            <div className="sticky left-0 z-10 bg-slate-900 border-b border-r border-slate-800 h-12 flex items-center justify-center text-[10px] font-mono text-slate-500">
                                {hour.toString().padStart(2, '0')}:00
                            </div>

                            {/* Day Cells */}
                            {days.map((day) => {
                                const status = scheduleByDate[day.dateKey]?.[hour] || 'EMPTY'
                                const locked = isCellLocked(day.dateKey, hour)
                                const selected = isInSelection(day.dateKey, hour)
                                const isCurrentHour = day.dateKey === todayKey && hour === currentHour

                                return (
                                    <div
                                        key={`${day.dateKey}-${hour}`}
                                        onMouseDown={() => handleMouseDown(day.dateKey, hour)}
                                        onMouseEnter={() => handleMouseEnter(day.dateKey, hour)}
                                        className={`relative border-b border-r border-slate-800/40 h-12 transition-all duration-75 select-none
                                            ${locked ? 'bg-slate-950/80 cursor-not-allowed' : 'cursor-crosshair hover:bg-slate-800/30'}
                                            ${selected ? STATUS_ACTIVE_CLASS[activeTool] : STATUS_CLASS[status]}
                                            ${isCurrentHour ? 'after:content-[""] after:absolute after:inset-0 after:ring-1 after:ring-indigo-500/50 after:bg-indigo-500/5' : ''}
                                        `}
                                    >
                                        {/* Status Text overlay for clarity if needed, or just color */}
                                        {status !== 'EMPTY' && !selected && (
                                            <div className="absolute inset-x-1 bottom-1 flex justify-center">
                                                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Floating Action Bar */}
            {modifiedDates.size > 0 && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-2xl shadow-indigo-600/40 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
                    >
                        {isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Save className="w-5 h-5" />
                        )}
                        Lưu {modifiedDates.size} ngày thay đổi
                    </button>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155;
                }
            `}</style>
        </div>
    )
}
