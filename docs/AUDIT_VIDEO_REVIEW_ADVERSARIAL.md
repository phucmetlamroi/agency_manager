# Audit phòng thủ đối kháng — Module Video Review (2026-07-14)

> Quy trình: **Scout → RED (3 mũi song song) ↔ BLUE (2 vòng phản biện) + LOGIC (độc lập) → JUDGE (gác cổng)**.
> 9 subagent, ~1.31M token, 0 lỗi. Chỉ đọc code — **chưa sửa gì**. Nhánh `claude/cranky-austin`.
> Người điều phối (Claude) đã tự mở lại file:dòng của cả 3 lỗi **Cao** + lỗi R5 để loại báo động giả trước khi chốt.

## Tổng quan
- **11 phát hiện, tất cả Đã-xác-nhận** bằng chứng cứ code cụ thể. Không Disputed, không Needs-info sau 2 vòng tranh luận.
- **0 Nghiêm trọng · 3 Cao · 5 Trung bình · 3 Thấp.**
- **Không có rò `jobPriceUSD` / doanh thu USD của agency** — grep toàn `src/lib/review`, `src/app/api/review`, `src/app/api/r` xác nhận model review không mang trường tiền. Lỗi tiền ở đây là **toàn-vẹn/tự-duyệt tiền công editor**, không phải lộ USD ra ngoài.
- Chủ đề xuyên suốt: mô hình tin cậy khách = **"ai nắm link (slug) là có quyền của khách"** (capability-URL, một phần cố ý) trở nên rủi ro vì (a) thiếu cờ bật/tắt quyền *duyệt*, (b) tự gán danh tính dưới **tên client thật**, (c) FSM đã tắt khiến vòng đời task + payroll bị điều khiển mà không có ai ký duyệt độc lập.

---

## 🔴 CAO (3)

### H1 — Bất kỳ ai nắm slug đều **giả mạo quyết định duyệt của khách**
- **File:** `src/app/api/r/[slug]/decision/route.ts:47` → `src/lib/review/share-decision.ts:127`
- **Vấn đề:** Route `POST /decision` chỉ cần (1) qua `requireShare` (biết slug + mật khẩu nếu có) và (2) một `GuestSession` — nếu chưa có cookie thì **tự khai {name,email} ở body, KHÔNG verify email**. `submitGuestDecision` lật `reviewState=APPROVED` + ghi `asset.statusId='Hoàn tất'` cho head version. **Không tồn tại cờ `allowDecisions`** ở schema/`createShareLink` → mọi share gắn task đều cho duyệt.
- **Hệ quả:** Kẻ nắm link đóng vai khách bấm Approve/Request-changes. Approve **không** tự chuyển Task sang "Hoàn tất", nhưng đặt `Task.clientReview='APPROVED'` → bật banner "khách đã duyệt", mồi cho staff bấm xác nhận (chốt lương editor). Là **giả mạo state + social-engineering**, không phải auto-complete.
- **Đề xuất:** Thêm `ShareLink.allowDecisions` (mặc định chỉ bật cho share admin gửi khách qua F10) + chặn route nếu tắt; cân nhắc buộc `GuestSession.emailVerifiedAt` (PIN double-opt-in) mới được quyết định với share external.
- Nguồn: RED + BLUE + LOGIC.

### H2 — Tự gán **danh tính mang tên CLIENT THẬT** cho khách nặc danh, khuếch đại H1
- **File:** `src/lib/review/share-auth.ts:220` (`createLinkClientGuestSession`) + `:264` (`resolveGuestForWrite` case 3)
- **Vấn đề:** Với share gắn client, khách nặc danh (không modal, không xác thực) được cấp `GuestSession` với `name = tên client thật` + `emailVerifiedAt` đặt sẵn. Đường ghi (comment/reaction) gọi `resolveGuestForWrite` → tạo session này + set cookie `rv_guest`; sau đó route `decision` `getGuestSession` trả về **chính session mang tên client** → kẻ lạ vừa comment vừa Approve **dưới tên client thật**, staff không phân biệt được.
- **Điều kiện:** Nhánh comment chỉ chạy khi `allowComments=true` (thường bật với link duyệt của khách). Đây một phần là thiết kế owner-opt-in ("client không thấy modal"), nhưng hệ quả mạo-danh-dưới-tên-thật là thật.
- **Đề xuất:** Không auto-cấp danh tính mang tên client trên đường ghi nhạy cảm (nhất là `decision`); tách "known-client auto-identity" khỏi quyền quyết định; yêu cầu PIN email của client thật trước khi ghi hành động dưới tên họ.
- Nguồn: RED + BLUE + LOGIC.

### H3 — FSM tắt + RBAC-assignee → **editor tự hoàn tất task của mình** (chốt lương) và tự re-open task đã xong
- **File:** `src/actions/task-actions.ts:70` + `src/lib/fsm-config.ts:124`
- **Vấn đề:** `validateTransition()` luôn trả `{isValid:true}` (FSM tắt theo yêu cầu chủ dự án). `updateTaskStatus` cho **non-admin nếu là assignee** (:70-74); guard FSM (:79-83) vô hiệu; **không có chốt theo status đích** → mất "admin-only cho Hoàn tất". Chuỗi qua module review: `setAssetStatus` chỉ đòi folder-scope 'write' (editor-assignee có) → tự set `asset.statusId='Hoàn tất'`; `confirmTaskHoanTat` chỉ guard "có asset LIVE approved" rồi delegate `updateTaskStatus`.
- **Hệ quả:** Editor tự đẩy task sang `'Hoàn tất'` (terminal, `salaryCompleted`, `clientReview='APPROVED'`) **bỏ qua admin duyệt-gửi-khách + khách duyệt**; và tự **re-open** task đã "Hoàn tất" (guard `isTerminalStatus` chỉ áp cho auto-event, không cho đổi thủ công). **Lưu ý:** đây là tiền **công editor** (`t.value`), không phải `jobPriceUSD`/doanh thu agency — lỗi toàn-vẹn/tự-duyệt payroll.
- **Đề xuất:** Gắn **chốt cứng theo status đích** trong `updateTaskStatus` (độc lập FSM): chỉ workspace-admin mới set được `'Hoàn tất'`/terminal và re-open khỏi terminal, đọc từ `TASK_STATUS_META` (`salaryCompleted`/`terminal`).
- Nguồn: RED + BLUE.

---

## 🟠 TRUNG BÌNH (5)

### M1 — R5 leak: bản dựng mới **chưa admin-duyệt lộ cho khách** trên nhánh 'CHANGES'
- **File:** `src/lib/review/task-sync.ts:418`
- **Vấn đề:** `revokeClientExposureOnNewVersion` return sớm nếu `clientReview !== 'AWAITING'` (:418). Sau khi khách "request changes" → `clientReview='CHANGES'` và share **vẫn active**. Editor upload v2 sửa → `applyMuxReady` đặt v2 làm HEAD + gọi revoke nhưng **NO-OP** vì 'CHANGES'≠'AWAITING'. ShareLink luôn phục vụ HEAD → v2 (chưa qua admin F10) **lộ ngay** cho khách qua `/r/`, khách có thể Approve nó. Bản vá R5 trước chỉ xử lý 'AWAITING', bỏ sót nhánh CHANGES.
- **Đề xuất:** Mở rộng guard revoke bao cả `clientReview='CHANGES'` (và mọi trạng thái share còn sống chưa terminal-approved); buộc admin F10 re-send để chỉ bản admin-duyệt tới khách.
- Nguồn: RED + BLUE + LOGIC (LOGIC đánh High).

### M2 — Cổng `allowComments` **bị đi vòng** (note request_changes + edit/delete comment)
- **File:** `src/lib/review/share-decision.ts:109` (+ `share-comments.ts:380,397`)
- **Vấn đề:** (1) `submitGuestDecision` với `request_changes` gọi `persistDecisionNote` tạo `ReviewComment` công khai (body ≤2000 ký tự) **KHÔNG check `allowComments`** — trong khi `createGuestComment`/reaction/attachment đều 403 khi tắt; nhánh idempotent vẫn persist mỗi lần → spam được. (2) `editGuestComment`/`deleteGuestComment` chỉ kiểm sở hữu, **không kiểm `allowComments`** → sau khi agency ĐÓNG bình luận để "đóng băng" feedback, khách vẫn sửa/xóa comment cũ.
- **Đề xuất:** Áp guard `allowComments` đồng nhất trên **mọi** đường ghi/sửa/xóa comment guest (thêm vào `persistDecisionNote` + `editGuestComment`/`deleteGuestComment`), hoặc tách note quyết định khỏi việc tạo comment công khai.
- Nguồn: RED + LOGIC + BLUE.

### M3 — Tạo share link **bỏ qua folder-scope (FR-03)** của editor
- **File:** `src/lib/review/shares.ts:160`
- **Vấn đề:** `createShareLink` chỉ gọi `requireReviewAccess({workspaceId})` + verify asset thuộc workspace, **KHÔNG** gọi `getFolderScope`/`assertAssetInScope` — khác mọi đường editor khác. `getOrCreatePrimaryShareForAsset` khi không tìm share tái dùng trong-scope thì fallback `createShareLink` bất kể scope. → Một editor (USER) có thể tạo link `/r/` công khai trỏ **bất kỳ asset nào trong workspace**, tự chọn `allowDownload=true` + `downloadOnlyWhenApproved=false` để tải master. (Cần biết `assetId` cuid, không đoán bừa → vượt-phân-vùng, không IDOR bừa, nhưng phá đúng mục tiêu FR-03.)
- **Đề xuất:** Gọi `getFolderScope` + `assertAssetInScope`/`assertFolderInScope` trong `createShareLink` (+ nhánh fallback) trước khi tạo share.
- Nguồn: RED + BLUE.

### M4 — 'Request changes' lặp kèm note mới **không thông báo staff**
- **File:** `src/lib/review/share-decision.ts:108`
- **Vấn đề:** Khi `reviewState` đã = target (khách bấm request-changes lần 2 trong khi vẫn CHANGES_REQUESTED), nhánh idempotent persist note rồi **RETURN NGAY, trước `inngest.send`**. `persistDecisionNote` chỉ ghi activity `COMMENT_CREATED`, **không** gọi notify → assignee+admin **không nhận** push/email `VIDEO_CHANGES_REQUESTED`. Staff dễ bỏ lỡ feedback vòng 2. (Không mất dữ liệu — activity feed vẫn có dòng; chỉ mất thông báo chủ động.)
- **Đề xuất:** Ở nhánh idempotent khi có note mới, vẫn phát một sự kiện notify nhẹ (hoặc Inngest feedback-added).
- Nguồn: LOGIC (độc lập).

### M5 — Rate limiter **fail-open**: mọi throttle guest biến mất khi DB lỗi
- **File:** `src/lib/review/rate-limit-db.ts:42`
- **Vấn đề:** `limitDb` catch trả `{success:true}` (fail-open có chủ ý). Mọi throttle guest dựa hàm này — gồm cap **5/60s trước `bcrypt.compare` ở `/unlock`** (chống brute-force mật khẩu share) và các cap ghi. Khi Neon/Postgres degrade, mọi giới hạn im lặng mở khóa → brute-force mật khẩu share chỉ bị chặn bởi throughput bcrypt/CPU. (Chỉ khai thác được khi DB đang degrade — không thường trực.)
- **Đề xuất:** Fail-**closed** riêng cho đường `/unlock`/nhạy-cảm (limiter lỗi → từ chối/thêm trễ), giữ fail-open cho đường đọc để bảo toàn tính sẵn sàng.
- Nguồn: RED + BLUE.

---

## 🟡 THẤP (3) — 2 mục phần lớn by-design

### L1 — `createFolder` bỏ qua folder-scope trên parent (ghi vượt phạm vi)
- **File:** `src/lib/review/folders.ts:210`
- **Vấn đề:** `createFolder`/`createFolderTree` nhận `parentId` client, chỉ `requireReviewAccess`, **không** assert scope trên parent (khác nhánh folder của `initiateUpload`). Editor có thể tạo folder con dưới bất kỳ folder nào (kể cả subtree editor khác), làm sai `itemCount`. Tác động thấp: chỉ thêm folder, không đọc/sửa asset người khác.
- **Đề xuất:** Thêm `assertFolderPathMutable`/`getFolderScope` trên `parentId`, nhất quán với `initiateUpload`.

### L2 — Guest request_changes ép task non-terminal về 'Revision' + xóa deadline (chủ đích lịch sử)
- **File:** `src/lib/review/task-sync.ts:118`
- **Vấn đề:** Predecessor guard chỉ áp khi target là key của `STATUS_TRANSITIONS`; target legacy `'Revision'` nằm ngoài → "flip from anywhere", và `'Revision' ∈ STATUS_REQUIRES_NULL_DEADLINE` nên xóa deadline. Guard terminal vẫn chặn Hoàn tất/Đã hủy. Guest giữ share sống ép task non-terminal về 'Revision' + xóa deadline theo dõi. RED-vòng2 và BLUE-vòng2 **hội tụ 'partially_valid'** — hành vi K6 giữ chủ đích cho legacy target; không rò tiền.
- **Đề xuất (nếu muốn siết):** Áp predecessor-guard cả cho target 'Revision'; cân nhắc không xóa deadline khi flip do guest.

### L3 — `request-pin` gửi PIN tới **email người khác** bằng sender agency (email bombing — đã giảm thiểu tốt)
- **File:** `src/app/api/r/[slug]/notifications/request-pin/route.ts:43`
- **Vấn đề:** Route nhận email lạ từ body; `isOwnEmail` chỉ chặn nhánh auto-subscribe, foreign email vẫn rơi xuống `requestGuestPin` gửi PIN 6 số qua Resend (domain agency) tới địa chỉ tùy ý. RED tự concede phần cường điệu; **3 lớp chặn** (cooldown 60s + burst 3/600s theo email+share + perIp 10/ngày) + `getClientIp` đã hardened (G1) → 1 attacker đơn lẻ bị khóa 10/ngày, trần dội ~432 mail/ngày cần botnet IP thật. Real nhưng well-mitigated.
- **Đề xuất:** Buộc `email === sessionEmail`, hoặc cap toàn cục theo email đích qua mọi IP.

---

## Trạng thái 21 phát hiện của audit tĩnh trước (commit `4f5969c`) — đã RE-VERIFY độc lập
Cả 4 High cũ **đã vá và giữ vững**: G1 (`getClientIp` trusted-header), E1/J1 (guard `isTerminalStatus` cho auto-event), P1 (moveItems advisory-lock + loại folder lồng), B1 (view-url phục vụ preview watermark, không master). Các Medium/Low chính (M1/R2 settle clientReview, R1 predecessor, Q1 status email) cũng còn nguyên. **Đợt này tìm được lớp lỗi MỚI** mà audit tĩnh bỏ sót (H1/H2/H3 + M1-R5-nhánh-CHANGES + M2/M3/M4) — chủ yếu ở **mô hình quyền của khách** và **coupling FSM-tắt ↔ payroll**, là thứ chỉ lộ khi truy vết end-to-end + tấn công đối kháng.

## Ưu tiên đề xuất (nếu duyệt sửa)
(a) H1+H2: cờ `allowDecisions` + buộc xác thực client cho quyết định; (b) H3: chốt cứng admin-only cho status terminal/salary độc lập FSM; (c) M1: mở rộng revoke sang nhánh 'CHANGES'. Các mục còn lại theo mức độ.

---

## ✅ ĐÃ VÁ (2026-07-14) — H1 + H2 + H3, có kiểm chứng đối kháng 4 vòng

Chủ dự án duyệt: **H1+H2 = Phương án A** (chỉ share admin-gửi mới cho duyệt + bắt xác minh email PIN); **H3 = chỉ admin mới Hoàn tất/Hủy/mở-lại** (editor giữ Bắt đầu/Nộp bài). Bổ sung yêu cầu: **1 link cho tối đa 3 người tự thêm email, cả 3 duyệt + comment**.

**H1 — CLOSED.** `submitGuestDecision` chỉ nhận quyết định khi `asset.taskId` có + `Task.clientReview != null` (admin đã gửi qua F10). Không có đường guest tự bật field này. ([share-decision.ts](src/lib/review/share-decision.ts))

**H3 — CLOSED (13 hướng tấn công thất bại, 0 hồi quy).** Chốt cứng trong `updateTaskStatus` **độc lập FSM**: non-admin không set được status terminal (`Hoàn tất`/`Đã hủy`) và không mở lại task đã đóng; editor giữ start/submit/confirm-fix. ([task-actions.ts:84](src/actions/task-actions.ts)) confirmTaskHoanTat/setAssetStatus/F9/F10/Inngest đều không vượt được.

**H2 — CLOSED sau khi vá GỐC.** Re-check phát hiện gốc rễ: `verifyGuestPin` từng đóng dấu `emailVerifiedAt` mà **không kiểm email vừa xác minh có đúng là email của phiên**. Đã sửa:
- **Ràng buộc email↔phiên:** chỉ stamp `emailVerifiedAt` khi `normEmail(guest.email) === email` đã qua PIN ([guest-subscribe.ts:175](src/lib/review/guest-subscribe.ts)). Cổng quyết định chỉ tin dấu này + loại email tổng hợp `@review.invalid`. → không thể ký duyệt dưới email mình không kiểm soát.
- **Quy kết theo từng reviewer:** `signerName = guest.name` + `signerEmail = guest.email` (đã chứng minh) vào mọi audit row + Inngest; bỏ gộp về một tên client.
- **Bỏ fallback theo chuỗi email** (lỗ do chính bản vá đầu tạo ra).

**Tính năng 3 reviewer/link — cap có khoá.** Tối đa `MAX_REVIEWERS_PER_SHARE = 3` email verified/link, đếm-lại **trong `$transaction` có `pg_advisory_xact_lock`** (đóng TOCTOU race), loại phiên synthetic khỏi phép đếm ([guest-subscribe.ts](src/lib/review/guest-subscribe.ts)). Người thứ 4 xác minh → 403 "maximum of 3 people". Mỗi người duyệt/comment dưới danh tính riêng.

**Kiểm chứng:** `tsc` + `next build` xanh sau mỗi vòng. **4 vòng re-check đối kháng** (RED + LOGIC + JUDGE độc lập): vòng 1 phát hiện 2 lỗ trong bản vá H2 đầu → sửa; vòng 2 phát hiện lỗ gốc (binding) → sửa; vòng 3 phát hiện TOCTOU cap → sửa; **vòng 4: verdict CLOSED, 0 hồi quy.**

**Residual (chấp nhận theo mô hình "khách tự thêm"):** ai cầm link + có một hộp thư thật bất kỳ đều nhận được 1 trong 3 suất reviewer; **tên hiển thị tự khai** nhưng **email luôn được chứng minh + ghi log**. Muốn chặt hơn: đổi sang admin nhập sẵn allowlist 3 email.

### ✅ 5 Medium + 3 Low — ĐÃ VÁ (2026-07-14), kiểm chứng đối kháng

Chủ dự án duyệt làm tiếp. Tất cả `tsc`+`build` xanh, code-only, không đổi schema. Qua **2 vòng phản biện** (RED+LOGIC+JUDGE): vòng 1 xác nhận 7/9 kín + 0 hồi quy, bắt 2 chỗ vá chưa tới (M1 portal re-mint, L3 email aliasing); vòng 2 sau khi sửa lại → **tất cả CLOSED, 0 hồi quy.**

- **M1 — CLOSED (vá 2 lần):** `revokeClientExposureOnNewVersion` thu hồi share + null `clientReview` cho cả `AWAITING` **và `CHANGES`**; **và** kéo task ra khỏi pha "khách" (A5/A6/A7 → A2 'Đã nộp video nội bộ') để portal khách **không tự tạo lại link `/r/`** trỏ bản chưa duyệt lại — buộc admin F10 duyệt lại mới tới khách. ([task-sync.ts](src/lib/review/task-sync.ts))
- **M2 — CLOSED:** ghi chú "yêu cầu sửa" khi comment bị đóng băng → nội bộ (không public); chặn cả sửa/xoá comment cũ khi đóng băng. ([share-decision.ts](src/lib/review/share-decision.ts) · [share-comments.ts](src/lib/review/share-comments.ts))
- **M3 — CLOSED:** `createShareLink` kiểm folder-scope (FR-03) cho editor; admin unrestricted, cầu F10 nguyên. ([shares.ts](src/lib/review/shares.ts))
- **M4 — CLOSED:** nhánh "yêu cầu sửa" lặp lại giờ báo staff (không double trên đường chính). ([share-decision.ts](src/lib/review/share-decision.ts))
- **M5 — CLOSED:** `/unlock` fail-**closed** khi limiter/DB lỗi; đường khác giữ fail-open. ([rate-limit-db.ts](src/lib/review/rate-limit-db.ts))
- **L1 — CLOSED:** `createFolder` kiểm scope khi có parent cụ thể; gốc workspace vẫn cho. ([folders.ts](src/lib/review/folders.ts))
- **L2 — CLOSED:** flip 'Revision' do khách kích giữ nguyên deadline (không xoá dấu trễ hạn). ([task-sync.ts](src/lib/review/task-sync.ts))
- **L3 — CLOSED (vá 2 lần):** trần 10 mã/ngày theo **inbox chuẩn hoá** (bỏ `+tag`, gộp gmail/googlemail + bỏ dấu chấm) — chống lách bằng subaddressing. ([request-pin/route.ts](src/app/api/r/[slug]/notifications/request-pin/route.ts))

**Toàn bộ audit (0 Critical / 3 High / 5 Medium / 3 Low) nay đã vá + kiểm chứng.** Chưa commit — chờ chủ dự án duyệt.

Files chạm (10, code-only, không đổi schema): task-actions.ts · share-decision.ts · guest-subscribe.ts · share-auth.ts · share-client.ts · errors.ts · GuestReviewApp.tsx · identity/route.ts · request-pin/route.ts · verify-pin/route.ts.

---

## Cập nhật 2026-07-15 — chủ dự án ĐƠN GIẢN HOÁ luồng duyệt của khách (đảo lại H1/H2)

Sau khi hiểu rằng 1 link dùng chung không thể phân biệt người duyệt khi họ dùng chung 1 thiết bị, chủ dự án quyết định: **(a) 1 email/1 người cho mỗi link** (không còn 3 người), và **(b) BỎ mã PIN khi duyệt** — "mạo danh không quan trọng". Duyệt nay là sign-off nhẹ: ai có link, nhập tên + email một lần (tự khai, không PIN) là **comment + duyệt/yêu-cầu-sửa** trực tiếp.

- **Bỏ cổng PIN ở `share-decision.ts`:** xoá guard `emailVerifiedAt`/`isSyntheticGuestEmail` (VERIFICATION_REQUIRED). **GIỮ gate 1** (chỉ duyệt được trên link admin đã gửi cho khách — `clientReview != null`). Người ký = tên + email tự khai.
- **`guest-subscribe.ts`:** `MAX_REVIEWERS_PER_SHARE 3 → 1` (nay chỉ còn giới hạn luồng đăng-ký-nhận-thông-báo FR-11; duyệt không dùng PIN nữa).
- **`GuestReviewApp.tsx`:** xoá `DecisionVerifyModal` + state `verifyFor`; `submitDecision` chỉ gọi modal tên+email (không PIN) rồi gửi — cùng đường với comment.
- **Tiền vẫn an toàn:** H3 (editor KHÔNG tự đưa task sang Hoàn tất — chỉ admin) **giữ nguyên**, nên bỏ PIN duyệt không gây thất thoát; rủi ro còn lại đúng như chủ dự án chấp nhận: "ai có link đều duyệt thay khách được".

`tsc` + `build` xanh. Vẫn code-only, không đổi schema. **KHÔNG tự thêm lại PIN duyệt** ở các phiên sau — nó bị bỏ có chủ đích.
