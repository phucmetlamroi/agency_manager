# Phase 3 — Kiểm toán hiện trạng toàn hệ thống

> **Ngày:** 2026-07-28 · **Môi trường:** nhánh thử nghiệm `audit-2026-07`, dữ liệu thật, ứng dụng chạy thật
> **Phạm vi:** giao diện web mặc định + cổng khách. Loại trừ 22 màn Mission Control.
> **Trạng thái:** ĐANG CHẠY — tài liệu này cập nhật dần

---

## Cách đọc

Mỗi phát hiện có 4 phần cố định: **Người dùng đang thấy gì · Vì sao đây là vấn đề · Bằng chứng · Hướng xử lý.**
Mức nghiêm trọng: `S0` chặn việc · `S1` ảnh hưởng lớn / cản bán hàng · `S2` gây khó hiểu hoặc dễ sai ·
`S3` vấn đề nhất quán · `S4` cần theo dõi.

---

## F-01 · `S1_CRITICAL` — Cập nhật thời gian thực bị chặn ở tầng bảo mật trình duyệt

**Người dùng đang thấy gì.** Thông báo mới, bình luận mới, trạng thái "ai đang online" **không tự hiện ra**.
Người dùng phải tải lại trang mới thấy. Không có báo lỗi nào — nó chỉ đơn giản là không xảy ra.

**Vì sao đây là vấn đề.** Hệ thống **có** dựng đầy đủ hạ tầng thời gian thực (Supabase Realtime) và mã nguồn
vẫn đang gọi nó cho thông báo, bình luận và hiển thị người đang online. Toàn bộ công sức đó **không đến được
người dùng**. Với một sản phẩm cộng tác, "phải F5 mới thấy đồng nghiệp vừa làm gì" là mất một trong những
điểm bán hàng cơ bản nhất.

**Bằng chứng.**
- Trình duyệt thật, môi trường thật, **mọi trang đã đăng nhập, cả 4 vai trò** đều in ra lỗi:
  `Connecting to 'wss://iklacptdmpsyrqmcogec.supabase.co/realtime/v1/websocket?...' violates the following
  Content Security Policy directive`
- Nguyên nhân nằm ở `next.config.ts:92` và `next.config.ts:93`. Chính sách bảo mật liệt kê các nơi trình duyệt
  được phép kết nối:
  ```
  connect-src 'self' *.vercel-storage.com wss://*.livekit.cloud https://*.livekit.cloud
              https://*.r2.cloudflarestorage.com https://*.mux.com
  ```
  **Không có `wss://*.supabase.co`.**
- Điểm khiến tôi chắc chắn đây là **sơ suất, không phải cố ý**: cùng dòng đó, `*.supabase.co` **CÓ** được liệt kê
  trong `img-src` (mục cho phép tải ảnh). Ai đó đã thêm Supabase vào danh sách ảnh nhưng **quên danh sách kết nối**.
- Áp dụng cho **cả hai** nhánh cấu hình (bản chạy thật và bản đóng gói máy tính) → **không phải chỉ lỗi trên máy tôi**.

**Hậu quả phụ tôi tình cờ đo được.** Khi quét tự động, tôi bảo trình duyệt "chờ tới lúc mạng yên tĩnh
rồi hãy đọc trang". **Mạng KHÔNG BAO GIỜ yên tĩnh** trên mọi trang đã đăng nhập — lần chờ nào cũng hết giờ.
Cách giải thích khớp nhất là kết nối thời gian thực bị chặn rồi **thử lại liên tục không dừng**.
Nếu đúng vậy thì mỗi tab đang mở của mỗi nhân viên đều đang chạy một vòng lặp kết nối vô tận — tốn pin
máy tính/điện thoại và tốn tài nguyên máy chủ Supabase mà không được gì.
⚠️ Tôi **chưa tách bạch chứng minh** đây là nguyên nhân duy nhất khiến mạng không yên tĩnh — ghi ở mức
**quan sát mạnh, chưa phải kết luận**.

**Hướng xử lý.** Thêm `wss://*.supabase.co https://*.supabase.co` vào `connect-src` ở cả hai nhánh.
⚠️ **Chưa sửa** — đúng quy định giai đoạn kiểm toán.
⚠️ **Cần kiểm lại sau khi sửa:** phải xác nhận thời gian thực *thực sự chạy*, vì có thể còn nguyên nhân thứ hai
nằm sau lớp CSP này mà hiện đang bị che khuất.

---

## F-02 · `S3_MINOR` — Ảnh đại diện của người đăng nhập bằng Google không hiện

**Người dùng đang thấy gì.** Ai đăng ký bằng nút "Tiếp tục với Google" thì ảnh đại diện **không tải được** —
chỗ đó thành ô trống hoặc ảnh vỡ, trên mọi trang.

**Vì sao đây là vấn đề.** Đây là lỗi nhỏ về mặt kỹ thuật nhưng nằm ở chỗ ai cũng nhìn thấy, mọi lúc. Với sản phẩm
sắp đem đi bán, một avatar vỡ ở góc màn hình làm sản phẩm trông chưa hoàn thiện.

**Bằng chứng.**
- Lỗi trình duyệt lặp lại trên mọi trang, mọi vai trò:
  `Loading the image 'https://lh3.googleusercontent.com/a/...' violates the following Content Security Policy
  directive: "img-src ..."`
- `next.config.ts:92-93` — `img-src` không có `lh3.googleusercontent.com`.
- Hệ thống **có** đăng nhập bằng Google (`/api/auth/google/authorize`, đã thấy nút trên trang đăng nhập), nên
  đường dẫn ảnh này chắc chắn phát sinh trong thực tế.

**Hướng xử lý.** Thêm `https://lh3.googleusercontent.com` vào `img-src`. Cùng một dòng cấu hình với F-01 →
nên sửa chung một lần.

---

## F-03 · `S1_CRITICAL` — Mỗi lần cài đặt dự án là một lần ghi vào cơ sở dữ liệu thật

Đã mô tả đầy đủ ở [01-ENVIRONMENT-INVENTORY.md §A1](01-ENVIRONMENT-INVENTORY.md). Tóm tắt:
`package.json` chạy `prisma db push` tự động sau mỗi lần cài đặt, đọc địa chỉ từ `.env` = **database thật**.
Đã từng gây sập cổng khách ~15 phút (`IMPLEMENTATION-NOTES.md:29`).

**Bằng chứng bổ sung thu được hôm nay:** chính tôi suýt dính. Máy chủ chạy thử lần đầu **đã chạy trên database
thật** vì file cấu hình môi trường của tôi không được nạp — xem [§H2](01-ENVIRONMENT-INVENTORY.md). Không có
thiệt hại (chỉ có thao tác đọc), nhưng nó chứng minh rủi ro là **thật và dễ vấp**, không phải lý thuyết.

---

## F-04 · `S3_MINOR` — Giao diện dựng lại không khớp giữa máy chủ và trình duyệt

**Người dùng đang thấy gì.** Có thể thoáng thấy nội dung "nhảy" hoặc đổi khi trang vừa tải xong.

**Vì sao đây là vấn đề.** Đây là loại lỗi tự nó thường vô hại nhưng là **dấu hiệu** của thứ nguy hiểm hơn:
máy chủ và trình duyệt đang tính ra hai kết quả khác nhau. Nếu chỗ lệch đó rơi vào phần hiển thị quyền hoặc
số tiền thì hậu quả nghiêm trọng.

**Bằng chứng.** Cảnh báo lặp lại trên nhiều trang, nhiều vai trò:
`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.`

**Hướng xử lý.** Cần khoanh vùng đúng component gây lệch — **chưa làm**, sẽ đưa vào phần đào sâu.
Nghi ngờ đầu tiên: lớp vỏ giao diện chọn theo thiết bị (`view-mode` / nhận diện thiết bị) vì đó chính là
kiểu "máy chủ đoán một đằng, trình duyệt biết một nẻo".

---

## F-06 · `S2_MAJOR` — Danh sách hiển thị có phần tử trùng khoá

**Người dùng đang thấy gì.** Một dòng trong danh sách có thể **bị nhân đôi hoặc biến mất** khi dữ liệu
thay đổi — ví dụ đổi trạng thái một task rồi thấy nó xuất hiện hai lần, hoặc một task khác tự dưng mất.

**Vì sao đây là vấn đề.** Khác với F-04, đây không chỉ là cảnh báo suông — chính thư viện giao diện nói
rõ hậu quả: *"Non-unique keys may cause children to be duplicated and/or omitted"*. Trong một sản phẩm
quản lý task, một task hiển thị sai hoặc mất khỏi danh sách là lỗi người dùng **tin nhầm và làm sai theo**.

**Bằng chứng.** Nhật ký trình duyệt, vai trò quản trị:
`Encountered two children with the same key. Keys should be unique so that components maintain their
identity across updates. Non-unique keys may cause children to be duplicated and/or omitted`

**Hướng xử lý.** Cần khoanh vùng đúng danh sách đang bị trùng khoá — **chưa làm**. Ưu tiên cao hơn F-04
vì hậu quả là hiển thị sai dữ liệu, không chỉ nhấp nháy giao diện.

---

## F-05 · `S4_OBSERVATION` — Nợ kỹ thuật: quy ước `middleware` đã bị khai tử

**Bằng chứng.** Nhật ký khởi động máy chủ:
`The "middleware" file convention is deprecated. Please use "proxy" instead.`

Hệ thống đang dùng `src/middleware.ts` cho **cổng xác thực** và cho công tắc chọn giao diện điện thoại/máy tính.
Chưa hỏng, nhưng đây là thành phần chặn-quyền quan trọng đang chạy trên một quy ước đã bị Next.js loại bỏ.

---

## F-07 · `S2_MAJOR` — 9 trong 15 mục menu là ngõ cụt với nhân sự

**Người dùng đang thấy gì.** Một editor đăng nhập vào, thanh bên trái hiện **15 mục**: Tổng quan, Hàng chờ
task, Hộp thư yêu cầu, Tệp, Lịch, Lỗi của tôi, Hồ sơ, **Bảng lương, Tài chính, Thành viên, Thùng rác tổ chức,
Phân tích, Nhật ký hoạt động, Cài đặt**, Trợ giúp.

Bấm vào Bảng lương → bị ném về Tổng quan. Bấm Tài chính → ném về. Thành viên → ném về. Phân tích, Nhật ký,
Cài đặt, Hàng chờ task, Hộp thư yêu cầu, Thùng rác tổ chức → **tất cả đều ném về**, không một lời giải thích.

**9 trong 15 mục — 60% thanh điều hướng — là ngõ cụt.**

**Vì sao đây là vấn đề.** Đây là mục "quyền giao diện không khớp quyền hệ thống" trong danh sách kiểm tra.
Người dùng mới sẽ bấm hết một lượt, bị ném về 9 lần, và kết luận rằng **phần mềm bị lỗi**. Với sản phẩm
sắp bán, ấn tượng "bấm gì cũng văng" trong 5 phút đầu là thứ khó gỡ nhất.

Nó cũng làm hỏng một thứ tinh tế hơn: người dùng không còn tin thanh điều hướng nữa, nên sẽ **không bấm thử**
những mục họ THẬT SỰ có quyền dùng.

**Bằng chứng.**
- Ma trận truy cập bên dưới: 16 màn quản trị đều `đá về` với vai trò nhân sự, đo trên trình duyệt thật.
- Ảnh chụp thanh bên của nhân sự: đủ 15 mục, không mục nào bị mờ, khoá hay ẩn.
- **Đây là chủ đích, không phải lỗi lập trình** — chú thích ngay trong mã (`AppSidebar.tsx:79-81`) nói rõ:
  > *"Unified nav: USER view shows ALL items same as ADMIN view. Page-level guards handle permission gating —
  > non-admin click → admin layout redirects back to /dashboard automatically."*

**Hướng xử lý.** Đây là **quyết định thiết kế cần anh chọn lại**, không phải lỗi để vá. Ba hướng, sẽ trình bày
đầy đủ kèm ưu/nhược trong đặc tả TO_BE:
1. Ẩn hẳn mục không có quyền (gọn nhất, nhưng người dùng không biết tính năng đó tồn tại).
2. Hiện nhưng làm mờ + khoá + tooltip "cần quyền quản trị" (giữ tính khám phá, không gây bực).
3. Cho bấm nhưng hiện trang giải thích "bạn không có quyền, liên hệ ai" thay vì ném về im lặng.

---

## F-08 · `S3_MINOR` — Mọi trang đều có cùng một tên trên thẻ trình duyệt

**Người dùng đang thấy gì.** Mở 5 tab HustlyTasker thì cả 5 thẻ đều ghi **"HustlyTasker"** — không phân biệt
được tab nào là Bảng lương, tab nào là Tệp.

**Bằng chứng.** Đo trên **cả 65 màn vào được**: tiêu đề trang luôn là `"HustlyTasker"`.

**Vì sao đây là vấn đề.** Người làm agency mở nhiều tab cùng lúc là chuyện thường ngày. Ngoài ra tên thẻ còn là
thứ trình đọc màn hình đọc đầu tiên, và là tên khi lưu dấu trang.

---

## F-09 · `S3_MINOR` — 26 trên 65 màn không có tiêu đề chính

**Người dùng đang thấy gì.** Vào Bảng lương, Tài chính, Cài đặt, Thành viên, Hồ sơ, Lịch, Nhật ký hoạt động,
Task đã huỷ, Thùng rác… và **không có dòng tiêu đề lớn nào cho biết đang ở đâu**.

**Bằng chứng.** Đo tự động: **26/65 màn vào được không có thẻ tiêu đề chính (h1)**.
Danh sách: Bảng lương, Hồ sơ cá nhân, Thành viên workspace, Thành viên tổ chức, Tài chính, Cài đặt,
Thùng rác khách hàng, Lịch & khả dụng, Nhật ký hoạt động, Thùng rác tổ chức, Task đã huỷ, Menu quản trị.

⚠️ **Lưu ý trung thực:** một số màn *có* chữ tiêu đề nhưng viết bằng thẻ khác (ví dụ `h2`), nên vẫn nhìn thấy
được bằng mắt. Vấn đề khi đó là ở **cấu trúc**, ảnh hưởng trình đọc màn hình chứ không phải người nhìn.
Tôi sẽ tách riêng "không có chữ nào" và "có chữ nhưng sai cấp thẻ" ở phần đào sâu.

---

## F-10 · `S4_OBSERVATION` — Chú thích trong mã mô tả sai quyền thực tế

Hai chỗ chú thích nói một đằng, hệ thống chạy một nẻo:

| Chú thích trong mã | Hành vi thật (đo được) |
|---|---|
| `Tệp` — *"Admin-only in P2 — the /admin layout guard gates entry"* (`AppSidebar.tsx:88-90`) | **Nhân sự VÀO ĐƯỢC** cả 3 màn Tệp |
| `Thùng rác tổ chức` — *"Owner only (page-level guard)"* (`AppSidebar.tsx:101`) | Trang chỉ có `if (!session) redirect('/login')` — **không có chốt Owner nào** (`profile-trash/page.tsx:13`) |

**Về mục thứ hai:** dữ liệu có thể vẫn an toàn vì hàm lấy dữ liệu tự giới hạn theo "tổ chức mà người dùng sở hữu".
Tôi **chưa xác minh** hàm đó, nên **không kết luận đây là lỗ hổng**. Ghi ở mức: *chú thích sai, cần kiểm chứng
hàm `getMyTrashedProfiles` trước khi nói an toàn hay không.*

Chú thích sai nguy hiểm ở chỗ: người sửa mã sau này tin vào chú thích và bỏ qua việc kiểm tra thật.

---

## Đo pixel & responsive — 1 039 phép đo trên 57 mốc bố cục

**Cách đo.** Mọi con số lấy từ `getBoundingClientRect` + `getComputedStyle` của trình duyệt thật.
**Không ước lượng bằng mắt chỗ nào.** Breakpoint lấy từ hệ thống chứ không tự đặt: `tailwind.config`
chỉ ghi đè `screens` bên trong `container`, nên toàn hệ dùng mặc định Tailwind — **640 / 768 / 1024 /
1280 / 1536**. Mỗi mốc đo tại đúng ngưỡng, nhỏ hơn 1px và lớn hơn 1px.

### 🔑 Điều quan trọng nhất về responsive của sản phẩm này

**Ứng dụng KHÔNG dùng breakpoint CSS để chọn giao diện điện thoại hay máy tính.** Nó nhận diện thiết bị
**ở phía máy chủ** qua user-agent, cộng với cookie `view-mode` (`src/middleware.ts:26-35`). Trong mã ghi rõ
quyết định: ***"tablet + undefined ⇒ desktop"*** — máy tính bảng **cố ý** nhận giao diện máy tính, vì iPadOS
13+ tự khai là máy tính.

**Hệ quả thực tế:** kéo hẹp cửa sổ trình duyệt **không** đổi được lớp vỏ giao diện. Ai kiểm thử responsive
bằng cách kéo cửa sổ sẽ **không bao giờ thấy** giao diện điện thoại thật. Đây là điều mọi người kiểm thử
sản phẩm này cần biết trước.

---

## F-11 · `S3_MINOR` — 61 nút/ô nhập nhỏ hơn ngưỡng tối thiểu

| Thiết bị | Tổng đo | Dưới 24px (chuẩn WCAG 2.2 AA) | Dưới 44px (khuyến nghị cảm ứng) |
|---|---:|---|---|
| Máy tính | 993 | **61 (6%)** | 889 (90%) |
| Điện thoại | 30 | **0 (0%)** | 24 (80%) |

**Đọc bảng này cho đúng:** con số 90% "dưới 44px" trên máy tính **không phải lỗi** — 44px là khuyến nghị
cho ngón tay, còn máy tính dùng chuột nên chuẩn áp dụng là 24px. Tương tự, điện thoại **đạt chuẩn tối thiểu
24px tuyệt đối**, chỉ là chưa thoải mái theo khuyến nghị cảm ứng.

**Chỗ thật sự cần sửa — 61 thành phần dưới 24px trên máy tính**, nhỏ nhất là:

| Kích thước | Thành phần | Ở đâu |
|---|---|---|
| **20px** | nút **"Thu gọn"** | Tệp — trình duyệt |
| **20px** | nút **"Mở rộng"** | Tệp — trình duyệt |
| **21px** | ô nhập **"Tìm task…"** | Bảng điều khiển |

⚠️ Hai nút 20px nằm **ngay trong module Tệp** — hạng mục anh chọn ưu tiên cải thiện đầu tiên.

---

## F-12 · `S3_MINOR` — 16% nhãn chưa đạt tương phản, tất cả đều sát ngưỡng

**128 trên 803** thành phần đo được không đạt chuẩn WCAG AA. Điều đáng mừng: **không có trường hợp nào
nghiêm trọng** — chỗ tệ nhất là **4,12:1 trong khi cần 4,5:1**, tức là thiếu rất ít.

| Đo được | Cần | Cỡ chữ | Nhãn | Màn |
|---|---|---|---|---|
| 4,12:1 | 4,5:1 | 12px đậm | "Dự kiến (25)" và các biến thể | Bảng lương |
| 4,23:1 | 4,5:1 | 14px đậm | "Được giao 0" | Bảng điều khiển |
| 4,23:1 | 4,5:1 | 14px đậm | "Hiển thị" | Bảng điều khiển |

Đặc điểm chung: đều là **nhãn phụ màu xám nhạt trên nền tối**. Sửa bằng cách nâng độ sáng màu xám lên một
bậc là xong cả nhóm — không phải sửa từng chỗ.

> **📌 Ghi chú phương pháp — bắt buộc đọc.** Bản đo **đầu tiên** của tôi báo **41% không đạt**, có chỗ
> "1,04:1". Con số đó **SAI và đã bị hủy**. Nguyên nhân: tôi đếm nền trong suốt như nền đặc. Nhãn
> "Hoàn tất (12)" có nền tím **15% độ đục**; tính như tím đặc ra 1,53:1, còn thực tế là tím 15% chồng lên
> nền đen và đạt khoảng **6,4:1 — thừa chuẩn**. Sau khi sửa phép hợp màu, con số thật là **16%**.
> Tôi giữ lại ghi chú này để anh biết mức độ tin cậy của từng con số trong báo cáo.

---

## ✅ Hai kết quả tốt, đo được, không cần sửa

**Không màn nào tràn ngang.** 57/57 mốc — từ 639px tới 1537px và cả ba kích thước điện thoại — nội dung
luôn vừa khung, người dùng không phải cuộn ngang lần nào.

**Kích thước nút nhất quán tuyệt đối.** **0** trường hợp cùng một nhãn nút mà cao thấp khác nhau giữa các
màn. Hệ thống thiết kế đang được tuân thủ nghiêm túc — đây là nền móng tốt cho mọi cải thiện sau này.

---

## F-13 · `S2_MAJOR` (cần xác nhận) — Giao diện điện thoại lộ ra rất ít hành động

| Màn | Máy tính | Điện thoại |
|---|---|---|
| Bảng điều khiển | **18 nút / 15 mục menu** | **2 nút / 5 mục menu** |
| Tệp — trình duyệt | 12 mục menu | 5 mục menu |

Đây **không phải** CSS thu nhỏ — đây là **hai lớp vỏ giao diện hoàn toàn khác nhau**, chọn ở phía máy chủ.

❓ **CẦN ANH XÁC NHẬN:** đây có đúng chủ đích không, và trong 16 hành động bị lược bỏ trên điện thoại có
thứ nào nhân sự **cần dùng khi đang đi ngoài** không? Tôi **chưa xếp đây là lỗi** — cần biết ý định trước.

> **📌 Giới hạn phương pháp — phần chưa đo được đáng tin.** Việc đếm nút theo từng chiều rộng **không ổn định**
> trên các màn nhiều dữ liệu (Tệp, Bảng lương): cùng một trang lúc trả 6 nút lúc trả 29. Nguyên nhân là điều
> kiện chờ của tôi quá dễ thỏa mãn nên đo trúng lúc trang chưa tải xong. **Tôi KHÔNG báo cáo bất kỳ kết luận
> "nút biến mất theo chiều rộng" nào** từ dữ liệu đó. Riêng Bảng điều khiển ổn định 18 nút ở cả 16 mốc, và
> lượt kiểm chứng riêng cho Bảng lương cho **29 nút ổn định ở mọi mốc** — nên phần này ghi là
> **chưa đủ tin cậy, cần đo lại có điều kiện chờ riêng cho từng màn.**

---

## F-14 · `S2_MAJOR` — Gõ nhầm địa chỉ là rơi vào trang trắng tiếng Anh, không lối ra

**Người dùng đang thấy gì.** Mở một link cũ đã hỏng, hoặc gõ nhầm địa chỉ, thì màn hình chỉ còn đúng
một dòng:

> **404 · This page could not be found.**

Không logo, không thanh điều hướng, **không một nút nào để quay lại**, và **bằng tiếng Anh** trong một
sản phẩm tiếng Việt. Người dùng buộc phải tự bấm nút Back của trình duyệt hoặc gõ lại địa chỉ từ đầu.

**Vì sao đây là vấn đề.** Link cũ hỏng là chuyện xảy ra thường xuyên: khách bookmark một task, nhân sự
gửi link cho nhau rồi task bị xoá, hoặc chỉ đơn giản là copy thiếu ký tự. Đây cũng là **màn hình mà khách
hàng của anh có thể nhìn thấy**. Một trang 404 trống trơn tiếng Anh làm sản phẩm trông như chưa hoàn thiện.

**Bằng chứng.** Thử 4 địa chỉ hỏng, đo trên trình duyệt thật:

| Địa chỉ thử | HTTP | Màn hình hiện | Có lối thoát? |
|---|---|---|---|
| Task không có thật | 404 | *"404 This page could not be found."* | ❌ Không |
| Workspace không có thật | 404 | *"404 This page could not be found."* | ❌ Không |
| Trang hoàn toàn không tồn tại | 404 | *"404 This page could not be found."* | ❌ Không |
| **Thư mục Tệp không có thật** | **200** | **Giao diện Tệp đầy đủ, có điều hướng** | ✅ **Có** |

➡️ Dòng cuối cho thấy **module Tệp đã xử lý đúng** — nó vẫn giữ người dùng trong ứng dụng. Ba trường hợp
còn lại rơi ra ngoài. Nghĩa là cách làm đúng đã có sẵn trong sản phẩm, chỉ chưa áp dụng chung.

**Hướng xử lý.** Thêm một trang 404 riêng của ứng dụng: tiếng Việt, có logo, có nút *"Về trang chủ"* và
*"Quay lại"*. **Chưa làm.**

---

## F-15 · `S2_MAJOR` — Mất mạng giữa chừng: hệ thống im lặng hoàn toàn

**Người dùng đang thấy gì.** Đang làm việc thì mạng rớt. Bấm nút — **không có gì xảy ra**. Không quay
vòng chờ, không thông báo, không báo lỗi. Màn hình đứng yên như thể cú bấm chưa từng tồn tại.

**Vì sao đây là vấn đề.** Người dùng sẽ **bấm lại nhiều lần**, tưởng mình bấm hụt. Với thao tác đổi trạng
thái task hoặc bàn giao video, việc bấm lại nhiều lần khi mạng chập chờn là nguồn gốc của dữ liệu sai.
Nguy hiểm hơn: người dùng tin rằng thao tác **đã thành công** trong khi nó chưa bao giờ tới máy chủ.

**Bằng chứng.** Quy trình đo (đã sửa sau một lần đo sai — xem ghi chú dưới):
1. Mở trang Tệp, **chờ tải xong hẳn** — nội dung ổn định ở 906 ký tự
2. Ngắt mạng
3. Bấm một nút cần gọi máy chủ · rồi thử chuyển trang
4. Chuyển trang **thất bại** (đúng như mong đợi khi mất mạng)
5. Đọc lại toàn bộ chữ trên màn hình → **không một ký tự nào mới xuất hiện**

> **📌 Ghi chú — tôi đã đo sai lần đầu.** Lần đo đầu tôi kết luận *"hệ thống CÓ báo mất mạng"*. **Sai.**
> Tôi ngắt mạng khi trang **còn đang tải**, nên phần danh sách thư mục tải xong sau đó (`THƯ MỤC 15 mục
> 170 MB…`) bị tôi hiểu nhầm là thông báo lỗi. Đo lại đúng cách thì kết quả ngược lại hoàn toàn.

---

## F-16 · `S3_MINOR` — Tìm không ra kết quả lại báo "chưa có task nào"

**Người dùng đang thấy gì.** Gõ một từ khoá không khớp gì cả, hệ thống trả lời:

> *"Chưa có task nào ở đây."*

Nhưng task **vẫn còn nguyên** — chỉ là không khớp từ khoá. Câu này khiến người dùng tưởng **task của mình
đã biến mất**, chứ không hiểu là do bộ lọc.

**Vì sao đây là vấn đề.** Đây là một trong những lỗi trải nghiệm cổ điển nhất: không phân biệt *"chưa có gì"*
với *"có nhưng bộ lọc đang giấu đi"*. Người dùng hoảng, và không nghĩ tới việc xoá từ khoá đi.

**Bằng chứng.** Câu chữ đó nằm ở **đúng một chỗ duy nhất** trong toàn bộ mã nguồn
(`src/components/dashboard/UserWorkflowTabs.tsx:392`), và **không có nhánh xử lý riêng** nào cho trường
hợp đang tìm kiếm. Nghĩa là câu trả lời luôn giống hệt nhau bất kể lý do danh sách rỗng.

**Hướng xử lý.** Tách hai câu, và câu thứ hai phải có lối thoát:
*"Không tìm thấy task nào khớp «…» — [Xoá bộ lọc]"*. **Chưa làm.**

---

## ✅ Bàn phím — kết quả tốt bất ngờ

Đây là phần tôi dự đoán sẽ yếu nhất, nhưng đo ra lại tốt:

| Kiểm tra | Kết quả |
|---|---|
| Số thành phần chạm được bằng phím Tab | **32 / 35** thành phần bấm được trên trang |
| Số điểm dừng **không có** viền focus | **0 / 45** — mọi điểm dừng đều nhìn thấy rõ |
| Có bị kẹt vòng lặp focus không | **Không** |
| Thứ tự Tab | Đi đúng theo thứ tự nhìn thấy: nút thu gọn → Tổng quan → Hàng chờ task → Hộp thư → Tệp → Lịch → … |

Người dùng chỉ dùng bàn phím **đi được gần như toàn bộ** giao diện và **luôn nhìn thấy mình đang ở đâu**.
Đây là nền tảng tốt, hiếm gặp ở sản phẩm chưa từng làm kiểm toán accessibility.

⚠️ **3 thành phần chưa chạm tới** trong 45 lần Tab — chưa rõ là do hết lượt Tab hay thật sự không tới được.
Ghi là **cần kiểm riêng**, chưa kết luận.

---

## Ma trận truy cập — 26 màn × 5 vai trò

Đo trên trình duyệt thật, dữ liệu thật, môi trường thật. **Không suy đoán.**

| Nhóm màn | Chủ tổ chức | Quản trị | Nhân sự | Khách WS | Chưa đăng nhập |
|---|---|---|---|---|---|
| 6 màn cá nhân (Tổng quan, Task, Lương, Lịch, Hồ sơ, Lỗi) | ✅ vào | ✅ vào | ✅ vào | ✅ vào | → đăng nhập |
| 16 màn quản trị | ✅ vào | ✅ vào | ⛔ đá về | ⛔ đá về | → đăng nhập |
| 3 màn Tệp (duyệt, link chia sẻ, thùng rác) | ✅ vào | ✅ vào | ✅ **vào** | ⛔ đá về | → đăng nhập |
| Gốc workspace | → chuyển hướng | → chuyển hướng | → chuyển hướng | → chuyển hướng | → đăng nhập |

### ✅ Điều làm tốt — nói rõ vì nó đáng ghi nhận

**Chưa đăng nhập: 26/26 màn đều bị đẩy về trang đăng nhập.** Không một màn nào rò rỉ, kể cả khi gõ thẳng
địa chỉ. Đây là phần **đóng chặt đúng chuẩn**, không có gì phải sửa.

**Phân tầng quản trị hoạt động đúng.** Nhân sự và khách không vào được bất kỳ màn quản trị nào.

### ⚠️ Cần chủ sản phẩm quyết định

**Đá về mà không nói lý do.** Xem F-07. Về bảo mật là đúng; về trải nghiệm là người dùng không hiểu chuyện gì.

**Khách trong workspace bị chặn hoàn toàn khỏi Tệp.** Nếu "khách" ở đây là cộng tác viên ngoài cần xem video
bàn giao thì chặn sạch có thể là quá tay. Hiện ghi **UNKNOWN — chờ anh xác nhận ý định**, không phải lỗi.
