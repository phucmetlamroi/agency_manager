# Bối cảnh dự án AgencyManager - UI/UX Transformation

## Kiến trúc Core
- Framework: Next.js 15 (App Router).
- Database: Neon Postgres (Prisma ORM). Cấu trúc KHÔNG THAY ĐỔI.
- Hệ sinh thái UI: TailwindCSS, Framer Motion, Radix UI.
- Quản lý Multi-tenancy qua `workspaceId`.

## Sứ mệnh hiện tại
Nâng cấp giao diện dự án AgencyManager theo tiêu chuẩn **High-End Glassmorphism**.
Vừa hoàn thành Task 1 (Design System) & Task 2 (Khuôn khổ Agent).
Chuẩn bị thực thi Task 2 Refactor & Task 3 (Visual Overhaul) + Task 4 (Optimistic UI & Responsive).

## Quy định ưu tiên: Safety First 
1. TUYỆT ĐỐI không chạm vào luồng Logic. Chỉ biến đổi file `*.tsx` Presentational Layer (`className` & JSX structure).
2. Khi Component đổi design, phải đảm bảo Props (`id`, `status`, `userId`, functions) được cắm đúng vào DOM Elements mới.
3. Không làm bể chức năng "Tự động đổi trạng thái" UI nếu Server chưa phản hồi chậm. (Chơi hệ Optimistic UI bằng useState hoặc useOptimistic).
