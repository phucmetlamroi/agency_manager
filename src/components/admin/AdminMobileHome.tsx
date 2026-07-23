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
import AdminTriageQueue, { type TriageTask } from '@/components/admin/AdminTriageQueue'
import { EmptyState } from '@/components/ui/empty-state'
import { buildWeekAndAgenda, type AgendaTask } from '@/lib/agenda'
import { formatCompactVNDWithUnit, formatCompactCount } from '@/lib/format-compact'
import type { ClientRequestDTO } from '@/actions/client-request-actions'

function initials(name: string): string {
    const parts = name.replace(/^@/, '').trim().split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

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
    /** [PR#4] Hàng đợi triage — 3 nguồn compose ở admin/page.tsx (không thêm server action). */
    triage: {
        tasks: TriageTask[]
        requests: ClientRequestDTO[]
        users: { id: string; username: string; nickname?: string | null; displayName?: string | null }[]
    }
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
    triage,
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
        <div className="mroot flex flex-col gap-5 pb-10">
            {/* ── Header (prototype): avatar + greeting + kỳ pill ─── */}
            <div className="m-row" style={{ paddingTop: 2 }}>
                <span className="m-av" style={{ width: 26, height: 26, fontSize: 10 }}>{initials(greetingName)}</span>
                <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>Chào {greetingName}</b>
                <span style={{ flex: 1 }} />
                {/* "Tháng = workspace": badge dẫn thẳng tới trang đổi workspace/kỳ. */}
                <Link href="/api/profile/select" aria-label="Đổi kỳ / workspace" className="m-pill ind m-mono" style={{ textDecoration: 'none' }}>
                    {periodLabel}
                    <ChevronDown size={13} style={{ opacity: 0.7 }} />
                </Link>
            </div>

            {/* ── Revenue meta line (prototype) ─────────────────── */}
            <div className="m-row" style={{ fontSize: 12, color: 'var(--m-fg-4)', marginTop: -8, flexWrap: 'wrap' }}>
                <span className="m-mono" style={{ color: 'var(--m-fg-2)', fontWeight: 600 }}>{formatCompactVNDWithUnit(kpi.revenueVND)}</span>
                kỳ này · {formatCompactCount(kpi.running)} chạy · {formatCompactCount(kpi.waitingAssign)} chờ giao
            </div>

            {/* ── Hàng đợi triage (deck — hero) ─────────────────── */}
            <AdminTriageQueue
                tasks={triage.tasks}
                requests={triage.requests}
                users={triage.users}
                workspaceId={workspaceId}
            />

            {/* [visual-parity redo] Prototype home = triage-only. Các mục Tổng quan / Cần chú ý /
                Deadline / Xếp hạng dưới đây GIỮ tạm để không mất chức năng — sẽ re-skin sang lớp
                `.m-*` khi làm màn Phân tích/Lịch. Đánh dấu để owner biết đây là phần chưa parity. */}

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
