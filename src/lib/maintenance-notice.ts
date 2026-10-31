// [Bảo trì 31/10→01/11/2026] Banner thông báo bảo trì (bản cập nhật lớn) trong workspace layout.
// Hiện NGAY khi triển khai và tự biến mất sau giờ kết thúc — không cần gỡ tay.
// Gỡ hẳn: xoá <MaintenanceBanner /> ở src/app/[workspaceId]/layout.tsx rồi xoá file này.

/** Mốc kết thúc bảo trì: 3:00 sáng 01/11/2026 giờ Việt Nam. Qua mốc này banner tự ẩn. */
export const MAINTENANCE_NOTICE_END = '2026-11-01T03:00:00+07:00'

export function isMaintenanceNoticeActive(now: number = Date.now()): boolean {
    return now < Date.parse(MAINTENANCE_NOTICE_END)
}
