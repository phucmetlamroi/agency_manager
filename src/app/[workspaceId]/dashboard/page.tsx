import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'
import { isMobileDevice } from '@/lib/device'
import Leaderboard from '@/components/dashboard/Leaderboard'
import { Suspense } from 'react'
import { serializeDecimal } from '@/lib/serialization'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { getUserPerformanceScore } from '@/actions/analytics-actions'
import {
    TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck,
    Clock, ListChecks, Flame, ArrowUp, ArrowDown, Zap
} from 'lucide-react'
import { MarketplaceProvider } from '@/components/marketplace/MarketplaceProvider'
import PendingInvitationsBanner from '@/components/workspace/PendingInvitationsBanner'

export const dynamic = 'force-dynamic'

export default async function UserDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const workspacePrisma = getWorkspacePrisma(workspaceId)
    const userId = session.user.id
    const userIsAdmin = session.user.role === 'ADMIN' || !!(session.user as any).isTreasurer

    // ── Data Fetching (workspace isolated) ──────────────────────
    const perfData = await getUserPerformanceScore(workspaceId, userId)

    const userWithBonus = await (workspacePrisma as any).user.findUnique({
        where: { id: userId },
        select: {
            id: true, username: true, role: true, nickname: true,
            bonuses: { where: { workspaceId } },
            payrolls: { where: { workspaceId } }
        }
    })

    // Note: ADMIN users can view the user dashboard via the "Switch to User View" button.
    // No automatic redirect — they can switch back to admin view from the sidebar.

    const tasks = await (workspacePrisma as any).task.findMany({
        where: { assigneeId: userId },
        include: {
            client: { include: { parent: true } },
            assignee: {
                select: {
                    id: true, username: true, role: true, nickname: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
                }
            },
            taskTags: { include: { tagCategory: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
    })

    // ── Marketplace task count ─────────────────────────────────
    const marketplaceCount = await (workspacePrisma as any).task.count({
        where: {
            assigneeId: null,
            isArchived: false,
        }
    })

    // ── Salary Calculations (workspace scoped) ─────────────────
    const pendingTasks = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const pendingSalary = pendingTasks.reduce((acc: number, t: any) => acc + Number(t.value || 0), 0)

    const completedTasks = tasks.filter((t: any) => t.status === 'Hoàn tất')
    
    // We display all workspace earnings instead of filtering by calendar dates
    const baseSalary = completedTasks.reduce((acc: number, t: any) => acc + Number(t.value || 0), 0)

    const bonusData = userWithBonus?.bonuses[0]
    const bonusAmount = bonusData ? Number(bonusData.bonusAmount) : 0
    const totalWorkspaceSalary = baseSalary + bonusAmount

    // ── Comparison message — Lucide icons only, no emoji ──────
    const comparisonMsg = totalWorkspaceSalary > 0 ? 'Phong độ tuyệt vời!' : 'Hãy bắt đầu hành trình mới'
    const CompareIcon = totalWorkspaceSalary > 0 ? Flame : Zap

    // ── Rank badge config — muted gradient, no emoji ──────────
    const rankConfig: Record<number, { label: string; color: string; shadow: string; textColor: string }> = {
        1: { label: 'Top 1', color: 'from-amber-400/20 to-yellow-300/10', shadow: 'shadow-amber-500/20', textColor: 'text-amber-300' },
        2: { label: 'Top 2', color: 'from-slate-400/20 to-zinc-300/10', shadow: 'shadow-slate-400/15', textColor: 'text-slate-300' },
        3: { label: 'Top 3', color: 'from-orange-500/20 to-amber-600/10', shadow: 'shadow-orange-500/15', textColor: 'text-orange-400' },
    }
    const rankCfg = bonusData ? rankConfig[bonusData.rank] : null

    // ── Error Rate — dynamic color state ─────────────────────
    const errorRate = perfData?.errorRate ?? 0
    const errConfig = errorRate < 0.6
        ? { text: 'text-emerald-400', label: 'Xuất sắc', icon: ShieldCheck, desc: 'Phong độ hoàn hảo' }
        : errorRate < 1.0
        ? { text: 'text-amber-400', label: 'Cẩn thận', icon: AlertTriangle, desc: 'Cần chú ý thêm' }
        : { text: 'text-red-400', label: 'Nguy hiểm', icon: AlertTriangle, desc: 'Cần cải thiện gấp' }
    const ErrIcon = errConfig.icon
    const CompareTrendIcon = totalWorkspaceSalary > 0 ? TrendingUp : Minus
    const trendColor = totalWorkspaceSalary > 0 ? 'text-emerald-400' : 'text-zinc-400'

    return (
        <div className="max-w-5xl mx-auto space-y-8">

            {/* Pending Workspace Invitations Banner */}
            <PendingInvitationsBanner />

            {/* ══════════════════════════════════════════════════
                BENTO BOX GRID
                lg:grid-cols-5 → salary (3) + stats (2)
                items-stretch  → equal height columns
            ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">

                {/* ─── COL LEFT 3/5: Salary Hero Card ───────── */}
                <div className="lg:col-span-3 relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/70 backdrop-blur-md shadow-xl shadow-black/40 p-6 flex flex-col">
                    {/* Ambient glow */}
                    <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-500/6 blur-3xl rounded-full pointer-events-none" />

                    {/* Rank badge — muted glass, no bold gradient bg */}
                    {rankCfg && (
                        <div className={`absolute top-4 right-4 px-3 py-1 rounded-full bg-gradient-to-r ${rankCfg.color} border border-white/10 shadow-md ${rankCfg.shadow}`}>
                            <span className={`text-xs font-bold ${rankCfg.textColor}`}>{rankCfg.label}</span>
                        </div>
                    )}

                    {/* Section label */}
                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lương thực nhận (Workspace)</p>

                    {/* Hero salary number */}
                    <div className="flex items-end gap-2 mb-2">
                        <span className="text-5xl font-black bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]">
                            {totalWorkspaceSalary.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-2xl font-bold text-emerald-400 mb-1">đ</span>
                    </div>

                    {/* Bonus note — accessible amber */}
                    {bonusData && (
                        <p className="text-xs text-amber-400 mb-3">
                            Bao gồm thưởng: <span className="font-bold">+{bonusAmount.toLocaleString('vi-VN')} đ</span>
                        </p>
                    )}

                    {/* ── Bottom row: Trend + DỰ KIẾN block ──── */}
                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-3">

                        {/* Trend vs last month */}
                        <div className={`flex items-center gap-1.5 text-sm font-semibold ${trendColor}`}>
                            <CompareTrendIcon className="w-4 h-4" strokeWidth={2} />
                            <span>{comparisonMsg}</span>
                        </div>

                        {/* DỰ KIẾN — prominent indigo block, NOT a gray pill */}
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                            <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" strokeWidth={1.5} />
                            <div>
                                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider leading-none mb-0.5">Thu nhập dự kiến</p>
                                <p className="text-base font-black text-zinc-100 leading-none">
                                    {pendingSalary.toLocaleString('vi-VN')}<span className="text-xs text-zinc-400 font-normal ml-0.5">đ</span>
                                </p>
                                <p className="text-[10px] text-zinc-400 mt-0.5">{pendingTasks.length} task đang xử lý</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── COL RIGHT 2/5: Stacked mini cards ────── */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                    {/* Error Rate Card */}
                    <div className="flex-1 relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/60 p-5 backdrop-blur-md flex flex-col">
                        {/* Label row */}
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                            Tỉ lệ lỗi
                            {perfData && <span className="text-zinc-600 ml-1">· Rank {perfData.rank}</span>}
                        </p>
                        {/* Rate number */}
                        <div className="flex items-center gap-3 mb-3">
                            <ErrIcon className={`w-7 h-7 flex-shrink-0 ${errConfig.text}`} strokeWidth={1.5} />
                            <span className={`text-4xl font-black ${errConfig.text}`}>{errorRate}%</span>
                        </div>
                        {/* Status label — accessible text-zinc-400 for desc */}
                        <p className={`text-xs font-bold mt-auto ${errConfig.text}`}>{errConfig.label}</p>
                        <p className="text-xs text-zinc-400">{errConfig.desc}</p>
                    </div>

                    {/* Task Stats Card */}
                    <div className="flex-1 rounded-2xl border border-white/8 bg-zinc-950/60 p-5 backdrop-blur-md flex flex-col">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Tasks tháng này</p>
                        <div className="flex flex-col gap-3 flex-1">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-zinc-400 flex items-center gap-2">
                                    <ListChecks className="w-4 h-4" strokeWidth={1.5} />
                                    Hoàn tất
                                </span>
                                <span className="text-lg font-black text-emerald-400">{completedTasks.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-zinc-400 flex items-center gap-2">
                                    <Clock className="w-4 h-4" strokeWidth={1.5} />
                                    Đang làm
                                </span>
                                <span className="text-lg font-black text-indigo-400">{pendingTasks.length}</span>
                            </div>
                            <div className="h-px bg-white/5" />
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-zinc-500">Tổng cộng</span>
                                <span className="font-mono font-bold text-zinc-300">{tasks.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                LEADERBOARD
            ═══════════════════════════════════════════════════ */}
            <div className="h-[340px]">
                <Suspense fallback={
                    <div className="h-full rounded-2xl bg-zinc-950/60 border border-white/5 animate-pulse flex items-center justify-center text-zinc-500 text-sm">
                        Đang tải Bảng Xếp Hạng...
                    </div>
                }>
                    <Leaderboard workspaceId={workspaceId} />
                </Suspense>
            </div>

            {/* ═══════════════════════════════════════════════════
                TASK TABLE
            ═══════════════════════════════════════════════════ */}
            <div>
                <h3 className="text-xl font-bold text-zinc-100 mb-4 flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
                    Danh sách Task của tôi
                </h3>
                <div className="rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-sm overflow-hidden shadow-lg">
                    <TaskTable tasks={serializeDecimal(tasks) as any} isAdmin={userIsAdmin} isMobile={await isMobileDevice()} workspaceId={workspaceId} currentUserId={userId} />
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════
                MARKETPLACE FAB
            ═══════════════════════════════════════════════════ */}
            <MarketplaceProvider workspaceId={workspaceId} initialTaskCount={marketplaceCount} />
        </div>
    )
}
