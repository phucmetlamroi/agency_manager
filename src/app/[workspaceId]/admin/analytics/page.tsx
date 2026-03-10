import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import DynamicDashboardGrid from '@/components/admin/analytics/DynamicDashboardGrid'
import { prisma } from '@/lib/db'

export default async function AdminAnalyticsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'ADMIN') redirect('/login')

    const { workspaceId } = await params

    // Pre-fetch basic analytics data here to pass as initial state
    // For now we'll fetch general metrics: 
    // Total Sessions, Total Events today.
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [sessionCount, eventCount] = await Promise.all([
        prisma.session.count({
            where: { startTime: { gte: today } }
        }),
        prisma.event.count({
            where: { createdAt: { gte: today } }
        })
    ])

    return (
        <div className="h-full flex flex-col p-6 w-full max-w-[1600px] mx-auto space-y-4">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Analytics Control Tower
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Real-time tracking of traffic, activity hotspots, and micro-interactions.
                    </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono text-zinc-400 bg-zinc-900/50 p-2 px-4 rounded-full border border-white/5">
                    <span>Sessions Today: <strong className="text-white">{sessionCount}</strong></span>
                    <span className="w-px h-3 bg-white/10" />
                    <span>Events Today: <strong className="text-white">{eventCount}</strong></span>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-zinc-950/20 rounded-xl overflow-hidden custom-scrollbar">
                <DynamicDashboardGrid initialData={{ sessionCount, eventCount }} />
            </div>
        </div>
    )
}
