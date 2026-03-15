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

    if (user.role !== 'ADMIN') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center glass-panel">
                <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse border border-indigo-500/20">
                    <span className="text-4xl">🚧</span>
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4 italic uppercase tracking-widest">
                    Tính năng đang phát triển
                </h2>
                <p className="text-zinc-400 max-w-md leading-relaxed font-medium">
                    Tính năng Lịch làm việc cho nhân sự hiện đang được nâng cấp để mang lại trải nghiệm tốt nhất. 
                    Vui lòng quay lại sau!
                </p>
                <div className="mt-8 flex gap-4">
                    <div className="px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700 text-xs text-slate-500 font-bold">
                        Đang bảo trì
                    </div>
                </div>
            </div>
        )
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
