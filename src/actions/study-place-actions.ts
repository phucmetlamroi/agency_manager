'use server'

// [Đã gỡ StudyPlace 2026-09-08] Tính năng đã bỏ khỏi sản phẩm: component, store Zustand, lib
// tính SM-2, script import, tài liệu và mọi lời gọi từ /admin/settings đều đã đi. Bảng
// `StudyPlaceProgress` vẫn còn trong schema.prisma và trên DB — drop bảng là việc riêng, cần
// duyệt push production, không gom vào đợt gỡ code này.
//
// File này CHỈ còn một hàm rỗng vì src/app/[workspaceId]/mc/settings/page.tsx (vùng không được
// sửa — Mission Control phải byte-identical) vẫn import getStudyPlaceProgress, gọi nó, rồi truyền
// kết quả vào prop `studyProgress` của WorkspaceSettingsPanel. Không chạm DB, không kiểm quyền,
// không đọc gì. Khi mc/settings thôi gọi thì xoá hẳn file này cùng prop kia.
export async function getStudyPlaceProgress(_workspaceId: string): Promise<never[]> {
    return []
}
