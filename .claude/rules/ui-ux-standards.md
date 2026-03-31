# UI/UX Standards

## Tổng Quan
Dự án AgencyManager áp dụng phong cách Dark Mode High-End với hiệu ứng Glassmorphism tinh tế. Mọi thành phần Visual đều phải tuân theo nguyên tắc "Sang trọng, Mạch lạc và Ổn định".

## Padding & Margin
- Tận dụng hệ thống lưới Flexbox/Grid của Tailwind.
- Khoảng cách giữa các khối lớn (Section): `gap-8` (2rem) hoặc `gap-12` (3rem).
- Khối nhỏ (Card content): `p-6` (1.5rem).
- Chi tiết siêu vi: `gap-2` hoặc `gap-3`.

## Gradient & Blur (Glassmorphism)
- **Background**: `bg-zinc-950` chủ đạo.
- **Card/Modal**: Kính mờ `bg-zinc-900/40 backdrop-blur-md` hoặc `bg-white/5 backdrop-blur-lg`.
- **Borders**: Sử dụng border trong suốt như `border border-white/10`.
- **Gradients (Dành cho Tiêu đề hoặc Điểm nhấn)**: `bg-gradient-to-r from-emerald-400 to-indigo-500 bg-clip-text text-transparent`.

## Framer Motion & Transitions
- Thời gian chạy animation vàng: `200ms - 300ms`.
- Tailwind: Luôn thêm `transition-all duration-300 ease-in-out` cho trạng thái hover của nút bấm/Card.
- Framer Motion: Thường dùng `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}` để load layout.
- Thay đổi mượt mà màu chữ & border trên thẻ trạng thái (Ví dụ: `hover:border-indigo-500/50`).
