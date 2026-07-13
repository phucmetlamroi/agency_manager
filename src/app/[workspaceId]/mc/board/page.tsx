// [Giao diện 2 · Mission Control · M16 Vận hành bảng task] MC-shell wrapping the real TaskWorkflowTabs.
// This is the OPERATIONAL board (vs. /mc = read-only overview, /mc/queue = triage): the full task table
// across all statuses with every M16 affordance already wired inside TaskWorkflowTabs —
//   1) status pill dropdown grouped by phase (StatusCell),
//   2) Revision-classification dialog "Phân loại Revision" (Khách yêu cầu vs Nội bộ) (StatusCell),
//   3) ⋯ context menu (Sao chép ID · Sửa chi tiết · Trả lại task · Xoá cứng),
//   4) unified bulk bar (Sửa hàng loạt → BulkEditTaskModal · Xoá) + Giao hàng loạt (AssigneeCell).
// Reuses the SAME data + component as GĐ1 /admin — no logic rebuilt, only draped in the MC dark shell.
// TaskWorkflowTabs is fully props-driven (does NOT self-fetch); we feed it the exact admin fetch shape.
// Admin-gated fail-closed. isAdmin={true} shows wages (this is the admin cockpit — same as GĐ1 /admin;
// mutations re-check ADMIN server-side). Non-admins are redirected before any money serializes.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText, LayoutGrid,
} from 'lucide-react'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { serializeDecimal } from '@/lib/serialization'
import TaskWorkflowTabs from '@/components/TaskWorkflowTabs'
import McBackLink from '@/components/mission-control/McBackLink'

export const dynamic = 'force-dynamic'

export default async function MissionControlBoardPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    await checkOverdueTasks(workspaceId)

    // Same fetch shape as GĐ1 /admin (the surface TaskWorkflowTabs was built for) — all non-archived
    // tasks + the assignee/manager/client/tags/rawFootage includes the board's cells read.
    const [workspace, tasks, users] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
        wp.task.findMany({
            where: { isArchived: false },
            include: {
                assignee: {
                    select: {
                        id: true, username: true, displayName: true, role: true, nickname: true,
                        monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } },
                    },
                },
                assignedBy: { select: { id: true, username: true, displayName: true, nickname: true } },
                client: { include: { parent: true } },
                taskTags: { include: { tagCategory: { select: { id: true, name: true } } } },
                rawFootage: { select: { displayType: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        wp.user.findMany({
            where: { role: { notIn: ['CLIENT', 'LOCKED'] } },
            orderBy: [{ username: 'asc' }],
            select: {
                id: true, username: true, displayName: true, role: true, nickname: true,
                monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } },
            },
        }),
    ])

    // Faithful to /admin ordering: assigned first, then unassigned (cosmetic within each status tab).
    const unassignedTasks = (tasks as any[]).filter((t) => !t.assigneeId)
    const assignedTasks = (tasks as any[]).filter((t) => t.assigneeId)
    const ordered = assignedTasks.concat(unassignedTasks)

    const rail: { icon: any; href?: string; active?: boolean; divider?: boolean; title?: string }[] = [
        { icon: LayoutDashboard, href: `/${workspaceId}/mc`, title: 'Tổng quan' },
        { icon: ListTodo, active: true, title: 'Vận hành bảng task' },
        { icon: Inbox, href: `/${workspaceId}/mc/requests`, title: 'Hộp thư yêu cầu' },
        { icon: Clapperboard, href: `/${workspaceId}/mc/tep`, title: 'Tệp — Review' },
        { icon: CalendarDays, href: `/${workspaceId}/mc/lich`, title: 'Lịch' },
        { icon: Wallet, href: `/${workspaceId}/mc/tien`, divider: true, title: 'Tiền — Payroll' },
        { icon: Building2, href: `/${workspaceId}/mc/crm`, title: 'Quản lý khách hàng' },
        { icon: UsersRound, href: `/${workspaceId}/mc/members`, divider: true, title: 'Thành viên' },
        { icon: Trash2, title: 'Thùng rác' },
        { icon: Activity, title: 'Phân tích — Màn 28' },
        { icon: ScrollText, title: 'Nhật ký hoạt động — Màn 29' },
    ]

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {rail.map((r, i) => {
                    const Icon = r.icon
                    const inner = (
                        <div title={r.title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.active ? '#A5B4FC' : '#A1A1AA', background: r.active ? 'rgba(99,102,241,0.18)' : 'transparent', border: r.active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: r.active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
                            <Icon style={{ width: 18, height: 18 }} />
                        </div>
                    )
                    return (
                        <div key={i} style={{ display: 'contents' }}>
                            {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                            {r.href ? <Link href={r.href}>{inner}</Link> : inner}
                        </div>
                    )
                })}
                <div style={{ flex: 1 }} />
                <McBackLink backHref={`/${workspaceId}/admin`} />
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Thin MC header — this surface is the working table, distinct from the /mc overview. */}
                <div style={{ position: 'relative', zIndex: 10, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,10,0.55)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LayoutGrid style={{ width: 16, height: 16, color: '#A5B4FC' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, letterSpacing: '0.16em', color: '#71717A' }}>{(workspace?.name || 'WORKSPACE').toUpperCase()} / BẢNG TASK</span>
                        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#F4F4F5' }}>Vận hành bảng task</span>
                    </div>
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', color: '#A5B4FC' }}>{ordered.length} task</span>
                    <div style={{ flex: 1 }} />
                    <Link href={`/${workspaceId}/mc`} style={{ fontSize: 12, fontWeight: 700, color: '#A1A1AA', textDecoration: 'none', padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)' }}>← Tổng quan</Link>
                </div>

                {/* Board — the real admin TaskWorkflowTabs (all 4 M16 operations wired inside). */}
                <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', padding: '18px 22px 40px' }}>
                    <TaskWorkflowTabs
                        tasks={serializeDecimal(ordered) as any}
                        users={users}
                        isMobile={false}
                        isAdmin
                        workspaceId={workspaceId}
                    />
                </div>
            </div>
        </div>
    )
}
