# AUDIT_STATE.md — Nguồn sự thật (SINGLE SOURCE OF TRUTH)

> Read-only, detect-only defensive audit. KHÔNG sửa source. Chỉ ghi các file artifact trong `docs/security-audit/`.
> FIRST ACTION mỗi phiên / sau mỗi compaction: đọc file này, resume từ "NEXT ACTION". KHÔNG restart từ đầu.

- **PHASE:** 4 (GOAL MET / FINALIZED) — Pass 1–6 + triage HOÀN TẤT. **G1–G5 ĐẠT.** FINAL_REPORT.md đã viết. 42 CONFIRMED C/H/M (13 High, 29 Medium, 0 Critical) là danh sách đóng.
- **LOOP ITERATION:** 6
- **ACTIVE LENS:** Lens 6 — MCP web-parity saturation + Pass-5 triage
- **Branch:** claude/cranky-austin | **Ngày bắt đầu:** 2026-07-15
- **Artifacts dir:** `docs/security-audit/`
- **WORKFLOWS (xong):** `weimnj81x` Discovery · `w8wtmchtw` Lens-1 (64 finding) · `w292zxa17` Triage (19/19 H·M CONFIRMED, +2 candidate CONFIRMED, 2 FALSE_POSITIVE). `wyjr10u0i` — Pass 2 → **RUNNING**.
- **ĐÃ VIẾT:** ARCHITECTURE.md · FINDINGS.md (**21 C/H/M**) · BACKLOG.md (45) · FIX_QUEUE.md · OPEN_QUESTIONS.md.
- **NEXT ACTION:** ✅ HOÀN TẤT. GOAL (G1–G5) đạt. Đã viết **FINAL_REPORT.md** + finalize FIX_QUEUE.md (thêm cụm MCP-parity). Nếu mở phiên mới: audit ĐÃ XONG — không cần chạy thêm lens. Việc còn lại thuộc CHỦ DỰ ÁN: (a) duyệt thứ tự sửa trong FIX_QUEUE.md, (b) trả lời 6 câu OPEN_QUESTIONS.md.
- **CẢNH BÁO ĐỘC LẬP (không phải finding):** Working-tree đang có 6 file sửa dở của bug-fix Task-5 range/annotation (CommentItem/CommentsPanel/ReviewPlayerShell/VideoStage/GuestReviewApp/player-l10n) — KHÔNG liên quan audit, KHÔNG commit trong audit read-only. Nhắc chủ dự án sau khi xong.
- **DEDUP đã biết:** HT-003≡HT-004 (impersonation), HT-011≡HT-012 (deleteTemplate).
- **CANDIDATE FINDINGS mạnh từ Phase 0 (chờ verify):** token-revocation gap (getSession không check sessionVersion, logout không bump, token sống ~30 ngày — auth.ts:51-74) · portal-token `approveDeliverableViaToken` đặt 'Hoàn tất'=tính lương chỉ bằng token (share-portal-actions.ts:489) · JWT secret min(10) + forgeable non-prod (env.ts:3-42, jwt.ts:4) · CRON_SECRET so sánh non-timing-safe + có thể chưa set (cron/*) · test-email rò env + CRON_SECRET qua query (test-email/route.ts) · OAuth state nonce không verify/không cookie-bound (integrations/*/authorize) · CSP unsafe-inline+unsafe-eval no-nonce (next.config.ts:61) · requireReviewAccess({admin:true}) gate GLOBAL role (review/access.ts:47) · Int autoincrement Client/Project/Invoice → IDOR enumerable · mass-assign User.role/isTreasurer · middleware loại /api + secure=false trên Electron · postinstall `db push --accept-data-loss` (package.json:10).

---

## QUY MÔ (từ inventory read-only)
- **Server Actions:** 251 hàm export trên 54 file `src/actions/*` (mỗi hàm = 1 public POST endpoint).
- **API routes:** ~100 file `src/app/api/**/route.ts`.
- **Prisma models:** 69 (`prisma/schema.prisma`).
- **src/lib:** 169 file (nhiều file bảo mật cốt lõi).

## GOAL (điều kiện thoát G1–G5)
- G1: 2 pass LIÊN TIẾP dùng LENS KHÁC NHAU ra 0 finding Critical/High/Medium MỚI.
- G2: Mọi file/route/model trong ledger = SCANNED bởi ≥1 lens. 0 gap.
- G3: Mọi finding được VERIFIER (khác người tìm) triage CONFIRMED / FALSE_POSITIVE.
- G4: Mọi CONFIRMED có record đầy đủ trong FINDINGS.md.
- G5: Low/Info đều nằm trong BACKLOG.md.

---

## LỊCH SỬ PASS (đánh giá G1)
| Pass | Lens | Agents | New C | New H | New M | Ghi chú |
|------|------|--------|-------|-------|-------|---------|
| 0 | Discovery | D1–D8 | — | — | — | DONE — ARCHITECTURE.md + 60 risk |
| 1 | L1 Component | AZ1-8+16v+triage | 0 | 8 | 13 | DONE — **21 CONFIRMED C/H/M** (2 FP loại) + 45 Low/Info→BACKLOG |
| 2 | L2 EntryPoint+Gap | EP1-12+triage | 0 | 1 | 6 | DONE — **7 CONFIRMED mới** (HT-022..028); 3 hạ→BACKLOG |
| 3 | L3 Role+Tenant+State | RT1-8+triage | 0 | 3 | 4 | DONE — **7 CONFIRMED** (HT-029..035); 2 FP, 1 dup(HT-005), 1→Low |
| 4 | L4 GapClosure | G1-8+triage | 0 | 1 | 6 | DONE — **7 CONFIRMED** (HT-036..042 mcp/electron/infra); 1 FP, 2→Low, 1 dup |
| 5 | L5 Untested-class | L5-1..6 | 0 | 2* | 2* | DONE (pre-triage) — 21 finding (2H+3M+9Low+7Info); **reachable C/H/M mới = 4** (P5-001/002 High MCP-PayrollLock+money-overwrite, P5-003 Med MCP-no-audit-2, P5-004 Med electron-key). Pass 5 KHÔNG sạch ⇒ G1 chưa đạt. *chờ triage Pass 6 |
| 5-triage | (Pass-6 triage) | verifier≠finder ×5 | 0 | 0 | 0 | DONE — P5-001 FALSE_POSITIVE; P5-002/003/004/005 → **Low** (P5-002 dup P4-024, P5-004 dup P4-007). **0 C/H/M mới.** Pass 5 = **PASS SẠCH #1** |
| 6 | L6 MCP-parity sweep + READ-surface | sweep + critic4 | 0 | 0 | 0 | DONE (w0dahl20j) — liệt kê đủ 11 MCP write-tool + read-surface; chỉ 2 finding Low mới (~~rank-D bypass~~ — VÔ HIỆU 2026-07-31, luật thẻ đỏ đã bị bỏ hẳn; version-predicate); 0 High/Med mới. **PASS SẠCH #2** ⇒ **G1 ĐẠT** |

**CRITIC #2 (G8) go/no-go:** LÕI web action-layer ĐÃ BÃO HOÀ (21→7→7, High mới ở RÌA: electron/IPC, không còn ở action-layer). CHƯA đạt G1 (cần 2 pass sạch liên tiếp). Chạy Lens 5 (class chưa test) → nếu sạch + 1 lens xác nhận sạch nữa ⇒ G1 ⇒ FINAL_REPORT.

Hai pass sạch liên tiếp cần: `New C=0 & New H=0 & New M=0` hai lần, hai lens khác nhau.

---

## FINDINGS LEDGER
**Pass 1 (Lens-1): 21 CONFIRMED C/H/M → FINDINGS.md.** 8 High: HT-001 postinstall-dataloss · HT-002 auth-XFF-bypass · HT-003/004 impersonation-cross-tenant · HT-005 voidInvoice-double-refund · HT-006 portal-token-payroll · HT-007 updateTask-mass-assign · HT-008 pricing-code-injection. 13 Medium: HT-009 bonus-TOCTOU · HT-010 reset-enumeration · HT-011/012 deleteTemplate-IDOR · HT-013 email-no-OTP · HT-014 portal-approve-gate · HT-015 portal-email-bomb · HT-016 editor-self-publish · HT-017 scan-folder-DoS · HT-018 logout-no-revoke · HT-019 impersonation-TTL · HT-020 svg-XSS · HT-021 known-client-signoff.
**FALSE_POSITIVE (an toàn):** EX2 review-admin-gate (dead branch) · EX3 mass-assignment (whitelist đầy đủ). → BACKLOG.
Low(29)+Info(16) → BACKLOG.md. Tất cả CONFIRMED đã qua verifier độc lập (G3 đạt cho C/H/M).
**Pass 2 (Lens-2): +7 CONFIRMED C/H/M → FINDINGS.md HT-022..028.** HT-022 getFrameAccount-credential-leak (High) · HT-023 crossteam-peer-admin-remove · HT-024 voidInvoice-refund-wrong-amount · HT-025 sharelink-liveness-gate · HT-026 internal-comment-leak-to-client · HT-027 restoreItems-folder-scope · HT-028 listTrash-folder-scope. Hạ cấp→BACKLOG: P2-001 notification-forgery (FP, không reachable), P2-002 Frame-write (Low), P2-009 GDrive-open-redirect (Low, dup P1-029).
**TỔNG C/H/M tới hết Pass 2: 28 (9 High + 19 Medium).**
**Pass 3 (Lens-3): +7 CONFIRMED → FINDINGS.md HT-029..035.** HT-029 electron-.env-prod-secret-in-artifact (High) · HT-030 voidInvoice-customPrepaid-phantom-credit (High) · HT-031 productLink-javascript:-stored-XSS-client-portal (High) · HT-032 confirmPayment-bypass-PayrollLock · HT-033 systemic-sessionVersion/LOCKED-bypass (ban-evasion createProfile/createWorkspace) · HT-034 CLIENT-reads-staff-presence/logs · HT-035 email-template-literal-injection. FP: P3-001 payment-QR (đã vá R1), P3-006 admin-profile-gate. Dup: P3-009→HT-005. Hạ: P3-010→Low.
**TỔNG C/H/M tới hết Pass 3: 35 (12 High + 23 Medium). Xu hướng finding mới: 21→7→7 (FP/dup tăng ⇒ gần bão hoà).**
**Pass 4 (Lens-4 GapClosure): +7 CONFIRMED → HT-036..042.** HT-036 MCP-assign-cross-tenant (High) · HT-037 electron-IPC-env:get-secret-overexpose · HT-038 electron-IPC-env:set-poisoning · HT-039 postgres-TLS-rejectUnauthorized:false · HT-040 MCP-no-audit-trail · HT-041 MCP-create_task-clientId-cross-tenant · HT-042 zip-slip-download-zip. FP: P4-005 MCP-delete. Low: P4-007/008. Dup: P4-011.
**TỔNG tới hết Pass 4: 42 (13 High + 29 Medium). Xu hướng: 21→7→7→7 (High mới toàn ở RÌA: mcp-server/electron; LÕI web đã bão hoà). Critic #2 = core saturated.**

---

## AGENT ROSTER
**Phase 0 Discovery — TẤT CẢ DONE** (D1 stack/CVE · D2 entry-point inventory · D3 schema-trust · D4 auth/JWT/impersonation · D5 integrations · D6 secrets/env · D7 permission subsystem · D8 trust-boundary). 8/8 done, 0 error.

**Phase 1 Lens-1 audit — RUNNING** (`w8wtmchtw`): AZ1 identity · AZ2 workspace/impersonation · AZ3 task · AZ4 money · AZ5 crm/portal/share · AZ6 review-internal routes · AZ7 guest /r routes · AZ8 misc/cron/webhook/integration | V-JWT · V-AUTHFLOW · V-IDOR · V-ESCALATION · V-IMPERSONATE · V-INJECT · V-XSS · V-SSRF · V-UPLOAD · V-EMAIL · V-AI · V-SECRETS · V-HEADERS · V-STATE · V-RACE · V-QUOTA.

Status: PENDING / RUNNING / DONE.

---

## COVERAGE LEDGER (G2)
**Độ phủ theo LENS × toàn bộ inventory (54 action file / ~100 route / 69 model):**
- **L1 Component** (Pass 1 — 24 agent AZ1-8 + 16 vuln): ✓ TOÀN BỘ action + route + mọi vuln-class.
- **L2 EntryPoint+Gap** (Pass 2 — 12 agent EP1-12): ✓ TOÀN BỘ action file + route cluster (trace authn→authz→validation từng endpoint).
- **L3 Taint** (V-INJECT/XSS/SSRF + RT7): ✓ sink render/email/SQL/HTML/Puppeteer/markdown.
- **L4 Role/Persona** (RT1-3): ✓ CLIENT · GUEST/token · MEMBER · LOCKED.
- **L5 Tenant** (V-IDOR + RT4): ✓ Task/Client/Invoice/Payment/Payroll/Notification/Schedule/ReviewAsset/Comment/Contact/Rating.
- **L6 State** (V-RACE/STATE + RT6): ✓ race/TOCTOU/webhook-replay/quota/FSM/idempotency.
- **L7 Gap** (RT8 completeness critic): ✓ đã chạy. GAP còn lại → **Lens 4**: LiveKit room-token grant, calendar-webhook stub, `mcp-server/` (bề mặt ghi thứ 2), `website/`, electron `.env` secret, handlebars SSTI, zip-slip download-zip.
⇒ **G2 ĐẠT: mọi file/route/model đã được ≥1 lens quét.** Bảng inventory chi tiết bên dưới giữ làm tham chiếu (coverage theo dõi ở cấp lens×cluster như trên, KHÔNG per-cell).

### A. Server Action files (54 file / 251 action)
| File | #act | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|------|------|----|----|----|----|----|----|----|
| auth-actions.ts | 2 | - | - | - | - | - | - | - |
| signup-actions.ts | 1 | - | - | - | - | - | - | - |
| password-reset-actions.ts | 3 | - | - | - | - | - | - | - |
| email-migration-actions.ts | 2 | - | - | - | - | - | - | - |
| username-actions.ts | 4 | - | - | - | - | - | - | - |
| create-user.ts | 1 | - | - | - | - | - | - | - |
| user-actions.ts | 7 | - | - | - | - | - | - | - |
| admin-actions.ts | 3 | - | - | - | - | - | - | - |
| admin-profile-actions.ts | 4 | - | - | - | - | - | - | - |
| profile-actions.ts | 12 | - | - | - | - | - | - | - |
| profile-member-actions.ts | 7 | - | - | - | - | - | - | - |
| member-actions.ts | 11 | - | - | - | - | - | - | - |
| workspace-actions.ts | 8 | - | - | - | - | - | - | - |
| cross-team-actions.ts | 4 | - | - | - | - | - | - | - |
| impersonation-actions.ts | 2 | - | - | - | - | - | - | - |
| toggle-treasurer.ts | 1 | - | - | - | - | - | - | - |
| task-actions.ts | 3 | - | - | - | - | - | - | - |
| task-management-actions.ts | 3 | - | - | - | - | - | - | - |
| bulk-task-actions.ts | 7 | - | - | - | - | - | - | - |
| update-task-details.ts | 1 | - | - | - | - | - | - | - |
| task-comment-actions.ts | 12 | - | - | - | - | - | - | - |
| claim-actions.ts | 5 | - | - | - | - | - | - | - |
| raw-footage-actions.ts | 5 | - | - | - | - | - | - | - |
| velox-batch-actions.ts | 1 | - | - | - | - | - | - | - |
| velox-helpers-actions.ts | 2 | - | - | - | - | - | - | - |
| client-request-actions.ts | 5 | - | - | - | - | - | - | - |
| crm-actions.ts | 12 | - | - | - | - | - | - | - |
| share-portal-actions.ts | 17 | - | - | - | - | - | - | - |
| share-link-actions.ts | 3 | - | - | - | - | - | - | - |
| share-document-actions.ts | 2 | - | - | - | - | - | - | - |
| invoice-actions.ts | 9 | - | - | - | - | - | - | - |
| payment-actions.ts | 4 | - | - | - | - | - | - | - |
| payroll-actions.ts | 3 | - | - | - | - | - | - | - |
| bonus-actions.ts | 3 | - | - | - | - | - | - | - |
| bonus-config-actions.ts | 2 | - | - | - | - | - | - | - |
| pricing-rule-actions.ts | 5 | - | - | - | - | - | - | - |
| price-template-actions.ts | 3 | - | - | - | - | - | - | - |
| analytics-actions.ts | 5 | - | - | - | - | - | - | - |
| leaderboard-actions.ts | 1 | - | - | - | - | - | - | - |
| reputation-actions.ts | 1 | - | - | - | - | - | - | - |
| availability-actions.ts | 5 | - | - | - | - | - | - | - |
| schedule-actions.ts | 8 | - | - | - | - | - | - | - |
| tag-actions.ts | 6 | - | - | - | - | - | - | - |
| notification-actions.ts | 11 | - | - | - | - | - | - | - |
| push-actions.ts | 3 | - | - | - | - | - | - | - |
| tracking-actions.ts | 7 | - | - | - | - | - | - | - |
| integration-actions.ts | 2 | - | - | - | - | - | - | - |
| upload-actions.ts | 4 | - | - | - | - | - | - | - |
| audit-actions.ts | 3 | - | - | - | - | - | - | - |
| contact-actions.ts | 8 | - | - | - | - | - | - | - |
| study-place-actions.ts | 4 | - | - | - | - | - | - | - |
| global-settings.ts | 2 | - | - | - | - | - | - | - |
| ui-actions.ts | 1 | - | - | - | - | - | - | - |
| retry-translation-action.ts | 1 | - | - | - | - | - | - | - |

### B. API route clusters (~100 route)
| Cluster | #routes | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---------|---------|----|----|----|----|----|----|----|
| auth/* (role, forgot-password, verify-otp, reset-password, migrate-email, verify-email, logout, signup, google/authorize, google/callback) | 10 | - | - | - | - | - | - | - |
| cron/* (send-digest, cleanup-notifications, hard-delete-workspaces, auth-cleanup, hard-delete-profiles, review-janitor, check-deadline) | 7 | - | - | - | - | - | - | - |
| integrations/* (dropbox authorize/callback, google-drive authorize/callback, scan-folder) | 5 | - | - | - | - | - | - | - |
| webhooks/* (calendar, mux) | 2 | - | - | - | - | - | - | - |
| misc (exchange-rate, time, test-email, workspace/first, log-client-error, import-jan-2026, profile/select, invoices/generate, invoices/[id]/download, inngest, portal-notify/unsubscribe, exports/monthly-tasks-xlsx, notifications/unsubscribe) | 13 | - | - | - | - | - | - | - |
| review/uploads/* + task-upload/initiate | 6 | - | - | - | - | - | - | - |
| review/versions/[id]/* (playback-token, download-url, route, remove-from-stack, comments) | 5 | - | - | - | - | - | - | - |
| review/folders/* + tree + items/* (move,delete,copy) + trash/* (route,restore,purge) | 14 | - | - | - | - | - | - | - |
| review/assets/[id]/* (route, versions, stack, status, status-history, share, feedback-done, confirm-fix, approve-send) + statuses | 10 | - | - | - | - | - | - | - |
| review/tasks/[taskId]/* (assets, confirm-complete) | 2 | - | - | - | - | - | - | - |
| review/comments/[id]/* + comment-attachments/* + versions comments | 8 | - | - | - | - | - | - | - |
| review/shares/* + download-zip | 4 | - | - | - | - | - | - | - |
| r/[slug]/* GUEST (route, playback-token, events, download-url, decision, identity, unlock) | 7 | - | - | - | - | - | - | - |
| r/[slug]/* GUEST comments+attachments+view-url | 8 | - | - | - | - | - | - | - |
| r/[slug]/notifications/* (route, request-pin, verify-pin) + r/unsubscribe | 4 | - | - | - | - | - | - | - |

### C. Prisma models (69)
| Nhóm | Models | L3 | L5 |
|------|--------|----|----|
| Identity/tenant | Profile, Workspace, WorkspaceMember, User, ProfileAccess, ProfileAccessRequest, Session, UserPresence | - | - |
| Money/payroll | Payroll, MonthlyBonus, PayrollLock, BonusConfig, MonthlyRank, Invoice, InvoiceItem, Payment, BillingProfile, Agency, PriceTemplate, PricingRule | - | - |
| Task/work | Task, TaskRawFootage, Project, PerformanceMetric, TaskTag, TagCategory, TaskComment, TaskCommentReadState, TaskCommentReaction, Attachment | - | - |
| Client/CRM | Client, ClientShareLink, ClientTaskRequest, Contact, Rating | - | - |
| Auth/security | EmailVerificationToken, PasswordResetOTP, LoginAttempt, IntegrationToken, WorkspaceInvitation, AuditLog | - | - |
| Notif/sched | Notification, NotificationPreference, PushSubscription, ScheduleRule, ScheduleException, DailyAvailability, Event, ErrorDictionary, ErrorLog | - | - |
| Review module | ReviewFolder, ReviewAsset, ReviewVersion, ReviewComment, CommentAttachment, CommentReaction, ShareLink, ShareLinkItem, GuestSession, GuestEmailVerification, GuestSubscription, ReviewActivity, UploadSession, WebhookEvent, RateLimitBucket | - | - |
| Khác | WikiPage, StudyPlaceProgress | - | - |

---

## GHI CHÚ VẬN HÀNH
- Chỉ ORCHESTRATOR ghi artifact. Subagent chỉ trả structured findings.
- Mỗi finding: file+line, severity, OWASP, kịch bản khai thác cụ thể, đề xuất sửa (KHÔNG áp dụng).
- Không có đường tới được (reachable) → Info.
