# 📊 Báo Cáo Chi Tiết Hệ Thống AgencyManager

Bản báo cáo này tổng hợp toàn bộ kiến trúc, tính năng và trạng thái kỹ thuật hiện tại của hệ thống **AgencyManager**.

---

## 🏗️ 1. Kiến Trúc Kỹ Thuật (Technology Stack)

Hệ thống được xây dựng trên nền tảng công nghệ hiện đại nhất (Edge-ready):

*   **Frontend & Fullstack**: [Next.js 16](https://nextjs.org/) (App Router) - Phiên bản mới nhất, tối ưu hiệu năng và bảo mật.
*   **Ngôn ngữ**: TypeScript 5.x.
*   **Cơ sở dữ liệu**: [Neon Postgres](https://neon.tech/) (Serverless PostgreSQL).
*   **ORM (Object-Relational Mapping)**: [Prisma 5.x](https://www.prisma.io/) với Driver Adapter cho môi trường Edge/Serverless.
*   **Xác thực (Auth)**: JWT Session kết hợp với HttpOnly Cookies.
*   **Giao diện (UI)**: Tailwind CSS (Vanilla CSS logic), Radix UI, Lucide Icons.
*   **Tiện ích**:
    *   **Zod**: Kiểm tra và validate dữ liệu/biến môi trường.
    *   **Recharts**: Hiển thị biểu đồ phân tích (CRM & Performance).
    *   **Puppeteer (@sparticuz/chromium)**: Xuất hóa đơn (Invoice) sang định dạng PDF.

---

## 📂 2. Cấu Trúc Module (System Modules)

Hệ thống được tổ chức theo mô hình **Multi-Workspace** (Đa không gian làm việc):

### 🔑 Xác thực & Phân quyền
*   **Login**: Hệ thống đăng nhập bảo mật.
*   **Workspace Selector**: Cho phép người dùng chọn không gian làm việc sau khi đăng nhập.
*   **Role-based Access Control (RBAC)**: Phân quyền chi tiết giữa `ADMIN`, `USER` (Editor), `AGENCY_ADMIN`, và `TREASURER` (Thủ quỹ).

### 🚀 Quản lý Tác vụ (Task Management)
*   **Task Queue**: Quản lý quy trình làm việc từ lúc nhận source đến khi hoàn tất.
*   **Bulk Actions**: Cho phép gán hàng loạt, xóa hoặc cập nhật trạng thái nhiều task cùng lúc.
*   **Feedback System**: Hệ thống phản hồi trực tiếp trên từng task.

### 👥 CRM & Quản lý Khách hàng
*   **Client Hierarchy**: Phân cấp khách hàng (Parent-Subsidiary).
*   **AI Insight**: Đánh giá khách hàng dựa trên chỉ số ma sát (`frictionIndex`) và chất lượng đầu vào.
*   **Tiering**: Phân loại khách ảnh (Diamond, Gold, Silver).

### 💰 Tài chính & Nhân sự
*   **Invoice Generator**: Tạo hóa đơn PDF chuyên nghiệp, khấu trừ từ số dư đặt cọc (`depositBalance`).
*   **Payroll System**: Tính lương tự động dựa trên doanh thu task và hiệu suất.
*   **Monthly Bonus**: Cơ chế xếp hạng và thưởng nóng cho nhân viên xuất sắc.
*   **Payroll Lock**: Chốt dữ liệu tài chính hàng tháng để đảm bảo tính minh bạch.

---

## 💾 3. Mô Hình Dữ Liệu (Data Model)

Hệ thống sử dụng schema PostgreSQL phức tạp với hơn 15 bảng liên kết:

*   **Workspace**: Gốc của mọi dữ liệu.
*   **User**: Thông tin cá nhân, Reputation (uy tín), và tài khoản thanh toán.
*   **Task**: Chứa mọi chi tiết về công việc, giá trị (VND/USD), và tỷ giá hối đoái.
*   **Client & Project**: Lưu trữ thông tin đối tác và dự án liên quan.
*   **Invoice & InvoiceItem**: Lịch sử thu phí và hóa đơn.
*   **PerformanceMetric**: Lưu trữ chỉ số hiệu quả hàng tháng của mỗi thành viên.

---

## 🛠️ 4. Các Cải Tiến Kỹ Thuật Gần Đây

Dưới đây là các "bản vá" quan trọng giúp hệ thống vận hành ổn định trên Vercel:

1.  **Hệ thống kết nối DB siêu ổn định**: Sử dụng cơ chế global caching cho Prisma và cấu hình connection pool tối ưu cho Neon, loại bỏ hoàn toàn lỗi "Connection terminated unexpectedly".
2.  **Next.js 16 Upgrade**: Nâng cấp lên phiên bản mới nhất để vá các lỗ hổng bảo mật và tăng tốc độ Build.
3.  **NoSSR Engine**: Khắc phục lỗi build biểu đồ bằng cách cách ly các component chỉ chạy trên client.
4.  **Robust Environment (env.ts)**: Hệ thống tự động kiểm tra và cảnh báo nếu thiếu biến môi trường (`DATABASE_URL`, `JWT_SECRET`) ngay khi khởi động.
5.  **Workspace Switcher**: Đã bổ sung nút chuyển đổi không gian làm việc cho cả Admin và User trên mọi thiết bị.

---

## 📈 5. Trạng Thái Hiện Tại

*   **Production**: Hoạt động ổn định trên Vercel.
*   **Database**: Neon Postgres vận hành ở chế độ Pooled Connection để chịu tải cao.
*   **Build Status**: Success (Sạch bóng lỗi build và lint).

---
*Báo cáo được khởi tạo tự động bởi hệ thống hỗ trợ Antigravity.*