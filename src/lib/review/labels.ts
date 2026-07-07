// [review-fixes P1 / FR-01] Nhãn hiển thị của module review ("Team" → "Tệp").
// Gom về 1 chỗ để đổi tên là 1 dòng (trước đây ≥12 chuỗi hardcode "Team"). Đây chỉ là
// NHÃN UI nội bộ (tiếng Việt); KHÔNG đổi route (/team), tên component (TeamBrowser), hay
// dữ liệu. Trang share cho khách vẫn theo i18n EN riêng.
export const REVIEW_MODULE_LABEL = 'Tệp'
