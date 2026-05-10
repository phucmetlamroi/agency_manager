import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
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

    // [Sprint O] Compute aggregates via shared helper \u2014 guarantees parity with
    // admin home dashboard's Gross Revenue + Revenue Overview cards.
    // [Sprint O audit-fix] Reuse rawAllTasks from helper (already fetched +
    // includes assignee) \u2014 avoids duplicate findMany previously here.
    const finance = await computeWorkspaceFinance(workspaceId, profileId)

    const transactions = finance.rawAllTasks.slice(0, 50).map((t: any) => {
        const rev = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || finance.exchangeRate)
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
                totalRevenueVND: finance.totalRevenueVND,
                totalWageVND: finance.totalWageVND,
                netProfit: finance.netProfit,
                profitMargin: finance.profitMargin,
                completedCount: finance.completedCount,
                projectedRevenueVND: finance.projectedRevenueVND,
                projectedWageVND: finance.projectedWageVND,
                projectedNetProfit: finance.projectedNetProfit,
                projectedMargin: finance.projectedMargin,
                allTasksCount: finance.allTasksCount,
                pendingCount: finance.pendingCount,
                exchangeRate: finance.exchangeRate,
                transactions,
            }}
        />
    )
}
