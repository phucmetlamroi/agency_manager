/**
 * [AUDIT SWEEP-2026-07-30 · MCP-PAID] Chu kỳ lương + chốt "kỳ đã đóng" cho phía MCP.
 *
 * VÌ SAO LÀ MỘT FILE CHÉP, KHÔNG PHẢI IMPORT:
 * `mcp-server/` là package RIÊNG (tsconfig + build riêng, chạy stdio), không import được
 * `src/lib/payroll-cycle.ts` của app Next. Chép 15 dòng là cách rẻ nhất để hai đường ghi trả lời
 * GIỐNG NHAU. Nếu sửa một bên, phải sửa bên kia — đó là cái giá của việc có hai đường ghi vào cùng
 * database, không phải thứ có thể giấu đi.
 *
 * ⚠️ TUYỆT ĐỐI KHÔNG chép khối chốt PAID cũ của web (`update-task-details.ts` bản trước 95be7eb):
 * khối đó tra bảng Payroll bằng tháng/năm của `task.createdAt`, trong khi hàng Payroll lại được ghi
 * theo tháng suy từ TÊN workspace. Hai khoá khác nhau nên chốt gần như luôn tự mở. Chép nó sang đây
 * là nhân bản một cổng mở. Logic dưới đây là logic ĐÃ SỬA: khoá theo tháng workspace.
 */
import { prisma } from '../prisma-client.js'

/**
 * Suy chu kỳ lương từ TÊN workspace dạng "MM / YYYY" (ví dụ "07 / 2026").
 * Giữ nguyên regex/ngưỡng của `src/lib/payroll-cycle.ts` — đừng "cải tiến" riêng một bên.
 */
export function extractPayrollCycle(
    workspaceName: string | null | undefined,
): { month: number; year: number } {
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
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }
}

/**
 * Throw nếu kỳ lương của workspace này đã ĐÓNG — dùng ĐÚNG định nghĩa của web
 * (`src/lib/payroll-lock.ts`): đóng khi `PayrollLock.isLocked` bật HOẶC có ≥1 hàng Payroll `PAID`.
 * Hai cờ do hai hành động khác nhau bật (tính bonus bật lock; xác nhận trả lương ghi PAID) nên phải
 * hỏi cả hai.
 *
 * Ném `Error` để `bulk-ops.ts` gom vào `results[].error` theo từng task — KHÔNG làm sập cả lô.
 */
export async function assertPayrollCycleOpen(
    workspaceId: string,
    workspaceName: string | null | undefined,
    assigneeId: string | null,
): Promise<void> {
    const { month, year } = extractPayrollCycle(workspaceName)
    const cycle = `${String(month).padStart(2, '0')}/${year}`

    const lock = await prisma.payrollLock.findUnique({
        where: { month_year_workspaceId: { month, year, workspaceId } },
        select: { isLocked: true },
    })
    if (lock?.isLocked) {
        throw new Error(
            `Kỳ lương ${cycle} đã được chốt bảng lương — không sửa được số tiền qua MCP. ` +
            `Hãy hoàn tác chốt kỳ trước.`,
        )
    }

    if (assigneeId) {
        const paid = await prisma.payroll.findFirst({
            where: { workspaceId, month, year, userId: assigneeId, status: 'PAID' },
            select: { id: true },
        })
        if (paid) {
            throw new Error(
                `Kỳ lương ${cycle} đã trả cho nhân sự này — không sửa được số tiền qua MCP.`,
            )
        }
    }
}
