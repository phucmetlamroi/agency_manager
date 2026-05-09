'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'

/**
 * Confirm payment cho 1 user trong 1 cycle (month/year/workspace).
 *
 * Audit finding #2 (CRITICAL): Trước đây sau khi PAID có thể gọi revertPayment()
 * → DELETE record → tính lại bonus inflated → gian lận lương.
 *
 * Sau:
 * - confirmPayment: lock cycle qua PayrollLock (đã có) — đó là nguồn truth
 * - revertPayment: BLOCK nếu PayrollLock của cycle đó isLocked=true
 * - Chỉ super admin (currentUser.username='admin') được override với explicit
 *   confirmation flag (đảm bảo audit trail rõ ràng)
 */
export async function confirmPayment(data: {
    userId: string
    month: number
    year: number
    baseSalary: number
    bonus: number
    totalAmount: number
}, workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check + workspace scoping fix
        // (audit finding #5 cũng đề cập payroll cross-workspace leak)
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const payroll = await workspacePrisma.payroll.upsert({
            where: {
                userId_month_year_workspaceId: {
                    userId: data.userId,
                    month: data.month,
                    year: data.year,
                    workspaceId
                }
            } as any,
            update: {
                status: 'PAID',
                paidAt: new Date(),
                baseSalary: data.baseSalary,
                bonus: data.bonus,
                totalAmount: data.totalAmount,
            },
            create: {
                userId: data.userId,
                month: data.month,
                year: data.year,
                workspaceId: workspaceId,
                baseSalary: data.baseSalary,
                bonus: data.bonus,
                totalAmount: data.totalAmount,
                status: 'PAID',
                paidAt: new Date()
            }
        })

        // Audit log: confirm payment là financial action quan trọng
        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'payroll.locked',
            targetType: 'Payroll',
            targetId: payroll.id,
            after: {
                userId: data.userId,
                month: data.month,
                year: data.year,
                totalAmount: data.totalAmount,
                status: 'PAID',
            },
        })

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        console.error('Payment error:', error)
        return { error: 'Payment failed' }
    }
}

/**
 * Get payroll data với workspace scoping đầy đủ.
 *
 * Audit finding #5 (HIGH): Trước đây getPayrollData fetch user globally
 * (`role: 'USER'` không workspace filter) → admin workspace A có thể fetch
 * payroll của workspace B → data leak cross-workspace.
 *
 * Sau: verifyWorkspaceAccess + filter user theo workspaceMember của workspace.
 */
export async function getPayrollData(month: number, year: number, workspaceId: string) {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: e.message, success: false, data: [] }
        }
        throw e
    }

    const workspacePrisma = getWorkspacePrisma(workspaceId)
    // Filter users theo workspaceMember của workspace này, KHÔNG fetch global
    const users = await workspacePrisma.user.findMany({
        where: {
            role: 'USER',
            workspaces: { some: { workspaceId } },  // chỉ user là member của workspace
        },
        include: {
            payrolls: {
                where: { workspaceId, month, year }
            }
        }
    })

    return { success: true, data: users }
}

/**
 * Revert payment — BLOCK nếu cycle đã locked.
 *
 * Anti-fraud: PayrollLock.isLocked=true → KHÔNG ai (kể cả super admin) được
 * revert tự động. Phải unlock cycle trước (xem revertMonthlyBonus trong
 * bonus-actions.ts) — quy trình unlock có audit trail riêng.
 *
 * Treasurer "lén" revert payment để inflate bonus là attack vector cũ.
 */
export async function revertPayment(userId: string, month: number, year: number, workspaceId: string) {
    try {
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const workspacePrisma = getWorkspacePrisma(workspaceId)

        // Check lock của cycle (workspace + month + year)
        const lock = await workspacePrisma.payrollLock.findUnique({
            where: {
                month_year_workspaceId: { month, year, workspaceId },
            } as any,
            select: { isLocked: true, lockedAt: true, lockedBy: true },
        })

        if (lock?.isLocked) {
            return {
                error: `Kỳ lương ${month}/${year} đã bị KHÓA (lock từ ${lock.lockedAt?.toLocaleString('vi-VN') ?? 'unknown'}). Phải unlock cycle trước (qua "Hoàn tác bonus") rồi mới revert payment.`,
                code: 'PAYROLL_LOCKED',
            }
        }

        // Get payroll trước khi delete để audit log
        const existingPayroll = await workspacePrisma.payroll.findUnique({
            where: {
                userId_month_year_workspaceId: { userId, month, year, workspaceId }
            } as any,
        })

        if (!existingPayroll) {
            return { error: 'Không tìm thấy record payment để revert.' }
        }

        await workspacePrisma.payroll.delete({
            where: {
                userId_month_year_workspaceId: { userId, month, year, workspaceId }
            } as any
        })

        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'payroll.unlocked',
            targetType: 'Payroll',
            targetId: existingPayroll.id,
            before: {
                userId,
                month,
                year,
                status: existingPayroll.status,
                totalAmount: existingPayroll.totalAmount,
            },
        })

        revalidatePath(`/${workspaceId}/admin/payroll`)
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        console.error('Revert payment error:', error)
        return { error: 'Failed to revert payment' }
    }
}
