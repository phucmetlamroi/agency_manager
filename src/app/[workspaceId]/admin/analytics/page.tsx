import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AnalyticsTable from '@/components/admin/analytics/AnalyticsTable'
import { getAnalyticsData } from '@/actions/analytics-actions'
import LivePresenceBoard from '@/components/admin/analytics/LivePresenceBoard'

export default async function AdminAnalyticsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') redirect('/login')

    const { workspaceId } = await params

    const analyticsData = await getAnalyticsData(workspaceId)

    return (
        <div className="h-full flex flex-col p-6 w-full max-w-[1700px] mx-auto space-y-6">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent drop-shadow-sm">
                        Performance Analytics
                    </h1>
                    <p className="text-zinc-400 text-sm mt-2">
                        Bảng thống kê hiệu suất, tỉ lệ lỗi và xếp hạng nhân sự dựa trên Gamification (TanStack Data Grid).
                    </p>
                </div>
                <div className="flex items-center gap-4 text-sm font-mono text-zinc-300 bg-zinc-900/80 p-3 px-6 rounded-2xl border border-white/5 shadow-inner">
                    <span>Tổng Nhân Sự Đánh Giá: <strong className="text-indigo-400">{analyticsData.length}</strong></span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0">
                {/* Statistics Table - Take 3/4 width */}
                <div className="xl:col-span-3 min-h-[500px]">
                    <AnalyticsTable data={analyticsData} workspaceId={workspaceId} />
                </div>

                {/* Live Presence - Take 1/4 width */}
                <div className="xl:col-span-1 h-full min-h-[500px]">
                    <LivePresenceBoard />
                </div>
            </div>
        </div>
    )
}
