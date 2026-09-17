# Báo cáo kiểm toán & định hướng tối ưu — HustlyTasker

> **Ngày:** 2026-07-28 · **Người thực hiện:** Claude (điều phối) + Codex (nhánh kỹ thuật độc lập)
> **Trạng thái:** ⏸️ **CHỜ CHỦ SẢN PHẨM DUYỆT** — chưa sửa một dòng mã nào
> **Viết cho người không biết lập trình.** Thuật ngữ kỹ thuật đều được giải thích ngay tại chỗ.

---

## Mục lục

1. [Tóm tắt một trang](#1-tóm-tắt-một-trang)
2. [Sản phẩm hiện đang hoạt động thế nào](#2-sản-phẩm-hiện-đang-hoạt-động-thế-nào)
3. [Bản đồ hệ thống](#3-bản-đồ-hệ-thống)
4. [Ai thấy gì — bản đồ quyền](#4-ai-thấy-gì--bản-đồ-quyền)
5. [Bốn vấn đề nghiêm trọng](#5-bốn-vấn-đề-nghiêm-trọng)
6. [Sáu vấn đề đáng kể](#6-sáu-vấn-đề-đáng-kể)
7. [Những gì sản phẩm đang làm TỐT](#7-những-gì-sản-phẩm-đang-làm-tốt)
8. [Khác biệt máy tính / máy tính bảng / điện thoại](#8-khác-biệt-máy-tính--máy-tính-bảng--điện-thoại)
9. [Học gì và KHÔNG học gì từ Notion, ClickUp, Frame.io](#9-học-gì-và-không-học-gì)
10. [Mức sẵn sàng bán hàng](#10-mức-sẵn-sàng-bán-hàng)
11. [Claude và Codex bất đồng ở đâu](#11-claude-và-codex-bất-đồng-ở-đâu)
12. [Những gì tôi CHƯA kiểm chứng được](#12-những-gì-tôi-chưa-kiểm-chứng-được)
13. [Sáu quyết định cần anh đưa ra](#13-sáu-quyết-định-cần-anh-đưa-ra)

**Mức độ nghiêm trọng:** 🔴 `S1` ảnh hưởng lớn / cản bán hàng · 🟠 `S2` gây khó hiểu hoặc dễ sai ·
🟡 `S3` vấn đề chất lượng · ⚪ `S4` cần theo dõi

---

## 1. Tóm tắt một trang

Tôi đã kiểm toán **toàn bộ giao diện web mặc định** của HustlyTasker trên **dữ liệu thật** (1 263 task,
132 video, 292 khách hàng), trong **môi trường cô lập** không chạm production, với **4 vai trò người dùng**
và **1 039 phép đo pixel**.

### Kết luận ngắn gọn

**Nền móng của sản phẩm tốt hơn tôi dự đoán.** Phần bảo mật cơ bản đóng chặt: 26/26 màn đều chặn người
chưa đăng nhập. Bố cục không vỡ ở bất kỳ kích thước nào trong 57 mốc đo. Kích thước nút nhất quán tuyệt đối.
Điều hướng bằng bàn phím đi được 32/35 thành phần và **luôn nhìn thấy vị trí** — hiếm gặp ở sản phẩm
chưa từng kiểm toán trợ năng.

**Vấn đề tập trung ở bốn chỗ**, và không chỗ nào là "thiết kế xấu":

1. **Một dòng cấu hình bảo mật thiếu** làm chết toàn bộ tính năng cập nhật thời gian thực đã dựng xong
2. **Mỗi lần cài đặt dự án là một lần ghi vào database thật** — đã từng gây sập dịch vụ 15 phút
3. **Link chia sẻ vẫn lộ nội dung agency tưởng đã gỡ** cho khách hàng
4. **Hệ thống im lặng khi thất bại** — mất mạng, không có quyền, tìm không ra: đều không nói gì

### Con số

| | |
|---|---|
| Tổng phát hiện | **31** |
| 🔴 Nghiêm trọng | **4** |
| 🟠 Đáng kể | **6** |
| 🟡 + ⚪ Còn lại | **21** |
| Điều làm tốt được ghi nhận | **6** |
| **Phát hiện tôi TỰ BÁC BỎ trước khi báo** | **4** |

Bốn phát hiện bị bác bỏ đều là **lỗi công cụ đo của tôi**, không phải lỗi sản phẩm. Nếu báo hết, anh đã
nhận một danh sách gần một nửa là bịa.

---

## 2. Sản phẩm hiện đang hoạt động thế nào

**HustlyTasker là phần mềm quản lý công việc chuyên biệt cho agency dựng video.** Nó không phải công cụ
quản lý task chung chung — nó được dựng quanh đúng quy trình sản xuất video:

```
Nhận footage thô → Velox quét cloud tạo task hàng loạt → giao editor
   → dựng → bàn giao video lên Tệp → gửi link cho khách duyệt
   → khách duyệt hoặc yêu cầu sửa → hoàn tất → tính tiền khách (USD) + trả lương (VNĐ)
```

### Điều quan trọng nhất cần hiểu về cấu trúc

```
Tổ chức (Profile) = một agency
     └── Workspace = MỘT THÁNG làm việc
              └── Task, Khách hàng, Hoá đơn, Bảng lương
```

**Workspace không phải "dự án" — nó là "tháng".** Đây là điểm khác biệt lớn nhất so với Notion/ClickUp
và tôi cho rằng nó sẽ là câu hỏi lớn nhất khi người mới tiếp cận sản phẩm.

---

## 3. Bản đồ hệ thống

**68 màn hình · 105 điểm API.** Trong phạm vi kiểm toán: **46 màn** (loại trừ 22 màn Mission Control).

| Nhóm | Số màn | Ai dùng |
|---|---:|---|
| **Quản trị** | 20 | Chủ agency, quản lý |
| **Nhân sự** | 6 | Editor |
| **Tệp (Review)** | 6 | Cả hai — nhưng theo phạm vi task được giao |
| **Khách hàng** | 4 | Khách, qua link không cần đăng nhập |
| Đăng nhập / chào mừng / giới thiệu | 10 | Người mới |

---

## 4. Ai thấy gì — bản đồ quyền

Hệ thống có **ba tầng vai trò khác tên nhau**, và một người mang cả ba cùng lúc:

| Tầng | Các giá trị |
|---|---|
| Tài khoản | `ADMIN` · `USER` · `AGENCY_ADMIN` · `CLIENT` · `LOCKED` |
| Tổ chức | `OWNER` · `ADMIN` · `USER` · `CLIENT` |
| Workspace (tháng) | `OWNER` · `ADMIN` · `MEMBER` · `GUEST` |

⚠️ Một người có thể là `USER` ở tầng tài khoản nhưng `ADMIN` ở tầng tổ chức. **Ba cái tên khác nhau cho
cùng một người** — đây là nguồn nhầm lẫn tiềm tàng khi bán cho khách và phải giải thích.

### Kết quả đo thật — 26 màn × 5 vai trò

| Nhóm màn | Chủ tổ chức | Quản trị | Nhân sự | Khách WS | Chưa đăng nhập |
|---|---|---|---|---|---|
| 6 màn cá nhân | ✅ | ✅ | ✅ | ✅ | → đăng nhập |
| 16 màn quản trị | ✅ | ✅ | ⛔ | ⛔ | → đăng nhập |
| 3 màn Tệp | ✅ | ✅ | ✅ | ⛔ | → đăng nhập |

### Điểm đặc biệt: Tệp không phân quyền theo vai trò

Module Tệp dùng **phạm vi theo task được giao**: nhân sự chỉ thấy thư mục của task có tên mình.
Không phải theo chức danh. Đây là thiết kế **đúng và chặt** — nhưng cách báo cho người dùng thì sai
(xem vấn đề 🟠 số 4).

---

## 5. Bốn vấn đề nghiêm trọng

### 🔴 S1-1 · Cập nhật thời gian thực đã dựng xong nhưng bị chặn hoàn toàn

**Người dùng đang thấy gì.** Thông báo mới, bình luận mới, "ai đang online" **không tự hiện ra**. Phải
tải lại trang mới thấy. Không có báo lỗi — nó chỉ đơn giản không xảy ra.

**Vì sao đây là vấn đề.** Hệ thống **đã dựng đầy đủ** hạ tầng thời gian thực và mã vẫn đang gọi nó.
Toàn bộ công sức đó **không đến được người dùng**. Với sản phẩm cộng tác, "phải F5 mới thấy đồng nghiệp
vừa làm gì" là mất một điểm bán hàng cơ bản.

**Bằng chứng.** Trình duyệt thật, **mọi trang đã đăng nhập, cả 4 vai trò** đều báo lỗi chặn kết nối.
Nguyên nhân ở `next.config.ts:92-93`: danh sách nơi trình duyệt được phép kết nối liệt kê LiveKit, R2,
Mux — **thiếu Supabase**. Điểm chứng minh đây là sơ suất: cùng dòng đó, Supabase **có** trong danh sách
cho phép tải ảnh, nhưng **quên** danh sách kết nối.

**Hệ quả phụ đo được:** mạng **không bao giờ yên tĩnh** trên mọi trang — kết nối bị chặn rồi **thử lại
liên tục không dừng**, tốn pin và tài nguyên máy chủ mà không được gì.

**Hướng xử lý.** Thêm một dòng vào cấu hình. **Rủi ro thấp nhất, lợi ích cao nhất — nên làm đầu tiên.**

---

### 🔴 S1-2 · Mỗi lần cài đặt dự án là một lần ghi vào database THẬT

**Người dùng đang thấy gì.** Không thấy gì — cho tới khi dịch vụ sập.

**Vì sao đây là vấn đề.** Trong cấu hình dự án có lệnh chạy **tự động** mỗi lần cài đặt, và lệnh đó
**sửa cấu trúc database cho khớp mã nguồn**. Nó đọc địa chỉ từ file cấu hình đang trỏ vào **database thật
đang chạy sản phẩm**.

Nghĩa là mỗi bản xem thử trên máy chủ cũng đẩy cấu trúc lên database thật của khách.

**Bằng chứng.** Chính tài liệu dự án ghi lại sự cố đã xảy ra:
> *"đã vi phạm 1 lần → share portal sập ~15 phút"*

Và **chính tôi suýt dính**: lần chạy thử đầu tiên của tôi đã chạy trên database thật vì file cấu hình
không được nạp. Không thiệt hại (chỉ thao tác đọc), nhưng chứng minh rủi ro **thật và dễ vấp**.

**Hướng xử lý.** Tách lệnh đó khỏi đường build. Chạm quy trình triển khai → phải thử trên bản xem thử trước.

---

### 🔴 S1-3 · Link chia sẻ vẫn lộ nội dung agency tưởng đã gỡ

**Người dùng đang thấy gì.** Agency vứt một thư mục vào thùng rác, tin rằng khách không xem được nữa.
Khách mở link cũ — **vẫn xem được video bên trong**.

**Vì sao đây là vấn đề.** Đây là **bề mặt khách hàng**, không phải màn nội bộ. Hiện có **95 link đang còn
hiệu lực**. Nếu có video nào cần gỡ gấp (sai nội dung, khách chưa thanh toán, hợp đồng chấm dứt), thao tác
"vứt vào thùng rác" **không thật sự gỡ nó khỏi tầm nhìn khách**.

**Bằng chứng.** Codex phát hiện, tôi tự đọc mã xác nhận (`share-guest.ts:103-126`): hệ thống lọc từng
thư mục theo trạng thái xoá của **chính nó**, nhưng đường dẫn vật lý **không đổi khi xoá mềm**. Nên thư
mục con còn sống nằm dưới thư mục cha đã xoá **vẫn khớp và vẫn lọt vào link**.

**Hướng xử lý.** ⚠️ **Không được sửa lặng lẽ.** Phải đếm trước: bao nhiêu link và bao nhiêu video sẽ
biến mất khỏi tầm nhìn khách ngay khi sửa. Nếu con số lớn, phải báo khách trước.

---

### 🔴 S1-4 · Editor thao tác được lên phiên tải lên ngoài phạm vi của mình

**Người dùng đang thấy gì.** Không thấy gì — đây là lỗ hổng ở tầng dưới.

**Vì sao đây là vấn đề.** Sản phẩm có cơ chế giới hạn editor **chỉ thấy task được giao cho mình**.
Nhưng đường tải video lên **bỏ qua hoàn toàn** cơ chế đó — nó chỉ hỏi "có phải thành viên workspace không".
Nghĩa là editor có thể **vòng qua chính lớp bảo vệ mà sản phẩm dựng ra**.

**Bằng chứng.** Codex phát hiện, tôi tự đọc mã xác nhận (`upload-service.ts:493-504`).

**Đánh giá mức độ trung thực:** rào cản khai thác **cao** (mã phiên không đoán được, phải đã là thành viên).
Tôi xếp mức này **không phải vì dễ khai thác**, mà vì nó **phá vỡ tính nhất quán của mô hình phân quyền** —
và đó là thứ phải nói được rõ ràng khi bán cho khách.

---

## 6. Sáu vấn đề đáng kể

### 🟠 S2-1 · 9 trong 15 mục menu là ngõ cụt với nhân sự

Editor thấy đủ 15 mục ở thanh bên. Bấm **Bảng lương** → ném về. **Tài chính** → ném về. Thành viên,
Phân tích, Nhật ký, Cài đặt, Hàng chờ task, Hộp thư yêu cầu, Thùng rác tổ chức → **tất cả ném về**,
không một lời giải thích. **60% thanh điều hướng là ngõ cụt.**

Không mục nào bị mờ, khoá hay ẩn — trông y hệt mục dùng được.

**Đây là chủ đích**, ghi rõ trong mã. Nên không phải lỗi để vá, mà là **quyết định thiết kế cần anh chọn
lại**. Hậu quả thật: người dùng mới bấm hết một lượt, bị ném về 9 lần, kết luận phần mềm hỏng — rồi
**không bấm thử cả những mục họ thật sự có quyền dùng**.

### 🟠 S2-2 · Mất mạng: hệ thống im lặng hoàn toàn

Chờ trang tải xong hẳn, ngắt mạng, bấm nút cần gọi máy chủ, thử chuyển trang. Chuyển trang thất bại đúng
như mong đợi — nhưng **không một ký tự nào mới xuất hiện trên màn hình**.

Người dùng bấm lại nhiều lần vì tưởng bấm hụt. Với thao tác đổi trạng thái task hay bàn giao video, đó là
nguồn gốc dữ liệu sai. Tệ hơn: họ tin thao tác **đã xong** trong khi nó chưa bao giờ tới máy chủ.

⚠️ Codex mang về tiêu chuẩn gốc: đây **có thể là lỗi không đạt chuẩn trợ năng** (WCAG 4.1.3), không chỉ
là vấn đề trải nghiệm.

### 🟠 S2-3 · Gõ nhầm địa chỉ là rơi ra khỏi ứng dụng

Mở link cũ đã hỏng: màn hình chỉ còn **"404 This page could not be found."** — không logo, không điều
hướng, **không nút quay lại**, và **bằng tiếng Anh** trong sản phẩm tiếng Việt.

✅ **Nhưng cách làm đúng đã có sẵn**: thử địa chỉ thư mục Tệp không tồn tại → hệ thống **giữ nguyên giao
diện đầy đủ**. Chỉ cần nhân rộng, không cần phát minh.

### 🟠 S2-4 · Editor chưa có task thấy Tệp trống trơn, không giải thích

Editor mới vào công ty bấm **"Tệp"** → màn hình **trống**, không một câu giải thích. Nếu ai gửi link video
cho họ → **trang trắng hoàn toàn**.

Phân quyền **đúng**; cách báo cho người dùng **sai**. Họ không có cách nào biết mình gặp vấn đề quyền hạn
hay lỗi phần mềm.

### 🟠 S2-5 · Danh sách có phần tử trùng khoá

Chính thư viện giao diện cảnh báo hậu quả: *"có thể khiến phần tử bị nhân đôi hoặc biến mất"*. Trong sản
phẩm quản lý task, một task hiển thị hai lần hoặc mất khỏi danh sách là lỗi khiến người dùng **tin nhầm và
làm sai theo**. Chưa khoanh được đúng danh sách nào.

### 🟠 S2-6 · Tìm không ra kết quả lại báo "chưa có task nào"

Gõ từ khoá không khớp → *"Chưa có task nào ở đây."* — trong khi task vẫn còn nguyên, chỉ bị lọc.
Người dùng tưởng task của mình biến mất. Xác nhận bằng mã: câu đó nằm ở **đúng một chỗ duy nhất**,
**không có nhánh nào** phân biệt "chưa có dữ liệu" với "bộ lọc đang giấu".

---

## 7. Những gì sản phẩm đang làm TỐT

Phần này quan trọng ngang phần lỗi — vì nó là nền móng để xây tiếp.

| Điều làm tốt | Bằng chứng đo được |
|---|---|
| **Đóng chặt khi chưa đăng nhập** | **26/26 màn** đẩy về đăng nhập, kể cả gõ thẳng địa chỉ. Không rò một màn nào. |
| **Không tràn ngang ở bất kỳ đâu** | **57/57 mốc** từ 639px tới 1537px và cả ba cỡ điện thoại |
| **Kích thước nút nhất quán tuyệt đối** | **0** trường hợp cùng nhãn nút mà cao thấp khác nhau |
| **Bàn phím đi được gần hết** | 32/35 thành phần · **0/45 điểm dừng thiếu viền focus** · không kẹt vòng lặp |
| **Module Tệp xử lý địa chỉ hỏng đúng cách** | Giữ người dùng trong ứng dụng — tốt hơn phần còn lại của hệ thống |
| **Vùng bấm trên điện thoại đạt chuẩn** | **0%** vi phạm ngưỡng tối thiểu |

---

## 8. Khác biệt máy tính / máy tính bảng / điện thoại

**Điều quan trọng nhất:** sản phẩm **không dùng kích thước màn hình** để chọn giao diện điện thoại hay
máy tính. Nó **đoán loại thiết bị ở phía máy chủ**, và cố ý cho **máy tính bảng nhận giao diện máy tính**.

➡️ **Kéo hẹp cửa sổ trình duyệt không đổi được giao diện.** Ai kiểm thử bằng cách kéo cửa sổ sẽ **không
bao giờ thấy** giao diện điện thoại thật.

| Màn | Máy tính | Điện thoại |
|---|---|---|
| Bảng điều khiển | **18 nút / 15 mục menu** | **2 nút / 5 mục menu** |
| Tệp | 12 mục menu | 5 mục menu |

Đây là **hai lớp vỏ hoàn toàn khác nhau**, không phải CSS thu nhỏ. Cần anh xác nhận có chủ đích, và trong
16 hành động bị lược bỏ có thứ nào nhân sự cần khi đang đi ngoài không.

---

## 9. Học gì và KHÔNG học gì

### ✅ Nên học

| Từ đâu | Điều gì | Vì sao hợp với sản phẩm này |
|---|---|---|
| **Frame.io** | Chồng phiên bản **chỉ tạo ra từ bản thứ 2** | Khớp chính xác dữ liệu thật của anh: **71% video chỉ có 1 phiên bản** |
| **Frame.io** | Cơ chế **xin quyền** thay vì ẩn hoặc chặn im lặng | Gỡ được thế bí ở vấn đề menu ngõ cụt |
| **IBM Carbon** | Tách rõ **trạng thái rỗng** thành 4 loại | Sửa được cả S2-4 và S2-6 bằng một nguyên tắc |
| **Google / W3C** | Ngưỡng phản hồi 100ms–1s và chuẩn thông báo động | Cho S2-2 một tiêu chí nghiệm thu đo được |

### ❌ KHÔNG nên học

| Điều gì | Vì sao không |
|---|---|
| **Notion: kho tài liệu lồng nhau nhiều tầng** | Sản phẩm này có **cây 4 cấp cố định** theo khách hàng. Tự do hơn = mỗi agency tự bịa một cách sắp xếp, mất luôn tính chuyên biệt. |
| **ClickUp: nhồi mọi khung nhìn** | Đúng thứ HustlyTasker cố tình tránh. Dự án **đã từng dựng chat đầy đủ rồi gỡ sạch** — đó là bằng chứng định hướng chuyên sâu, không phình to. |
| **Frame.io: quản trị theo tài nguyên nhiều tầng** | Quá nặng cho agency 3–10 người. Mô hình theo-task-được-giao hiện tại đơn giản hơn và **đang chạy tốt**. |

---

## 10. Mức sẵn sàng bán hàng

Xếp theo định hướng anh đã chốt: **Việt Nam trước, quốc tế sau.**

| Hạng mục | Xếp loại | Trạng thái |
|---|---|---|
| **Cô lập dữ liệu giữa các agency** | 🔴 CHẶN DOANH THU | Có S1-3 (rò link chia sẻ) và S1-4 (vòng qua phạm vi) |
| **Độ ổn định dịch vụ** | 🔴 CHẶN DOANH THU | S1-2 đã gây sập 15 phút một lần |
| **Dễ hiểu, không cần đào tạo** | 🟠 QUAN TRỌNG CHO MVP | S2-1 menu ngõ cụt + S2-4 màn hình trống |
| **Cộng tác thời gian thực** | 🟠 QUAN TRỌNG CHO MVP | S1-1 — đã dựng xong, chỉ bị chặn |
| Onboarding tự phục vụ | ⚪ SAU MVP | Giai đoạn này anh tự demo từng khách |
| Hệ thống gói / thanh toán tự động | ⚪ SAU MVP | Thu tiền ngoài hệ thống trước |
| Đa ngôn ngữ giao diện nhân viên | ⚪ ĐỂ SAU | Khách giai đoạn đầu là người Việt |

**Kết luận:** hai hạng mục 🔴 phải xử lý **trước khi có khách trả tiền thứ hai**. Hai hạng mục 🟠 quyết
định khách có gia hạn hay không.

---

## 11. Claude và Codex bất đồng ở đâu

Hai bên nghiên cứu **độc lập**, tập nguồn khác nhau, viết xong kết luận **trước khi** nhìn kết quả nhau.

| Câu hỏi | Kết quả |
|---|---|
| Menu không có quyền | ⚖️ **Bất đồng** → hợp nhất thành phương án tốt hơn cả hai |
| Máy tính bảng = máy tính | 🔴 **Codex đúng, tôi sai** |
| Trường trạng thái 85% trống | 🔻 **Codex phản bác cách suy luận của tôi** — tôi chấp nhận |
| Trạng thái rỗng · Mất mạng · Chồng phiên bản | ✅ **Hội tụ độc lập** — đáng tin nhất |

**Ba lần tôi bị chứng minh là sai hoặc thiếu sót.** Tôi giữ nguyên cả ba trong tài liệu thay vì viết lại
cho đẹp — đó chính là lý do chạy hai nhánh.

---

## 12. Những gì tôi CHƯA kiểm chứng được

Ghi rõ để không ai hiểu nhầm là đã kiểm:

| Chưa kiểm | Vì sao |
|---|---|
| **Luồng tải video lên thật** | Cần ghi dữ liệu thật + tốn phí xử lý video |
| **Trang khách xem `/r/…` bằng token thật** | Chưa mở |
| **Bình luận theo mốc thời gian, vẽ chú thích, so sánh phiên bản** | Chưa thao tác |
| **Nhân sự CÓ task được giao** | Bảng quyền chỉ phản ánh trường hợp **0 task** |
| **Gửi email thật** | Cố ý chặn, tránh gửi nhầm cho khách |
| **Giao diện điện thoại của các màn sẽ sửa** | Bộ đo chỉ chạy 3 màn |
| **Một phát hiện của Codex (cờ khoá khôi phục)** | Đọc mã thấy **hai đoạn nói ngược nhau** — không kết luận |

---

## 13. Sáu quyết định cần anh đưa ra

Đây là phần tôi **không thể tự quyết**. Mỗi câu trả lời đổi trực tiếp nội dung đặc tả.

### ❓ Q1 · Trong 9 mục menu ngõ cụt, mục nào anh **sẵn sàng cấp quyền** cho editor khi họ xin?
Danh sách đó quyết định mục nào **ẩn hẳn**, mục nào **khoá + chú giải**.
*(Bảng lương · Tài chính · Thành viên · Phân tích · Nhật ký hoạt động · Cài đặt · Hàng chờ task ·
Hộp thư yêu cầu · Thùng rác tổ chức)*
Phần này tôi muốn đổi logic là tài khoản nào ko có quyền tham gia vào mục nào thì mục đó sẽ ko hiển thị ở sidebar của tài khoản đó, nếu có quyền thì sẽ hiện nhé
### ❓ Q2 · Trường trạng thái trên thẻ video — **cái gì đọc nó?**
85% để trống. Trước khi thiết kế lại, cần biết: ai đặt · vào lúc nào · và **thứ gì tiêu thụ giá trị đó**
(thông báo? báo cáo? tự động hoá?). Nếu không gì đọc nó → cân nhắc **bỏ**, không phải làm nổi bật hơn.
Được tôi đồng ý hướng này
### ❓ Q3 · Khách trong workspace bị chặn hoàn toàn khỏi Tệp — có đúng chủ đích không?
Nếu "khách" là cộng tác viên ngoài cần xem video bàn giao thì chặn sạch có thể quá tay.
Khách trong workspace được vào tệp nhưng sẽ chỉ hiển thị những tài nguyên mà có gán tên hoặc quyền của họ thôi
### ❓ Q4 · Giao diện điện thoại chỉ có 2 nút — trong 16 hành động bị lược bỏ, có thứ nào nhân sự cần khi đang đi ngoài không?
Có cần, đó chính là tạo hóa đơn cho khách(này cho admin)
### ❓ Q5 · Sửa lỗi rò link chia sẻ — anh muốn **báo khách trước** hay **sửa rồi thông báo sau**?
Có 95 link đang còn hiệu lực. Tôi sẽ đếm chính xác bao nhiêu link bị ảnh hưởng trước khi anh quyết.
tạm thời này chưa cần làm

### ❓ Q6 · Thứ tự triển khai — anh muốn **sửa 4 lỗi nghiêm trọng trước**, hay **cải thiện Tệp trước** như dự định ban đầu?
Khuyến nghị của tôi: **làm S1-1 (một dòng cấu hình) và nhóm màu/vùng bấm ngay** — rẻ, nhanh, thấy được
liền. Rồi mới tới 4 lỗi nghiêm trọng, rồi mới tới Tệp.
oke tôi đồng ý

## Tài liệu đi kèm

| Tài liệu | Nội dung |
|---|---|
| [00-PRODUCT-VISION-BRIEF](00-PRODUCT-VISION-BRIEF.md) | Định hướng sản phẩm đã xác nhận |
| [01-ENVIRONMENT-INVENTORY](01-ENVIRONMENT-INVENTORY.md) | Môi trường thử nghiệm & báo cáo tương đồng |
| [02-PHASE3-FINDINGS](02-PHASE3-FINDINGS.md) | 16 phát hiện toàn hệ thống, có bằng chứng |
| [03-PHASE4-TEP-DEEP-DIVE](03-PHASE4-TEP-DEEP-DIVE.md) | Báo cáo chuyên sâu module Tệp |
| [04-RESEARCH-QUESTIONS](04-RESEARCH-QUESTIONS.md) | Bộ câu hỏi nghiên cứu chung |
| [06-CROSS-VALIDATION](06-CROSS-VALIDATION.md) | Đối chiếu Claude ↔ Codex, giữ nguyên bất đồng |
| [07-CRITIQUE](07-CRITIQUE.md) | Phản biện 11 vòng, quyết định từng đề xuất |
| [09-DAC-TA-TO-BE](09-DAC-TA-TO-BE.md) | Đặc tả cải thiện — **cần duyệt trước khi làm** |
