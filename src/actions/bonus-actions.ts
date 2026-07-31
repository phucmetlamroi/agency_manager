'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { verifyWorkspaceAccess } from '@/lib/security'
// [AUDIT R5] extractPayrollCycle moved to a shared helper so payroll-actions
// (Payroll row + revert lock lookup) and this module (PayrollLock creation) always
// derive the SAME cycle key from workspace.name. Previously each had its own notion
// and the payroll page hardcoded (0,0), leaving the anti-fraud lock unmatchable.
import { extractPayrollCycle } from '@/lib/payroll-cycle'

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
        // [AUDIT SWEEP fix · P1-023] Hàm này TRƯỚC ĐÂY không có cổng nào: một POST tới action id của
        // nó (id nằm trong chunk công khai) đọc được bit "kỳ lương đã chốt chưa" của workspaceId BẤT
        // KỲ. Rò một bit, không phải lỗ tiền — nhưng nó là bit về trạng thái nội bộ của tenant khác.
        // Đặt cổng TRONG `try` là fail-closed sẵn: SECURITY_VIOLATION rơi vào catch → { isLocked: false }.
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
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

/**
 * [AUDIT SWEEP-2026-07-30 fix] MỞ LẠI MỘT KỲ LƯƠNG ĐÃ TRẢ.
 *
 * Trước đây hàm này xoá `PayrollLock` của kỳ với ĐÚNG MỘT cổng ADMIN — không kiểm có hàng Payroll
 * nào đã `PAID` chưa, không transaction, không advisory lock, và nhật ký ghi theo kiểu best-effort
 * (`try/catch` rỗng) nên có thể mở khoá thành công mà KHÔNG để lại vết. Tệ hơn: `beforeData` ghi
 * cứng `isLocked: true` bất kể trạng thái thật.
 * Tài liệu chống gian lận trong repo mô tả một chốt "super admin + cờ xác nhận" KHÔNG tồn tại trong mã.
 *
 * Quyết định của chủ dự án (2026-07-30): CHO mở lại, nhưng có ma sát —
 *   · siết cổng lên OWNER theo vị ngữ KÉP `workspaceRole === 'OWNER' || profileRole === 'OWNER'`
 *     (khuôn security.ts). KHÔNG dùng riêng profileRole: cách đó khoá oan OWNER-theo-WorkspaceMember
 *     của các workspace cũ.
 *   · nếu kỳ CÓ hàng Payroll đã PAID thì bắt buộc cờ xác nhận tường minh.
 *   · ghi AuditLog kèm SỐ hàng PAID và TỔNG TIỀN bị mở, và ghi CHẶN (không best-effort) — mất vết
 *     trên một thao tác mở kỳ đã trả tiền thì bản thân việc mở khoá không nên xảy ra.
 */
export async function revertMonthlyBonus(
    workspaceId: string,
    opts?: { confirmUnlockPaid?: boolean },
) {
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const isOwner = access.workspaceRole === 'OWNER' || access.profileRole === 'OWNER'
        if (!isOwner) {
            return { success: false, error: 'Chỉ chủ sở hữu (Owner) mới được hoàn tác và mở khoá kỳ lương.' }
        }

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const workspace = await workspacePrisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true, name: true }
        })
        if (!workspace) return { success: false, error: 'Workspace not found.' }

        // Extract month/year từ workspace name (vd "04 / 2026") thay vì hardcode 0
        const { month: currentMonth, year: currentYear } = extractPayrollCycle(workspace.name)

        // Kỳ này đã trả tiền cho bao nhiêu người, tổng bao nhiêu — cần cho cả cổng xác nhận lẫn nhật ký.
        const paidRows = await workspacePrisma.payroll.findMany({
            where: { workspaceId, month: currentMonth, year: currentYear, status: 'PAID' },
            select: { userId: true, totalAmount: true },
        })
        const paidTotal = paidRows.reduce((s: number, r: any) => s + toSafeNumber(r.totalAmount), 0)
        if (paidRows.length > 0 && !opts?.confirmUnlockPaid) {
            return {
                success: false,
                requiresConfirmation: true as const,
                paidCount: paidRows.length,
                paidTotal,
                error:
                    `Kỳ ${String(currentMonth).padStart(2, '0')}/${currentYear} đã TRẢ LƯƠNG cho ` +
                    `${paidRows.length} người (tổng ${paidTotal.toLocaleString('vi-VN')}đ). ` +
                    `Mở lại kỳ này cần xác nhận tường minh.`,
            }
        }

        const actorUserId = (await getSession())?.user?.id ?? null

        // Ba lần xoá + nhật ký đi CHUNG một transaction, dưới advisory lock theo kỳ — cùng khuôn
        // voidInvoice dùng (invoice-actions.ts). Trước đây ba lệnh xoá rời nhau: một lỗi giữa đường
        // để lại kỳ đã mất bonus/rank mà vẫn còn khoá, hoặc ngược lại.
        await workspacePrisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payroll:${workspaceId}:${currentYear}-${currentMonth}`}, 0))`

            await tx.monthlyBonus.deleteMany({
                where: { workspaceId, month: currentMonth, year: currentYear }
            })
            // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ dòng xoá MonthlyRank: hàm tính thưởng không còn
            // ghi bảng đó nữa, nên hoàn tác cũng không có gì để dọn.
            const { count: locksRemoved } = await tx.payrollLock.deleteMany({
                where: { workspaceId, month: currentMonth, year: currentYear }
            })

            await tx.auditLog.create({
                data: {
                    workspaceId,
                    actorUserId,
                    action: 'payroll.bonus_reverted',
                    targetType: 'PayrollLock',
                    targetId: `${currentMonth}-${currentYear}`,
                    // Ghi trạng thái THẬT, không ghi cứng isLocked:true như bản cũ.
                    beforeData: {
                        month: currentMonth, year: currentYear,
                        locksRemoved, paidCount: paidRows.length, paidTotal,
                    },
                    afterData: { unlocked: true, confirmedUnlockPaid: opts?.confirmUnlockPaid === true },
                }
            })
        })

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true, message: 'Da hoan tac va mo khoa ky luong.' }
    } catch (error: any) {
        console.error('Error reverting bonus:', error)
        return { success: false, error: `Failed to revert: ${error?.message || 'Unknown error'}` }
    }
}

/**
 * Xếp hạng thưởng — CHỈ THEO DOANH THU:
 *   1. Doanh thu "Thực nhận" (tổng `task.value` của task Hoàn tất), giảm dần
 *   2. Phá hoà: số task hoàn tất (giảm dần), rồi username (tăng dần, cho ổn định)
 *
 * Thưởng = doanh thu × % của hạng Top 1/2/3 đang bật trong BonusConfig.
 * Người đủ điều kiện = có doanh thu > 0. Không có điều kiện nào khác.
 *
 * [BỎ HẠNG S/A/B/C/D 2026-07-31] Chú thích cũ ở đây mô tả một thuật toán KHÁC:
 * `incomeScore = doanh thu - điểm phạt` làm khoá chính, rồi phá hoà bằng errorRate và
 * rankScore. Cả ba dòng đó đều SAI so với mã: `incomeScore` được tính rồi không ai đọc,
 * hàm `rankPriority` đã bị xoá từ lâu, và phép sắp xếp chưa bao giờ nhìn tới điểm phạt.
 * Nói cách khác, ĐIỂM PHẠT CHƯA BAO GIỜ TRỪ THƯỞNG — chú thích cũ mới là thứ khiến người
 * đọc tưởng có. Nay cả biến chết lẫn chú thích sai đều đã dọn, và hàm này không còn đọc
 * ErrorLog một lần nào.
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
        // NHƯNG payrollLock + bonus records phải lưu month/year THỰC
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

        // [BỎ HẠNG S/A/B/C/D 2026-07-31] Trước đây chỗ này gộp `errorLog.calculatedScore` theo
        // người để tính điểm phạt. Điểm phạt chỉ phục vụ phép chấm hạng S/A/B/C/D — nó KHÔNG bao
        // giờ trừ vào thưởng. Bỏ hạng thì truy vấn này thành thừa, nên gỡ luôn: phép tính lương
        // thưởng từ nay không đọc ErrorLog một lần nào.
        // Sổ ghi lỗi vẫn còn nguyên và vẫn tra được ở "Hồ sơ vi phạm của bạn".

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

        interface UserRanking {
            userId: string
            username: string
            revenue: number
            pendingRevenue: number
            tentativeRevenue: number
            tasksCompleted: number
            monthlySalary: number
        }

        const rankings: UserRanking[] = []
        for (const user of users) {
            const completed = completedByUserId.get(user.id)
            if (!completed || completed.tasksCompleted <= 0) continue

            const revenue = completed.revenue
            const tasksCompleted = completed.tasksCompleted
            const pendingRevenue = pendingByUserId.get(user.id) || 0
            const tentativeRevenue = revenue + pendingRevenue

            rankings.push({
                userId: user.id,
                username: user.nickname || user.username,
                revenue,
                pendingRevenue,
                tentativeRevenue,
                tasksCompleted,
                monthlySalary: revenue,
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
        // [AUDIT HT-009 fix] Do delete → create bonuses/ranks → lock ATOMICALLY inside ONE
        // interactive transaction, serialized by an advisory lock on the (workspace, month, year)
        // key, and RE-CHECK the PayrollLock inside it. Two admins clicking "Tính thưởng" at once
        // could otherwise both delete + re-create the bonuses (double work / inconsistent snapshot)
        // because the initial isLocked check is far from this write. The lock is upserted LAST so a
        // failure anywhere rolls the whole thing back and leaves the cycle unlocked.
        stage = 'persist-transaction'

        const awardedBonuses: Array<{
            userId: string
            username: string
            rank: number
            percent: number
            bonusAmount: number
        }> = []

        const alreadyLocked = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bonus:${workspaceId}:${currentYear}-${currentMonth}`}, 0))`

            // Re-check the lock UNDER the advisory lock — a racer may already have computed + locked it.
            const existingLock = await tx.payrollLock.findUnique({
                where: { month_year_workspaceId: { month: currentMonth, year: currentYear, workspaceId } } as any,
                select: { isLocked: true },
            })
            if (existingLock?.isLocked) return true

            // Clear old data for this month/workspace.
            await tx.monthlyBonus.deleteMany({ where: { month: currentMonth, year: currentYear, workspaceId } })
            // [BỎ HẠNG S/A/B/C/D 2026-07-31] Không còn dòng xoá MonthlyRank ở đây, vì cũng không
            // còn dòng ghi nào. Hàm này thôi hẳn việc đụng tới bảng đó.

            // Create new bonuses.
            if (eligibleForBonus.length > 0) {
                for (let i = 0; i < Math.min(maxWinners, eligibleForBonus.length); i++) {
                    const user = eligibleForBonus[i]
                    const percent = tiers[i]
                    // [Bonus Config] Thưởng = % × "Thực nhận" (tổng task.value Hoàn tất) của người đó.
                    const bonusAmount = user.revenue * (percent / 100)

                    await tx.monthlyBonus.create({
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

            // [BỎ HẠNG S/A/B/C/D 2026-07-31] Trước đây chỗ này ghi một hàng MonthlyRank cho MỖI
            // nhân sự, mang hạng S/A/B/C/D cùng điểm phạt và tỉ lệ lỗi. Luật hạng đã bị bỏ nên
            // không ghi nữa. Bảng `MonthlyRank` VẪN CÒN trong database theo quyết định của chủ dự
            // án (dữ liệu cũ giữ lại, không xoá) — chỉ là từ nay không ai ghi và không ai đọc.
            // Nếu sau này muốn dọn hẳn bảng thì đó là việc riêng, phải đẩy mã này lên production
            // TRƯỚC rồi mới xoá bảng.

            // Lock the cycle LAST — only after every write above succeeded.
            await tx.payrollLock.upsert({
                where: { month_year_workspaceId: { month: currentMonth, year: currentYear, workspaceId } } as any,
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
            return false
        })

        if (alreadyLocked) {
            return { success: false, error: `Kỳ lương ${currentMonth}/${currentYear} đã được tính/khóa bởi một thao tác khác. Vui lòng tải lại.` }
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
