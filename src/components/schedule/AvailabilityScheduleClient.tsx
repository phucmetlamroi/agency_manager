'use client'

import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'
import AvailabilityEditor from '@/components/schedule/AvailabilityEditor'
import { getVietnamDateKey } from '@/lib/date-utils'

type Props = {
    workspaceId: string
    dateKey: string
    initialSchedule: string[]
}

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`)

export default function AvailabilityScheduleClient({ workspaceId, dateKey, initialSchedule }: Props) {
    const router = useRouter()

    const handleShiftDate = (delta: number) => {
        const next = addDays(toDate(dateKey), delta)
        const nextKey = getVietnamDateKey(next)
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
                        onClick={() => handleShiftDate(-1)}
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
                        onClick={() => handleShiftDate(1)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:border-zinc-600"
                    >
                        Ngày mai
                    </button>
                </div>
            </div>

            <AvailabilityEditor
                workspaceId={workspaceId}
                dateKey={dateKey}
                initialSchedule={initialSchedule}
            />
        </div>
    )
}
