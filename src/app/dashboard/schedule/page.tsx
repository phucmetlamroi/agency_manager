import { getMySchedule } from '@/actions/schedule-actions'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import { startOfWeek, endOfWeek, addDays } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
    // Default fetch: Current week + Next week? 
    // Or just fetch specific range. For now, let's fetch -1 month to +1 month to be safe for navigation.
    const now = new Date()
    const start = addDays(now, -30)
    const end = addDays(now, 30)

    const res = await getMySchedule(start, end)
    const schedules = res.data || []

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col p-4 md:p-6 gap-4">
            <header>
                <h1 className="text-2xl font-bold text-white">Lịch làm việc</h1>
                <p className="text-gray-400 text-sm">Đăng ký lịch bận/rảnh để Admin sắp xếp công việc hợp lý.</p>
            </header>

            <div className="flex-1 min-h-0">
                <ScheduleGrid userId="" initialSchedule={schedules} />
            </div>
        </div>
    )
}
