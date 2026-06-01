import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import BonusCalculator from './BonusCalculator'
import PayrollCard from '@/components/admin/PayrollCard'
import PayrollKpiStrip from '@/components/admin/PayrollKpiStrip'
import { serializeDecimal } from '@/lib/serialization'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

function extractMonthParam(workspaceName?: string | null): string | null {
    if (!workspaceName) return null
    const match = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (!match) return null
    const month = match[1].padStart(2, '0')
    const year = match[2]
    return `${year}-${month}`
}

export default async function PayrollPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const workspace = await workspacePrisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true }
    })

    const users = await workspacePrisma.user.findMany({
        where: {
            username: { not: 'admin' }
        },
        include: {
            tasks: {
                where: {
                    workspaceId,
                    status: { in: [SALARY_COMPLETED_STATUS, ...SALARY_PENDING_STATUSES] }
                },
                orderBy: { updatedAt: 'desc' },
                include: {
                    assignee: {
                        select: {
                            id: true,
                            username: true,
                            role: true,
                            nickname: true
                        }
                    }
                }
            },
            bonuses: {
                where: {
                    workspaceId
                }
            },
            payrolls: {
                where: {
                    workspaceId
                }
            }
        },
        orderBy: { username: 'asc' }
    })

    const activeUsers = users.filter(user => {
        const hasCompleted = user.tasks.some(task => task.status === SALARY_COMPLETED_STATUS)
        const hasPending = user.tasks.some(task => SALARY_PENDING_STATUSES.includes(task.status))
        const hasBonus = user.bonuses.length > 0
        const hasPayroll = user.payrolls.length > 0
        return hasCompleted || hasPending || hasBonus || hasPayroll
    })

    activeUsers.sort((a, b) => {
        const rankA = a.bonuses[0]?.rank || 999
        const rankB = b.bonuses[0]?.rank || 999
        if (rankA !== rankB) return rankA - rankB
        return a.username.localeCompare(b.username, 'vi')
    })

    const serializedUsers = serializeDecimal(activeUsers)

    // ── KPI tổng quan (thuần tổng hợp dữ liệu ĐÃ fetch để hiển thị; khớp đúng
    //    cách tính của PayrollCard — không chạm DB/API/logic) ──────────────
    const kpiTotals = serializedUsers.reduce(
        (acc: { net: number; est: number; people: number; done: number; unpaid: number }, u: any) => {
            const completed = u.tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
            const pending = u.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
            const taskIncome = completed.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
            const pendingIncome = pending.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
            const bonusAmount = Number(u.bonuses?.[0]?.bonusAmount || 0)
            const isPaid = u.payrolls?.[0]?.status === 'PAID'
            acc.net += taskIncome + bonusAmount
            acc.est += pendingIncome
            acc.done += completed.length
            if (!isPaid) acc.unpaid += 1
            return acc
        },
        { net: 0, est: 0, people: serializedUsers.length, done: 0, unpaid: 0 }
    )

    const session = await getSession()
    if (!session) redirect('/login')

    const currentUser = await workspacePrisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, isTreasurer: true }
    })
    const canCalculateBonus = currentUser?.role === 'ADMIN' || currentUser?.isTreasurer
    const canExportMonthlyXlsx = currentUser?.role === 'ADMIN'
    const monthParam = extractMonthParam(workspace?.name)
    const exportUrl = monthParam
        ? `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}&month=${monthParam}`
        : `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}`

    return (
        <div className="max-w-[1200px] mx-auto">
            {/* Header — responsive: stack on mobile, row on desktop */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:mb-8">
                <div>
                    <h2 className="title-gradient text-2xl sm:text-3xl m-0 font-extrabold tracking-tight">Bảng lương & Thu nhập</h2>
                    <p className="text-zinc-500 mt-2 text-sm">
                        Workspace: <span className="text-white font-semibold">{workspace?.name}</span> · Tính trên các task đã "{SALARY_COMPLETED_STATUS}".
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canExportMonthlyXlsx && (
                        <a
                            href={exportUrl}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[20px] border border-[rgba(139,92,246,0.15)] text-[#D8B4FE] text-[13px] font-semibold no-underline hover:bg-[rgba(139,92,246,0.06)] transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Export XLSX
                        </a>
                    )}
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-[20px] bg-[#121016] border border-[rgba(139,92,246,0.1)] text-[#A1A1AA] text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
                        Workspace · Isolated
                    </div>
                </div>
            </div>

            {/* KPI tổng quan — đồng bộ chất liệu với Dashboard */}
            <div className="mb-6 sm:mb-8">
                <PayrollKpiStrip totals={kpiTotals} />
            </div>

            {canCalculateBonus && (
                <div className="mb-6 flex justify-start sm:justify-end">
                    <BonusCalculator workspaceId={workspaceId} />
                </div>
            )}

            <div className="flex flex-col gap-6 sm:gap-8">
                {serializedUsers.map((user: any) => (
                    <PayrollCard
                        key={user.id}
                        user={user}
                        currentMonth={0}
                        currentYear={0}
                        workspaceId={workspaceId}
                    />
                ))}

                {serializedUsers.length === 0 && (
                    <div className="text-center py-12 text-zinc-500">
                        Không có dữ liệu lương trong tháng này.
                    </div>
                )}
            </div>
        </div>
    )
}
