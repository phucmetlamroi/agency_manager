# P2 — Trình duyệt asset "Team": Trạng thái DoD & Checklist nghiệm thu

> Kết quả P2.7 (verify hợp nhất). Branch `claude/cranky-austin`. Nhánh chưa merge vào main → prod CHƯA có P2.
> Ràng buộc: các route Team **session-gated** (đăng nhập + `/admin` layout admin-only) nên e2e **không tự động hoá bằng tsx được**; phần kiểm được headless đã có probe, phần còn lại là **checklist thao tác tay** ở cuối file.

## 1. Cách đã verify

| Lớp | Công cụ | Trạng thái |
|---|---|---|
| Kiểu (types) | `tsc --noEmit` | ✅ xanh 0 lỗi |
| Build production | `next build --webpack` | ✅ xanh (tất cả route Team + API đăng ký) |
| Bất biến tĩnh (headless) | `npx tsx scripts/probe-review-p2-dod.ts` | ✅ **26/26 PASS** |
| Review đối kháng | workflow đa-agent (P2.3/P2.4/P2.5) + agent tập trung (P2.6) | ✅ mọi finding CONFIRMED đã fix (gồm 1 HIGH leo thang quyền) |
| E2E trình duyệt | checklist tay (mục 4) | ⏳ chờ người chạy (session-gated) |

`probe-review-p2-dod.ts` chốt cứng: (a) **không rò trường tiền** (jobPriceUSD/wage/profit…) trong DTO/serializer review; (b) context menu **đúng số mục** (folder 9 / asset 10 / canvas 3) và **không có mục đã loại** (Manage Access / Make Restricted / Open on Desktop / Compare Versions / Generate Transcripts / Upload Caption); (c) đủ 7 route + 3 page; (d) fix leo thang quyền (`isAdmin` theo workspace) + guard xoá folder FR-B07 + copy-on-reference `muxAssetId=null`.

## 2. Deliverable ROADMAP P2 → nơi hiện thực

| # | Deliverable | Phase | Hiện thực |
|---|---|---|---|
| 1 | Route `/admin/team` + `/folder/[id]` + `/trash` + guard + sidebar "Team" | P2.2/P2.6 | `src/app/[workspaceId]/admin/team/**`, `AppSidebar.tsx` |
| 2 | Folder browser grid/list, breadcrumb rút gọn `…`, tree, dòng tổng, deep-link | P2.2/P2.3/**P2.7** | `TeamBrowser.tsx` (BreadcrumbTrail collapse thêm ở P2.7), `folders.listChildren` |
| 3 | New Folder flow (toast 2 nhịp → inline-rename → hậu tố "(2)") | P2.4 | `TeamUpload.NewFolderTile`, `folders.createFolder` |
| 4 | Upload từ Team (canvas drop, upload menu, nhánh ẢNH, lọc file) | P2.4 | `team-upload.ts`, `TeamUpload.tsx`, engine P1.9 |
| 5 | Card metadata + hover-scrub + info panel | P2.3 | `TeamCards.tsx`, `HoverScrub.tsx` |
| 6 | Context menu folder + asset (đúng thứ tự PRD) | P2.5 | `TeamContextMenu.tsx`, `folders.copyItems/renameAsset`, routes |
| 7 | Appearance menu + Sort | P2.3 | `TeamToolbar.tsx`, `view-prefs.ts` |
| 8 | Multi-select + bottom bar (cap 200) | P2.5 | `SelectionBar.tsx`, `TeamBrowser` selection |
| 9 | Trash view + restore (undo 5s) | P2.6/**P2.7** | `TeamTrash.tsx`, `folders.listTrash/restoreItems` |

## 3. DoD ROADMAP P2 (đối chiếu)

- [x] **FR-B01/B02/B03/B05/B06/B09/B10/B11/B12** — hiện thực đầy đủ (verify: build + probe + review; AC hành vi = checklist tay).
- [x] **FR-B02 AC1** breadcrumb `…` rút gọn cấp giữa — **bổ sung ở P2.7** (`BreadcrumbTrail`, collapse khi >4 cấp → dropdown).
- [x] **FR-B04** (mp4+png nhận, docx từ chối; upload folder lọc pdf) — `filterValid` + `validateFileMeta`.
- [x] **FR-B07 AC2–AC4 / FR-B08 AC2–AC4** — copy/move/duplicate/delete + cycle-guard + download; **AC1 số mục menu** đã chốt bằng probe (share items render disabled → đủ số mục ngay).
- [x] **FR-B07 quyền xoá folder** (USER chỉ xoá folder mình tạo; ADMIN mọi folder) — enforce SERVER trong `deleteItems` + gate UI (đã vá lỗ hổng `isAdmin` dùng role global).
- [x] **FR-B13 AC1–AC3** — soft-delete → trash → restore (đúng vị trí / fallback root khi cha mất) + undo 5s.
- [x] **Role LOCKED/không-quyền truy cập route Team** → chặn ở `/admin` layout (`verifyProfileAdminAccess`).
- [~] **Download bản gốc đúng byte** — luồng presigned R2 GET + `Content-Disposition: attachment` đã đúng; **so checksum = việc của test tay** (BRW-04).
- [~] **Cây 8 cấp: breadcrumb rút gọn + tạo/di chuyển không giới hạn độ sâu** — breadcrumb `…` xong; MAX_DEPTH=20 (chặn abuse), UI thường không chặn tới cấp 10.

## 4. Checklist thao tác tay (trình duyệt) — chạy ở preview/staging sau đăng nhập ADMIN

> Mở `/{workspaceId}/admin/team`. Gate release: còn 1 Blocker fail = không ship.

### Blocker
- [ ] **BRW-01** Vào Team: dòng tổng `"{N} thư mục • {M} video • {X} GB"`; empty state 2 nút; kéo-thả 1 mp4 + 1 png + 1 docx → 2 nhận, **docx từ chối** (toast nêu tên).
- [ ] **BRW-02** Chuột phải canvas → **đúng 3 mục**; New Folder: toast `Đang tạo…` → `Đã tạo…` → tile bôi sẵn text, gõ đè, Enter lưu / Esc giữ mặc định; tạo trùng tên → `(2)`; **F2** rename lại được.
- [ ] **BRW-03** Chuột phải folder → **đúng 9 mục đúng thứ tự**, KHÔNG có mục đã loại; Move folder vào con của nó → chặn `FOLDER_CYCLE`; Delete folder (5 asset + 2 folder con) → confirm nêu số item → vào Trash **1 entry**; **Copy Folder URL** mở tab khác đúng folder; breadcrumb sâu 8 cấp có **"…" dropdown**.
- [ ] **BRW-04** Chuột phải asset → **đúng 10 mục**; Move asset (3 version + 10 comment) → giữ nguyên; **Duplicate** → bản sao 1 version, 0 comment; **Download** → đúng byte (so checksum), có `Content-Disposition: attachment`.
- [ ] **BRW-05** Upload nhiều file (mp4+png nhận, docx từ chối, KHÔNG có request upload docx); Upload Folder `Campaign/Raw`+`Campaign/Refs` giữ cấu trúc, pdf bị lọc + toast đếm.
- [ ] **BRW-09** Chọn 1 asset → bottom bar `"Đã chọn 1 asset • {size} • Thời lượng {mm:ss}"`; Ctrl/Shift-click; checkbox hover; **chọn tất cả**; Esc bỏ; chọn 3 asset + 1 folder → Delete → confirm 1 lần → cả 4 vào Trash.
- [ ] **TRS-01** Xóa 1 asset → toast `Đã chuyển vào "Đã xóa gần đây".` + **nút Hoàn tác** (bấm → khôi phục); mở Thùng rác → item có countdown "Còn n ngày", người xóa; empty state `"Thùng rác trống"`.
- [ ] **TRS-02** Restore asset/folder → về **đúng vị trí cũ**; xóa lại + restore lần 2, 3 vẫn được (không giới hạn).
- [ ] **TRS-03** Xóa AssetX rồi xóa FolderP (cha) → restore AssetX khi FolderP còn trong trash → về **gốc Team** + toast `movedToRoot`.

### Major
- [ ] **BRW-06** Card video: overlay thời lượng, uploader•ngày (tooltip đầy đủ), chip status, 1 version KHÔNG badge; single-click = info panel (size/dur/res/fps read-only); **hover-scrub** rê ngang → frame đổi + playhead; card `processing` không scrub.
- [ ] **BRW-07** Appearance: List → **7 cột**, click "Dung lượng" sort 2 chiều, folder trên cùng; Grid S/M/L + 9:16 + Fit (letterbox) / Fill (crop); per-user + reload giữ (localStorage).
- [ ] **BRW-08** Sorted by: File Size desc → nặng nhất đầu; Comment Count → theo version hiện tại.

## 5. Hoãn có chủ đích (không phải thiếu sót)

| Hạng mục | Phase | Ghi chú |
|---|---|---|
| Thả file **lên folder-card** (drop vào đúng 1 folder) + indicator | P3 | Canvas drop (thả vào folder hiện tại) đã có; per-card drop gộp với drag-drop P3 |
| Thả file **lên asset-card = version mới** (BRW-10, overlay confirm) | P3 | Roadmap chốt drag→version là P3 |
| Menu `…` hover trên card (BRW-06) | P3 | Chuột phải đã cung cấp đủ menu; `…` là affordance bổ sung |
| Double-click **player** / **lightbox ảnh** (BRW-06 AC2) | P4 | P2 = toast "bản sau", không crash |
| Status dropdown thật trên card | P3 | P2 = chip placeholder màu đúng |
| Create Share Link / Add to Share Links (menu mục 1–2), Manage Versions (asset mục 3) | P5 / P3 | Render **disabled** ("bản sau") — đủ số mục cho AC1 |
| **TRS-04 Delete forever / purge cron** | P6 | Cố ý KHÔNG có xóa vĩnh viễn ở P2 (an toàn: không ship xóa mà không có khôi phục) |

## 6. Kết luận

P2 (Team asset browser) **hoàn tất các deliverable chính P2.1→P2.6** + P2.7 verify. Tất cả kiểm được headless đều xanh; phần e2e còn lại là checklist tay ở mục 4 (chạy trên preview sau khi merge/deploy). Không có Blocker tự động nào fail. Nhánh chưa push/merge — branch push = preview, merge PR = prod (không có DDL phá huỷ vì P2 additive-only).
