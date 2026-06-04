# SƠ ĐỒ TRANG & LUỒNG HOẠT ĐỘNG: USER DASHBOARD (STAFF)

Tài liệu này cung cấp sơ đồ (Sitemap) và giải thích luồng hoạt động của toàn bộ không gian làm việc dành cho Nhân sự (Staff / User Dashboard) trong hệ thống Agency Manager.

---

## 1. SƠ ĐỒ TRANG (SITEMAP) TỔNG THỂ

```text
/[workspaceId]/dashboard  (Trang Tổng quan / Home)
 │
 ├── Thanh Điều hướng (Navigation Bar)
 │    ├── Trình chuyển đổi Workspace (Đổi Team)
 │    ├── Overview (Tổng quan)
 │    ├── Lịch làm (Schedule)
 │    ├── Lỗi cá nhân (Errors)
 │    └── Profile (Thông tin cá nhân)
 │
 ├── 1. Khối Dữ liệu Tài chính & KPI (Bento Grid)
 │    ├── Lương thực nhận (Base Salary + Bonus)
 │    ├── Thu nhập dự kiến (Pending Salary từ các Task đang làm)
 │    ├── Tỷ lệ lỗi (Error Rate) & Trạng thái cảnh báo (An toàn / Nguy hiểm)
 │    └── Thống kê Task (Hoàn tất / Đang làm / Tổng cộng)
 │
 ├── 2. Bảng Xếp hạng (Leaderboard)
 │    └── Hiển thị Rank (Top 1, 2, 3...) và điểm hiệu suất của toàn bộ nhân sự trong Team.
 │
 ├── 3. Danh sách Công việc (Task Table)
 │    └── Bảng hiển thị các Task đang được giao cho user (có thể lọc theo trạng thái).
 │
 └── 4. Phiên Chợ Công Việc (Marketplace FAB)
      └── Nút nổi góc màn hình để Staff bấm vào tự do nhận (Claim) các Task chưa có người làm.

/[workspaceId]/dashboard/schedule  (Trang Lịch làm việc)
 │
 └── Lịch tương tác (Optimistic Grid)
      ├── Kéo & Thả (Drag & Drop) để đăng ký giờ làm việc cố định (Rule).
      └── Kéo & Thả để báo bận đột xuất / xin nghỉ (Block / Exception).

/[workspaceId]/dashboard/errors  (Trang Lỗi cá nhân)
 │
 └── Chi tiết Vi phạm (Staff Error Detail)
      └── Danh sách toàn bộ Feedback (Lỗi Nội bộ / Khách phàn nàn) bị ghi nhận trong tháng.

/[workspaceId]/dashboard/profile  (Trang Cài đặt Cá nhân)
 │
 ├── Cập nhật Ảnh đại diện (Avatar Upload).
 ├── Hồ sơ & Bảo mật (Đổi Tên hiển thị, Đổi Mật khẩu).
 └── Thông tin Nhận lương (Tải lên mã QR Ngân hàng / Nhập số tài khoản).
```

---

## 2. LUỒNG HOẠT ĐỘNG THỰC TẾ CỦA STAFF (WORKFLOW)

### A. Bắt đầu ngày làm việc
1. **Đăng nhập & Chọn Team:** Staff đăng nhập vào hệ thống. Nếu làm cho nhiều phòng ban (Workspaces), họ sẽ được đưa tới `/profile` để chọn Team muốn vào làm việc.
2. **Cập nhật Lịch (Schedule):** Vào mục **Lịch làm**, Staff kéo thả chuột trên bảng thời gian để đăng ký ca làm việc hoặc báo bận ngày hôm đó. Admin sẽ nhìn thấy lịch này để biết đường giao việc.

### B. Tiếp nhận & Xử lý Công việc (Task Flow)
1. **Kiểm tra Overview:** Tại trang chủ Dashboard, Staff kéo xuống phần **Task Table** để xem hôm nay Admin có giao cho mình bài nào mới không (Trạng thái: *Đang đợi giao* hoặc *Nhận task*).
2. **Phiên Chợ Task (Marketplace):** Nếu đang rảnh, Staff có thể bấm vào nút **Marketplace (Phiên chợ)** ở góc dưới màn hình để xem các Task đang "vô chủ" và tự bấm nút "Nhận" (Claim) để kiếm thêm thu nhập. (Task nhận từ chợ nếu không làm kịp có thể "Hoàn trả" trong vòng 10 phút).
3. **Cập nhật Trạng thái:** Khi bắt đầu làm, chuyển trạng thái Task sang *Đang thực hiện*. Khi xong, chuyển sang *Review* để Admin chấm điểm.

### C. Quản lý Hiệu suất & Thu nhập (KPI & Salary)
1. **Theo dõi Lương theo thời gian thực:** Ngay khi một Task được Admin duyệt (chuyển sang *Hoàn tất*), tiền lương lập tức cộng dồn vào con số **Lương thực nhận** to đùng trên cùng. Những task đang làm dở sẽ nằm ở mục **Thu nhập dự kiến**.
2. **Quản trị Rủi ro (Lỗi cá nhân):** 
   - Nếu bài bị trả về (Trạng thái *Revision*), Staff sẽ thấy **Tỷ lệ lỗi (Error Rate)** của mình tăng lên.
   - Nếu tỷ lệ lỗi chuyển sang mức **Cảnh báo (Màu đỏ/Vàng)**, Staff có thể click sang tab **Lỗi cá nhân** để xem chi tiết Admin hoặc Khách hàng đang chê bài mình ở điểm nào để rút kinh nghiệm.
3. **Đua Top Xếp Hạng (Leaderboard):** Cuối tháng, hệ thống sẽ chốt sổ dựa trên Bảng xếp hạng. Ai có Doanh thu cao nhất và Ít lỗi nhất sẽ leo lên Top 1, Top 2 và nhận được khoản tiền Thưởng (Bonus).

### D. Nhận Lương
- Cuối tháng, sau khi Admin "Chốt sổ lương" (Payroll Lock), Staff vào mục **Profile** đảm bảo đã upload mã QR Ngân hàng chính xác. Admin sẽ quét mã đó để chuyển khoản lương + thưởng.
