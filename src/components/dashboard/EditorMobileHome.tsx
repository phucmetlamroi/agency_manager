// src/components/dashboard/EditorMobileHome.tsx
// [P3 / M2] Editor Today-first home for MOBILE only (desktop /dashboard keeps its bento).
// Server component — reuses the shared primitives (KpiStatCard, WeekStrip, AgendaList,
// LeaderboardCompact) + editor-only TodaySection. Composed from data already fetched in
// dashboard/page.tsx (sanitized tasks — no jobPriceUSD — + salary totals + leaderboard).

import { ChevronDown } from 'lucide-react'
import KpiStatCard from '@/components/dashboard/KpiStatCard'
import WeekStrip from '@/components/dashboard/WeekStrip'
import AgendaList from '@/components/dashboard/AgendaList'
import LeaderboardCompact, { type LeaderboardEntry } from '@/components/dashboard/LeaderboardCompact'
import TodaySection from '@/components/dashboard/TodaySection'
import { EmptyState } from '@/components/ui/empty-state'
import { buildWeekAndAgenda, buildTodayTasks, type AgendaTask } from '@/lib/agenda'
import { formatCompactVNDWithUnit, formatCompactCount } from '@/lib/format-compact'

export type EditorMobileHomeProps = {
    workspaceId: string
    greetingName: string
    periodLabel: string
    currentUserId: string
    salary: { received: number; sparkline: number[]; taskCount: number }
    stats: { doing: number; needsFix: number; rank: number | null; completed: number }
    ownTasks: AgendaTask[]
    leaderboard: LeaderboardEntry[]
    leaderboardUpdatedLabel?: string
}

export default function EditorMobileHome({
    workspaceId,
    greetingName,
    periodLabel,
    currentUserId,
    salary,
    stats,
    ownTasks,
    leaderboard,
    leaderboardUpdatedLabel,
}: EditorMobileHomeProps) {
    const now = new Date()
    const { week, agenda } = buildWeekAndAgenda(ownTasks, now)
    const today = buildTodayTasks(ownTasks, now)
    const base = `/${workspaceId}`
    const tasksHref = `${base}/dashboard/tasks`

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* ── Greeting + period ─────────────────────────────── */}
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-body text-muted-foreground">
                    Chào <span className="font-semibold text-foreground">{greetingName}</span> 👋
                </p>
                <span className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg glass-1 px-3 text-body-sm text-foreground">
                    {periodLabel}
                    <ChevronDown size={16} className="text-muted-foreground" />
                </span>
            </div>

            {/* ── KPI ───────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <KpiStatCard
                    label="Lương thực nhận"
                    value={formatCompactVNDWithUnit(salary.received)}
                    context={`${salary.taskCount} task tính lương`}
                    sparkline={salary.sparkline}
                />
                <div className="grid grid-cols-2 gap-3">
                    <KpiStatCard label="Đang làm" value={formatCompactCount(stats.doing)} />
                    <KpiStatCard label="Cần sửa" value={formatCompactCount(stats.needsFix)} />
                    <KpiStatCard
                        label="Hạng của tôi"
                        value={stats.rank ? `#${stats.rank}` : '—'}
                        context={stats.rank ? undefined : 'Chưa xếp hạng kỳ này'}
                    />
                    <KpiStatCard label="Hoàn tất" value={formatCompactCount(stats.completed)} />
                </div>
            </div>

            {/* ── Hôm nay ───────────────────────────────────────── */}
            {today.length > 0 ? (
                <TodaySection items={today} workspaceId={workspaceId} seeAllHref={tasksHref} />
            ) : (
                <section>
                    <h2 className="mb-2 text-title font-semibold text-foreground">Hôm nay</h2>
                    <EmptyState
                        variant="cleared"
                        title="Hôm nay không có việc gấp 🎉"
                        cta={{ label: 'Xem task tuần này', href: tasksHref }}
                    />
                </section>
            )}

            {/* ── Deadline 7 ngày tới ───────────────────────────── */}
            <section>
                <h2 className="mb-3 text-title font-semibold text-foreground">Deadline 7 ngày tới</h2>
                {agenda.length === 0 ? (
                    <EmptyState
                        variant="cleared"
                        title="Không có deadline trong 7 ngày tới"
                        cta={{ label: 'Mở lịch', href: `${base}/dashboard/schedule` }}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        <WeekStrip days={week} />
                        <AgendaList groups={agenda} workspaceId={workspaceId} />
                    </div>
                )}
            </section>

            {/* ── Xếp hạng ──────────────────────────────────────── */}
            <section>
                <LeaderboardCompact
                    entries={leaderboard}
                    currentUserId={currentUserId}
                    updatedLabel={leaderboardUpdatedLabel}
                    detailHref={`${base}/dashboard`}
                />
            </section>
        </div>
    )
}
