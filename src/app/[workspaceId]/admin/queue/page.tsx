import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import TaskTable from '@/components/TaskTable'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { serializeDecimal } from '@/lib/serialization'
import { Package, Sparkles, Users, Clock } from 'lucide-react'
import { MarketplaceToggle } from '@/components/marketplace/MarketplaceToggle'
import { prisma } from '@/lib/db'

export default async function TaskQueuePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const profileId = (session.user as any).sessionProfileId
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    await checkOverdueTasks(workspaceId)

    // ── Marketplace status ───────────────────────────────────
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { marketplaceOpen: true }
    })
    const marketplaceOpen = workspace?.marketplaceOpen ?? true

    // ── Data fetching (logic unchanged) ──────────────────────
    const tasks = await workspacePrisma.task.findMany({
        include: {
            assignee: {
                select: {
                    id: true, username: true, role: true, nickname: true, avatarUrl: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
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
            id: true, username: true, role: true, nickname: true, avatarUrl: true,
            monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
        }
    })

    const unassignedTasks = tasks.filter(t => !t.assigneeId)
    const count = unassignedTasks.length

    // ── Task type breakdown for mini stats ───────────────────
    const shortForm = unassignedTasks.filter((t: any) => t.type === 'Short form').length
    const longForm  = unassignedTasks.filter((t: any) => t.type === 'Long form').length
    const trial     = unassignedTasks.filter((t: any) => t.type === 'Trial').length

    return (
        <div className="space-y-6 max-w-5xl mx-auto">

            {/* ── Page Header ─────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-heading font-bold text-zinc-100 flex items-center gap-3">
                        <Package className="w-8 h-8 text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                        Kho Task Đợi
                    </h1>
                    <p className="text-zinc-500 mt-1 text-sm">Danh sách các công việc chưa có người nhận. Vui lòng phân công cho nhân viên.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2 ${
                        count > 0
                            ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/10'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                        <span className="text-lg">{count}</span>
                        <span>Task</span>
                    </div>
                </div>
            </div>

            {/* ── Marketplace Toggle ─────────────────────────── */}
            <MarketplaceToggle workspaceId={workspaceId} initialOpen={marketplaceOpen} />

            {/* ── Main Card ───────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-zinc-950/60 backdrop-blur-md shadow-xl shadow-black/40">
                {/* ambient glow */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/8 blur-3xl rounded-full pointer-events-none" />

                {/* Header bar */}
                <div className="relative z-10 px-6 pt-6 pb-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold text-zinc-200 flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-400" />
                        Danh sách chờ phân công
                    </h2>
                    {count > 0 && (
                        <div className="flex items-center gap-3 text-xs text-zinc-600">
                            {shortForm > 0 && <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Short {shortForm}</span>}
                            {longForm > 0  && <span className="px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">Long {longForm}</span>}
                            {trial > 0     && <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">Trial {trial}</span>}
                        </div>
                    )}
                </div>

                <div className="relative z-10 p-6">
                    {count > 0 ? (
                        <TaskTable tasks={serializeDecimal(unassignedTasks) as any} isAdmin={true} users={users} workspaceId={workspaceId} />
                    ) : (
                        /* ── Animated Empty State ─────────────── */
                        <div className="flex flex-col items-center justify-center py-20 gap-6">
                            {/* Glowing orb animation */}
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/10 blur-2xl absolute inset-0 animate-pulse" />
                                <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 flex items-center justify-center shadow-xl shadow-emerald-500/10">
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/30 to-transparent border border-emerald-400/20 flex items-center justify-center animate-spin" style={{ animationDuration: '8s' }}>
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                                    </div>
                                    <Sparkles className="absolute w-8 h-8 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                                </div>
                            </div>

                            {/* Message */}
                            <div className="text-center space-y-2">
                                <h3 className="text-xl font-bold text-zinc-100">Kho đang trống!</h3>
                                <p className="text-zinc-500 text-sm max-w-xs">
                                    Tuyệt vời — mọi công việc đều đã được phân công cho nhân viên.
                                </p>
                            </div>

                            {/* Mini Stats pills */}
                            <div className="flex items-center gap-3 flex-wrap justify-center">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    All tasks assigned
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800/60 border border-white/5 text-zinc-500 text-xs">
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
