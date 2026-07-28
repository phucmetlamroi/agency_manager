// [kiểm toán 2026-07 · S2-3] Trang 404 gốc — file này TRƯỚC ĐÂY KHÔNG TỒN TẠI.
//
// Không có nó, Next dựng trang 404 mặc định của framework: tiếng Anh, nền trắng, không
// nút nào. Root layout đã đặt lang="vi" nên chỉ thiếu đúng trang này.
//
// GIỚI HẠN CỦA NEXT (đo được, không phải suy đoán): các đường dẫn KHÔNG khớp route nào
// đều rơi về đây — bên ngoài vỏ ứng dụng, mất sidebar — kể cả khi chúng nằm sâu trong
// /[workspaceId]/. Vì vậy /dashboard và /admin có thêm catch-all route riêng để giữ vỏ;
// xem src/app/[workspaceId]/dashboard/[...rest]/page.tsx.
import { NotFoundPanel } from '@/components/errors/NotFoundPanel'

export default function RootNotFound() {
    // Không có ngữ cảnh workspace ở tầng gốc → về trang chủ. Người đã đăng nhập sẽ được
    // route "/" đưa tiếp vào workspace của họ.
    return <NotFoundPanel homeHref="/" homeLabel="Về trang chủ" />
}
