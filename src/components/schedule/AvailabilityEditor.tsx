'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveMyAvailability } from '@/actions/availability-actions'
import { getVietnamCurrentHour, getVietnamDateKey } from '@/lib/date-utils'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

const STATUS_LABEL: Record<AvailabilityStatus, string> = {
    EMPTY: 'Trống',
    FREE: 'Rảnh',
    BUSY: 'Bận',
    TENTATIVE: 'Bận tạm'
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

type Props = {
    workspaceId: string
    dateKey: string
    initialSchedule: string[]
}

export default function AvailabilityEditor({ workspaceId, dateKey, initialSchedule }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [schedule, setSchedule] = useState<AvailabilityStatus[]>(
        (initialSchedule as AvailabilityStatus[]) || Array.from({ length: 24 }, () => 'EMPTY')
    )
    const [tool, setTool] = useState<AvailabilityStatus>('BUSY')
    const [isDragging, setIsDragging] = useState(false)
    const [hoverIndex, setHoverIndex] = useState<number | null>(null)
    const dragState = useRef<{ dragging: boolean; target: AvailabilityStatus }>({
        dragging: false,
        target: 'EMPTY'
    })
    const scheduleRef = useRef(schedule)

    useEffect(() => {
        scheduleRef.current = schedule
    }, [schedule])

    useEffect(() => {
        setSchedule((initialSchedule as AvailabilityStatus[]) || Array.from({ length: 24 }, () => 'EMPTY'))
    }, [initialSchedule])

    useEffect(() => {
        const handleMouseUp = () => {
            if (dragState.current.dragging) {
                dragState.current.dragging = false
                setIsDragging(false)
                commitSchedule()
            }
        }
        window.addEventListener('mouseup', handleMouseUp)
        return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [])

    const todayKey = getVietnamDateKey()
    const currentHour = dateKey === todayKey ? getVietnamCurrentHour() : -1

    const isCellLocked = (index: number) => {
        if (dateKey < todayKey) return true
        if (dateKey === todayKey && index < currentHour) return true
        return false
    }

    const applyCell = (index: number, next: AvailabilityStatus) => {
        setSchedule(prev => {
            if (prev[index] === next) return prev
            const updated = [...prev]
            updated[index] = next
            scheduleRef.current = updated
            return updated
        })
    }

    const handleMouseDown = (index: number) => {
        if (isCellLocked(index)) return
        const current = scheduleRef.current[index] || 'EMPTY'
        const target: AvailabilityStatus = current === 'EMPTY' ? tool : 'EMPTY'
        dragState.current = { dragging: true, target }
        setIsDragging(true)
        setHoverIndex(index)
        applyCell(index, target)
    }

    const handleMouseEnter = (index: number) => {
        setHoverIndex(index)
        if (!dragState.current.dragging) return
        if (isCellLocked(index)) return
        applyCell(index, dragState.current.target)
    }

    const commitSchedule = () => {
        const payload = scheduleRef.current
        startTransition(async () => {
            const res = await saveMyAvailability(dateKey, payload, workspaceId)
            if (res?.error) {
                toast.error(res.error)
                router.refresh()
                return
            }
            toast.success('Đã lưu lịch làm việc')
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
                    Rảnh
                </button>
                <button
                    onClick={() => setTool('BUSY')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tool === 'BUSY' ? 'border-rose-400 text-rose-300 bg-rose-500/10' : 'border-zinc-700 text-zinc-400 hover:border-rose-400/40'}`}
                >
                    Bận
                </button>
                <button
                    onClick={() => setTool('TENTATIVE')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${tool === 'TENTATIVE' ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-zinc-700 text-zinc-400 hover:border-amber-400/40'}`}
                >
                    Bận tạm
                </button>
                <span className="text-xs text-zinc-500 ml-auto">{isPending ? 'Đang lưu...' : 'Kéo để tô lịch'}</span>
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
                <div className="min-w-max grid grid-cols-[120px_repeat(24,minmax(40px,1fr))] gap-0">
                    <div className="sticky left-0 z-20 bg-zinc-950/80 backdrop-blur border-r border-zinc-800 flex items-center px-3 text-xs font-semibold text-zinc-400">
                        Giờ
                    </div>
                    {Array.from({ length: 24 }).map((_, hour) => (
                        <div
                            key={`hour-${hour}`}
                            className={`h-10 border-b border-r border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-center ${hour === currentHour && dateKey === todayKey ? 'bg-white/5 text-white ring-1 ring-white/10 shadow-[0_0_12px_rgba(255,255,255,0.15)]' : ''}`}
                        >
                            {hour}:00
                        </div>
                    ))}

                    <div className="sticky left-0 z-10 bg-zinc-950/90 backdrop-blur border-r border-zinc-800 flex items-center px-3 text-xs font-semibold text-zinc-300">
                        Lịch hôm nay
                    </div>
                    {schedule.map((status, index) => {
                        const locked = isCellLocked(index)
                        const isCurrent = index === currentHour && dateKey === todayKey
                        const isHovering = hoverIndex === index
                        return (
                            <div
                                key={`cell-${index}`}
                                onMouseDown={() => handleMouseDown(index)}
                                onMouseEnter={() => handleMouseEnter(index)}
                                onMouseLeave={() => setHoverIndex(null)}
                                className={`h-12 border-b border-r border-zinc-800 select-none ${STATUS_CLASS[status]} ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isCurrent ? 'ring-1 ring-white/10 shadow-[0_0_14px_rgba(255,255,255,0.18)]' : ''} ${isDragging && isHovering ? 'shadow-[0_0_18px_rgba(255,255,255,0.22)]' : ''}`}
                                title={`${index}:00 â€¢ ${STATUS_LABEL[status]}`}
                            />
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
