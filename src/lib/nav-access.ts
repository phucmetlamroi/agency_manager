/**
 * [kiểm toán 2026-07 · S2-1 / Q1] Điều hướng theo quyền — MỘT nguồn duy nhất.
 *
 * ─── VÌ SAO ────────────────────────────────────────────────────────────────
 * Sidebar trước đây cố ý hiện ĐỦ mọi mục cho mọi người (comment [Sprint F.4] trong
 * AppSidebar) và giao việc chặn cho từng trang. Đo thực tế: 9 trên 15 mục đá một
 * editor về /dashboard mà KHÔNG nói một chữ nào — người dùng không phân biệt được
 * "tôi không có quyền" với "ứng dụng hỏng".
 *
 * Chủ sản phẩm chốt ở Q1: mục nào tài khoản KHÔNG vào được thì **ẩn hẳn** (không
 * làm mờ, không khoá).
 *
 * ─── KHÔNG DỰNG BỘ QUYỀN THỨ HAI ───────────────────────────────────────────
 * Cả ba cờ dưới đây đọc ra từ ĐÚNG MỘT lời gọi `verifyProfileAdminAccess` — chính
 * vị từ mà admin/layout.tsx dùng làm cổng vào /admin. Không có danh sách quyền
 * song song nào để lệch pha về sau.
 *
 * Bản đồ cờ ↔ cổng THẬT của từng trang (đã đọc từng file, không suy đoán):
 *
 *   admin           verifyProfileAdminAccess           → cổng vào MỌI /admin/**
 *                   (admin/layout.tsx:58) và mọi trang /mc/**
 *   workspaceAdmin  verifyWorkspaceAccess(…, 'ADMIN')  → Phân tích, Nhật ký hoạt động,
 *                                                        Cài đặt
 *   profileAdmin    getProfileRole ∈ OWNER|ADMIN       → Thành viên, Tài chính
 *
 * Hai cờ sau KHÔNG thừa. Chúng bắt đúng hai kẽ hở có thật:
 *   • Một profile ADMIN được cấp quyền SAU khi workspace ra đời bị
 *     verifyWorkspaceAccess hạ xuống MEMBER (security.ts:106) → qua được cổng
 *     /admin nhưng vẫn bị Phân tích / Nhật ký / Cài đặt đá ra.
 *   • Một ADMIN chỉ có hàng WorkspaceMember mà không có ProfileAccess → Thành viên
 *     đá họ về dashboard, Tài chính hiện "Quyền truy cập bị từ chối".
 *
 * Bất biến: `workspaceAdmin` và `profileAdmin` CHỈ có thể true khi `admin` true
 * (chúng chỉ được gán bên trong nhánh thành công). Nên mỗi mục nav chỉ cần kiểm
 * MỘT cờ, không phải kiểm chồng.
 *
 * ─── ẨN LÀ CHUYỆN CỦA GIAO DIỆN, KHÔNG PHẢI CỦA BẢO MẬT ────────────────────
 * File này KHÔNG nới và KHÔNG siết bất kỳ cổng nào. Mọi trang vẫn tự gác như cũ;
 * đây chỉ là thôi vẽ ra những lối đi chắc chắn dẫn tới cửa đóng.
 */
import { cache } from 'react'
import { verifyProfileAdminAccess } from '@/lib/security'

export interface NavAccess {
    /** Qua được cổng /admin (và /mc). */
    admin: boolean
    /** workspaceRole ≥ ADMIN — Phân tích · Nhật ký hoạt động · Cài đặt. */
    workspaceAdmin: boolean
    /** profileRole ∈ OWNER|ADMIN — Thành viên · Tài chính. */
    profileAdmin: boolean
}

export const NO_NAV_ACCESS: NavAccess = { admin: false, workspaceAdmin: false, profileAdmin: false }

/**
 * Gói `cache()` của React: nếu một request có nhiều layout lồng nhau cùng hỏi
 * (dashboard → team → …), chỉ đúng một lượt truy vấn thật sự chạy.
 */
export const deriveNavAccess = cache(async function deriveNavAccess(workspaceId: string): Promise<NavAccess> {
    try {
        const access = await verifyProfileAdminAccess(workspaceId)
        return {
            admin: true,
            workspaceAdmin: access.workspaceRole === 'OWNER' || access.workspaceRole === 'ADMIN',
            profileAdmin: access.profileRole === 'OWNER' || access.profileRole === 'ADMIN',
        }
    } catch {
        return NO_NAV_ACCESS
    }
})
