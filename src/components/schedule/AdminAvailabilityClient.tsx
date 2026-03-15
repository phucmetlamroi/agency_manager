'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { format } from 'date-fns'
import { addVietnamDays, getVietnamCurrentHour, getVietnamDateKey } from '@/lib/date-utils'
import AdminAvailabilityWeekMatrix from '@/components/schedule/AdminAvailabilityWeekMatrix'
import { ChevronLeft, ChevronRight, Calendar, Users, Info } from 'lucide-react'

type UserRow = {
    id: string
    username: string
    nickname: string | null
    role: any
    schedules: Record<string, any[]>
}

type Props = {
    workspaceId: string
    dateKey: string
    weekStartKey: string
    days: string[]
    users: UserRow[]
}

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`)

export default function AdminAvailabilityClient({ workspaceId, dateKey, weekStartKey, days, users }: Props) {
    const router = useRouter()
    const todayKey = getVietnamDateKey()
    const currentHour = getVietnamCurrentHour()
    const [selectedUserId, setSelectedUserId] = useState<string>('all')

    const handleShiftWeek = (deltaWeeks: number) => {
        const nextKey = addVietnamDays(weekStartKey, deltaWeeks * 7)
        router.push(`/${workspaceId}/admin/schedule?date=${nextKey}`)
    }

    const handleToday = () => {
        const nextKey = getVietnamDateKey()
        router.push(`/${workspaceId}/admin/schedule?date=${nextKey}`)
    }

    const weekEndKey = addVietnamDays(weekStartKey, 6)
    const weekRangeStr = `${format(toDate(weekStartKey), 'dd/MM')} - ${format(toDate(weekEndKey), 'dd/MM/yyyy')}`

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
            {/* Admin Toolbar */}
            <div className="sticky top-0 z-30 p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex flex-wrap items-center gap-6 shadow-xl">
                {/* Navigation */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700">
                        <button
                            onClick={() => handleShiftWeek(-1)}
                            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="px-4 font-medium min-w-[200px] text-center text-sm">
                            Tuần: {weekRangeStr}
                        </div>
                        <button
                            onClick={() => handleShiftWeek(1)}
                            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                    <button
                        onClick={handleToday}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold border border-slate-700 transition-all"
                    >
                        <Calendar className="w-4 h-4" />
                        Tuần này
                    </button>
                </div>

                <div className="h-8 w-px bg-slate-800 hidden lg:block" />

                {/* Staff Selection Dropdown */}
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        Lọc theo nhân sự:
                    </div>
                    <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 min-w-[180px]"
                    >
                        <option value="all">Tất cả nhân sự</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.nickname || u.username}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Legend & Stats */}
                <div className="ml-auto flex items-center gap-6">
                    <div className="flex items-center gap-4 bg-slate-800/30 px-4 py-2 rounded-xl border border-slate-800/50">
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span className="text-[10px] font-bold text-slate-400 capitalize whitespace-nowrap">Rảnh</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                            <span className="text-[10px] font-bold text-slate-400 capitalize whitespace-nowrap">Bận</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            <span className="text-[10px] font-bold text-slate-400 capitalize whitespace-nowrap">Bận tạm</span>
                        </div>
                    </div>
                    
                    <div className="h-6 w-px bg-slate-800 hidden xl:block" />

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-xs font-bold">
                        <Users className="w-3.5 h-3.5" />
                        {users.length} Nhân sự
                    </div>
                </div>
            </div>

            {/* Matrix Area */}
            <div className="flex-1 overflow-hidden p-0">
                <AdminAvailabilityWeekMatrix 
                    days={days} 
                    users={users} 
                    todayKey={todayKey} 
                    currentHour={currentHour} 
                    selectedUserId={selectedUserId}
                />
            </div>
        </div>
    )
}
