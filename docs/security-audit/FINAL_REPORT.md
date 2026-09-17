# FINAL_REPORT.md — Báo cáo tổng kết Audit Bảo mật (Read-only, Detect-only)

> **Kho:** agency_manager (HustlyTasker / Velox) · **Nhánh:** `claude/cranky-austin` · **Ngày:** 2026-07-15
> **Loại:** Audit phòng thủ, CHỈ-ĐỌC, CHỈ-PHÁT-HIỆN. **KHÔNG một dòng source/config/schema/dependency nào bị sửa.** Chỉ ghi 7 file artifact trong `docs/security-audit/`.
> **Trạng thái:** ✅ HOÀN TẤT — điều kiện thoát **G1–G5 đều đạt**.

---

## 1. Tóm tắt điều hành (Executive Summary)

Đã quét toàn bộ codebase (web app Next.js 16 + 251 server action + ~100 API route + 69 model Prisma + 169 file `src/lib` + `mcp-server/` + `electron/` + `website/`) qua **6 pass, 6 lăng kính (lens) khác nhau**, mỗi phát hiện được **một người kiểm định độc lập (verifier ≠ người tìm)** xác minh trước khi ghi nhận.

**Kết quả: 42 lỗ hổng CONFIRMED cần vá** — **0 Critical, 13 High, 29 Medium** — cùng ~60 mục Low/Info đã đưa vào BACKLOG. Không có lỗ hổng nào bị khai thác trong quá trình audit (chỉ đọc code, không chạy exploit).

**3 rủi ro lớn nhất cần xử lý trước:**
1. **HT-001** — `postinstall` chạy `prisma db push --accept-data-loss` mỗi lần cài đặt → nguy cơ **mất dữ liệu prod** (sửa 1 dòng, làm ngay).
2. **Cụm tiền/lương** — `voidInvoice` hoàn cọc 2 lần (HT-005/024/030), portal-token tự đặt trạng thái 'Hoàn tất'=tính lương (HT-006/014), `updateTask` nhánh admin ghi dữ liệu thô → dời task/bơm lương chéo-tenant (HT-007).
3. **Cụm phiên/đăng nhập** — impersonation chiếm tài khoản OWNER tenant khác (HT-003/004), logout không thu hồi token (HT-018), rate-limit đăng nhập bị vượt bằng header `x-forwarded-for` giả (HT-002).

**Điểm quan trọng:** không có secret nào bị lộ RA NGOÀI trong báo cáo này. HT-029 (file `.env` thật lọt vào artifact Electron: `DATABASE_URL` prod, `RESEND_API_KEY`, `CRON_SECRET`…) được ghi nhận là lỗ hổng nhưng **giá trị secret KHÔNG được sao chép**; khuyến nghị **xoay (rotate) toàn bộ secret đó** như việc làm ngay.

---

## 2. Phạm vi & phương pháp

| Hạng mục | Con số |
|---|---|
| Server Actions (mỗi hàm = 1 public POST endpoint) | 251 hàm / 54 file |
| API routes | ~100 file `route.ts` |
| Prisma models | 69 |
| `src/lib` | 169 file |
| Bề mặt phụ | `mcp-server/` (11 write-tool + read-surface), `electron/`, `website/`, Inngest/webhook |

**6 lăng kính (mỗi lần re-scan đổi góc nhìn để lộ lỗ khác nhau):**
- **L1 — Theo thành phần** (identity/workspace/task/money/CRM-portal/review/guest/cron): 24 agent + 16 lớp lỗ hổng.
- **L2 — Theo entry-point + gap** (trace authn→authz→validation từng endpoint): 12 agent.
- **L3 — Vai trò · Tenant · Trạng thái** (CLIENT/GUEST/MEMBER/LOCKED; IDOR chéo-tenant; race/TOCTOU/FSM).
- **L4 — Đóng khoảng trống** (mcp-server, electron, hạ tầng, SSTI email, zip-slip).
- **L5 — Lớp chưa test** (MCP↔web parity, Inngest/webhook-signature, SCA/rò secret client-bundle, ReDoS/prototype-pollution).
- **L6 — Bão hoà MCP** (liệt kê đầy đủ 11 write-tool + read-surface vs guard web).
- **+ 4 completeness/saturation critic** ở các pass để quyết định điểm dừng.

**Nguyên tắc chất lượng:** mọi finding C/H/M được triage bởi verifier độc lập; phát hiện sai bị loại (FALSE_POSITIVE) hoặc hạ cấp. Ví dụ đã loại: P2-001 (notification-forgery — helper không được client tham chiếu nên không dispatch được), P3-001 (payment-QR — đã vá ở audit trước), P5-001 (MCP payroll — web cũng không có guard đó, hướng thiệt hại còn ngược).

---

## 3. Chứng minh đạt GOAL (G1–G5)

**Xu hướng finding C/H/M MỚI (đã-xác-minh) mỗi pass:**

| Pass | Lens | High mới | Medium mới | Ghi chú |
|------|------|:---:|:---:|------|
| 1 | Component | 8 | 13 | HT-001..021 |
| 2 | EntryPoint+Gap | 1 | 6 | HT-022..028 |
| 3 | Role·Tenant·State | 3 | 4 | HT-029..035 |
| 4 | GapClosure (mcp/electron) | 1 | 6 | HT-036..042 |
| 5 | Untested-class | **0** | **0** | *(2 High thô → FALSE_POSITIVE/Low sau triage)* — **PASS SẠCH #1** |
| 6 | MCP-parity sweep + read | **0** | **0** | 11 tool + read-surface; chỉ 2 Low mới — **PASS SẠCH #2** |

Đường cong **21 → 7 → 7 → 7 → 0 → 0**: các High mới của 3 pass giữa di chuyển hoàn toàn ra **RÌA** (mcp-server, electron, hạ tầng); lõi web action-layer bão hoà từ Pass 3–4; hai pass cuối (lens khác nhau) không sinh finding C/H/M mới nào sau kiểm định độc lập.

- ✅ **G1** — 2 pass LIÊN TIẾP, LENS KHÁC NHAU (L5 untested-class + L6 MCP-parity) ra **0 Critical/High/Medium mới**.
- ✅ **G2** — mọi file/route/model + bề mặt phụ (mcp/electron/website/inngest) đã được ≥1 lens quét (COVERAGE LEDGER trong `AUDIT_STATE.md`); MCP write+read đã liệt kê đầy đủ; các class âm-tính (SQLi/secret-client-bundle/prototype-pollution/CSRF) đã đóng bằng bằng chứng.
- ✅ **G3** — mọi finding qua verifier ≠ người tìm (CONFIRMED / FALSE_POSITIVE / hạ cấp).
- ✅ **G4** — 42 CONFIRMED C/H/M có record đầy đủ trong `FINDINGS.md`.
- ✅ **G5** — Low/Info + FALSE_POSITIVE nằm trong `BACKLOG.md`.

---

## 4. 13 lỗ hổng HIGH (chi tiết đầy đủ trong FINDINGS.md)

| ID | Vị trí | Tóm tắt |
|----|--------|---------|
| **HT-001** | `package.json:10` | `postinstall` chạy `prisma db push --accept-data-loss` → nguy cơ mất dữ liệu prod |
| **HT-002** | `auth-actions.ts:192` | Rate-limit đăng nhập bị vượt bằng `x-forwarded-for` giả (brute-force) |
| **HT-003/004** | `impersonation-actions.ts:31` | Impersonation chiếm tài khoản OWNER/ADMIN tenant khác (leo thang chéo-tenant) |
| **HT-005** | `invoice-actions.ts:594` | `voidInvoice` TOCTOU → hoàn cọc/credit 2 lần |
| **HT-006** | `share-portal-actions.ts:499` | Portal-token đặt 'Hoàn tất' = kích hoạt tính lương chỉ bằng link khách |
| **HT-007** | `task-management-actions.ts:99` | `updateTask` nhánh admin ghi `data` thô → dời task + bơm payroll chéo-tenant |
| **HT-008** | `pricing-engine.ts:206` | Code injection qua `new Function` (custom pricing formula) |
| **HT-022** | `integration-actions.ts` | `getFrameAccount` trả credential thô (rò khoá tích hợp) |
| **HT-029** | `electron/…/.env` | File `.env` prod thật lọt vào artifact Electron phát tán (secret sống) |
| **HT-030** | `invoice-actions.ts` | `voidInvoice` customPrepaid → credit cọc ảo |
| **HT-031** | portal client | `productLink` `javascript:` → stored XSS trong portal khách |
| **HT-036** | `mcp-server/…assign` | MCP assign/bulk/claim không kiểm WorkspaceMember → giao task chéo-tenant |
| **HT-041** | `mcp-server/…create_task` | MCP create_task `clientId` không validate workspace → gắn client tenant khác |

29 Medium còn lại (HT-009..021 rải, HT-023..028, HT-032..035, HT-037..040, HT-042) — xem `FINDINGS.md`.

---

## 5. Các CHỦ ĐỀ (để sửa theo cụm, không vá lẻ)

1. **Tiền & lương (TOCTOU + cổng trạng thái):** HT-005/024/030 (voidInvoice double-refund), HT-006/014/016 (portal-token/editor tự đặt trạng thái tính lương), HT-009 (bonus TOCTOU), HT-032 (confirmPayment bypass PayrollLock). → Bọc `pg_advisory_xact_lock` + idempotency; đưa cổng client-facing-phase + admin-only-terminal vào MỌI đường ghi.
2. **Phiên & thu hồi token:** HT-018 (logout không bump sessionVersion), HT-019 (TTL impersonation 1 tuần thay vì 2h), HT-033 (bypass sessionVersion/LOCKED). → Dùng `isSessionLive` nhất quán (đã phân tích ở audit invite-flow trước).
3. **Cô lập chéo-tenant (IDOR/BOLA):** HT-003/004 (impersonation), HT-007 (updateTask), HT-011/012 (deleteTemplate), HT-027/028 (folder scope), HT-036/041 (MCP). → Re-check `workspaceId`/WorkspaceMember trên id trước mọi mutation.
4. **`mcp-server/` = đường GHI THỨ HAI vào prod DB:** thiếu lớp guard mà web có (WorkspaceMember, PAID-payroll lock, AuditLog, optimistic-version, ~~rank-D~~ — *rank-D đã VÔ HIỆU 2026-07-31: chủ dự án bỏ hẳn luật thẻ đỏ ở cả hai phía, đừng cắm lại*). → **Một lớp guard dùng chung** trong mcp-server (xem FIX_QUEUE Đợt 3.5). High = cross-tenant thật; các Low = parity/defense-in-depth (actor MCP = service-account admin).
5. **Rìa Electron/hạ tầng:** HT-029 (secret trong artifact — **rotate ngay**), HT-037/038 (IPC env), HT-039 (postgres TLS `rejectUnauthorized:false`), P5-004 (electron-store key). → Rủi ro cần AV:Local hoặc chuỗi XSS; thu hẹp bề mặt.
6. **Injection/XSS:** HT-008 (`new Function`), HT-020 (SVG presign), HT-031 (`javascript:` link), HT-035 (email template-literal). → Bỏ eval; loại SVG khỏi allowlist ảnh; sanitize scheme link; escape biến email.

---

## 6. Những gì đã xác nhận AN TOÀN (âm tính có bằng chứng)

- **SQL Injection:** 16 call-site `$queryRaw/$executeRaw` đều tham số hoá qua `Prisma.sql`/`Prisma.join`; **0** `queryRawUnsafe`. Không reachable.
- **Rò secret vào client-bundle:** chỉ `NEXT_PUBLIC_*` (công khai đúng ý định); không có secret server lọt bundle.
- **Prototype-pollution / mass-assign-JSON:** không có sink `deepMerge`/`Object.assign`/`__proto__` trong `src/actions` (đường raw-spread duy nhất = HT-007 đã báo).
- **CSRF Server Action:** không nới `serverActions.allowedOrigins` → giữ Origin-check mặc định của Next.
- **MCP read-surface:** mọi hàm đọc qua `validateWorkspaceAccess` (enforce `profileId` khớp); scoping read = write.
- **Payment-QR IDOR** (P3-001): đã vá ở audit trước (ghi theo session id, không tin userId client).

---

## 7. Việc cần làm (bàn giao — audit KHÔNG tự sửa)

1. **Thứ tự vá** đã xếp theo mức độ → bán kính trong **`FIX_QUEUE.md`** (Đợt 0 làm ngay → Đợt 5). Nhiều fix tái dùng pattern sẵn có (`pg_advisory_xact_lock`, trusted-proxy IP, `TASK_STATUS_META.terminal`).
2. **6 câu hỏi nghiệp vụ CHỜ CHỦ DỰ ÁN quyết** trong **`OPEN_QUESTIONS.md`** (vd: khách duyệt qua portal = hoàn tất-tính-lương luôn hay chờ admin? phạm vi impersonation? custom pricing formula có cần không?). Vài fix (HT-006/014/016, HT-003/004) phụ thuộc câu trả lời này.
3. **Rotate secret** đã lộ qua HT-029 (`DATABASE_URL` prod, `RESEND_API_KEY`, `CRON_SECRET`, token Supabase/Upstash) — không phụ thuộc lịch vá.
4. Sau khi sửa: chạy `tsc + build` + regression payroll-snapshot (nhiều mục đụng tiền/lương).

---

## 8. Xác nhận toàn vẹn

> **Trong suốt audit này KHÔNG có file source, config, schema, migration, hay dependency nào bị chỉnh sửa, refactor, xoá, hay tạo mới.** Chỉ có 7 file artifact trong `docs/security-audit/` được ghi: `AUDIT_STATE.md`, `ARCHITECTURE.md`, `FINDINGS.md`, `BACKLOG.md`, `FIX_QUEUE.md`, `OPEN_QUESTIONS.md`, `FINAL_REPORT.md`. Không chạy lệnh nào làm thay đổi repo, DB, hay cài đặt package.

*(Lưu ý riêng, không thuộc audit: working-tree hiện có 6 file sửa dở từ bản vá bug Task-5 range/annotation — `CommentItem`/`CommentsPanel`/`ReviewPlayerShell`/`VideoStage`/`GuestReviewApp`/`player-l10n` — có TỪ TRƯỚC khi audit bắt đầu; audit không đụng tới và không commit chúng.)*

---

### Bản đồ artifact
| File | Nội dung |
|------|----------|
| `FINAL_REPORT.md` | ← bạn đang đọc — tổng kết + chứng minh GOAL |
| `FINDINGS.md` | 42 record C/H/M đầy đủ (mã khai thác, đề xuất sửa, rủi ro khi sửa) |
| `FIX_QUEUE.md` | Thứ tự vá theo cụm + phụ thuộc |
| `BACKLOG.md` | Low/Info + FALSE_POSITIVE (âm tính có bằng chứng) |
| `OPEN_QUESTIONS.md` | 6 câu hỏi nghiệp vụ chờ chủ dự án |
| `ARCHITECTURE.md` | Bản đồ kiến trúc + trust boundary (D1–D8) + 60 risk |
| `AUDIT_STATE.md` | Nhật ký tiến độ / nguồn sự thật (lịch sử 6 pass) |
