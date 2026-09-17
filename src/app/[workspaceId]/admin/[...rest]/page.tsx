// [kiểm toán 2026-07 · S2-3] Bắt mọi đường dẫn sai DƯỚI /admin để 404 giữ được vỏ.
// Cùng lý do và cùng bảo đảm ưu tiên-thấp-nhất như bản /dashboard — xem chú thích ở
// src/app/[workspaceId]/dashboard/[...rest]/page.tsx.
import { notFound } from 'next/navigation'

export default function AdminCatchAll() {
    notFound()
}
