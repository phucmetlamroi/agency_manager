# SAFETY PROTOCOL (UI/UX TRANSFORMATION)

## 1. BẤT BIẾN (IMMUTABLE ZONES)
1. **Tuyệt đối cấm** thay đổi cấu trúc Database: `schema.prisma`.
2. **Tuyệt đối cấm** chỉnh sửa logic API Backend: Toàn bộ thư mục `/src/app/api/`.
3. **Cấm** xóa các ID, Query, hoặc Logic Validation hiện đang hoạt động trên Server Actions.
4. **Không** thay đổi biến môi trường.

## 2. QUY TRÌNH "MAPPING BEFORE STYLING"
- Bạn PHẢI đọc và hiểu luồng dữ liệu của component (file `.tsx`) trước khi thực hiện bất cứ sửa đổi Tailwind CSS nào.
- Chỉ can thiệp vào tầng **Presentational** (Hiệu ứng hiển thị) và UI Layouts.
- Lưu ý không làm mất hoặc thay đổi các event handlers quan trọng (onClick, onSubmit, etc.).

## 3. ZERO DATA LOSS POLICY
- Nếu component đang tính toán lợi nhuận/USD/VNĐ, giá trị vẫn phải hiển thị chính xác ở giao diện mới.
- Bất cứ dữ liệu mapping nào (như ClientID, Role, Dates) phải được truyền đi đầy đủ như thiết kế gốc.
