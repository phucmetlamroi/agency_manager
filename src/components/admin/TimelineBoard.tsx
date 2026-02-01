'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { format, addDays, startOfDay, getHours, setHours, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { getAllSchedules, ScheduleType } from '@/actions/schedule-actions'

type ScheduleWithUser = {
    id: string
    userId: string
    startTime: Date
    endTime: Date
    type: ScheduleType
    note?: string
    user: {
        id: string
        username: string
        nickname: string | null
    }
}

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0:00 - 23:00

// Helper to calculate bar position
const getBarPosition = (start: Date, end: Date) => {
    // We assume the timeline is fixed 24h = 100% or Scrollable Fixed Width?
    // Let's use Fixed Width Scrollable: 24 columns of 60px = 1440px width.
    const hourWidth = 60 // px
    const startH = getHours(start) + (start.getMinutes() / 60)
    const endH = getHours(end) + (end.getMinutes() / 60)

    // Clamp to 0-24
    const clampedStart = Math.max(0, startH)
    const clampedEnd = Math.min(24, endH)

    const left = clampedStart * hourWidth
    const width = (clampedEnd - clampedStart) * hourWidth

    return { left, width }
}

const getBlockStyle = (type: ScheduleType) => {
    switch (type) {
        case 'BUSY': return 'bg-red-500/20 border-red-500/50 text-red-200'
        case 'OVERTIME': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-200'
        case 'AVAILABLE': return 'bg-green-500/20 border-green-500/50 text-green-200'
        case 'TASK': return 'bg-blue-500/20 border-blue-500/50 text-blue-200'
        default: return 'bg-gray-500/20'
    }
}

export default function TimelineBoard({ users }: { users: any[] }) {
    const [date, setDate] = useState(new Date())
    const [schedules, setSchedules] = useState<ScheduleWithUser[]>([])
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        const start = startOfDay(date)
        const end = setHours(start, 23)
        // Adjust End to End of Day properly (23:59:59)
        end.setMinutes(59)
        end.setSeconds(59)

        const res = await getAllSchedules(start, end)

        if (res.success && res.data) {
            // @ts-ignore
            const formatted: ScheduleWithUser[] = res.data.map(s => ({
                ...s,
                startTime: new Date(s.startTime),
                endTime: new Date(s.endTime)
            }))
            setSchedules(formatted)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 15000)
        return () => clearInterval(interval)
    }, [date])

    return (
        <div className="flex flex-col gap-4">
            {/* HEADER CONTROLS */}
            <div className="flex justify-between items-center mb-4 bg-white/5 p-4 rounded-xl border border-white/10">
                <div className="flex items-center gap-4">
                    <button onClick={() => setDate(d => addDays(d, -1))} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white">&lt;</button>
                    <span className="font-bold text-lg text-white w-48 text-center">{format(date, 'EEEE, dd/MM', { locale: vi })}</span>
                    <button onClick={() => setDate(d => addDays(d, 1))} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white">&gt;</button>
                </div>

                <div className="flex gap-4 text-xs font-medium">
                    <span className="flex items-center gap-2 px-2 py-1 bg-red-500/10 rounded border border-red-500/20 text-red-300">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span> Bận
                    </span>
                    <span className="flex items-center gap-2 px-2 py-1 bg-yellow-500/10 rounded border border-yellow-500/20 text-yellow-300">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span> OT
                    </span>
                    <span className="flex items-center gap-2 px-2 py-1 bg-green-500/10 rounded border border-green-500/20 text-green-300">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span> Rảnh
                    </span>
                    <span className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20 text-blue-300">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span> Task
                    </span>
                </div>
            </div>

            {/* TIMELINE CONTAINER */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#0f0f12]">
                {/* SCROLL WRAPPER */}
                <div className="w-full overflow-x-auto custom-scrollbar relative">
                    <div style={{ minWidth: '1600px', display: 'flex', flexDirection: 'column' }}>

                        {/* Time Header */}
                        <div className="flex border-b border-white/10 bg-white/5 sticky top-0 z-10 h-10">
                            <div className="w-48 sticky left-0 bg-[#151518] z-20 border-r border-white/10 p-2 text-sm font-bold text-gray-400 flex items-center">
                                Nhân viên
                            </div>
                            <div className="flex-1 relative h-full">
                                {HOURS.map(h => (
                                    <div key={h} className="absolute top-0 bottom-0 text-[10px] text-gray-500 border-l border-white/5 pl-1 flex items-center"
                                        style={{ left: `${h * 60}px`, width: '60px' }}>
                                        {h}:00
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* User Rows */}
                        <div className="flex flex-col">
                            {users.map(user => {
                                const userSchedules = schedules.filter(s => s.userId === user.id)
                                return (
                                    <div key={user.id} className="flex h-16 border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        {/* Sticky User Name */}
                                        <div className="w-48 sticky left-0 bg-[#0f0f12] group-hover:bg-[#1a1a1d] z-20 border-r border-white/10 p-3 flex items-center gap-2 transition-colors">
                                            <div className={`w-2 h-2 rounded-full ${userSchedules.find(s => {
                                                const now = new Date()
                                                if (!isSameDay(now, date)) return false
                                                return now >= s.startTime && now <= s.endTime && s.type === 'BUSY'
                                            }) ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                                            <div>
                                                <div className="font-bold text-sm text-gray-200">{user.nickname || user.username}</div>
                                                <div className="text-[10px] text-gray-500">@{user.username}</div>
                                            </div>
                                        </div>

                                        {/* Timeline Bar Area */}
                                        <div className="flex-1 relative h-full bg-[url('/grid-pattern.png')] bg-repeat">
                                            {/* Grid Lines */}
                                            {HOURS.map(h => (
                                                <div key={h} className="absolute top-0 bottom-0 border-l border-white/5 pointer-events-none"
                                                    style={{ left: `${h * 60}px` }} />
                                            ))}

                                            {/* Schedule Blocks */}
                                            {userSchedules.map(block => {
                                                const { left, width } = getBarPosition(block.startTime, block.endTime)
                                                if (width <= 0) return null

                                                return (
                                                    <motion.div
                                                        key={block.id}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`absolute top-2 bottom-2 rounded px-2 text-[10px] flex flex-col justify-center overflow-hidden border whitespace-nowrap cursor-help ${getBlockStyle(block.type)}`}
                                                        style={{ left: `${left}px`, width: `${width}px` }}
                                                        title={`${block.type} | ${format(block.startTime, 'HH:mm')} - ${format(block.endTime, 'HH:mm')} | ${block.note || ''}`}
                                                    >
                                                        <span className="font-bold">{block.type === 'BUSY' ? 'BẬN' : (block.type === 'OVERTIME' ? 'OT' : (block.type === 'AVAILABLE' ? 'RẢNH' : 'TASK'))}</span>
                                                        {width > 40 && block.note && <span className="opacity-70 truncate max-w-full text-[9px]">{block.note}</span>}
                                                    </motion.div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                    </div>
                </div>
            </div>
        </div>
    )
}
