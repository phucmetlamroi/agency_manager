import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { unstable_cache } from "next/cache"
import { SALARY_PENDING_STATUSES } from "@/lib/task-statuses"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import RefreshLeaderboardButton from "./RefreshLeaderboardButton"
import { Trophy, Crown } from "lucide-react"

// Caching leaderboard for 15 minutes (900 seconds) 
// To avoid continuous live queries which overload CPU DB
export const getLeaderboardData = unstable_cache(
    async (workspaceId: string, profileId?: string) => {
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        // Fetch completed tasks aggregation by assignee
        // Included 'Revision' to match Analytics logic and removed hardcoded Month filter 
        // to respect Workspace context isolation.
        const completedTasksAggregate = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                status: { in: ['Hoàn tất', 'Revision'] },
                assigneeId: { not: null }
            },
            _count: { id: true },
            _sum: { value: true }
        })

        const pendingTasksAggregate = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                status: { in: SALARY_PENDING_STATUSES },
                assigneeId: { not: null }
            },
            _sum: { value: true }
        })

        // Fetch sum of penalties by user
        const errorLogsAggregate = await (workspacePrisma as any).errorLog.groupBy({
            by: ['userId'],
            _sum: { calculatedScore: true }
        })

        const userIds = Array.from(new Set([
            ...completedTasksAggregate.map(t => t.assigneeId as string),
            ...errorLogsAggregate.map((e: any) => e.userId),
            ...pendingTasksAggregate.map((p: any) => p.assigneeId as string)
        ]))

        if (userIds.length === 0) return []

        const users = await workspacePrisma.user.findMany({
            where: { id: { in: userIds }, role: 'USER' },
            select: { id: true, username: true }
        })

        // Combine data and calculate Error Rate & Rank
        const rawData = users.map(u => {
            const taskCount = completedTasksAggregate.find(t => t.assigneeId === u.id)?._count.id || 0
            const revenue = Number(completedTasksAggregate.find(t => t.assigneeId === u.id)?._sum.value || 0)
            const totalPenalty = errorLogsAggregate.find((e: any) => e.userId === u.id)?._sum.calculatedScore || 0
           
            const pendingRevenue = Number(pendingTasksAggregate.find((p: any) => p.assigneeId === u.id)?._sum.value || 0)
            const tentativeRevenue = revenue + pendingRevenue
            // Sync with Analytics logic: if 0 tasks but errors exist, highlight it
            const errorRate = taskCount > 0 ? Number((totalPenalty / taskCount).toFixed(2)) : (totalPenalty > 0 ? totalPenalty : 0)
            
            let rank = 'S' 
            if (taskCount >= 8) {
                 if (errorRate < 0.3) rank = 'S'
                 else if (errorRate < 0.6) rank = 'A'
                 else if (errorRate < 1.0) rank = 'B'
                 else if (errorRate < 1.5) rank = 'C'
                 else rank = 'D'
            } else if (taskCount > 0) {
                 if (errorRate < 1.0) rank = 'N/A'
                 else rank = 'D'
            } else if (totalPenalty > 0) {
                 rank = 'D'
            } else {
                 rank = 'N/A'
            }

            // Calculate Score for sorting. 
            // Better rank, higher revenue, lower error rate
            let rankScore = 0
            if (rank === 'S') rankScore = 5
            if (rank === 'A') rankScore = 4
            if (rank === 'B') rankScore = 3
            if (rank === 'C') rankScore = 2
            if (rank === 'D') rankScore = 1

            const incomeScore = Math.max(0, tentativeRevenue - totalPenalty)

            return {
                id: u.id,
                username: u.username,
                taskCount,
                errorRate,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                rank,
                rankScore,
                incomeScore
            }
        })

        // Sort by Net Income (desc) -> Error Rate (asc) -> Rank -> Revenue -> Task Count
        return rawData.sort((a, b) => {
            if (b.incomeScore !== a.incomeScore) return b.incomeScore - a.incomeScore
            if (a.errorRate !== b.errorRate) return a.errorRate - b.errorRate
            if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore
            if (b.revenue !== a.revenue) return b.revenue - a.revenue
            return b.taskCount - a.taskCount
        }).slice(0, 10) // Top 10
    },
    ['leaderboard-v2'],
    { 
        revalidate: 86400, // 24 hours (manual only practically)
        tags: ['leaderboard']
    }
)

export default async function Leaderboard({ workspaceId }: { workspaceId: string }) {
    const { getSession } = await import("@/lib/auth")
    const session = await getSession()
    const profileId = (session?.user as any)?.sessionProfileId
    const leaderboard = await getLeaderboardData(workspaceId, profileId)

    const getRankColor = (rank: string) => {
        if (rank === 'S') return 'from-yellow-400 to-purple-500 text-yellow-500 border-yellow-500/50 bg-yellow-500/10'
        if (rank === 'A') return 'from-green-400 to-emerald-500 text-green-400 border-green-500/50 bg-green-500/10'
        if (rank === 'B') return 'from-blue-400 to-cyan-500 text-blue-400 border-blue-500/50 bg-blue-500/10'
        if (rank === 'C') return 'from-orange-400 to-amber-500 text-orange-400 border-orange-500/50 bg-orange-500/10'
        if (rank === 'D') return 'from-red-500 to-rose-600 text-red-500 border-red-500/50 bg-red-500/10'
        return 'text-zinc-500 border-zinc-700 bg-zinc-800'
    }

    const top3 = leaderboard.slice(0, 3)
    const rest = leaderboard.slice(3)

    return (
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950/60 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/50 flex flex-col h-full">
            {/* Ambient Glow */}
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-500/8 blur-3xl rounded-full pointer-events-none" />

            <div className="relative z-10 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-lg text-zinc-100 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                        Bảng Xếp Hạng Tháng
                    </h3>
                    <RefreshLeaderboardButton isAdmin={session?.user?.role === 'ADMIN'} />
                </div>

                {leaderboard.length === 0 ? (
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-zinc-500 py-10">
                    <Trophy className="w-12 h-12 text-zinc-700 mb-3" />
                    <p className="text-sm">Chưa có đủ dữ liệu xếp hạng tháng này.</p>
                </div>
            ) : (
                <div className="relative z-10 flex-1 flex flex-col">
                    {/* PODIUM TOP 3 */}
                    {top3.length > 0 && (
                        <div className="flex items-end justify-center gap-2 md:gap-4 mb-8 pt-4">
                            {/* TOP 2 */}
                            {top3[1] && (
                                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                                    <div className="relative mb-2">
                                        <Avatar className={`h-12 w-12 md:h-16 md:w-16 border-2 ${getRankColor(top3[1].rank).split(' ')[1]} ring-2 ring-zinc-700/50`}>
                                            <AvatarImage src={`https://avatar.vercel.sh/${top3[1].username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[1].username[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-2 -right-2 bg-zinc-800 border border-zinc-600 text-zinc-300 text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">2</div>
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200 truncate w-full text-center">{top3[1].username}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 font-mono border ${getRankColor(top3[1].rank).split(' ').slice(2).join(' ')}`}>
                                        {top3[1].rank}
                                    </span>
                                    <div className="w-full h-24 bg-gradient-to-t from-zinc-800/80 to-zinc-800/20 rounded-t-xl mt-3 border-t-2 border-zinc-600/50 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-white/[0.03]"></div>
                                    </div>
                                </div>
                            )}

                            {/* TOP 1 - Crown & Glow */}
                            <div className="flex flex-col items-center flex-1 max-w-[140px] z-10">
                                <Crown className="w-7 h-7 mb-1 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)] animate-pulse" />
                                <div className="relative mb-2">
                                    <div className="absolute inset-0 rounded-full bg-yellow-400/25 blur-xl scale-125" />
                                    <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-yellow-400/70 shadow-[0_0_30px_rgba(234,179,8,0.5)] relative z-10">
                                        <AvatarImage src={`https://avatar.vercel.sh/${top3[0].username}`} />
                                        <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[0].username[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-yellow-400 to-amber-500 border-2 border-yellow-300 text-black text-sm font-black w-8 h-8 flex items-center justify-center rounded-full shadow-lg z-10">1</div>
                                </div>
                                <span className="text-base font-black bg-gradient-to-r from-yellow-200 to-yellow-500 bg-clip-text text-transparent truncate w-full text-center drop-shadow">{top3[0].username}</span>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full mt-1 font-bold font-mono border shadow-sm ${getRankColor(top3[0].rank).split(' ').slice(2).join(' ')}`}>
                                    {top3[0].rank}
                                </span>
                                <div className="w-full h-32 bg-gradient-to-t from-yellow-900/50 to-yellow-600/10 rounded-t-xl mt-3 border-t-2 border-yellow-500/60 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-yellow-400/15 to-transparent"></div>
                                </div>
                            </div>

                            {/* TOP 3 */}
                            {top3[2] && (
                                <div className="flex flex-col items-center flex-1 max-w-[120px]">
                                    <div className="relative mb-2">
                                        <Avatar className={`h-12 w-12 md:h-16 md:w-16 border-2 ${getRankColor(top3[2].rank).split(' ')[1]} ring-2 ring-purple-600/30`}>
                                            <AvatarImage src={`https://avatar.vercel.sh/${top3[2].username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[2].username[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-purple-700/50 text-purple-300 text-xs font-black w-6 h-6 flex items-center justify-center rounded-full">3</div>
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200 truncate w-full text-center">{top3[2].username}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 font-mono border ${getRankColor(top3[2].rank).split(' ').slice(2).join(' ')}`}>
                                        {top3[2].rank}
                                    </span>
                                    <div className="w-full h-20 bg-gradient-to-t from-purple-900/30 to-purple-800/10 rounded-t-lg mt-3 border-t-2 border-purple-700/40 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-white/[0.03]"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LIST VIEW 4-10 */}
                    {rest.length > 0 && (
                        <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                            {rest.map((r, i) => (
                                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-800/50 hover:border-white/10 transition-all duration-300 group">
                                    <div className="flex items-center gap-3">
                                        <span className="text-zinc-600 font-mono font-bold w-5 text-right text-sm">{i + 4}</span>
                                        <Avatar className="h-8 w-8 border border-white/5">
                                            <AvatarImage src={`https://avatar.vercel.sh/${r.username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs">{r.username[0]}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">{r.username}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:block text-right">
                                            <div className="text-[10px] text-zinc-600 font-mono">{r.errorRate}% err</div>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-lg font-bold font-mono border ${getRankColor(r.rank).split(' ').slice(2).join(' ')}`}>
                                            {r.rank}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            </div>
        </div>
    )
}
