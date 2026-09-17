/**
 * [AUDIT HT-040] Vết kiểm toán cho các mutation đi qua MCP.
 *
 * VÌ SAO CẦN: mcp-server là BỀ MẶT GHI THỨ HAI vào cùng database prod, nhưng nó không sao chép
 * lớp ghi nhật ký của web app. Hệ quả cụ thể: một lệnh `update_task_status → 'Hoàn tất'` qua MCP
 * tạo ra NGHĨA VỤ TRẢ LƯƠNG, nhưng `get_status_history` trả về [] và trang /admin/audit-log
 * không thấy gì — không ai truy được ai đã hoàn tất task, lúc nào, từ trạng thái nào.
 *
 * ⚠️ HAI CẠM BẪY, đừng vô hiệu hoá chúng khi sửa file này:
 *
 * 1. PHẢI dùng client `prisma` GỐC, KHÔNG dùng `getWorkspacePrisma`. Extension đó bơm cả
 *    `workspaceId` LẪN `profileId` vào `data` của mọi `create` cho model không nằm trong
 *    `bypassModels`/`noProfileModels` — mà `AuditLog` không nằm trong danh sách nào cả. Bảng
 *    AuditLog KHÔNG có cột `profileId`, nên ghi qua client mở rộng sẽ ném lỗi ở MỌI mutation.
 *
 * 2. `AuditLog.actorUserId` là khoá ngoại trỏ `User`. MCP chạy bằng service-account cấp profile,
 *    KHÔNG có hàng User nào tương ứng — nên không thể nhét chuỗi kiểu 'mcp:<profileId>' vào đó
 *    (vi phạm FK, mà `audit` lại nằm trong transaction ⇒ hỏng luôn cả mutation). Vì vậy actor để
 *    null, và nguồn gốc MCP được ghi vào `userAgent` + `afterData.source` để người điều tra sau
 *    này phân biệt được "MCP" với "hệ thống/cron".
 *
 * Ngoại lệ: claim_task CÓ actor thật (chính người nhận task) — chỗ đó truyền actorUserId vào.
 */

import type { Prisma } from '@prisma/client'

/**
 * Client ghi nhật ký = tham số `tx` của `$transaction`.
 * Dùng thẳng `Prisma.TransactionClient` chứ KHÔNG tự khai một interface "gần đúng": chữ ký
 * `auditLog.create` mà Prisma sinh ra có ràng buộc generic chặt (bắt buộc `action` + `targetType`),
 * một interface tự chế chỉ nhận `Record<string, unknown>` sẽ nới lỏng đúng phần kiểm tra ta cần.
 */
export type AuditWriteClient = Prisma.TransactionClient

export interface McpAuditOpts {
    workspaceId: string
    /**
     * Dùng ĐÚNG các tên action web app đã có, để /admin/audit-log hiển thị được.
     *
     * ⚠️ TÊN ACTION KHÔNG PHẢI CHUYỆN THẨM MỸ — nó quyết định ai bị ghi công.
     * `task.assigned` bị HAI màn hình đang chạy diễn giải theo actor: khi actorUserId là null,
     * cổng khách (share-portal-actions.ts:1643) hiện "You" và drawer nhân viên
     * (task-comment-actions.ts:236) hiện "Khách hàng". Vì vậy CHỈ được dùng tên này khi truyền
     * kèm actorUserId thật (hiện chỉ có claim_task). Mọi thao tác MCP khác dùng
     * 'task.status_updated' — không nằm trong hai bảng nhãn đó nên không bị gán nhầm.
     */
    action:
        | 'task.created'
        | 'task.assigned'
        | 'task.status_updated'
        | 'task.deleted'
        | 'task.bulk_updated'
        | 'workspace.updated'
    targetType: 'Task' | 'Workspace'
    targetId?: string | null
    /** Chỉ đặt khi có NGƯỜI thật đứng sau thao tác (vd claim_task). */
    actorUserId?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    /** profileId của service-account MCP — ghi vào payload vì không nhét được vào actorUserId. */
    mcpProfileId?: string | null
}

/**
 * Ghi một hàng AuditLog cho thao tác MCP.
 *
 * KHÔNG nuốt lỗi: hàm này được gọi BÊN TRONG `$transaction` cùng với chính mutation, nên khi ghi
 * nhật ký hỏng thì mutation cũng phải rollback. Đó là chủ đích — finding này nói về việc thay đổi
 * xảy ra trong im lặng, nên "âm thầm bỏ qua nhật ký" chính là thứ cần chặn, không phải thứ cần giữ.
 *
 * ⚠️ NGƯỢC HẲN với `src/lib/audit-log.ts` bên web app, nơi ghi chú đầu file nói rõ "NON-THROWING:
 * business actions must NOT fail because the audit write failed" và còn nuốt cả P2021 (bảng chưa
 * tồn tại). Hai bề mặt ghi cùng một bảng nay hành xử trái ngược khi DB trục trặc — CÓ CHỦ Ý, không
 * phải sơ suất: MCP là bề mặt tự động, không người ngồi trước màn hình để phát hiện thao tác đã
 * chạy mà không có vết. HỆ QUẢ phải biết: trỏ MCP_DATABASE_URL vào một nhánh Neon CHƯA có bảng
 * AuditLog thì MỌI mutation qua MCP sẽ hỏng, trong khi web app trên cùng nhánh vẫn chạy bình thường.
 */
export async function writeMcpAudit(
    tx: AuditWriteClient,
    opts: McpAuditOpts,
): Promise<void> {
    await tx.auditLog.create({
        data: {
            workspaceId: opts.workspaceId,
            actorUserId: opts.actorUserId ?? null,
            action: opts.action,
            targetType: opts.targetType,
            targetId: opts.targetId ?? null,
            beforeData: (opts.before ?? undefined) as Prisma.InputJsonValue | undefined,
            afterData: {
                ...(opts.after ?? {}),
                source: 'mcp',
                mcpProfileId: opts.mcpProfileId ?? null,
            } as Prisma.InputJsonValue,
            // Không có request HTTP nào ở đây (MCP chạy stdio) nên ipAddress để trống; userAgent là
            // chỗ duy nhất còn lại để đánh dấu nguồn ở cấp cột, lọc được bằng SQL.
            userAgent: 'mcp-server',
        },
    })
}
