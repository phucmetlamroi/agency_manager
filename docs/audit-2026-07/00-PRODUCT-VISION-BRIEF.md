# Product Vision Brief — HustlyTasker

> **Giai đoạn:** PHASE 0 — Căn chỉnh định hướng sản phẩm
> **Ngày lập:** 2026-07-28 · **Người lập:** Claude (điều phối) · **Trạng thái:** CHỜ CHỦ SẢN PHẨM DUYỆT
> **Mục đích:** Đây là bản chuẩn chung. Sau khi anh duyệt, bản này được giao cho Codex làm gốc.
> Codex **không** được tự suy đoán định hướng khi chưa nhận bản này.

---

## Cách đọc tài liệu này

Mỗi ý đều có nhãn cho biết **mức độ chắc chắn**:

| Nhãn | Nghĩa là gì |
|---|---|
| ✅ **ĐÃ XÁC NHẬN** | Chính anh đã nói ra trong các phiên làm việc, hoặc đây là hành vi tôi đã tự tay kiểm chứng. |
| 📄 **TỪ TÀI LIỆU** | Lấy từ tài liệu trong dự án. Tài liệu có thể đã cũ — **chưa** được kiểm chứng lại. |
| 🔍 **TÔI SUY LUẬN** | Tôi suy ra từ mã nguồn hoặc cấu trúc. Có cơ sở, nhưng chưa phải sự thật đã chứng minh. |
| ❓ **CẦN ANH TRẢ LỜI** | Chưa đủ thông tin. Nếu đoán sai, cả báo cáo sẽ lệch. |

---

## 1. Sản phẩm này là gì

📄 **TỪ TÀI LIỆU** (`TONG-QUAN-HE-THONG.md`, cập nhật 2026-05-30 — đã **2 tháng**, một số chỗ tôi đã phát hiện là sai so với hiện tại):

> HustlyTasker là nền tảng SaaS **quản lý công việc chuyên biệt cho agency dựng video**
> (video production / talking-head).

Điểm khác biệt so với Asana/Trello/Monday: sản phẩm được dựng quanh **đúng quy trình sản xuất video của agency**, không phải quy trình chung chung:

```
Nhận footage thô → phân loại → giao editor → revision → sửa frame
   → bàn giao khách → khách duyệt → tính tiền khách (USD) → trả lương nhân sự (VND)
```

⚠️ **Cảnh báo về tài liệu này:** tôi đã tìm thấy ít nhất một chỗ tài liệu mô tả **sai so với hiện tại** — mục §3.2 nói "Client gắn `workspaceId`, mỗi tháng phải tạo lại khách hàng", nhưng hệ thống sau đó đã được chuyển sang phạm vi tổ chức (profile). Vì vậy tôi **không** dùng tài liệu này làm bằng chứng về hiện trạng, chỉ dùng để hiểu **ý định ban đầu**.

---

## 2. Bài toán sản phẩm giải quyết

📄 **TỪ TÀI LIỆU** — bốn bài toán gốc:

| # | Bài toán | Sản phẩm giải quyết bằng |
|---|---|---|
| 1 | **Khối lượng task lớn, lặp lại hàng tháng.** Mỗi tháng agency tạo lại hàng trăm task cho cùng nhóm khách. | **Velox** — quét thư mục cloud (Dropbox/Drive) rồi tạo task hàng loạt. |
| 2 | **Hai dòng tiền song song.** Khách trả USD, nhân sự nhận lương VND. | Chốt tỷ giá tại thời điểm tạo task; tách bạch giá khách (`jobPriceUSD`) và chi phí nhân công (`wageVND`). |
| 3 | **Vòng đời task đặc thù ngành.** Các trạng thái như *Revision*, *Sửa frame*, *Gửi lại* không tồn tại trong tool generic. | Máy trạng thái task riêng. |
| 4 | **Minh bạch với khách.** | Cổng khách hàng để khách tự xem tiến độ, hóa đơn, đánh giá. |

✅ **ĐÃ XÁC NHẬN** (từ các phiên làm việc trước) — bài toán thứ **5** đã được thêm vào và là trọng tâm gần đây nhất:

| 5 | **Duyệt video với khách mà không phải rời hệ thống.** Trước đây agency dùng Frame.io. | **Module Tệp (Review)** — upload video, xem, bình luận theo mốc thời gian, vẽ chú thích, quản lý phiên bản, gửi link cho khách duyệt. |

---

## 3. Ai dùng sản phẩm

📄 **TỪ TÀI LIỆU** — bốn nhóm:

| Vai trò | Họ làm gì |
|---|---|
| **Chủ agency / Quản lý** | Tạo workspace theo tháng, định giá, giao task, duyệt lương, xem phân tích. |
| **Editor / Nhân sự** | Nhận task (được giao hoặc tự nhận ở Marketplace), cập nhật trạng thái, bàn giao. |
| **Khách hàng** | Vào cổng khách (quyền hạn chế) để theo dõi tiến độ, xem hóa đơn, duyệt video, đánh giá. |
| **Thủ quỹ** | Cờ quyền riêng, dùng để xác nhận đã trả lương. |

🔍 **TÔI SUY LUẬN** — cấu trúc tổ chức có **2 tầng**, và đây là điều quan trọng nhất cần hiểu về sản phẩm:

```
Profile  (= một agency / một tổ chức khách hàng của anh)
   └── Workspace  (= thường là MỘT THÁNG làm việc)
          └── Task, Client, Invoice, Payroll…
```

Nghĩa là: **workspace không phải là "dự án", mà là "tháng"**. Đây là điểm rất khác so với Notion/ClickUp, và tôi cho rằng nó sẽ là một trong những câu hỏi lớn nhất của đợt kiểm toán này — vì nó ảnh hưởng trực tiếp đến việc người dùng mới có hiểu được sản phẩm hay không.

---

## 4. Giá trị cốt lõi — điều sản phẩm phải giữ

🔍 **TÔI SUY LUẬN** từ toàn bộ mã nguồn và lịch sử làm việc:

1. **Tự động hóa việc tạo task lặp lại** (Velox) — đây là thứ khó sao chép nhất và là lý do sản phẩm tồn tại.
2. **Tách bạch tiền khách và tiền nhân sự** — hai loại tiền tệ, hai nhóm người được xem, không được rò rỉ.
3. **Đưa vòng duyệt video về trong nhà** — thay thế Frame.io.
4. **Khách nhìn thấy đúng thứ cần nhìn, không hơn** — cổng khách và link chia sẻ.

---

## 5. Điều sản phẩm KHÔNG nên trở thành

🔍 **TÔI SUY LUẬN** — dựa trên một quyết định đã có thật trong lịch sử dự án:

- **Không trở thành công cụ chat/cộng tác tổng quát.** Dự án **đã từng xây dựng một hệ thống chat đầy đủ** kiểu Discord (kênh, thread, cuộc gọi, wiki, vai trò...) rồi **gỡ bỏ toàn bộ**. Hiện trong hệ thống không còn mô hình tin nhắn nào. Đây là bằng chứng mạnh cho thấy định hướng là **chuyên sâu, không phình to**.
- **Không trở thành tool quản lý task chung chung.** Giá trị nằm ở chỗ chuyên biệt cho video.

❓ **CẦN ANH TRẢ LỜI:** đây là suy luận của tôi từ hành động trong quá khứ, chưa phải anh nói. Nếu sai, xin anh sửa.

---

## 6. Hướng thương mại — SaaS và MVP

✅ **ĐÃ XÁC NHẬN** (anh nêu trong yêu cầu lần này):
- Chuẩn bị sản phẩm để **thử nghiệm MVP**.
- Tiến tới **bán theo mô hình SaaS**, bắt đầu tạo doanh thu.

📄 **TỪ TÀI LIỆU** (`TONG-QUAN-HE-THONG.md` §11) — trạng thái thương mại hóa:
- Gói Pro dự kiến gồm **Velox Deep Scan** và **sao chép khách hàng giữa workspace**.
- **Hệ thống subscription/tier CHƯA được dựng.** Các điểm chặn (`requireProFeature`) đã được chừa sẵn trong mã, nhưng chưa bật.

🔍 **TÔI SUY LUẬN — và đây là mâu thuẫn tôi phải nêu ra:**

Trong các phiên trước có **hai hướng giá khác nhau** cùng tồn tại và tôi chưa thấy hướng nào được chốt:

| Hướng A | Hướng B |
|---|---|
| Bảng giá SaaS quốc tế: Free / $29 / $99 / $249, thu qua Paddle hoặc LemonSqueezy | Trang giới thiệu sản phẩm dùng **CTA "dùng thử miễn phí"** và **chỉ hiển thị giá VNĐ** |

Ngoài ra, phần tổng kết từ mentor có nêu một nút thắt chiến lược chưa gỡ: **sản phẩm định vị là "nền tảng" hay là "phần mềm SaaS bán theo tháng"**.

❗ **Đây là mâu thuẫn có thể làm lệch toàn bộ kết luận của đợt kiểm toán.** Ví dụ: nếu bán cho thị trường quốc tế, phần đa ngôn ngữ và onboarding tự phục vụ là chặn-doanh-thu; nếu bán cho agency Việt Nam qua tư vấn trực tiếp, hai thứ đó tụt xuống mức thấp.

### ✅ ĐÃ GIẢI QUYẾT — chủ sản phẩm chốt ngày 2026-07-28

> **"Việt Nam trước, quốc tế sau."**

**Hệ quả cho cách tôi xếp hạng ưu tiên trong toàn bộ báo cáo:**

| Hạng mục | Xếp loại | Vì sao |
|---|---|---|
| Onboarding tự phục vụ, đăng ký tự động | **POST_MVP_IMPORTANT** | Giai đoạn MVP anh tự demo và onboard từng khách. |
| Hệ thống gói / hạn mức / thanh toán tự động | **POST_MVP_IMPORTANT** | Thu tiền ngoài hệ thống trước. |
| Cô lập dữ liệu giữa các agency khách hàng | **MVP_REVENUE_BLOCKER** | Bán cho nhiều agency thì rò dữ liệu giữa họ là chấm hết, bất kể thị trường nào. |
| Độ mượt vận hành hằng ngày, dễ hiểu không cần đào tạo | **MVP_USABILITY_CRITICAL** | Đây là thứ quyết định khách có gia hạn hay không. |
| Tiếng Anh / đa ngôn ngữ giao diện nhân viên | **OPTIONAL_LATER** | Khách giai đoạn đầu là người Việt. |

⚠️ **Ràng buộc "quốc tế sau" mà tôi sẽ theo dõi riêng:** với mỗi đề xuất, nếu làm theo cách rẻ nhất bây giờ sẽ **phải đập đi làm lại** khi ra quốc tế, tôi sẽ đánh dấu rõ trong mục Vision Fit thay vì im lặng chọn phương án rẻ.

---

## 7. Module Tệp — hiểu cho đúng

✅ **ĐÃ XÁC NHẬN** (tôi vừa kiểm chứng trực tiếp trong mã nguồn hôm nay):

**"Tệp" là tên hiển thị của MỘT module riêng — module Review.** Nó **không** phải tên gọi chung cho mọi file trong ứng dụng.

Định nghĩa nằm đúng một chỗ, `src/lib/review/labels.ts:5`:
```ts
// Nhãn hiển thị của module review ("Team" → "Tệp").
export const REVIEW_MODULE_LABEL = 'Tệp'
```

**Nằm trong Tệp:** video bàn giao của task (kèm thư mục, thùng rác 30 ngày, tải hàng loạt, link chia sẻ cho khách).

**KHÔNG nằm trong Tệp:**

| Loại file | Thực tế |
|---|---|
| Ảnh đính kèm trong bình luận video | Lưu riêng, không hiện trong cây thư mục Tệp |
| Bình luận trong task | **Không có đính kèm** — mô hình dữ liệu không có trường file nào |
| Footage thô của task | Chỉ là **link Dropbox/Drive dán vào**, không phải file upload |
| Wiki | Bảng riêng biệt |
| Chat | **Không tồn tại** — đã bị gỡ khỏi hệ thống |

✅ **CHÍNH SÁCH TÊN GỌI (anh đã chốt):** không tự đổi tên module. Nếu tìm được bằng chứng mạnh rằng tên "Tệp" gây hiểu nhầm, tôi chỉ được **đề xuất** và chờ anh duyệt.

---

## 8. Phạm vi kiểm toán — ranh giới loại trừ

✅ **ĐÃ XÁC NHẬN** (anh nêu): kiểm toán **giao diện web mặc định**; **loại trừ Mission Control**.

✅ **ĐÃ XÁC NHẬN** (tôi vừa liệt kê trực tiếp từ cấu trúc route hôm nay) — hệ thống có **68 màn hình** và **105 điểm API**. Ranh giới:

| Thuộc **Mission Control** — LOẠI TRỪ | Thuộc **giao diện mặc định** — KIỂM TOÁN |
|---|---|
| 22 màn dưới `/[workspaceId]/mc/…` | 20 màn quản trị `/[workspaceId]/admin/…` |
| | 6 màn nhân sự `/[workspaceId]/dashboard/…` |
| | 6 màn module Tệp `/[workspaceId]/team/…` |
| | Chi tiết task `/[workspaceId]/task/[taskId]` |
| | Đăng nhập, đăng ký, chào mừng, trang giới thiệu |
| | Cổng khách `/share/[token]`, link duyệt video `/r/[slug]` |

⚠️ **Một rủi ro tôi phải nói trước:** thư mục làm việc hiện tại của tôi **tên là `mission-control`**. Đây chỉ là tên thư mục lịch sử, **không** có nghĩa mã nguồn ở đây là Mission Control — nó chứa toàn bộ hệ thống. Tôi đã ghi nhận điều này để không nhầm lẫn, và đã giao Codex xác minh độc lập ranh giới loại trừ này bằng bằng chứng route + import.

### ✅ ĐÃ GIẢI QUYẾT — chủ sản phẩm chốt ngày 2026-07-28

> **Kiểm cả cổng khách `/share/…` và link duyệt video `/r/…`.**

Phạm vi cuối cùng: **toàn bộ hệ thống trừ 22 màn Mission Control**.

### ⚠️ Ranh giới loại trừ KHÔNG sạch tuyệt đối — Codex phát hiện

Codex tìm ra một chỗ mã nguồn Mission Control **vẫn nằm trong giao diện mặc định**:
trang `/admin` nạp `DashboardActionWrapper`, và file này **import tĩnh `McAddTaskModal`**
(`src/components/dashboard/DashboardActionWrapper.tsx:6-9`).

Nhưng nó chỉ được **hiển thị** khi tham số `layout === 'mc'`, còn mặc định là `'wizard'` →
người dùng giao diện mặc định thấy `AddTaskModal` thường
(`src/components/dashboard/DashboardActionWrapper.tsx:100-112`, `:474-500`).

➡️ **Cách tôi xử lý:** loại trừ theo **thứ người dùng nhìn thấy**, không theo cấu trúc thư mục.
`McAddTaskModal` **không** bị kiểm vì người dùng giao diện mặc định không bao giờ thấy nó.
Ngược lại, module dùng chung như `TeamBrowser` (Tệp) **có** bị kiểm, dù Mission Control cũng gọi nó —
vì giao diện mặc định thật sự hiển thị nó.

**Đường vào Mission Control từ giao diện mặc định** (để tôi tránh đi nhầm khi kiểm thử):
menu thả xuống ở thanh bên desktop → mục **"Giao diện 2 · Mission Control"**, chỉ hiện với quản trị viên
(`src/components/layout/AppSidebar.tsx:128-136`).

---

## 9. Phiên bản nào là "hiện tại"

✅ **ĐÃ XÁC NHẬN** (tôi vừa kiểm tra kho mã hôm nay, 2026-07-28):

| Mốc | Trạng thái |
|---|---|
| Nhánh `origin/main` (nhánh chạy thật) | `200bb4b` — cập nhật **hôm nay**, gồm PR #226 |
| Nhánh tôi đang đứng | **hơn `main` đúng 2 commit**, kém 2 commit gộp |

**Hai commit chưa lên bản chạy thật:**
- `a3cb562` — chọn video đích khi upload đè + nút "Reset về tên Task"
- `dfe1e5b` — gộp nhiều video của một task thành một ô

➡️ **Kết luận:** bản chạy thật và mã nguồn tôi đang đọc **gần như trùng khớp**. Đây là tin tốt cho độ chính xác của đợt kiểm toán. Tôi sẽ ghi rõ 2 tính năng trên là **"chưa có trên bản chạy thật"** khi mô tả hiện trạng.

---

## 10. Quy trình hai tác nhân — báo cáo trung thực

✅ **ĐÃ XÁC MINH BẰNG THỰC NGHIỆM, KHÔNG PHẢI TUYÊN BỐ SUÔNG:**

| Hạng mục | Kết quả |
|---|---|
| Codex có thật không | **CÓ.** `codex-cli 0.146.0-alpha.3.1`, mô hình `gpt-5.6-sol` |
| Đã chạy thử chưa | **RỒI.** Đã gửi lệnh và nhận phản hồi đúng |
| Chế độ an toàn | Sandbox **chỉ-đọc**, không được sửa gì |
| Đã giao việc thật chưa | **RỒI.** Codex đang chạy nhánh khảo sát kỹ thuật độc lập |

⚠️ **Một trục trặc đã tìm ra và cần anh biết:** file cấu hình `.mcp.json` ở gốc dự án đang trỏ tới **đường dẫn Codex đã lỗi thời** (`5dee1057…` — thư mục này không còn tồn tại; bản thật là `69066b73…`). Vì vậy Codex **không** kết nối được theo đường MCP. Tôi đã đi vòng qua dòng lệnh và nó chạy tốt, nên **quy trình hai tác nhân là thật**. Nhưng nếu anh muốn sửa file đó cho lần sau thì cần khởi động lại phiên — tôi **chưa** đụng vào, vì đang trong giai đoạn cấm sửa cấu hình.

---

## 11. Những gì tôi CHƯA làm (và sẽ không làm khi chưa được duyệt)

- ❌ Chưa sửa bất kỳ dòng mã, giao diện, dữ liệu, quyền hay cấu hình nào của hệ thống.
- ❌ Chưa lập kế hoạch triển khai.
- ❌ Chưa kết luận gì về mức sẵn sàng SaaS (đang chờ anh gỡ mâu thuẫn ở mục 6).
- ❌ Chưa có môi trường thử nghiệm — xem tài liệu Environment Inventory.
