'use server'

import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'
import { verifyWorkspaceAccess } from '@/lib/security'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { sanitizeExternalUrl } from '@/lib/safe-url'
import { checkPayrollCycleClosed, payrollClosedMessage } from '@/lib/payroll-lock'

// [AUDIT HT-031 fix] Bản chép cục bộ đã chuyển sang @/lib/safe-url (xem import phía trên) —
// ba đường ghi khác từng bị bỏ sót đúng vì logic này nằm rải rác.

export async function updateTaskDetails(id: string, data: {
    resources?: string
    references?: string
    notes?: string
    notes_en?: string
    title?: string
    productLink?: string
    deadline?: string
    jobPriceUSD?: number
    value?: number
    collectFilesLink?: string
    duration?: string
}, workspaceId: string) {
    try {
        let isAdmin = false
        let callerId = ''
        try {
            const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
            isAdmin = access.isGlobalAdmin || access.workspaceRole === 'ADMIN' || access.workspaceRole === 'OWNER'
            callerId = access.userId
        } catch {
            return { error: 'Unauthorized: no workspace access' }
        }
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        // Fetch current task first to compare notes and check financial locks
        const currentTask = await workspacePrisma.task.findUnique({
            where: { id },
            select: { notes_vi: true, jobPriceUSD: true, value: true, exchangeRate: true, createdAt: true, assigneeId: true }
        })

        if (!currentTask) {
            return { error: 'Task not found' }
        }

        let updateData: any = {}

        if (isAdmin) {
            updateData = {
                resources: data.resources,
                references: data.references,
                title: data.title,
                collectFilesLink: data.collectFilesLink,
                productLink: sanitizeExternalUrl(data.productLink) // [HT-031]
            }
            if (data.notes !== undefined) updateData.notes_vi = data.notes
            if (data.notes_en !== undefined) updateData.notes_en = data.notes_en
            if (data.duration !== undefined) updateData.duration = data.duration
        } else {
            // [AUDIT R1 — HIGH fix #10] BOLA: a non-admin member could edit the
            // productLink/notes_en of ANY task in the workspace. Restrict non-admins
            // to tasks they are actually assigned to.
            if (currentTask.assigneeId !== callerId) {
                return { error: 'Forbidden: Bạn chỉ được cập nhật Task của chính mình.' }
            }
            // Non-admins are ONLY allowed to update their delivery/translation fields
            if (data.productLink !== undefined) updateData.productLink = sanitizeExternalUrl(data.productLink) // [HT-031]
            if (data.notes_en !== undefined) updateData.notes_en = data.notes_en
        }

        // Handle Price Updates (Financials) - STRICTLY ADMIN ONLY
        if (isAdmin && (data.jobPriceUSD !== undefined || data.value !== undefined)) {
            // FINANCIAL LOCK CHECK
            //
            // [AUDIT SWEEP-2026-07-30 fix] Chốt cũ ở đây KHÔNG BAO GIỜ KHỚP: nó tra Payroll bằng
            // tháng/năm của `currentTask.createdAt`, còn hàng Payroll lại được ghi theo
            // `extractPayrollCycle(workspace.name)`. Lệch khoá ⇒ findUnique trả null ⇒ chốt tự mở.
            // Và chính hàm này còn ghi lại `createdAt` ở nhánh deadline bên dưới, nên khoá tra cứu
            // tự đổi được. Nay dùng helper dùng chung `checkPayrollCycleClosed` (xem lib/payroll-lock.ts)
            // — khoá theo tháng workspace, chặn khi PayrollLock bật HOẶC có hàng Payroll PAID.
            const gate = await checkPayrollCycleClosed(workspaceId, currentTask.assigneeId ?? null)
            if (gate.closed) {
                return { error: payrollClosedMessage(gate) }
            }

            const newJobPriceUSD = data.jobPriceUSD !== undefined ? data.jobPriceUSD : (currentTask.jobPriceUSD || 0)
            const newValue = data.value !== undefined ? data.value : (currentTask.value || 0) // This is Wage VND
            const rate = currentTask.exchangeRate || 26300

            updateData.jobPriceUSD = newJobPriceUSD
            updateData.value = newValue
            updateData.wageVND = newValue // Sync wageVND with value

            // Recalculate Profit
            updateData.profitVND = (Number(newJobPriceUSD) * Number(rate)) - Number(newValue)
        }

        // Handle Deadline Update - STRICTLY ADMIN ONLY
        if (isAdmin && data.deadline) {
            // Force Vietnam parsing
            updateData.deadline = parseVietnamDate(data.deadline)
            // Reset createdAt to "restart" the Smart Reminder timer
            updateData.createdAt = new Date()

            // Critical: Reset penalty flag so if they miss this NEW deadline, they get penalized again.
            updateData.isPenalized = false
        }

        await workspacePrisma.task.update({
            where: { id },
            data: updateData
        })
        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update task details' }
    }
}
