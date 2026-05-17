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
 *
 * ⚠️ SECURITY WARNING — `rawAllTasks` + `rawCompletedTasks` chứa SENSITIVE
 * fields (`jobPriceUSD`, `exchangeRate`, `wageVND`, `value`) — agency revenue
 * + staff wages. Sprint J P0 đã đánh dấu các fields này là admin-only.
 *
 * **CHỈ gọi helper từ admin-guarded routes** (`/admin/*` đã có
 * `canAccessAdmin` check ở layout). KHÔNG truyền `rawAllTasks` /
 * `rawCompletedTasks` xuống client component nếu viewer là non-admin.
 *
 * Aggregate fields (totalRevenueVND, projectedRevenueVND, ...) có thể pass
 * cho admin client widgets vì đã là sums (không lộ per-task data).
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

    // Raw lists — callers that need transactions/details reuse instead of
    // re-querying (avoids duplicate findMany on hot paths).
    rawAllTasks: any[]
    rawCompletedTasks: any[]
}

export async function computeWorkspaceFinance(
    workspaceId: string,
    profileId?: string,
): Promise<WorkspaceFinanceData> {
    const wsPrisma = getWorkspacePrisma(workspaceId, profileId)
    const exchangeRate = await getExchangeRate()

    // [Sprint O audit-fix] Include assignee here so Finance page transactions
    // list can reuse this result without a 3rd query. Admin home dashboard
    // ignores the include (only sums numbers).
    const [completedTasks, allTasks] = await Promise.all([
        wsPrisma.task.findMany({
            where: { status: 'Hoàn tất' },
            include: { assignee: { select: { id: true, username: true, role: true, nickname: true, displayName: true } } },
            orderBy: { updatedAt: 'desc' },
        }),
        wsPrisma.task.findMany({
            where: { isArchived: false },
            include: { assignee: { select: { id: true, username: true, role: true, nickname: true, displayName: true } } },
            orderBy: { updatedAt: 'desc' },
        }),
    ])

    const totalRevenueVND = completedTasks.reduce(
        (s: number, t: any) =>
            s + Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate),
        0,
    )
    const totalWageVND = completedTasks.reduce(
        // [Sprint O audit-fix] `??` instead of `||` — preserve legitimate
        // wageVND=0 (free task / pro-bono). Falsy `||` would skip 0 and fall
        // back to `value`, double-counting when both fields differ.
        (s: number, t: any) => s + Number((t as any).wageVND ?? t.value ?? 0),
        0,
    )
    const projectedRevenueVND = allTasks.reduce(
        (s: number, t: any) =>
            s + Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || exchangeRate),
        0,
    )
    const projectedWageVND = allTasks.reduce(
        // [Sprint O audit-fix] `??` instead of `||` — preserve legitimate
        // wageVND=0 (free task / pro-bono). Falsy `||` would skip 0 and fall
        // back to `value`, double-counting when both fields differ.
        (s: number, t: any) => s + Number((t as any).wageVND ?? t.value ?? 0),
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
        rawAllTasks: allTasks,
        rawCompletedTasks: completedTasks,
    }
}
