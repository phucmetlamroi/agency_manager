# Phase D — Verify (dự án "Vòng đời lặp + Email", review-fixes)

Kiểm định trước khi merge `claude/cranky-austin` → `main` cho toàn bộ Phase A (email overhaul) + Phase B (UI khách → English) + Phase C (trang Settings email khách). Ngày 2026-07-08.

## 1. Cổng tự động (đều XANH)

| Cổng | Kết quả |
|---|---|
| `tsc --noEmit` | PASS (0 lỗi) |
| `next build --webpack` | PASS (exit 0, 2 route mới build) |
| `test:status-meta` (K1 — snapshot lương 14/10) | PASS |
| `test:portal-derive` (K3 — 0 rò nhãn VN sang khách) | PASS |
| `test:auto-transition` (FSM F7–F10) | PASS |
| **`test:portal-notify`** (harness mới, nhánh Neon TEST frosty-forest) | **38/38 PASS** |

`test:portal-notify` (mục 10 section) phủ: token-scope (token rỗng/sai/thu hồi/hết hạn → null), OTP hash + verify (sai/đúng/hết hạn + single-use), remove, unsubscribe (auth = unsub token), rate-limit request (5/giờ) + **verify cap (10 lần/15′)**, **fan-out theo name-path** (sub-brand + duplicate row + cách-ly + MERGED link), parse `clientId` stringified-Int.

## 2. Rà soát đối kháng (25 agent, 5 lens × 2 verifier)

10 finding thô → **4 sống sót** sau phản biện = **2 lỗi thật** (mỗi lỗi 2 lens bắt). Đã SỬA cả 2 + 1 hardening. Các finding còn lại REFUTED (OTP brute-force thổi phồng, emoji ngoài phạm vi/in-app, theme trang unsubscribe = cosmetic).

### Lỗi 1 — HIGH (đã sửa): fan-out email bỏ sót sub-brand + client trùng dòng
`guest-notify.ts` audience (2) khớp `ClientShareLink` bằng **đúng `task.clientId`**, nhưng email verify nằm trên link cha/seed. Task thuộc **sub-brand** hoặc **dòng Client trùng** (đang có thật trên prod — client-merge chưa chạy) → `task.clientId ≠ link.clientId` → query 0 dòng → **khách đã bật thông báo vẫn KHÔNG nhận email** (im lặng).
**Fix:** thêm hàm thuần `selectPortalNotifyLinks` giải theo **name-path scope** giống hệt `resolveShareToken` (seed + dòng trùng cùng name-path + sub-brand prefix; theo MERGED→survivor). Cùng profile → name-path khác nhau không bao giờ khớp ⇒ giữ cách-ly. Unit-test trong harness (mục 8).

### Lỗi 2 — MEDIUM (đã sửa): "Change email" bế tắc
`requestPortalNotifyEmail` không xoá `notifyEmail`/`verifiedAt`, nên sau khi Change→email mới, thẻ "Verified" cũ che luôn ô nhập mã → không xác nhận được email mới.
**Fix:** `PortalSettings.tsx` chạy state machine phía client — ô nhập mã do cờ trong-phiên `codeSentTo` điều khiển; email đã verify KHÔNG bị pending mồ côi che. Mở lại sau khi bỏ dở đổi → hiện email verify còn hiệu lực (không còn ô mã treo). Không đổi server.

### Hardening (thêm): giới hạn brute-force OTP
`verifyPortalNotifyEmail` thêm rate-limit 10 lần / 15′ per (shareLink, ip) — siết cửa sổ đoán mã 6 số ngoài giới hạn resolve chung.

## 3. Còn kiểm bằng tay (không script được — cần portal thật + gửi email thật)
- Mở portal khách → ⚙ Settings → điền email → nhận **PIN** trong hộp thư → Verify → chạy 1 vòng review để xác nhận email trạng thái về đúng hộp thư.
- Đổi email (Change) → nhận PIN mới → Verify → thẻ hiện email mới.
- Với 1 client có sub-brand: giao task sub-brand → xác nhận email cha vẫn nhận thông báo (Lỗi 1 đã vá).
