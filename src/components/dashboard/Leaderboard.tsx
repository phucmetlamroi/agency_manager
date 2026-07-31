import { getWorkspacePrisma } from "@/lib/prisma-workspace"
import { unstable_cache } from "next/cache"
import { SALARY_PENDING_STATUSES } from "@/lib/task-statuses"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import RefreshLeaderboardButton from "./RefreshLeaderboardButton"
import { Trophy, ChevronDown } from "lucide-react"

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
            // [L17] displayName/nickname were NOT selected → the nice-name fallback below was dead
            // code and every podium entry collapsed to the raw `username` (a legacy g_… handle for
            // some accounts). Fetch them so real names resolve.
            select: { id: true, username: true, displayName: true, nickname: true, avatarUrl: true }
        })

        // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bảng vàng nay xếp THUẦN THEO DOANH THU.
        //
        // Trước đây chỗ này là bản sao THỨ BA của phép chấm hạng tự tính, và khác hai chỗ kia ở
        // một điểm QUAN TRỌNG: nó KHÔNG chỉ hiển thị mà còn dùng để SẮP XẾP. Khoá chính là
        // `incomeScore = doanh thu - điểm phạt`, rồi phá hoà bằng errorRate và rankScore. Tức là
        // ở đây điểm phạt CÓ THẬT SỰ kéo tụt thứ hạng của người ta — khác với bảng thưởng, nơi
        // điểm phạt chưa bao giờ đụng tới.
        //
        // Nay bỏ hết theo quyết định của chủ dự án: xếp theo doanh thu, phá hoà bằng số task rồi
        // tên — CHÍNH XÁC cùng vị ngữ với `calculateMonthlyBonus`, nên bảng vàng và bảng thưởng
        // từ nay không thể xếp khác thứ tự nhau nữa.
        const rawData = users.map(u => {
            const taskCount = completedTasksAggregate.find(t => t.assigneeId === u.id)?._count.id || 0
            const revenue = Number(completedTasksAggregate.find(t => t.assigneeId === u.id)?._sum.value || 0)

            const pendingRevenue = Number(pendingTasksAggregate.find((p: any) => p.assigneeId === u.id)?._sum.value || 0)
            const tentativeRevenue = revenue + pendingRevenue

            return {
                id: u.id,
                // [L17] Nice display name (never email): displayName → nickname → username handle.
                username: (u as any).displayName?.trim() || (u as any).nickname?.trim() || u.username,
                taskCount,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                avatarUrl: u.avatarUrl
            }
        })

        // Doanh thu (giảm) → số task hoàn tất (giảm) → tên (tăng, cho ổn định).
        return rawData.sort((a, b) => {
            if (Math.abs(b.revenue - a.revenue) > 0.01) return b.revenue - a.revenue
            if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount
            return a.username.localeCompare(b.username, 'vi')
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
    const { prisma } = await import("@/lib/db")
    const session = await getSession()
    const profileId = (session?.user as any)?.sessionProfileId
    const leaderboard = await getLeaderboardData(workspaceId, profileId)

    // Workspace-scoped admin check for refresh button visibility
    const isGlobalAdmin = session?.user?.role === 'ADMIN'
    let isWorkspaceAdmin = isGlobalAdmin
    if (!isGlobalAdmin && session?.user?.id) {
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
            select: { role: true },
        })
        isWorkspaceAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN'
    }

    const top3 = leaderboard.slice(0, 3)

    // Podium order: 2nd (left), 1st (center), 3rd (right)
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean)

    // Bar config per placement — heights proportional like Figma
    const barConfig: Record<number, { height: string; bg: string; ringCls: string; fallbackBg: string; label: string }> = {
        0: {
            height: 'h-[100px]',
            bg: 'bg-[#4C1D95]',
            ringCls: 'ring-2 ring-primary/50',
            fallbackBg: 'bg-gradient-to-br from-primary to-[#4C1D95]',
            label: '2',
        },
        1: {
            height: 'h-[120px]',
            bg: 'bg-primary',
            ringCls: 'ring-2 ring-primary-accent',
            fallbackBg: 'bg-gradient-to-br from-primary-accent to-primary',
            label: '1',
        },
        2: {
            height: 'h-[80px]',
            bg: 'bg-[#211B31]',
            ringCls: 'ring-2 ring-[#4C1D95]/50',
            fallbackBg: 'bg-gradient-to-br from-primary to-[#4C1D95]',
            label: '3',
        },
    }

    return (
        <div
            className="relative overflow-hidden rounded-[26px] bg-surface-0 border border-[rgba(139,92,246,0.15)] shadow-2xl shadow-black/60 flex flex-col h-full"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
            {/* ===== HEADER ===== */}
            <div className="relative z-10 px-5 pt-5 pb-2 flex items-start justify-between">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-lg font-bold text-white leading-tight tracking-tight">
                        Xếp hạng
                    </h3>
                    <span className="text-xs text-[#A1A1AA]">Workspace này</span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[rgba(139,92,246,0.15)] text-[11px] font-medium text-[#A1A1AA] select-none">
                        Tuần này
                        <ChevronDown className="w-3 h-3 text-[#A1A1AA]/70" />
                    </span>
                    <RefreshLeaderboardButton isAdmin={isWorkspaceAdmin} />
                </div>
            </div>

            {/* ===== BODY — only top 3 podium ===== */}
            <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-5">
                {leaderboard.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#A1A1AA] py-10">
                        <Trophy className="w-10 h-10 text-[#4C1D95] mb-3" />
                        <p className="text-sm">Chưa có đủ dữ liệu xếp hạng.</p>
                    </div>
                ) : (
                    <div className="flex items-end justify-center gap-4">
                        {podiumOrder.map((person, idx) => {
                            if (!person) return null
                            const cfg = barConfig[idx]
                            return (
                                <div key={person.id} className="flex flex-col items-center flex-1">
                                    {/* Avatar */}
                                    <Avatar className={`h-11 w-11 ${cfg.ringCls} border-2 border-surface-0 mb-2`}>
                                        <AvatarImage
                                            src={person.avatarUrl || `https://avatar.vercel.sh/${person.username}`}
                                            className="object-cover"
                                        />
                                        <AvatarFallback className={`${cfg.fallbackBg} text-white text-sm font-bold`}>
                                            {person.username[0]}
                                        </AvatarFallback>
                                    </Avatar>

                                    {/* Name */}
                                    <span className="text-[13px] font-semibold truncate w-full text-center mb-2 text-white">
                                        {person.username}
                                    </span>

                                    {/* Bar pedestal */}
                                    <div
                                        className={`w-full ${cfg.height} ${cfg.bg} rounded-t-[20px] rounded-b-[6px] relative flex items-center justify-center`}
                                    >
                                        <span className="text-white/80 text-2xl font-extrabold select-none">
                                            {cfg.label}
                                        </span>
                                        {idx === 1 && (
                                            <div className="absolute inset-0 rounded-t-[20px] rounded-b-[6px] bg-gradient-to-t from-transparent to-white/[0.08] pointer-events-none" />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
