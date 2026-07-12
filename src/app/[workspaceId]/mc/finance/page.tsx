// [Giao diện 2 · Mission Control · M5 Finance] Tab Tài chính (cùng shell với M4 Payroll).
// Reuse computeWorkspaceFinance (nguồn duy nhất) → THỰC TẾ (Hoàn tất) vs DỰ KIẾN (mọi task) +
// nhật ký giao dịch per-task. Admin-gated; per-task tiền tính server-side (không pass jobPriceUSD thô).
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
import { extractPayrollCycle } from '@/lib/payroll-cycle'
import { getDisplayName } from '@/lib/display-name'
import McFinanceBoard, { type McFinanceData, type McFinanceTxn } from '@/components/mission-control/McFinanceBoard'

export const dynamic = 'force-dynamic'

const STATUS_HEX: Record<string, string> = {
    'Đang đợi giao': '#A855F7', 'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
const GRADIENTS = [
    'linear-gradient(135deg,#6366F1,#8B5CF6)', 'linear-gradient(135deg,#10B981,#06B6D4)', 'linear-gradient(135deg,#EC4899,#F43F5E)',
    'linear-gradient(135deg,#A855F7,#EC4899)', 'linear-gradient(135deg,#F59E0B,#EAB308)', 'linear-gradient(135deg,#06B6D4,#3B82F6)',
]
function grad(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADIENTS[h % GRADIENTS.length] }
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return (name.trim().slice(0, 2) || '?').toUpperCase()
}

export default async function MissionControlFinancePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Admin gate — finance surfaces revenue ($) + wages. Fail closed → dashboard.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')

    const [workspace, currentUser, finance] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
        getWorkspacePrisma(workspaceId, profileId).user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true, nickname: true } }),
        computeWorkspaceFinance(workspaceId, profileId),
    ])

    const cycle = extractPayrollCycle(workspace?.name)
    const rate = Number(finance.exchangeRate) || 0

    // Per-task transactions from the admin-only raw list — money computed server-side (no jobPriceUSD leak).
    const txns: McFinanceTxn[] = (finance.rawAllTasks as any[]).map((t) => {
        const revenueVND = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || rate)
        const wageVND = Number(t.wageVND ?? t.value ?? 0)
        const name = t.assignee ? getDisplayName(t.assignee) : 'Chưa giao'
        return {
            id: t.id, title: t.title || 'Untitled', status: t.status,
            statusHex: STATUS_HEX[t.status] || '#A1A1AA', statusLabel: STATUS_LABEL[t.status] || t.status,
            isCompleted: t.status === 'Hoàn tất',
            assignee: name, initials: initials(name), avatar: grad(t.assigneeId || name),
            revenueVND, wageVND, profitVND: revenueVND - wageVND,
        }
    })

    const data: McFinanceData = {
        workspaceId,
        backHref: `/${workspaceId}/admin`,
        periodLabel: `Tháng ${cycle.month}/${cycle.year}`,
        currentUserInitials: initials(getDisplayName(currentUser, { fallback: 'Admin' })),
        actual: { revenueVND: finance.totalRevenueVND, wageVND: finance.totalWageVND, profitVND: finance.netProfit, marginPct: finance.profitMargin, count: finance.completedCount },
        projected: { revenueVND: finance.projectedRevenueVND, wageVND: finance.projectedWageVND, profitVND: finance.projectedNetProfit, marginPct: finance.projectedMargin, count: finance.allTasksCount },
        txns,
        exchangeRate: rate,
        payrollHref: `/${workspaceId}/mc/tien`,
    }

    return <McFinanceBoard data={data} />
}
