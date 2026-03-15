'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import AvailabilityWeekEditor from '@/components/schedule/AvailabilityWeekEditor'
import { addVietnamDays, getVietnamDateKey } from '@/lib/date-utils'

type Props = {
    workspaceId: string
    dateKey: string
    weekStartKey: string
    days: { dateKey: string; schedule: string[] }[]
}

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`)

export default function AvailabilityScheduleClient({ workspaceId, dateKey, weekStartKey, days }: Props) {
    const router = useRouter()

    const handleShiftWeek = (deltaWeeks: number) => {
        const nextKey = addVietnamDays(weekStartKey, deltaWeeks * 7)
        router.push(`/${workspaceId}/dashboard/schedule?date=${nextKey}`)
    }

    const handleToday = () => {
        const todayKey = getVietnamDateKey()
        router.push(`/${workspaceId}/dashboard/schedule?date=${todayKey}`)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <div className="text-lg font-semibold text-white">
                    Lịch làm việc: {format(toDate(dateKey), 'dd/MM/yyyy')}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={() => handleShiftWeek(-1)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:border-zinc-600"
                    >
                        Hôm qua
                    </button>
                    <button
                        onClick={handleToday}
                        className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-200 hover:border-zinc-600"
                    >
                        Hôm nay
                    </button>
                    <button
                        onClick={() => handleShiftWeek(1)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:border-zinc-600"
                    >
                        Ngày mai
                    </button>
                </div>
            </div>

            <AvailabilityWeekEditor workspaceId={workspaceId} days={days} />
        </div>
    )
}
