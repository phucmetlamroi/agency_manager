import { getCompanySchedule } from '@/actions/schedule-actions'
import ResourceTimeline from '@/components/schedule/ResourceTimeline'
import { addDays } from 'date-fns'

export default async function AdminSchedulePage() {
    // Fetch wide range to allow client-side navigation without re-fetching too often?
    // Or fetch a reasonable window.
    const now = new Date()
    const start = addDays(now, -7)
    const end = addDays(now, 14)

    const res = await getCompanySchedule(start, end)

    return (
        <div className="p-6 h-[calc(100vh-50px)] flex flex-col gap-6">
            <header>
                <h1 className="text-3xl font-bold text-white">Lịch trình Nhân sự</h1>
                <p className="text-gray-400">Theo dõi Availability & Allocation của toàn bộ team.</p>
            </header>

            <div className="flex-1 min-h-0 glass-panel p-1">
                <ResourceTimeline schedules={res.data || []} />
            </div>
        </div>
    )
}
