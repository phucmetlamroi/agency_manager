import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getExchangeRate } from '@/lib/exchange-rate'

/**
 * [Sprint O] Single-source-of-truth finance computation for a workspace.
 *
 * Both the Finance dashboard page (`/admin/finance`) and the Admin home
 * dashboard's "Gross Revenue" + "Revenue Overview" widgets use this helper
 * to ensure all dashboards show the same numbers.
 *
 * Logic mirrors `/admin/finance/page.tsx` (pre-refactor):
 *  - Revenue = Σ jobPriceUSD × exchangeRate (per-task rate w/ fallback)
 *  - Cost    = Σ wageVND ?? value
 *  - Actual ("thực tế") filter: status === 'Hoàn tất'
 *  - Projected ("dự kiến") filter: isArchived === false
 */
export interface WorkspaceFinanceData {
    // Actual — completed only ("Thực tế đã hoàn thành")
    totalRevenueVND: number
    totalWageVND: number
    netProfit: number
    profitMargin: number
    completedCount: number

    // Projected — all non-archived ("Dự kiến toàn bộ")
    projectedRevenueVND: number
    projectedWageVND: number
    projectedNetProfit: number
    projectedMargin: number
    pendingCount: number
    allTasksCount: number

    // Convert helper
    exchangeRate: number
}

export async function computeWorkspaceFinance(
    workspaceId: string,
    profileId?: string,
): Promise<WorkspaceFinanceData> {
    const wsPrisma = getWorkspacePrisma(workspaceId, profileId)
    const exchangeRate = await getExchangeRate()

    const [completedTasks, allTasks] = await Promise.all([
        wsPrisma.task.findMany({ where: { status: 'Hoàn tất' } }),
        wsPrisma.task.findMany({ where: { isArchived: false } }),
    ])

    const totalRevenueVND = completedTasks.reduce(
        (s: number, t: any) =>
            s + Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate),
        0,
    )
    const totalWageVND = completedTasks.reduce(
        (s: number, t: any) => s + Number((t as any).wageVND || t.value || 0),
        0,
    )
    const projectedRevenueVND = allTasks.reduce(
        (s: number, t: any) =>
            s + Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate),
        0,
    )
    const projectedWageVND = allTasks.reduce(
        (s: number, t: any) => s + Number((t as any).wageVND || t.value || 0),
        0,
    )

    return {
        totalRevenueVND,
        totalWageVND,
        netProfit: totalRevenueVND - totalWageVND,
        profitMargin:
            totalRevenueVND > 0 ? ((totalRevenueVND - totalWageVND) / totalRevenueVND) * 100 : 0,
        completedCount: completedTasks.length,
        projectedRevenueVND,
        projectedWageVND,
        projectedNetProfit: projectedRevenueVND - projectedWageVND,
        projectedMargin:
            projectedRevenueVND > 0
                ? ((projectedRevenueVND - projectedWageVND) / projectedRevenueVND) * 100
                : 0,
        pendingCount: allTasks.length - completedTasks.length,
        allTasksCount: allTasks.length,
        exchangeRate,
    }
}
