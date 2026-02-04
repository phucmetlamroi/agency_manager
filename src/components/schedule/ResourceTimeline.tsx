'use client'

import { useState } from 'react'
import { format, addDays, startOfDay, isSameDay } from 'date-fns'
import { vi } from 'date-fns/locale'

const HOURS = Array.from({ length: 17 }).map((_, i) => i + 7) // 7:00 - 23:00

type Schedule = {
    id: string
    startTime: Date
    endTime: Date
    type: string
    note?: string | null
    user: {
        nickname: string | null
        username: string
    }
}

const TYPE_COLORS: Record<string, string> = {
    BUSY: 'bg-red-500/50 border-red-500',
    OVERTIME: 'bg-yellow-500/50 border-yellow-500',
    AVAILABLE: 'bg-green-500/50 border-green-500',
    TASK: 'bg-blue-500/50 border-blue-500'
}

export default function ResourceTimeline({ schedules }: { schedules: any[] }) {
    const [viewDate, setViewDate] = useState(new Date())

    // Group schedules by User
    const usersMap = new Map<string, any>()
    schedules.forEach(s => {
        const userId = s.user.username // or ID
        if (!usersMap.has(userId)) {
            usersMap.set(userId, { info: s.user, blocks: [] })
        }
        usersMap.get(userId).blocks.push({
            ...s,
            startTime: new Date(s.startTime),
            endTime: new Date(s.endTime)
        })
    })

    const users = Array.from(usersMap.values())

    return (
        <div className="flex flex-col h-full bg-[#111] border border-[#333] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#1a1a1a]">
                <h2 className="font-bold text-white">Timeline Tổng quan</h2>
                <div className="flex gap-2">
                    <button onClick={() => setViewDate(addDays(viewDate, -1))} className="px-2 py-1 bg-[#333] rounded text-xs">Prev</button>
                    <span className="font-bold text-sm px-2 text-purple-300">
                        {format(viewDate, "EEEE, dd/MM", { locale: vi })}
                    </span>
                    <button onClick={() => setViewDate(addDays(viewDate, 1))} className="px-2 py-1 bg-[#333] rounded text-xs">Next</button>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto">
                <div className="min-w-[1200px]">
                    {/* Header Row */}
                    <div className="flex border-b border-[#333]">
                        <div className="w-[150px] shrink-0 p-2 bg-[#222] text-xs font-bold text-gray-400 sticky left-0 z-10 border-r border-[#333]">User</div>
                        {HOURS.map(h => (
                            <div key={h} className="flex-1 text-[10px] text-gray-500 text-center border-r border-[#333] p-1 bg-[#1a1a1a] min-w-[50px]">
                                {h}:00
                            </div>
                        ))}
                    </div>

                    {/* User Rows */}
                    {users.map((u, idx) => (
                        <div key={idx} className="flex border-b border-[#333] h-[50px] relative hover:bg-white/5">
                            <div className="w-[150px] shrink-0 p-2 text-sm text-gray-300 font-medium flex items-center bg-[#1a1a1a] sticky left-0 z-10 border-r border-[#333]">
                                {u.info.nickname || u.info.username}
                            </div>

                            <div className="flex-1 relative">
                                {/* Grid Lines */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {HOURS.map(h => (
                                        <div key={h} className="flex-1 border-r border-[#333/50]"></div>
                                    ))}
                                </div>

                                {/* Blocks */}
                                {u.blocks.filter((b: any) => isSameDay(b.startTime, viewDate)).map((b: any) => {
                                    const startHour = b.startTime.getHours() + (b.startTime.getMinutes() / 60)
                                    const endHour = b.endTime.getHours() + (b.endTime.getMinutes() / 60)

                                    // Calculate position relative to 7:00 start
                                    // Total hours displayed = 17 (7 to 24)
                                    const offset = Math.max(0, startHour - 7)
                                    const duration = Math.min(17 - offset, endHour - startHour)

                                    if (offset < 0 || duration <= 0) return null

                                    const leftPct = (offset / 17) * 100
                                    const widthPct = (duration / 17) * 100

                                    return (
                                        <div
                                            key={b.id}
                                            className={`absolute top-1 bottom-1 rounded border text-[10px] flex items-center justify-center overflow-hidden ${TYPE_COLORS[b.type] || 'bg-gray-500'}`}
                                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                            title={`${b.type} (${b.note || ''})`}
                                        >
                                            {b.note || b.type}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}

                    {users.length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic">Chưa có dữ liệu lịch làm việc cho ngày này.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
