import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { unstable_cache } from "next/cache"
import { SALARY_PENDING_STATUSES } from "@/lib/task-statuses"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Caching leaderboard for 15 minutes (900 seconds) 
// To avoid continuous live queries which overload CPU DB
export const getLeaderboardData = unstable_cache(
    async (workspaceId: string) => {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const now = new Date()
        const currentMonth = now.getMonth() + 1
        const currentYear = now.getFullYear()

        const thisMonthStart = new Date(currentYear, currentMonth - 1, 1)
        const thisMonthEnd = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

        // Fetch completed tasks aggregation by assignee for this month
        const completedTasksAggregate = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                status: 'Hoàn tất',
                assigneeId: { not: null },
                updatedAt: { gte: thisMonthStart, lte: thisMonthEnd }
            },
            _count: { id: true },
            _sum: { value: true }
        })

        const pendingTasksAggregate = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                status: { in: SALARY_PENDING_STATUSES },
                assigneeId: { not: null },
                updatedAt: { gte: thisMonthStart, lte: thisMonthEnd }
            },
            _sum: { value: true }
        })

        // Fetch sum of penalties by user for this month
        const errorLogsAggregate = await (workspacePrisma as any).errorLog.groupBy({
            by: ['userId'],
            where: {
                createdAt: { gte: thisMonthStart, lte: thisMonthEnd }
            },
            _sum: { calculatedScore: true }
        })

        const userIds = Array.from(new Set([
            ...completedTasksAggregate.map(t => t.assigneeId as string),
            ...errorLogsAggregate.map((e: any) => e.userId),
            ...pendingTasksAggregate.map((p: any) => p.assigneeId as string)
        ]))

        if (userIds.length === 0) return []

        const users = await workspacePrisma.user.findMany({
            where: { id: { in: userIds }, role: { notIn: ['LOCKED', 'CLIENT'] } },
            select: { id: true, username: true, reputation: true }
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
    ['leaderboard-cache'], 
    { revalidate: 900 } // 15 mins
)

export default async function Leaderboard({ workspaceId }: { workspaceId: string }) {
    const leaderboard = await getLeaderboardData(workspaceId)

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
        <div className="glass-panel p-6 bg-zinc-950/80 border border-zinc-800/80 rounded-2xl shadow-xl flex flex-col h-full relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none"></div>

            <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <span className="text-2xl">🏆</span> Bảng Xếp Hạng Tháng
                </h3>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-900 px-2 py-1 rounded-full border border-zinc-800">Cập nhật lúc: {new Date().toLocaleTimeString('vi-VN')}</span>
            </div>

            {leaderboard.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-10">
                    <span className="text-4xl mb-3">😴</span>
                    <p>Chưa có đủ dữ liệu xếp hạng tháng này.</p>
                </div>
            ) : (
                <div className="flex-1 flex flex-col relative z-10">
                    {/* PODIUM TOP 3 */}
                    {top3.length > 0 && (
                        <div className="flex items-end justify-center gap-2 md:gap-4 mb-8 pt-4">
                            {/* TOP 2 */}
                            {top3[1] && (
                                <div className="flex flex-col items-center animate-in slide-in-from-bottom flex-1 max-w-[120px]">
                                    <div className="relative mb-2">
                                        <Avatar className={`h-12 w-12 md:h-16 md:w-16 border-2 shadow-[0_0_15px_rgba(250,204,21,0.3)] ${getRankColor(top3[1].rank).split(' ')[1]}`}>
                                            <AvatarImage src={`https://avatar.vercel.sh/${top3[1].username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[1].username[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full">2</div>
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200 truncate w-full text-center">{top3[1].username}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 font-mono border ${getRankColor(top3[1].rank).split(' ').slice(2).join(' ')}`}>
                                        {top3[1].rank}
                                    </span>
                                    <div className="w-full h-24 bg-gradient-to-t from-zinc-800 to-zinc-800/50 rounded-t-lg mt-3 border-t-2 border-zinc-600/50 flex flex-col items-center justify-end pb-2 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-white/5"></div>
                                        {/* Sensitive info removed */}
                                    </div>
                                </div>
                            )}

                            {/* TOP 1 */}
                            <div className="flex flex-col items-center animate-in slide-in-from-bottom zoom-in-95 flex-1 max-w-[140px] z-10">
                                <span className="text-3xl mb-1 drop-shadow-lg animate-bounce duration-1000">👑</span>
                                <div className="relative mb-2">
                                    <Avatar className={`h-16 w-16 md:h-20 md:w-20 border-4 shadow-[0_0_25px_rgba(234,179,8,0.5)] ${getRankColor(top3[0].rank).split(' ')[0]}`}>
                                        <AvatarImage src={`https://avatar.vercel.sh/${top3[0].username}`} />
                                        <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[0].username[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-yellow-400 to-yellow-600 border border-yellow-300 text-black text-sm font-black w-8 h-8 flex items-center justify-center rounded-full shadow-lg">1</div>
                                </div>
                                <span className="text-base font-black bg-gradient-to-r from-yellow-200 to-yellow-500 bg-clip-text text-transparent truncate w-full text-center">{top3[0].username}</span>
                                <span className={`text-xs px-2.5 py-0.5 rounded-full mt-1 font-bold font-mono border shadow-sm ${getRankColor(top3[0].rank).split(' ').slice(2).join(' ')}`}>
                                    {top3[0].rank}
                                </span>
                                <div className="w-full h-32 bg-gradient-to-t from-yellow-900/40 to-yellow-600/20 rounded-t-xl mt-3 border-t-2 border-yellow-500/50 flex flex-col items-center justify-end pb-2 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-b from-yellow-400/10 to-transparent"></div>
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:10px_10px]"></div>
                                    {/* Sensitive info removed */}
                                </div>
                            </div>

                            {/* TOP 3 */}
                            {top3[2] && (
                                <div className="flex flex-col items-center animate-in slide-in-from-bottom flex-1 max-w-[120px]">
                                    <div className="relative mb-2">
                                        <Avatar className={`h-12 w-12 md:h-16 md:w-16 border-2 shadow-[0_0_15px_rgba(139,92,246,0.3)] ${getRankColor(top3[2].rank).split(' ')[1]}`}>
                                            <AvatarImage src={`https://avatar.vercel.sh/${top3[2].username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-300">{top3[2].username[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="absolute -bottom-2 -right-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full">3</div>
                                    </div>
                                    <span className="text-sm font-bold text-zinc-200 truncate w-full text-center">{top3[2].username}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 font-mono border ${getRankColor(top3[2].rank).split(' ').slice(2).join(' ')}`}>
                                        {top3[2].rank}
                                    </span>
                                    <div className="w-full h-20 bg-gradient-to-t from-zinc-800 to-zinc-800/40 rounded-t-lg mt-3 border-t-2 border-zinc-700/50 flex flex-col items-center justify-end pb-2 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-white/5"></div>
                                        {/* Sensitive info removed */}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LIST VIEW 4-10 */}
                    {rest.length > 0 && (
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                            {rest.map((r, i) => (
                                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/30 border border-white/5 hover:bg-zinc-900/60 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <span className="text-zinc-600 font-mono font-bold w-4 text-right">{i + 4}</span>
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={`https://avatar.vercel.sh/${r.username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-xs">{r.username[0]}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm font-medium text-zinc-300">{r.username}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:block text-right">
                                            <div className="text-[10px] text-zinc-600">{r.errorRate}% err</div>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded font-bold font-mono border ${getRankColor(r.rank).split(' ').slice(2).join(' ')}`}>
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
    )
}
