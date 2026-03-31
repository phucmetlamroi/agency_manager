# Logic Mapping - CẤT CÁNH AN TOÀN TRƯỚC KHI STYLE

**Quy tắc tối thượng: Bất biến Chức năng.**

Trước khi thay đổi bất kỳ thuộc tính `className` nào ở một file UI, LUÔN LUÔN thực hiện các bước Mapping sau:

1. **Xác định Interface / Props**: Component này nhận vào thuộc tính gì? (`tasks`, `users`, `onClick`, `onSave`). Đảm bảo kiểu dữ liệu nguyên vẹn.
2. **Liệt kê Events**: 
   - Có bao nhiêu `onClick`?
   - Có bao nhiêu `formAction` hay `onSubmit`?
   - Có event handler nào bị giấu bên dưới các thẻ DOM lồng nhau (nested divs) không?
3. **Ánh xạ Variants**: 
   - Thay vì vứt bỏ design cũ và viết cái mới, hãy bọc design cũ trong `motion.div` mới, hoặc copy chính xác logic event sang giao diện mới của Variant (ví dụ: Thay class "btn btn-primary" thành class Tailwind đẹp hơn nhưng VẪN giữ đúng `id="btnSubmit" onClick={handleSubmit}`).
4. **Kiểm tra State**: Dữ liệu có đang ràng buộc (bind) vào component không? Đảm bảo việc tái cấu trúc span/div không làm layout break state.
