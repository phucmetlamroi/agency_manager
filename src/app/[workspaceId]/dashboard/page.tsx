import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'
import { isMobileDevice } from '@/lib/device'
import Leaderboard from '@/components/dashboard/Leaderboard'
import { Suspense } from 'react'
import { serializeDecimal } from '@/lib/serialization'
import { UserRole } from '@prisma/client'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { getUserPerformanceScore } from '@/actions/analytics-actions'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck, Clock, ListChecks } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function UserDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const workspacePrisma = getWorkspacePrisma(workspaceId)
    const userId = session.user.id

    // ── Data Fetching (logic unchanged) ──────────────────────
    const perfData = await getUserPerformanceScore(workspaceId, userId)

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const userWithBonus = await (workspacePrisma as any).user.findUnique({
        where: { id: userId },
        select: {
            id: true, username: true, role: true, nickname: true,
            bonuses: { where: { workspaceId, month: currentMonth, year: currentYear } }
        }
    })

    if ((userWithBonus?.role as UserRole) === UserRole.ADMIN) redirect(`/${workspaceId}/admin`)

    const tasks = await (workspacePrisma as any).task.findMany({
        where: { assigneeId: userId },
        include: {
            client: { include: { parent: true } },
            assignee: {
                select: {
                    id: true, username: true, role: true, nickname: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    // ── Salary Calculations (all logic unchanged) ─────────────
    const pendingTasks = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const pendingSalary = pendingTasks.reduce((acc: number, t: any) => acc + Number(t.value || 0), 0)

    const thisMonthStart = new Date(currentYear, currentMonth - 1, 1)
    const lastMonthStart = new Date(currentYear, currentMonth - 2, 1)
    const thisMonthEnd = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999)

    const completedTasks = tasks.filter((t: any) => t.status === 'Hoàn tất')
    const thisMonthTasks = completedTasks.filter((t: any) => t.updatedAt >= thisMonthStart && t.updatedAt <= thisMonthEnd)
    const lastMonthTasks = completedTasks.filter((t: any) => t.updatedAt >= lastMonthStart && t.updatedAt < thisMonthStart)

    const baseSalary = thisMonthTasks.reduce((acc: number, t: any) => acc + Number(t.value || 0), 0)
    const lastMonthSalary = lastMonthTasks.reduce((acc: number, t: any) => acc + Number(t.value || 0), 0)

    const bonusData = userWithBonus?.bonuses[0]
    const bonusAmount = bonusData ? Number(bonusData.bonusAmount) : 0
    const totalThisMonthSalary = baseSalary + bonusAmount

    let percentage = 0
    let comparisonMsg = ''
    if (lastMonthSalary === 0) {
        comparisonMsg = totalThisMonthSalary > 0 ? 'Khởi đầu quá cháy! 🔥' : 'Chưa có lúa về. Cày task mạnh lên nào!'
    } else {
        percentage = Math.round(((totalThisMonthSalary - lastMonthSalary) / lastMonthSalary) * 100)
        comparisonMsg = percentage > 0
            ? `Bay cao ✈️ (+${percentage}% so tháng trước)`
            : percentage < 0
            ? `Thấp hơn ${Math.abs(percentage)}% tháng trước`
            : 'Phong độ ổn định như bê tông 🏗️'
    }

    const rankConfig: Record<number, { emoji: string; color: string; shadow: string }> = {
        1: { emoji: '🥇', color: 'from-amber-400 to-yellow-300', shadow: 'shadow-amber-500/30' },
        2: { emoji: '🥈', color: 'from-slate-300 to-zinc-200', shadow: 'shadow-slate-400/20' },
        3: { emoji: '🥉', color: 'from-orange-400 to-amber-600', shadow: 'shadow-orange-500/20' },
    }
    const rankCfg = bonusData ? rankConfig[bonusData.rank] : null

    // ── Error Rate Color ──────────────────────────────────────
    const errorRate = perfData?.errorRate ?? 0
    const errColor = errorRate < 0.6 ? { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: ShieldCheck }
        : errorRate < 1.0 ? { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle }
        : { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle }
    const ErrIcon = errColor.icon

    const TrendIcon = percentage > 0 ? TrendingUp : percentage < 0 ? TrendingDown : Minus
    const trendColor = percentage > 0 ? 'text-emerald-400' : percentage < 0 ? 'text-red-400' : 'text-zinc-400'

    return (
        <div className="max-w-5xl mx-auto space-y-8">

            {/* ══════════════════════════════════════════════════ */}
            {/* BENTO BOX GRID                                    */}
            {/* ══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

                {/* ─── COL LEFT (span 2): Salary Hero Card ─── */}
                <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-950/70 backdrop-blur-md shadow-xl shadow-black/40 p-6">
                    {/* Ambient glow */}
                    <div className="absolute -bottom-12 -left-12 w-56 h-56 bg-emerald-500/8 blur-3xl rounded-full pointer-events-none" />

                    {/* Rank badge */}
                    {rankCfg && (
                        <div className={`absolute top-4 right-4 px-3 py-1 rounded-full bg-gradient-to-r ${rankCfg.color} text-black text-xs font-black shadow-lg ${rankCfg.shadow}`}>
                            {rankCfg.emoji} Top {bonusData.rank}
                        </div>
                    )}

                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Lương tháng này (Tạm tính)</p>

                    {/* Big salary number */}
                    <div className="flex items-end gap-2 mb-4">
                        <span className="text-5xl font-black bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]">
                            {totalThisMonthSalary.toLocaleString('vi-VN')}
                        </span>
                        <span className="text-2xl font-bold text-emerald-400 mb-1">đ</span>
                    </div>

                    {/* Bonus sub-label */}
                    {bonusData && (
                        <p className="text-xs text-amber-400 mb-4">
                            Đã bao gồm thưởng: <span className="font-bold">+{bonusAmount.toLocaleString('vi-VN')}đ</span>
                        </p>
                    )}

                    {/* Divider */}
                    <div className="border-t border-white/5 pt-4 flex items-center justify-between flex-wrap gap-3">
                        {/* Trend vs last month */}
                        <div className={`flex items-center gap-2 text-sm font-semibold ${trendColor}`}>
                            <TrendIcon className="w-4 h-4" />
                            <span>{comparisonMsg}</span>
                        </div>

                        {/* Pending salary pill */}
                        <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-800/60 border border-white/5 px-3 py-1.5 rounded-xl">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            Dự kiến: <span className="font-bold text-zinc-300 ml-1">{pendingSalary.toLocaleString('vi-VN')}đ</span>
                            <span className="text-zinc-700">({pendingTasks.length} task)</span>
                        </div>
                    </div>
                </div>

                {/* ─── COL RIGHT: Error Rate + Task Count ─── */}
                <div className="flex flex-col gap-4">
                    {/* Error Rate Box */}
                    <div className={`relative rounded-2xl border ${errColor.border} ${errColor.bg} p-5 backdrop-blur-md shadow-lg`}>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">
                            Tỉ lệ lỗi {perfData && <span>(Rank {perfData.rank})</span>}
                        </p>
                        <div className="flex items-center gap-3">
                            <ErrIcon className={`w-8 h-8 ${errColor.text}`} />
                            <span className={`text-3xl font-black ${errColor.text}`}>{errorRate}%</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-2">
                            {errorRate < 0.6 ? 'Xuất sắc! Phong độ hoàn hảo.' : errorRate < 1.0 ? 'Cẩn thận hơn nhé!' : 'Cần cải thiện gấp!'}
                        </p>
                    </div>

                    {/* Task Stats Box */}
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5 backdrop-blur-md">
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">Tasks tháng này</p>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500 flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" />Hoàn tất</span>
                                <span className="font-bold text-emerald-400">{thisMonthTasks.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Đang làm</span>
                                <span className="font-bold text-indigo-400">{pendingTasks.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Tổng cộng</span>
                                <span className="font-mono font-bold text-zinc-300">{tasks.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* LEADERBOARD                                         */}
            {/* ═══════════════════════════════════════════════════ */}
            <div className="h-[340px]">
                <Suspense fallback={<div className="h-full rounded-2xl bg-zinc-950/60 border border-white/5 animate-pulse flex items-center justify-center text-zinc-700 text-sm">Đang tải Bảng Xếp Hạng...</div>}>
                    <Leaderboard workspaceId={workspaceId} />
                </Suspense>
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* TASK TABLE                                          */}
            {/* ═══════════════════════════════════════════════════ */}
            <div>
                <h3 className="text-xl font-heading font-bold text-zinc-100 mb-4 flex items-center gap-2">
                    <ListChecks className="w-5 h-5 text-indigo-400" />
                    Danh sách Task của tôi
                </h3>
                <div className="rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-sm overflow-hidden shadow-lg">
                    <TaskTable tasks={serializeDecimal(tasks) as any} isAdmin={false} isMobile={await isMobileDevice()} workspaceId={workspaceId} />
                </div>
            </div>
        </div>
    )
}
