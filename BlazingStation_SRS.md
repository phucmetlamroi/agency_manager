# TÀI LIỆU YÊU CẦU PHẦN MỀM (SRS - Software Requirements Specification)
**Dự án:** Blazing Station / Agency Manager  
**Phiên bản:** v1.3.0  
**Đối tượng cung cấp:** Đội ngũ phát triển (Frontend & Backend Developer)  
**Ngày lập:** Tháng 4/2026

---

## MỤC LỤC
A. KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)  
B. CẤU TRÚC CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)  
C. TÀI LIỆU API & SERVER ACTIONS (API DOCUMENTATION)  
D. LUỒNG NGHIỆP VỤ CỐT LÕI (BUSINESS LOGIC)  
E. HƯỚNG DẪN VẬN HÀNH (DEPLOYMENT & OPS)

---

## A. KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống được xây dựng theo mô hình **SaaS Multi-Tenant (Cách ly dữ liệu)**. Toàn bộ mã nguồn ứng dụng (Frontend + Backend) được đóng gói chung trong một Monorepo sử dụng Next.js.

### 1. Tech Stack (Công nghệ sử dụng)
*   **Framework chính:** Next.js 15.x (App Router, Server Actions).
*   **Ngôn ngữ:** TypeScript.
*   **Cơ sở dữ liệu (Database):** PostgreSQL (Đang lưu trữ trên nền tảng Serverless - Neon DB).
*   **ORM (Quản lý Database):** Prisma (`@prisma/client` & `@prisma/adapter-neon`).
*   **Giao diện (Frontend):** 
    *   Tailwind CSS v3 (Custom Utility Classes, Glassmorphism).
    *   Radix UI (Các Component nguyên thủy, Accessible).
    *   Framer Motion (Hệ thống hiệu ứng Animation cao cấp).
    *   `@dnd-kit` (Hệ thống kéo thả Drag-and-Drop cho thẻ Tasks).
    *   `recharts` (Biểu đồ dữ liệu cho Analytics).
    *   Tiptap (Rich Text Editor).
*   **State Management & Data Fetching:** Sử dụng song song Zustand (cho UI state - nếu có) và Server Components (cho Data).
*   **Lưu trữ File (Storage):** Vercel Blob (`@vercel/blob`).
*   **Xác thực (Authentication):** JWT tự tùy chỉnh dựa trên thư viện `jose` và mã hóa mật khẩu `bcryptjs`. Không dùng thư viện chuyên biệt như NextAuth/Auth.js.

### 2. Sơ đồ hạ tầng (Infrastructure Diagram)
```text
  [Client (Browser / Mobile)] 
         | (HTTPS)
         v
  [Vercel Edge Network] ----> [Vercel Blob Storage] (Chứa File đính kèm, Avatar)
         |
         v
  [Next.js Serverless Functions] (Backend API & Server Actions)
         | (Prisma Connection)
         v
  [Neon Serverless PostgreSQL DB] (Lưu trữ dữ liệu hệ thống)
```

### 3. Luồng dữ liệu (Data Flow)
*   Thay vì dùng REST API truyền thống theo cấu trúc `/api/v1/xxx`, dự án hiện tại phần lớn sử dụng **Next.js Server Actions** (nằm trong thư mục `src/actions/*.ts`).
*   **Đặc điểm luồng chạy:** 
    *   Client gọi hàm TypeScript (Ví dụ: `updateTaskStatus()`) như gọi hàm cục bộ.
    *   Next.js tự động chuyển đổi thành HTTP POST Request ngầm gửi lên Backend.
    *   Backend nhận Request -> Middleware check Session (Token) -> Truy cập Prisma lấy DB (có kẹp theo tham số `workspaceId` để tách biệt dữ liệu).

---

## B. CẤU TRÚC CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)
Hệ thống sử dụng cơ sở dữ liệu có cấu trúc lưới rất chặt chẽ bao gồm quản lý tác vụ (Task), tài chính (Invoice), CRM (Client) và hiệu suất (Performance).

### Sơ đồ thiết kế cấu trúc cách ly đặc thù (Multi-tenancy):
Hệ thống chia làm hai lớp ảo hóa:
1.  **Global Level:** Root (Gốc) như `User`, `Profile` (Đại diện cho Công ty / Agency mẹ).
2.  **Isolated Level:** Dữ liệu nằm trong `Workspace`. Để xem được `Task`, `Invoice`, dev **bắt buộc** phải kẹp `<workspaceId>` vào điều kiện câu lệnh lấy dữ liệu. Quá trình này được ghi đè (override Prisma extension) ngầm bên trong file `src/lib/prisma-workspace.ts`.

### Các Bảng (Tables) cốt lõi:

*   **`User` (Nhân sự & Khách hàng):** Chứa thông tin đăng nhập (`username`, `password` được mã hóa), số tài khoản ngân hàng thưởng, cấp độ quyền (`ADMIN`, `USER`, `CLIENT`, `LOCKED`).
*   **`Profile` (Tổ chức/Agency mẹ):** Chứ cái rễ (Tenant ID) lớn nhất để cô lập luồng dữ liệu của các thương hiệu khác nhau sử dụng SaaS.
*   **`Workspace` & `WorkspaceMember`:** Phân mảnh nhỏ hơn của `Profile`, ví dụ 1 Profile (Công ty A) có 2 Workspace (Phòng Video, Phòng Design). 
*   **`Task`:** Bảng trung tâm. Lưu mọi thứ về công việc: `title` (Tên), `status` (Trạng thái - VD: *Đang đợi giao*, *Đang thực hiện*, *Revision*...), `deadline`, `wageVND` (Lương cho nhân sự), `jobPriceUSD` (Giá bán cho KH). Ràng buộc ForeignKey đến Assignee (User nhận việc), Client (Khách liên quan), Invoice (nếu đã tính tiền).
*   **`Client`:** CRM. Có khả năng tự liên kết cha - con (`parentId`) tạo thành cấu trúc khách hàng Mẹ - Con (Subsidiaries). Có tính năng theo dõi tiền cọc (`depositBalance`).
*   **`Invoice` & `InvoiceItem`:** Hệ thống hóa đơn tự động. Gom nhóm nhiều `Task` chưa thanh toán (`invoiceStatus = UNBILLED`) thành hóa đơn gửi ra bằng tiền tệ.
*   **`MonthlyBonus`, `PerformanceMetric`, `ErrorLog`, `MonthlyRank`:** Hệ toán đánh giá KPI tự động dựa trên số lỗi (Penalty) và khối lượng sản lượng task (Revenue) rồi chấm điểm (Rank S, A, B, C, D).

---

## C. TÀI LIỆU API & LUỒNG LÀM VIỆC (API DOCS SERVER ACTIONS)

Do tính chất dùng Server Actions, tài liệu API được đại diện chủ yếu bằng **Các tệp thao tác (Actions Files)**.

### Môi trường và Bảo mật (Security)
*   **Middleware (`src/middleware.ts`):** Check JWT (`session` cookie) trên mỗi Request (chuyên chở URL routing). Trả về màn login nếu ko có session.
*   **RBAC Auth Guard (`src/lib/auth-guard.ts`):** Sử dụng các hàm như `getCurrentUser()` bên trong các backend functions để đọc role, profileId.
*   **Cross-check BOLA/IDOR Guard (`src/lib/security.ts`):** Hàm `verifyWorkspaceAccess()` kiểm chứng người gửi Request có thực sự nằm trong danh sách `WorkspaceMember` của không gian đó không, đề phòng Hacker gọi API xuyên Workspace.

### Danh mục Server Actions chính (`src/actions/`):
1.  **Task Actions (`task-actions.ts` / `task-management-actions.ts`)**
    *   `updateTaskStatus(id, newStatus, workspaceId)`: Thay đổi trạng thái Task (từ Đang đợi qua Review...).
    *   Đây là Core API chứa FSM (Finite State Machine) chống nhảy trạng thái bậy (Ví dụ không cho phép đang Review nhảy ngược về Nhận Task).
2.  **Claim Actions (`claim-actions.ts`)**
    *   `getMarketplaceTasks()`, `claimTask()`: Logic phiên chợ. Cho phép nhân viên tự nhặt tự do Task chưa có Assignee.
3.  **Bonus Actions (`bonus-actions.ts`)**
    *   `calculateMonthlyBonus()`: Hàm tính luân chuyên. Lặp qua tỷ lệ hoàn thành đúng hạn (On Time), lỗi (ErrorLog) để xếp Rank (S-D) cho lương, thưởng cuối tháng.
4.  **Invoice Actions (`invoice-actions.ts`)**
    *   `getUnbilledTasks()`, `createInvoiceRecord()`: Logic quy chuẩn Task từ 'Chờ xuất hóa đơn' sang 'Đã xuất', cộng bù trừ tiền Deposit của Client.

---

## D. LUỒNG NGHIỆP VỤ CỐT LÕI ĐẶC THÙ (BUSINESS LOGIC)

### 1. Vòng đời Tác vụ (Task Lifecycle - FSM)
1.  `Đang đợi giao` (Pending): Chờ Admin gán hoặc Staff tự Claim (Marketplace).
2.  `Nhận task` (Assigned): Nhân sự đã nhận nhưng chưa bắt tay vô việc.
3.  `Đang thực hiện` (In_Progress): Hệ thống đánh dấu bắt đầu.
4.  `Review`: Nhân sự nộp bài, chờ Admin chấm điểm.
5.  *(Nhánh 1)* `Revision`: Nếu Admin bắt lỗi, bị tính vô `ErrorLog` (Bị Penalty làm móp Rank tháng). Task vòng ngược lại cho nhân viên.
6.  *(Nhánh 2)* `Hoàn tất` (Completed): Admin chốt Pass. Tiền (`wageVND`) lập tức được chuyển mốc vào Ví Lương tháng chốt sổ cho Staff.

### 2. Thuật toán Xếp Hạng Lương (Payroll Ranking Algorithm)
Nằm tại `bonus-actions.ts`.
1.  Lấy ra các `Revenue` (doanh thu bản thân) của Staff đã hoàn thiện trong không gian.
2.  Tính Rate: `<Số lỗi> / <Số Task done>`. (VD ErrorRate > 0.3 là rớt Rank).
3.  Dựng ma trận: `< 0.3` (S), `< 0.6` (A), `< 1.0` (B)... (Rank S không được cấp tiền mặt thưởng, do cơ chế mới).
4.  Tính Top 2 người cao nhất (IncomeScore cao nhất trừ Penalty) sẽ hưởng %, sau đó tiến hành "Lock" data (`payrollLock`), không cho sửa Task đã cộng tiền.

### 3. Kiến trúc cách ly Database (`prisma-workspace.ts`)
Thay vì mỗi lệnh Dev gọi phải viết: `where: { workspaceId: xxx}`, hệ thống được chèn **Prisma Extension**. 
Khi gửi request xuống DB thao tác `findMany`, `create`, hệ thống sẽ *tự động nhúng* thuộc tính `{ workspaceId }` & `{ profileId }` vào câu lệnh Prisma. **Dev mới lưu ý điều này tránh việc bất ngờ khi code**.

---

## E. HƯỚNG DẪN VẬN HÀNH (DEPLOYMENT & OPS)

### 1. Variables Môi Trường Đặc Trưng (Environment - `.env.local`)
```env
DATABASE_URL="postgres://..." (Neon Serverless Postgres)
JWT_SECRET="Chuỗi JWT bí mật (Đề nghị set 64 ký tự)"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Startup Dành Cho Dev
*   Cài đặt thư viện: `npm install --legacy-peer-deps` (Hoặc cứ `npm install` nếu config chặt).
*   Sync Database Schema: `npx prisma db push` (Hệ thống không sử dụng Migration do cường độ cấu trúc linh hoạt. Chỉ dùng Push chèn thẳng DB cấp tốc).
*   Chạy code: `npm run dev`

### 3. Cơ Chế Báo Cáo Lỗi & Logs (Monitoring / Cron)
*   Logs chính đến từ server render (Terminal Dev) bằng `console.error`.
*   Có thiết lập API tại `/api/cron/check-deadline/route.ts` để tự động check deadline các Task quá hạn mà chưa gửi bài, nếu quá hạn nó sẽ kích hoạt Logic tự động đuổi Task về trạng thái 'Pending'.

---
**[END OF SRS]**
Dữ liệu trên phản ánh toàn hệ thống tính đến nhánh mã nguồn hiện đại nhất (version Premium Design).
