import { getPerformanceReport } from '@/actions/performance-actions'
import { serializeDecimal } from '@/lib/serialization'
import PerformanceDashboardClient from '@/components/performance/PerformanceDashboardClient'

export default async function PerformancePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const today = new Date()
    const month = today.getMonth() + 1
    const year = today.getFullYear()

    const res = await getPerformanceReport(month, year, workspaceId)

    return (
        <div className="p-3 sm:p-6">
            <header className="mb-6 sm:mb-8 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-end">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 tracking-tight">
                        Hiệu suất nhân viên
                    </h1>
                    <p className="text-zinc-400 mt-1 sm:mt-2 text-sm">
                        Báo cáo Tháng {month}/{year}
                    </p>
                </div>
            </header>

            <PerformanceDashboardClient
                initialData={serializeDecimal(res.data || []) as any}
                month={month}
                year={year}
                workspaceId={workspaceId}
            />
        </div>
    )
}
