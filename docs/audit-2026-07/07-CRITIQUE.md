# Phase 7 — Phản biện đa luồng

> **Ngày:** 2026-07-28
> Mỗi đề xuất đi qua **11 vòng kiểm tra** trước khi được đưa vào đặc tả.
> Tài liệu này **chỉ kể chi tiết những vòng làm THAY ĐỔI kết luận** — nếu liệt kê đủ 15 × 11 = 165 ô
> thì đó là diễn kịch, không phải phản biện.

**Trạng thái quyết định:** `NHẬN` · `NHẬN CÓ ĐIỀU KIỆN` · `SỬA LẠI` · `BÁC` · `CHƯA ĐỦ BẰNG CHỨNG`

---

## Danh sách đề xuất đưa vào phản biện

| Mã | Đề xuất | Nguồn |
|---|---|---|
| R-01 | Sửa CSP: mở `wss://*.supabase.co` + ảnh Google | Claude, đo runtime |
| R-02 | Gỡ `prisma db push` khỏi đường build | Codex nêu, Claude xác minh |
| R-03 | Menu: tách "có thể cấp quyền" (khoá + xin quyền) vs "không bao giờ" (ẩn) | Hợp nhất Claude ↔ Codex |
| R-04 | Bốn trạng thái rỗng riêng biệt | Hội tụ |
| R-05 | Phản hồi khi thao tác thất bại / mất mạng | Hội tụ, Codex nâng mức |
| R-06 | Trang 404 tiếng Việt trong vỏ ứng dụng | Codex |
| R-07 | Chồng phiên bản chỉ hiện từ bản 2 | Hội tụ mạnh nhất |
| R-08 | Trường trạng thái: **điều tra trước khi thiết kế** | Codex phản bác Claude |
| R-09 | Sửa danh sách trùng khoá | Claude, nhật ký trình duyệt |
| R-10 | Nâng tương phản + vùng bấm dưới 24px | Claude, 1039 phép đo |
| R-11 | Chọn bố cục theo cửa sổ thật thay vì đoán thiết bị | Codex đúng, Claude sai |
| **R-12** | **Link chia sẻ phải kiểm tổ tiên còn sống** | **Codex, Claude xác minh** |
| **R-13** | **Kiểm chủ sở hữu phiên upload** | **Codex, Claude xác minh** |
| R-14 | Giới hạn tần suất phải chặn khi DB lỗi | Codex |
| R-15 | Cờ `orphanedFromPurge` khoá vĩnh viễn khả năng khôi phục | Codex |

---

## 🔴 R-12 · Link chia sẻ lộ nội dung agency tưởng đã gỡ — **đề xuất nghiêm trọng nhất**

**Vấn đề.** Khi mở rộng một link chia sẻ thư mục, hệ thống lọc từng thư mục theo `deletedAt` của
**chính nó**. Nhưng đường dẫn vật lý **không đổi khi xoá mềm**. Nên một thư mục con **còn sống** nằm dưới
một thư mục cha **đã bị vứt vào thùng rác** vẫn khớp điều kiện và **vẫn lọt vào link khách xem được**.

**Người dùng đang thấy gì.** Agency vứt một thư mục vào thùng rác, tin rằng khách không còn xem được nữa.
Khách mở link cũ — **vẫn xem được video bên trong**.

**Xác minh.** Codex nêu; tôi tự đọc `src/lib/review/share-guest.ts:103-126` và xác nhận: truy vấn là
`path startsWith folder.path AND deletedAt: null`, áp cho từng thư mục riêng lẻ, **không** truy ngược
chuỗi tổ tiên.

### Phản biện đã làm thay đổi kết luận

**Vòng 7 — trạng thái biên.** Đề xuất ban đầu của tôi: "lọc thêm tổ tiên còn sống". Nhưng nghĩ tiếp:
nếu sửa như vậy thì **95 link đang còn hiệu lực sẽ đồng loạt đổi nội dung ngay khi triển khai**. Khách
đang xem dở một video có thể thấy nó biến mất giữa chừng.

**Vòng 11 — khả năng triển khai.** Không thể biết trước link nào bị ảnh hưởng nếu không đếm trước.

➡️ **`NHẬN CÓ ĐIỀU KIỆN`** — bắt buộc kèm hai điều kiện:
1. **Đếm trước khi sửa**: chạy truy vấn chỉ-đọc đếm chính xác bao nhiêu link và bao nhiêu video sẽ biến
   mất khỏi tầm nhìn khách. Nếu con số lớn, phải báo khách trước.
2. **Không sửa lặng lẽ.** Đây là thay đổi **nhìn thấy được từ phía khách hàng**, không phải sửa lỗi nội bộ.

---

## 🔴 R-13 · Editor thao tác được lên phiên upload ngoài phạm vi của mình

**Vấn đề.** `completeUpload` / `abortUpload` / poll chỉ gọi `requireReviewAccess({ workspaceId })` —
tức **chỉ kiểm tư cách thành viên workspace**, không kiểm người gọi có phải người khởi tạo phiên upload.

**Xác minh.** Tôi đọc `src/lib/review/upload-service.ts:493-504` và xác nhận đúng.

### Phản biện đã làm thay đổi mức độ

**Vòng 1 — kiểm tra sự thật.** Mã phiên là UUID, không đoán được; người gọi đã phải là thành viên
workspace. Vậy rào cản khai thác **cao**. Nếu chỉ dừng ở đây thì đây là lỗi mức thấp.

**Vòng 4 — nhiều vai trò.** Nhưng: sản phẩm này có `folder-scope` giới hạn editor **chỉ thấy task được
giao cho mình**. Đường upload này **bỏ qua hoàn toàn** cơ chế đó — nó chỉ hỏi "có phải thành viên workspace
không". Nghĩa là một editor **vòng qua chính lớp bảo vệ mà sản phẩm dựng ra**.

➡️ **`NHẬN`** — nâng từ "lỗi thấp" lên **đáng kể**, vì nó phá vỡ tính nhất quán của mô hình phân quyền,
không chỉ là một lỗ hổng lẻ.

---

## ⚖️ R-03 · Menu — vòng phản biện làm lộ ra một lỗ hổng trong chính đề xuất hợp nhất

Đề xuất sau Phase 6: chia 9 mục thành "có thể cấp quyền → khoá + đường xin quyền" và "không bao giờ → ẩn".

**Vòng 3 — người dùng đại chúng.** Câu hỏi: editor Việt Nam nhìn thấy nút *"Xin quyền"* thì có bấm không?
Trong agency 5 người ngồi cùng phòng, **họ sẽ quay sang hỏi miệng**, không bấm nút. Nút xin quyền có thể
là thứ **không ai dùng** — giống hệt trường trạng thái 85% để trống mà tôi vừa phát hiện.

**Vòng 9 — SaaS.** Nhưng khi bán cho agency 20–30 người, hoặc đội làm việc từ xa, thì hỏi miệng không
còn khả thi.

➡️ **`NHẬN CÓ ĐIỀU KIỆN`** — làm phần **khoá + chú giải nói rõ ai cấp được quyền** trước
(*"Cần quyền quản trị — liên hệ [tên chủ workspace]"*). **Hoãn** phần nút xin quyền chính thức tới khi
có khách trên 15 người. Lý do: đúng định hướng **Việt Nam trước**, và tránh xây một tính năng có nguy cơ
lặp lại đúng vết xe 85% bỏ trống.

---

## 🔻 R-08 · Trường trạng thái — vòng phản biện xác nhận Codex đúng, và tôi bỏ hẳn đề xuất cũ

Đề xuất ban đầu của tôi (trước Phase 6): thiết kế lại ô trạng thái cho dễ thấy hơn.

**Vòng 1 — kiểm tra sự thật.** 85% trống **không** chứng minh "không ai cần". Nó chỉ chứng minh "ít người
điền".

**Vòng 6 — xung đột giữa các luồng.** Nguy hiểm hơn: nếu tôi làm ô trạng thái **nổi bật hơn** mà không
biết ai đọc nó, tôi có thể đang **ép người dùng điền một trường không ai dùng** — làm chậm luồng chính
để phục vụ một luồng không tồn tại.

➡️ **`SỬA LẠI` thành một câu hỏi, không phải một đề xuất thiết kế.** Phải trả lời trước:
ai đặt trạng thái · vào lúc nào trong quy trình · **cái gì đọc nó** (thông báo? báo cáo? tự động hoá?).
Nếu không thứ gì đọc nó → cân nhắc **bỏ**, không phải làm nổi bật hơn.

---

## 🔴 R-11 · Đổi cơ chế nhận diện thiết bị — bị hạ xuống, dù Codex đúng về nguyên tắc

Codex đúng: đoán thiết bị ở phía máy chủ là cách làm sai (Android nói thẳng, Apple cho đổi cỡ cửa sổ).

**Vòng 11 — khả năng triển khai.** Nhưng cơ chế này nằm trong `src/middleware.ts` — **cùng file với cổng
xác thực**. Sửa nó là chạm vào lớp chặn đăng nhập của toàn hệ thống.

**Vòng 6 — xung đột giữa các luồng.** Và `view-mode` là công tắc tôi **đang dùng để kiểm thử**. Đổi nó
làm hỏng luôn bộ đo của chính đợt kiểm toán.

➡️ **`NHẬN CÓ ĐIỀU KIỆN` — xếp sau MVP.** Đúng về nguyên tắc, nhưng rủi ro chạm cổng xác thực **cao hơn
lợi ích** ở giai đoạn này. Điều kiện: khi làm, phải tách khỏi middleware xác thực trước.

⚠️ **Ghi rõ vào mục "nợ kỹ thuật cần trả trước khi ra quốc tế"** — vì máy tính bảng dùng nhiều hơn ở
thị trường ngoài Việt Nam.

---

## ✅ Các đề xuất qua đủ 11 vòng không đổi

| Mã | Quyết định | Ghi chú từ vòng phản biện |
|---|---|---|
| R-01 CSP | **`NHẬN`** | Vòng 11: sửa 1 dòng cấu hình, không chạm logic. Rủi ro thấp nhất, lợi ích cao nhất. **Nên làm đầu tiên.** |
| R-02 `db push` | **`NHẬN`** | Vòng 11: chạm quy trình triển khai → phải thử trên preview trước. |
| R-04 Trạng thái rỗng | **`NHẬN`** | Vòng 7 (Codex): câu chữ **không được tiết lộ** tài nguyên có tồn tại hay không. |
| R-05 Phản hồi lỗi | **`NHẬN`** | Vòng 8: đây có thể là **lỗi không đạt chuẩn trợ năng** (WCAG 4.1.3), không chỉ UX. |
| R-06 Trang 404 | **`NHẬN`** | Vòng 2: cách làm đúng **đã có sẵn trong module Tệp** — chỉ nhân rộng, không phát minh. |
| R-07 Chồng phiên bản | **`NHẬN`** | Bằng chứng mạnh nhất cả đợt: số đo của tôi + tài liệu Frame.io hội tụ độc lập. |
| R-09 Trùng khoá | **`NHẬN`** | Vòng 1: chưa khoanh được đúng danh sách → **cần khoanh vùng trước khi sửa**. |
| R-10 Tương phản + vùng bấm | **`NHẬN`** | Vòng 3: sửa màu xám một bậc là xong cả nhóm. Hai nút 20px nằm **trong chính Tệp**. |
| R-14 Giới hạn tần suất | **`NHẬN CÓ ĐIỀU KIỆN`** | Vòng 7: chuyển sang chặn-khi-lỗi có thể **khoá nhầm khách thật** lúc DB trục trặc. Cần cảnh báo, không âm thầm. |
| R-15 `orphanedFromPurge` | **`CHƯA ĐỦ BẰNG CHỨNG`** | Xem mục riêng bên dưới — tôi đã đọc mã và kết quả **mâu thuẫn**. |

---

## ❓ R-15 · Tôi đọc mã và KHÔNG kết luận được — nên tôi không kết luận

Codex nêu: thư mục được khôi phục về gốc bị đánh cờ `orphanedFromPurge=true`; lần xoá sau cờ đó không được
gỡ, khiến thùng rác đánh dấu nó **không khôi phục được**.

Tôi đọc `src/lib/review/folders.ts` và thấy **hai đoạn mã nói ngược nhau về ý định**:

**Đoạn 1 (dòng ~1453-1460)** — có chú thích ghi rõ ngày `[audit 2026-07-27 · HIGH]` mô tả **đúng y hệt
lỗi Codex nêu**, và khẳng định phải gỡ cờ:
```ts
const clear = { deletedAt: null, deletedById: null, deleteBatchId: null, orphanedFromPurge: false }
```

**Đoạn 2 (dòng ~1493)** — nhưng ngay sau đó, nhánh chuyển-về-gốc **đặt lại cờ**:
```ts
data: { parentId: target.id, orphanedFromPurge: movedToRoot }
```

➡️ Nếu thư mục **thật sự** bị chuyển về gốc khi khôi phục thì cờ **kết thúc ở giá trị `true`** — tức là
Codex đúng. Nhưng chú thích lại nói lỗi này **đã được sửa**.

**Tôi không truy được thứ tự thực thi đầy đủ của hai đoạn này trong thời gian còn lại.** Vậy nên:

- ❌ Tôi **không** đưa R-15 vào danh sách đề xuất.
- ❌ Tôi **không** nói "đây là lỗi" — vì chưa chứng minh được.
- ❌ Tôi cũng **không** nói "đã sửa rồi" — vì mã cho thấy điều ngược lại là có thể.
- ✅ Ghi là **`CHƯA ĐỦ BẰNG CHỨNG`**, kèm đúng hai số dòng, để lần sau ai kiểm cũng bắt đầu được ngay.

Cách kiểm dứt điểm (chưa làm): khôi phục một thư mục có cha đã bị xoá vĩnh viễn, xoá lại nó, rồi xem
thùng rác có cho khôi phục không.

---

## 🚫 Bị loại khỏi danh sách

**"Nút biến mất theo chiều rộng màn hình"** — `BÁC`. Đây là **lỗi đo của tôi**, không phải lỗi sản phẩm.
Đo lại có chờ nội dung: 29 nút ổn định ở mọi mốc. Đã rút.

**"41% chữ không đạt tương phản"** — `BÁC` con số. Phép tính của tôi đếm nền trong suốt như nền đặc.
Số đúng là **16%**, và chỗ tệ nhất là 4,12:1 chứ không phải 1,04:1.

**"Nhân sự bị chặn oan khỏi Tệp"** — `BÁC`. Đây là **thiết kế đúng** (`folder-scope.ts`). Chỉ giữ lại
phần đúng: màn hình trống không giải thích gì.

---

## Thứ tự đề nghị — dựa trên phản biện, không dựa trên cảm tính

| Nhóm | Đề xuất | Vì sao xếp ở đây |
|---|---|---|
| **1. Làm ngay** | R-01 CSP · R-10 màu/vùng bấm | Sửa cấu hình + token màu. Không chạm logic. Lợi ích thấy ngay. |
| **2. Chặn trước khi bán** | R-12 rò link chia sẻ · R-13 quyền upload · R-02 `db push` | Chạm **dữ liệu khách hàng** và **độ ổn định dịch vụ**. |
| **3. Trải nghiệm cốt lõi** | R-04 · R-05 · R-06 · R-09 | Người dùng cảm nhận trực tiếp mỗi ngày. |
| **4. Ưu tiên Tệp** | R-07 chồng phiên bản · trạng thái rỗng của Tệp | Đúng hạng mục anh chọn đầu tiên, và có bằng chứng mạnh nhất. |
| **5. Cần quyết định trước** | R-03 menu · R-08 trạng thái | Chờ anh trả lời hai câu hỏi ở Phase 6 và Phase 4. |
| **6. Sau MVP** | R-11 nhận diện thiết bị · R-14 giới hạn tần suất | Rủi ro chạm hạ tầng cao hơn lợi ích hiện tại. |

---

## Điều tôi phải nói thẳng về chất lượng của chính đợt phản biện này

**Vòng 10 (kiểm tra pattern đối thủ) gần như không đổi được gì.** Lý do: nghiên cứu Phase 5 đã lọc sẵn —
tôi và Codex đều không lấy pattern nào chỉ vì đối thủ dùng. Nên vòng này chủ yếu xác nhận lại.

**Vòng 5 (đa thiết bị) yếu nhất.** Tôi **chưa** đo được giao diện điện thoại của những màn sẽ sửa, vì
bộ đo chỉ chạy trên 3 màn. Mọi kết luận đa thiết bị ở đây ở mức **suy luận**, không phải đo đạc.

**R-15 tôi chưa tự đọc mã.** Nhận từ Codex, chưa xác minh độc lập. Đã đánh dấu rõ trong bảng.
