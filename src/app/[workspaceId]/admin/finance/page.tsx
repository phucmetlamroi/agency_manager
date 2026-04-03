import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getExchangeRate } from '@/lib/exchange-rate'
import FinanceDashboardClient from '@/components/dashboard/FinanceDashboardClient'

export default async function FinanceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    const profileId = (session?.user as any)?.sessionProfileId
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

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
                <h3>{'\u26D4'} Quy\u1ec1n truy c\u1eadp b\u1ecb t\u1eeb ch\u1ed1i</h3>
                <p>B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n xem b\u00e1o c\u00e1o t\u00e0i ch\u00ednh.</p>
            </div>
        )
    }

    // Fetch current exchange rate
    const exchangeRate = await getExchangeRate()

    // Completed tasks
    const tasks = await workspacePrisma.task.findMany({
        where: { status: 'Ho\u00e0n t\u1ea5t' },
        include: {
            assignee: { select: { id: true, username: true, role: true, nickname: true } }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // All tasks (for projections)
    const allTasks = await workspacePrisma.task.findMany({
        where: { isArchived: false },
        include: {
            assignee: { select: { id: true, username: true, role: true, nickname: true } }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // Calculations
    const totalRevenueVND = tasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate)), 0)
    const totalWageVND = tasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const netProfit = totalRevenueVND - totalWageVND
    const profitMargin = totalRevenueVND > 0 ? (netProfit / totalRevenueVND) * 100 : 0

    const projectedRevenueVND = allTasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate)), 0)
    const projectedWageVND = allTasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const projectedNetProfit = projectedRevenueVND - projectedWageVND
    const projectedMargin = projectedRevenueVND > 0 ? (projectedNetProfit / projectedRevenueVND) * 100 : 0

    // Build transactions for client
    const transactions = allTasks.slice(0, 50).map(t => {
        const rev = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate)
        const wage = Number(t.wageVND || t.value || 0)
        return {
            id: t.id,
            title: t.title,
            status: t.status,
            assignee: t.assignee?.nickname || t.assignee?.username || '\u2014',
            revenueVND: rev,
            wageVND: wage,
            netProfitVND: rev - wage,
            jobPriceUSD: Number(t.jobPriceUSD || 0),
            isCompleted: t.status === 'Ho\u00e0n t\u1ea5t',
        }
    })

    return (
        <FinanceDashboardClient
            data={{
                totalRevenueVND,
                totalWageVND,
                netProfit,
                profitMargin,
                completedCount: tasks.length,
                projectedRevenueVND,
                projectedWageVND,
                projectedNetProfit,
                projectedMargin,
                allTasksCount: allTasks.length,
                pendingCount: allTasks.length - tasks.length,
                exchangeRate,
                transactions,
            }}
        />
    )
}
