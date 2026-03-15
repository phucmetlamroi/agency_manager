import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth-guard'
import { getMyAvailability } from '@/actions/availability-actions'
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
    const data = await getMyAvailability(dateKey, workspaceId)
    
    if ('error' in data) {
        return (
            <div className="p-8 text-center glass-panel">
                <h2 className="text-xl font-bold text-rose-500 mb-2">Đã xảy ra lỗi hệ thống</h2>
                <p className="text-zinc-400">{(data as any).error}</p>
            </div>
        )
    }

    const schedule = ('schedule' in data ? data.schedule : Array.from({ length: 24 }, () => 'EMPTY')) as string[]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-white">Lịch làm việc</h1>
                <p className="text-sm text-zinc-500">Kéo để cập nhật trạng thái rảnh/bận theo giờ.</p>
            </div>

            <AvailabilityScheduleClient
                workspaceId={workspaceId}
                dateKey={dateKey}
                initialSchedule={schedule}
            />
        </div>
    )
}
