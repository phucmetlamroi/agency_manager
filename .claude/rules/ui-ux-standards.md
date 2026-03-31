# UI/UX STANDARDS (AGENCYMANAGER V2.0)

## 1. STYLE TỔNG QUAN
- **Chủ đạo**: Dark Mode Glassmorphism (Soft UI Evolution).
- **Phản hồi tương tác (Interactive)**: Mọi thao tác cuộn chuột, Click hoặc Hover ĐỀU phải có phản hồi mượt bằng Framer Motion (Transition: `150ms-200ms` hoặc lò xo `bounce`).

## 2. PADDING & RADIUS KHUYẾN NGHỊ
- **Card To (Master Box)**: `p-6 md:p-8`, bo góc `rounded-2xl` hoặc `rounded-3xl`.
- **Thẻ Nhỏ (List Row/Pill)**: `p-3` hoặc `p-4`, bo góc `rounded-xl`.
- **Form Input**: `px-4 py-3`, `rounded-xl`, nền mờ `bg-zinc-900/50`.

## 3. COLOR PALETTE (CỐT LÕI)
- Lấy thông báo từ MASTER.md.
- **Nền chính**: `bg-zinc-950`
- **Thành phần nổi (Glass Card)**: `bg-zinc-950/60` (hoặc `bg-black/40`), `backdrop-blur-xl`.
- **Trạng thái (Status/Glow)**:
  - Thành công / Tổng thực nhận: `text-emerald-400`, `drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]`.
  - Dự báo / Pending / Form Step Active: `text-indigo-400`, phát sáng dịu.
  - Lỗi / Khẩn cấp: `text-red-400`.

## 4. CHI TIẾT TỪNG TRANG (REFERENCE)
- **Cấm giao diện "phẳng"**: Mọi dòng, thẻ, card đều có lớp gradient chìm (ví dụ: `hover:bg-zinc-800/50`), và một lớp viền mỏng vô cùng tinh tế `border-white/5` hoặc `border-white/10`.
- **Đổ bóng đa tầng**: `shadow-xl`, `shadow-black/60` hoặc glow nhẹ từ sau lưng Card.
