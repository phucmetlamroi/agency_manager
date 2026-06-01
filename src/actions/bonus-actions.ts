'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { verifyWorkspaceAccess } from '@/lib/security'

/**
 * Extract payroll cycle (month/year) từ workspace.name format "MM / YYYY".
 * Vd: "04 / 2026" → { month: 4, year: 2026 }
 *
 * Trước đây code hardcode `month=0, year=0` cho mọi workspace → KHÔNG truy vết
 * được lương theo tháng (year-end report sai, audit khó). Pattern này thống nhất
 * với cách payroll/bonus actions đã extract trước đây.
 *
 * Fallback: nếu workspace.name không có format tháng/năm → dùng current date.
 */
function extractPayrollCycle(workspaceName: string | null | undefined): { month: number; year: number } {
    if (workspaceName) {
        const match = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
        if (match) {
            const month = parseInt(match[1], 10)
            const year = parseInt(match[2], 10)
            if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
                return { month, year }
            }
        }
    }
    // Fallback: workspace name không có format MM/YYYY → dùng tháng/năm hiện tại
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }
}

const toSafeNumber = (value: unknown): number => {
    if (value == null) return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    }
    if (typeof value === 'bigint') return Number(value)
    if (typeof value === 'object' && value !== null) {
        const maybeDecimal = value as { toNumber?: () => number; toString?: () => string }
        if (typeof maybeDecimal.toNumber === 'function') {
            const parsed = maybeDecimal.toNumber()
            return Number.isFinite(parsed) ? parsed : 0
        }
        if (typeof maybeDecimal.toString === 'function') {
            const parsed = Number(maybeDecimal.toString())
            return Number.isFinite(parsed) ? parsed : 0
        }
    }
    const fallback = Number(value)
    return Number.isFinite(fallback) ? fallback : 0
}

export async function getPayrollLockStatus(workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        // Lấy workspace name → extract month/year thực
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true }
        })
        const { month, year } = extractPayrollCycle(workspace?.name)

        const lock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: {
                    month,
                    year,
                    workspaceId
                }
            } as any
        })
        return { isLocked: lock?.isLocked ?? false }
    } catch {
        return { isLocked: false }
    }
}

export async function revertMonthlyBonus(workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check (was global ADMIN/Treasurer only).
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true, name: true }
        })
        if (!workspace) return { success: false, error: 'Workspace not found.' }

        // Extract month/year từ workspace name (vd "04 / 2026") thay vì hardcode 0
        const { month: currentMonth, year: currentYear } = extractPayrollCycle(workspace.name)

        await workspacePrisma.monthlyBonus.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })
        await workspacePrisma.monthlyRank.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })
        await workspacePrisma.payrollLock.deleteMany({
            where: { workspaceId, month: currentMonth, year: currentYear }
        })

        // Audit log: revert bonus là action quan trọng cần trace
        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId,
                    actorUserId: (await getSession())?.user?.id ?? null,
                    action: 'payroll.bonus_reverted',
                    targetType: 'PayrollLock',
                    targetId: `${currentMonth}-${currentYear}`,
                    beforeData: { month: currentMonth, year: currentYear, isLocked: true },
                    afterData: { unlocked: true },
                }
            })
        } catch { /* non-blocking */ }

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true, message: 'Da hoan tac va mo khoa ky luong.' }
    } catch (error: any) {
        console.error('Error reverting bonus:', error)
        return { success: false, error: `Failed to revert: ${error?.message || 'Unknown error'}` }
    }
}

/**
 * Ranking algorithm:
 * 1. Primary: incomeScore = max(0, tentativeRevenue - totalPenalty) (DESC)
 * 2. Tie-breaker #1: errorRate (ASC)
 * 3. Tie-breaker #2: rankScore priority (DESC)
 * 4. Tie-breaker #3: tasksCompleted (DESC), then revenue (DESC), then username (ASC)
 */
export async function calculateMonthlyBonus(workspaceId: string) {
    let stage = 'init'
    try {
        stage = 'permission-check'
        // SECURITY: workspace-scoped admin check (was global ADMIN/Treasurer only).
        const { session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        stage = 'prisma-workspace'
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        stage = 'workspace-find'
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true, name: true }
        })
        if (!workspace) return { success: false, error: 'Workspace not found.' }

        // Tasks vẫn được aggregate theo workspaceId (1 workspace = 1 cycle).
        // NHƯNG payrollLock + bonus + monthlyRank records phải lưu month/year THỰC
        // (extracted từ workspace.name format "MM / YYYY") để truy vết được trong
        // year-end report, audit, và phân tích history. Hardcode month=0/year=0
        // trước đây gây mất dữ liệu cycle — tất cả workspace đều ghi cùng key (0,0,wsId).
        const { month: currentMonth, year: currentYear } = extractPayrollCycle(workspace.name)

        stage = 'lock-check'
        const existingLock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId
                }
            } as any
        })
        if (existingLock?.isLocked) {
            return { success: false, error: 'Ky luong nay da bi khoa.' }
        }

        stage = 'aggregate-completed'
        const completedTaskAggregates = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                workspaceId,
                assigneeId: { not: null },
                status: SALARY_COMPLETED_STATUS
            },
            _sum: { value: true },
            _count: { _all: true }
        })

        const totalTasksFound = completedTaskAggregates.reduce((acc, row) => acc + row._count._all, 0)
        if (totalTasksFound === 0) {
            return { success: false, error: 'Khong co du lieu task hoan tat.' }
        }

        stage = 'aggregate-pending'
        const pendingTaskAggregates = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: {
                workspaceId,
                assigneeId: { not: null },
                status: { in: SALARY_PENDING_STATUSES }
            },
            _sum: { value: true }
        })

        // Use calculatedScore directly to avoid fragile relation join with ErrorDictionary.
        stage = 'aggregate-penalty'
        const penaltyAggregates = await workspacePrisma.errorLog.groupBy({
            by: ['userId'],
            where: {
                workspaceId
            },
            _sum: { calculatedScore: true }
        })

        const candidateUserIds = Array.from(
            new Set(completedTaskAggregates.map(row => row.assigneeId).filter(Boolean) as string[])
        )
        if (candidateUserIds.length === 0) {
            return { success: false, error: 'Khong tim thay nhan su hop le.' }
        }

        stage = 'users-find-many'
        const users = await workspacePrisma.user.findMany({
            where: {
                id: { in: candidateUserIds },
                // [Sprint Z] Admin username filter removed (admin user deleted)
                role: { notIn: ['ADMIN', 'CLIENT', 'LOCKED'] }
            },
            select: {
                id: true,
                username: true,
                nickname: true
            }
        })

        const completedByUserId = new Map(
            completedTaskAggregates
                .filter(row => row.assigneeId)
                .map(row => [
                    row.assigneeId as string,
                    {
                        tasksCompleted: row._count._all,
                        revenue: toSafeNumber(row._sum.value)
                    }
                ])
        )
        const pendingByUserId = new Map(
            pendingTaskAggregates
                .filter(row => row.assigneeId)
                .map(row => [row.assigneeId as string, toSafeNumber(row._sum.value)])
        )
        const penaltyByUserId = new Map(
            penaltyAggregates.map(row => [row.userId, toSafeNumber(row._sum.calculatedScore)])
        )

        interface UserRanking {
            userId: string
            username: string
            revenue: number
            pendingRevenue: number
            tentativeRevenue: number
            tasksCompleted: number
            monthlySalary: number
            totalPenalty: number
            errorRate: number
            rankScore: string
            incomeScore: number
        }

        const rankings: UserRanking[] = []
        for (const user of users) {
            const completed = completedByUserId.get(user.id)
            if (!completed || completed.tasksCompleted <= 0) continue

            const revenue = completed.revenue
            const tasksCompleted = completed.tasksCompleted
            const pendingRevenue = pendingByUserId.get(user.id) || 0
            const totalPenalty = penaltyByUserId.get(user.id) || 0
            const tentativeRevenue = revenue + pendingRevenue
            const errorRate = tasksCompleted >= 8 ? Number((totalPenalty / tasksCompleted).toFixed(2)) : 0

            let rankScore = 'UNRANKED'
            if (tasksCompleted >= 8) {
                if (errorRate < 0.3) rankScore = 'S'
                else if (errorRate <= 0.6) rankScore = 'A'
                else if (errorRate <= 1.0) rankScore = 'B'
                else if (errorRate <= 1.5) rankScore = 'C'
                else rankScore = 'D'
            }

            rankings.push({
                userId: user.id,
                username: user.nickname || user.username,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                tasksCompleted,
                monthlySalary: revenue,
                totalPenalty,
                errorRate,
                rankScore,
                incomeScore: Math.max(0, tentativeRevenue - totalPenalty)
            })
        }

        if (rankings.length === 0) {
            return { success: false, error: 'Khong co nhan su hop le de xep hang.' }
        }

        stage = 'sort-rankings'
        // [Bonus Config] Xếp hạng theo "Thực nhận" = tổng doanh thu (task.value) từ task
        // Hoàn tất, giảm dần (khớp đúng cột 'Thực nhận' trên thẻ). Phá hòa: nhiều task
        // hơn → username (ổn định).
        rankings.sort((a, b) => {
            if (Math.abs(b.revenue - a.revenue) > 0.01) return b.revenue - a.revenue
            if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted
            return a.username.localeCompare(b.username, 'vi')
        })

        // [Bonus Config] Tải cấu hình thưởng theo team (profile). Chưa có → luật cũ.
        const cfg = workspace.profileId
            ? await prisma.bonusConfig.findUnique({ where: { profileId: workspace.profileId } })
            : null
        const isHustly = workspace.profileId === '61f25775-eb95-4ece-96e8-99ae97542af1'
        // tiers = % cho từng hạng đang BẬT (Top1 → Top3). maxWinners = số hạng bật.
        const tiers: number[] = []
        if (cfg) {
            if (cfg.top1Enabled) tiers.push(toSafeNumber(cfg.top1Percent))
            if (cfg.top2Enabled) tiers.push(toSafeNumber(cfg.top2Percent))
            if (cfg.top3Enabled) tiers.push(toSafeNumber(cfg.top3Percent))
        } else {
            tiers.push(isHustly ? 15 : 10, isHustly ? 10 : 5)
        }
        const maxWinners = tiers.length

        // Đủ điều kiện = có "Thực nhận" (tổng task.value Hoàn tất) > 0.
        const eligibleForBonus = rankings.filter(r => r.revenue > 0)


        // ── 5. PERSISTENCE ───────────────────────────────────────────
        // We do this in a single "pseudo-transaction" block: delete then create.
        // If calculation reached here, it's safe to clear old records.
        stage = 'persist-transaction'
        
        await prisma.$transaction([
            // Clear old data for this month/workspace
            prisma.monthlyBonus.deleteMany({
                where: { month: currentMonth, year: currentYear, workspaceId }
            }),
            prisma.monthlyRank.deleteMany({
                where: { month: currentMonth, year: currentYear, workspaceId }
            }),
            // Upsert the Lock
            prisma.payrollLock.upsert({
                where: {
                    month_year_workspaceId: {
                        month: currentMonth,
                        year: currentYear,
                        workspaceId
                    }
                } as any,
                update: {
                    isLocked: true,
                    lockedAt: new Date(),
                    lockedBy: session.user.id,
                    profileId: workspace.profileId ?? null
                },
                create: {
                    month: currentMonth,
                    year: currentYear,
                    workspaceId,
                    profileId: workspace.profileId ?? null,
                    isLocked: true,
                    lockedBy: session.user.id
                }
            })
        ])

        const awardedBonuses: Array<{
            userId: string
            username: string
            rank: number
            percent: number
            bonusAmount: number
        }> = []

        // Create new bonuses
        if (eligibleForBonus.length > 0) {
            stage = 'persist-create-bonuses'
            for (let i = 0; i < Math.min(maxWinners, eligibleForBonus.length); i++) {
                const user = eligibleForBonus[i]
                const percent = tiers[i]
                // [Bonus Config] Thưởng = % × "Thực nhận" (tổng task.value Hoàn tất) của người đó.
                const bonusAmount = user.revenue * (percent / 100)

                await prisma.monthlyBonus.create({
                    data: {
                        userId: user.userId,
                        month: currentMonth,
                        year: currentYear,
                        workspaceId,
                        profileId: workspace.profileId ?? null,
                        rank: i + 1,
                        revenue: user.revenue,
                        executionTimeHours: 0,
                        bonusPercent: percent,
                        bonusAmount
                    }
                })

                awardedBonuses.push({
                    userId: user.userId,
                    username: user.username,
                    rank: i + 1,
                    percent,
                    bonusAmount
                })
            }
        }

        // Create new ranks
        const monthlyRankData = rankings.map(user => ({
            userId: user.userId,
            month: currentMonth,
            year: currentYear,
            workspaceId,
            profileId: workspace.profileId ?? null,
            totalTasks: user.tasksCompleted,
            totalPenalty: user.totalPenalty,
            errorRate: user.errorRate,
            rank: user.rankScore,
            isLocked: true
        }))

        if (monthlyRankData.length > 0) {
            stage = 'persist-create-ranks'
            await prisma.monthlyRank.createMany({ data: monthlyRankData })
        }

        // [Bonus Config] Audit: ghi snapshot cấu hình + kết quả (trước đây chưa ghi).
        try {
            await prisma.auditLog.create({
                data: {
                    workspaceId,
                    actorUserId: session.user.id,
                    action: 'payroll.bonus_calculated',
                    targetType: 'PayrollLock',
                    targetId: `${currentMonth}-${currentYear}`,
                    afterData: { baseAmount: 'completed_task_value', tiers, awarded: awardedBonuses } as any,
                }
            })
        } catch { /* non-blocking */ }

        stage = 'revalidate'
        revalidatePath(`/${workspaceId}/admin/payroll`)
        return {
            success: true,
            bonuses: awardedBonuses,
            month: currentMonth,
            year: currentYear
        }
    } catch (error: any) {
        const detail = error?.message || 'Unknown error'
        const stackLine = typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 2).join(' | ') : ''
        console.error('Error calculating monthly bonus:', { stage, detail, stack: stackLine, error })
        return { success: false, error: `Failed to calculate bonuses [${stage}]: ${detail}` }
    }
}
