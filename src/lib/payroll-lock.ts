import 'server-only'
import { prisma } from '@/lib/db'
import { extractPayrollCycle } from '@/lib/payroll-cycle'

/**
 * [AUDIT SWEEP-2026-07-30] MỘT NGUỒN CHÂN LÝ cho câu "kỳ lương này đã đóng, cấm sửa tiền".
 *
 * VÌ SAO PHẢI CÓ FILE NÀY — chốt cũ KHÔNG BAO GIỜ KHỚP:
 * `update-task-details.ts` tra bảng Payroll bằng THÁNG/NĂM CỦA `task.createdAt`, trong khi MỌI nơi
 * GHI hàng Payroll (payroll-actions.confirmPayment) và mọi nơi đặt PayrollLock
 * (bonus-actions.calculateMonthlyBonus) đều khoá theo `extractPayrollCycle(workspace.name)` — chu kỳ
 * suy từ TÊN workspace dạng "MM / YYYY". Hai khoá khác nhau ⇒ `findUnique` gần như luôn trả null ⇒
 * chốt tự mở. Tệ hơn: chính hàm đó ghi lại `createdAt = new Date()` mỗi lần admin đặt deadline
 * (để reset đồng hồ nhắc việc), nên khoá tra cứu còn TỰ ĐỔI được.
 *
 * QUYẾT ĐỊNH CỦA CHỦ DỰ ÁN (2026-07-30): kỳ lương xác định theo THÁNG CỦA WORKSPACE, và coi là ĐÃ
 * ĐÓNG nếu **PayrollLock.isLocked** bật HOẶC có **≥1 hàng Payroll status='PAID'**. Hai cờ này do hai
 * hành động khác nhau bật (tính bonus bật lock; xác nhận trả lương ghi PAID) nên một task có thể
 * vướng cờ này mà không vướng cờ kia — phải hỏi cả hai.
 *
 * Dùng `prisma` toàn cục CÓ CHỦ ĐÍCH: mọi truy vấn dưới đây tự ghi `workspaceId` tường minh, và
 * mọi nơi gọi đều đã qua cổng phân quyền trước đó. Tránh `getWorkspacePrisma` ở đây để helper không
 * phụ thuộc vào việc nơi gọi có truyền profileId hay không (Client fail-closed guard).
 */
export type PayrollCycleGate = {
    /** true = cấm ghi số tiền của task thuộc kỳ này */
    closed: boolean
    month: number
    year: number
    /** Lý do đóng — để câu báo lỗi nói đúng chuyện gì đã xảy ra, không nói chung chung */
    reason: 'LOCKED' | 'PAID' | null
}

/**
 * Chu kỳ của workspace + cờ khoá CẢ KỲ. Tách riêng để đường sửa-hàng-loạt tra một lần cho cả lô
 * thay vì N lần (cờ này là cấp workspace, không phụ thuộc từng task).
 */
export async function resolvePayrollCycle(
    workspaceId: string,
): Promise<{ month: number; year: number; isLocked: boolean }> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
    })
    const { month, year } = extractPayrollCycle(workspace?.name)
    const lock = await prisma.payrollLock.findUnique({
        where: { month_year_workspaceId: { month, year, workspaceId } } as any,
        select: { isLocked: true },
    })
    return { month, year, isLocked: lock?.isLocked ?? false }
}

/**
 * Tập userId đã được trả lương trong kỳ. Dùng cho đường sửa-HÀNG-LOẠT: tra MỘT lần trước khi vào
 * transaction, rồi kiểm trong bộ nhớ. Cố ý KHÔNG gọi truy vấn ngoài từ bên trong
 * `prisma.$transaction` — đó là kết nối khác, dễ thành nguồn deadlock khi transaction đang giữ lock.
 */
export async function getPaidAssigneeIds(
    workspaceId: string,
    month: number,
    year: number,
): Promise<Set<string>> {
    const rows = await prisma.payroll.findMany({
        where: { workspaceId, month, year, status: 'PAID' },
        select: { userId: true },
    })
    return new Set(rows.map((r) => r.userId))
}

/** Người này đã được trả lương của kỳ đó chưa. */
export async function isAssigneePaid(
    workspaceId: string,
    month: number,
    year: number,
    assigneeId: string,
): Promise<boolean> {
    const paid = await prisma.payroll.findFirst({
        where: { workspaceId, month, year, userId: assigneeId, status: 'PAID' },
        select: { id: true },
    })
    return paid !== null
}

export async function checkPayrollCycleClosed(
    workspaceId: string,
    /**
     * Người nhận lương của task. `null` = task chưa gán ai: khi đó CHỈ cờ khoá cả kỳ mới chặn,
     * còn việc một người KHÁC đã được trả lương không liên quan tới task này.
     */
    assigneeId: string | null,
): Promise<PayrollCycleGate> {
    const { month, year, isLocked } = await resolvePayrollCycle(workspaceId)
    if (isLocked) return { closed: true, month, year, reason: 'LOCKED' }
    if (assigneeId && (await isAssigneePaid(workspaceId, month, year, assigneeId))) {
        return { closed: true, month, year, reason: 'PAID' }
    }
    return { closed: false, month, year, reason: null }
}

/** Câu báo lỗi dùng chung — nói rõ kỳ nào và vì sao, thay vì "không thể sửa đổi tài chính". */
export function payrollClosedMessage(gate: PayrollCycleGate): string {
    const cycle = `${String(gate.month).padStart(2, '0')}/${gate.year}`
    return gate.reason === 'LOCKED'
        ? `Kỳ lương ${cycle} đã được chốt bảng lương — không sửa được số tiền. Hãy hoàn tác chốt kỳ trước.`
        : `Kỳ lương ${cycle} đã trả cho nhân sự này — không sửa được số tiền.`
}
