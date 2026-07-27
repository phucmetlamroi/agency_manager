# Lỗi: video đã giao nhưng không thấy trong Tệp (27/07/2026)

Nguồn: video báo lỗi `2026-07-27 15-16-57.mp4`.
Lời của chủ dự án: *"tại sao khi mà tôi vào tệp thì lại không có hiển thị tệp của tôi"* — *"không có khách hàng ForTesting"* — *"bạn hãy xem cho tôi lỗi này là lỗi gì và tại sao nó lại xảy ra"*.

## Hiện tượng

Editor upload video vào task "Video 10000" (khách ForTesting). Upload thành công, Mux xử lý xong, mở trực tiếp link asset thì xem được. Nhưng:

- Vào **Tệp** → cây thư mục bên trái **không có** "ForTesting" (chỉ có 14 khách khác).
- Lưới thư mục gốc cũng **không có** "ForTesting".
- Vào thẳng URL thư mục video thì mở được, breadcrumb ghi `Tệp > ForTesting > Video 10000`.
- Bấm vào chữ **"ForTesting"** trên breadcrumb → **404 "Không tìm thấy thư mục."**

## Nguyên nhân gốc

Thư mục "ForTesting" **đang nằm trong thùng rác** (`deletedAt = 2026-07-07`), nhưng hệ thống vẫn tiếp tục ném video mới vào bên dưới nó.

Chuỗi lỗi:

1. `ReviewFolder.systemKey` là `@unique` (`prisma/schema.prisma:1648`) — đây là khoá idempotent để tìm-hoặc-tạo thư mục tự động cho task upload.
2. Mọi chỗ tìm theo khoá này đều **không lọc `deletedAt`**:
   - `ensureFolder` — `src/lib/review/task-folder.ts:34`
   - `ensureRootFolder` — `src/lib/review/upload-service.ts:95`
   - `ensureWorkspaceRoot` — `src/lib/review/folders.ts:149`
3. Vì khoá là UNIQUE, một thư mục đã bị xoá mềm sẽ **chiếm khoá vĩnh viễn** — không bao giờ tạo được thư mục thay thế. Mọi lần upload sau đó đều nhận lại đúng cái thư mục đã bị xoá làm thư mục cha.
4. Nội dung mới (còn sống) nằm dưới một tổ tiên đã bị xoá. Nhưng mọi chỗ đọc chỉ lọc `deletedAt` của **chính hàng đó**, không xét tổ tiên:
   - `getFolder` — `folders.ts:358` → 404 khi mở thư mục ForTesting
   - `listChildren` — `folders.ts:455` → thư mục gốc không liệt kê ForTesting
   - cây thư mục bên trái → tương tự
5. Breadcrumb (`folders.ts:368`) tra tên tổ tiên **cũng không lọc `deletedAt`** → vẫn vẽ "ForTesting" thành link bấm được, mà bấm vào thì 404. Đây là lý do lỗi trông "vô lý".
6. Cron dọn thùng rác **không** xoá được ForTesting vì `folderHasDescendantRow` (`purge.ts:209`) thấy nó còn con đang sống. Nên nó nằm đó mãi — vừa vô hình vừa không dọn được.

Kết quả: một **vùng chết tự duy trì**. Không mất dữ liệu (video vẫn còn nguyên trên R2/Mux), nhưng không ai tìm thấy.

## Quy mô thật (đo trên DB production)

`scripts/probe-trashed-systemkey-folders.ts` (chỉ SELECT, không ghi):

```
Trashed folders holding a systemKey: 2
  ORPHANS  name=ForTesting   depth=1  liveChildFolders=5  liveAssets=5  deletedAt=2026-07-07  id=bd5826c9-…
           name=Daniel Oni   depth=2  liveChildFolders=0  liveAssets=0  deletedAt=2026-07-21

LIVE assets stranded under a trashed ancestor: 5
  test đi · video test fb · Video 10000 · hihijuk · Video156
```

`id=bd5826c9-6a69-4aed-92d6-d02759c711f6` khớp chính xác URL 404 trong video. **5 video đã bị nuốt trong 20 ngày**, không phải 1.

"Daniel Oni" chưa có nội dung mắc kẹt, nhưng khoá của nó cũng đã bị chiếm — lần upload tiếp theo cho khách đó sẽ dính y hệt.

## Đã sửa

| # | Sửa gì | Ở đâu |
|---|--------|-------|
| 1 | `reviveSystemFolderChain` — khi tìm-hoặc-tạo gặp thư mục đã xoá mềm thì **hồi sinh** nó và mọi tổ tiên đã xoá, trước khi trả về | `src/lib/review/folders.ts` |
| 2 | Gọi ở cả 4 đường: `ensureFolder` (2 nhánh), `ensureRootFolder` (2 nhánh), `ensureWorkspaceRoot` | `task-folder.ts`, `upload-service.ts`, `folders.ts` |
| 3 | `readRoot` — chỗ tra khoá thứ 4, nuôi **lưới thư mục gốc**; root nằm trong thùng rác vẫn phục vụ "Tệp" như không có gì | `folders.ts` |
| 4 | Breadcrumb: tổ tiên trong thùng rác hiện **gạch ngang, không bấm được**, tooltip nói rõ "đang ở trong thùng rác" thay vì link 404 | `folders.ts` + `TeamBrowser.tsx` |
| 5 | Cảnh báo khó hiểu lúc upload được viết lại (xem dưới) | `TaskReviewUploadSection.tsx` |

Phạm vi hồi sinh **cố ý hẹp**: chỉ các hàng thư mục trên đường dẫn tổ tiên, **không** đụng tới lô xoá gốc. Nội dung chủ dự án cố ý vứt đi vẫn nằm trong thùng rác và vẫn khôi phục được.

Về số liệu dung lượng: không cần chỉnh. `addBytesToAncestors` vốn không lọc `deletedAt`, nên byte của các upload trong lúc thư mục bị xoá đã cộng lên tới gốc từ trước rồi. Chỉ `itemCount` cần cộng lại +1 mà `deleteItems` đã trừ.

## Cảnh báo lúc upload — viết lại

Chủ dự án đọc dòng cảnh báo trên video rồi nói: *"là sao ta, không hiểu lắm, nghĩa là sao"*.

- Cũ: "Không nhận diện được Khách/Brand từ tên task — sẽ lưu theo tên hiện tại."
  → nhắc tới một quy ước đặt tên nội bộ mà người dùng chưa từng được cho biết, và kết bằng "tên hiện tại" (tên nào?).
- Mới: "Tên task không theo mẫu **"Khách / Brand · Tên video"**, nên thư mục video sẽ lấy nguyên tên task. File vẫn được lưu bình thường vào đường dẫn ở trên."

## Còn tồn

- **Chưa sửa dữ liệu production.** Chủ dự án chọn không chạy (ForTesting là khách test). Script vẫn nằm trong repo, mặc định dry-run:
  `npx tsx scripts/repair-trashed-systemkey-folders.ts` → xem trước
  `… --apply` → sửa thật
  Nếu sau này dính khách thật, chạy script này.
- Bản vá code làm hệ thống **tự chữa**: lần upload kế tiếp cho một khách bị kẹt sẽ tự kéo thư mục ra khỏi thùng rác.
