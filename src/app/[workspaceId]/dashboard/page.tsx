import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { Suspense } from 'react'
import { Settings2 } from 'lucide-react'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { SALARY_PENDING_STATUSES, SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import { serializeDecimal } from '@/lib/serialization'
import { sanitizeTaskListForUser } from '@/lib/task-sanitize'
import { getAvailableProfiles } from '@/actions/profile-actions'
import { isProfileOwner } from '@/lib/profile-permissions'

import UserHomeTopBar from '@/components/dashboard/UserHomeTopBar'
import UserWorkspacePicker from '@/components/dashboard/UserWorkspacePicker'
import WidgetRankings from '@/components/dashboard/widgets/WidgetRankings'
import WidgetUpcomingDeadlines from '@/components/dashboard/widgets/WidgetUpcomingDeadlines'
import WidgetNetSalary from '@/components/dashboard/widgets/WidgetNetSalary'
import WidgetTotalTasks from '@/components/dashboard/widgets/WidgetTotalTasks'
import UserWorkflowTabs from '@/components/dashboard/UserWorkflowTabs'
import PendingInvitationsBanner from '@/components/workspace/PendingInvitationsBanner'
import BonusRankBanner from '@/components/dashboard/BonusRankBanner'

export const dynamic = 'force-dynamic'

/**
 * UserDashboard — rebuilt to mirror Admin layout per Figma HOME-USER-VER-1.0.
 *
 * Hierarchy (top → bottom):
 *   UserHomeTopBar  (workspace name + welcome + search + bell + profile)
 *   ↓ This month / Manage widgets row
 *   ↓ 4-widget grid: Rankings | Upcoming Deadlines | (NetSalary + TotalTasks stacked)
 *   ↓ UserWorkflowTabs: 4 tabs + search + view + paginated TaskTable
 */
export default async function UserDashboard({ params, searchParams }: {
    params: Promise<{ workspaceId: string }>
    searchParams?: Promise<{ taskId?: string }>
}) {
    const { workspaceId } = await params
    // [Z+1.fix6] Deep-link: notification click passes ?taskId= to auto-open task modal
    const query = await searchParams
    const initialTaskId = query?.taskId || null
    const session = await getSession()
    if (!session) redirect('/login')

    const userId = session.user.id

    // [Z+1.fix3] Session profileId fallback — handle legacy sessions hoặc cross-profile nav.
    // Workspace layout đã verify access, nhưng nếu sessionProfileId mismatch với
    // workspace's profile, dùng workspace's profile cho prisma context.
    let profileId = (session.user as any).sessionProfileId as string | null | undefined
    if (!profileId) {
        try {
            const firstAccess = await prisma.profileAccess.findFirst({
                where: { userId },
                select: { profileId: true },
                orderBy: { grantedAt: 'asc' },
            })
            profileId = firstAccess?.profileId ?? null
        } catch (e) {
            console.warn('[UserDashboard] ProfileAccess fallback failed:', e)
        }
        if (!profileId) redirect('/login')
    }

    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    // [Sprint Y] Profile ownership — gate "Tạo Workspace mới" trong UserWorkspacePicker
    const canCreateWorkspace = profileId ? await isProfileOwner(userId, profileId) : false

    // ── Workspace name + role context ────────────────────────────
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
    })
    const workspaceName = workspace?.name ?? 'Workspace'

    // Determine if this user can switch back to admin view
    const isGlobalAdmin = session.user.role === 'ADMIN' || !!(session.user as any).isTreasurer
    let canSwitchToAdmin = isGlobalAdmin
    if (!isGlobalAdmin) {
        const membership = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { role: true },
        })
        canSwitchToAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN'
    }

    // ── User profile basics ──────────────────────────────────────
    const currentUser = await (workspacePrisma as any).user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            nickname: true,
            displayName: true,
            role: true,
            avatarUrl: true,
            // [Bonus] thưởng tháng này (MonthlyBonus) — để user thấy rank + tiền thưởng
            bonuses: { where: { workspaceId } },
        },
    })

    // [Username Handle] Centralized display: displayName → username (never email fallback)
    const { formatUserDisplay, formatUserInitials } = await import('@/lib/format-user')
    const displayName = formatUserDisplay(currentUser) || 'User'
    const initials = formatUserInitials(currentUser) || 'US'

    // ── User's tasks (for widgets + TaskTable) ───────────────────
    const rawTasks = await (workspacePrisma as any).task.findMany({
        where: { assigneeId: userId },
        include: {
            client: { include: { parent: true } },
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } },
                },
            },
            taskTags: { include: { tagCategory: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
    })

    // [Sprint J P0] Strip admin-only financial fields (jobPriceUSD, exchangeRate,
    // profitVND) BEFORE passing to client. This /dashboard page is the USER view —
    // global admin auto-routes to /admin per Sprint F.3. So `isAdmin = false` here
    // is a hard rule: even global admins viewing /dashboard get the user view.
    const tasks = sanitizeTaskListForUser(rawTasks, false)

    // ── [Sprint O] Salary calc — LIFETIME, not month-bound ─────────────
    // Old behavior (this month only) caused widget to show 0 if user hadn't
    // completed anything this month. User wants:
    //   - earnedTotal: lifetime sum value của tasks status='Hoàn tất' (đã nhận)
    //   - pendingTotal: lifetime sum value của tasks pending (Đang thực hiện,
    //     Revision, Sửa frame, Gửi lại, Nhận task, etc.) = "lương dự kiến"
    const now = new Date()
    const completedTasks = tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
    const pendingTasks = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))

    const earnedTotal = completedTasks.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
    const pendingTotal = pendingTasks.reduce((s: number, t: any) => s + Number(t.value || 0), 0)

    // ── [Bonus] Thưởng tháng này của user — hiện rank + cộng vào "Lương đã nhận" ──
    const bonusData = currentUser?.bonuses?.[0]
    const bonusAmount = Number(bonusData?.bonusAmount ?? 0)
    const bonusRank: number | null = bonusData?.rank ?? null
    const bonusPercent = Number(bonusData?.bonusPercent ?? 0)

    // Sparkline: last 14 days completed daily totals (visual decoration only)
    const sparkline = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now)
        d.setDate(d.getDate() - (13 - i))
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const dayEnd = new Date(dayStart.getTime() + 86400000)
        return completedTasks
            .filter((t: any) => {
                const td = new Date(t.updatedAt || t.createdAt)
                return td >= dayStart && td < dayEnd
            })
            .reduce((s: number, t: any) => s + Number(t.value || 0), 0)
    })

    // ── Total Tasks breakdown ───────────────────────────────────
    const inProgressTasks = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status)).length
    const completedCount = completedTasks.length

    // ── Tasks for calendar widget — already pre-filtered to current user
    const calendarTasks = tasks
        .filter((t: any) => !!t.deadline)
        .map((t: any) => ({
            id: t.id,
            title: t.title,
            deadline: t.deadline,
            status: t.status,
        }))

    // ── Profiles list cho top-bar dropdown (giống admin) ────────
    const profilesRaw = await getAvailableProfiles()
    const profiles = (profilesRaw as any[]).map((p: any) => ({
        id: p.id,
        name: p.name,
        logoUrl: p.logoUrl ?? null,
    }))

    // ── Workspaces của profile hiện tại — cho UserWorkspacePicker pill ──
    const workspacesForProfile = profileId
        ? await prisma.workspace.findMany({
              where: { profileId },
              orderBy: { createdAt: 'desc' },
              select: { id: true, name: true, description: true },
          })
        : []

    return (
        <div className="flex flex-col gap-5">
            {/* ── Ambient neon glow (subtle purple radials) — match admin ── */}
            <div
                className="fixed inset-0 pointer-events-none z-0"
                style={{
                    background:
                        'radial-gradient(800px 500px at 10% -8%, rgba(139,92,246,0.06), transparent 55%), ' +
                        'radial-gradient(600px 400px at 95% 105%, rgba(168,85,247,0.04), transparent 50%)',
                }}
            />

            {/* ── Top bar ────────────────────────────────────────── */}
            <UserHomeTopBar
                workspaceName={workspaceName}
                displayName={displayName}
                initials={initials}
                workspaceId={workspaceId}
                userRole={currentUser?.role || 'USER'}
                profiles={profiles}
                currentProfileId={profileId ?? null}
                canSwitchToAdmin={canSwitchToAdmin}
                avatarUrl={currentUser?.avatarUrl}
            />

            {/* ── Action row: Workspace picker pill (left) + Manage widgets (right)
                — 1 row giống admin DashboardActionBar, giảm khoảng trắng dọc và
                căn sát với widget grid bên dưới. Wrap on mobile so pills don't
                squeeze into 2-line text. ── */}
            <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
                <UserWorkspacePicker workspaceId={workspaceId} workspaces={workspacesForProfile} canCreateWorkspace={canCreateWorkspace} />

                {/* Manage widgets — placeholder per plan D.8 */}
                <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="flex items-center gap-1.5 whitespace-nowrap"
                    style={{
                        padding: '8px 16px',
                        borderRadius: 26,
                        background: 'rgba(139,92,246,0.06)',
                        border: '1px dashed rgba(139,92,246,0.20)',
                        color: '#A1A1AA',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        cursor: 'not-allowed',
                        opacity: 0.7,
                    }}
                >
                    <Settings2 className="w-3.5 h-3.5" />
                    Manage widgets
                </button>
            </div>

            {/* ── Pending invitations banner ── */}
            <PendingInvitationsBanner />

            {/* ── [Bonus] Chúc mừng Top N + tiền thưởng (nếu được xếp hạng) ── */}
            {bonusRank && (
                <BonusRankBanner
                    rank={bonusRank}
                    bonusAmount={bonusAmount}
                    bonusPercent={bonusPercent}
                    period={workspaceName}
                />
            )}

            {/* ── Widget grid: 12-col, Row 1 ─────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
                {/* Rankings */}
                <div className="xl:col-span-4 min-h-[328px]">
                    <Suspense
                        fallback={
                            <div className="h-full rounded-[26px] bg-[#0A0A0A] border border-[rgba(139,92,246,0.15)] animate-pulse" />
                        }
                    >
                        <WidgetRankings workspaceId={workspaceId} />
                    </Suspense>
                </div>

                {/* Upcoming Deadlines */}
                <div className="xl:col-span-4 min-h-[328px]">
                    <WidgetUpcomingDeadlines tasks={calendarTasks} />
                </div>

                {/* Net Salary + Total Tasks stacked */}
                <div className="xl:col-span-4 flex flex-col gap-4 min-h-[328px]">
                    <div className="flex-1">
                        <WidgetNetSalary
                            earnedTotal={earnedTotal}
                            pendingTotal={pendingTotal}
                            sparkline={sparkline}
                            bonusAmount={bonusAmount}
                            rank={bonusRank}
                            bonusPercent={bonusPercent}
                        />
                    </div>
                    <div className="flex-1">
                        <WidgetTotalTasks
                            total={tasks.length}
                            progress={inProgressTasks}
                            completed={completedCount}
                        />
                    </div>
                </div>
            </div>

            {/* ── Workflow tabs + table ──────────────────────────── */}
            <UserWorkflowTabs
                tasks={serializeDecimal(tasks) as any}
                workspaceId={workspaceId}
                currentUserId={userId}
                initialTaskId={initialTaskId}
            />

            {/* Safe spacer */}
            <div className="h-10" />
            {/* Marketplace modal portal lives in workspace layout (event mode) — top-bar Store icon dispatches open event */}
        </div>
    )
}
