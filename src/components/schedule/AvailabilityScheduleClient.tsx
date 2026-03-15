'use client'

import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import AvailabilityWeekEditor from '@/components/schedule/AvailabilityWeekEditor'
import { addVietnamDays, getVietnamDateKey } from '@/lib/date-utils'
import { ChevronLeft, ChevronRight, Calendar, Paintbrush, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'

type AvailabilityStatus = 'EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE'

type Props = {
    workspaceId: string
    dateKey: string
    weekStartKey: string
    days: { dateKey: string; schedule: string[] }[]
}

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`)

export default function AvailabilityScheduleClient({ workspaceId, dateKey, weekStartKey, days }: Props) {
    const router = useRouter()
    const [activeTool, setActiveTool] = useState<AvailabilityStatus>('FREE')

    const handleShiftWeek = (deltaWeeks: number) => {
        const nextKey = addVietnamDays(weekStartKey, deltaWeeks * 7)
        router.push(`/${workspaceId}/dashboard/schedule?date=${nextKey}`)
    }

    const handleToday = () => {
        const todayKey = getVietnamDateKey()
        router.push(`/${workspaceId}/dashboard/schedule?date=${todayKey}`)
    }

    const weekEndKey = addVietnamDays(weekStartKey, 6)
    const weekRangeStr = `${format(toDate(weekStartKey), 'dd/MM')} - ${format(toDate(weekEndKey), 'dd/MM/yyyy')}`

    return (
        <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
            {/* Toolbar */}
            <div className="sticky top-0 z-30 p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex flex-wrap items-center gap-6 shadow-xl">
                {/* Navigation */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 border border-slate-700">
                        <button
                            onClick={() => handleShiftWeek(-1)}
                            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
                            title="Tuần trước"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="px-4 font-medium min-w-[180px] text-center text-sm">
                            Tuần: {weekRangeStr}
                        </div>
                        <button
                            onClick={() => handleShiftWeek(1)}
                            className="p-2 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
                            title="Tuần sau"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                    <button
                        onClick={handleToday}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Calendar className="w-4 h-4" />
                        Hôm nay
                    </button>
                </div>

                {/* Status Divider */}
                <div className="h-8 w-px bg-slate-800 hidden md:block" />

                {/* Status Brush Picker */}
                <div className="flex items-center gap-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Paintbrush className="w-3.5 h-3.5" />
                        Tool:
                    </div>
                    <div className="flex items-center gap-2 p-1 bg-slate-800/30 rounded-full border border-slate-800/50">
                        <button
                            onClick={() => setActiveTool('FREE')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                activeTool === 'FREE' 
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                                : 'text-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Rảnh
                        </button>
                        <button
                            onClick={() => setActiveTool('BUSY')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                activeTool === 'BUSY' 
                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' 
                                : 'text-rose-500/60 hover:text-rose-400 hover:bg-rose-500/10'
                            }`}
                        >
                            <XCircle className="w-3.5 h-3.5" />
                            Bận
                        </button>
                        <button
                            onClick={() => setActiveTool('TENTATIVE')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                activeTool === 'TENTATIVE' 
                                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30' 
                                : 'text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10'
                            }`}
                        >
                            <AlertCircle className="w-3.5 h-3.5" />
                            Bận tạm
                        </button>
                    </div>
                </div>
                
                <div className="ml-auto text-xs text-slate-500 bg-slate-800/20 px-3 py-1.5 rounded-md border border-slate-800">
                    Bấm & Kéo để bôi lịch
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden">
                <AvailabilityWeekEditor 
                    workspaceId={workspaceId} 
                    days={days as any} 
                    activeTool={activeTool}
                />
            </div>
        </div>
    )
}
