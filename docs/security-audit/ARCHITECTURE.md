# ARCHITECTURE.md — Bản đồ kiến trúc HustlyTasker (Phase 0 Discovery)

> Sinh từ swarm D1–D8 (read-only). Dùng để định hướng các lens audit. Tiếng Việt.

## ⚠️ RỦI RO TRỌNG ĐIỂM (feed cho các lens audit)

| # | Agent | Khu vực | Ghi chú | File |
|---|-------|---------|---------|------|
| 1 | D1 | postinstall phá dữ liệu | postinstall chạy `prisma db push --accept-data-loss` mỗi lần install — mất dữ liệu prod nếu DATABASE_URL trỏ prod trong CI/deploy. Lens ops/data-integrity phải xác minh biến môi trường lúc build. | package.json:10 |
| 2 | D1 | Node version không ghim | Runtime Node không pin ở cả 4 gói → dựng không nhất quán + có thể chạy Node dính CVE. | package.json (thiếu engines), không có .nvmrc |
| 3 | D1 | legacy-peer-deps che xung đột | legacy-peer-deps=true + overrides react-is/recharts có thể nuốt lệch phiên bản peer, giấu lỗ hổng transitive. | .npmrc:1 + package.json:138-144 overrides |
| 4 | D1 | Template injection | Truy vết Handlebars.compile — nếu template lấy từ input người dùng thì là SSTI/prototype-pollution. | package.json:88 handlebars 4.7.8 |
| 5 | D1 | XSS rich-text | Xác minh dompurify sanitize đúng phía (server có DOM?) mọi HTML từ TipTap trước khi lưu/hiển thị — bề mặt stored-XSS. | package.json:58-65 (tiptap) + :84 dompurify 3.4.10 |
| 6 | D1 | Zip-slip / path traversal | Tính năng bulk .zip download 'Tệp' — tên folder/asset do người dùng đặt có thể thoát thư mục khi nén/giải nén. | package.json:75 archiver 7, :86 exceljs 4.4, transitive yauzl/binary |
| 7 | D1 | Đa backend blob + presigned URL | Ba kho lưu trữ; kiểm scope/expiry presigned URL và rò rỉ credential; xác định đường thực dùng (R2 qua S3 SDK). | package.json:27-28 aws-s3, :71 @vercel/blob, :55 supabase |
| 8 | D1 | Đường cấp quyền song song LiveKit | livekit-server-sdk tự sinh JWT room token — lens authz phải soi việc cấp token có ràng buộc workspace/role không, tách biệt với jose auth chính. | package.json:92-93 livekit-server/client |
| 9 | D1 | Mux không có SDK | Tài liệu nói dùng Mux nhưng không có SDK → nếu gọi REST thô, kiểm việc verify chữ ký webhook Mux thủ công (rủi ro thiếu verify). | package.json (grep mux = rỗng) vs docs/review-module |
| 10 | D1 | Artifact desktop lồng source | Bản build đóng gói chứa nguyên cây source+node_modules; kiểm có bundle secret/.env vào artifact phân phối không. | electron/release/win-unpacked/resources/standalone/.../ |
| 11 | D1 | Gói deprecated / cần kiểm CVE online | @google/generative-ai đã bị deprecate; sharp/libvips, puppeteer+chromium, electron cần chạy npm audit khi có mạng (không fabricate CVE). | package.json:35 @google/generative-ai 0.24.1; :54 chromium 143; :107 sharp 0.34.5; electron 36 |
| 12 | D2 | Server Action = endpoint POST ẩn (mọi export trong file "use server") | Mọi hàm exported gọi được trực tiếp từ client kể cả tên getX/…Internal (notification-actions.ts:24,70,86 createNotificationInternal/Bulk/Broadcast). Lens authz phải kiểm TỪNG hàm có tự verify session+workspace+role hay không, không được giả định 'internal'. | toàn bộ src/actions/*.ts (251 hàm, 51 file) |
| 13 | D2 | Vùng khách chưa-auth token-based (portal + /r/[slug]) | approveDeliverableViaToken/requestChangesViaToken/createTaskViaToken/createSubClientViaToken + /r decision/identity cho khách GHI dữ liệu chỉ bằng token. Soi client-approval-forgery, auto-client-identity, mass-assignment, IDOR taskId, rate-limit. | src/actions/share-portal-actions.ts:489,533,684,960; src/app/api/r/[slug]/decision/route.ts; identity/route.ts |
| 14 | D2 | Đường tài chính / payroll / invoice | confirmPayment/revertPayment/recordPayment/voidInvoice + export XLSX + download invoice: soi authz treasurer, IDOR invoice, và rò rỉ jobPriceUSD/USD ra staff non-admin (marketplace claim-actions.ts đã từng rò). | src/actions/payroll-actions.ts, bonus-actions.ts, payment-actions.ts, invoice-actions.ts, pricing-rule-actions.ts; src/app/api/exports/monthly-tasks-xlsx/route.ts; src/app/api/invoices/[id]/download/route.ts |
| 15 | D2 | Leo thang quyền & impersonation & cross-team | startImpersonation, toggleTreasurer, grant/approve cross-team, changeRole/removeMember, transferOwnership: đường tấn công leo quyền OWNER/ADMIN/isTreasurer. Kiểm invariant CLIENT-never-internal. | src/actions/impersonation-actions.ts:9, toggle-treasurer.ts:7, cross-team-actions.ts, member-actions.ts:1054/1132, profile-member-actions.ts:306/376, admin-actions.ts:14, user-actions.ts:78 |
| 16 | D2 | Cron GET không xác thực + script import GET | Cron xoá cứng dùng GET — nếu thiếu CRON_SECRET/header check thì trigger được từ ngoài gây mất dữ liệu. import-jan-2026 và test-email là endpoint GET nguy hiểm cần xác nhận đã gỡ/khoá trên prod. | src/app/api/cron/hard-delete-profiles/hard-delete-workspaces/auth-cleanup/route.ts; src/app/api/import-jan-2026/route.ts; src/app/api/test-email/route.ts |
| 17 | D2 | Webhook chưa verify chữ ký & upload/zip path | Webhook Mux/Calendar phải verify signature; folder move/copy có rủi ro path-traversal (P1 audit trước); download-zip soi zip-slip + authz; inngest serve phải có signing key. | src/app/api/webhooks/mux/route.ts, webhooks/calendar/route.ts; src/app/api/review/items/move/copy/route.ts; src/app/api/review/download-zip/route.ts; src/app/api/inngest/route.ts |
| 18 | D2 | Hàm _-param nghi vô hiệu hoá nhưng có thể còn ghi DB | changeUserProfile/createFeedback/adminResetPassword/transferWorkspaceOwnership dùng tham số _-prefix trông như stub — xác nhận thực sự no-op hay vẫn còn side-effect ẩn. | src/actions/admin-profile-actions.ts:93, crm-actions.ts:169, user-actions.ts:423, workspace-actions.ts:175 |
| 19 | D3 | WorkspaceMember.role & WorkspaceInvitation.role là String thô (không enum) | DB không ép giá trị role hợp lệ; toàn bộ ranh giới OWNER/ADMIN/MEMBER/GUEST nằm ở tầng code. Lens authz phải verify mọi ghi vào WorkspaceMember/accept-invite: (a) validate role thuộc tập hợp lệ, (b) chặn tự-nâng-quyền, (c) verify caller là OWNER/ADMIN. | prisma/schema.prisma:114, :826, :845 |
| 20 | D3 | Mass-assignment trên User (role/isTreasurer/sessionVersion/profileId/clientId/googleId) | Super admin = role=ADMIN + isTreasurer. Mọi update-user/update-profile action nhận object phải whitelist trường; các trường này KHÔNG được đến từ input người dùng. | prisma/schema.prisma:141, :152, :170, :151, :178, :137 |
| 21 | D3 | Review-module dùng workspaceId dạng SCALAR STRING không-FK | Cô lập tenant của ReviewFolder/Asset/Version/Comment/ShareLink/ReviewActivity KHÔNG được DB đảm bảo (cố ý P0). Ràng buộc XOR/CHECK (folderId XOR assetId, author XOR guest) chỉ ở manual SQL p0_add_review_module.sql — cần xác nhận đã apply trên prod. | prisma/schema.prisma:1599-1609, :1898, :1796 |
| 22 | D3 | Token/OTP purpose-confusion & replay | PasswordResetOTP + EmailVerificationToken dùng chung purpose để phân luồng; comment cảnh báo BẮT BUỘC filter theo purpose. Lens phải grep mọi query đảm bảo có filter purpose + usedAt/consumedAt + invalidatedAt + expiresAt (chống confusion & replay). OTP không unique → phải lấy bản mới nhất còn hiệu lực. | prisma/schema.prisma:1297-1299, :1320-1321, :1300-1315, :1322-1340 |
| 23 | D3 | Cổng khách UNAUTHENTICATED: ClientShareLink & ShareLink toggles | canApprove/allowDownload/allowComments/passphraseHash (ClientShareLink) và password/revoked/expires/showAllVersions (ShareLink /r) là ranh giới quyền khách. Verify resolve-token luôn ép các toggle này server-side và revoked/expired trả 404 đồng nhất (không enumeration oracle). | prisma/schema.prisma:591-595, :600-605, :1872-1880 |
| 24 | D3 | IntegrationToken (OAuth cloud) mã hóa at-rest — không rò rỉ | accessToken/refreshToken AES-256-GCM. Verify: không serialize ra client, đọc token luôn ép userId==caller + đúng workspace scope, và INTEGRATION_TOKEN_SECRET được set. | prisma/schema.prisma:1369-1386 |
| 25 | D3 | Finance mass-assignment: Payroll.status/totalAmount, Invoice.status/snapshot, Payment.amount | Payment & Payroll ép ADMIN + workspace HOÀN TOÀN ở action layer (Payment không có FK). Verify ghi status=PAID / totalAmount / amount / billingSnapshot không đến từ input non-admin; nhớ jobPriceUSD leak discipline. | prisma/schema.prisma:315-318, :764-768, :800-816 |
| 26 | D3 | AuditLog append-only chưa được DB bảo đảm + cascade từ Workspace | REVOKE UPDATE/DELETE mới là kế hoạch Phase 2 (migration_audit_log_revoke.sql) — nếu chưa chạy, app role vẫn sửa/xóa được log. Thêm nữa workspace onDelete:Cascade xóa luôn audit log của workspace, mâu thuẫn tinh thần bất biến. | prisma/schema.prisma:852-855, :874 |
| 27 | D3 | ProfileAccess.grantedAt làm cutoff tầm nhìn workspace + khóa Int autoincrement (IDOR) | Ghi lùi grantedAt = ADMIN thấy thêm workspace cũ. Client/Project/Invoice dùng Int autoincrement → enumerable, IDOR dễ. Lens IDOR nên ưu tiên các endpoint nhận id số. | prisma/schema.prisma:275-278, :495, :677, :752 |
| 28 | D4 | Token revocation gap (getSession-only paths) | getSession() và getCurrentUser() không check sessionVersion; logout() không bump version, không có denylist. Token bị đánh cắp sống tới 30 ngày (sliding-window kéo dài vô hạn). Cần grep MỌI route/Server Action chỉ dùng getSession()/getCurrentUser() mà không đi qua verifyActiveSession/verifyWorkspaceAccess/isSessionLive — đó là nơi token đã thu hồi/tài khoản LOCKED vẫn hành động được. | src/lib/auth.ts:51-74, src/lib/auth-guard.ts:21-46, src/lib/security.ts:257-269 |
| 29 | D4 | JWT secret strength & non-prod forgeability | min(10) quá yếu cho HS256; placeholder source-controlled chỉ fail-closed ở production-runtime. Preview/dev/test hoặc build-phase có thể chạy trên secret công khai → forge JWT mọi role. Không có iss/aud để phân biệt loại token. | src/lib/env.ts:3-42, src/lib/jwt.ts:4-29 |
| 30 | D4 | Tàn dư super-admin (isSuperAdmin/isTreasurer) | verifyWorkspaceAccess đã bỏ bypass, nhưng getCurrentUser vẫn phơi isSuperAdmin = role==='ADMIN' và verifyActiveSession phơi isAdmin=isTreasurer. Bất kỳ caller nào còn tin hai cờ này sẽ tái lập bypass cross-tenant. Cần grep mọi consumer. | src/lib/auth-guard.ts:9,39; src/lib/security.ts:278 |
| 31 | D4 | Impersonation forensics & cookie standby | Mutation trong lúc impersonate ghi dưới danh tính target (JWT id=targetUser.id); audit chỉ log start/end. JWT admin gốc nằm full-hợp-lệ trong cookie admin_session suốt 2h. stopImpersonation khôi phục session với hạn hardcode 7 ngày (lệch 30). Impersonation JWT thiếu sessionVersion (coerce 0). | src/actions/impersonation-actions.ts:46-70, src/lib/auth.ts:76-138 |
| 32 | D4 | Middleware không phủ /api + secure tắt trên Electron | matcher loại /api → mỗi API route tự guard, dễ sót. sameSite=lax + không __Host- prefix + secure=false khi ELECTRON_DESKTOP là bề mặt CSRF/transport cần lens API/route soi riêng. | src/middleware.ts:9-16,88-90,154-170; src/lib/auth.ts:26,45 |
| 33 | D4 | workspace-guards no-op | ensureNotLastOwner/isLastOwner/ensureNotLastOwnerOnDemotion đều là no-op/false. Nếu còn caller nào dựa vào chúng để chặn 'gỡ OWNER cuối cùng' ở tầng workspace thì bảo vệ đó ĐÃ MẤT — chỉ còn ràng buộc ở ProfileAccess. Cần verify caller. | src/lib/workspace-guards.ts:26-40 |
| 34 | D5 | Webhook calendar không verify chữ ký | Endpoint POST không xác thực; hiện là stub (chỉ console.log, logic tạo ScheduleException đang TODO). Nếu nối dây phần TODO mà chưa thêm verify Google channel token / MS clientState thì bất kỳ ai cũng tạo được block lịch cho user tuỳ ý. Lens authz/webhook cần chặn trước khi tính năng bật. | src/app/api/webhooks/calendar/route.ts:8-46 |
| 35 | D5 | OAuth state nonce không được verify (không cookie-bound) | nonce sinh bằng randomBytes nhưng không lưu/so khớp; state chỉ là base64 (comment 'encrypted' sai). Chống CSRF duy nhất bằng session.user.id===state.userId. Lens authz cần đánh giá login-CSRF/replay khi liên kết Dropbox/GDrive. | src/app/api/integrations/dropbox/authorize/route.ts:22-28, google-drive/authorize/route.ts:22-27, */callback/route.ts |
| 36 | D5 | Translator OpenAI là dead code nhưng là surface prompt-injection/XSS nếu bật lại | translateTaskNote không có caller; nếu nối lại, task-note người dùng (HTML) đi thẳng vào system+user prompt gpt-4 và output HTML được yêu cầu giữ nguyên tag → prompt-injection và stored XSS nếu render không escape. Tên file/biến sai (GPT4_API_KEY, không phải Gemini). | src/lib/gemini-translator.ts:16-55, src/lib/error-translator.ts |
| 37 | D5 | Storage bucket public + upsert ghi đè, ContentType client khai | uploadPublicImage dùng upsert:true → key trùng ghi đè; cần kiểm filename ở upload-actions có gắn userId chống ghi đè chéo. R2 tin mimeType client khai (magic-byte chỉ check sau upload ở Inngest). Dùng SUPABASE_SERVICE_ROLE_KEY (bypass RLS). | src/lib/storage.ts:17-66, src/actions/upload-actions.ts:98,157,237,284, src/lib/review/upload-service.ts:230 |
| 38 | D5 | Puppeteer render dữ liệu người dùng + tải chromium pack runtime | page.setContent (không goto URL người dùng) nên không SSRF; Handlebars auto-escape. Nhưng paymentLink href không validate scheme (javascript: — tác động thấp), và Vercel tải remote chromium pack GitHub tại runtime (chuỗi cung ứng/độ sẵn sàng). Gate verifyFinanceAccess đã có. | src/lib/invoice-generator.ts:205-227,272 |
| 39 | D5 | request-pin gửi email tới địa chỉ tuỳ ý trước verify (lạm dụng gửi thư) | Double-opt-in đúng, nhưng bước request-pin gửi OTP tới email body-supplied → cần rate-limit/anti-abuse để không thành công cụ spam qua domain hustlytasker. | src/lib/review/guest-subscribe.ts, src/lib/email.ts:26-51 |
| 40 | D6 | CSP quá lỏng (unsafe-inline + unsafe-eval, không nonce) | Lens XSS/frontend phải kiểm: mọi điểm render HTML/dangerouslySetInnerHTML (email-templates, rich-text task note, review comments) đều mất lớp phòng thủ CSP. Cân nhắc nonce-based CSP. | next.config.ts:61-62 |
| 41 | D6 | Endpoint diagnostic còn sót rò env | Rò prefix RESEND_API_KEY + trạng thái JWT/ADMIN_EMAIL; nhận CRON_SECRET qua query string (log leak) + so sánh non-constant-time. Lens auth/authz nên xác nhận có route diagnostic tương tự khác không. | src/app/api/test-email/route.ts:13-34 |
| 42 | D6 | So sánh CRON_SECRET không timing-safe | Dùng `key !== secret`. Lens cron/scheduled-task nên soi cả logic idempotency + việc CRON_SECRET có được set trên mọi môi trường. | src/app/api/cron/*/route.ts (review-janitor:26, send-digest, check-deadline, hard-delete-*, auth-cleanup, cleanup-notifications), test-email/route.ts:20 |
| 43 | D6 | JWT_SECRET placeholder + fail-closed chỉ ở production | Preview/staging chạy NODE_ENV!=='production' hoặc build-phase vẫn ký JWT bằng secret công khai. Lens deploy/topology xác nhận không môi trường nào phục vụ traffic thật với NODE_ENV khác production. min(10) quá yếu. | src/lib/env.ts:3,7,36-42; src/lib/jwt.ts:4 |
| 44 | D6 | Secret Supabase service-role + OAuth client secrets | Lens data-access nên kiểm service-role key có bị dùng ở đường đi tới client, và token OAuth mã hoá at-rest (token-encryption.ts) có được áp cho MỌI provider không. | src/lib/storage.ts:28,46; notification-broadcast.ts:9; google-auth.ts:54; integration-tokens.ts:59,63 |
| 45 | D6 | CSP wildcard + frame-src frame.io | connect/media/img mở nhiều host bên thứ ba; frame-src vẫn cho *.frame.io dù đang thay thế frame.io. Thiếu frame-ancestors. Lens SSRF/redirect nên đối chiếu allowlist host với danh sách tích hợp thực tế. | next.config.ts:61-62 |
| 46 | D7 | GuestSession synthetic-email sign-off (auto-identity) | Auto-identity known-client (createLinkClientGuestSession) mint GuestSession email .invalid với emailVerifiedAt đã set. Bất kỳ surface duyệt/sign-off nào đọc GuestSession mà KHÔNG kiểm isSyntheticGuestEmail() sẽ cho người lạ giữ slug approve DƯỚI TÊN client (lỗ H2). Cần grep mọi consumer của getGuestSession + emailVerifiedAt trong review sign-off/PIN flow. | src/lib/review/share-auth.ts:82-100,270-300; các API /api/r/* xử lý approval/sign-off |
| 47 | D7 | Hai hệ share-auth TÁCH BIỆT dễ lệch invariant | resolveShareToken (client-portal /share) và resolveShareGate (review /r) là hai codebase độc lập với model rate-limit, anti-enumeration, scope khác nhau. Rủi ro: fix bảo mật áp một bên quên bên kia. Cần đối chiếu song song mỗi khi chạm share. | src/lib/share-link-auth.ts; src/lib/review/share-auth.ts |
| 48 | D7 | getSession() trần bỏ qua sessionVersion — surface mới dễ sót isSessionLive | 24 action import getSession; chỉ profile-member-actions.ts + cross-team-actions.ts được vá isSessionLive. Action mới xác thực bằng getSession mà không có workspaceId để tới verifyWorkspaceAccess sẽ KHÔNG chặn LOCKED/revoked session. Cần audit từng action trong danh sách 24 file. | src/lib/auth.ts:73-84; src/lib/profile-permissions.ts:53-63; src/actions/*.ts (24 file dùng getSession) |
| 49 | D7 | Tàn dư isSuperAdmin / User.role==ADMIN | auth-guard.ts:47 vẫn set isSuperAdmin: role==='ADMIN' và verifyActiveSession trả isAdmin=isTreasurer — hai ngữ nghĩa 'admin' global còn tồn tại song song với model profile-scoped mới. Cần verify KHÔNG surface nào còn dùng isSuperAdmin/isAdmin(global) làm cửa authz workspace (đó chính là lớp lỗ R7/R8 đã vá ở security.ts). | src/lib/auth-guard.ts:47; src/lib/security.ts:236-244 |
| 50 | D7 | requireReviewAccess({admin:true}) gate trên GLOBAL role | Cờ admin:true của requireReviewAccess gate trên User.role global (access.ts:47-49) vừa under- vừa over-permit: global-ADMIN chỉ là MEMBER workspace vẫn qua; workspace OWNER role USER thì trượt. shares.ts:586 đã né bằng cách dùng access.isAdmin (workspace-scoped) thay vì admin:true. Cần grep MỌI callsite dùng admin:true để chắc không còn chỗ nào gate authz thực bằng nó. | src/lib/review/access.ts:47-49; src/lib/review/shares.ts:577-592 |
| 51 | D7 | IP spoofing trong rate-limit + audit share-portal | getRequestIp lấy x-forwarded-for[0] không giới hạn trusted proxy — attacker có thể spoof để né rate-limit per-ip của resolveShareToken/OTP và làm nhiễu provenance audit (actorUserId:null chỉ còn IP để truy vết). Đây là điểm G1 XFF trong audit cũ. | src/lib/share-link-auth.ts:60-72,99; src/actions/share-portal-actions.ts:328-330,516-521 |
| 52 | D7 | WorkspaceMember.role là String tự do, không enum DB | Cột role còn là String; isWorkspaceRole/hasAtLeastRole validate ở tầng TS runtime. Giá trị lạ trong DB (script/migration mint sai) chỉ bị bắt tại verifyWorkspaceAccess:143-146 (throw), nhưng canAccessWorkspace boolean-path (:139) chỉ check !!member không validate role value — lệch hành vi giữa 2 chokepoint. | src/lib/workspace-roles.ts; src/lib/security.ts:141-155; src/lib/profile-permissions.ts:135-141 |
| 53 | D7 | ADMIN grantedAt cutoff phụ thuộc workspace.createdAt | Profile ADMIN chỉ thấy workspace createdAt>=grantedAt; workspace cũ hơn cần WorkspaceMember row. Nếu createdAt bị sửa/seed sai, hoặc grantedAt reset khi re-grant, ranh giới quyền dịch chuyển thầm lặng. Cần soi mọi nơi ghi ProfileAccess.grantedAt và Workspace.createdAt. | src/lib/security.ts:108-110; src/lib/profile-permissions.ts:137 |
| 54 | D8 | Guest sign-off không xác minh danh tính coi như authoritative | Chủ dự án cố ý miễn PIN — name/email tự khai được ghi làm attribution audit/activity. Lens sau: có downstream (payroll/notify/feed) nào coi guest decision là danh tính client thật? Synthetic @review.invalid emailVerifiedAt có bao giờ được coi là verified cho sign-off không? | src/lib/review/share-decision.ts:144-152,213; src/lib/review/share-auth.ts:58-61,231-249 |
| 55 | D8 | Hai luồng duyệt song song → chỉ portal token đẩy task Hoàn tất (payroll) | approveDeliverableViaToken đặt status='Hoàn tất' CHỈ bằng token (không name/email), actorUserId:null trong audit → task complete = tính lương. review-module decision thì không complete task. Mâu thuẫn 'portal chỉ là VIEW' của review-fixes; probe tác động payroll + truy vết. | src/actions/share-portal-actions.ts:489-530 vs src/lib/review/share-decision.ts:121-266 |
| 56 | D8 | Calendar webhook không xác thực (hiện là stub) | Auth bị comment, xử lý TODO. Vô hại nay nhưng nếu hoàn thiện mà quên bật chữ ký → POST vô danh chèn ScheduleException/BLOCK vào lịch nhân sự. Chặn không cho 'sống dậy' thiếu auth. | src/app/api/webhooks/calendar/route.ts:12-40 |
| 57 | D8 | So sánh CRON_SECRET không hằng-thời-gian + thao tác phá huỷ sau cổng | Chỉ auth-cleanup dùng timingSafeEqual; các cron khác dùng key!==secret. hard-delete-* xoá cascade task/member/audit. Đồng nhất timingSafeEqual + xác nhận CRON_SECRET đủ mạnh/không rò trong log. | src/app/api/cron/hard-delete-workspaces/route.ts:37; check-deadline/route.ts:27; review-janitor/route.ts |
| 58 | D8 | Bề mặt 'thiếu cổng': middleware loại trừ toàn bộ /api và không kiểm membership | Mọi /api/* và mọi page tự phân quyền. verifyActiveSession không khoá workspace. Lens sau: đối chiếu từng /[workspaceId]/** page + /api/** handler xem có gọi verifyWorkspaceAccess/requireReviewAccess/verifyProfileAdminAccess đúng chưa — đặc biệt GET đọc dữ liệu nhạy cảm (jobPriceUSD, lương). | src/middleware.ts:9-16,88-100,168-170; src/lib/security.ts:38-165 |
| 59 | D8 | Thu hồi phiên & impersonation không enforce ở Edge | sessionVersion chỉ chặn ở DAL (verifyActiveSession/verifyWorkspaceAccess). Route nào phục vụ dữ liệu mà không đi qua 2 hàm này sẽ không tôn trọng force-logout/đổi mật khẩu. Impersonation TTL 2h chỉ giới hạn thời gian, không thu hồi tức thì. | src/middleware.ts:145-163; src/lib/security.ts:257-269; src/lib/auth.ts:76-138 |
| 60 | D8 | profile/select nhận sessionToken từ body làm fallback decrypt | Token vẫn kiểm chữ ký, nhưng là đường nạp session thay thế. Verify không thể tái dùng token cũ/khác ngữ cảnh; route chỉ kiểm ProfileAccess tồn tại, không lọc role tại đây (dựa middleware+DAL cho CLIENT). | src/app/api/profile/select/route.ts:19-56 |

_Tổng 60 rủi ro trọng điểm từ Phase 0._

---

## D1 — Kiểm kê Stack & Phụ thuộc (HustlyTasker / blazing-station)

## Phạm vi & nguồn

Đọc read-only 4 `package.json` + `package-lock.json` (lockfileVersion 3) + `.npmrc`. Repo là monorepo thủ công gồm 4 gói:
- **Root app** `blazing-station` v0.1.4 — Next.js app chính (`package.json:1-145`)
- **MCP server** `hustly-tasker-mcp` (`mcp-server/package.json`)
- **Electron desktop** `hustly-tasker-desktop` (`electron/package.json`)
- **Landing microsite** `hustlytasker-landing` (`website/package.json`)

Có thư mục `electron/release/win-unpacked/resources/standalone/.../` chứa **một bản build đóng gói lồng nguyên cây source + node_modules** — cần lens sau soi vì đây là bề mặt rò rỉ (có thể chứa `.env`, secret, source bên trong artifact desktop đã đóng gói).

## Runtime cốt lõi (phiên bản đã resolve từ lockfile)

| Gói | package.json | Đã resolve | Ghi chú |
|---|---|---|---|
| next | `16.1.6` | 16.1.6 | rất mới (Next 16). Build bằng `--webpack` (không Turbopack) — `package.json:8` |
| react / react-dom | `19.2.3` | 19.2.3 | React 19 |
| typescript | `^5` | — | |
| @prisma/client, prisma | `^5.22.0` | 5.22.0 | |
| @prisma/adapter-neon | `^5.22.0` | 5.22.0 | driver adapter Neon |
| @neondatabase/serverless | `^0.10.0` | 0.10.0 | |
| jose | `^6.1.3` | 6.1.3 | JWT HS256 — hiện hành, không CVE đã biết ở nhánh 6.x |
| bcryptjs | `^3.0.3` | 3.0.3 | hiện hành |
| ws | `^8.19.0` | 8.21.0 | > 8.17.1 nên đã vá CVE-2024-37890 (DoS) |
| zod | `^3.23.8` | 3.25.76 | |

Xác thực: `jose` (`^6`) + `bcryptjs` (`^3`) khớp mô tả stack (HS256 JWT + bcrypt). Cả hai bản đều mới → không phải điểm nóng CVE.

## Phụ thuộc nhạy cảm bảo mật (bề mặt cho các lens sau)

- **handlebars `4.7.8`** (`package.json:88`) + **@types/handlebars** — dùng render template (email?). Handlebars có lịch sử SSTI / prototype-pollution; 4.7.8 là bản đã vá, NHƯNG nếu compile template từ input người dùng thì vẫn là rủi ro SSTI thiết kế. → lens injection phải truy vết nơi `Handlebars.compile`.
- **dompurify `3.4.10`** (`package.json:84`) — sanitize HTML (chống XSS). 3.4.10 > 3.1.3 nên đã vá các mXSS cũ. Cần xác minh dùng ở **server-side** có DOM (jsdom) hợp lệ hay chạy client; TipTap (`@tiptap/*`) là nguồn rich-text → bề mặt stored-XSS.
- **@tiptap/* `^3.19-3.23`** — rich text editor, nguồn HTML người dùng nhập → cặp đôi với dompurify quyết định XSS.
- **archiver `7.0.1`** + **exceljs `4.4.0`** + **yauzl/binary** (transitive) — tạo/giải nén ZIP + XLSX (tính năng bulk `.zip` download của "Tệp"). Bề mặt **zip-slip / path traversal** khi tên file/thư mục do người dùng đặt. → lens path/file phải soi.
- **puppeteer-core `24.43.1`** + **@sparticuz/chromium `143.0.4`** (`package.json:54,101`) — render PDF headless Chromium. Bề mặt SSRF/nội dung động; nhị phân Chromium lớn.
- **sharp `0.34.5`** (`package.json:107`) — xử lý ảnh native (libvips). Bản mới; lịch sử có CVE libvips → "cần kiểm CVE" theo bản libvips đóng gói.
- **web-push `3.6.7`** — VAPID keys, gửi push. Quản khóa cần soi (secret handling).
- **livekit-server-sdk `2.15.4`** + **livekit-client `2.19.1`** — realtime AV; server SDK **tự sinh JWT access token** → thêm một đường cấp quyền song song với auth chính (jose). Lens authz phải soi việc grant room token.
- **botid `1.5.11`** (Vercel BotID) — chống bot; kiểm nơi enforce.
- **@upstash/ratelimit `2.0.8` + @upstash/redis `1.38.0`** — rate limit (đã thấy trong memory: G1 XFF rate-limit). Lens rate-limit soi cấu hình key theo IP/XFF.

## Lưu trữ đối tượng — BA backend cùng lúc

`@aws-sdk/client-s3` + `s3-request-presigner` (`^3.1079`), **@vercel/blob `2.0.1`**, **@supabase/supabase-js `2.105.3`** cùng có mặt. Ba kho blob khác nhau → cần xác minh đường nào thực dùng, presigned URL scope/expiry, và rò rỉ credential. Lưu ý: mô tả stack "Cloudflare R2 + S3 multipart" nhưng **không có SDK R2 riêng** (R2 dùng qua AWS S3 SDK là bình thường).

## Mâu thuẫn tài liệu vs. thực tế (cần lens sau lưu ý)

- Tài liệu dự án khẳng định stack video = **Mux**, nhưng **KHÔNG có `@mux/mux-node` hay bất kỳ SDK Mux nào** trong bất kỳ package.json (`grep mux` = rỗng). Hoặc gọi Mux qua REST thô, hoặc tính năng chưa nối. → lens tích hợp/секрет phải xác minh Mux webhook signature verify được làm thủ công (rủi ro thiếu verify chữ ký webhook).
- **@google/generative-ai `0.24.1`** (`package.json:35`) là gói **đã bị Google deprecate** (thay bằng `@google/genai`). Không lỗ hổng trực tiếp nhưng là tech-debt/không còn nhận vá.
- **openai `6.27.0`** — SDK mới.

## Scripts, engines, install hooks (điểm nóng vận hành)

- **`postinstall` NGUY HIỂM** — `package.json:10`:
  `"postinstall": "prisma generate && prisma db push --accept-data-loss"`
  Mỗi lần `npm install` (dev, CI, hoặc build server có `DATABASE_URL` trỏ prod) sẽ **tự đẩy schema với `--accept-data-loss`** → mất dữ liệu ngoài ý muốn. Đây là mâu thuẫn trực tiếp với quy tắc repo "chỉ THÊM model, dùng `db push`, DDL phá hủy chỉ sau khi main deploy READY". Rủi ro cao cho lens ops/data-integrity.
- **KHÔNG có trường `engines`/`node`** ở bất kỳ package.json nào; không có `.nvmrc`/`.node-version` ở gốc → phiên bản Node **không được ghim**. Rủi ro dựng không nhất quán + chạy trên Node có CVE.
- **`.npmrc`: `legacy-peer-deps=true`** — che xung đột peer-dependency → dễ nuốt lệch phiên bản (đặc biệt với `overrides` react-is/recharts ở `package.json:138-144`). Lens supply-chain lưu ý.
- Build desktop bật cờ `ELECTRON_DESKTOP=1` + electron 36 / electron-builder 26 / **electron-updater `^6.3.0`** — auto-update là bề mặt cập nhật (ký/nguồn update cần soi ở lens desktop).
- MCP server + electron dùng **`@types/node` khác nhau** (root `^20`, mcp/electron `^22`) → không nhất quán target runtime.
- Test scripts dùng `tsx` chạy trực tiếp (`test:invite-security`, `test:status-meta`, `test:portal-derive`...) — là harness bảo mật đã có sẵn, lens sau nên tận dụng.

## Không thể chạy `npm audit` (offline, read-only)

Không fabricate số CVE. Các mục "cần kiểm CVE" khi có mạng: `sharp/libvips`, `puppeteer-core`+`@sparticuz/chromium 143`, cây transitive của `archiver`/`exceljs`/`fstream`/`binary` (các gói unzip cũ hay dính zip-slip), `handlebars`, `electron 36`.

---

## D2 — Kiểm kê toàn bộ Entry Point: 102 API route.ts + 251 Server Action (51 file)

## Tổng quan

- **102 file** `src/app/api/**/route.ts` (bề mặt HTTP: auth, cron, webhook, review-module, portal khách `/r/[slug]`, integration OAuth, invoice, export).
- **251 hàm** `export async function` trong **51 file** `src/actions/*.ts`. **TẤT CẢ 51 file đều có directive `"use server"` ở đầu file** — nghĩa là mọi hàm exported đều là Server Action gọi được từ client (bề mặt tấn công RPC rộng, cần soi authz từng hàm).
- Bộ đếm khớp mốc đề bài: `grep -rE "export async function" src/actions/*.ts | wc -l` = **251**.

Lưu ý bảo mật xuyên suốt: file `"use server"` biến MỌI export thành endpoint POST ẩn. Kể cả các hàm tên `getX`/`createNotificationInternal`/`createBulkNotificationsInternal` (notification-actions.ts:24, 70) cũng gọi được trực tiếp từ trình duyệt nếu không tự guard — đây là điểm D-sau phải soi.

---

## PHẦN A — API Routes (`src/app/api/**/route.ts`)

### A1. Auth (`api/auth/*`) — không cần session
- `forgot-password/route.ts` **[POST]** — khởi tạo quên mật khẩu (gửi OTP/email).
- `google/authorize/route.ts` **[GET]** — bắt đầu OAuth Google (redirect).
- `google/callback/route.ts` **[GET]** — callback OAuth Google, tạo/đăng nhập.
- `logout/route.ts` **[GET]** — xoá cookie phiên. (GET gây side-effect → soi CSRF/logout-CSRF.)
- `migrate-email/route.ts` **[POST]** — đổi email tài khoản.
- `reset-password/route.ts` **[POST]** — đặt lại mật khẩu bằng token.
- `role/route.ts` **[GET]** — trả role hiện tại (rò rỉ thông tin?).
- `signup/route.ts` **[POST]** — đăng ký tài khoản.
- `verify-email/route.ts` **[GET,POST]** — xác thực email.
- `verify-otp/route.ts` **[POST]** — xác thực OTP.

### A2. Cron (`api/cron/*`) — tất cả **[GET]**, cần bảo vệ bằng secret/`CRON_SECRET`
- `auth-cleanup` — dọn token/phiên hết hạn.
- `check-deadline` — quét task quá hạn → notify.
- `cleanup-notifications` — xoá thông báo cũ.
- `hard-delete-profiles` — xoá cứng Profile trong thùng rác.
- `hard-delete-workspaces` — xoá cứng Workspace.
- `review-janitor` — dọn dữ liệu review-module (upload dở, share hết hạn).
- `send-digest` — gửi email digest định kỳ.
> D-sau: mọi route cron dùng GET → kiểm tra xác thực header (Vercel Cron / bearer) kẻo bị trigger xoá cứng từ ngoài.

### A3. Tiện ích / hệ thống
- `exchange-rate/route.ts` **[GET]** — tỷ giá.
- `time/route.ts` **[GET]** — giờ server (dùng cho đồng bộ playback).
- `exports/monthly-tasks-xlsx/route.ts` **[GET]** — xuất XLSX task theo tháng (rò rỉ tài chính nếu thiếu authz).
- `import-jan-2026/route.ts` **[GET]** — **script import dữ liệu một lần qua GET** (nguy hiểm, phải soi có bị bỏ quên trên prod không).
- `test-email/route.ts` **[GET]** — gửi email test (SSRF/spam nếu mở).
- `log-client-error/route.ts` **[POST]** — nhận log lỗi client (bơm rác/log injection).
- `inngest/route.ts` **[GET,POST,PUT]** — endpoint `serve()` của Inngest, host mọi hàm `review/*` (route.ts:11). Bảo vệ bằng signing key Inngest.
- `webhooks/calendar/route.ts` **[POST]** — webhook lịch.
- `webhooks/mux/route.ts` **[POST]** — webhook Mux (asset.ready...). Phải verify chữ ký Mux.
- `profile/select/route.ts` **[POST]** — chọn profile active (đặt cookie).
- `workspace/first/route.ts` **[GET]** — lấy workspace đầu tiên.

### A4. Integration / OAuth bên thứ ba
- `integrations/dropbox/authorize` **[GET]**, `dropbox/callback` **[GET]** — OAuth Dropbox.
- `integrations/google-drive/authorize` **[GET]**, `google-drive/callback` **[GET]** — OAuth Google Drive.
- `integrations/scan-folder/route.ts` **[POST]** — quét thư mục cloud (SSRF/path?).

### A5. Invoice
- `invoices/[id]/download/route.ts` **[GET]** — tải PDF hoá đơn (IDOR: kiểm tra chủ sở hữu invoice).
- `invoices/generate/route.ts` **[POST]** — sinh hoá đơn.

### A6. Unsubscribe (không session, dựa token)
- `notifications/unsubscribe` **[GET]**, `portal-notify/unsubscribe` **[POST,GET]**, `r/unsubscribe` **[POST,GET]** — huỷ đăng ký email theo token (soi token đoán được / brute-force).

### A7. Portal khách công khai `/r/[slug]` (guest review link) — bề mặt lớn nhất chưa-auth
- `r/[slug]/route.ts` **[GET]** — nạp dữ liệu share theo slug.
- `r/[slug]/unlock/route.ts` **[POST]** — mở khoá share bằng passphrase.
- `r/[slug]/identity/route.ts` **[POST]** — khách khai danh tính (memory ghi nhận rủi ro auto-client-identity / forgery).
- `r/[slug]/decision/route.ts` **[POST]** — khách duyệt/yêu-cầu-sửa (rủi ro client-approval-forgery — High trong audit trước).
- `r/[slug]/comments/route.ts` **[POST]**, `comments/[id]/route.ts` **[PATCH,DELETE]** — bình luận khách.
- `r/[slug]/comments/[id]/reactions/route.ts` **[POST]**, `reactions/[emoji]/route.ts` **[DELETE]** — reaction.
- `r/[slug]/comment-attachments/initiate` **[POST]**, `comment-attachments/[id]/raw` **[GET]** — đính kèm bình luận (upload + raw fetch, soi SSRF/IDOR).
- `r/[slug]/download-url/route.ts` **[GET]** — cấp URL tải bản dựng cho khách (rò rỉ asset).
- `r/[slug]/playback-token/route.ts` **[POST]** — token phát Mux cho khách.
- `r/[slug]/events/route.ts` **[POST]** — nhận sự kiện analytics khách.
- `r/[slug]/notifications/route.ts` **[GET]**, `request-pin` **[POST]**, `verify-pin` **[POST]** — đăng ký nhận thông báo qua PIN email.
- `r/[slug]/versions/[versionId]/comments` **[GET]**, `versions/[versionId]/view-url` **[GET]** — xem version + URL.
> D-sau: đây là toàn bộ vùng chưa-auth phụ thuộc `slug` + token. Trọng tâm: forgery quyết định duyệt, IDOR trên versionId/attachment id, rate-limit PIN.

### A8. Review-module nội bộ `/api/review/*` (cần session USER/ADMIN)
- **Assets:** `assets/[id]/route.ts` **[PATCH]**; `.../status` **[PUT]**; `.../status-history` **[GET]**; `.../versions` **[GET]**; `.../approve-send` **[POST]**; `.../confirm-fix` **[POST]**; `.../feedback-done` **[POST]**; `.../share` **[POST]**; `.../stack` **[POST]** — vòng đời trạng thái asset + tạo share link (điểm nối state-machine F2/F7-F10).
- **Comments:** `comments/[id]/route.ts` **[PATCH,DELETE]**; `.../resolve` **[POST,DELETE]**; `.../reactions` **[POST]** + `[emoji]` **[DELETE]**.
- **Comment-attachments:** `initiate` **[POST]**, `[id]/raw` **[GET]**.
- **Folders:** `folders/route.ts` **[POST]**; `folders/[id]/route.ts` **[GET,PATCH]**; `.../children` **[GET]**; `.../manifest` **[GET]**; `folders/batch` **[POST]**.
- **Items:** `items/copy` **[POST]**, `items/move` **[POST]**, `items/delete` **[POST]** — di chuyển/sao chép/xoá (rủi ro P1 folder-move path traversal trong audit trước).
- **Shares:** `shares/route.ts` **[POST,GET]**; `shares/[id]/route.ts` **[GET,PATCH,DELETE]**; `shares/[id]/revoke` **[POST]**.
- **Trash:** `trash/route.ts` **[GET]**, `trash/restore` **[POST]**, `trash/purge` **[POST]**.
- **Tree/Statuses:** `tree/route.ts` **[GET]**, `statuses/route.ts` **[GET]**.
- **Tasks:** `tasks/[taskId]/assets` **[GET]**, `tasks/[taskId]/confirm-complete` **[POST]** (rủi ro completed-task re-open E1-J1).
- **Uploads (S3 multipart):** `uploads/initiate` **[POST]**; `uploads/[uploadSessionId]/route.ts` **[GET]**; `.../complete` **[POST]**; `.../abort` **[POST]**; `task-upload/initiate` **[POST]**.
- **Versions:** `versions/[id]/route.ts` **[DELETE]**; `.../comments` **[GET,POST]**; `.../download-url` **[POST]**; `.../playback-token` **[POST]**; `.../remove-from-stack` **[POST]**.
- **Download-zip:** `download-zip/route.ts` **[GET]** — tải .zip hàng loạt (mục "Tệp" Team; soi authz + zip-slip).

---

## PHẦN B — Server Actions (`src/actions/*.ts`, 251 hàm / 51 file)

**Mọi file dưới đây khởi đầu bằng `"use server"` → mọi hàm là RPC gọi được từ client.** Trích dẫn file:line là dòng khai báo hàm.

### admin-actions.ts (3)
- :14 `updateUserRole` — đổi role user trong workspace.
- :85 `createTask` — tạo task từ FormData.
- :347 `updateTaskManager` — gán manager cho task.

### admin-profile-actions.ts (4)
- :24 `createProfile`, :28 `updateProfile`, :55 `deleteProfile`, :93 `changeUserProfile` (mấy hàm `_`-param có vẻ đã vô hiệu hoá — soi kỹ).

### analytics-actions.ts (5)
- :7 `getAnalyticsData`, :97 `getUserErrorDetails`, :145 `getUserPerformanceScore`, :201 `getStaffErrorLogsDetail`, :261 `removeErrorLog` — dữ liệu hiệu suất nhân sự (rò rỉ chéo user nếu thiếu authz).

### audit-actions.ts (3)
- :49 `getWorkspaceAuditLogs`, :163 `getAuditLogActionTypes`, :180 `getAuditLogActors`.

### auth-actions.ts (2)
- :168 `loginAction`, :395 `logoutAction`.

### availability-actions.ts (5)
- :44 `getMyAvailability`, :73 `getMyAvailabilityWeek`, :111 `saveMyAvailability`, :163 `getAdminAvailabilityMatrix`, :216 `getAdminAvailabilityWeek`.

### bonus-actions.ts (3) — TÀI CHÍNH
- :38 `getPayrollLockStatus`, :63 `revertMonthlyBonus`, :118 `calculateMonthlyBonus`.

### bonus-config-actions.ts (2)
- :44 `getBonusConfig`, :72 `updateBonusConfig`.

### bulk-task-actions.ts (7) — hàng loạt, rủi ro cao
- :37 `createBatchTasks`, :225 `bulkDeleteTasks`, :252 `bulkUpdateTaskDetails`, :369 `bulkUpdateTaskResourceSubfields`, :483 `bulkUpdateTaskStatus`, :667 `bulkAssignTasks`, :788 `bulkUpdateStatus`.

### claim-actions.ts (5) — marketplace
- :16 `getMarketplaceStatus`, :34 `toggleMarketplace`, :67 `getMarketplaceTasks`, :128 `claimTask`, :213 `returnTask`. (Memory: marketplace từng rò `jobPriceUSD`.)

### client-request-actions.ts (5)
- :48 `getClientRequests`, :87 `getUnreadRequestCount`, :102 `acceptClientRequest`, :171 `rejectClientRequest`, :200 `markRequestAccepted`.

### contact-actions.ts (8)
- :14 `searchContacts`, :78 `sendContactRequest`, :113 `respondToContactRequest`, :131 `getContactRequests`, :161 `getContacts`, :199 `getBlockedContacts`, :228 `unblockContact`, :248 `blockContact`.

### create-user.ts (1)
- :17 `createUser`.

### crm-actions.ts (12)
- :14 `getClients`, :82 `createClient`, :106 `updateClient`, :130 `createProject`, :169 `createFeedback` (`_`-param, có thể no-op), :206 `deleteClient`, :237 `restoreClient`, :271 `getTrashedClients`, :304 `permanentlyDeleteClient`, :348 `mergeClientIntoParent`, :388 `unmergeClient`, :413 `getClientDetail`.

### cross-team-actions.ts (4)
- :11 `requestCrossTeamAccess`, :94 `approveCrossTeamAccess`, :137 `rejectCrossTeamAccess`, :169 `removeCrossTeamAccess` — cấp quyền chéo team (authz nhạy cảm).

### email-migration-actions.ts (2)
- :57 `requestEmailMigrationOtp`, :171 `verifyEmailMigrationOtp`.

### global-settings.ts (2)
- :8 `getFrameAccount`, :41 `updateFrameAccount` — lưu tài khoản/mật khẩu frame.io (rò rỉ credential?).

### impersonation-actions.ts (2) — RẤT nhạy cảm
- :9 `startImpersonation`, :79 `stopImpersonation`.

### integration-actions.ts (2)
- :35 `getConnectedIntegrations`, :74 `disconnectIntegration`.

### invoice-actions.ts (9) — TÀI CHÍNH
- :22 `getBillingProfiles`, :64 `createBillingProfile`, :127 `updateBillingProfile`, :186 `deleteBillingProfile`, :215 `getUnbilledTasks`, :277 `calculateInvoicePreview`, :314 `createInvoiceRecord`, :503 `getClientInvoices`, :548 `voidInvoice`.

### leaderboard-actions.ts (1)
- :5 `refreshLeaderboardAction`.

### member-actions.ts (11) — authz workspace membership
- :127 `getWorkspaceMembers`, :246 `getWorkspaceInvitations`, :276 `getMyPendingInvitations`, :303 `inviteToWorkspace`, :617 `acceptWorkspaceInvitation`, :937 `declineWorkspaceInvitation`, :1019 `revokeWorkspaceInvitation`, :1054 `changeWorkspaceMemberRole`, :1132 `removeWorkspaceMember`, :1247 `leaveWorkspace`, :1321 `getAvailableUsersForInvite`. (Memory: đã có vòng audit invite-flow — CLIENT-never-internal invariant.)

### notification-actions.ts (11)
- :24 `createNotificationInternal`, :70 `createBulkNotificationsInternal`, :86 `createAndBroadcastNotifications` — **tên "internal" nhưng vẫn exported từ file `"use server"` → gọi được từ client, soi giả mạo thông báo**; :112 `getNotifications`, :165 `getUnreadNotificationCount`, :176 `markNotificationRead`, :197 `markAllNotificationsRead`, :209 `archiveNotification`, :228 `clearAllArchived`, :243 `getMyNotificationPreferences`, :264 `updateMyNotificationPreferences`.

### password-reset-actions.ts (3)
- :65 `requestPasswordResetOtp`, :177 `verifyPasswordResetOtp`, :292 `resetPasswordWithToken`.

### payment-actions.ts (4) — TÀI CHÍNH
- :44 `recordPayment`, :110 `deletePayment`, :139 `getPaymentLedger`, :164 `getClientPayments`.

### payroll-actions.ts (3) — TÀI CHÍNH lõi (state-machine salary)
- :22 `confirmPayment`, :108 `getPayrollData`, :144 `revertPayment`.

### price-template-actions.ts (3)
- :9 `getTemplates`, :37 `createTemplate`, :68 `deleteTemplate`.

### pricing-rule-actions.ts (5)
- :152 `listPricingRules`, :189 `createPricingRule`, :278 `updatePricingRule`, :365 `deletePricingRule`, :406 `setDefaultPricingRule`.

### profile-actions.ts (12)
- :12 `checkProfileAccess`, :36 `selectProfile`, :53 `getAvailableProfiles`, :94 `getMyProfilesAndWorkspaces`, :183 `updateProfile`, :228 `createProfileForUser`, :282 `getProfileSettings`, :315 `updateProfileSettings`, :381 `deleteProfileAction`, :425 `restoreProfileAction`, :466 `getMyTrashedProfiles`, :504 `changePassword`.

### profile-member-actions.ts (7) — authz cấp profile
- :49 `getProfileMembers`, :113 `inviteToProfileAction`, :161 `removeFromProfileAction`, :236 `changeProfileRoleAction`, :306 `transferProfileOwnershipAction`, :376 `grantWorkspaceAccessToAdmin`, :434 `getOldWorkspacesForAdmin`.

### push-actions.ts (3)
- :14 `getVapidPublicKey`, :18 `savePushSubscription`, :49 `deletePushSubscription`.

### raw-footage-actions.ts (5)
- :146 `getRawFootageMap`, :159 `setRawFootageDisplayType`, :215 `saveRawFootageMap`, :326 `getHookGraph`, :351 `saveHookGraph` (Multi-Hook Map whiteboard).

### reputation-actions.ts (1)
- :3 `checkOverdueTasks`.

### retry-translation-action.ts (1)
- :6 `retryTaskTranslation`.

### schedule-actions.ts (8)
- :37 `upsertScheduleRule`, :97 `deleteScheduleRule`, :119 `createScheduleException`, :165 `createBatchScheduleExceptions`, :204 `deleteScheduleException`, :227 `getEffectiveAvailability`, :272 `deleteScheduleExceptionsByIds`, :307 `deleteScheduleExceptionsForDay`.

### share-document-actions.ts (2) — token khách
- :405 `getDocumentsViaToken`, :410 `downloadDocumentsViaToken`.

### share-link-actions.ts (3)
- :40 `createClientShareLink`, :84 `revokeClientShareLink`, :114 `listClientShareLinks`.

### share-portal-actions.ts (17) — bề mặt khách công khai lớn nhất (token-based)
- :48 `getShareSnapshot`, :301 `getPortalNotifyEmail`, :318 `requestPortalNotifyEmail`, :350 `verifyPortalNotifyEmail`, :389 `removePortalNotifyEmail`, :408 `unsubscribePortalNotify`, :489 `approveDeliverableViaToken`, :533 `requestChangesViaToken`, :584 `submitRatingViaToken`, :653 `getSubmitOptionsViaToken`, :684 `createTaskViaToken`, :850 `submitClientRequestViaToken`, :960 `createSubClientViaToken`, :1020 `getActivityViaToken`, :1062 `getCommentFeedViaToken`, :1114 `postCommentViaToken`, :1188 `toggleReactionViaToken`.
> D-sau: `approveDeliverableViaToken`/`requestChangesViaToken`/`createTaskViaToken`/`createSubClientViaToken` cho khách ghi dữ liệu chỉ bằng token — trọng tâm forgery/IDOR/mass-assignment.

### signup-actions.ts (1)
- :107 `signupAction`.

### study-place-actions.ts (4)
- :50 `getStudyPlaceProgress`, :78 `reviewStudyPlaceQuestionAction`, :148 `toggleStudyPlaceBookmarkAction`, :201 `resetStudyPlaceProgressAction`.

### tag-actions.ts (6)
- :12 `getTagsForUser`, :47 `createTag`, :94 `updateTag`, :120 `deleteTag`, :140 `setTaskTags`, :181 `getTaskTags`.

### task-actions.ts (3) — lõi state-machine task
- :17 `updateTaskStatus` (kèm `currentVersion` optimistic-lock), :503 `getCancelledTasks`, :547 `restoreCancelledTask`.

### task-comment-actions.ts (12)
- :163 `getTaskActivityFeed`, :244 `createTaskComment`, :287 `editTaskComment`, :303 `deleteTaskComment`, :318 `toggleTaskCommentReaction`, :354 `assignTaskComment`, :412 `resolveTaskComment`, :449 `reopenTaskComment`, :467 `markTaskCommentsRead`, :485 `getTaskUnreadCounts`, :526 `searchWorkspaceMembers`, :546 `getTaskMentionTargets`. (Visibility INTERNAL/CLIENT — soi rò rỉ comment nội bộ ra khách, R5-CHANGES leak trong audit trước.)

### task-management-actions.ts (3)
- :12 `deleteTask`, :35 `updateTask`, :110 `assignTask`.

### toggle-treasurer.ts (1) — super-admin escalation
- :7 `toggleTreasurer`.

### tracking-actions.ts (7)
- :29 `forceFlush`, :58 `trackEvent`, :91 `pingHeartbeat`, :153 `getSessionTrends`, :202 `getRecentEventLogs`, :243 `getFrictionData`, :292 `getLivePresence`.

### ui-actions.ts (1)
- :6 `toggleMobileView`.

### update-task-details.ts (1)
- :8 `updateTaskDetails`.

### upload-actions.ts (4)
- :53 `uploadPaymentQr`, :120 `uploadAvatar`, :210 `uploadProfileBanner`, :257 `uploadProfileLogo`.

### user-actions.ts (7)
- :11 `changePassword`, :78 `updateUserRole`, :169 `deleteUser`, :181 `deactivateUser`, :337 `reactivateUser`, :423 `adminResetPassword` (`_`-param → có thể vô hiệu hoá, xác nhận), :442 `triggerForcePasswordReset`.

### username-actions.ts (4)
- :34 `checkUsernameAvailable`, :73 `completeUsernameMigration`, :142 `updateMyUsername`, :158 `searchInviteCandidates`.

### velox-batch-actions.ts (1)
- :102 `createTasksFromBatch`.

### velox-helpers-actions.ts (2)
- :85 `getLastClientNote`, :179 `suggestRoundRobinAssignee`.

### workspace-actions.ts (8)
- :12 `createWorkspaceAction`, :93 `renameWorkspaceAction`, :134 `getWorkspacesForProfile`, :175 `transferWorkspaceOwnership` (`_`-param → có thể no-op, xác nhận), :181 `deleteWorkspaceAction`, :279 `getMyTrashedWorkspaces`, :327 `restoreWorkspaceAction`, :383 `createNextMonthWithRollover`.

---

## Ghi chú coverage cho các lens sau
- **Hàm có tham số `_`-prefix** (admin-profile-actions `changeUserProfile`, crm `createFeedback`, user `adminResetPassword`, workspace `transferWorkspaceOwnership`, payroll `revertPayment` một phần) trông như đã bị vô hiệu hoá/stub — D-sau cần xác nhận chúng thật sự no-op hay vẫn ghi DB (nguy cơ "tưởng tắt nhưng còn chạy").
- **Đếm khớp:** 251 hàm, 51 file, 100% `"use server"`.

---

## D3 — Bản đồ Prisma schema: 15 model nhạy cảm, trường mang-tín-nhiệm, unique/cascade & rủi ro mass-assignment

## Tổng quan

File: `prisma/schema.prisma` (2052 dòng). Có **2 bản schema song song**: bản gốc `prisma/schema.prisma` và một bản mirror trong `electron/release/win-unpacked/resources/standalone/.claude/worktrees/cranky-austin/prisma/schema.prisma` (artefact build Electron — audit backend chỉ dùng bản gốc, nhưng lens sau nên xác nhận bản mirror không bị load nhầm ở runtime nào).

Đặc điểm kiến trúc quan trọng cho toàn bộ audit tenant-scoping:
- **`role` trên `WorkspaceMember` và `WorkspaceInvitation` là `String` thô** (comment "kept as String until migration applied", `schema.prisma:114`, `:826`), KHÔNG phải enum. Nghĩa là DB không ép giá trị hợp lệ — mọi validation `OWNER/ADMIN/MEMBER/GUEST` nằm hoàn toàn ở tầng code. Đây là bề mặt mass-assignment số 1.
- **`User.role` là enum `UserRole`** (`:152`, `:893`) → DB ép giá trị, nhưng chuỗi giá trị gồm cả `ADMIN` và `LOCKED`.
- **Module Review (Mux) dùng FK dạng SCALAR STRING cố ý** (`workspaceId/taskId/clientId` là String thường, không có quan hệ Prisma — xem comment `:1599-1609`). Hệ quả: tenant-scoping của review-module KHÔNG được DB bảo vệ bằng FK; toàn bộ cô lập tenant phụ thuộc tầng action. Lens sau phải soi kỹ.

---

## 1. User (`schema.prisma:125-247`)

**Trường mang tín nhiệm (mass-assignment = leo thang quyền):**
- `role UserRole @default(USER)` (`:152`) — ADMIN/USER/AGENCY_ADMIN/CLIENT/LOCKED. Ghi được trường này = chiếm quyền admin.
- `isTreasurer Boolean @default(false)` (`:141`) — cùng `role=ADMIN` tạo **super admin** (theo mô tả nhiệm vụ). Cực nhạy.
- `sessionVersion Int @default(0)` (`:170`) — dùng để invalidate mọi JWT cũ (phòng CVE-2025-29927 + reset password). Nếu attacker ghi/giảm được field này của nạn nhân → có thể ảnh hưởng logic vô hiệu hóa token.
- `emailVerified` (`:158`), `hasAcceptedTerms` (`:142`), `failedLoginAttempts`/`lockedUntil` (`:163-164`) — ghi được = bỏ qua email-verify hoặc tự mở khóa account lockout.
- `allowExternalInvites Boolean @default(true)` (`:174`) — cổng chống spam-invite cross-profile.
- `profileId` (`:151`), `agencyId` (`:150`), `clientId Int?` (`:178`) — trường gắn tenant/identity. `clientId` liên kết CLIENT-role user → `Client` (portal access, `:179`); ghi tùy tiện = chiếm danh tính client khác.
- `password String?` (`:136`, nullable do Google OAuth), `googleId String? @unique` (`:137`) — ghi `googleId` = có thể chiếm luồng đăng nhập Google.
- Dữ liệu PII/thanh toán: `paymentAccountNum/paymentBankName/paymentQrUrl` (`:147-149`), `phoneNumber`, `lastLoginIp` (`:168`).

**Unique:** `username @unique` (`:127`), `googleId @unique` (`:137`). Index `email`, `lockedUntil`.
**Cascade:** `client` FK `onDelete: SetNull` (`:179`). Xóa User → cascade rất nhiều bảng con (WorkspaceMember, sessions, tokens…) qua phía con.
**Rủi ro mass-assignment:** bất kỳ update-profile action nào nhận nguyên object phải whitelist — `role`, `isTreasurer`, `sessionVersion`, `emailVerified`, `profileId`, `clientId`, `googleId` PHẢI bị chặn khỏi input người dùng.

## 2. Workspace (`:57-108`)

**Trường mang tín nhiệm:** `profileId String?` (`:64`) — dây rốn tenant; đổi = di chuyển workspace sang profile khác. `status String @default("ACTIVE")` (`:69`, ACTIVE/SUSPENDED/SOFT_DELETED — String thô, không enum) — điều khiển ẩn/hiện + cron hard-delete. `marketplaceOpen Boolean` (`:61`). `hardDeleteAfter` (`:71`) — ghi được = ép xóa cứng sớm.
**Unique:** không có unique nghiệp vụ (chỉ `id`). Index `name`, `[status, deletedAt]`.
**Cascade:** Workspace là cha cascade của **WorkspaceMember, WorkspaceInvitation, AuditLog, IntegrationToken, tất cả bảng schedule/tag/wiki** (onDelete: Cascade phía con). `profile` FK không khai onDelete → mặc định. Xóa Profile → cascade workspaces (comment `:24`).

## 3. WorkspaceMember (`:110-123`)

**Trường mang tín nhiệm số 1:** `role String @default("MEMBER")` (`:114`) — **String thô**, quyết định OWNER/ADMIN/MEMBER/GUEST trong workspace. DB không ép giá trị. `userId` + `workspaceId` (`:112-113`) — cặp định danh membership.
**Unique:** `@@unique([userId, workspaceId])` (`:120`) — 1 user 1 membership/workspace.
**Cascade:** cả `user` và `workspace` đều `onDelete: Cascade` (`:117-118`).
**Rủi ro:** Đây là bảng phân quyền lõi. Bất kỳ action thêm/sửa member nào phải (a) verify caller là OWNER/ADMIN, (b) validate `role` nằm trong tập hợp lệ (vì DB không ép), (c) chặn tự-nâng-quyền. Lens authz phải soi mọi ghi vào bảng này.

## 4. Profile (`:11-55`)

**Trường mang tín nhiệm:** `status` (`:25`, ACTIVE/SOFT_DELETED — String), `hardDeleteAfter` (`:27`) — cron `/api/cron/hard-delete-profiles` xóa → cascade toàn bộ workspaces. `settings Json?` (`:16`) — JSON tự do, có thể chứa cờ nhạy cảm; cần soi nơi đọc settings.
**Unique:** chỉ `id`. **Cascade:** là gốc tenant cao nhất; xóa = cascade workspaces → mọi thứ. `bonusConfig Profile?` 1-1 (`:50`).
**Phân quyền per-profile nằm ở `ProfileAccess`** (xem dưới), không phải trên Profile.

## 5. ProfileAccess (`:266-290`) — [không nằm trong danh sách gốc nhưng là lõi authz, đưa vào]

**Trường mang tín nhiệm:** `role ProfileRole @default(USER)` (`:274`, enum OWNER/ADMIN/USER/CLIENT — có ép enum). `grantedAt` (`:278`) đóng vai **cutoff time**: ADMIN tự thấy workspaces có `createdAt >= grantedAt` (comment `:275-277`) → ghi lùi `grantedAt` = mở rộng tầm nhìn workspace. `clientId Int?` (`:280`) khi role=CLIENT.
**Unique:** `@@unique([userId, profileId])` (`:286`). **Cascade:** user & profile Cascade; client SetNull (`:282-284`).

## 6. Payroll (`:310-329`)

**Trường mang tín nhiệm (tiền):** `baseSalary/bonus/totalAmount Decimal` (`:315-317`), `status String @default("UNPAID")` (`:318`, String thô), `paidAt` (`:319`). `userId/workspaceId/profileId` — tenant. Ghi `status=PAID` hoặc `totalAmount` = gian lận lương.
**Unique:** `@@unique([userId, month, year, workspaceId])` (`:328`). **Cascade:** `user`/`workspace`/`profile` FK KHÔNG khai onDelete → **Restrict mặc định** (không cho xóa user/workspace khi còn payroll — hoặc lỗi FK). Đây là hành vi cần lưu ý cho luồng xóa.

## 7. Invoice (`:752-780`)

**Trường mang tín nhiệm:** `invoiceNumber @unique` (`:754`), `status InvoiceStatus @default(DRAFT)` (`:764`, enum DRAFT/SENT/PAID/OVERDUE/VOID), các Decimal tiền (`:759-763`). `billingSnapshot Json` (`:767`, required) + `clientSnapshot Json?` (`:768`) — snapshot đóng băng dữ liệu billing; nếu mass-assign được = giả mạo hóa đơn. `createdBy String` (`:756`), `clientId`, `workspaceId`, `profileId`, `clientUserId`.
**Unique:** `invoiceNumber @unique`. **Cascade:** `client` FK không onDelete (Restrict); `items` cascade phía InvoiceItem (`:790`).

## 8. Payment (`:800-816`) — sổ thu tiền

**Trường mang tín nhiệm:** `amount Decimal` (`:806`), `clientId/workspaceId/profileId` (`:802-804`), `invoiceId` (`:805`, ghi = đánh dấu invoice PAID), `recordedById` (`:810`). **Model tự-chứa, KHÔNG có FK** (comment `:798`: "action layer enforces ADMIN + workspace scoping explicitly"). Nghĩa là tenant-scoping HOÀN TOÀN ở code — lens authz phải verify `payment-actions.ts` ép ADMIN + workspaceId.
**Unique:** không. Index `[workspaceId, clientId]`, `[workspaceId, paidAt]`.

## 9. Client (`:494-559`)

**Trường mang tín nhiệm:** `id Int autoincrement` (khóa số tuần tự → enumerable), `depositBalance Decimal` (`:505`), `tier ClientTier` (`:504`), `aiScore/frictionIndex/inputQuality/paymentRating` (điểm nội bộ). `status String` (`:546`, ACTIVE/SOFT_DELETED/MERGED — String), `mergedIntoId Int?` (`:552`, con trỏ merge), `parentId` (`:497`, phân cấp), `workspaceId` (LEGACY, `:516`) + `profileId` (`:518`, tenant thật).
**Unique:** chỉ `id`. Index `[status, deletedAt]`, `[profileId, status]`.
**Cascade:** `parent` self-relation `onDelete: Cascade` (`:506`) — **xóa client cha cascade xóa subsidiaries** (đáng chú ý: xóa nhánh CRM). `mergedInto` SetNull (`:553`). Quan trọng: `Task.client` là `SetNull` (`:373`) — xóa client KHÔNG xóa task (chủ ý). `portalUsers User[]` (`:523`) và `profileAccesses` (CLIENT role) trỏ về client này = bề mặt danh tính portal.

## 10. ClientShareLink (`:572-616`) — link portal khách (tokenized)

**Trường mang tín nhiệm:** `tokenHash @unique` (`:573`, chỉ lưu SHA-256, raw hiện 1 lần). Cụm capability toggle: `allowVideoComments/allowDownload/showAllVersions/canApprove` (`:591-594`) + `passphraseHash` (`:595`) — ghi được = tự mở quyền duyệt/tải. Cụm notify email: `notifyEmail/notifyEmailPending/notifyEmailCodeHash/notifyEmailUnsubToken` (`:600-605`) — OTP verify email; `notifyEmailUnsubToken @unique`. `clientId/profileId/createdById` — tenant + tác giả.
**Cascade:** `client` & `profile` Cascade (`:607-608`), `createdBy` SetNull (`:609`).
**Rủi ro:** cổng vào UNAUTHENTICATED cho toàn bộ lịch sử 1 client (comment `:561-563`). Toggle `canApprove`/`allowDownload` là ranh giới quyền khách — lens phải soi nơi resolve token → có ép các toggle này không.

## 11. ShareLink — review module `/r/{slug}` (`:1862-1896`)

**KHÁC ClientShareLink.** **Trường mang tín nhiệm:** `slug @unique` (`:1864`, chỉ là địa chỉ), `passwordHash` (`:1878`, bcrypt), `expiresAt` (`:1879`), `revokedAt` (`:1880`, kill-switch). Toggle: `allowComments/allowDownload/downloadOnlyWhenApproved/showAllVersions` (`:1872-1875`). `workspaceId/taskId/createdById` — SCALAR (không FK-constraint tới Workspace/Task theo thiết kế P0).
**Cascade:** `items ShareLinkItem[]` và `guests GuestSession[]` cascade phía con. ShareLinkItem có CHECK "folderId XOR assetId" (chỉ ở manual SQL, `:1898`) — Prisma không diễn đạt được → lens phải kiểm tra manual SQL `p0_add_review_module.sql` có thực sự được apply.

## 12. GuestSession (`:1921-1942`)

**Trường mang tín nhiệm:** `tokenHash @unique` (`:1926`, sha256 của token trong cookie HttpOnly), `shareLinkId` (`:1923`), `name`+`email` (`:1928-1929`, bắt buộc, PII khách/GDPR), `emailVerifiedAt` (`:1932`, double-opt-in PIN).
**Cascade:** `shareLink onDelete: Cascade` (`:1924`). Trên `ReviewComment.guestSession` = SetNull (`:1799`, giữ comment sau khi xóa guest, kèm `guestName` snapshot `:1800`); trên `CommentReaction` = Cascade (`:1850`).
**Rủi ro:** danh tính khách chỉ dựa cookie-token → hash; lens phải soi việc mint/verify token, và `email` do khách tự khai (giả mạo danh tính khách khác trong cùng link).

## 13. IntegrationToken (`:1369-1386`)

**Trường CỰC nhạy:** `accessToken String` + `refreshToken String?` (`:1374-1375`) — **AES-256-GCM mã hóa at-rest qua `INTEGRATION_TOKEN_SECRET`**. OAuth Dropbox/Google Drive per-user. `provider`, `accountEmail`, `expiresAt`, `userId`, `workspaceId`.
**Unique:** `@@unique([userId, workspaceId, provider])` (`:1384`). **Cascade:** user & workspace Cascade (`:1381-1382`).
**Rủi ro:** rò rỉ = chiếm cloud storage của user. Lens phải verify (a) token luôn giải mã đúng scope caller, (b) không bao giờ serialize accessToken ra client, (c) action đọc token có ép `userId == caller`.

## 14. PasswordResetOTP (`:1322-1340`) + EmailVerificationToken (`:1300-1315`)

**PasswordResetOTP — trường nhạy:** `otpHash` (`:1326`, SHA-256, KHÔNG plaintext), `purpose String` (`:1328`, PASSWORD_RESET/EMAIL_MIGRATION — **comment cảnh báo BẮT BUỘC filter theo purpose** để tránh token-confusion `:1320-1321`), `email` snapshot (`:1329`, chống email-change attack), `expiresAt` (10 phút), `attemptCount` (`:1331`, khóa ở 5), `consumedAt`/`invalidatedAt`.
**EmailVerificationToken:** `tokenHash @unique` (`:1304`), `purpose` (`:1306`, EMAIL_VERIFICATION/PASSWORD_RESET/EMAIL_MIGRATION — cùng cảnh báo filter purpose `:1297-1299`), `email`, `expiresAt`, `usedAt`.
**Cascade:** cả hai `user onDelete: Cascade`.
**Rủi ro:** logic-confusion giữa purpose (lens phải grep mọi query có filter `purpose`), replay (dùng `usedAt/consumedAt`), enumeration OTP (attemptCount). Không có unique trên OTP (chủ ý — nhiều OTP/user, lấy mới nhất) → lens phải verify query luôn lấy bản chưa consume + chưa invalidate + chưa hết hạn.

## 15. WorkspaceInvitation (`:821-850`)

**Trường mang tín nhiệm:** `role String @default("MEMBER")` (`:826`, **String thô** — role gán khi accept; validate ở code), `token @unique @default(uuid())` (`:832`, link mời), `status String` (`:833`, PENDING/ACCEPTED/... String), `invitedUserId`/`invitedEmail`/`invitedById`/`workspaceId`, `expiresAt` (`:836`), `isClientInvite`+`clientId` (`:830-831`, DEPRECATED nhưng cột còn).
**Unique:** `token @unique`, `@@unique([workspaceId, invitedUserId, status])` (`:845`, chống mời trùng).
**Cascade:** workspace/invitedUser/invitedBy đều Cascade (`:841-843`).
**Rủi ro:** `role` String thô + `token` uuid (không phải hash) — khác pattern hash của các token khác. Lens phải soi: (a) accept-invite có validate `role` hợp lệ + không cho tự-nâng lên OWNER, (b) token uuid trong URL có bị brute/enumerate, (c) `expiresAt` được ép.

## 16. AuditLog (`:856-881`)

**Thiết kế append-only** (comment `:852-855`: code CHỈ INSERT; kế hoạch REVOKE UPDATE/DELETE ở DB Phase 2 qua `migration_audit_log_revoke.sql`). **Trường:** `actorUserId` (người làm) vs `userId` (đối tượng) — comment `:862-864` phân biệt rõ. `action/targetType/targetId`, `beforeData/afterData Json`, `ipAddress/userAgent`, `workspaceId` nullable (cho auth event ngoài workspace).
**Cascade:** `workspace onDelete: Cascade` (`:874` — **đáng lưu ý: xóa workspace XÓA LUÔN audit log của nó**, mâu thuẫn tinh thần "log phải outlive"), `actor`/`user` SetNull (`:875-876`).
**Rủi ro:** (a) xác nhận migration REVOKE đã chạy trên prod (nếu chưa, app role vẫn UPDATE/DELETE được → audit không bất biến); (b) cascade từ Workspace làm mất trail khi xóa tenant.

---

## Ghi chú tenant-scoping tổng hợp (cho các lens sau)

- Trường tenant lặp lại: `profileId` (cao nhất) → `workspaceId` → (`clientId`/`userId`). Nhiều model finance/schedule có CẢ ba. Model review-module (`ReviewFolder/Asset/Version/Comment/ShareLink/ReviewActivity`) chỉ mang `workspaceId` dạng **String không-FK** → cô lập tenant KHÔNG được DB đảm bảo.
- Có `getWorkspacePrisma` (nhắc ở comment `:623`, `:1492`) là lớp inject tenant filter; một số model **cố ý bỏ qua** nó (`BonusConfig` chỉ lọc profileId `:1491-1493`; `Payment`/`ClientTaskRequest` inject thủ công). Lens authz phải xác định model nào đi qua wrapper, model nào tự-ép.
- **Khóa Int autoincrement** trên `Client`, `Project`, `Invoice.clientId` → enumerable; IDOR dễ hơn so với uuid.

---

## D4 — Bản đồ Auth/Session/JWT/Impersonation (HustlyTasker)

> Audit READ-ONLY. Mọi trích dẫn `file:line` theo cây `src/` gốc của worktree `cranky-austin`.

## 1. JWT: thuật toán, secret, hạn

- **Thuật toán:** HS256 (đối xứng), thư viện `jose`. Ký ở `src/lib/jwt.ts:16-22` (`encrypt`), verify ở `jwt.ts:24-29` (`decrypt`) — chỉ chấp nhận `algorithms: ['HS256']` (tốt: chặn `alg:none`/RS256-confusion).
- **Nguồn secret:** `env.JWT_SECRET` (`jwt.ts:4`). Định nghĩa ở `src/lib/env.ts:7` — Zod `z.string().min(10)`, **default = placeholder source-controlled** `"temporary-build-secret-key-change-me"` (`env.ts:3`).
  - Fail-closed CHỈ ở production runtime: `env.ts:37-42` throw nếu `NODE_ENV==='production' && !IS_BUILD_PHASE && JWT_SECRET === placeholder`.
  - **Lỗ hổng còn lại:** (a) `min(10)` quá yếu cho HMAC-SHA256 (nên ≥32 byte); (b) build phase (`NEXT_PHASE==='phase-production-build'`) vẫn cho chạy trên placeholder; (c) môi trường `development`/`test` (kể cả preview deploy Vercel không set env) chạy trên secret công khai → **bất kỳ ai cũng forge được JWT mọi role**.
- **Không có `iss`/`aud`:** `encrypt` chỉ set `setIssuedAt` + `setExpirationTime` (`jwt.ts:19-20`); `decrypt` không verify issuer/audience. Cùng một secret ký cho: session thường, session impersonation, và token rolling-refresh (`middleware.ts:150`) — không phân biệt được loại token.
- **Hạn (TTL):**
  - Hằng số chung `SESSION_MAX_AGE = 30 ngày` (`jwt.ts:8`).
  - `encrypt` mặc định `'1 week'` (`jwt.ts:16`) NHƯNG mọi caller thực tế override: `login`/`loginWithProfile` dùng `'30 days'` (`auth.ts:17-20, 33-39`), rolling-refresh dùng `${SESSION_MAX_AGE}s` (`middleware.ts:150-153`).
  - **Sliding window 30 ngày:** `middleware.ts:145-163` re-issue cookie khi còn <50% hạn (<15 ngày) → user active gần như **không bao giờ hết hạn tự nhiên**.

## 2. Cookie flags

`auth.ts:23-29` (login) và `middleware.ts:154-161` (refresh):
- `httpOnly: true` ✅
- `secure: NODE_ENV==='production' && !ELECTRON_DESKTOP` — **tắt secure trên Electron desktop** (chạy http). Rủi ro nếu build desktop bị chạy qua network không tin cậy.
- `sameSite: 'lax'` (không phải `strict`) — Server Actions POST cùng site vẫn gửi cookie; đáng lưu ý cho CSRF (Next có bảo vệ riêng nhưng đây là bề mặt cần lens khác soi).
- `path: '/'`, **không** dùng prefix `__Host-`/`__Secure-`, không khóa `domain`.
- Cookie name: `session` (chính), `admin_session` (standby khi impersonate), `tracking_session_id`, `view-mode`.

## 3. getSession hoạt động thế nào

`auth.ts:65-74`: đọc cookie `session` → `decrypt` → trả payload `{ user, expires }` hoặc `null` (catch nuốt mọi lỗi). **Cố ý KHÔNG check `sessionVersion` và KHÔNG chạm DB** (comment `auth.ts:56-63`: giữ Edge-cheap). Đây là điểm mấu chốt: `getSession()` một mình **không phải** cổng bảo mật — nó chỉ giải mã JWT. Mọi route chỉ gọi `getSession()` mà không đi qua DAL sẽ tin JWT nguyên vẹn.

## 4. Logout & thu hồi — token bị đánh cắp còn sống không?

- **`logout()` (`auth.ts:51-54`):** chỉ `cookieStore.set('session','',{expires:0})` — **xóa cookie phía client, KHÔNG bump `sessionVersion`, KHÔNG blacklist**. Không có bảng revoke/denylist token nào trong toàn repo.
- **Hệ quả:** một JWT bị đánh cắp/copy **vẫn hợp lệ tới tận hạn tự nhiên (tối đa 30 ngày, và sliding-window có thể kéo dài vô hạn nếu attacker giữ refresh)**. `logout()` thường **không** vô hiệu hóa token đã bị lộ trước đó.
- **Cơ chế thu hồi thực sự = `sessionVersion`** (defense-in-depth). Bump ở: đổi mật khẩu (`user-actions.ts:58`, `password-reset-actions.ts:353`, `api/auth/reset-password/route.ts`), "logout all devices"/edit (`user-actions.ts:305`), email migration (`email-migration-actions.ts:250`), profile action (`profile-actions.ts:555`). JWT nhúng `sessionVersion` lúc login (`auth-actions.ts:341`).
- **Nhưng thu hồi CHỈ có hiệu lực ở tầng DAL, không ở Edge/middleware:**
  - `middleware.ts:142-144` ghi rõ rolling-refresh **KHÔNG** enforce revoke (Edge không có DB) — nó vẫn gia hạn cookie cho token đã bị "thu hồi".
  - Các cổng THỰC check `sessionVersion(JWT) < DB`: `verifyActiveSession` (`security.ts:257-269`), `verifyWorkspaceAccess` (`security.ts:77-81`), `isSessionLive` (`profile-permissions.ts:46-56`).
  - **Bề mặt rủi ro:** route nào chỉ dùng `getSession()` (hoặc `getCurrentUser`, xem dưới) mà không gọi một trong ba hàm trên thì **token đã thu hồi vẫn dùng được**. Đây là lỗ hổng theo-đường-dẫn cần lens khác quét toàn bộ caller.
- `getCurrentUser` (`auth-guard.ts:21-46`): fetch DB nhưng **KHÔNG so `sessionVersion`** và **KHÔNG chặn `role==='LOCKED'`** → nếu một Server Action chỉ dựa `getCurrentUser` để authorize thì tài khoản bị khóa/thu hồi vẫn qua. (Chỉ chặn khi user bị xóa hẳn.)

## 5. Impersonation (`src/actions/impersonation-actions.ts` + `auth.ts:76-138`)

- **Ai kích hoạt:** Server Action `startImpersonation(targetUserId, workspaceId)` (`impersonation-actions.ts:9`). Cổng: `verifyWorkspaceAccess(workspaceId,'ADMIN')` (`:14`) → caller phải là ADMIN/OWNER của workspace đó.
- **Có scoped không:** CÓ. Target phải là `WorkspaceMember` của CHÍNH workspace này (`:18-22`). Chặn leo bậc: không impersonate OWNER (`:43`); chỉ OWNER mới impersonate ADMIN (`:44`); chặn cả legacy global `User.role==='ADMIN'` (`:58`). Effective role tính từ WorkspaceMember + ProfileAccess (`:31-42`).
- **Có log không:** CÓ, `audit()` — `auth.impersonation_started` (`:63-70`) và `auth.impersonation_ended` (`:84-92`). **Gap forensics:** chỉ log start/end; các mutation TRONG lúc impersonate được ghi dưới danh tính target (JWT `id = targetUser.id`), `originalAdminId` chỉ là claim không re-verify → khó truy actor thật.
- **Có time-limited không:** CÓ, JWT exp = 2 giờ (`auth.ts:77`). Vì `decrypt` reject token hết hạn, hết 2h token impersonation tự chết. `impersonationExpiresAt` (`auth.ts:90`) chỉ là claim cho UI banner countdown (comment `auth.ts:82-84` thừa nhận TTL không force-logout chủ động).
- **Cơ chế cookie:** `createImpersonationSession` (`auth.ts:76-114`) cất JWT admin gốc vào cookie `admin_session`, ghi đè `session` bằng JWT giả có `isImpersonating:true, originalAdminId, impersonationExpiresAt`. `stopImpersonationSession` (`auth.ts:116-138`) khôi phục `admin_session`→`session` với **hạn hardcode 7 ngày** (`auth.ts:119`, KHÔNG phải 30 — người dùng impersonate rồi thoát bị rớt session sớm hơn), rồi xóa `admin_session`.
- **Có target được CLIENT không:** Trên thực tế KHÔNG. CLIENT là view-only, thường không có `WorkspaceMember` row → `:22` chặn. Nếu tồn tại stray CLIENT `WorkspaceMember` row thì có thể lọt qua `:18-22`, nhưng session giả mang `role:'CLIENT'` và `middleware.ts:88-90` đá CLIENT về `/login` → impersonation CLIENT vô hại/hỏng chức năng (comment `:72-74` xác nhận đã gỡ).
- **Rủi ro impersonation-token bỏ qua sessionVersion:** `createImpersonationSession` spread `targetUser` được select gồm `id, username, nickname, role, email` — **KHÔNG có `sessionVersion`** (`impersonation-actions.ts:46-55`). Session giả có `user.sessionVersion === undefined` → coerce về 0. Vô tình fail-closed (0 < dbVersion) ở DAL, nhưng token gốc admin nằm nguyên trong `admin_session` suốt 2h vẫn full hợp lệ.

## 6. Đường "super-admin bypass"

- Task mô tả "super admin = ADMIN + isTreasurer" — trong code hiện tại **bypass workspace-level đã bị GỠ (Sprint Z)**:
  - `verifyWorkspaceAccess` cố ý **không** dùng `isTreasurer`/global `role==='ADMIN'` để cấp quyền workspace (`security.ts:32-34, 92-143`); `isGlobalAdmin` luôn `false` (`security.ts:161-163`, deprecated).
  - `verifyProfileAdminAccess` (`security.ts:180-191`) và `verifyFinanceAccess` (`security.ts:203-207`) chỉ dựa `workspaceRole`/`profileRole` — comment `security.ts:167-178` giải thích chính `isTreasurer` từng leak finance cross-tenant (R7/R8) nên đã loại.
  - `verifyActiveSession.isAdmin = !!isTreasurer` (`security.ts:278`) — chỉ còn nghĩa "vai trò tài chính", không phải bypass truy cập.
- **Nhưng tàn dư vẫn còn:** `getCurrentUser` vẫn export `isSuperAdmin = user.role === 'ADMIN'` (`auth-guard.ts:9, 39`). Bất kỳ caller nào còn tin `isSuperAdmin` sẽ tái lập bypass toàn cục cross-tenant. **Cần lens khác grep mọi consumer của `isSuperAdmin` và `isTreasurer`.**

## 7. Danh mục ĐẦY ĐỦ tên hàm guard (đúng chữ)

- **`src/lib/jwt.ts`:** `encrypt`, `decrypt`; hằng `SESSION_MAX_AGE`.
- **`src/lib/auth.ts`:** `login`, `loginWithProfile`, `logout`, `getSession`, `createImpersonationSession`, `stopImpersonationSession` (re-export `encrypt`, `decrypt`).
- **`src/lib/security.ts`:** `getWorkspaceMembership`, `verifyWorkspaceAccess`, `verifyProfileAdminAccess`, `verifyFinanceAccess`, `verifyActiveSession`.
- **`src/lib/auth-guard.ts`:** `getCurrentUser` (type `AuthContext`).
- **`src/lib/workspace-guards.ts`:** `ensureNotLastOwner`, `ensureNotLastOwnerOnDemotion`, `isLastOwner`, class `LastOwnerProtectionError` — **tất cả no-op/deprecated** (luôn return/false; không còn bảo vệ gì).
- **`src/lib/workspace-membership.ts`:** `isAssigneeInWorkspaceProfile`, `ensureWorkspaceMembership`.
- **`src/lib/profile-permissions.ts`:** `getProfileRole`, `isSessionLive`, `getProfileAccess`, `canCreateWorkspace`, `canInviteMember`, `canManageShareLinks`, `canRemoveMember`, `canChangeMemberRole`, `canTransferOwnership`, `canAccessWorkspace`, `isProfileOwner` (deprecated shim).
- **`src/middleware.ts`:** `middleware` (auth guard Edge + rolling-refresh + device-detect); matcher `middleware.ts:168-170` loại trừ `/api`, `/_next` → **middleware KHÔNG chạy cho `/api/*`** (mỗi route API tự phải guard).

---

## D5 — Bản đồ tích hợp ngoài (Resend, Puppeteer, Storage, Mux+R2, OpenAI, Dropbox/GDrive OAuth, Inngest, Webhooks)

## Tổng quan

Audit read-only 8 nhóm tích hợp ngoài của HustlyTasker. Điểm mạnh rõ rệt: **Mux webhook** ký HMAC fail-closed + ledger idempotent; **token OAuth mã hoá AES-256-GCM at rest**; **R2 không proxy bytes** (presigned trực tiếp); Mux **pull từ presigned R2 GET do server sinh** nên không có SSRF từ URL người dùng. Điểm yếu chính: **webhook calendar KHÔNG verify chữ ký** (may là stub chưa hành động); **nonce OAuth state sinh ra nhưng không bao giờ verify** (không cookie-bound); dịch thuật qua OpenAI là **dead code** nhưng nếu bật lại là surface prompt-injection; nhiều secret nằm plaintext env.

---

## 1. Resend (email) — `src/lib/email.ts`

- Client khởi tạo lazy: `const resend = API_KEY ? new Resend(API_KEY) : null` (`email.ts:10`); thiếu key → chỉ warn, không gửi (`email.ts:27-30`). Chỉ **outbound**, không có webhook inbound nên không có bề mặt verify chữ ký.
- `from` lấy từ env `RESEND_FROM_EMAIL` / `EMAIL_SENDER_NAME` (`email.ts:6-8`) — cố định, an toàn.
- **Nơi input người dùng chạm tới `to`:** review guest-notify gửi tới `sub.email` / `pl.notifyEmail` (`src/lib/review/guest-notify.ts:132,183`). Các địa chỉ này là email **đã double-opt-in qua OTP** (`src/lib/review/guest-subscribe.ts:1-3,30-57`) nên không phải open-relay. Tuy nhiên route `request-pin` gửi mã PIN tới **email tuỳ ý trong body** trước khi verify → bề mặt lạm dụng gửi thư/spam (cần rate-limit; giao cho lens khác kiểm).
- `to`, `subject`, `html` được truyền thẳng vào `resend.emails.send` (`email.ts:34-40`). Không thấy header-injection (Resend SDK, không SMTP thô), nhưng nếu `to` từng đến từ input chưa kiểm sẽ là rủi ro.

## 2. Puppeteer (PDF hoá đơn) — `src/lib/invoice-generator.ts`

- Render bằng `handlebars.compile(INVOICE_TEMPLATE)` rồi `page.setContent(html, {waitUntil:'load'})` (`invoice-generator.ts:205-206,272`). **KHÔNG dùng `page.goto(userUrl)`** → không có SSRF cổ điển qua URL người dùng.
- HTML là template cố định; dữ liệu người dùng chèn qua `{{...}}` (Handlebars **auto-escape** mặc định) — `clientName`, `clientAddress`, `bank.*`, `items[]` đều `{{}}` (`invoice-generator.ts:75-158`). `paymentLink` render vào `href="{{paymentLink}}"` (`:148`) — escape HTML nhưng **không validate scheme** (có thể `javascript:` — tác động thấp vì PDF tĩnh, không có JS runtime khi in).
- **Điểm cần soi:** ở Vercel tải chromium **remote pack từ GitHub tại runtime** (`invoice-generator.ts:220,225`) — rủi ro chuỗi cung ứng/độ sẵn sàng (URL cố định pin v123.0.1, chấp nhận được). Local dùng `--no-sandbox --disable-setuid-sandbox` (`:262`) — chỉ local.
- Auth: route `POST /api/invoices/generate` gated bằng `verifyFinanceAccess(workspaceId)` (`src/app/api/invoices/generate/route.ts:15-21`); PDF render từ body do caller cung cấp (không đọc dữ liệu store) → gate là hardening. Cũng dùng ở `src/app/api/invoices/[id]/download/route.ts:88`.

## 3. Storage công khai — `src/lib/storage.ts`

- Chọn backend theo env: `STORAGE_DRIVER` ép, hoặc auto Vercel Blob nếu có `BLOB_READ_WRITE_TOKEN`, else Supabase (`storage.ts:23-31`).
- Supabase dùng **`SUPABASE_SERVICE_ROLE_KEY`** (`storage.ts:28,46`) — service-role bỏ qua RLS; chỉ chạy server-side (đúng), nhưng bucket **PUBLIC** (`storage.ts:17-19`), URL lưu thẳng lên User/Profile.
- `filename` (object key) do caller truyền: 4 chỗ ở `src/actions/upload-actions.ts:98,157,237,284`. **Cần soi upload-actions xem key có sanitize / gắn userId chống ghi đè hay path traversal** (lens khác) — `uploadPublicImage` dùng `upsert:true` (`storage.ts:54`) nên key trùng sẽ **ghi đè**.

## 4. Mux + Cloudflare R2 (module review)

**Mux REST** — `src/lib/review/mux.ts`
- Auth Basic từ `MUX_TOKEN_ID:MUX_TOKEN_SECRET` (`mux.ts:21-26`). `createMuxAsset` dùng `playback_policy:['signed']`, `video_quality:'plus'`, `passthrough=versionId` (`mux.ts:77-87`). **`inputUrl` là presigned R2 GET do server sinh** (`src/lib/review/inngest.ts:401`), KHÔNG phải URL người dùng → không SSRF.

**Mux signed playback** — `src/lib/review/mux-jwt.ts`
- RS256 tự ký bằng `node:crypto`, key từ `MUX_SIGNING_KEY_ID` + `MUX_SIGNING_PRIVATE_KEY` (`mux-jwt.ts:22-28`). TTL 6h (`:13`). Token đóng vào query của stream.mux.com. Đúng chuẩn Mux (sub/aud/exp).

**R2 (S3 API)** — `src/lib/review/r2.ts`
- Credential `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` (`r2.ts:26-33`). **Server chỉ mint presigned URL, không proxy bytes** — browser PUT thẳng part (`r2.ts:1-3,62-85`). Presign PUT/GET mặc định 24h (`:66,81,141`); member download 15min attachment.
- Key R2 sinh bởi `buildR2Key = review/{workspaceId}/{assetId}/v{n}/{sanitizeFileName}` (`src/lib/review/upload-helpers.ts:66-72`); `sanitizeFileName` lọc `[^A-Za-z0-9._-]` + chặn leading dot (`upload-helpers.ts:40-58`) → **không path traversal**. workspaceId/assetId lấy từ DB (route-auth), không từ tên file.
- Route initiate validate zod (fileName ≤255, sizeBytes regex số, mimeType) (`src/app/api/review/uploads/initiate/route.ts:14-26`), bọc `withReviewRoute` (auth). **Cần soi (lens khác): mimeType/ContentType do client khai — R2 tin tưởng; magic-byte chỉ check ở Inngest sau khi upload xong** (`inngest.ts:362-371`).

**Mux webhook** — `src/app/api/webhooks/mux/route.ts` ✅ mạnh
- Đọc **raw body trước** (`route.ts:51`), verify `Mux-Signature t=,v1=` HMAC-SHA256 trên `{t}.{rawBody}` với `MUX_WEBHOOK_SECRET`, **tolerance ±5 phút**, `timingSafeEqual`, **fail-closed 401** (`route.ts:23-58`). Ledger `webhookEvent.create` idempotent trên Mux event id (P2002 = duplicate, ack) (`route.ts:73-80`). Việc nặng đẩy sang Inngest.

## 5. OpenAI / "Gemini" translator — `src/lib/gemini-translator.ts`, `src/lib/error-translator.ts`

- **Tên file gây hiểu nhầm:** `gemini-translator.ts` thực chất gọi **OpenAI `gpt-4`** với key **`GPT4_API_KEY`** (`gemini-translator.ts:1-5,38-45`). Không có Gemini/GoogleGenerativeAI thật trong `src/lib`.
- `translateTaskNote(text)` nhận HTML task-note (VN→EN), nhồi thẳng vào user message (`gemini-translator.ts:42`). **HIỆN LÀ DEAD CODE** — grep toàn `src/actions`, `src/app`, `src/components` không có caller nào (chỉ chính file). Tương tự `translateError` (`error-translator.ts`) không có caller ngoài file.
- **Rủi ro nếu bật lại:** nội dung task do người dùng nhập đi thẳng vào LLM → **prompt-injection** (task-note có thể chứa chỉ thị lật system prompt), và HTML output từ LLM được yêu cầu "giữ nguyên tag" → nếu render không escape sẽ là stored XSS. Key thiếu → chỉ warn, trả '' (`gemini-translator.ts:22-25`), không chặn tạo task.

## 6. Dropbox + Google Drive OAuth — `src/app/api/integrations/**`, `src/lib/integration-tokens.ts`, `src/lib/google-auth.ts`

**Authorize** (`dropbox/authorize/route.ts`, `google-drive/authorize/route.ts`)
- Gated `getSession()` (`authorize:6-9`). State = `base64url(JSON{userId, workspaceId, nonce})` (`dropbox/authorize:22-28`; google `:22-27`). **`nonce = randomBytes(16)` được sinh nhưng KHÔNG lưu server/cookie → không bao giờ verify** → state **không phải CSRF token thật**, chỉ là plaintext base64 tự khai (comment "encrypted to prevent tampering" là SAI — chỉ base64).

**Callback** (`dropbox/callback/route.ts`, `google-drive/callback/route.ts`)
- Chống CSRF **duy nhất bằng** `session.user.id === state.userId` (`dropbox/callback:61-67`; google `:63-66`). Vì attacker không đặt được `userId` của nạn nhân vào state đã ký session, đây là bảo vệ hợp lý — nhưng **không có nonce-binding** nên không chống replay/login-CSRF chuẩn (giao cho lens authz soi kỹ).
- Đổi code lấy token qua fetch cố định `api.dropboxapi.com/oauth2/token` / `oauth2.googleapis.com/token` (`callback:76,73`), **mã hoá token bằng `encryptToken` (AES-256-GCM) trước khi lưu** `IntegrationToken` (`dropbox/callback:117-151`; google `:117-150`). `redirect_uri` từ `NEXT_PUBLIC_APP_URL`.
- Google callback ban đầu redirect `/admin/settings` (thiếu workspaceId, `google-drive/callback:33`) — cosmetic.

**scan-folder** (`src/app/api/integrations/scan-folder/route.ts`) — bề mặt SSRF chính
- User dán **URL cloud tuỳ ý** vào body (`scan-folder:82-88`). `parseCloudLink` **whitelist hostname cứng** chỉ `dropbox.com` / `drive.google.com` (`src/lib/cloud-link-parser.ts:58,66,107`), trả null nếu khác → SSRF bị chặn ở tầng parse. Provider request đi tới endpoint **cố định** `api.dropboxapi.com` / `www.googleapis.com` (`src/lib/cloud-scanner.ts:207,383`), chỉ folderId/path là biến.
- **GDrive folderId** vào query `q='{folderId}' in parents` (`cloud-scanner.ts:373,632`) — regex parse giới hạn `[A-Za-z0-9_-]` (`cloud-link-parser.ts:111`) → không query-injection. **Dropbox path** từ `/home/` `decodeURIComponent` vào JSON body `path` (`cloud-link-parser.ts:94`), không phải query → an toàn.
- Auth: `getSession` + `verifyWorkspaceAccess(workspaceId,'MEMBER')` (`scan-folder:61-108`). `maxDuration=300` (`:55`).
- **`refreshTokenIfNeeded`** (`src/lib/integration-tokens.ts`) có `import 'server-only'` (`:1`) — **fix audit R4**: trước đây nằm trong file `'use server'` nên thành Server Action public cho phép client POST ciphertext tuỳ ý để server giải mã/mint token (`integration-tokens.ts:6-15`). Nay chỉ gọi từ scan-folder đã auth. Refresh dùng `DROPBOX_CLIENT_SECRET`/`GOOGLE_CLIENT_SECRET`, ghi lại token mã hoá (`:96-105`).

**Google Sign-In** (`src/lib/google-auth.ts`) — dùng chung `GOOGLE_CLIENT_ID/SECRET`. Đáng chú ý (đã fix, ghi nhận): `User.email` KHÔNG unique → link bằng helper deterministic, **từ chối khi matchCount>1**, không bao giờ ghi googleId lên hàng LOCKED/CLIENT (`google-auth.ts:155-192`).

## 7. Inngest — `src/app/api/inngest/route.ts`, `src/lib/review/inngest.ts`

- `serve({client, functions})` chuẩn (`route.ts:11-14`); dựa vào **`INNGEST_SIGNING_KEY`** để Inngest tự verify request; middleware loại trừ toàn bộ `/api` nên không có session xen vào (`route.ts:1-3`). `runtime='nodejs'`.
- Client `new Inngest({id:'hustlytasker-review'})` (`inngest.ts:28`). Các function retry-safe, idempotent qua atomic flip + ledger `processedAt` set LAST (`inngest.ts:242-315`). `inngest.send` fire-and-forget, ledger là nguồn sự thật, reconcile nightly backstop.

## 8. Webhook Calendar — `src/app/api/webhooks/calendar/route.ts` ⚠️

- **KHÔNG verify chữ ký nào.** Comment thừa nhận (`route.ts:10-11`), auth header bị comment-out (`:12`). Echo `validationToken` cho MS Graph setup (`:15-18`).
- Hiện tại chủ yếu là **stub**: `body` chỉ được `console.log` (`route.ts:21`), phần map resourceId→userId và tạo `ScheduleException` là **TODO** đã comment (`route.ts:23-40`) — nên chưa có tác động ghi DB. Nhưng đây vẫn là **endpoint POST không xác thực** log JSON tuỳ ý (log-injection nhẹ). **Rủi ro thực sự khi TODO được nối dây**: bất kỳ ai cũng POST được để tạo block lịch (chèn `createScheduleException` đã import sẵn, `:2`) — cần verify chữ ký Google channel token / MS clientState TRƯỚC khi bật.

---

## Ghi chú lưu trữ secret
- **Token OAuth (Dropbox/GDrive):** mã hoá AES-256-GCM tại rest, model `IntegrationToken`, key `INTEGRATION_TOKEN_SECRET` (64 hex, validate độ dài, `src/lib/token-encryption.ts:19-33`). Format `base64(iv12+authTag16+ct)` — chuẩn.
- **Plaintext env (không mã hoá thêm):** `MUX_TOKEN_SECRET`, `MUX_SIGNING_PRIVATE_KEY`, `MUX_WEBHOOK_SECRET`, `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `GPT4_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BLOB_READ_WRITE_TOKEN`, `DROPBOX_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `INNGEST_SIGNING_KEY` — bình thường với env server, nhưng là danh sách "nếu lộ .env thì mất gì".

---

## D6 — Kiểm toán bề mặt Env/Secrets/Config (HustlyTasker)

## Phạm vi
Rà soát toàn bộ `process.env.*`, `NEXT_PUBLIC_*`, secret fallback hardcode, secret rò vào client bundle, và header/CSP ở `next.config.ts`. Chỉ đọc, không sửa file.

---

## 1. Bộ xác thực env trung tâm — `src/lib/env.ts`

- **JWT_SECRET có default placeholder hardcode trong mã nguồn**: `const JWT_SECRET_DEFAULT = "temporary-build-secret-key-change-me"` (`src/lib/env.ts:3`), gán làm `.default()` cho schema (`env.ts:7`). Đây là secret nằm trong source control.
- **Đã fail-closed đúng ở production** (`env.ts:36-42`): nếu `NODE_ENV==='production'`, KHÔNG phải build phase (`NEXT_PHASE !== 'phase-production-build'`), và `JWT_SECRET` vẫn là placeholder → `throw`. Đây là điểm phòng thủ tốt (được ghi chú là "AUDIT R1 — CRITICAL fix"). Hệ quả còn lại: trong **development/test hoặc trong build phase**, app vẫn chạy trên secret công khai này → mọi JWT ký ở môi trường đó có thể bị giả mạo. Chấp nhận được nhưng cần đảm bảo không có preview/staging nào chạy với `NODE_ENV !== 'production'`.
- **DATABASE_URL default `"placeholder_url_replace_me"`** (`env.ts:6,44-46`): KHÔNG fail-closed — chỉ `console.error` khi production thiếu URL (`env.ts:44`). Không phải secret nên rủi ro thấp, nhưng khác biệt xử lý so với JWT.
- `JWT_SECRET` min length chỉ **10 ký tự** (`env.ts:7`, `z.string().min(10)`) — yếu cho HS256; nên khuyến nghị ≥32 bytes.
- `env.JWT_SECRET` được tiêu thụ đúng một chỗ tập trung: `src/lib/jwt.ts:1,4` (`new TextEncoder().encode(env.JWT_SECRET)`), dùng cho jose HS256 sign/verify. Không có route nào đọc `process.env.JWT_SECRET` trực tiếp để ký (chỉ đọc để báo cáo trạng thái — xem mục 4). Tốt.

## 2. Inventory secret server-side (bí mật thực sự)

| Secret | Vị trí | Guard |
|---|---|---|
| `JWT_SECRET` | env.ts:20 → jwt.ts:4 | fail-closed prod (env.ts:37) |
| `DATABASE_URL` / `POSTGRES_URL` | env.ts:19; electron/main/next-server.ts:126; mcp-server/src/prisma-client.ts:12 | — |
| `RESEND_API_KEY` | src/lib/email.ts:5; test-email/route.ts:28 | null-guard (email.ts:10) |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | src/lib/review/mux.ts:22-23 | — |
| `MUX_SIGNING_KEY_ID` / `MUX_SIGNING_PRIVATE_KEY` | src/lib/review/mux-jwt.ts:23-24 | throw nếu thiếu (mux-jwt.ts:25) |
| `MUX_WEBHOOK_SECRET` | src/app/api/webhooks/mux/route.ts:24 | fail-closed verify (route.ts:25, timingSafeEqual :44) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | src/lib/review/r2.ts:25,30-31,38 | `requireEnv()` throw (r2.ts:41-45) |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` | (probe scripts; runtime qua lib/review/inngest) | — |
| `INTEGRATION_TOKEN_SECRET` | src/lib/token-encryption.ts:20 | throw nếu thiếu + bắt buộc 64 hex (token-encryption.ts:21-31) — tốt |
| `REVIEW_COOKIE_SECRET` | src/lib/review/share-auth.ts:43 | throw nếu <16 (share-auth.ts:44-45) |
| `SUPABASE_SERVICE_ROLE_KEY` | src/lib/storage.ts:28,46; src/lib/notification-broadcast.ts:9 | — |
| `GOOGLE_CLIENT_SECRET` / `DROPBOX_CLIENT_SECRET` | src/lib/google-auth.ts:54; src/lib/integration-tokens.ts:59,63; callbacks | — |
| `VAPID_PRIVATE_KEY` | src/lib/web-push.ts:15 | `|| ''` no-op nếu thiếu (web-push.ts:18-20) |
| `UPSTASH_REDIS_REST_TOKEN` / `_URL` | src/lib/rate-limit-upstash.ts:34-35 | — |
| `CRON_SECRET` | tất cả route cron + test-email (xem mục 4) | fail-closed |
| `GPT4_API_KEY` | src/lib/gemini-translator.ts:5,22; scripts | `|| ''` (xem mục 5) |
| `ADMIN_EMAIL` | src/app/api/test-email/route.ts:33 | — |

**Nhận xét:** hầu hết secret nhạy cảm cao (R2, INTEGRATION_TOKEN_SECRET, MUX signing, REVIEW_COOKIE_SECRET) đều throw/fail-closed khi thiếu — kỷ luật tốt. Không secret nào có **fallback là giá trị bí mật hardcode thực** (khác placeholder JWT). Không tìm thấy chuỗi `sk-…`, `AKIA…`, PEM `-----BEGIN`, hay connection-string `postgres://user:pass@` hardcode trong repo (grep toàn cây, 0 match).

## 3. NEXT_PUBLIC_* — không có secret bị gắn nhầm nhãn public

Toàn bộ biến `NEXT_PUBLIC_*` được dùng đều là dữ liệu công khai hợp lệ:
- `NEXT_PUBLIC_APP_URL` (email-templates, share links, OAuth redirect…) — URL, công khai.
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (src/lib/supabase.ts:18-19) — anon key **được thiết kế để lộ ra client**, đúng.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web-push.ts:14; push-actions.ts:15) — public key VAPID, đúng.
- `NEXT_PUBLIC_ENABLE_VELOX_V4_PREVIEW` (velox-v4-preview/page.tsx:9,21) — feature flag.

**Không có** `NEXT_PUBLIC_` nào chứa private key, service-role key, hay API secret. Đây là điểm cần một lens sau xác nhận lại nếu có thêm biến mới, nhưng hiện tại sạch.

## 4. Rò rỉ chẩn đoán qua endpoint `test-email` — cần chú ý

`src/app/api/test-email/route.ts` là endpoint diagnostic (comment ghi rõ *"DELETE after debugging"* nhưng vẫn còn trong repo):
- Trả về JSON liệt kê **prefix 6 ký tự đầu của `RESEND_API_KEY`**: `` `set (${process.env.RESEND_API_KEY.slice(0,6)}...)` `` (route.ts:28), cùng trạng thái set/unset của `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAIL`, `RESEND_FROM_EMAIL`, `EMAIL_SENDER_NAME` (route.ts:29-34).
- **Được bảo vệ bằng `CRON_SECRET`** (route.ts:13-22) nên không mở công khai, nhưng: (a) chấp nhận secret qua **query string** `?secret=` (route.ts:17) → lộ vào access-log/Referer; (b) so sánh **không constant-time** `key !== secret` (route.ts:20); (c) là endpoint còn sót đáng gỡ bỏ. Rủi ro: Low-Med, phụ thuộc CRON_SECRET.

## 5. Fallback / anti-pattern nhỏ

- `src/lib/gemini-translator.ts:4-5`: khởi tạo OpenAI client với `apiKey: process.env.GPT4_API_KEY || ''`. Tên biến (`GPT4_API_KEY`) là **misnomer** (thực chất là OpenAI key, model `gpt-4` — gemini-translator.ts:39), dễ gây nhầm khi cấu hình secret. Fallback `''` chỉ khiến gọi API fail (đã có guard `if (!process.env.GPT4_API_KEY)` ở :22), không phải secret leak.
- `src/lib/email.ts:6-7`: fallback **không bí mật** cho `RESEND_FROM_EMAIL` → `notification@hustlytasker.xyz` và `EMAIL_SENDER_NAME` → `HustlyTasker`. Vô hại.
- `src/lib/web-push.ts:16`: `VAPID_SUBJECT` fallback `mailto:notifications@hustlytasker.app` (khác domain `.xyz` ở email.ts — lệch domain, không phải secret).
- **So sánh CRON_SECRET không constant-time** ở tất cả cron route (`review-janitor/route.ts:26`, `send-digest`, `check-deadline`, `hard-delete-*`, `auth-cleanup`, `cleanup-notifications`) và test-email — dùng `key !== secret`. Timing-attack thực tế khó khai thác qua mạng nhưng là điểm nhất quán cần lưu ý.

## 6. Secret không rò vào client bundle

- `src/lib/supabase.ts` mang `'use client'` (supabase.ts:1) nhưng **chỉ** đọc `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY` (supabase.ts:18-19) — đúng chuẩn, không kéo service-role key vào client.
- `notification-broadcast.ts` (server) dùng `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY` (notification-broadcast.ts:9) — module server-side (fetch REST), không `'use client'`. An toàn.
- `web-push.ts` import `web-push` **động** để không vào client bundle (web-push.ts:9 comment). Tốt.
- Không phát hiện file `'use client'` nào import `env.ts` hay đọc secret non-public. (Cần lens D-frontend xác nhận sâu hơn theo import graph.)

## 7. Header & CSP — `next.config.ts:48-83`

Header bảo mật khá đầy đủ:
- `X-Frame-Options: DENY` (:65-66), `X-Content-Type-Options: nosniff` (:69), `Referrer-Policy: origin-when-cross-origin` (:73), `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self), geolocation=()` (:78).
- **CSP có `script-src 'self' 'unsafe-inline' 'unsafe-eval'`** (next.config.ts:61-62) — nới lỏng đáng kể: `unsafe-inline`+`unsafe-eval` vô hiệu hoá phần lớn giá trị chống-XSS của CSP (không dùng nonce/hash). Đây là điểm yếu cấu hình chính. Kèm `style-src 'unsafe-inline'`.
- `connect-src`/`media-src`/`img-src` dùng wildcard: `https://*.mux.com`, `*.vercel-storage.com`, `wss://*.livekit.cloud`, `https://*.r2.cloudflarestorage.com`, `*.supabase.co`, `images.unsplash.com` (:61-62). Bản Electron còn mở thêm `http://localhost:*` cho connect-src (:61). `frame-src 'self' *.frame.io` (:61-62) — vẫn cho nhúng frame.io dù dự án được cho là thay thế frame.io.
- CSP **không có `frame-ancestors`** (dựa vào X-Frame-Options DENY thay thế — chấp nhận được nhưng nên bổ sung `frame-ancestors 'none'`).
- `botid`/BotId chỉ bật khi thực sự trên Vercel (`process.env.VERCEL`, next.config.ts:95); off-Vercel dựa vào rate-limit + disposable-email guard (comment :92-94). Ảnh hưởng bảo mật thấp nhưng đáng ghi.

## Tổng kết mức độ
- **Không có** secret hardcode thực (ngoài placeholder JWT đã fail-closed) — sạch.
- **Không có** NEXT_PUBLIC nào là secret — sạch.
- Điểm cần theo dõi: CSP `unsafe-inline/unsafe-eval` (config weakness), endpoint `test-email` rò prefix RESEND key + nhận secret qua query, CRON_SECRET so sánh non-constant-time, `DATABASE_URL` placeholder không fail-closed, `GPT4_API_KEY` misnomer.

---

## D7 — Bản đồ hệ thống phân quyền HustlyTasker (role model, verifyWorkspaceAccess, review-module, share/guest, client-portal token)

## Tổng quan 2 trục vai trò

Hệ thống có **hai trục vai trò song song, KHÔNG lồng nhau**, cộng một trục tenant thứ ba (`ProfileAccess.role`) là trục thực sự quyết định quyền admin/finance:

1. **`User.role`** (global, trong JWT): `{ADMIN, USER, AGENCY_ADMIN, CLIENT, LOCKED}` — thuộc tính tài khoản, KHÔNG còn là "super admin" cho phân quyền workspace (đã gỡ ở "Sprint Z").
2. **`WorkspaceMember.role`** (String tự do, hierarchy `OWNER>ADMIN>MEMBER>GUEST` — `src/lib/workspace-roles.ts:12`): quyền trong 1 workspace cụ thể, dùng khi user có "explicit membership row".
3. **`ProfileAccess.role`** (`ProfileRole = {OWNER, ADMIN, USER, CLIENT}`): trục tenant. Đây mới là **nguồn chân lý chính** của quyền trong mô hình SaaS multi-tenant hiện tại (Profile → Workspaces → Members).

Điểm cốt lõi cần nhớ: **`User.role='ADMIN'` global KHÔNG còn tự động cấp quyền admin trên workspace**. `verifyActiveSession` (`security.ts:236-244`) đặt `isAdmin = !!dbUser.isTreasurer` — chỉ còn liên quan tài chính, comment nói rõ "super-admin pattern bị remove — không còn bypass". Nhưng `auth-guard.ts:47` vẫn còn `isSuperAdmin: user.role === 'ADMIN'` — một tàn dư ngữ nghĩa cũ (xem rủi ro).

---

## 1. `verifyWorkspaceAccess` — chokepoint BOLA/IDOR trung tâm

`src/lib/security.ts:44-186`. Đây là helper được gọi nhiều nhất (**50 file**). Chữ ký: `verifyWorkspaceAccess(workspaceId, requiredRole='MEMBER')`.

Luồng giải quyết quyền hiệu lực (`security.ts:100-155`):
- **DB liveness re-check** (`security.ts:62-70`): query `User.role` — nếu không tồn tại hoặc `LOCKED` → `SECURITY_VIOLATION`. Đây là điểm chống "cookie sống 7-30 ngày sau khi bị ban".
- **sessionVersion gate** (`security.ts:76-83`): nếu JWT `sessionVersion < DB` → reject. Bảo vệ "logout all devices"/reset password trên **write path** (bổ sung cho `verifyActiveSession` chỉ chặn read path). Coerce `null→0` cho legacy.
- **Thứ tự phân giải role (quan trọng về bảo mật):**
  1. `ProfileAccess.role === 'OWNER'` → `workspaceRole='OWNER'` (thấy MỌI workspace của profile) — `security.ts:105-107`.
  2. `ProfileAccess.role === 'ADMIN'` **và** `workspace.createdAt >= grantedAt` → `ADMIN` (chỉ workspace tạo SAU khi được cấp) — `security.ts:108-110`.
  3. **`ProfileAccess.role === 'CLIENT'` → `workspaceRole = null` (fail-closed)** — `security.ts:111-127`. Đây là fix HIGH "PE-1": nhánh CLIENT phải chạy TRƯỚC nhánh WorkspaceMember, nếu không một `WorkspaceMember` row cũ sót lại (do demote USER→CLIENT, script migration, hoặc task-assignment mint) sẽ được honor verbatim → cấp CLIENT quyền MEMBER/ADMIN nội bộ + rò `jobPriceUSD`.
  4. Fallback `WorkspaceMember` row explicit (`security.ts:128-155`): validate `isWorkspaceRole`, else `SECURITY_VIOLATION`. Nếu không có row nhưng có `profileAccess` (USER, hoặc ADMIN với workspace cũ hơn grantedAt) → hạ xuống `MEMBER` (cần cho USER được assign task cập nhật productLink/notes).
- `hasAtLeastRole(workspaceRole, requiredRole)` (`security.ts:163`, logic ở `workspace-roles.ts:33-37`).
- Trả về `{session, user, userId, workspaceRole, profileRole, isGlobalAdmin: false}`. `isGlobalAdmin` **@deprecated luôn false** (`security.ts:181`) — caller cũ `if(isGlobalAdmin)` sẽ rơi xuống nhánh khác.

**Bất biến then chốt:** "KHÔNG còn isGlobalAdmin bypass — mọi user phải có ProfileAccess hoặc WorkspaceMember explicit. Treasurer flag không override" (`security.ts:34-35`).

---

## 2. Các helper phái sinh (admin/finance)

- **`verifyProfileAdminAccess(workspaceId)`** — `security.ts:200-211` (**15 file**). Gọi `verifyWorkspaceAccess(_, 'MEMBER')` rồi yêu cầu `workspaceRole` ∈ {OWNER,ADMIN} **HOẶC** `profileRole` ∈ {OWNER,ADMIN}. Đây là **predicate DUY NHẤT an toàn cho quyền admin/finance**. Cố ý KHÔNG đọc `User.isTreasurer` global (đó chính là lỗ R8 CRITICAL: treasurer của profile A là USER/CLIENT của profile B mở được /admin của B, đọc lương + jobPriceUSD).
- **`verifyFinanceAccess(workspaceId)`** — `security.ts:222-226` (**7 file**): nay chỉ là alias `→ verifyProfileAdminAccess`. Hợp nhất finance VIEW với WRITE trên một predicate profile-scoped. Callers: `invoice-actions.ts` (36,226,285,343,510,559), `crm-actions.ts` (23,420 — chỗ rò jobPriceUSD), `api/invoices/generate`, `api/invoices/[id]/download`.
- **`verifyActiveSession()`** — `security.ts:190-263` (cache, **8 file**): read-path DAL guard. Trả `isAdmin = !!isTreasurer`. Dùng ở layout (`admin/layout.tsx:4`).
- **`getCurrentUser()`** — `auth-guard.ts:23-56` (cache, **8 file**): trả `AuthContext` với `isSuperAdmin: role==='ADMIN'` (tàn dư — xem rủi ro) và `isTreasurer`.

Consumers admin: `admin/layout.tsx:58`, `admin/payroll/page.tsx:34`, `team/(browser)/layout.tsx:38`+`page.tsx:15`+`folder/[folderId]/page.tsx:15`, `client-request-actions.ts:19`, `create-user.ts:24`, `study-place-actions.ts` (51,82,157,208).

---

## 3. `profile-permissions.ts` — RBAC cấp profile + liveness

`src/lib/profile-permissions.ts`. Ma trận quyền (`:26-33`): tạo workspace/mời member = OWNER|ADMIN; xóa member/đổi role/transfer ownership = OWNER only.

Predicates: `canCreateWorkspace`/`canInviteMember`/`canManageShareLinks` (=OWNER|ADMIN — `:75,80,92`); `canRemoveMember`/`canChangeMemberRole`/`canTransferOwnership` (=OWNER — `:96,100,104`). `canManageShareLinks` là cửa cho **client share link công khai** (`:92`).

`canAccessWorkspace(userId, workspaceId)` — `:122-142` (**3 file**): bản boolean của verifyWorkspaceAccess, cùng thứ tự (CLIENT→false trước, OWNER→true, ADMIN+cutoff, else WorkspaceMember row).

**`isSessionLive(session)`** — `:53-63` (**4 file**): liveness re-check cho các cửa mutation/PII-read xác thực bằng `getSession()` ĐƠN LẺ mà KHÔNG bao giờ đến verifyWorkspaceAccess — cụ thể `profile-member-actions.ts` và `cross-team-actions.ts`. Không có helper này, LOCKED account / session bị revoke vẫn invite/remove/transfer được. Đây là mảnh vá cho lỗ SI-1/SI-2/MISS-2.

`workspace-guards.ts` — TOÀN BỘ no-op deprecated (`ensureNotLastOwner`, `isLastOwner→false`): khái niệm OWNER cấp-workspace đã gỡ, Profile đảm bảo đúng 1 OWNER.

---

## 4. Xác thực guest / share-link (2 hệ TÁCH BIỆT hoàn toàn)

**Nguyên tắc chung: guest KHÔNG BAO GIỜ đi qua `requireReviewAccess`/session — token/slug LÀ credential.**

### 4a. Client-portal token — `src/lib/share-link-auth.ts`
- `resolveShareToken(rawToken, {recordAccess})` — `:78-198`: chokepoint DUY NHẤT cho `/share/[token]`. Token lookup bằng **SHA-256 hash-at-rest** (`hashShareToken` `:41`). **Uniform failure**: mọi nhánh reject (format sai, unknown, revoked, expired, client merged/deleted, profile deleted, rate-limited) đều trả `null` → 404 giống hệt nhau (chống enumeration). Rate limit per-IP 30/60s (`:99`), IP từ `x-forwarded-for` (`:60-72` — điểm cần soi XFF spoof).
- Scope trả về (`ShareLinkScope`): `clientIds[]` (resolve theo **name-path array** trong profile, kể cả sub-brand + merged survivor — `:130-190`), `workspaceIds[]` (TẤT CẢ workspace của profile kể cả archived — `:170-175`), `profileId`. clientId-scoping mới là biên bảo mật; workspace filter chỉ là "defensive belt".

### 4b. Review-module guest — `src/lib/review/share-auth.ts`
Hệ HOÀN TOÀN KHÁC cho `/r/{slug}`:
- `resolveShareGate(slug, cookies)` / `requireShare(...)` — `:105-152`: gate order CONTRACT `not_found(404)→revoked(410)→expired(410)→password(401)`. revoked và not_found cùng MESSAGE (anti-enumeration) dù status khác. Slug regex `nanoid(12)` `:59`.
- Hai cookie per-slug: `rv_unlock_{slug}` (JWT HS256 ký bằng `REVIEW_COOKIE_SECRET`, bind vào fingerprint password hiện tại `:169-188` → rotate password vô hiệu cookie); `rv_guest_{slug}` (32-byte random, DB chỉ lưu `sha256(token)` trên `GuestSession`).
- `getGuestSession`/`createGuestSession`/`resolveGuestForWrite` — `:216-320`: xác định danh tính guest cho write route.
- **`createLinkClientGuestSession`** + **auto-identity known-client** (`:270-300`): share gắn task → provision GuestSession danh tính AS client, email tổng hợp `.invalid` (`SYNTHETIC_CLIENT_EMAIL_DOMAIN='review.invalid'` `:82`), `emailVerifiedAt` được set. `isSyntheticGuestEmail` (`:84`) là guard chống lỗ H2: GuestSession trên địa chỉ tổng hợp KHÔNG được coi là email-verified cho quyết định client SIGN-OFF (nếu không, chỉ cần giữ slug là approve DƯỚI TÊN client). **Đây là vùng rủi ro cao nhất của guest-auth** — mọi surface đọc GuestSession để duyệt phải kiểm `isSyntheticGuestEmail`.
- `shareTokenTtlSec` `:339`: TTL token playback Mux/R2 = min(6h, tới hạn share).

### 4c. Route boundary — `src/lib/review/route-auth.ts`
`withReviewRoute` (internal, map ReviewAccessError→401/403, MuxError→502) vs `withShareRoute` (guest, một internal-auth throw ở đây LÀ BUG → map 500 để không rò envelope nội bộ).

---

## 5. `share-portal-actions.ts` — 17 action token-scoped

`src/actions/share-portal-actions.ts`. MỌI action đều re-resolve `resolveShareToken(token)` đầu hàm (không tin session). Authz primitive cho task-level là **`findScopedTask(token, taskId, select)`** — `:255-279`: lọc task bằng `clientId ∈ scope.clientIds AND workspaceId ∈ scope.workspaceIds AND isArchived:false` (fix R6 — chống approve task đã hủy).

Các action (read + mutation):
- Read: `getShareSnapshot` (:48), `getPortalNotifyEmail` (:301), `getSubmitOptionsViaToken` (:653), `getActivityViaToken` (:1020), `getCommentFeedViaToken` (:1062).
- Notify-email OTP: `requestPortalNotifyEmail` (:318, rate-limit 5/h per link+ip), `verifyPortalNotifyEmail` (:350, 10 attempts, OTP hash), `removePortalNotifyEmail` (:389), `unsubscribePortalNotify` (:408, dùng unsubToken riêng).
- **Mutation trạng thái task**: `approveDeliverableViaToken` (:489 → status 'Hoàn tất'+APPROVED, guard đã-approve, `actorUserId:null`, audit + IP), `requestChangesViaToken` (:533 → 'Revision'+CHANGES), `submitRatingViaToken` (:584, Rating unique per task, `ratedVia='SHARE_LINK'`, clientId=null).
- **Tạo dữ liệu**: `createTaskViaToken` (:684), `submitClientRequestViaToken` (:850), `createSubClientViaToken` (:960, rate-limit chặt hơn).
- Comment: `postCommentViaToken` (:1114), `toggleReactionViaToken` (:1188).

Điểm chú ý: các mutation này ghi `actorUserId: null` + `viaShareLinkId` + IP vào audit (`:516-521`) — provenance duy nhất để truy vết ai (giữ token) đã duyệt.

---

## 6. Surfaces xác thực bằng `getSession()` TRẦN (không tới verifyWorkspaceAccess)

`getSession()` (`auth.ts:73-84`) **cố ý KHÔNG check sessionVersion** (Edge-cheap). **68 file** import nó; trong `src/actions/` có 24 file. Những action xác thực bằng getSession đơn lẻ mà KHÔNG có workspaceId để scope (đặc biệt `profile-member-actions.ts`, `cross-team-actions.ts`) PHẢI tự gọi `isSessionLive` — đây là lớp dễ sót khi thêm action mới.

`middleware.ts` chỉ là **auth-guard mỏng** (`:69-115`): chặn path `/admin`,`/dashboard` khi thiếu cookie/sessionProfileId, đá CLIENT về /login, đặt `x-device-type`. `/share` và `/r/` được early-return CÔNG KHAI (`:52-68`) — không có Prisma ở Edge, quyền thực thi 100% ở page/action layer. Middleware KHÔNG phải biên phân quyền.

MCP `mcp__hustly-tasker__*` là server NGOÀI repo này (không tìm thấy route `/api/mcp` hay auth key trong `src/`) — cần audit riêng ở nơi khác.

---

## D8 — Bản đồ Ranh giới Tin cậy & Luồng Dữ liệu (HustlyTasker)

## Tổng quan: 4 vùng tin cậy + các cổng chuyển vùng

Kiến trúc chia thành 4 vùng tin cậy, với **middleware KHÔNG phải là cổng bảo mật thật** — nó chỉ định tuyến. Cổng thật nằm ở tầng DAL (Server Actions / route handlers). Điểm cấu trúc quan trọng nhất: `src/middleware.ts:168-170` matcher loại trừ TOÀN BỘ `/api` (`'/((?!api|_next/static|_next/image|favicon.ico).*)'`), nên **mọi route `/api/*` phải tự phân quyền** — không có lưới an toàn nào phía trên.

```
[Vùng 0] Khách vô danh (internet)
   ├── /r/[slug]        → guest review (slug + cookie rv_*)         GATE: resolveShareGate/requireShare
   ├── /share/[token]   → client portal (token 256-bit)             GATE: resolveShareToken
   ├── /api/cron/*      → cron                                       GATE: CRON_SECRET header
   ├── /api/webhooks/*  → Mux / Calendar                            GATE: HMAC (Mux) / NONE (Calendar)
   └── /api/inngest     → Inngest                                   GATE: INNGEST_SIGNING_KEY
        │
        │ (đăng nhập: jose HS256 JWT trong cookie httpOnly `session`)
        ▼
[Vùng 1] Staff đã xác thực (USER/ADMIN)  → getSession + verifyActiveSession
        │
        │ (verifyWorkspaceAccess — BOLA gate, workspaceId TỪ URL = UNTRUSTED)
        ▼
[Vùng 2] Staff trong 1 workspace/profile cụ thể (MEMBER/ADMIN/OWNER)
        │
        │ (verifyProfileAdminAccess / verifyFinanceAccess — lộ jobPriceUSD/lương)
        ▼
[Vùng 3] Quản trị tài chính profile-scoped
```

Chuyển vùng đặc biệt: **impersonation** (Vùng 3 → giả dạng Vùng 1/2) và **workspace/profile switch** (đổi scope trong Vùng 1→2).

---

## Ranh giới 1 — Khách vô danh → Guest review `/r/[slug]` (RỦI RO CAO NHẤT)

**Cái gì đi qua:** slug (địa chỉ mờ, không phải credential) + 3 loại cookie per-slug: `rv_unlock_{slug}` (JWT HS256 chứng minh nhập đúng mật khẩu), `rv_guest_{slug}` (token 32-byte, DB chỉ lưu sha256), `rv_t_{slug}` (throttle).

**Cái gì enforce:** `resolveShareGate()`/`requireShare()` tại `src/lib/review/share-auth.ts:76-109`. Thứ tự cổng là HỢP ĐỒNG: not_found(404) → revoked(410) → expired(410) → password(401), với thông điệp revoked ≡ not_found để chống dò (`share-auth.ts:99-103`). Mật khẩu gắn fingerprint của hash hiện hành (`passwordFingerprint`, `share-auth.ts:117,140`) nên đổi/xoá mật khẩu vô hiệu hoá mọi unlock cookie. Middleware chỉ gắn header chống-index (`src/middleware.ts:62-68`).

**Điểm nóng — chữ ký duyệt của khách (client sign-off):** `POST /api/r/[slug]/decision` → `submitGuestDecision()` (`src/lib/review/share-decision.ts:121-266`). Hai điều đáng chú ý cho lens sau:
- **Danh tính khách KHÔNG được xác minh (chủ dự án CỐ Ý miễn):** `share-decision.ts:144-152` — "mạo danh không quan trọng", chấp nhận name+email tự khai không cần PIN email. `signerName`/`signerEmail` được ghi vào activity/audit như thể là attribution xác thực (`share-decision.ts:213`), nhưng thực chất chưa chứng minh kiểm soát inbox. So sánh với auto-identity synthetic `@review.invalid` (`share-auth.ts:58-61,231-249`) vốn được đánh dấu `emailVerifiedAt` — cờ này phải KHÔNG BAO GIỜ được coi là email-verified cho một quyết định sign-off (đã có ghi chú AUDIT H2, cần verify không rò).
- **Cổng chặn thật là Gate 1:** chỉ nhận quyết định khi `asset.taskId` tồn tại VÀ `task.clientReview != null` (admin đã thực sự gửi vào luồng client-review) — `share-decision.ts:133-142`. Decision route KHÔNG tự đẩy task lên "Hoàn tất" (đó là H3, admin-only) — tốt.

**Rò tài sản (Mux/R2):** `POST /api/r/[slug]/playback-token` mint token Mux TTL=min(6h, hạn share) (`playback-token/route.ts:44`, `shareTokenTtlSec` `share-auth.ts:296-300`), có `assertVersionInShare` chặn version ngoài phạm vi share.

---

## Ranh giới 2 — Khách vô danh → Client portal token `/share/[token]` + `share-portal-actions`

**Cái gì đi qua:** token base64url 32-byte (`TOKEN_RX` `src/lib/share-link-auth.ts:35`). Token IS credential, không có session.

**Cái gì enforce:** `resolveShareToken()` — chokepoint duy nhất (`share-link-auth.ts:60-187`). Hash-at-rest (sha256), uniform-null cho MỌI nhánh lỗi (chống enumeration), rate-limit per-IP 30/60s (`share-link-auth.ts:69`). Phạm vi trả về là `{clientIds[], workspaceIds[], profileId}`; mọi truy vấn portal khoá bằng `clientId ∈ scope.clientIds ∧ workspaceId ∈ scope.workspaceIds` (`share-portal-actions.ts:55-56`). Null-guard đầy đủ (`share-portal-actions.ts:50,494,540`).

**Điểm nóng — LUỒNG DUYỆT THỨ HAI song song với review module:** `approveDeliverableViaToken()` (`share-portal-actions.ts:489-530`) đặt `status='Hoàn tất' + clientReview='APPROVED'` **chỉ bằng token, KHÔNG cần name/email nào cả** — chỉ giữ token là hoàn tất được task. "Hoàn tất" có hệ quả **payroll** (task hoàn thành → tính lương). Đây đúng là mâu thuẫn "2 luồng approve" mà CLAUDE.md review-fixes yêu cầu hợp nhất ("portal chỉ là VIEW"). Divergence: review-module decision KHÔNG complete task; portal token thì CÓ. `actorUserId: null` trong audit (`share-portal-actions.ts:517`) — không truy vết được ai bấm.

---

## Ranh giới 3 — Cron `/api/cron/*`

**Cái gì enforce:** `CRON_SECRET` qua `x-cron-secret`/`x-cron-key`/`Bearer`. **KHÔNG NHẤT QUÁN:**
- `auth-cleanup` dùng `timingSafeEqual` (`src/app/api/cron/auth-cleanup/route.ts:20-25`) — đúng.
- `check-deadline`, `review-janitor`, `hard-delete-workspaces`, `hard-delete-profiles`, `send-digest`, `cleanup-notifications` dùng so sánh chuỗi thường `key !== secret` (vd `src/app/api/cron/check-deadline/route.ts:27`, `hard-delete-workspaces/route.ts:37`) — timing side-channel (rủi ro thấp trên mạng, nhưng nên đồng nhất).
- Đứng sau cổng này có thao tác PHÁ HUỶ: `hard-delete-workspaces` xoá cascade toàn bộ task/member/audit (`hard-delete-workspaces/route.ts` docstring). Nếu `CRON_SECRET` rò/yếu → mất dữ liệu.

---

## Ranh giới 4 — Webhooks

**Mux** (`src/app/api/webhooks/mux/route.ts`): HMAC-SHA256 trên `{t}.{rawBody}`, `timingSafeEqual`, tolerance ±5 phút, fail-closed 401 (`mux/route.ts:23-58`); ledger `WebhookEvent` idempotent trên event id P2002 (`mux/route.ts:73-80`). Đọc raw body trước khi parse — đúng. Đây là mẫu tốt.

**Calendar** (`src/app/api/webhooks/calendar/route.ts`): **KHÔNG CÓ XÁC THỰC** — dòng auth bị comment (`calendar/route.ts:12`), toàn bộ xử lý là TODO/stub, hiện không ghi DB thật (`dummyUserId`, block createScheduleException bị comment). Vô hại HÔM NAY, nhưng nếu ai đó hoàn thiện mà quên bật auth → bất kỳ ai POST cũng chèn được ScheduleException/BLOCK vào lịch nhân sự. Lens sau phải chặn không cho luồng này "sống dậy" mà thiếu chữ ký.

**Inngest** (`src/app/api/inngest/route.ts`): `serve()` tự verify `INNGEST_SIGNING_KEY`; middleware loại trừ /api nên không có session can thiệp — OK.

---

## Ranh giới 5 — Impersonation (Vùng 3 → giả dạng)

`startImpersonation()` (`src/actions/impersonation-actions.ts:9-77`): đã vá chặt (AUDIT R1/R6) — yêu cầu caller là workspace ADMIN (`verifyWorkspaceAccess(workspaceId,'ADMIN')`), target phải là member của CHÍNH workspace đó, chặn leo cấp (không giả OWNER; chỉ OWNER mới giả được ADMIN) (`impersonation-actions.ts:41-44,58`). Session giả TTL 2h, session admin gốc cất ở cookie `admin_session` (`src/lib/auth.ts:76-114`).

**Điểm cần lens sau soi:** thu hồi impersonation KHÔNG enforce ở Edge (`src/middleware.ts:145` rolling-refresh cố ý bỏ qua impersonation để không gia hạn TTL). Cổng thu hồi thật là `sessionVersion` tại DAL (`verifyActiveSession` `src/lib/security.ts:257-269`). `stopImpersonationSession` fallback `delete('session')` nếu mất `admin_session` (`auth.ts:131-134`).

---

## Ranh giới 6 — Workspace/Profile switch `/api/profile/select`

`src/app/api/profile/select/route.ts`: verify `user.profileId === profileId` HOẶC có `ProfileAccess` row (`select/route.ts:41-56`), đã bỏ bypass global-ADMIN (AUDIT R1). Re-sign JWT nhúng `sessionProfileId`.

**Điểm cần soi:** route chấp nhận `sessionToken` TỪ BODY làm fallback giải mã khi `cookies()` fail (Edge cache workaround, `select/route.ts:19-25`) — token vẫn được `decrypt()` kiểm tra chữ ký nên không phải forgery trực tiếp, nhưng là một đường nạp session thay thế cần verify không thể dùng token cũ/khác ngữ cảnh. Route này chỉ kiểm tra ProfileAccess TỒN TẠI, không lọc `role==='CLIENT'` tại đây (CLIENT bị chặn ở middleware `src/middleware.ts:88-90` + DAL PE-1) — defense-in-depth phụ thuộc tầng khác.

---

## Ranh giới 7 — Cross-tenant (BOLA/IDOR) — cổng lõi Vùng 1→2→3

`verifyWorkspaceAccess()` (`src/lib/security.ts:38-165`) là cổng chống IDOR cho MỌI staff surface: workspaceId từ URL là UNTRUSTED. Logic: profile OWNER→OWNER; profile ADMIN chỉ workspace tạo sau `grantedAt`→ADMIN; WorkspaceMember row explicit; **CLIENT ProfileAccess fail-closed TRƯỚC nhánh membership** (AUDIT PE-1, `security.ts:109-119`) — một CLIENT không thể bị "nâng" bởi membership row lạc. Enforce `sessionVersion` cho cả write path (`security.ts:77-81`).

Tài chính: `verifyProfileAdminAccess`/`verifyFinanceAccess` (`security.ts:180-207`) — cố ý KHÔNG dùng cờ global `isTreasurer` (đó chính là gốc rò jobPriceUSD/lương cross-tenant R7/R8). `requireReviewAccess` tính `isAdmin` theo workspace-scope chứ không theo global role (`src/lib/review/access.ts:56-61`).

**Lỗ hổng cấu trúc để lens sau tập trung:** vì middleware KHÔNG kiểm membership (chỉ CLIENT-redirect + sự hiện diện `sessionProfileId`, `src/middleware.ts:88-100`), một page/route nào QUÊN gọi `verifyWorkspaceAccess` sẽ lộ hoàn toàn. Đây là bề mặt "thiếu cổng" đáng soi nhất: liệt kê mọi `/[workspaceId]/**` page và mọi `/api/**` handler, đối chiếu có gọi cổng verify tương ứng không, đặc biệt các GET đọc dữ liệu (verifyActiveSession không tự khoá workspace).

---
