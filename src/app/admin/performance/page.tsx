import { getPerformanceReport } from '@/actions/performance-actions'
import { serializeDecimal } from '@/lib/serialization'
import PerformanceDashboardClient from '@/components/performance/PerformanceDashboardClient'

export default async function PerformancePage() {
    const today = new Date()
    const month = today.getMonth() + 1
    const year = today.getFullYear()

    const res = await getPerformanceReport(month, year)

    return (
        <div className="p-6">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-green-400">
                        Employee Performance
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Báo cáo hiệu suất Tháng {month}/{year}
                    </p>
                </div>
                {/* Add Month Selector later if needed */}
            </header>

            <PerformanceDashboardClient
                initialData={serializeDecimal(res.data || []) as any}
                month={month}
                year={year}
            />
        </div>
    )
}
