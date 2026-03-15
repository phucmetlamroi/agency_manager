import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-guard'
import { getMyAvailabilityWeek } from '@/actions/availability-actions'
import AvailabilityScheduleClient from '@/components/schedule/AvailabilityScheduleClient'
import { getVietnamDateKey } from '@/lib/date-utils'

export const dynamic = 'force-dynamic'

export default async function SchedulePage({
    params,
    searchParams
}: {
    params: Promise<{ workspaceId: string }>
    searchParams?: Promise<{ date?: string }>
}) {
    const { workspaceId } = await params
    const query = await searchParams
    const user = await getCurrentUser()

    if (user.role === 'CLIENT') {
        redirect('/portal/en')
    }

    const dateKey = query?.date || getVietnamDateKey()
    const data = await getMyAvailabilityWeek(dateKey, workspaceId)
    
    if ('error' in data) {
        return (
            <div className="p-8 text-center glass-panel">
                <h2 className="text-xl font-bold text-rose-500 mb-2">Đã xảy ra lỗi hệ thống</h2>
                <p className="text-zinc-400">{(data as any).error}</p>
            </div>
        )
    }

    const weekStartKey = 'weekStartKey' in data ? data.weekStartKey : dateKey
    const days = 'days' in data ? data.days : []

    return (
        <div className="h-full flex flex-col p-0">
            <AvailabilityScheduleClient
                workspaceId={workspaceId}
                dateKey={weekStartKey}
                weekStartKey={weekStartKey}
                days={days}
            />
        </div>
    )
}
