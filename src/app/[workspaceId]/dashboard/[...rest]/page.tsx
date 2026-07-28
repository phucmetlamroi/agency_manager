// [kiểm toán 2026-07 · S2-3] Bắt mọi đường dẫn sai DƯỚI /dashboard để 404 giữ được vỏ.
//
// Vì sao cần: `not-found.tsx` lồng nhau của Next CHỈ chạy khi có mã gọi notFound() bên
// trong nhánh đó. Đường dẫn không khớp route nào thì Next bỏ qua cả cây layout và rơi
// thẳng về app/not-found.tsx ở gốc — mất sidebar. Route catch-all này khớp phần còn lại,
// nên nhánh /dashboard được vào, rồi notFound() kích hoạt dashboard/not-found.tsx.
//
// An toàn: catch-all có ĐỘ ƯU TIÊN THẤP NHẤT trong bảng khớp route của Next — mọi trang
// tĩnh và động đã có đều thắng nó. Nó chỉ chạy ở đúng những đường dẫn hôm nay đang trả
// 404 trần.
import { notFound } from 'next/navigation'

export default function DashboardCatchAll() {
    notFound()
}
