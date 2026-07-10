// [Mobile P1 FR-B4] Đích THẬT của tab "Lương" (BottomNav) — tránh 404 + tránh đè
// /dashboard. Bản TỐI THIỂU: heading + WidgetNetSalary (đồng bộ đúng công thức lương
// của dashboard/page.tsx — LIFETIME earned/pending + thưởng + sparkline). Layout đầy đủ
// M12 = P3. Money-accuracy: dùng đúng SALARY_* constants + sanitizeTaskListForUser.
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { SALARY_PENDING_STATUSES, SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import { sanitizeTaskListForUser } from '@/lib/task-sanitize'
import WidgetNetSalary from '@/components/dashboard/widgets/WidgetNetSalary'

export const dynamic = 'force-dynamic'

export default async function SalaryPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    const userId = session.user.id

    const profileId = await resolveActiveProfileId(userId, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    const currentUser = await (workspacePrisma as any).user.findUnique({
        where: { id: userId },
        select: { bonuses: { where: { workspaceId } } },
    })

    const rawTasks = await (workspacePrisma as any).task.findMany({
        where: { assigneeId: userId, isArchived: false },
        orderBy: { createdAt: 'desc' },
    })
    const tasks = sanitizeTaskListForUser(rawTasks, false)

    // ── Lương LIFETIME (khớp dashboard/page.tsx §Sprint O) ──
    const now = new Date()
    const completedTasks = tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
    const pendingTasks = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const earnedTotal = completedTasks.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
    const pendingTotal = pendingTasks.reduce((s: number, t: any) => s + Number(t.value || 0), 0)

    const bonusData = currentUser?.bonuses?.[0]
    const bonusAmount = Number(bonusData?.bonusAmount ?? 0)
    const bonusRank: number | null = bonusData?.rank ?? null
    const bonusPercent = Number(bonusData?.bonusPercent ?? 0)

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

    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">Thu nhập của tôi</h1>
            <WidgetNetSalary
                earnedTotal={earnedTotal}
                pendingTotal={pendingTotal}
                sparkline={sparkline}
                bonusAmount={bonusAmount}
                rank={bonusRank}
                bonusPercent={bonusPercent}
            />
        </div>
    )
}
