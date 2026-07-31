import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import TaskTable from '@/components/TaskTable'
import MobileTaskView from '@/components/mobile/MobileTaskView'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serializeDecimal } from '@/lib/serialization'
import { Inbox, Sparkles, UserPlus, ListChecks, Filter, Clock } from 'lucide-react'
import { MarketplaceToggle } from '@/components/marketplace/MarketplaceToggle'
import { prisma } from '@/lib/db'
import { isMobileDevice } from '@/lib/device'
import DashboardActionWrapper from '@/components/dashboard/DashboardActionWrapper'
import { dedupeClientsByPath } from '@/lib/client-dedupe'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
import { isProfileOwner } from '@/lib/profile-permissions'

export default async function TaskQueuePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // [Task-loss A1] Reconcile with the workspace's OWN profile — see resolveActiveProfileId.
    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    await checkOverdueTasks(workspaceId)

    // ── Marketplace status ───────────────────────────────────
    let marketplaceOpen = true
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { marketplaceOpen: true } as any
        })
        marketplaceOpen = (workspace as any)?.marketplaceOpen ?? true
    } catch {
        // marketplaceOpen field may not exist in schema yet
    }

    // ── Data fetching (logic unchanged) ──────────────────────
    const tasks = await workspacePrisma.task.findMany({
        include: {
            assignee: {
                select: {
                    id: true, username: true, displayName: true, role: true, nickname: true, avatarUrl: true,
                }
            },
            client: { include: { parent: true } },
            taskTags: { include: { tagCategory: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
    })

    const users = await workspacePrisma.user.findMany({
        where: { role: { notIn: ['CLIENT', 'LOCKED'] } },
        orderBy: { username: 'asc' },
        select: {
            id: true, username: true, displayName: true, role: true, nickname: true, avatarUrl: true,
        }
    })

    // [Z+1.fix7] "Đang đợi giao" = task chờ phân công/giao việc — thuộc về queue
    // dù có thể đã có assignee tạm. Hiện trước đây chỉ filter !assigneeId →
    // task có assignee + status "Đang đợi giao" bị invisible ở mọi trang.
    const unassignedTasks = tasks.filter(t => !t.assigneeId || t.status === 'Đang đợi giao')
    const count = unassignedTasks.length

    // ── Task type breakdown for mini stats ───────────────────
    const shortForm = unassignedTasks.filter((t: any) => t.type === 'Short form').length
    const longForm  = unassignedTasks.filter((t: any) => t.type === 'Long form').length
    const trial     = unassignedTasks.filter((t: any) => t.type === 'Trial').length

    // [Owner review 2026-07-11 / Cách A] Trên MOBILE, tab "Task" = BẢNG THEO DÕI TIẾN ĐỘ đầy đủ
    // (TẤT CẢ task theo status, thẻ tối giản) thay vì chỉ hàng chờ giao — đây là "theo dõi tiến độ"
    // chủ dự án tìm mãi không thấy. Desktop giữ nguyên trang hàng chờ giao bên dưới (không đụng).
    if (await isMobileDevice()) {
        // [Mobile P2 §2b] FAB → Add Task: reuse DashboardActionWrapper (variant="fab") + its
        // AddTaskModal/submit flow. Fetch the same props admin/page.tsx feeds it — no new action.
        const canCreateWorkspace = await isProfileOwner(session.user.id, profileId)
        const allClientsRaw = await workspacePrisma.client.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, parentId: true, parent: { select: { name: true } } },
            orderBy: { name: 'asc' },
        })
        const allClients = dedupeClientsByPath(allClientsRaw)
        const pricingRulesRaw = await prisma.pricingRule.findMany({
            where: { workspaceId },
            select: { id: true, name: true, clientId: true, ruleType: true, config: true, isDefault: true },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        })
        const finance = await computeWorkspaceFinance(workspaceId, profileId)
        const workspacesForProfile = await prisma.workspace.findMany({
            where: { profileId },
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, description: true },
        })

        return (
            <>
                <MobileTaskView
                    tasks={serializeDecimal(tasks) as any}
                    isAdmin={true}
                    users={users}
                    workspaceId={workspaceId}
                    minimal
                />
                <DashboardActionWrapper
                    variant="fab"
                    workspaceId={workspaceId}
                    clients={allClients.map((c) => ({ ...c, id: String(c.id), parentId: c.parentId ? String(c.parentId) : null }))}
                    users={users.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, displayName: u.displayName }))}
                    workspaces={workspacesForProfile}
                    userRole={session.user.role}
                    canCreateWorkspace={canCreateWorkspace}
                    pricingRules={pricingRulesRaw.map((r) => ({ id: r.id, name: r.name, clientId: r.clientId, ruleType: r.ruleType, config: r.config, isDefault: r.isDefault }))}
                    exchangeRate={finance.exchangeRate}
                />
            </>
        )
    }

    return (
        <div className="flex flex-col gap-5 max-w-5xl mx-auto">

            {/* ── Page Header ─────────────────────────────── */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    {/* Icon container */}
                    <div
                        className="flex items-center justify-center rounded-xl"
                        style={{
                            width: 40, height: 40,
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.25)',
                        }}
                    >
                        <Inbox className="w-5 h-5" style={{ color: '#A5B4FC' }} />
                    </div>
                    <div>
                        <h1 className="font-extrabold text-white tracking-tight" style={{ fontSize: 20 }}>
                            Kho Task Đợi
                        </h1>
                        <p className="text-muted-foreground mt-px" style={{ fontSize: 12 }}>
                            Danh sách các công việc chờ xử lí/phân công. Vui lòng phân công cho nhân viên.
                        </p>
                    </div>
                </div>

                {/* Count badge */}
                <div
                    className="flex items-center rounded-full"
                    style={{
                        gap: 6,
                        padding: '6px 14px',
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.25)',
                    }}
                >
                    <span className="font-extrabold" style={{ fontSize: 18, color: '#A5B4FC' }}>
                        {count}
                    </span>
                    <span className="font-semibold" style={{ fontSize: 11, color: 'hsl(var(--primary))' }}>
                        Task
                    </span>
                </div>
            </div>

            {/* ── Marketplace Toggle ─────────────────────────── */}
            <MarketplaceToggle workspaceId={workspaceId} initialOpen={marketplaceOpen} />

            {/* ── Assignment Banner ────────────────────────── */}
            {count > 0 && (
                <div
                    className="flex items-center"
                    style={{
                        gap: 12,
                        padding: '12px 18px',
                        borderRadius: 16,
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.15)',
                    }}
                >
                    {/* Left icon */}
                    <div
                        className="flex items-center justify-center flex-shrink-0"
                        style={{
                            width: 36, height: 36,
                            borderRadius: 10,
                            background: 'rgba(99,102,241,0.20)',
                        }}
                    >
                        <UserPlus className="w-[18px] h-[18px]" style={{ color: '#A5B4FC' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold" style={{ fontSize: 13, color: '#E0E7FF' }}>
                            Phân công
                        </div>
                        <div style={{ fontSize: 11, color: '#818CF8' }}>
                            Chọn task bên dưới và nhấn nút phân công
                        </div>
                    </div>
                </div>
            )}

            {/* ── Table Card ──────────────────────────────── */}
            <div
                className="overflow-hidden"
                style={{
                    borderRadius: 20,
                    background: 'hsl(var(--surface-1))',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.30)',
                }}
            >
                {/* Card Header */}
                <div
                    className="flex justify-between items-center"
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-muted-foreground" />
                        <span className="font-bold text-white" style={{ fontSize: 13 }}>
                            Danh sách chờ phân công
                        </span>
                    </div>
                    {count > 0 && (
                        <div className="flex items-center gap-2">
                            {/* Type count badges */}
                            {shortForm > 0 && (
                                <span
                                    className="font-semibold text-muted-foreground"
                                    style={{
                                        fontSize: 11,
                                        padding: '4px 10px',
                                        borderRadius: 999,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    Ngắn {shortForm}
                                </span>
                            )}
                            {longForm > 0 && (
                                <span
                                    className="font-semibold text-muted-foreground"
                                    style={{
                                        fontSize: 11,
                                        padding: '4px 10px',
                                        borderRadius: 999,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    Dài {longForm}
                                </span>
                            )}
                            {trial > 0 && (
                                <span
                                    className="font-semibold text-muted-foreground"
                                    style={{
                                        fontSize: 11,
                                        padding: '4px 10px',
                                        borderRadius: 999,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    Thử {trial}
                                </span>
                            )}
                            {/* View filter button */}
                            <div
                                className="flex items-center gap-1 cursor-pointer"
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    background: 'rgba(99,102,241,0.12)',
                                    border: '1px solid rgba(99,102,241,0.25)',
                                    color: '#A5B4FC',
                                    fontSize: 11,
                                    fontWeight: 700,
                                }}
                            >
                                <Filter className="w-3 h-3" />
                                <span>Xem</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Card Body */}
                <div className="p-5">
                    {count > 0 ? (
                        <TaskTable tasks={serializeDecimal(unassignedTasks) as any} isAdmin={true} users={users} workspaceId={workspaceId} isMobile={await isMobileDevice()} />
                    ) : (
                        /* ── Animated Empty State ─────────────── */
                        <div className="flex flex-col items-center justify-center py-20 gap-6">
                            {/* Glowing orb animation */}
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/10 blur-2xl absolute inset-0 animate-pulse" />
                                <div
                                    className="relative w-28 h-28 rounded-full flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(16,185,129,0.20), rgba(5,150,105,0.10))',
                                        border: '1px solid rgba(16,185,129,0.30)',
                                        boxShadow: '0 0 40px rgba(16,185,129,0.10)',
                                    }}
                                >
                                    <div
                                        className="w-20 h-20 rounded-full flex items-center justify-center animate-spin"
                                        style={{
                                            animationDuration: '8s',
                                            background: 'linear-gradient(135deg, rgba(16,185,129,0.30), transparent)',
                                            border: '1px solid rgba(52,211,153,0.20)',
                                        }}
                                    >
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{
                                                background: '#34D399',
                                                boxShadow: '0 0 10px rgba(52,211,153,0.8)',
                                            }}
                                        />
                                    </div>
                                    <Sparkles className="absolute w-8 h-8 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                                </div>
                            </div>

                            {/* Message */}
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-zinc-100">Kho đang trống!</h3>
                                <p className="text-muted-foreground text-sm max-w-xs">
                                    Tuyệt vời — mọi công việc đều đã được phân công
                                </p>
                            </div>

                            {/* Mini Stats pills */}
                            <div className="flex items-center gap-3 flex-wrap justify-center">
                                <div
                                    className="flex items-center gap-2 text-emerald-400 text-xs font-semibold"
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 12,
                                        background: 'rgba(16,185,129,0.10)',
                                        border: '1px solid rgba(16,185,129,0.20)',
                                    }}
                                >
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    Đã phân công hết task
                                </div>
                                <div
                                    className="flex items-center gap-2 text-muted-foreground text-xs"
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 12,
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                    }}
                                >
                                    <Clock className="w-3 h-3" />
                                    Tổng: {tasks.length} task trong workspace
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
