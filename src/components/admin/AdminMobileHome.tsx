// src/components/admin/AdminMobileHome.tsx
// [P3 / M3] Admin Today-first home for MOBILE only (desktop /admin keeps its bento).
// Server component — assembles the shared dashboard primitives (KpiStatCard, WeekStrip,
// AgendaList, LeaderboardCompact) + the admin-only AttentionSection. Data is composed in
// admin/page.tsx from already-fetched tasks/finance/leaderboard (no new server actions).

import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import KpiStatCard from '@/components/dashboard/KpiStatCard'
import WeekStrip from '@/components/dashboard/WeekStrip'
import AgendaList from '@/components/dashboard/AgendaList'
import LeaderboardCompact, { type LeaderboardEntry } from '@/components/dashboard/LeaderboardCompact'
import AttentionSection, { type AttentionRow } from '@/components/admin/AttentionSection'
import { EmptyState } from '@/components/ui/empty-state'
import { buildWeekAndAgenda, type AgendaTask } from '@/lib/agenda'
import { formatCompactVNDWithUnit, formatCompactCount } from '@/lib/format-compact'

export type AdminMobileHomeProps = {
    workspaceId: string
    greetingName: string
    periodLabel: string
    currentUserId: string
    kpi: {
        revenueVND: number
        sparkline: number[]
        running: number
        waitingAssign: number
        clientIssues: number
        completedThisPeriod: number
    }
    attention: { overdue: number; revision: number; waiting: number; client: number }
    agendaTasks: AgendaTask[]
    leaderboard: LeaderboardEntry[]
    leaderboardUpdatedLabel?: string
}

export default function AdminMobileHome({
    workspaceId,
    greetingName,
    periodLabel,
    currentUserId,
    kpi,
    attention,
    agendaTasks,
    leaderboard,
    leaderboardUpdatedLabel,
}: AdminMobileHomeProps) {
    const { week, agenda } = buildWeekAndAgenda(agendaTasks, new Date(), { withAssignee: true })
    const base = `/${workspaceId}`

    const attentionRows: AttentionRow[] = [
        { kind: 'overdue', count: attention.overdue, href: `${base}/admin/queue?filter=overdue` },
        { kind: 'revision', count: attention.revision, href: `${base}/admin/queue?filter=revision` },
        { kind: 'waiting', count: attention.waiting, href: `${base}/admin/queue?filter=unassigned` },
        { kind: 'client', count: attention.client, href: `${base}/admin/crm?filter=issues` },
    ]
    const hasAttention = attentionRows.some((r) => r.count > 0)

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* ── Greeting + period ─────────────────────────────── */}
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-body text-muted-foreground">
                    Chào <span className="font-semibold text-foreground">{greetingName}</span> 👋
                </p>
                {/* [Owner review 2026-07-11] "Tháng = workspace" — chevron trước đây là affordance
                    GIẢ (span tĩnh, bấm không sổ). Nay badge dẫn thẳng tới trang đổi workspace/kỳ
                    (đúng ý "đổi tháng" của chủ dự án). */}
                <Link
                    href="/api/profile/select"
                    aria-label="Đổi kỳ / workspace"
                    className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg glass-1 px-3 text-body-sm text-foreground transition-colors active:bg-white/10"
                >
                    {periodLabel}
                    <ChevronDown size={16} className="text-muted-foreground" />
                </Link>
            </div>

            {/* ── KPI ───────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <KpiStatCard
                    label="Doanh thu kỳ này"
                    value={formatCompactVNDWithUnit(kpi.revenueVND)}
                    context="Dự kiến kỳ này"
                    sparkline={kpi.sparkline}
                />
                <div className="grid grid-cols-2 gap-3">
                    <KpiStatCard label="Đang chạy" value={formatCompactCount(kpi.running)} />
                    <KpiStatCard label="Chờ giao" value={formatCompactCount(kpi.waitingAssign)} />
                    <KpiStatCard label="Khách vướng mắc" value={formatCompactCount(kpi.clientIssues)} />
                    <KpiStatCard label="Hoàn tất kỳ này" value={formatCompactCount(kpi.completedThisPeriod)} />
                </div>
            </div>

            {/* ── Cần chú ý ─────────────────────────────────────── */}
            <section>
                <h2 className="mb-2 text-title font-semibold text-foreground">Cần chú ý</h2>
                {hasAttention ? (
                    <AttentionSection rows={attentionRows} />
                ) : (
                    <EmptyState variant="cleared" title="Mọi thứ đang ổn — không có việc cần chú ý" />
                )}
            </section>

            {/* ── Deadline 7 ngày tới ───────────────────────────── */}
            <section>
                <h2 className="mb-3 text-title font-semibold text-foreground">Deadline 7 ngày tới (team)</h2>
                {agenda.length === 0 ? (
                    <EmptyState
                        variant="cleared"
                        title="Không có deadline trong 7 ngày tới"
                        cta={{ label: 'Mở lịch', href: `${base}/admin/schedule` }}
                    />
                ) : (
                    <div className="flex flex-col gap-3">
                        <WeekStrip days={week} />
                        <AgendaList groups={agenda} workspaceId={workspaceId} />
                    </div>
                )}
            </section>

            {/* ── Doanh thu & khách hàng (link sang spoke) ──────── */}
            <section>
                <h2 className="mb-2 text-title font-semibold text-foreground">Doanh thu &amp; khách hàng</h2>
                <Link
                    href={`${base}/admin/analytics`}
                    className="flex min-h-14 items-center gap-3 rounded-xl glass-1 px-4 active:scale-[0.98] transition-transform"
                >
                    <span className="min-w-0 flex-1 text-body-sm text-foreground">
                        Xem phân tích doanh thu &amp; khách hàng
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-zinc-500" />
                </Link>
            </section>

            {/* ── Xếp hạng ──────────────────────────────────────── */}
            <section>
                <LeaderboardCompact
                    entries={leaderboard}
                    currentUserId={currentUserId}
                    updatedLabel={leaderboardUpdatedLabel}
                    detailHref={`${base}/admin/analytics`}
                />
            </section>
        </div>
    )
}
