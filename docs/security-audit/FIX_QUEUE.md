# FIX_QUEUE.md — Thứ tự sửa cho phiên SAU (handoff)

> Audit read-only đã CATALOGUE, chưa sửa gì. File này là kế hoạch sửa: xếp theo mức độ → bán kính ảnh hưởng, ghi phụ thuộc. Mỗi mục trỏ ID trong `FINDINGS.md`.
> **Nhóm theo cụm để sửa 1 lần, tránh xung đột file.** (Cập nhật sau khi các lens sau bổ sung finding.)

## Ghi chú trùng lặp (cùng 1 lỗi, sửa 1 lần)
- **HT-003 ≡ HT-004** — cùng lỗ hổng impersonation chéo-tenant (2 agent khác nhau tìm ra). Một fix xử lý cả hai.
- **HT-011 ≡ HT-012** — cùng lỗi IDOR `deleteTemplate` PriceTemplate. Một fix.

---

## ĐỢT 0 — LÀM NGAY (1 dòng, chặn thảm hoạ dữ liệu)
1. **HT-001** `package.json:10` — bỏ `prisma db push --accept-data-loss` khỏi `postinstall` (chỉ giữ `prisma generate`). **Không phụ thuộc gì. Bán kính: toàn DB prod.** Sửa trước tiên.

## ĐỢT 1 — HIGH, đơn lẻ, bán kính lớn
2. **HT-008** `pricing-engine.ts:206` — code injection qua `new Function`. Bỏ `new Function`, thay bằng parser biểu thức an toàn (allowlist token thực sự) HOẶC bỏ tính năng "custom formula". Độc lập.
3. **HT-007** `task-management-actions.ts:99` — `updateTask` nhánh admin ghi `data` thô vào Prisma → dời task chéo-tenant + bơm payroll. Đưa whitelist/strip (workspaceId, profileId, value, wageVND, status, assigneeId…) RA NGOÀI nhánh `!isWorkspaceAdmin` để áp cho MỌI caller; hoặc build `data` bằng danh sách field cho phép. Độc lập.
4. **HT-005** `invoice-actions.ts:594` — `voidInvoice` TOCTOU hoàn cọc 2 lần. Bọc `pg_advisory_xact_lock` + idempotency (đánh dấu invoice đã void trong cùng transaction trước khi tăng ledger). Tiền — làm kỹ.
5. **HT-002** `auth-actions.ts:192` — rate-limit auth bị bypass qua `x-forwarded-for` giả. Dùng IP từ header nền tảng tin cậy (Vercel `x-real-ip`/`x-vercel-forwarded-for`) hoặc entry phải-nhất sau proxy tin cậy (đúng pattern đã sửa cho review G1). Cùng họ với các chỗ dùng `getRequestIp` khác.

## ĐỢT 2 — Cụm AUTH-SESSION (sửa CHUNG 1 batch — cùng đụng auth.ts + impersonation)
6. **HT-003/HT-004** `impersonation-actions.ts:31-44` — guard chống leo thang chỉ xét profile hiện tại; session impersonation là toàn cục → chiếm OWNER tenant khác. Thêm truy vấn từ chối nếu target giữ OWNER/ADMIN ProfileAccess ở profile KHÁC; HOẶC bó session impersonation theo profile gốc và verifyWorkspaceAccess từ chối phiên impersonation ngoài profile đó. **⚠ Cần quyết định thiết kế — xem OPEN_QUESTIONS.**
7. **HT-019** `auth.ts:85` — TTL phiên impersonation thực là 1 tuần thay vì 2 giờ. Ký JWT impersonation với exp riêng 2h (hoặc lưu startedAt + kiểm ở verify).
8. **HT-018** `auth.ts:51` — logout không thu hồi token (sessionVersion không bump). Cho logout bump `User.sessionVersion` + để getSession/getCurrentUser kiểm sessionVersion (hiện chỉ DAL kiểm). **⚠ Đã từng phân tích ở [[invite-flow-audit-converged]] — dùng isSessionLive nhất quán.**

## ĐỢT 3 — Cụm DUYỆT/PAYROLL (sửa CHUNG — cùng đụng status máy trạng thái)
9. **HT-006** `share-portal-actions.ts:499` — portal token đặt 'Hoàn tất'=tính lương. **⚠ Cần quyết định: khách duyệt = hoàn tất luôn hay chờ admin? — OPEN_QUESTIONS.** tôi đồng ý khách duyệt = hoàn tất
10. **HT-014** `share-portal-actions.ts:489` — portal approve/request-changes bỏ qua cổng client-facing-phase mà read path enforce. đồng ý
11. **HT-016** `task-actions.ts:84` — editor tự set Task.status sang '(khách)' A5, tự phát hành bản chưa duyệt. (Cùng máy trạng thái với H3 đã làm — mở rộng chặn.) được tôi đồng ý

## ĐỢT 3.5 — Cụm mcp-server (bề mặt GHI THỨ HAI vào prod DB — sửa CHUNG 1 lớp guard)
> Tất cả các mục MCP High đều CÙNG GỐC: `mcp-server/` tái hiện mutation task nhưng KHÔNG sao chép lớp guard của web. **Fix đúng = một lớp guard dùng chung** (helper) trong mcp-server, gọi ở mọi write-tool, thay vì vá lẻ từng hàm.
- **HT-036** `mcp-server/src/services/assign-service.ts` — assign/bulk_assign/claim nhận `assigneeId`/`userId` KHÔNG kiểm là WorkspaceMember → giao/claim chéo-tenant. Thêm check membership.
- **HT-041** `mcp-server/src/services/task-service.ts` (create_task) — `clientId` không validate thuộc workspace → gắn task vào client tenant khác. Validate clientId∈workspace.
- **HT-040** `mcp-server/src/services/status-service.ts` — mọi mutation MCP không ghi AuditLog. Thêm `audit()` trong cùng transaction (actorUserId = MCP service identity). *(gồm P5-003)*
- **[Low] P5-002** `task-service.ts:242` — thêm PAID-payroll lock (mirror web `update-task-details.ts:68-89`) trước khi ghi đè jobPriceUSD/value/profitVND.
- **[Low] P6-SWEEP-1** `assign-service.ts:37` — thêm guard rank-D red-card (mirror `task-management-actions.ts:154`).
- **[Low] P6-SWEEP-2** — thêm `where {version}` optimistic-lock cho update_status/assign/details.
- *(Ngữ cảnh: MCP chạy service-account cấp profile = admin. Các Low ở đây là parity/defense-in-depth; các High là cross-tenant thật do MCP thiếu WorkspaceMember-check.)*

## ĐỢT 5 — Low/hạ-tầng độc lập (không chặn, làm khi tiện)
- **HT-039** `mcp-server` postgres TLS `rejectUnauthorized:false` — bật xác thực cert.
- **HT-042** `download-zip` zip-slip — chuẩn hoá path, chặn `..`.
- **HT-037/HT-038** electron IPC `env:get`/`env:set` — thu hẹp bề mặt IPC (window tải bundle local nên rủi ro thấp; cần chuỗi XSS mới khai thác).
- **P5-004** electron-store encryptionKey — chuyển sang OS keychain (`safeStorage`) nếu muốn secret thật.
- **P5-005** thêm `INNGEST_SIGNING_KEY` vào `env.ts` + chặn `INNGEST_DEV` ở prod (fail-closed).

## ĐỢT 4 — MEDIUM còn lại (độc lập, bán kính nhỏ hơn)
12. **HT-011/HT-012** `price-template-actions.ts:68-72` — IDOR xoá PriceTemplate chéo-tenant. Re-check workspaceId trên id trước khi delete.
13. **HT-013** `profile-actions.ts:198` — updateProfile đổi email tuỳ ý không OTP. Bỏ field email khỏi updateProfile (đã có luồng email-migration OTP) hoặc validate + set emailVerified=false.
14. **HT-020** `review/comments.ts:559` — presign chấp nhận `image/svg+xml`. Bỏ SVG khỏi allowlist ảnh (hoặc phục vụ attachment với `Content-Disposition: attachment` + `Content-Security-Policy: sandbox`).
15. **HT-021** `review/share-auth.ts:231` — auto-identity known-client cho người cầm link ký duyệt dưới tên khách. (Liên quan quyết định "bỏ PIN duyệt" đã chốt phiên này — cân nhắc lại phạm vi.)
16. **HT-015** `share-portal-actions.ts:341` — requestPortalNotifyEmail email-bombing. Thêm cap per-inbox (canonical email) + rate-limit bền (DB) như đã làm cho /r request-pin.
17. **HT-017** `scan-folder/route.ts:55` — thiếu rate-limit endpoint đắt 300s. Thêm limitDb per-user/workspace.
18. **HT-009** `bonus-actions.ts:366` — calculateMonthlyBonus TOCTOU trên PayrollLock. Đưa check+write vào 1 transaction + advisory lock.
19. **HT-010** `password-reset-actions.ts:115` — account enumeration qua message cooldown. Trả thông điệp trung tính đồng nhất.

---

## Phụ thuộc tổng hợp
- Đợt 2 (HT-003/004, HT-018, HT-019) phải sửa **cùng nhau** — cùng đụng `src/lib/auth.ts` + impersonation; sửa lẻ dễ xung đột.
- Đợt 3 (HT-006, HT-014, HT-016) phải sửa **cùng nhau** — cùng máy trạng thái task/duyệt; cần chốt OPEN_QUESTIONS trước.
- HT-002 dùng lại đúng pattern trusted-proxy IP đã có ở review rate-limit — tái sử dụng, đừng viết mới.
- **Tất cả** phải chạy `tsc + build` + regression payroll snapshot sau khi sửa (đụng tiền/lương ở nhiều mục).
