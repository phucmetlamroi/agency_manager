'use client'

import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'
import { getVietnamCurrentHour, getVietnamDateKey } from '@/lib/date-utils'
import AdminAvailabilityMatrix from '@/components/schedule/AdminAvailabilityMatrix'

type UserRow = {
    id: string
    username: string
    nickname: string | null
    role: string
    schedule: ('EMPTY' | 'FREE' | 'BUSY' | 'TENTATIVE')[]
}

type Props = {
    workspaceId: string
    dateKey: string
    users: UserRow[]
}

const toDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+07:00`)

export default function AdminAvailabilityClient({ workspaceId, dateKey, users }: Props) {
    const router = useRouter()
    const todayKey = getVietnamDateKey()
    const currentHour = dateKey === todayKey ? getVietnamCurrentHour() : -1

    const handleShiftDate = (delta: number) => {
        const next = addDays(toDate(dateKey), delta)
        const nextKey = getVietnamDateKey(next)
        router.push(`/${workspaceId}/admin/schedule?date=${nextKey}`)
    }

    const handleToday = () => {
        const nextKey = getVietnamDateKey()
        router.push(`/${workspaceId}/admin/schedule?date=${nextKey}`)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <div className="text-lg font-semibold text-white">
                    Lịch nhân sự: {format(toDate(dateKey), 'dd/MM/yyyy')}
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

            <AdminAvailabilityMatrix dateKey={dateKey} users={users} currentHour={currentHour} />
        </div>
    )
}
