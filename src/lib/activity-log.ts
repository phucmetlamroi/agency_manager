// src/lib/activity-log.ts
// [Mobile P4.3 / M9 — FR-E7] Humanize hoá bản ghi AuditLog thành CÂU tiếng Việt cho
// "Nhật ký hoạt động" mobile. Tầng thuần hiển thị: KHÔNG ghi DB, KHÔNG đổi giá trị lưu.
//
// Nguyên tắc (HARD INVARIANT #3):
//  • Câu trả về KHÔNG chứa event-key thô hay UUID kỹ thuật — chỉ ở khối "Chi tiết".
//  • Câu KHÔNG nhúng tên người thực hiện (caller tự prepend actor bôi đậm qua getDisplayName).
//    Vì vậy MỌI câu là VỊ NGỮ, bắt đầu bằng "đã …" để ghép được với bất kỳ chủ ngữ nào
//    (người dùng / "Hệ thống" / "Khách hàng").
//  • File server-safe: không 'use client', không browser API. Pure functions.

import type { AuditLogEntry } from '@/actions/audit-actions'

/** Bản ghi tối thiểu cần để humanize (khớp AuditLogEntry, nhưng nới lỏng cho tái dùng). */
export type HumanizableLog = Pick<
    AuditLogEntry,
    'action' | 'targetType' | 'targetId' | 'beforeData' | 'afterData'
>

export interface HumanizedLog {
    /** Vị ngữ tiếng Việt, KHÔNG gồm chủ ngữ (vd 'đã tạo task "Reel A"'). */
    sentence: string
    /** Link tới thực thể (chỉ khi log tham chiếu 1 task giải được + có workspaceId). */
    entityHref?: string
}

/* ────────────────────────── helpers trích payload ────────────────────────── */

/** Đọc field đầu tiên tìm thấy: ưu tiên afterData → beforeData. Rỗng/null bỏ qua. */
function field(log: HumanizableLog, ...keys: string[]): string | null {
    for (const src of [log.afterData, log.beforeData]) {
        if (src && typeof src === 'object' && !Array.isArray(src)) {
            for (const k of keys) {
                const v = (src as Record<string, unknown>)[k]
                if (v != null && v !== '' && typeof v !== 'object') return String(v)
            }
        }
    }
    return null
}

/** Đọc số nguyên đầu tiên tìm thấy (afterData → beforeData). */
function num(log: HumanizableLog, ...keys: string[]): number | null {
    for (const src of [log.afterData, log.beforeData]) {
        if (src && typeof src === 'object' && !Array.isArray(src)) {
            for (const k of keys) {
                const v = (src as Record<string, unknown>)[k]
                if (typeof v === 'number' && Number.isFinite(v)) return v
                if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
            }
        }
    }
    return null
}

/** Cắt ngắn + bọc nháy kép cho tiêu đề/status hiển thị trên dòng chính. */
function quoted(s: string, max = 48): string {
    const t = s.trim()
    return `“${t.length > max ? t.slice(0, max) + '…' : t}”`
}

/* ─────────────────── nhận diện event do KHÁCH/HỆ THỐNG gây ─────────────────── */

/**
 * Event có actorUserId = null nhưng do KHÁCH (client/guest) gây, không phải hệ thống.
 * Caller dùng để chọn nhãn chủ ngữ fallback ("Khách hàng" thay vì "Hệ thống").
 */
export function isClientActorEvent(action: string): boolean {
    return (
        action.startsWith('task.client_') ||
        action.startsWith('request.client_') ||
        // task.comment_added có actorUserId=null CHỈ khi khách bình luận qua share-link
        // (staff luôn kèm actor); nhân viên đi nhánh getDisplayName nên không ảnh hưởng.
        action === 'task.comment_added' ||
        action === 'client.created_via_share_link' ||
        action === 'video.guest_commented' ||
        action === 'share_link.accessed'
    )
}

/**
 * Nhãn chủ ngữ fallback khi log KHÔNG có actor (actorUserId null).
 * KHÔNG bao giờ trả về ID thô — chỉ nhãn người-đọc-được.
 */
export function actorFallbackLabel(action: string): string {
    return isClientActorEvent(action) ? 'Khách hàng' : 'Hệ thống'
}

/* ───────────────────────── câu tĩnh (không cần payload) ───────────────────── */

const STATIC_SENTENCE: Record<string, string> = {
    // Workspace
    'workspace.created': 'đã tạo workspace',
    'workspace.updated': 'đã cập nhật workspace',
    'workspace.soft_deleted': 'đã xóa workspace',
    'workspace.restored': 'đã khôi phục workspace',
    'workspace.hard_deleted': 'đã xóa vĩnh viễn workspace',
    'workspace.transferred_ownership': 'đã chuyển quyền sở hữu workspace',
    'workspace.clients_cloned': 'đã sao chép danh sách khách hàng sang workspace',

    // Member
    'member.invited': 'đã mời một thành viên mới',
    'member.invitation_revoked': 'đã hủy một lời mời thành viên',
    'member.joined': 'đã tham gia workspace',
    'member.removed': 'đã xóa một thành viên khỏi workspace',
    'member.left': 'đã rời khỏi workspace',
    'member.suspended': 'đã tạm ngưng một thành viên',
    'member.reactivated': 'đã kích hoạt lại một thành viên',
    'member.role_changed': 'đã đổi vai trò một thành viên',

    // User
    'user.deactivated': 'đã vô hiệu hóa một tài khoản',
    'user.reactivated': 'đã kích hoạt lại một tài khoản',
    'user.username_migrated': 'đã cập nhật tên đăng nhập',
    'user.username_changed': 'đã đổi tên đăng nhập',
    'user.joined': 'đã tham gia workspace',

    // Auth
    'auth.login': 'đã đăng nhập',
    'auth.login_success': 'đã đăng nhập',
    'auth.logout': 'đã đăng xuất',
    'auth.failed_attempt': 'đã đăng nhập thất bại',
    'auth.account_locked': 'đã bị khóa tài khoản do đăng nhập sai nhiều lần',
    'auth.signup': 'đã đăng ký tài khoản',
    'auth.email_verified': 'đã xác minh email',
    'auth.password_changed': 'đã đổi mật khẩu',
    'auth.password_reset_requested': 'đã yêu cầu đặt lại mật khẩu',
    'auth.password_reset_completed': 'đã đặt lại mật khẩu',
    'auth.email_migration_otp_requested': 'đã yêu cầu mã xác thực đổi email',
    'auth.email_migrated': 'đã đổi email đăng nhập',
    'auth.impersonation_started': 'đã bắt đầu đăng nhập thay người dùng',
    'auth.impersonation_ended': 'đã kết thúc đăng nhập thay người dùng',
    'auth.admin_force_reset_triggered': 'đã buộc đặt lại mật khẩu một tài khoản',

    // Payroll / bonus
    'payroll.bonus_calculated': 'đã tính thưởng cho bảng lương',
    'payroll.bonus_reverted': 'đã hoàn tác thưởng bảng lương',
    'payroll.locked': 'đã khóa bảng lương',
    'payroll.unlocked': 'đã mở khóa bảng lương',
    'bonus_config.updated': 'đã cập nhật cấu hình thưởng',

    // Data / permission
    'data.export': 'đã xuất dữ liệu',
    'data.import': 'đã nhập dữ liệu',
    'permission.checked_denied': 'đã bị từ chối quyền truy cập',

    // Task (không cần payload)
    'task.restored': 'đã khôi phục một task',
    'task.client_approved': 'đã duyệt một task',
    'task.client_changes_requested': 'đã yêu cầu chỉnh sửa một task',
    'task.client_submitted': 'đã gửi một yêu cầu task mới',
    'task.comment_added': 'đã bình luận trong một task',
    'task.comment_assigned': 'đã giao một bình luận cho thành viên',
    'task.comment_unassigned': 'đã gỡ giao một bình luận',
    'task.comment_resolved': 'đã xử lý xong một bình luận',
    'task.comment_reopened': 'đã mở lại một bình luận',
    'task.invariant_auto_synced': 'đã tự đồng bộ trạng thái một task',
    'task.raw_footage_mode_changed': 'đã đổi chế độ tư liệu thô của một task',
    'task.raw_footage_map_saved': 'đã lưu sơ đồ tư liệu thô của một task',

    // Request
    'request.accepted': 'đã chấp nhận một yêu cầu',
    'request.rejected': 'đã từ chối một yêu cầu',
    'request.client_submitted': 'đã gửi một yêu cầu mới',

    // Client
    'client.soft_deleted': 'đã xóa một khách hàng',
    'client.restored': 'đã khôi phục một khách hàng',
    'client.hard_deleted': 'đã xóa vĩnh viễn một khách hàng',
    'client.auto_merged': 'đã gộp các khách hàng trùng lặp',
    'client.manual_merged': 'đã gộp các khách hàng trùng lặp',
    'client.created_via_share_link': 'đã tạo một brand con qua link chia sẻ',

    // Pricing rule
    'pricing_rule.created': 'đã tạo một quy tắc giá',
    'pricing_rule.updated': 'đã cập nhật một quy tắc giá',
    'pricing_rule.deleted': 'đã xóa một quy tắc giá',
    'pricing_rule.set_default': 'đã đặt quy tắc giá mặc định',

    // Integration
    'integration.connected': 'đã kết nối một tích hợp',
    'integration.disconnected': 'đã ngắt kết nối một tích hợp',

    // Profile
    'profile.member_removed': 'đã xóa một thành viên khỏi hồ sơ',
    'profile.role_changed': 'đã đổi vai trò một thành viên hồ sơ',
    'profile.ownership_transferred': 'đã chuyển quyền sở hữu hồ sơ',
    'profile.admin_workspace_granted': 'đã cấp quyền quản trị một workspace',
    'profile.updated': 'đã cập nhật hồ sơ',
    'profile.soft_deleted': 'đã xóa hồ sơ',
    'profile.restored': 'đã khôi phục hồ sơ',
    'profile.hard_deleted': 'đã xóa vĩnh viễn hồ sơ',

    // Payment
    'payment.recorded': 'đã ghi nhận một khoản thanh toán',
    'payment.deleted': 'đã xóa một khoản thanh toán',

    // Share link
    'share_link.created': 'đã tạo một link chia sẻ',
    'share_link.revoked': 'đã thu hồi một link chia sẻ',
    'share_link.accessed': 'đã mở một link chia sẻ công khai',

    // Video review
    'video.version_ready': 'đã xử lý xong một bản dựng video, sẵn sàng để duyệt',
    'video.guest_commented': 'đã bình luận trên một bản dựng video',
    'video.share_created': 'đã tạo một link chia sẻ video',
    'video.share_revoked': 'đã thu hồi một link chia sẻ video',
    'video.share_unrevoked': 'đã mở lại một link chia sẻ video',
    'video.version_uploaded': 'đã tải lên một bản dựng video',
    'video.review_approved': 'đã duyệt một bản dựng video',
    'video.changes_requested': 'đã yêu cầu chỉnh sửa một bản dựng video',
    'video.comment_added': 'đã thêm một bình luận video',
    'video.comment_resolved': 'đã xử lý xong một bình luận video',
    'video.comment_reopened': 'đã mở lại một bình luận video',
}

/* ─────────────── câu động (cần đọc title/status/count từ payload) ──────────── */

function dynamicSentence(log: HumanizableLog): string | null {
    switch (log.action) {
        case 'task.created': {
            const t = field(log, 'title', 'name')
            return t ? `đã tạo task ${quoted(t)}` : 'đã tạo một task'
        }
        case 'task.batch_created': {
            const n = num(log, 'count', 'n')
            return `đã tạo ${n ?? 'nhiều'} task`
        }
        case 'task.deleted': {
            const t = field(log, 'title', 'name')
            return t ? `đã xóa task ${quoted(t)}` : 'đã xóa một task'
        }
        case 'task.assigned': {
            const t = field(log, 'title', 'name')
            return t ? `đã giao task ${quoted(t)}` : 'đã giao một task'
        }
        // 3 chuyển pha lifecycle + biến thể tổng quát: đều mang status ở afterData.
        case 'task.started':
        case 'task.delivered':
        case 'task.completed':
        case 'task.status_updated': {
            const s = field(log, 'status', 'newStatus')
            return s ? `đã chuyển task sang ${quoted(s)}` : 'đã cập nhật trạng thái một task'
        }
        case 'task.bulk_status_updated': {
            const n = num(log, 'count', 'n')
            const s = field(log, 'newStatus', 'status')
            const head = `đã cập nhật trạng thái ${n ?? 'nhiều'} task`
            return s ? `${head} sang ${quoted(s)}` : head
        }
        case 'task.bulk_updated': {
            const n = num(log, 'count', 'n')
            return `đã cập nhật ${n ?? 'nhiều'} task`
        }
        default:
            return null
    }
}

/* ─────────────────────────── resolve task href ────────────────────────────── */

/** Sentinel bulk ('12-tasks') / rỗng → không phải id task đơn giải được. */
function resolveTaskId(log: HumanizableLog): string | null {
    if (log.targetType !== 'Task') return null
    const id = log.targetId
    if (!id) return null
    if (/-tasks$/.test(id)) return null // bulk sentinel `${n}-tasks`
    if (/\s/.test(id)) return null
    return id
}

/* ────────────────────────────── API chính ─────────────────────────────────── */

/**
 * Chuyển 1 bản ghi audit thành câu tiếng Việt (vị ngữ, không gồm actor) + link tùy chọn.
 *
 * @param log         bản ghi audit (action + target + before/after).
 * @param workspaceId khi truyền → dựng entityHref `/{ws}/task/{id}` nếu log trỏ 1 task.
 */
export function humanizeLogEvent(
    log: HumanizableLog,
    workspaceId?: string,
): HumanizedLog {
    const sentence =
        dynamicSentence(log) ??
        STATIC_SENTENCE[log.action] ??
        'đã thực hiện một thao tác hệ thống' // fallback: KHÔNG lộ key thô (FR-E7.1)

    const taskId = resolveTaskId(log)
    const entityHref = workspaceId && taskId ? `/${workspaceId}/task/${taskId}` : undefined

    return entityHref ? { sentence, entityHref } : { sentence }
}

/* ───────────────── nhãn ngắn cho dropdown "Loại sự kiện" (bộ lọc) ──────────── */

const ACTION_TYPE_LABEL: Record<string, string> = {
    'workspace.created': 'Tạo workspace',
    'workspace.updated': 'Cập nhật workspace',
    'workspace.soft_deleted': 'Xóa workspace',
    'workspace.restored': 'Khôi phục workspace',
    'workspace.hard_deleted': 'Xóa vĩnh viễn workspace',
    'workspace.transferred_ownership': 'Chuyển quyền sở hữu',
    'workspace.clients_cloned': 'Sao chép khách hàng',
    'member.invited': 'Mời thành viên',
    'member.invitation_revoked': 'Hủy lời mời',
    'member.joined': 'Tham gia workspace',
    'member.removed': 'Xóa thành viên',
    'member.left': 'Rời workspace',
    'member.role_changed': 'Đổi vai trò',
    'member.suspended': 'Tạm ngưng thành viên',
    'member.reactivated': 'Kích hoạt lại thành viên',
    'user.deactivated': 'Vô hiệu hóa tài khoản',
    'user.reactivated': 'Kích hoạt lại tài khoản',
    'user.username_migrated': 'Cập nhật tên đăng nhập',
    'user.username_changed': 'Đổi tên đăng nhập',
    'auth.login': 'Đăng nhập',
    'auth.login_success': 'Đăng nhập',
    'auth.logout': 'Đăng xuất',
    'auth.failed_attempt': 'Đăng nhập thất bại',
    'auth.account_locked': 'Khóa tài khoản',
    'auth.signup': 'Đăng ký',
    'auth.email_verified': 'Xác minh email',
    'auth.password_changed': 'Đổi mật khẩu',
    'auth.password_reset_requested': 'Yêu cầu đặt lại mật khẩu',
    'auth.password_reset_completed': 'Đặt lại mật khẩu',
    'auth.email_migration_otp_requested': 'Yêu cầu mã đổi email',
    'auth.email_migrated': 'Đổi email',
    'auth.impersonation_started': 'Bắt đầu impersonate',
    'auth.impersonation_ended': 'Kết thúc impersonate',
    'auth.admin_force_reset_triggered': 'Buộc đặt lại mật khẩu',
    'payroll.bonus_calculated': 'Tính thưởng',
    'payroll.bonus_reverted': 'Hoàn tác thưởng',
    'payroll.locked': 'Khóa bảng lương',
    'payroll.unlocked': 'Mở khóa bảng lương',
    'bonus_config.updated': 'Cập nhật cấu hình thưởng',
    'data.export': 'Xuất dữ liệu',
    'data.import': 'Nhập dữ liệu',
    'permission.checked_denied': 'Từ chối quyền',
    'task.created': 'Tạo task',
    'task.batch_created': 'Tạo nhiều task',
    'task.assigned': 'Giao task',
    'task.started': 'Bắt đầu task',
    'task.delivered': 'Nộp bài task',
    'task.completed': 'Hoàn tất task',
    'task.restored': 'Khôi phục task',
    'task.deleted': 'Xóa task',
    'task.status_updated': 'Đổi trạng thái task',
    'task.bulk_status_updated': 'Đổi trạng thái hàng loạt',
    'task.bulk_updated': 'Cập nhật hàng loạt',
    'task.invariant_auto_synced': 'Tự đồng bộ trạng thái',
    'task.client_approved': 'Khách duyệt',
    'task.client_changes_requested': 'Khách yêu cầu sửa',
    'task.client_submitted': 'Khách gửi task',
    'task.comment_added': 'Bình luận task',
    'task.comment_assigned': 'Giao bình luận',
    'task.comment_unassigned': 'Gỡ giao bình luận',
    'task.comment_resolved': 'Xử lý bình luận',
    'task.comment_reopened': 'Mở lại bình luận',
    'task.raw_footage_mode_changed': 'Đổi chế độ tư liệu',
    'task.raw_footage_map_saved': 'Lưu sơ đồ tư liệu',
    'request.accepted': 'Chấp nhận yêu cầu',
    'request.rejected': 'Từ chối yêu cầu',
    'request.client_submitted': 'Khách gửi yêu cầu',
    'client.soft_deleted': 'Xóa khách hàng',
    'client.restored': 'Khôi phục khách hàng',
    'client.hard_deleted': 'Xóa vĩnh viễn khách hàng',
    'client.auto_merged': 'Gộp khách hàng',
    'client.manual_merged': 'Gộp khách hàng',
    'client.created_via_share_link': 'Tạo brand qua link',
    'pricing_rule.created': 'Tạo quy tắc giá',
    'pricing_rule.updated': 'Cập nhật quy tắc giá',
    'pricing_rule.deleted': 'Xóa quy tắc giá',
    'pricing_rule.set_default': 'Đặt quy tắc giá mặc định',
    'integration.connected': 'Kết nối tích hợp',
    'integration.disconnected': 'Ngắt tích hợp',
    'profile.member_removed': 'Xóa thành viên hồ sơ',
    'profile.role_changed': 'Đổi vai trò hồ sơ',
    'profile.ownership_transferred': 'Chuyển sở hữu hồ sơ',
    'profile.admin_workspace_granted': 'Cấp quyền quản trị',
    'profile.updated': 'Cập nhật hồ sơ',
    'profile.soft_deleted': 'Xóa hồ sơ',
    'profile.restored': 'Khôi phục hồ sơ',
    'profile.hard_deleted': 'Xóa vĩnh viễn hồ sơ',
    'payment.recorded': 'Ghi nhận thanh toán',
    'payment.deleted': 'Xóa thanh toán',
    'share_link.created': 'Tạo link chia sẻ',
    'share_link.revoked': 'Thu hồi link chia sẻ',
    'share_link.accessed': 'Truy cập link chia sẻ',
    'video.version_ready': 'Video: bản dựng sẵn sàng',
    'video.guest_commented': 'Video: khách bình luận',
    'video.share_created': 'Video: tạo link chia sẻ',
    'video.share_revoked': 'Video: thu hồi link',
    'video.share_unrevoked': 'Video: mở lại link',
    'video.version_uploaded': 'Video: tải lên bản dựng',
    'video.review_approved': 'Video: duyệt bản dựng',
    'video.changes_requested': 'Video: yêu cầu sửa',
    'video.comment_added': 'Video: thêm bình luận',
    'video.comment_resolved': 'Video: xử lý bình luận',
    'video.comment_reopened': 'Video: mở lại bình luận',
}

/**
 * Nhãn ngắn cho dropdown "Loại sự kiện" trong bộ lọc.
 * Fallback = key thô (chỉ ở dropdown kỹ thuật, KHÔNG phải dòng nhật ký chính).
 */
export function actionTypeLabel(action: string): string {
    return ACTION_TYPE_LABEL[action] ?? action
}
