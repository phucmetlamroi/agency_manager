# Safety Protocol - STRICT NO-SQL ZONE

## Quy trình "Bất Biến" (Hạn chế rủi ro tối đa)
1. **NGHIÊM CẤM:**
   - Chỉnh sửa bất kỳ file nào có đuôi `schema.prisma`.
   - Các file thiết lập Database / ORM trong `src/lib/db/` hoặc `src/lib/prisma-workspace.ts`.
   - Thay đổi các hàm Server Actions kiểm tra `workspaceId` / `profileId`. Việc dò tìm ID, truyền ID hoặc fetch ID không được suy diễn viết lại.
   
2. **PHẠM VI CHO PHÉP:**
   - Các file có đuôi `.tsx` nằm trong `src/components/` hoặc `src/app/`.
   - Bổ sung Type định nghĩa Props cho Component (nếu cần đổi giao diện).
   - Điều chỉnh CSS/Tailwind Class.
   - Thêm thư viện giao diện như Frame Motion, Tremor, Lucide React, Canvas Confetti.
   
3. **SELF-REVIEW:**
   - Thiết kế UI mới phải KHÔNG làm vỡ Optimistic UI (ví dụ server request chưa xong nhưng UI đã vẽ xong block).
   - Đảm bảo giữ đúng `onClick`, `onSubmit`, `action`, `onChange` trên thẻ DOM tương tự.
