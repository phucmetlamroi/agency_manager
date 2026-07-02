# KỊCH BẢN TEST DIỆN RỘNG — "Tạo task từ client" (CTv2) + "Comment theo task"

> Ngày chạy: 2026-07-02 · Nhánh: `claude/cranky-austin`
> Phủ: **Chức năng · Bảo mật · Giao diện**. Hai lớp: (1) **harness tự động** (chạy được), (2) **checklist thao tác tay** (UI/realtime cần session).

## 0. Tóm tắt kết quả

| Track | Nội dung | Môi trường | Kết quả |
|---|---|---|---|
| **A** | Quét dữ liệu THẬT + kiểm bất biến cách-ly (read-only) | **PROD** (chỉ đọc) | **5/5 PASS** |
| **B** | CTv2 — tạo task từ client (token path đầy đủ) | **TEST branch** | **43/43 PASS** |
| **C** | Task comments — cách-ly + bảo mật + markdown | **TEST branch** | **40/40 PASS** |
| **D** | Checklist thao tác tay (admin drawer, portal, realtime, inbox) | Trình duyệt | ☐ chờ chạy tay |

**Tự động: 88/88 PASS · 0 fail.** `tsc` sạch · `next build` xanh.

Chỉ 1 thay đổi code sản phẩm: thêm `__clearRateLimitStore()` (test-only) vào `src/lib/rate-limit.ts` — không có caller trong app, hành vi production **không đổi**.

---

## 1. Cách chạy lại

```bash
# Track A — an toàn tuyệt đối (chỉ đọc prod)
npx tsx scripts/scan-prod-fixtures.ts

# Prereq cho B & C: đồng bộ schema GĐ3 lên nhánh TEST (đã làm; chạy lại nếu schema đổi)
#   (guard: chỉ chạy khi DATABASE_URL chứa "frosty-forest")
DATABASE_URL="<url .env.test>" npx prisma db push --skip-generate --force-reset --accept-data-loss

# Track B & C — nhánh TEST cô lập, tự seed + tự dọn, tự chặn nếu trỏ prod
npx tsx scripts/test-client-task-submission.ts
npx tsx scripts/test-task-comments.ts
```

**An toàn:** B & C **HARD-EXIT** nếu `DATABASE_URL` không phải nhánh `frosty-forest` (hoặc chứa `autumn-flower` = prod). Mọi fixture mang tiền tố `__cts__` / `__tc__`, xoá trước + sau. Harness **tắt gửi email thật** (`RESEND_API_KEY=''`) — chỉ kiểm dòng Notification, không tốn quota Resend.

---

## 2. Dữ liệu thật (Track A — snapshot prod 2026-07-02)

- **Task:** 1112 (0 archived) · **Client:** ACTIVE=177, SOFT_DELETED=57, MERGED=41
- **ClientShareLink:** 12 (0 revoked, 0 expired) · **ClientTaskRequest:** ACCEPTED=1
- **TaskComment:** 4 (INTERNAL=1, CLIENT=3, client-authored=1) · Reaction=1 · ReadState=10 · action-item GĐ3=0
- ⇒ Comment mới dùng rất ít (GĐ3 vừa lên) — nền sạch cho trial.

**Bất biến trên dữ liệu thật (5/5 PASS):** select phía khách không lộ trường staff/action · không có client-comment INTERNAL · mọi client-comment có `viaShareLinkId` · mọi `ClientTaskRequest` đủ scope · rating share-link đúng dạng (clientId null + shareLinkId set).

---

## 3. Track B — CTv2 (43 PASS) — những gì đã khoá

**Chức năng:** resolve scope (canonical + sub, loại brand ngoài scope) · submit tạo `ClientTaskRequest` NEW với `profileId/workspaceId` **ép từ scope** (không từ input) · notify **chỉ OWNER/ADMIN** (USER không nhận) · audit `request.client_submitted` (actorUserId=null) · tạo sub-brand vào scope tự động · mapping 6-link → resources/references khi accept.

**Bảo mật/tấn công:** token sai định dạng / lạ / **revoked** / **expired** → `null` đồng nhất · **scope-injection** (workspace/client ngoài scope, workspace ARCHIVED) → chặn · **XSS** (`<script>`) → strip, lưu plain text · **link injection** (`javascript:`, non-URL, ftp) → chặn · **rate-limit** submit 20/giờ (primitive) + createSubClient **thật** 10/giờ · **cap** 20 sub-brand/parent · schema không có finance/assignee/frame.

**Validation/edge:** title bắt buộc ≤200 · rawFootage bắt buộc URL · desiredType whitelist → null · deadline sai → null · **accept 2 lần / reject sau accept** (guard, kiểm ở tầng action) · **client hard-delete → request giữ nguyên, clientId=null** (SetNull).

---

## 4. Track C — Task comments (40 PASS) — những gì đã khoá

**Cách-ly (viên ngọc):** feed khách **loại** comment INTERNAL, **giữ** CLIENT · tên staff = **"The team"** · **không** trường `action*`/`visibility`/`authorUserId`/`viaShareLinkId` trong item khách · **nội dung INTERNAL không xuất hiện ở bất kỳ đâu** trong payload khách (kể cả khi comment CLIENT có set action field).

**Client post/reply/react (token thật):** post **ép** `visibility=CLIENT` + `authorType=CLIENT` + `authorUserId=null` + provenance · **manager (assignedById) được notify** · body rỗng bị chặn · **không comment được task ngoài scope** · reply vào parent INTERNAL / parent khác task → chặn · reply parent CLIENT cùng task → OK · react chỉ trên comment CLIENT · emoji ngoài allowlist → chặn.

**Rate-limit:** comment 30/giờ · react 120/giờ.

**Staff session-gated (bảo mật):** gọi `createTaskComment / assignTaskComment / getTaskUnreadCounts / searchWorkspaceMembers` **không session → THROW** (không rò qua token).

**Hợp đồng staff (replay tầng DB):** state machine assign→resolve→reopen→(giữ assignee) · unread đếm comment người khác sau mốc đọc, **không** đếm của mình · mention resolve trong workspace, bỏ handle lạ.

**Markdown (hàm thuần thật):** `<script>`/`<img onerror>` → escape · `javascript:` link → không render `<a>` · bold/italic/strike/code/link/autolink/@mention đúng · rel/target an toàn.

---

## 5. Ma trận bất biến bảo mật (tổng hợp — tất cả PASS)

| # | Bất biến | Track |
|---|---|---|
| S1 | INTERNAL không bao giờ tới feed khách | A, C |
| S2 | Khách chỉ post được visibility=CLIENT (ép server) | C |
| S3 | Danh tính staff ẩn khỏi khách ("The team") | C |
| S4 | Trường GĐ3 (assign/resolve/pin/spawn) không serialize sang khách | A, C |
| S5 | Không tiền (jobPriceUSD/wage/profit) trong request/comment | A, B, C |
| S6 | profileId/workspaceId ép từ scope, không từ input khách | B |
| S7 | Scope-injection (workspace/client/task ngoài scope) bị chặn | B, C |
| S8 | Token sai/revoked/expired → null đồng nhất (không oracle) | B |
| S9 | XSS/link-injection sanitize | B, C |
| S10 | Rate-limit theo share-link (submit/subclient/comment/react) | B, C |
| S11 | Staff action cần session (token không mở được) | C |
| S12 | Audit ghi provenance (actorUserId=null + viaShareLinkId + ip) | B |

---

## 6. Track D — CHECKLIST THAO TÁC TAY (cần đăng nhập / 2 trình duyệt)

> Phần UI/realtime không script được. Fixture prod gợi ý: **share-link active** `3863fbef-…` (client 101). Chưa có task nào có sẵn cả INTERNAL+CLIENT → tự tạo 1 comment mỗi loại để kiểm.

### 6.1 Admin drawer (dark) — `/[workspaceId]/admin` → mở 1 task
- ☐ Soạn comment; toggle **Nội bộ/Công khai** → INTERNAL hiện 🔒 nền vàng
- ☐ Sửa (chỉ của mình) → nhãn "đã sửa"; Xoá (của mình hoặc admin)
- ☐ Reaction picker 6 emoji (👍❤️😂🎉👀🙏); bấm lại để bỏ
- ☐ **@ dropdown**: gõ `@` → gợi ý thành viên; ↑↓ chọn, Enter/Tab chèn, Esc đóng → người được nhắc nhận thông báo
- ☐ Reply thread (thụt lề); reply vào comment công khai
- ☐ **Markdown**: `**đậm**`, `*nghiêng*`, `` `code` ``, `[x](https://…)` render đúng; `<script>` hiện như chữ
- ☐ **Giao việc → Đã xử lý → Mở lại → Đổi người → Bỏ giao**; người được giao + người giao nhận notify đúng
- ☐ **Badge 💬** trên bảng task (chấm tím khi có tin chưa đọc); mở task → đọc → đóng → badge về xám
- ☐ Phân cách ngày (Hôm nay/Hôm qua)
- ☐ **Realtime 2 user**: mở cùng task ở 2 trình duyệt; A post/sửa/react/giao → B tự thấy trong ~1–3s (cần `NEXT_PUBLIC_SUPABASE_URL` + key)

### 6.2 Client portal (light) — mở link `/share/<token>`
- ☐ Chỉ thấy comment **CLIENT**; tên staff = **"The team"**, của mình = **"You"**
- ☐ **KHÔNG** có: toggle Nội bộ, nút Sửa/Xoá, ô giao việc, dropdown @mention
- ☐ Post / reply (vào comment công khai) / react được
- ☐ Link **thu hồi/hết hạn** → trang lỗi nhẹ (không lộ dữ liệu)

### 6.3 CTv2 — wizard + inbox
- ☐ Wizard 5 bước: validate từng bước (brand/period/title bắt buộc; rawFootage phải URL)
- ☐ Submit → hiện ở **`/[workspaceId]/admin/requests`** với badge "MỚI"; badge sidebar tăng
- ☐ **Accept** → tạo Task (RAW/BROLL/SUBMISSION/REF/SCRIPT đúng ô, notes gộp videoList), request → ACCEPTED + link taskId
- ☐ **Reject** (kèm lý do) → REJECTED
- ☐ **Quét bằng Velox** → sang admin queue với params đúng
- ☐ Tạo sub-brand từ portal → xuất hiện ở lần mở link sau

---

## 7. Ghi chú / hạn chế đã biết

- **Staff comment actions** (post/edit/assign/resolve/unread…) chạy đúng logic được xác nhận qua: (a) `tsc`+`build` xanh, (b) test "từ chối khi không có session" (C-6), (c) replay hợp đồng tầng DB (C-7), (d) checklist tay (D-6.1). Không gọi trực tiếp được từ script vì cần cookie session.
- **Realtime + email deliverability** chỉ kiểm được bằng tay / môi trường thật (Supabase + Resend) — nằm ở D-6.1 và ngoài phạm vi tự động.
- Ngoài phạm vi: load/perf (k6), a11y tự động (axe).

---

## 8. KẾT QUẢ QA (điền khi chạy)

- **2026-07-02** — Track A **5/5**, Track B **43/43**, Track C **40/40** → **88/88 PASS**. `tsc` sạch, `build` xanh. **0 bug phát hiện** ở tầng tự động (cách-ly + validation + rate-limit + XSS đều giữ). Track D chờ chạy tay.
