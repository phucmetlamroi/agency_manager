'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveMyAvailability } from '@/actions/availability-actions'
import { getVietnamCurrentHour, getVietnamDateKey } from '@/lib/date-utils'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

type WeekDay = {
    dateKey: string
    schedule: AvailabilityStatus[]
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

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

const formatDayLabel = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00+07:00`)
    const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' }).format(date)
    const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' }).format(date)
    return `${weekday} ${dayMonth}`
}

type Props = {
    workspaceId: string
    days: WeekDay[]
}

export default function AvailabilityWeekEditor({ workspaceId, days }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [tool, setTool] = useState<AvailabilityStatus>('BUSY')
    const [isDragging, setIsDragging] = useState(false)
    const [hoverCell, setHoverCell] = useState<{ dayKey: string; hour: number } | null>(null)
    const [scheduleByDate, setScheduleByDate] = useState<Record<string, AvailabilityStatus[]>>({})
    const scheduleRef = useRef(scheduleByDate)
    const dragState = useRef<{ dragging: boolean; target: AvailabilityStatus; dayKey: string | null }>({
        dragging: false,
        target: 'EMPTY',
        dayKey: null
    })

    useEffect(() => {
        const map: Record<string, AvailabilityStatus[]> = {}
        for (const day of days) {
            map[day.dateKey] = (day.schedule as AvailabilityStatus[]) || Array.from({ length: 24 }, () => 'EMPTY')
        }
        setScheduleByDate(map)
        scheduleRef.current = map
    }, [days])

    useEffect(() => {
        scheduleRef.current = scheduleByDate
    }, [scheduleByDate])

    useEffect(() => {
        const handleMouseUp = () => {
            if (dragState.current.dragging) {
                dragState.current.dragging = false
                setIsDragging(false)
                if (dragState.current.dayKey) {
                    commitDay(dragState.current.dayKey)
                }
            }
        }
        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [])

    const todayKey = getVietnamDateKey()
    const currentHour = getVietnamCurrentHour()

    const isCellLocked = (dayKey: string, hour: number) => {
        if (dayKey < todayKey) return true
        if (dayKey === todayKey && hour < currentHour) return true
        return false
    }

    const applyCell = (dayKey: string, hour: number, next: AvailabilityStatus) => {
        setScheduleByDate(prev => {
            const existing = prev[dayKey] || Array.from({ length: 24 }, () => 'EMPTY')
            if (existing[hour] === next) return prev
            const updatedDay = [...existing]
            updatedDay[hour] = next
            const updated = { ...prev, [dayKey]: updatedDay }
            scheduleRef.current = updated
            return updated
        })
    }

    const handleMouseDown = (dayKey: string, hour: number) => {
        if (isCellLocked(dayKey, hour)) return
        const current = scheduleRef.current[dayKey]?.[hour] || 'EMPTY'
        const target: AvailabilityStatus = current === 'EMPTY' ? tool : 'EMPTY'
        dragState.current = { dragging: true, target, dayKey }
        setIsDragging(true)
        setHoverCell({ dayKey, hour })
        applyCell(dayKey, hour, target)
    }

    const handleMouseEnter = (dayKey: string, hour: number) => {
        setHoverCell({ dayKey, hour })
        if (!dragState.current.dragging) return
        if (dragState.current.dayKey !== dayKey) return
        if (isCellLocked(dayKey, hour)) return
        applyCell(dayKey, hour, dragState.current.target)
    }

    const commitDay = (dayKey: string) => {
        const payload = scheduleRef.current[dayKey] || Array.from({ length: 24 }, () => 'EMPTY')
        startTransition(async () => {
            const res = await saveMyAvailability(dayKey, payload, workspaceId)
            if (res?.error) {
                toast.error(res.error)
                router.refresh()
                return
            }
            toast.success('Da luu lich lam viec')
            router.refresh()
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={() => setTool('FREE')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tool === 'FREE' ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10' : 'border-zinc-700 text-zinc-400 hover:border-emerald-400/40'}`}
                >
                    Ranh
                </button>
                <button
                    onClick={() => setTool('BUSY')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tool === 'BUSY' ? 'border-rose-400 text-rose-300 bg-rose-500/10' : 'border-zinc-700 text-zinc-400 hover:border-rose-400/40'}`}
                >
                    Ban
                </button>
                <button
                    onClick={() => setTool('TENTATIVE')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tool === 'TENTATIVE' ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-zinc-700 text-zinc-400 hover:border-amber-400/40'}`}
                >
                    Ban tam
                </button>
                <span className="text-xs text-zinc-500 ml-auto">{isPending ? 'Dang luu...' : 'Keo de to lich'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
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

            <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="min-w-max space-y-0">
                    <div className="grid grid-cols-[140px_repeat(168,minmax(36px,1fr))]">
                        <div className="sticky left-0 z-20 bg-zinc-950/90 border-r border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
                            Ngay
                        </div>
                        {days.map(day => (
                            <div
                                key={`day-${day.dateKey}`}
                                className={`col-span-24 h-10 border-b border-r border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-center ${day.dateKey === todayKey ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                            >
                                {formatDayLabel(day.dateKey)}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-[140px_repeat(168,minmax(36px,1fr))]">
                        <div className="sticky left-0 z-20 bg-zinc-950/90 border-r border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400">
                            Gio
                        </div>
                        {days.map(day =>
                            HOURS.map(hour => (
                                <div
                                    key={`hour-${day.dateKey}-${hour}`}
                                    className={`h-9 border-b border-r border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-center ${day.dateKey === todayKey && hour === currentHour ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                                >
                                    {hour}:00
                                </div>
                            ))
                        )}
                    </div>

                    <div className="grid grid-cols-[140px_repeat(168,minmax(36px,1fr))]">
                        <div className="sticky left-0 z-10 bg-zinc-950/95 border-r border-zinc-800 px-3 py-3 text-xs font-semibold text-zinc-300">
                            Lich
                        </div>
                        {days.map(day =>
                            (scheduleByDate[day.dateKey] || Array.from({ length: 24 }, () => 'EMPTY')).map((status, hour) => {
                                const locked = isCellLocked(day.dateKey, hour)
                                const isCurrent = day.dateKey === todayKey && hour === currentHour
                                const isHovering = hoverCell?.dayKey === day.dateKey && hoverCell?.hour === hour
                                return (
                                    <div
                                        key={`cell-${day.dateKey}-${hour}`}
                                        onMouseDown={() => handleMouseDown(day.dateKey, hour)}
                                        onMouseEnter={() => handleMouseEnter(day.dateKey, hour)}
                                        onMouseLeave={() => setHoverCell(null)}
                                        className={`h-11 border-b border-r border-zinc-800 select-none ${STATUS_CLASS[status]} ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isCurrent ? 'ring-1 ring-white/10 shadow-[0_0_14px_rgba(255,255,255,0.18)]' : ''} ${isDragging && isHovering ? 'shadow-[0_0_18px_rgba(255,255,255,0.22)]' : ''}`}
                                        title={`${day.dateKey} ${hour}:00 - ${STATUS_LABEL[status]}`}
                                    />
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
