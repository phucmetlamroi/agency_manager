import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

export default async function FinanceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    const profileId = (session?.user as any)?.sessionProfileId
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    // Authorization Check
    // Must be Admin. Specific "Treasurer" check can be added if we strictly enforce it.
    // Spec says: "Chỉ hiển thị cho SUPER_ADMIN ("admin") và ADMIN có quyền xem tài chính."
    // We added `isTreasurer` to User model.

    const user = await workspacePrisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { role: true, isTreasurer: true, username: true }
    })

    if (!user || user.role !== 'ADMIN') {
        redirect(`/${workspaceId}/admin`)
    }

    if (user.username !== 'admin' && !user.isTreasurer) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                <h3>⛔ Quyền truy cập bị từ chối</h3>
                <p>Bạn không có quyền xem báo cáo tài chính. Vui lòng liên hệ Super Admin.</p>
            </div>
        )
    }

    // Fetch Financial Data (Completed Tasks Only)
    const tasks = await workspacePrisma.task.findMany({
        where: { status: 'Hoàn tất' },
        include: {
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // Fetch ALL tasks (for projected/expected numbers)
    const allTasks = await workspacePrisma.task.findMany({
        where: { isArchived: false },
        include: {
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // ── Actual (Completed only) ──
    const totalRevenueVND = tasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)), 0)
    const totalWageVND = tasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const netProfit = totalRevenueVND - totalWageVND
    const profitMargin = totalRevenueVND > 0 ? (netProfit / totalRevenueVND) * 100 : 0

    // ── Projected (ALL tasks) ──
    const projectedRevenueVND = allTasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)), 0)
    const projectedWageVND = allTasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const projectedNetProfit = projectedRevenueVND - projectedWageVND
    const projectedMargin = projectedRevenueVND > 0 ? (projectedNetProfit / projectedRevenueVND) * 100 : 0
    const pendingTasksCount = allTasks.length - tasks.length

    return (
        <div className="max-w-[1200px] mx-auto p-4 space-y-8">

            {/* ── PAGE HEADER ── */}
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </span>
                    Báo Cáo Tài Chính
                </h2>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Thực tế: {tasks.length} task hoàn thành
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Dự kiến: {allTasks.length} task ({pendingTasksCount} đang chạy)
                    </span>
                </div>
            </div>

            {/* ══════════════════════════════════
                ROW 1: THỰC TẾ (ACTUAL)
            ══════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Thực Tế — Đã Hoàn Thành</span>
                    <div className="flex-1 h-px bg-emerald-500/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Actual: Revenue */}
                    <div className="bg-zinc-950/50 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-blue-500/40 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
                        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Tổng Doanh Thu</p>
                        <p className="text-xs text-zinc-600 mb-3">Gross Revenue từ {tasks.length} task</p>
                        <div className="text-2xl font-bold text-blue-400 font-mono tabular-nums">
                            {totalRevenueVND.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>

                    {/* Actual: Cost */}
                    <div className="bg-zinc-950/50 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-red-500/40 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl" />
                        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Tổng Chi Phí</p>
                        <p className="text-xs text-zinc-600 mb-3">Wages đã chi trả cho nhân viên</p>
                        <div className="text-2xl font-bold text-red-400 font-mono tabular-nums">
                            {totalWageVND.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>

                    {/* Actual: Net Profit */}
                    <div className="bg-zinc-950/50 border border-emerald-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
                        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Lợi Nhuận Ròng</p>
                        <div className={`text-xs font-bold mb-3 ${profitMargin > 50 ? 'text-emerald-400' : profitMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                            Margin: {profitMargin.toFixed(1)}%
                        </div>
                        <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                            {netProfit.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════
                ROW 2: DỰ KIẾN (PROJECTED)
            ══════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Dự Kiến — Toàn Bộ {allTasks.length} Task</span>
                    <div className="flex-1 h-px bg-indigo-500/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Projected: Revenue */}
                    <div className="bg-zinc-900/30 border border-dashed border-indigo-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Dự Kiến Doanh Thu</p>
                        <p className="text-xs text-zinc-700 mb-3">+{(projectedRevenueVND - totalRevenueVND).toLocaleString('vi-VN')} ₫ đang chờ</p>
                        <div className="text-2xl font-bold text-indigo-400/80 font-mono tabular-nums">
                            {projectedRevenueVND.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>

                    {/* Projected: Cost */}
                    <div className="bg-zinc-900/30 border border-dashed border-rose-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-rose-500/40 transition-all">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Dự Kiến Chi Phí</p>
                        <p className="text-xs text-zinc-700 mb-3">+{(projectedWageVND - totalWageVND).toLocaleString('vi-VN')} ₫ sẽ phải trả</p>
                        <div className="text-2xl font-bold text-rose-400/80 font-mono tabular-nums">
                            {projectedWageVND.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>

                    {/* Projected: Net Profit */}
                    <div className="bg-zinc-900/30 border border-dashed border-teal-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-teal-500/40 transition-all">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Dự Kiến Lợi Nhuận</p>
                        <div className={`text-xs font-bold mb-3 opacity-70 ${projectedMargin > 50 ? 'text-emerald-400' : projectedMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                            Margin dự kiến: {projectedMargin.toFixed(1)}%
                        </div>
                        <div className="text-2xl font-bold text-teal-400/80 font-mono tabular-nums">
                            {projectedNetProfit.toLocaleString('vi-VN')} ₫
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════
                SUMMARY BANNER (Equation Display)
            ══════════════════════════════════ */}
            <div className="bg-gradient-to-r from-indigo-500/8 via-zinc-900/20 to-emerald-500/8 border border-white/5 rounded-2xl p-5 flex items-center gap-4 flex-wrap shadow-inner">
                <div>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Tổng DT Dự Kiến</p>
                    <p className="text-lg font-bold text-indigo-300 font-mono tabular-nums">{projectedRevenueVND.toLocaleString('vi-VN')} ₫</p>
                </div>
                <div className="text-zinc-600 text-xl font-light px-2">−</div>
                <div>
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Tổng CP Dự Kiến</p>
                    <p className="text-lg font-bold text-rose-300 font-mono tabular-nums">{projectedWageVND.toLocaleString('vi-VN')} ₫</p>
                </div>
                <div className="text-zinc-600 text-xl font-light px-2">=</div>
                <div>
                    <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-1">LN Ròng Dự Kiến</p>
                    <p className="text-lg font-bold text-teal-300 font-mono tabular-nums">{projectedNetProfit.toLocaleString('vi-VN')} ₫</p>
                </div>
                <div className="ml-auto text-right pl-4 border-l border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Margin dự kiến</p>
                    <p className={`text-3xl font-black tabular-nums ${projectedMargin > 50 ? 'text-emerald-400' : projectedMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {projectedMargin.toFixed(1)}%
                    </p>
                </div>
            </div>

            {/* ══════════════════════════════════
                NHẬT KÝ GIAO DỊCH (TRANSACTIONS)
            ══════════════════════════════════ */}
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden">
                {/* Table Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        Nhật ký Giao dịch
                    </h3>
                    <span className="text-[11px] text-zinc-600 bg-zinc-900/50 px-2.5 py-1 rounded-lg border border-white/5">
                        Hiển thị cả thực tế & dự kiến
                    </span>
                </div>

                {/* Column Labels */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 px-6 py-2.5 border-b border-white/5 bg-zinc-900/20">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Task & Trạng thái</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Người nhận</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">Dự kiến Revenue</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">Dự kiến Wage</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">LN Ròng</p>
                </div>

                {/* Rows */}
                <div className="divide-y divide-white/[0.04]">
                    {allTasks.slice(0, 50).map(t => {
                        const rev = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)
                        const wage = Number(t.wageVND || t.value || 0)
                        const prof = rev - wage
                        const isCompleted = t.status === 'Hoàn tất'

                        return (
                            <div key={t.id}
                                className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-0 px-6 py-3.5 items-center transition-colors hover:bg-white/[0.02] ${!isCompleted ? 'opacity-60' : ''}`}
                            >
                                {/* Task + Badge */}
                                <div className="pr-4">
                                    <p className={`text-sm font-medium ${isCompleted ? 'text-zinc-200' : 'text-zinc-400'} mb-1.5 truncate`}>{t.title}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                            isCompleted
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                        }`}>
                                            {isCompleted ? 'THỰC TẾ' : 'DỰ KIẾN'}
                                        </span>
                                        <span className="text-[10px] text-zinc-700">{t.status}</span>
                                    </div>
                                </div>

                                {/* Assignee */}
                                <p className="text-sm text-zinc-500">
                                    {t.assignee?.nickname || t.assignee?.username || '—'}
                                </p>

                                {/* Revenue */}
                                <p className="text-sm font-mono tabular-nums text-zinc-300 text-right font-medium">
                                    {rev.toLocaleString('vi-VN')} ₫
                                </p>

                                {/* Wage */}
                                <p className={`text-sm font-mono tabular-nums text-right font-medium ${isCompleted ? 'text-red-400' : 'text-rose-400/60'}`}>
                                    {wage.toLocaleString('vi-VN')} ₫
                                </p>

                                {/* Net Profit */}
                                <p className={`text-sm font-mono tabular-nums text-right font-bold ${isCompleted ? 'text-emerald-400' : 'text-teal-400/60'}`}>
                                    {prof.toLocaleString('vi-VN')} ₫
                                </p>
                            </div>
                        )
                    })}
                </div>

                {allTasks.length === 0 && (
                    <div className="py-16 text-center text-zinc-600">
                        <p className="text-sm">Chưa có dữ liệu giao dịch.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
