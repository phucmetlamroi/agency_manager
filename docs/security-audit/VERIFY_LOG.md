# VERIFY_LOG.md — Xác minh lại 42 phát hiện trên code hiện tại

> Ngày 2026-07-29 · Nhánh `claude/security-remediation-2026-07` (tách từ `815ee89`).
> Bản kiểm toán gốc viết trên `claude/cranky-austin` (72e6457). Nhánh này đi TRƯỚC **41 commit**, nên
> mọi số dòng trong FINDINGS.md đều không còn tin được — xác minh định vị theo tên hàm, không theo số dòng.

## Cách làm

9 agent chia 42 ID theo cụm file, mỗi agent tự đọc finding gốc rồi tự đọc code hiện tại. Sau đó **4 agent
phản biện độc lập** nhận 29 kết luận "đã an toàn" kèm lệnh cố bác bỏ. Lý do dồn sức vào hướng đó: một
finding bị chấm nhầm "đã vá" sẽ bị xoá khỏi sổ vĩnh viễn, còn chấm nhầm "chưa vá" chỉ tốn công đọc lại.

**Phản biện lật ngược 5/29 kết luận** — HT-007, HT-015, HT-022, HT-023, HT-031. Cả 5 đều có bản vá THẬT
trong cây code, nhưng mỗi bản chỉ bịt một phần đường vào. Nếu tin agent đầu thì 5 lỗ này đã bị đóng sổ oan.

## Tổng kết

| Trạng thái | Số ID |
|---|---|
| ĐÃ VÁ (đã qua phản biện) | 24 |
| **CHƯA VÁ** | **18** — trong đó 6 High |
| KHÔNG CÒN REACHABLE | 0 |
| Tổng | 42 |

**Cần vá:** `HT-002` (High) · `HT-006` (High) · `HT-007` (High) · `HT-015` · `HT-018` · `HT-020` · `HT-021` · `HT-022` (High) · `HT-023` · `HT-026` · `HT-029` (High) · `HT-031` (High) · `HT-033` · `HT-035` · `HT-037` · `HT-038` · `HT-039` · `HT-040`

Không ID nào rơi vào KHÔNG CÒN REACHABLE — mọi đường dẫn code mà bản kiểm toán trỏ tới đều vẫn sống.

---

## Bảng xác minh

| ID | Mức | Trạng thái | Vị trí (cây hiện tại) | Tóm tắt bằng chứng |
|----|-----|-----------|----------------------|--------------------|
| [HT-001](#ht-001) | High | **ĐÃ VÁ** | package.json:10 · scripts/maybe-db-push.mjs · prisma/schema.prisma:695 | package.json:10 — "postinstall": "prisma generate && node scripts/maybe-db-push.mjs". Chuỗi `prisma db push --accept-data-loss` KHÔNG còn tồn tại ở bất kỳ script thực thi nào (grep 'accept-data-loss' toàn worktree chỉ còn 1 hit là COMMENT ở prisma/schema.prisma:695). ChẶN TỪNG BƯỚC của kịch bản khai thác ("một lần npm … |
| [HT-002](#ht-002) | High | **CHƯA VÁ** | src/actions/signup-actions.ts:78 · src/actions/signup-actions.ts:188 · src/actions/password-reset-actions.ts:57 | Mới vá ĐƯỢC 1/5 điểm mà finding liệt kê. Ba bucket rate-limit Upstash vẫn key theo token TRÁI CÙNG của x-forwarded-for, tức bước cốt lõi của kịch bản khai thác ("gửi mỗi request kèm x-forwarded-for: <random-IP> và xoay vòng") VẪN CHẠY: 1) src/actions/signup-actions.ts:78 (trong getRequestMeta) — ip = h.get('x-forwarded… |
| [HT-003](#ht-003) | High | **ĐÃ VÁ** | src/actions/impersonation-actions.ts:46-74 · src/lib/profile-permissions.ts:24-31 · src/components/admin/analytics/LivePresenceBoard.ts | src/actions/impersonation-actions.ts:46-74 (khối `[AUDIT HT-003/004 fix]`, thêm bởi commit bfca2e6). Chặn CHÍNH XÁC bước 3 của kịch bản ("A calls startImpersonation(V.id, W): targetMember.role='MEMBER', targetPa.role='USER' → all guards pass"). Dòng 51: `const currentProfileId = ws?.profileId ?? null` Dòng 53-58: `pris… |
| [HT-004](#ht-004) | High | **ĐÃ VÁ** | src/actions/impersonation-actions.ts:46-74 | Cùng khối vá với HT-003: src/actions/impersonation-actions.ts:46-74. Riêng biến thể HT-004 (V vào W qua tính năng cross-team 'du học' → có WorkspaceMember row) bị chặn ở HAI nhánh độc lập: (a) Nhánh ProfileAccess — bước 3 kịch bản ("targetPa for A is USER (not OWNER/ADMIN), so both guards pass"): dòng 53-58 truy vấn `p… |
| [HT-005](#ht-005) | High | **ĐÃ VÁ** | src/actions/invoice-actions.ts:614-653 | src/actions/invoice-actions.ts:614-653 (voidInvoice). Kịch bản gốc: 2 POST đồng thời cùng invoiceId, cả hai qua guard tiền-transaction rồi cả hai chạy `depositBalance += invoice.depositDeducted`. CHẶN TẠI: (a) dòng 615 `await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 0))`` — câu lệnh ĐẦ… |
| [HT-006](#ht-006) | High | **CHƯA VÁ** | src/actions/share-portal-actions.ts:765-834 · src/actions/share-portal-actions.ts | src/actions/share-portal-actions.ts:765-834 `approveDeliverableViaToken`. Cái ĐÃ thêm (từ bộ vá HT-014, commit bfca2e6) là dòng 780-782: `if (!isClientFacingPhase(task.status, task.clientReview)) return { success:false, error:'This deliverable is not currently awaiting your review.' }` — chặn được vế 'bản dựng CHƯA qua… |
| [HT-007](#ht-007) | High | **CHƯA VÁ** ⚠️ LẬT | src/actions/task-management-actions.ts:48-54 · src/lib/prisma-workspace.ts:138-141 | BÁC BỎ. Ba dòng src/actions/task-management-actions.ts:52-54 chỉ xoá KHOÁ SCALAR (`data.id`/`data.workspaceId`/`data.profileId`) — đây là blacklist, không phải whitelist như đề xuất gốc ở FINDINGS.md dòng 144. `data` vẫn là `any` truyền NGUYÊN VẸN vào `workspacePrisma.task.update({ where: { id }, data })` ở :107. Đường… |
| [HT-008](#ht-008) | High | **ĐÃ VÁ** | src/lib/pricing-engine.ts:270 · src/lib/pricing-engine.ts:175 · src/lib/pricing-engine.ts:180 | src/lib/pricing-engine.ts:270 — `numResult = safeEvalArithmetic(expression)` đã THAY THẾ hoàn toàn `new Function('Math', ...)`. Grep 'new Function' trên toàn bộ src/ = 0 hit; regex `safePattern` chứa \w cũng không còn tồn tại (grep 'safePattern' = 0 hit). Chặn từng bước của kịch bản khai thác payload `Math.constructor(… |
| [HT-009](#ht-009) | Med | **ĐÃ VÁ** | src/actions/bonus-actions.ts:335-422 | src/actions/bonus-actions.ts:335-422 (calculateMonthlyBonus). Kịch bản gốc: 2 lời gọi đồng thời cùng qua check lock dòng 151, mỗi bên chạy $transaction (deleteMany + upsert lock) rồi tạo bonus/rank NGOÀI transaction → deleteMany của bên này xoá row bên kia vừa tạo / đụng unique P2002 sau khi lock đã commit. CHẶN TẠI: (… |
| [HT-010](#ht-010) | Med | **ĐÃ VÁ** | src/actions/password-reset-actions.ts:115-122 | src/actions/password-reset-actions.ts:115-122 — nhánh cooldown giờ trả về ĐÚNG hằng generic, không còn message riêng: ``` if (recent) { // [AUDIT HT-010 fix] Return the SAME neutral response as the not-found/locked branch above. await paddingDelay() return GENERIC_OTP_RESPONSE } ``` Chặn bước 2 của kịch bản: request th… |
| [HT-011](#ht-011) | Med | **ĐÃ VÁ** | src/actions/price-template-actions.ts:76-79 | src/actions/price-template-actions.ts:76-79 — delete đã được scope theo workspaceId: ``` const { count } = await prisma.priceTemplate.deleteMany({ where: { id, workspaceId } }) if (count === 0) return { error: 'Không tìm thấy mẫu giá trong workspace này.' } ``` Chặn bước cuối của kịch bản: attacker vẫn qua được `verify… |
| [HT-012](#ht-012) | Med | **ĐÃ VÁ** | src/actions/price-template-actions.ts:76-79 | src/actions/price-template-actions.ts:76-79 (cùng dòng với HT-011) — `prisma.priceTemplate.deleteMany({ where: { id, workspaceId } })` + `if (count === 0) return { error: ... }`. Chặn chính xác bước 'delete({ where: { id: victimTemplateId } }) khớp và xoá row của tenant B': WHERE nay là cặp (id, workspaceId) nên victim… |
| [HT-013](#ht-013) | Med | **ĐÃ VÁ** | src/actions/profile-actions.ts:198-210 | src/actions/profile-actions.ts:198-210 — field `email` đã bị GỠ HẲN khỏi payload ghi DB: ``` await prisma.user.update({ where: { id: targetId }, data: { nickname: data.nickname || null, phoneNumber: data.phoneNumber || null, // [AUDIT HT-013 fix] Email is intentionally NOT writable here... } }) ``` Chặn bước duy nhất c… |
| [HT-014](#ht-014) | Med | **ĐÃ VÁ** | src/actions/share-portal-actions.ts | src/actions/share-portal-actions.ts. (1) approveDeliverableViaToken dòng 780-782: `if (!isClientFacingPhase(task.status, task.clientReview)) { return { success: false, error: 'This deliverable is not currently awaiting your review.' } }` — chặn CHÍNH BƯỚC 'client POST thẳng approveDeliverableViaToken({token, taskId}) v… |
| [HT-015](#ht-015) | Med | **CHƯA VÁ** ⚠️ LẬT | src/actions/share-portal-actions.ts:600-603 · src/lib/review/rate-limit-db.ts:17-38 | BÁC BỎ. Cap per-inbox CÓ THẬT (share-portal-actions.ts:600-603, limitDb bền trên Postgres, đặt trước sendEmail :617), nhưng nó KHÔNG chặn được kịch bản của finding với một lớp nạn nhân lớn, vì hàm chuẩn hoá bị làm yếu có chủ đích. notifyInboxKey (:540-562) CHỈ strip '+tag' khi domain nằm trong PLUS_ALIAS_DOMAINS (:531-… |
| [HT-016](#ht-016) | Med | **ĐÃ VÁ** | src/actions/task-actions.ts:88-96 · src/lib/task-statuses.ts:166 · task-management-actions.ts:79 | src/actions/task-actions.ts:88-96, nằm trong khối `if (!isWorkspaceAdmin)` (:84): `const enteringClientPhase = isClientFacingStatus(newStatus) && !isClientFacingStatus(task.status)` (:93) và `if (enteringTerminal || leavingTerminal || enteringClientPhase) return { error: 'Forbidden: Chỉ quản lý (admin) mới được ... gửi… |
| [HT-017](#ht-017) | Med | **ĐÃ VÁ** | src/app/api/integrations/scan-folder/route.ts:113-122 · NextResponse.js · src/lib/review/rate-limit-db.ts:25-32 | src/app/api/integrations/scan-folder/route.ts:113-122 — rate-limit đặt NGAY SAU authz và TRƯỚC mọi thao tác quét: ``` const scanRl = await limitDb(`scan-folder:${session.user.id}:${workspaceId}`, 10, 60) if (!scanRl.success) { return NextResponse.json({ error: 'Quá nhiều yêu cầu quét...' }, { status: 429, headers: { 'R… |
| [HT-018](#ht-018) | Med | **CHƯA VÁ** | src/lib/auth.ts:51-54 · src/app/api/auth/logout/route.ts · src/actions/auth-actions.ts:404-420 | Đường logout THẬT vẫn không bump sessionVersion. Có một hàm ĐÃ vá nhưng là CODE CHẾT. 1) src/lib/auth.ts:51-54 — nguyên vẹn như finding mô tả: `export async function logout() { const cookieStore = await cookies(); cookieStore.set('session', '', { expires: new Date(0) }) }` → chỉ xoá cookie trình duyệt. 2) src/app/api/a… |
| [HT-019](#ht-019) | Med | **ĐÃ VÁ** | src/lib/auth.ts:76-96 · src/lib/jwt.ts:16-22 · jwt.ts:24-29 | src/lib/auth.ts:76-96, `createImpersonationSession()` — TTL mật mã đã được truyền tường minh, chặn bước 4 của kịch bản ("kẻ giữ được chuỗi cookie đó vẫn có thể set lại và request ... trong tối đa 7 ngày"). Dòng 88-96 (phiên đóng vai): `const impersonatedSessionStr = await encrypt({ user: { ...targetUser, isImpersonatin… |
| [HT-020](#ht-020) | Med | **CHƯA VÁ** | src/lib/review/comments.ts:639-644 · src/app/api/r/[slug]/comment-attachments/initiate/route.ts:39 · src/lib/review/comments.ts:82-88 | Chỉ nhánh MEMBER được vá, nhánh GUEST — đúng nhánh mà kịch bản khai thác dùng — vẫn nguyên. Đã vá (member): src/lib/review/comments.ts:639-644 `if (!/^image\//.test(input.mimeType) || /svg/i.test(input.mimeType)) throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ đính kèm được ảnh (không hỗ trợ SVG).')` với comment `[A… |
| [HT-021](#ht-021) | Med | **CHƯA VÁ** | src/lib/review/share-auth.ts:336-356 · src/app/api/r/[slug]/comments/route.ts:57 · comments/[id]/reactions/route.ts:31 | Toàn bộ chuỗi khai thác còn nguyên. Bước 1 (comment ẩn danh → tự nhận danh tính khách): src/lib/review/share-auth.ts:336-356 `resolveGuestForWrite` vẫn kết thúc bằng `const linkGuest = await createLinkClientGuestSession(share, { userAgent }); if (linkGuest) return linkGuest` (dòng 353-354), và `createLinkClientGuestSes… |
| [HT-022](#ht-022) | High | **CHƯA VÁ** ⚠️ LẬT | src/actions/global-settings.ts:20-28 · src/lib/security.ts:278 | BÁC BỎ — kịch bản khai thác của finding CHẠY NGUYÊN VẸN. Cổng mới ở src/actions/global-settings.ts:22-28 hỏi: `prisma.workspaceMember.findFirst({ where: { userId: uid, role: { in: ['OWNER','ADMIN'] } } })` — chú ý KHÔNG có ràng buộc workspaceId/profileId, tức là 'có phải OWNER/ADMIN của BẤT KỲ workspace nào không'. Như… |
| [HT-023](#ht-023) | Med | **CHƯA VÁ** ⚠️ LẬT | src/actions/cross-team-actions.ts:200-205 | BÁC BỎ (vá MỘT NỬA). Guard mới src/actions/cross-team-actions.ts:203-205 đúng là chặn nhánh target ADMIN (tôi xác nhận nó nằm trước $transaction ở :219-233). NHƯNG finding HT-023 bao trùm cả 'thành viên' — tiêu đề FINDINGS.md:400 ghi rõ 'gỡ đồng-cấp ADMIN / THÀNH VIÊN', và câu cuối Kịch bản khai thác (FINDINGS.md:406) … |
| [HT-024](#ht-024) | Med | **ĐÃ VÁ** | src/actions/invoice-actions.ts · prisma/schema.prisma:765 | src/actions/invoice-actions.ts. Kịch bản gốc bước 1: tạo hoá đơn customPrepaid=500, applyDeposit=false → invoice.depositDeducted lưu 500 nhưng depositBalance không đổi; bước 2: voidInvoice → `depositBalance: { increment: 500 }`. CHẶN TẠI: (a) dòng 411 khi create luôn set `clientDepositDeducted: 0` (không còn null cho h… |
| [HT-025](#ht-025) | Med | **ĐÃ VÁ** | src/actions/share-link-actions.ts:25-44 · src/lib/profile-permissions.ts:46-56 | src/actions/share-link-actions.ts:25-44 `gateShareLinkAdmin`. Dòng 31-33 CHÍNH LÀ chỗ chặn bước 2 của kịch bản ('A dùng cookie cũ POST thẳng tới createClientShareLink'): `if (!(await isSessionLive(session))) { return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' } }` — đặt NGAY SAU getSession() … |
| [HT-026](#ht-026) | Med | **CHƯA VÁ** | src/actions/task-comment-actions.ts:274-284 · src/actions/task-comment-actions.ts:356-362 · src/actions/task-comment-actions.ts:371-374 | NỬA ĐÃ VÁ (đường @mention) — src/actions/task-comment-actions.ts:274-284 trong createTaskComment(): ``` let notifyTargets = mentions.filter((m) => m !== userId) if (visibility === 'INTERNAL' && notifyTargets.length > 0) { const rows = await prisma.user.findMany({ where: { id: { in: notifyTargets } }, select: { id: true… |
| [HT-027](#ht-027) | Med | **ĐÃ VÁ** | src/lib/review/folders.ts:1455-1466 · src/lib/review/folder-scope.ts:127-130 · folder-scope.ts:109-112 | src/lib/review/folders.ts:1455-1466 (restoreItems, ngay sau `const access = await requireReviewAccess({ workspaceId })` ở dòng 1450): ``` if (!access.isAdmin) { const forbidden = folderRows.find((f) => f.createdById !== access.userId) if (forbidden) { throw apiError(403, 'FORBIDDEN', 'Chỉ người tạo hoặc quản trị được k… |
| [HT-028](#ht-028) | Med | **ĐÃ VÁ** | src/lib/review/folders.ts:1285-1291 · src/lib/review/folder-scope.ts:103-106 · src/app/api/review/trash/route.ts | src/lib/review/folders.ts:1285-1291 (listTrash): ``` if (!access.isAdmin) { const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin }) if (!scope.unrestricted) { rootFolders = rootFolders.filter((f) => isPathVisible(scope, f.path)) rootAssets = rootAssets.filt… |
| [HT-029](#ht-029) | High | **CHƯA VÁ** | electron/builder.config.js:73-78 · next.config.ts:32 · next.config.ts | (a) Cấu hình build KHÔNG chặn .env: electron/builder.config.js:73-78 `extraResources: [{ from: '../.next/standalone', to: 'standalone', filter: ['**/*'] }, ...]` — không có mẫu loại trừ nào kiểu '!**/.env'; next.config.ts:32 `...(process.env.ELECTRON_DESKTOP ? { output: 'standalone' as const } : {})` và toàn file next.… |
| [HT-030](#ht-030) | High | **ĐÃ VÁ** | src/actions/invoice-actions.ts | src/actions/invoice-actions.ts — cùng bộ vá với HT-024 nhưng phủ luôn nhánh clamp mà HT-030 mô tả. Kịch bản gốc: (1) clientDepositDeducted lớn hơn available nên bị clamp, depositBalance chỉ bị trừ phần thực; (2) void refund theo invoice.depositDeducted (= deposit thực + customPrepaid) → chênh lệch là credit khống. CHẶN… |
| [HT-031](#ht-031) | High | **CHƯA VÁ** ⚠️ LẬT | src/actions/update-task-details.ts:13-20 · src/components/portal/calm/DeliverableDetailPanel.ts · src/components/portal/desk/DeliverableSheet.ts | BÁC BỎ. Lỗ hổng stored-XSS qua productLink VẪN CÒN, và agent kia sai về mặt sự kiện khi khẳng định 'chỉ ADMIN mới còn lưu được javascript:'. ĐƯỜNG GHI THỨ HAI, chưa lọc, do CHÍNH EDITOR trong finding gọi được: src/actions/task-management-actions.ts (dòng 1 là 'use server' → server action = POST endpoint công khai). Hàm… |
| [HT-032](#ht-032) | Med | **ĐÃ VÁ** | src/actions/payroll-actions.ts:43-62 | src/actions/payroll-actions.ts:43-62 (confirmPayment). Kịch bản gốc: sau khi kỳ đã khoá+PAID, admin POST confirmPayment({userId: nạn nhân, totalAmount: 999999999, ...}) → upsert ghi đè số lương đã khoá. CHẶN TẠI: dòng 47-50 `const cycleLock = await workspacePrisma.payrollLock.findUnique({ where:{ month_year_workspaceId… |
| [HT-033](#ht-033) | Med | **CHƯA VÁ** | src/actions/profile-actions.ts:232-266 · src/actions/workspace-actions.ts:12-29 · src/lib/profile-permissions.ts:71-74 | Kịch bản ban-evasion trong finding (X bị LOCKED → createProfileForUser → createWorkspaceAction) VẪN CHẠY. (1) src/actions/profile-actions.ts:232-266 createProfileForUser: auth duy nhất là `const session = await getSession()` (:233) + `if (!session?.user?.id)` (:234), sau đó chỉ có rate-limit 5 profile (:244-252) rồi `t… |
| [HT-034](#ht-034) | Med | **ĐÃ VÁ** | src/actions/tracking-actions.ts:157-164 | src/actions/tracking-actions.ts:157-164 thêm helper callerIsClient và gọi ở đầu cả 4 hàm (getSessionTrends:173, getRecentEventLogs:224, getFrictionData:267, getLivePresence:318), mỗi chỗ đều `if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];` ``` async function callerIsClient(userId, profi… |
| [HT-035](#ht-035) | Med | **CHƯA VÁ** | src/lib/email-templates.ts:11-14 · src/lib/email-templates.ts · src/actions/admin-actions.ts:312 | Chỉ MỘT template (taskDelivered) được escape; các vector khác mà finding nêu đích danh vẫn nội suy thô. Đã vá: src/lib/email-templates.ts:11-14 `safeEmailUrl` (`/^https?:\/\//i.test(s) ? escapeHtml(s) : ''`) + dòng 121-124 `escapeHtml(userName/taskTitle/clientName)` + dòng 134-136 chỉ emit `<a href="${safeLink}">` khi … |
| [HT-036](#ht-036) | High | **ĐÃ VÁ** | mcp-server/src/services/guards.ts:15-24 · mcp-server/src/services/assign-service.ts:30 · assign-service.ts:145 | Guard mới: mcp-server/src/services/guards.ts:15-24 `export async function assertWorkspaceMember(wsId, userId) { const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: wsId, userId }, select: { id: true } }); if (!member) throw new Error(`User ${userId} is not a member of workspace ${wsId}`) }`. C… |
| [HT-037](#ht-037) | Med | **CHƯA VÁ** | electron/main/ipc-handlers.ts:18-20 · electron/main/env-manager.ts:85-87 · env-manager.ts:11-20 | electron/main/ipc-handlers.ts:18-20 `ipcMain.handle('env:get-all', () => { return getAllEnvVars() })` — không kiểm event.sender/origin, không lọc key. electron/main/env-manager.ts:85-87 `export function getAllEnvVars(): EnvSchema { return { ...store.store } }` trả NGUYÊN object, schema (env-manager.ts:11-20) gồm DATABA… |
| [HT-038](#ht-038) | Med | **CHƯA VÁ** | electron/main/ipc-handlers.ts:22-24 · electron/main/env-manager.ts:92-97 · electron/main/preload.ts:22-23 | electron/main/ipc-handlers.ts:22-24 nguyên văn `ipcMain.handle('env:set', (_event, key: string, value: string) => { setEnvVar(key as any, value) })` — vẫn `key as any`, không allowlist key, không validate value, không kiểm sender. electron/main/env-manager.ts:92-97 `export function setEnvVar<K extends keyof EnvSchema>(… |
| [HT-039](#ht-039) | Med | **CHƯA VÁ** | electron/main/setup-wizard.ts:93-99 · setup-wizard.ts:56-61 · preload.ts:65 | electron/main/setup-wizard.ts:93-99 nguyên văn: `const client = new Client({ connectionString, connectionTimeoutMillis: 8000, ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined })`. Đúng nghịch lý mà finding mô tả: chuỗi có sslmode=require lại bị hạ xuống chấp nhận mọi cert. H… |
| [HT-040](#ht-040) | Med | **CHƯA VÁ** | mcp-server/src/services/status-service.ts:97-116 · status-service.ts:130 · assign-service.ts:51 | mcp-server/src/services/status-service.ts:97-116: `const updated = await wsPrisma.task.update({ where:{id:taskId}, data:updateData, select:{...} })` rồi `return {...}` — KHÔNG có prisma.auditLog.create, không $transaction bọc audit. Grep toàn bộ mcp-server/src cho 'auditLog|audit(' chỉ ra ĐÚNG 1 kết quả duy nhất, và nó… |
| [HT-041](#ht-041) | Med | **ĐÃ VÁ** | mcp-server/src/services/task-service.ts:63-65 · mcp-server/src/services/guards.ts:27-38 · prisma/schema.prisma:511-518 | mcp-server/src/services/task-service.ts:63-65: `// [AUDIT HT-041 fix] ... await assertClientInProfile(data.clientId)` — nằm TRƯỚC khi build createData (dòng 71, gán clientId dòng 73) và trước `wsPrisma.task.create({ data, include: { client: {select:{id,name}} } })` ở dòng 98-104. Thân guard: mcp-server/src/services/gua… |
| [HT-042](#ht-042) | Med | **ĐÃ VÁ** | src/lib/review/download-zip.ts:110-113 · src/app/api/review/download-zip/route.ts:67 | src/lib/review/download-zip.ts:110-113 (nhánh FOLDER trong collectZipFiles — đúng chỗ finding chỉ là `zipPath: `${prefix}${x.relPath}``): ``` const zipPath = [ ...(multiRoot ? [sanitizeSegment(f.name)] : []), ...x.relPath.split('/').map(sanitizeSegment), ].filter(Boolean).join('/') entries.push({ r2Key, zipPath }) ``` … |

_Bằng chứng đầy đủ của từng ID nằm ở phần dưới — cột trên chỉ là tóm tắt._

---

## Bằng chứng đầy đủ theo từng ID

### HT-001

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
package.json:10 — "postinstall": "prisma generate && node scripts/maybe-db-push.mjs". Chuỗi `prisma db push --accept-data-loss` KHÔNG còn tồn tại ở bất kỳ script thực thi nào (grep 'accept-data-loss' toàn worktree chỉ còn 1 hit là COMMENT ở prisma/schema.prisma:695).

ChẶN TỪNG BƯỚC của kịch bản khai thác ("một lần npm install trên máy/CI có sẵn env prod = biến đổi/mất dữ liệu prod"):
• Bước 1 — npm install tự chạy db push: BỊ CHẶN tại scripts/maybe-db-push.mjs:50-55 →
    if (process.env.ALLOW_DB_PUSH !== '1') {
        console.log('  [maybe-db-push] BỎ QUA `prisma db push` (mặc định).')
        ... process.exit(0)
    }
  Mặc định (không ai đặt ALLOW_DB_PUSH) tiến trình thoát 0 TRƯỚC khi tới spawnSync ở dòng 84. postinstall không còn chạm DB.
• Bước 2 — thiếu DATABASE_URL thì fail-open: BỊ CHẶN tại :66-72 → `if (!url) { console.error('DỪNG — ALLOW_DB_PUSH=1 nhưng KHÔNG có DATABASE_URL.'); process.exit(1) }`. Fail-closed đúng yêu cầu.
• Bước 3 — khớp host prod phân biệt hoa thường: BỊ CHẶN tại :47-48 → `const rawHost = (url.match(/@([^/?]+)/) || [])[1] || ''; const host = rawHost ? rawHost.toLowerCase() : '(không đọc được)'` so với `const PROD_MARKER = 'ep-autumn-flower'` (:40) đã lowercase → `EP-AUTUMN-FLOWER-123.neon.tech` vẫn bị bắt tại :76 `if (host.includes(PROD_MARKER) && process.env.ALLOW_DB_PUSH_PRODUCTION !== '1') ... process.exit(1)` (:76-81), tức prod cần CỜ THỨ HAI.
• Bước 4 — cổng kiểm biến này còn dao dùng biến khác: BỊ CHẶN tại :88 → spawnSync(..., { env: { ...process.env, DATABASE_URL: url } }) ghim chính chuỗi đã qua kiểm duyệt xuống tiến trình con, Prisma CLI không tự đi đọc .env production nữa.
• Bước 5 — thoát khác 0 khi spawn lỗi: :92-95 → `if (r.error || r.status === null) { console.error(...); process.exit(1) }`, rồi `process.exit(r.status)` (:96). Không còn `?? 0` nuốt lỗi.
```

**Ghi chú:** Vá qua 2 commit: 0756cfb (bỏ db push khỏi postinstall, dựng cổng) rồi 4443fe1 (bịt fail-open: bắt buộc DATABASE_URL, lowercase host, ghim env con, exit≠0 khi spawn lỗi). Lệch số dòng so với finding: không còn ở package.json:10 dạng cũ. RỦI RO CÒN LẠI (nhỏ, KHÔNG thuộc kịch bản HT-001 vì đòi hỏi người dùng đã tự đặt ALLOW_DB_PUSH=1): regex /@([^/?]+)/ ở :47 lấy đoạn sau dấu @ ĐẦU TIÊN, nên nếu mật khẩu chứa '@' (vd postgres://u:p@ss@ep-autumn-flower.../db) thì host parse ra 'ss', không khớp PROD_MARKER → bỏ qua cổng ALLOW_DB_PUSH_PRODUCTION và vẫn đẩy vào prod. Nên dùng new URL(url).hostname thay regex. Ngoài ra postinstall mặc định không đẩy nữa nên không còn cơ chế tự đồng bộ schema — đây là đánh đổi đã được ghi rõ trong header file (:17-36).

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh: package.json:10 = "prisma generate && node scripts/maybe-db-push.mjs" (không còn db push trực tiếp). scripts/maybe-db-push.mjs là file ĐÃ TRACKED (git ls-files khớp; commit 4443fe1 + fbd60b3), nên CI/Vercel nhận đúng bản này. Bước 1 kịch bản (npm install tự đẩy schema) bị chặn tại :50-55 — `if (process.env.ALLOW_DB_PUSH !== '1') { ...; process.exit(0) }` chạy TRƯỚC spawnSync ở :84, nên đường postinstall mặc định không chạm DB. Fail-open cũ bị bịt tại :66-72 (bắt buộc DATABASE_URL, exit 1). Cổng prod thứ hai tại :76-81 với host đã lowercase (:47-48) so PROD_MARKER='ep-autumn-flower' (:40). :88 ghim DATABASE_URL đã kiểm duyệt vào tiến trình con nên Prisma CLI không tự đọc .env prod. :92-96 thoát khác 0 khi spawn lỗi. Ngoài ra tôi grep toàn worktree (trừ node_modules): KHÔNG còn script thực thi nào chứa 'accept-data-loss' hay 'prisma db push' — chỉ còn comment/tài liệu (prisma/schema.prisma:695, docs/*). package.json không có prebuild/vercel-build; vercel.json không override buildCommand; mcp-server/package.json và electron/package.json không có postinstall. Kết luận DA_VA đứng vững.
```

**Rủi ro còn lại:** 1) scripts/maybe-db-push.mjs:47 dùng regex /@([^/?]+)/ lấy đoạn sau dấu @ ĐẦU TIÊN. Nếu mật khẩu chứa '@' (postgres://u:p@ss@ep-autumn-flower.../db) thì host parse ra 'ss' → không khớp PROD_MARKER → bỏ qua cổng ALLOW_DB_PUSH_PRODUCTION và vẫn đẩy vào prod. Chỉ kích hoạt khi người dùng đã tự đặt ALLOW_DB_PUSH=1, nên NGOÀI kịch bản HT-001. Nên thay bằng new URL(url).hostname. 2) Không còn cơ chế tự đồng bộ schema — đổi schema mà quên đẩy sẽ nổ P2022 ở request đầu tiên (đánh đổi đã ghi rõ ở :17-36).

---

### HT-002

**Mức:** High · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Mới vá ĐƯỢC 1/5 điểm mà finding liệt kê. Ba bucket rate-limit Upstash vẫn key theo token TRÁI CÙNG của x-forwarded-for, tức bước cốt lõi của kịch bản khai thác ("gửi mỗi request kèm x-forwarded-for: <random-IP> và xoay vòng") VẪN CHẠY:

1) src/actions/signup-actions.ts:78 (trong getRequestMeta) —
     ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown-ip'
   giá trị này chảy thẳng vào src/actions/signup-actions.ts:188 → `const ipLimit = await checkSignupIp(ip)` (5/h). Attacker xoay XFF ⇒ mở bucket rl:signup:ip mới mỗi request ⇒ signup-flood không giới hạn.

2) src/actions/password-reset-actions.ts:57 — CÙNG một dòng `.split(',')[0]`, chảy vào password-reset-actions.ts:76 → `const ipLimit = await checkOtpIp(ip)` (10/h). ⇒ OTP-email-flood tới nạn nhân vẫn vượt trần.

3) src/actions/email-migration-actions.ts:49 — CÙNG một dòng `.split(',')[0]`, chảy vào email-migration-actions.ts:94 → `const ipLimit = await checkOtpIp(ip)`. ⇒ y hệt.

Phần forensic cũng vẫn bị đầu độc như finding mô tả:
4) src/lib/audit-log.ts:162 — `ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null`
5) src/app/api/auth/logout/route.ts:24 — `ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null` → ghi vào prisma.auditLog.create (:28) ⇒ vẫn vu vạ IP tùy ý.

CHỈ những chỗ sau đã đúng (nên KHÔNG đủ để xếp DA_VA):
• src/actions/auth-actions.ts:192-203 (login) đã đổi sang x-real-ip → x-vercel-forwarded-for → PHẦN TỬ PHẢI CÙNG: `ip = realIp || vercelFwd || (xffParts && xffParts.length ? xffParts[xffParts.length - 1] : '') || 'unknown-ip'`, dùng ở :210 `checkLoginIp(ip)`.
• src/lib/share-link-auth.ts:53-65 getRequestIp() đã theo đúng thứ tự đó (:56-61), khoá được bước brute-force resolve /share token.
• src/lib/review/rate-limit-db.ts:59-68 getClientIp() (đã đúng từ trước, là bản mẫu).
```

**Ghi chú:** Finding trỏ auth-actions.ts:192 — chỗ ĐÓ đã vá (commit bfca2e6, comment '[AUDIT HT-002 fix]' ngay tại dòng 192). Nhưng finding liệt kê 7 vị trí; bộ vá chỉ đụng auth-actions.ts + share-link-auth.ts, bỏ sót signup/password-reset/email-migration/audit-log/logout. Vì 3 trong số đó là KEY RATE-LIMIT thật (checkSignupIp, checkOtpIp ×2), lỗ hổng còn nguyên trên bề mặt signup + OTP. Cách sửa còn lại rất rẻ: export helper dùng chung (logic ở auth-actions.ts:197-203 đã sẵn) và thay 5 dòng `.split(',')[0]` còn lại — không đổi ngưỡng limit nào.

---

### HT-003

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/impersonation-actions.ts:46-74 (khối `[AUDIT HT-003/004 fix]`, thêm bởi commit bfca2e6). Chặn CHÍNH XÁC bước 3 của kịch bản ("A calls startImpersonation(V.id, W): targetMember.role='MEMBER', targetPa.role='USER' → all guards pass").

Dòng 51: `const currentProfileId = ws?.profileId ?? null`
Dòng 53-58: `prisma.profileAccess.findMany({ where: currentProfileId ? { userId: targetUserId, profileId: { not: currentProfileId } } : { userId: targetUserId }, select: { role: true } })` → liệt kê MỌI ProfileAccess của nạn nhân V ở các profile KHÁC P_A, tức lấy được đúng hàng ProfileAccess(V, P_B)='OWNER'.
Dòng 64-65: `const elevatedElsewhere = otherProfileRoles.some((r) => r.role === 'OWNER' || r.role === 'ADMIN') || ...` → true.
Dòng 72-74: `if (elevatedElsewhere) { throw new Error('Không thể đóng vai người dùng có quyền quản trị ở workspace/hồ sơ khác.') }` → throw TRƯỚC `await createImpersonationSession(session.user, targetUser)` ở dòng 90, nên cookie `session` KHÔNG BAO GIỜ bị ghi đè thành V. Bước 4 ("A's session cookie is now V") không đạt tới được.

Nguồn quyền khớp nhau: `getProfileRole()` (src/lib/profile-permissions.ts:24-31) và `verifyWorkspaceAccess` đều đọc từ `prisma.profileAccess` — chính bảng mà guard dòng 53-58 quét, nên không có đường vòng "OWNER profile B mà không có ProfileAccess row".

Điểm vào duy nhất: grep toàn repo cho `startImpersonation` chỉ ra 1 caller là src/components/admin/analytics/LivePresenceBoard.tsx:25 → không có route/API nào gọi `createImpersonationSession` vòng qua guard (chỉ src/lib/auth.ts:76 định nghĩa + impersonation-actions.ts:90 gọi).
```

**Ghi chú:** Vá bởi commit bfca2e6 (`git log -S"elevatedElsewhere"`). Số dòng lệch so với finding (31 → 46-74). Guard còn chặt hơn đề xuất gốc: ngoài ProfileAccess, dòng 59-71 quét thêm `workspaceMember` role OWNER/ADMIN ở workspace thuộc profile khác. Trường hợp `ws` = null → currentProfileId = null → query quét TẤT CẢ profile (fail-closed, chặt hơn). Guard cũ theo profile hiện tại (dòng 41-44) vẫn nguyên. HT-003 ≡ HT-004: cùng một khối vá.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Xác nhận độc lập, KHÔNG bác bỏ được. src/actions/impersonation-actions.ts:51-74 chạy TRƯỚC `await createImpersonationSession(...)` ở :90, nên bước 4 của kịch bản (cookie session thành V) không đạt tới. Tôi tự kiểm 3 đường vòng mà agent kia không chứng minh: (1) Nguồn quyền OWNER của profile — mọi đường tạo profile đều mint ProfileAccess role='OWNER' (src/actions/profile-actions.ts:262, src/actions/signup-actions.ts:291, src/lib/google-auth.ts:230) và verifyWorkspaceAccess CHỈ cấp quyền từ prisma.profileAccess (src/lib/security.ts:93-131) + WorkspaceMember (:250-262) — không có đường 'OWNER profile B mà không có hàng ProfileAccess', nên query :53-58 chắc chắn bắt được V. (2) Điểm vào: grep toàn repo, createImpersonationSession chỉ xuất hiện ở src/lib/auth.ts:76 (định nghĩa) và impersonation-actions.ts:90; startImpersonation chỉ 1 caller src/components/admin/analytics/LivePresenceBoard.tsx:25 — không có API route/MCP tool nào vòng qua. (3) ws=null không thể xảy ra (verifyWorkspaceAccess đã throw 'Workspace không tồn tại' ở security.ts:88-90); ws.profileId=null → currentProfileId=null → :54-56 quét TẤT CẢ profile = fail-closed.
```

**Rủi ro còn lại:** 3 rủi ro còn lại. (a) TOCTOU trên cookie 2h: guard là kiểm-tra-một-lần lúc mint; src/lib/auth.ts:77 đặt TTL 2 giờ và KHÔNG có chỗ nào re-check `elevatedElsewhere` trong suốt 2h đó — nếu V được thăng OWNER/ADMIN ở profile khác trong cửa sổ này, cookie đã mint vẫn cho attacker toàn quyền tenant đó. (b) Khuyến nghị defense-in-depth của HT-004 (chặn mutation profile-scoped khi isImpersonating) CHƯA áp: grep `isImpersonating` trong src/actions + src/lib chỉ ra 2 chỗ (profile-actions.ts:520, user-actions.ts:18) — changeProfileRoleAction / transferProfileOwnershipAction / removeFromProfileAction đều KHÔNG có guard, nên bản vá này là lớp phòng thủ DUY NHẤT. (c) Guard chỉ chặn OWNER/ADMIN; đóng vai một V là USER/MEMBER thường của tenant P_C vẫn trao cho attacker quyền đọc dữ liệu mức MEMBER của P_C (task, file, review) — rò rỉ xuyên tenant nhẹ hơn nhưng vẫn còn.

---

### HT-004

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
Cùng khối vá với HT-003: src/actions/impersonation-actions.ts:46-74. Riêng biến thể HT-004 (V vào W qua tính năng cross-team 'du học' → có WorkspaceMember row) bị chặn ở HAI nhánh độc lập:

(a) Nhánh ProfileAccess — bước 3 kịch bản ("targetPa for A is USER (not OWNER/ADMIN), so both guards pass"): dòng 53-58 truy vấn `profileAccess` với `profileId: { not: currentProfileId }` → bắt được ProfileAccess(V, profileB)='OWNER'; dòng 65 `otherProfileRoles.some((r) => r.role === 'OWNER' || r.role === 'ADMIN')` = true; dòng 72-73 `throw new Error(...)`.

(b) Nhánh WorkspaceMember — dòng 59-63: `prisma.workspaceMember.findMany({ where: { userId: targetUserId }, select: { role: true, workspace: { select: { profileId: true } } } })`, rồi dòng 66-71:
`targetMemberships.some((m) => (m.role === 'OWNER' || m.role === 'ADMIN') && m.workspace?.profileId != null && m.workspace.profileId !== currentProfileId)` → bắt cả trường hợp V chỉ là OWNER/ADMIN ở workspace của profile B mà không cần ProfileAccess.

Vì throw xảy ra ở dòng 73, luồng KHÔNG tới `createImpersonationSession` (dòng 90) → bước 4 ("Now acting as V, attacker calls transferProfileOwnershipAction(profileB, ...)") không thực hiện được: session principal chưa bao giờ trở thành V.
```

**Ghi chú:** CẢNH BÁO RESIDUAL: chỉ nhánh vá CHÍNH (pre-check cross-profile) được áp dụng. Nhánh đề xuất phụ 'gate profile-member-actions.ts khi isImpersonating' KHÔNG được áp dụng — grep `isImpersonating` trong src/actions + src/lib chỉ ra 3 chỗ: src/lib/auth.ts:91 (set claim), src/actions/user-actions.ts:18, src/actions/profile-actions.ts:520. profile-member-actions.ts (changeProfileRoleAction / transferProfileOwnershipAction / inviteToProfileAction / removeFromProfile) vẫn KHÔNG kiểm isImpersonating. Nghĩa là nếu sau này pre-check dòng 52-74 bị hồi quy/bypass thì không còn lớp phòng thủ thứ hai. Kịch bản khai thác trong finding vẫn bị chặn dứt điểm ở tầng 1.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được. src/actions/impersonation-actions.ts:52-74 chạy TRƯỚC createImpersonationSession (:90) và throw ở :73 nên phiên chưa bao giờ trở thành V → bước 4 của kịch bản không thực hiện được. Điểm mấu chốt mà agent kia KHÔNG chứng minh nhưng tôi đã kiểm: nguồn dữ liệu cấp quyền ở bước 4 và nguồn dữ liệu của guard là CÙNG MỘT BẢNG — src/lib/profile-permissions.ts:24-31 getProfileRole() chỉ đọc prisma.profileAccess.findUnique({userId_profileId}), không hề fallback sang Profile.ownerId hay User.profileId; và quyền OWNER profile luôn được ghi bằng ProfileAccess role='OWNER' (src/actions/profile-actions.ts:262-264 khi tạo profile, src/actions/signup-actions.ts:291-296 khi signup). Guard ở :53-58 quét đúng bảng đó với profileId:{not: currentProfileId} → không có khe hở kiểu 'ownership ghi ở chỗ khác'. Nhánh WorkspaceMember :59-71 phủ thêm ADMIN/OWNER workspace ở profile khác. Đã kiểm ĐƯỜNG VÀO DUY NHẤT: grep createImpersonationSession toàn src/ + mcp-server/src chỉ ra 2 hit — định nghĩa src/lib/auth.ts:76 và lời gọi duy nhất impersonation-actions.ts:90; không có API route/MCP tool nào mint được cookie impersonation.
```

**Rủi ro còn lại:** (1) Thiết kế cookie impersonation vẫn là TOÀN CỤC: đóng vai một người chỉ là MEMBER thường ở tenant khác vẫn cho attacker toàn bộ quyền ĐỌC của người đó ở tenant kia — guard chỉ chặn mức OWNER/ADMIN, không chặn rò dữ liệu mức member xuyên tenant. (2) Nhánh vá phụ mà finding đề xuất KHÔNG được áp: grep isImpersonating trong src/actions + src/lib chỉ có 3 hit (src/lib/auth.ts:91 set claim, src/actions/user-actions.ts:18, src/actions/profile-actions.ts:520 — cả hai chỉ chặn đổi mật khẩu). src/actions/profile-member-actions.ts (changeProfileRoleAction/transferProfileOwnershipAction/inviteToProfileAction/removeFromProfile) KHÔNG kiểm isImpersonating → chỉ còn ĐÚNG MỘT lớp phòng thủ; mọi hồi quy ở khối :52-74 làm sống lại nguyên vẹn kịch bản.

---

### HT-005

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/invoice-actions.ts:614-653 (voidInvoice). Kịch bản gốc: 2 POST đồng thời cùng invoiceId, cả hai qua guard tiền-transaction rồi cả hai chạy `depositBalance += invoice.depositDeducted`. CHẶN TẠI: (a) dòng 615 `await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 0))`` — câu lệnh ĐẦU TIÊN trong `workspacePrisma.$transaction`, tuần tự hoá mọi void cùng invoiceId; (b) dòng 618-621 re-read có thẩm quyền DƯỚI khoá: `const fresh = await tx.invoice.findUnique({ where:{id:invoiceId}, select:{ status, depositDeducted, clientDepositDeducted, clientId } })`; (c) dòng 622 `if (!fresh || fresh.status === 'VOID') return // already voided → no second refund` — đây chính là dòng chặn BƯỚC 'cả hai cùng increment': tx thua chỉ lấy được advisory lock SAU khi tx thắng commit `status:'VOID'` (dòng 625-628), nên nó return trước khi tới nhánh refund ở dòng 646-653. (d) refund dòng 645-652 dùng `fresh` (bản đọc dưới khoá) chứ không dùng bản copy `invoice` đọc ngoài transaction ở dòng 601. Guard cũ dòng 607 nay chỉ còn là fast-path. Không còn đường refund thứ hai: grep `depositBalance: { increment` toàn bộ src/ chỉ ra ĐÚNG 1 vị trí là dòng 650.
```

**Ghi chú:** Vá bởi commit bfca2e6 (git log -S"pg_advisory_xact_lock(hashtextextended(${invoiceId}"). Số dòng lệch so với finding (594 → 614-653). Extension getWorkspacePrisma chỉ can thiệp $allModels query (prisma-workspace.ts:110-168), KHÔNG bọc $executeRaw/$transaction nên advisory lock chạy đúng trên cùng connection của tx. Chỉ còn 1 điểm mở nhỏ (ngoài phạm vi finding): nếu DB prod chưa có cột clientDepositDeducted thì select dòng 620 sẽ ném lỗi → void fail-closed (không refund lần nào), vẫn không phải double-refund.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/actions/invoice-actions.ts:581-666 (voidInvoice; lệch so với finding ghi :594). Bước 'cả hai POST đồng thời cùng chạy depositBalance += ...' bị chặn theo đúng chuỗi: (a) :615 `await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invoiceId}, 0))`` là câu lệnh ĐẦU TIÊN trong `workspacePrisma.$transaction` mở ở :614 → tuần tự hoá theo invoiceId trên cùng connection của interactive transaction; (b) :618-621 re-read có thẩm quyền DƯỚI khoá; (c) :622 `if (!fresh || fresh.status === 'VOID') return` — tx thua chỉ lấy được khoá SAU khi tx thắng commit `status:'VOID'` (:625-628), nên nó thoát TRƯỚC nhánh refund; (d) :645-653 refund dùng `fresh` (đọc dưới khoá) chứ không dùng bản `invoice` đọc ngoài tx ở :601. Tôi tự grep xác nhận CHỈ CÓ ĐÚNG 1 điểm ghi tăng số dư trong toàn repo: invoice-actions.ts:650 `depositBalance: { increment: refundAmount }` (không có bản sao ở mcp-server/, electron/, scripts/, không có raw SQL nào chạm depositBalance), và chỉ 1 chỗ ghi `status: 'VOID'` (:627) → không còn đường refund thứ hai. Đọc src/lib/prisma-workspace.ts:110-220: extension chỉ hook $allModels, KHÔNG bọc $executeRaw/$transaction nên advisory lock không bị biến dạng; nó còn chèn thêm workspaceId vào where của findUnique (:138-141) → hoá ra là lớp chặn cross-tenant bổ sung.
```

**Rủi ro còn lại:** Cột Invoice.clientDepositDeducted có trong prisma/schema.prisma:765, nhưng vì HT-001 đã tắt auto-push, nếu prod chưa được đẩy tay thì select ở :620 ném P2022 → void fail-closed (không refund lần nào). Không phải double-refund, nhưng là rủi ro vận hành thật sau khi bỏ auto-sync.

---

### HT-006

**Mức:** High · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/share-portal-actions.ts:765-834 `approveDeliverableViaToken`. Cái ĐÃ thêm (từ bộ vá HT-014, commit bfca2e6) là dòng 780-782: `if (!isClientFacingPhase(task.status, task.clientReview)) return { success:false, error:'This deliverable is not currently awaiting your review.' }` — chặn được vế 'bản dựng CHƯA qua kiểm nội bộ'. Cái KHÔNG được vá là vế chính: dòng 792-810 vẫn `prisma.task.updateMany({ ..., data: { status: 'Hoàn tất', deadline: null, clientReview: 'APPROVED', clientReviewedAt: new Date(), version: { increment: 1 } } })` — tức token-holder VẪN tự tay ghi thẳng trạng thái terminal tính lương, không hề có bước 'chờ admin xác nhận'. Dòng 821-826 audit vẫn `actorUserId: null`. Không có commit nào chạm HT-006 (`git log -S"AUDIT HT-006" -- src/actions/share-portal-actions.ts` → rỗng); comment dòng 774-779 tự khai đây là 'AUDIT HT-014/HT-006 fix' nhưng chỉ cài đúng gate phase. Cả 2 phương án sửa (a) và (b) trong finding đều KHÔNG được áp dụng.
```

**Ghi chú:** VÁ MỘT NỬA. Bước 'khách duyệt task còn ở phase nội bộ' đã bị dòng 780 chặn; bước cốt lõi 'bất kỳ ai cầm link → Hoàn tất → kích hoạt payroll editor, không cần login staff, actor=null' VẪN CHẠY cho mọi task đang ở client-facing phase. Lưu ý bối cảnh: comment dòng 778-779 ghi '(Owner decision Q1: client approve = complete)' — tức chủ dự án đã chọn phương án (b) trong docs/security-audit/OPEN_QUESTIONS.md Q1, ngược với khuyến nghị (a) của audit. Nếu quyết định (b) được xác nhận chính thức thì đây là RỦI RO CHẤP NHẬN chứ không phải bug; nhưng ở tầng code thuần tuý thì kịch bản khai thác chưa bị chặn. Đề nghị parent agent hỏi lại owner trước khi xếp WONTFIX. Sibling `approveDeliverablesViaToken` (dòng 855+) và `requestChangesViaToken` (1011+) cùng đặc tính.

---

### HT-007

**Mức:** High · **Kết luận:** CHƯA VÁ _(agent xác minh chấm ĐÃ VÁ, phản biện lật lại)_

**Bằng chứng từ agent xác minh:**

```
src/actions/task-management-actions.ts:48-54 (fix commit bfca2e6, đã xác nhận là ancestor của HEAD bằng `git merge-base --is-ancestor`). Bước quyết định của kịch bản khai thác là `updateTask(T.id, { workspaceId: '<victim-B>', ... }, '<A>')` để re-parent task sang tenant B. Ba dòng sau nằm NGOÀI và TRƯỚC nhánh `if (!isWorkspaceAdmin)` (dòng 57) nên áp dụng cho CẢ workspace admin: `delete data.id` (:52), `delete data.workspaceId` (:53 — chặn re-parent sang B), `delete data.profileId` (:54). Dòng ghi cuối `await workspacePrisma.task.update({ where: { id }, data })` (:107) do đó không còn nhận workspaceId/profileId từ client. Đã xác nhận extension KHÔNG phải lớp chặn: src/lib/prisma-workspace.ts:138-141 chỉ `baseWhere.workspaceId = currentWorkspaceId` cho nhóm update/delete/find (inject vào WHERE), còn khối inject vào `data` chỉ chạy cho create/createMany/upsert (:171-213) — nên 3 dòng delete là biện pháp chặn DUY NHẤT, và nó đủ cho payload trong finding. Các field còn lại (assigneeId/status/value/wageVND) admin vẫn set được nhưng chỉ trong workspace A của chính mình vì WHERE bị ép workspaceId=A → hết tính xuyên tenant.
```

**Ghi chú:** DA_VA cho ĐÚNG payload trong finding. RESIDUAL chưa vá (biến thể mới): `data` vẫn là `any` truyền thẳng vào Prisma (:107) và Task có quan hệ `workspace Workspace? @relation(fields:[workspaceId]...)` (prisma/schema.prisma:379) + `profile Profile?` (:381), nên payload lồng quan hệ `updateTask(T.id, { workspace: { connect: { id: '<victim-B>' } } }, '<A>')` KHÔNG bị 3 dòng delete chạm tới và vẫn re-parent được task. Khuyến nghị đóng nốt bằng whitelist field (đúng đề xuất gốc) thay cho blacklist key, hoặc delete thêm data.workspace/data.profile.

**Vòng phản biện** — phán quyết: **BÁC BỎ** (lỗ hổng vẫn còn)

```
BÁC BỎ. Ba dòng src/actions/task-management-actions.ts:52-54 chỉ xoá KHOÁ SCALAR (`data.id`/`data.workspaceId`/`data.profileId`) — đây là blacklist, không phải whitelist như đề xuất gốc ở FINDINGS.md dòng 144. `data` vẫn là `any` truyền NGUYÊN VẸN vào `workspacePrisma.task.update({ where: { id }, data })` ở :107. Đường khai thác còn sót: model Task có quan hệ `workspace Workspace? @relation(fields:[workspaceId]...)` (prisma/schema.prisma:379) và `profile Profile?` (:381), nên payload lồng quan hệ `updateTask(T.id, { workspace: { connect: { id: '<victim-B>' } } }, '<A>')` KHÔNG bị 3 dòng delete chạm tới và Prisma vẫn ghi workspaceId=B → re-parent task sang tenant B, đúng y tác động mô tả trong finding ('cross-tenant task relocation'). Tôi tự xác minh extension KHÔNG cứu: src/lib/prisma-workspace.ts:138-141 chỉ inject workspaceId vào `where` cho nhóm update; khối inject vào `data` chỉ chạy cho create/createMany (:171-193) và upsert (:196-213) — operation 'update' hoàn toàn không được lọc `data`. Hai bộ invariant cũng bị né: :95 và :102 chỉ kiểm `'assigneeId' in data` / `'status' in data`, dạng lồng quan hệ (`assignee: { connect }`) không kích hoạt. Kết luận 'DA_VA' của agent kia đúng cho ĐÚNG chuỗi ký tự trong kịch bản, nhưng lỗ hổng mà finding mô tả vẫn khai thác được bằng biến thể một dòng.
```

**Rủi ro còn lại:** Ngoài relocation, nhánh admin vẫn không validate assigneeId theo membership (đề xuất gốc yêu cầu isAssigneeInWorkspaceProfile như assignTask/createBatchTasks) và vẫn cho set value/wageVND/profitVND tuỳ ý. updateTask là exported Server Action = POST endpoint công khai dù chỉ có 1 định nghĩa và 0 caller trong repo. Cách đóng đúng: whitelist field cho phép, hoặc tối thiểu delete thêm data.workspace/data.profile/data.assignee/data.client/data.project/data.invoice.

---

### HT-008

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/lib/pricing-engine.ts:270 — `numResult = safeEvalArithmetic(expression)` đã THAY THẾ hoàn toàn `new Function('Math', ...)`. Grep 'new Function' trên toàn bộ src/ = 0 hit; regex `safePattern` chứa \w cũng không còn tồn tại (grep 'safePattern' = 0 hit).
Chặn từng bước của kịch bản khai thác payload `Math.constructor(String.fromCharCode(...))()`:
• src/lib/pricing-engine.ts:175 tokenizer sticky `const re = /\s*([0-9]*\.?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/%(),])/y` — ký tự `.` sau `Math` KHÔNG khớp nhánh nào (nhánh số đòi ít nhất 1 chữ số, nhánh operator không có `.`), nên tại src/lib/pricing-engine.ts:180 `if (!m) throw new Error(...)` ném ngay ở bước `Math.constructor` → payload chết ở token đầu tiên.
• Kể cả nếu bỏ dấu chấm, src/lib/pricing-engine.ts:220-231 parseFactor bắt buộc identifier phải theo sau bởi `(` và tên phải nằm trong FN1 {ceil,floor,round,abs} / FN_N {min,max} (khai báo dòng 185-188); mọi tên khác rơi vào dòng 231 `throw new Error(`Unknown function "${name}"`)`. Không có nhánh nào truy cập global/`Math.constructor`/`String`.
• Lỗi được bắt ở src/lib/pricing-engine.ts:271-274 → trả `{ priceUSD: 0, ... ruleApplied: '<name> (unsafe formula)' }`, không thực thi gì.
Commit vá: bfca2e6 (`git log -S"safeEvalArithmetic" -- src/lib/pricing-engine.ts`).
```

**Ghi chú:** Số dòng lệch nhiều: calculateCustom nay ở dòng 248 (finding ghi 206). Lưu ý phụ (KHÔNG thuộc phạm vi finding, chưa đổi): validateConfig case 'custom' tại src/actions/pricing-rule-actions.ts:116-122 VẪN chỉ kiểm formula là chuỗi không rỗng — payload độc vẫn LƯU được vào DB, chỉ là lúc chạy bị parser từ chối (log warn + giá 0). Đề xuất 'validate ngay lúc tạo rule' của finding chưa làm, nhưng sink RCE đã đóng nên kịch bản khai thác không còn chạy được. Phát sinh mới đáng để mắt: dòng 263 `new RegExp(`\\b${key}\\b`,'g')` với key lấy từ variables do admin nhập — regex-injection/ReDoS nhẹ, ngoài phạm vi HT-008.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/lib/pricing-engine.ts:171-239 (safeEvalArithmetic) và :248-286 (calculateCustom). Sink cũ đã biến mất: grep `new Function|\beval\(` trên toàn src chỉ còn 3 hit và cả 3 đều là COMMENT trong chính pricing-engine.ts (:166, :246, :266); 'safePattern' 0 hit. Chặn từng bước payload `Math.constructor(String.fromCharCode(...))()`: tokenizer sticky :175 `/\s*([0-9]*\.?[0-9]+|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*/%(),])/y` không có nhánh nào khớp dấu '.' đứng sau identifier (nhánh số đòi ít nhất 1 chữ số) → :180 `if (!m) throw` ném ngay ở ký tự thứ 5 của payload. Bỏ dấu chấm cũng vô ích: parseFactor :220-231 bắt identifier phải theo sau '(' và tên phải thuộc FN1{ceil,floor,round,abs}/FN_N{min,max} (:185-188), mọi tên khác ném ở :231; grammar KHÔNG có toán tử truy cập thành viên nên không thể chạm global. Tôi còn tự thử một đường mà agent kia không nhắc: `FN1[name]` là bracket-access trên object literal nên 'constructor'/'toString' truy được qua Object.prototype và TRUYỀN qua `if (FN1[name])` — nhưng kết quả chỉ là Object(5) / '[object Object]', và :275 `typeof numResult !== 'number' → 0` nuốt gọn; không có lần gọi thứ hai để tới Function. Lỗi được bắt ở :271-274 → trả giá 0. RCE/stored-XSS trong Quick Create không còn chạy.
```

**Rủi ro còn lại:** (1) validateConfig case 'custom' (src/actions/pricing-rule-actions.ts:116-122) VẪN chỉ kiểm formula là chuỗi không rỗng → payload độc vẫn LƯU được vào DB (đề xuất 'validate ngay lúc tạo rule' chưa làm); chỉ bị từ chối lúc chạy. (2) Phát sinh mới ngoài phạm vi HT-008: pricing-engine.ts:263 `new RegExp('\\b'+key+'\\b','g')` với key lấy từ variables do admin nhập → regex-injection/ReDoS chạy trong TRÌNH DUYỆT của member (calculateCustom được gọi client-side ở QuickCreateMode); regex hỏng thì rơi vào catch :282 → giá 0.

---

### HT-009

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/bonus-actions.ts:335-422 (calculateMonthlyBonus). Kịch bản gốc: 2 lời gọi đồng thời cùng qua check lock dòng 151, mỗi bên chạy $transaction (deleteMany + upsert lock) rồi tạo bonus/rank NGOÀI transaction → deleteMany của bên này xoá row bên kia vừa tạo / đụng unique P2002 sau khi lock đã commit. CHẶN TẠI: (a) dòng 336 `await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bonus:${workspaceId}:${currentYear}-${currentMonth}`}, 0))`` — tuần tự hoá theo đúng khoá (workspace, month, year); (b) dòng 339-343 re-check DƯỚI advisory lock: `const existingLock = await tx.payrollLock.findUnique(...); if (existingLock?.isLocked) return true` → lời gọi thua chỉ chạy sau khi bên thắng commit, thấy isLocked=true và thoát TRƯỚC mọi deleteMany/create, kết thúc bằng dòng 420-422 `if (alreadyLocked) return { success:false, error:'... đã được tính/khóa bởi một thao tác khác ...' }`; (c) toàn bộ ghi nay nằm TRONG một `prisma.$transaction` duy nhất mở ở dòng 335: deleteMany monthlyBonus/monthlyRank dòng 346-347, vòng lặp `tx.monthlyBonus.create` dòng 357-370, `tx.monthlyRank.createMany` dòng 396, và `tx.payrollLock.upsert` dòng 400-416 đặt CUỐI CÙNG — nên bất kỳ lỗi nào (kể cả P2002) đều rollback cả cụm và KHÔNG để lại kỳ đã khoá với dữ liệu dở dang (đúng triệu chứng finding mô tả).
```

**Ghi chú:** Vá bởi commit d252250. Số dòng lệch nhiều (366/415 → 335-418). Check dòng 142-153 vẫn còn nhưng giờ chỉ là fast-path, nguồn sự thật là re-check dòng 339-343 dưới advisory lock. Lưu ý phụ (không phải lỗ hổng): transaction dùng `prisma` gốc thay vì workspacePrisma, nhưng mọi row đều ghi workspaceId/profileId tường minh và deleteMany lọc theo workspaceId+month+year nên không hở tenancy; mảng `awardedBonuses` được push bên trong callback tx nên nếu tx bị retry thủ công có thể nhân đôi phần tử trong response (chỉ ảnh hưởng audit snapshot dòng 433, không ảnh hưởng DB).

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/actions/bonus-actions.ts:118-445 (calculateMonthlyBonus; finding ghi :366/:415 — đã lệch). Kịch bản gốc bị chặn tại: (a) :336 `tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bonus:${workspaceId}:${currentYear}-${currentMonth}`}, 0))`` — câu lệnh đầu tiên của `prisma.$transaction` mở ở :335, khoá đúng bộ ba (workspace, month, year); (b) :339-343 re-check PayrollLock DƯỚI khoá, `if (existingLock?.isLocked) return true` → lời gọi thua thoát TRƯỚC mọi deleteMany/create, kết thúc bằng :420-422 trả lỗi 'đã được tính/khóa bởi một thao tác khác'; (c) điểm mấu chốt finding tố cáo — create NẰM NGOÀI transaction — đã hết: deleteMany :346-347, vòng `tx.monthlyBonus.create` :357-370, `tx.monthlyRank.createMany` :396 và `tx.payrollLock.upsert` :400-416 đều dùng `tx`, và upsert khoá đặt CUỐI nên P2002 bất kỳ đều rollback cả cụm, không để lại kỳ đã khoá với dữ liệu dở. Tôi grep xác nhận không có writer MonthlyBonus/PayrollLock nào khác ngoài bonus-actions.ts và admin-profile-actions.ts:84-85 (chỉ set profileId=null khi xoá profile). Check :142-153 giờ chỉ là fast-path.
```

**Rủi ro còn lại:** revertMonthlyBonus (bonus-actions.ts:63-109) KHÔNG lấy advisory lock và chạy 3 deleteMany RỜI NHAU (:78, :81, :84) ngoài mọi transaction. Một revert chạy song song với một calculate vẫn có thể xen kẽ: revert xoá PayrollLock trong khi calculate vừa commit bonus → kỳ mở khoá nhưng còn bonus, hoặc ngược lại. Cùng LỚP lỗi TOCTOU với HT-009 nhưng KHÔNG thuộc kịch bản của finding (finding chỉ nói hai calculate đồng thời). Cả hai đều gate ADMIN.

---

### HT-010

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/password-reset-actions.ts:115-122 — nhánh cooldown giờ trả về ĐÚNG hằng generic, không còn message riêng:
```
if (recent) {
    // [AUDIT HT-010 fix] Return the SAME neutral response as the not-found/locked branch above.
    await paddingDelay()
    return GENERIC_OTP_RESPONSE
}
```
Chặn bước 2 của kịch bản: request thứ 2 trong 60s cho email TỒN TẠI rơi vào `if (recent)` (dòng 115) và trả về GENERIC_OTP_RESPONSE (dòng 121) — byte-identical với nhánh email-không-tồn-tại ở dòng 100-103 (`if (!user || user.role === 'LOCKED') { await paddingDelay(); return GENERIC_OTP_RESPONSE }`). Cả hai nhánh đều gọi paddingDelay() trước khi return nên không còn oracle theo body lẫn theo timing. Hằng GENERIC_OTP_RESPONSE định nghĩa 1 chỗ duy nhất tại dòng 41-44.
```

**Ghi chú:** Vá bởi commit 09e67a4 (git log -S"HT-010 fix"). Logic cooldown/DB không đổi — chỉ đổi nội dung trả về, đúng như 'Đề xuất sửa'. Không còn nhánh nào trong requestPasswordResetOtp trả message khác nhau giữa email tồn tại và không tồn tại (nhánh IP-limit dòng 77-84 trả message riêng nhưng độc lập với sự tồn tại của email).

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/actions/password-reset-actions.ts. Nhánh cooldown :115-122 giờ `await paddingDelay(); return GENERIC_OTP_RESPONSE` — TRẢ VỀ CÙNG MỘT OBJECT REFERENCE với nhánh không-tồn-tại/LOCKED ở :100-103, hằng khai báo duy nhất tại :41-44 ⇒ body giống hệt từng byte. Tôi kiểm thêm 2 thứ agent kia bỏ qua: (a) THỨ TỰ — checkOtpEmail (:87-92) chạy TRƯỚC lookup user (:95), nên ngân sách 3/h bị tiêu như nhau cho email tồn tại lẫn không, không tạo oracle phụ; (b) TẦNG VẬN CHUYỂN — src/app/api/auth/forgot-password/route.ts:19-26 chỉ đổi sang 429 khi `result.retryAfter` có giá trị, mà chỉ nhánh IP-limit (:79-83) mới set trường đó, còn nhánh cooldown trả success:true → 200 với body generic. Vậy kịch bản '2 request trong 60s cùng email' cho ra status + body y hệt nhau ở cả hai trường hợp; oracle enumeration theo body đã bị bịt.
```

**Rủi ro còn lại:** Chỉ còn kênh THỜI GIAN: padding là random 100-300ms (:47-50), trong khi request đầu tiên với email TỒN TẠI làm thêm updateMany (:125), create OTP (:135), create auditLog (:148) và gọi sendEmail — chênh lệch này vẫn thống kê được nếu lấy mẫu lặp nhiều lần. Nhánh IP-limit (:79-84) vẫn trả message riêng (độc lập với sự tồn tại email, nên không phải oracle).

---

### HT-011

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/price-template-actions.ts:76-79 — delete đã được scope theo workspaceId:
```
const { count } = await prisma.priceTemplate.deleteMany({
    where: { id, workspaceId }
})
if (count === 0) return { error: 'Không tìm thấy mẫu giá trong workspace này.' }
```
Chặn bước cuối của kịch bản: attacker vẫn qua được `verifyWorkspaceAccess(workspaceA, 'ADMIN')` (dòng 70), nhưng lệnh xoá ở dòng 76-78 nay có predicate `workspaceId` nên `victimTemplateId` (thuộc tenant B) KHÔNG khớp WHERE → count===0 → dòng 79 trả lỗi, row của tenant B còn nguyên. `prisma.priceTemplate.delete({ where: { id } })` (bare id) không còn tồn tại trong file.
```

**Ghi chú:** HT-011 ≡ HT-012, cùng một dòng code, cùng một bản vá (commit 09e67a4). deleteMany không throw khi 0 row nên đã có thêm nhánh trả 'không tìm thấy' đúng như khuyến nghị. Vẫn dùng global prisma (không phải getWorkspacePrisma) nhưng predicate tường minh đã đủ chặn.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc trọn src/actions/price-template-actions.ts (87 dòng). Bước cuối kịch bản bị chặn tại :76-79: `const { count } = await prisma.priceTemplate.deleteMany({ where: { id, workspaceId } })` + `if (count === 0) return { error: 'Không tìm thấy mẫu giá trong workspace này.' }`. Attacker vẫn qua verifyWorkspaceAccess(workspaceA,'ADMIN') ở :70, nhưng victimTemplateId (tenant B) không khớp predicate workspaceId → count===0 → row tenant B còn nguyên. Tôi grep toàn bộ src/, mcp-server/src/, electron/src/: CHỈ CÓ 4 lần chạm model priceTemplate, tất cả nằm trong đúng file này (findMany :22 lọc workspaceId, count :45, create :50, deleteMany :76) — không còn `priceTemplate.delete({ where: { id } })` bare-id ở bất kỳ đâu, và không có route API hay MCP tool nào là đường vào thứ hai. deleteTemplate chỉ có 1 caller UI (PriceTemplateSelector.tsx:143-144) truyền đúng cặp (id, workspaceId). HT-011 ≡ HT-012 (cùng dòng code, cùng bản vá).
```

**Rủi ro còn lại:** Vẫn dùng global `prisma` thay vì getWorkspacePrisma, nên an toàn phụ thuộc vào predicate viết tay — lần sửa sau ai đó thêm thao tác mới trên priceTemplate mà quên workspaceId là lỗ mở lại. Đây là rủi ro bảo trì, không phải lỗ hổng hiện hữu.

---

### HT-012

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/price-template-actions.ts:76-79 (cùng dòng với HT-011) — `prisma.priceTemplate.deleteMany({ where: { id, workspaceId } })` + `if (count === 0) return { error: ... }`. Chặn chính xác bước 'delete({ where: { id: victimTemplateId } }) khớp và xoá row của tenant B': WHERE nay là cặp (id, workspaceId) nên victimTemplateId của tenant B không khớp workspaceId của attacker → 0 row bị xoá. Đối chiếu getTemplates (dòng 17, verifyWorkspaceAccess MEMBER + filter workspaceId) và createTemplate (dòng 42, ADMIN + gán workspaceId) — cả 3 hàm trong file giờ đều scope theo workspaceId, không còn chỗ nào dùng bare id.
```

**Ghi chú:** Trùng lặp với HT-011 (báo cáo riêng 2 dòng trong FINDINGS.md nhưng cùng 1 lỗ). Một bản vá duy nhất đóng cả hai; comment trong code ghi rõ '[AUDIT HT-011/012 fix]'.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Xác nhận độc lập, KHÔNG bác bỏ được. src/actions/price-template-actions.ts:76-78 `prisma.priceTemplate.deleteMany({ where: { id, workspaceId } })` + :79 `if (count === 0) return {...}` chặn đúng bước cuối kịch bản ('delete({ where: { id: victimTemplateId } }) khớp và xoá row của tenant B'): WHERE giờ là cặp (id, workspaceId), mà workspaceId đã được verifyWorkspaceAccess(:70) chứng minh thuộc attacker — id của tenant B không khớp nên 0 row bị xoá. Tôi tự kiểm đường vòng: grep `priceTemplate.` toàn src/ chỉ ra ĐÚNG 4 call-site, tất cả trong file này — :22 findMany (scope workspaceId, có gate MEMBER ở :17 và strip priceUSD cho non-admin :27-29), :45 count (scope), :50 create (gán workspaceId, gate ADMIN :42), :76 deleteMany (scope). Không tồn tại action update/upsert nào cho PriceTemplate, cũng không có API route hay MCP tool nào chạm model này → không còn chỗ nào dùng bare id.
```

---

### HT-013

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/profile-actions.ts:198-210 — field `email` đã bị GỠ HẲN khỏi payload ghi DB:
```
await prisma.user.update({
    where: { id: targetId },
    data: {
        nickname: data.nickname || null,
        phoneNumber: data.phoneNumber || null,
        // [AUDIT HT-013 fix] Email is intentionally NOT writable here...
    }
})
```
Chặn bước duy nhất của kịch bản ('gọi updateProfile(anyId, { email: "gia-tri-bat-ky" })'): `data.email` vẫn còn trong kiểu tham số (dòng 186) nhưng KHÔNG được đưa vào object `data` của prisma.user.update (dòng 200-209) → giá trị client gửi bị bỏ qua hoàn toàn, `User.email` và `emailVerified` không đổi. Dòng gốc `email: data.email || null` không còn tồn tại. Grep 'email' trên toàn file chỉ còn hit ở comment + type signature, không có write nào. updateProfileSettings (dòng 319) cũng không ghi email.
```

**Ghi chú:** Vá bởi commit 09e67a4. Chọn phương án mạnh nhất trong 'Đề xuất sửa' (bỏ hẳn field email, buộc đi qua email-migration-actions.ts OTP) thay vì chỉ thêm validate format. Dư: prop `email?: string` vẫn còn trong interface nên ProfileForm có thể vẫn gửi — vô hại (bị ignore), chỉ là rác API surface.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được. src/actions/profile-actions.ts:198-209: prisma.user.update chỉ còn data { nickname, phoneNumber } — dòng gốc 'email: data.email || null' đã biến mất, thay bằng comment [AUDIT HT-013 fix]. Chặn đúng bước duy nhất của kịch bản: updateProfile(anyId, { email:'gia-tri-bat-ky' }) vẫn nhận được tham số (kiểu ở :186) nhưng giá trị không bao giờ vào payload Prisma → User.email và emailVerified bất biến. Tôi không tin grep của agent kia mà tự chạy lại: grep 'email' trên toàn src/actions/profile-actions.ts chỉ còn 5 hit — :186 (khai báo kiểu), :191-192, :205-206, :553 (đều là comment); KHÔNG còn lệnh ghi nào, updateProfileSettings cũng không. Tự kiểm ĐƯỜNG VÀO KHÁC: grep user.update|user.updateMany toàn src/actions + src/app/api + mcp-server → 19 hit, tôi đọc từng cái ghi được email: chỉ còn src/actions/email-migration-actions.ts:243 (luồng OTP), src/actions/password-reset-actions.ts:348, src/app/api/auth/verify-email/route.ts:50 và auth-actions.ts (signup/login); các hit còn lại chỉ ghi role/password/sessionVersion/avatar (admin-actions.ts:71, user-actions.ts:56/138/300/389, profile-actions.ts:555, toggle-treasurer.ts:24, upload-actions.ts:101/161, username-actions.ts:107). Không còn đường tự phục vụ nào đổi email không qua OTP.
```

**Rủi ro còn lại:** Chỉ là rác API surface: prop email?: string vẫn nằm trong kiểu tham số updateProfile (:186) nên ProfileForm có thể vẫn gửi và bị âm thầm bỏ qua — người dùng có thể tưởng đã đổi email thành công. Nên gỡ khỏi cả interface lẫn input form.

---

### HT-014

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/share-portal-actions.ts. (1) approveDeliverableViaToken dòng 780-782: `if (!isClientFacingPhase(task.status, task.clientReview)) { return { success: false, error: 'This deliverable is not currently awaiting your review.' } }` — chặn CHÍNH BƯỚC 'client POST thẳng approveDeliverableViaToken({token, taskId}) với id của task còn đang biên tập nội bộ'; task ở 'Đang làm'/'Đã nộp video (nội bộ)' fail predicate → return trước khi tới updateMany. (2) requestChangesViaToken dòng 1025-1027: cùng gate, và `clientReview: true` ĐÃ được thêm vào select dòng 1017 đúng như đề xuất sửa yêu cầu. (3) Bản bulk approveDeliverablesViaToken dòng 882-887 lọc `eligible` bằng đúng `isClientFacingPhase(t.status, t.clientReview)`. (4) `isClientFacingPhase` import từ '@/lib/portal-derive' dòng 21 — cùng hàm mà read path dùng ở dòng 369/381. Commit: bfca2e6.
```

**Ghi chú:** Vá đủ cả 3 write path (approve đơn, approve bulk, request-changes), không chỉ 2 cái finding nêu. Ngoài ra còn được siết thêm: updateMany dòng 792-802 / 1033-1041 restate lại status+clientReview+clientId+workspaceId trong WHERE để đóng TOCTOU, `applied.count === 0` → báo lỗi thay vì ghi đè. Lưu ý: bản thân getShareSnapshot VẪN trả về id của mọi task của client (finding nói đúng), nhưng điều đó giờ vô hại vì write path đã tự gác.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/actions/share-portal-actions.ts. Ba đường ghi đều có gate ĐẶT TRƯỚC lệnh ghi: :780-782 (approve đơn, trước updateMany :792), :882-887 (bulk, `eligible` lọc trước $transaction :920), :1025-1027 (request-changes, trước updateMany :1033) — và `clientReview: true` đã được thêm vào select ở :1017 đúng như finding yêu cầu. Predicate isClientFacingPhase (src/lib/portal-derive.ts:77-79 `clientReview != null || /khách/i.test(status)`) là ĐÚNG hàm mà read path dùng ở :369/:381. Bước cụ thể của kịch bản — 'client POST approveDeliverableViaToken với id của task đang biên tập nội bộ' — chết tại :780 vì 'Đang làm'/'Đã nộp video (nội bộ)' + clientReview=null cho ra false, return trước mọi ghi. Tôi kiểm thêm hướng 'còn cửa khác': đường quyết định của khách qua /r (src/lib/review/share-decision.ts:172) enforce đúng cùng predicate, nên không lách sang được; và updateMany :792-802 / :923-934 / :1033-1041 restate lại status+clientReview+clientId+workspaceId, `count===0` → báo lỗi, nên đóng luôn TOCTOU.
```

**Rủi ro còn lại:** Gate là 'đã được phơi ra cho khách' chứ KHÔNG phải 'đã thực sự giao bản dựng' — phương án thay thế trong finding ('chỉ cho approve khi có ReviewAsset READY đã surface') KHÔNG được làm. Hệ quả còn lại, vẫn nằm trong đúng tiêu đề finding: bất kỳ task nào có clientReview != null (vd status 'Revision' + clientReview 'CHANGES' trong lúc editor đang dựng lại) hoặc status chứa 'khách' (A6 'Đã nhận feedback (khách)', A7 'Đã sửa feedback (khách)' — các bước NỘI BỘ theo HT-016) vẫn qua được :780/:1025 → khách vẫn ép được sang 'Hoàn tất' (tín hiệu payroll của editor) giữa vòng sửa. Ngoài ra getShareSnapshot vẫn trả id của mọi task của khách (finding nói đúng), chỉ là write path đã tự gác.

---

### HT-015

**Mức:** Medium · **Kết luận:** CHƯA VÁ _(agent xác minh chấm ĐÃ VÁ, phản biện lật lại)_

**Bằng chứng từ agent xác minh:**

```
src/actions/share-portal-actions.ts:600-603 trong `requestPortalNotifyEmail`: `const inboxRl = await limitDb(`portal-notify-inbox:${notifyInboxKey(email)}`, 3, 60 * 60); if (!inboxRl.success) return { success: false, error: 'Too many attempts for this email. Please try again later.' }` — nằm TRƯỚC `rateLimit(...)` dòng 605 và trước `sendEmail` dòng 617. Đây chính là cap-theo-hộp-thư-đích mà finding đòi. Nó chặn bước 4 của kịch bản: `limitDb` (src/lib/review/rate-limit-db.ts:17-38) là fixed-window trên Postgres — `INSERT INTO "RateLimitBucket" ... ON CONFLICT ("key") DO UPDATE SET "count" = ...` — nên KHÔNG reset khi cold-start và dùng CHUNG giữa mọi lambda instance; và vì key là địa chỉ đích chứ không phải (shareLinkId, ip) nên xoay IP/botnet không cấp thêm ngân sách. Chuẩn hoá subaddressing có thật: `notifyInboxKey` dòng 540-562 strip `+tag` cho 16 domain trong PLUS_ALIAS_DOMAINS (dòng 531-538) và strip dấu chấm + gộp googlemail.com→gmail.com (dòng 558-560). Import `limitDb` dòng 36. Commit: 09e67a4.
```

**Ghi chú:** Cap chặt hơn cả đề xuất trong finding (3/giờ thay vì 10/ngày). Hai lưu ý phụ, KHÔNG làm kịch bản sống lại: (1) limiter per-IP dòng 605 vẫn là `rateLimit` in-memory (chưa thay bằng limiter bền như đề xuất) — nhưng nó chỉ còn là lớp phụ, cap per-inbox mới là lớp chặn thật; (2) limitDb fail-OPEN khi DB lỗi (rate-limit-db.ts:45, không truyền `failClosed:true`), nên trong sự cố DB thì cap này biến mất — đáng cân nhắc truyền failClosed:true cho đường gửi email, nhưng đó là điểm cứng hoá, không phải lỗ hổng còn nguyên.

**Vòng phản biện** — phán quyết: **BÁC BỎ** (lỗ hổng vẫn còn)

```
BÁC BỎ. Cap per-inbox CÓ THẬT (share-portal-actions.ts:600-603, limitDb bền trên Postgres, đặt trước sendEmail :617), nhưng nó KHÔNG chặn được kịch bản của finding với một lớp nạn nhân lớn, vì hàm chuẩn hoá bị làm yếu có chủ đích. notifyInboxKey (:540-562) CHỈ strip '+tag' khi domain nằm trong PLUS_ALIAS_DOMAINS (:531-538 — đúng 16 domain công cộng); comment :549-550 nói thẳng 'Unknown domains keep their local part intact'. Trong khi đó NOTIFY_EMAIL_RX (:512) = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ CHO PHÉP dấu '+' trong local part. Đường khai thác còn sót: nạn nhân victim@acme.com với acme.com host trên Google Workspace / Fastmail / Zoho / Proton custom domain (toàn bộ đều hỗ trợ subaddressing — và đây chính là hộp thư của khách B2B của agency, đối tượng cầm link /share). Attacker gọi requestPortalNotifyEmail(token,'victim+1@acme.com'), '+2', '+3'... mỗi biến thể ra MỘT key limitDb khác → mỗi cái được 3 email/giờ, trong khi Google giao TẤT CẢ vào victim@acme.com ⇒ khuếch đại về đúng 'gần như không giới hạn' như finding mô tả. Chính repo này đã có lời giải đúng: canonicalEmailKey ở src/app/api/r/[slug]/notifications/request-pin/route.ts:34-45 strip '+tag' cho MỌI domain (:39-40) và comment :28-32 gọi đích danh đây là cách subaddressing đánh bại cap — luồng portal lại không dùng nó. Thêm nữa, nửa thứ hai của 'Đề xuất sửa' KHÔNG được áp: :605 vẫn là `rateLimit` IN-MEMORY (src/lib/rate-limit.ts tự khai reset mỗi cold-start, phân tán theo instance), trong khi route /r sinh đôi có `limitDb('r:notif:ip:'+ip, 10, 86400)` bền (:75). Nên tổng lượng thư mà endpoint phát ra (tác động 'đốt uy tín domain gửi Resend / blocklist' ghi trong finding) vẫn không có trần bền nào chặn.
```

**Rủi ro còn lại:** Ngay cả khi vá subaddressing: limitDb fail-OPEN khi DB lỗi (rate-limit-db.ts:39-46, không truyền failClosed:true), nên trong sự cố DB cap này biến mất hoàn toàn. Điểm tích cực đã xác minh: getRequestIp (src/lib/share-link-auth.ts:53-66) đã lấy XFF phải-cùng nên không giả mạo IP bằng header được (phải có botnet IP thật).

---

### HT-016

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/task-actions.ts:88-96, nằm trong khối `if (!isWorkspaceAdmin)` (:84): `const enteringClientPhase = isClientFacingStatus(newStatus) && !isClientFacingStatus(task.status)` (:93) và `if (enteringTerminal || leavingTerminal || enteringClientPhase) return { error: 'Forbidden: Chỉ quản lý (admin) mới được ... gửi bản dựng cho khách.' }` (:94-96). Dòng 93-95 chặn CHÍNH XÁC bước 2 của kịch bản ('Editor gọi trực tiếp updateTaskStatus(taskId, "Đã gửi video (khách)", workspaceId)'), trả về TRƯỚC mọi ghi DB nên bước 3 (share-portal mint /r) không bao giờ tới. Chuỗi dẫn xuất kiểm tận gốc: src/lib/task-statuses.ts:166 `CLIENT_FACING_STATUSES = TASK_STATUS_META.filter(m => m.phase === 'client_review')` + :168-170 isClientFacingStatus; cả ba status A5/A6/A7 đều mang `phase: 'client_review'` tại :106 'Đã gửi video (khách)', :107 'Đã nhận feedback (khách)', :108 'Đã sửa feedback (khách)'. Đã loại trừ đường ghi status thay thế cho non-admin: updateTask generic có `delete data.status` trong nhánh non-admin (task-management-actions.ts:79); mọi bulk status action đều `verifyWorkspaceAccess(workspaceId, 'ADMIN')` (bulk-task-actions.ts:502 bulkUpdateTaskStatus, :802 bulkUpdateStatus); update-task-details.ts không ghi field status.
```

**Ghi chú:** Guard là loại 'ENTERING' (`&& !isClientFacingStatus(task.status)`), nên khi task ĐÃ ở phase khách do admin F10 đưa vào, assignee vẫn chuyển qua lại giữa A5/A6/A7 được — dư lượng hẹp, KHÔNG phải kịch bản HT-016 (bản dựng khi đó đã được admin duyệt lộ cho khách). validateTransition (:101) vẫn là stub luôn trả isValid:true (fsm-config.ts:122) — biện pháp chặn thực sự là khối H3/HT-016 thủ công ở :84-97, không phải FSM.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được. src/actions/task-actions.ts:93 enteringClientPhase = isClientFacingStatus(newStatus) && !isClientFacingStatus(task.status); :94-96 return { error } — nằm trong khối !isWorkspaceAdmin (:84) và TRẢ VỀ TRƯỚC $transaction mở ở :153, tức chặn đúng bước 2 kịch bản trước mọi ghi DB nên bước 3 (mint /r) không tới. Chuỗi dữ liệu kiểm tận gốc: src/lib/task-statuses.ts:106-108 gán phase:'client_review' cho cả A5/A6/A7, CLIENT_FACING_STATUSES + isClientFacingStatus dẫn xuất từ đó. Tôi đã tự đi tìm ĐƯỜNG GHI THAY THẾ (không tin lời agent kia): grep task.update|task.updateMany toàn src/actions + src/app/api + src/lib → task-management-actions.ts:107 updateTask có delete data.status ở :79 cho non-admin; claim-actions.ts:187/:248 chỉ ghi status cố định 'Nhận task'/'Đang đợi giao'; bulk-task-actions đều admin-gated; admin-actions.ts:367 chỉ ghi assignedById; update-task-details.ts không đụng status; và toàn bộ 3 hành động review-module F8/F9/F10 (task-sync.ts markFeedbackDone/confirmFixDone/approveInternalAndSendToClient) đều đi qua delegateFlip → updateTaskStatus (task-sync.ts:241-253) nên KẾ THỪA guard này, không phải đường vòng.
```

**Rủi ro còn lại:** (1) ĐƯỜNG VÀO KHÁC VẪN HỞ ở tầng MCP: mcp-server/src/services/status-service.ts:31-117 updateTaskStatus KHÔNG có guard client-facing lẫn guard terminal — chỉ có BLOCKED_TRANSITIONS (:18-22) chặn vài bước lùi — nên service account MCP set thẳng 'Đã gửi video (khách)' và cả 'Hoàn tất' (chạm payroll) được. Principal khác (env MCP_PROFILE_ID, auth-context.ts) nên editor không với tới, nhưng bất biến R5/H3 KHÔNG được thực thi ở đó. (2) Guard là loại ENTERING (:93 có && !isClientFacingStatus(task.status)) nên assignee vẫn đi lại tự do giữa A5/A6/A7 khi task đã ở phase khách. (3) validateTransition (:101) vẫn là stub luôn trả isValid:true — không có lớp FSM đỡ nếu khối :84-97 hồi quy.

---

### HT-017

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/app/api/integrations/scan-folder/route.ts:113-122 — rate-limit đặt NGAY SAU authz và TRƯỚC mọi thao tác quét:
```
const scanRl = await limitDb(`scan-folder:${session.user.id}:${workspaceId}`, 10, 60)
if (!scanRl.success) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu quét...' },
        { status: 429, headers: { 'Retry-After': String(scanRl.retryAfterSec) } })
}
```
Chặn bước 'gửi N request scan-folder đồng thời/lặp liên tục': key gồm cả userId lẫn workspaceId, trần 10 request/60s; request thứ 11 trả 429 tại dòng 118-121, tức return TRƯỚC parseCloudLink (dòng 127) và trước recursiveScanFolder — không hề mở invocation 300s nào. limitDb (src/lib/review/rate-limit-db.ts:25-32) là upsert atomic trên bảng Postgres RateLimitBucket nên đếm đúng xuyên nhiều instance serverless (không phải bộ đếm in-memory vô dụng trên Vercel).
```

**Ghi chú:** Vá bởi commit 09e67a4. Dư (không thuộc kịch bản gốc, để cân nhắc): (1) limitDb FAIL-OPEN khi DB lỗi — rate-limit-db.ts:45 `return { success: !opts.failClosed }` và caller không truyền failClosed:true, nên sự cố DB sẽ tắt throttle; (2) chưa có trần SỐ SCAN ĐỒNG THỜI per user như phần 'Cân nhắc' của khuyến nghị — 10 lần/phút × 300s vẫn cho phép duy trì ~50 invocation song song; (3) ngưỡng 10/phút rộng hơn gợi ý 'vài scan/phút'.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/app/api/integrations/scan-folder/route.ts. limitDb tại :116 (`scan-folder:${session.user.id}:${workspaceId}`, 10/60s) nằm SAU verifyWorkspaceAccess (:101) và TRƯỚC parseCloudLink (:127), trước tra IntegrationToken (:141) và trước MỌI lời gọi tốn kém: recursiveScanFolder (:214, :222, :258, :266), scanDropboxFolder (:285), scanGoogleDriveFolder (:298). Request thứ 11 return 429 ở :118-121 nên không mở invocation 300s nào (maxDuration khai ở :56). Bộ đếm là bền và atomic thật: src/lib/review/rate-limit-db.ts:25-32 một câu INSERT ... ON CONFLICT DO UPDATE trên bảng RateLimitBucket, đúng xuyên nhiều instance serverless (khác bộ đếm in-memory). Tôi kiểm 'còn endpoint quét nào khác không': grep recursiveScanFolder/scanDropboxFolder/scanGoogleDriveFolder/runEngineV4 trên toàn src cho thấy route này là handler DUY NHẤT gọi scanner (chỗ còn lại là src/app/velox-v4-preview/page.tsx chạy client-side, không quét provider). Nhánh ?v=4 cũng nằm sau limiter.
```

**Rủi ro còn lại:** (1) FAIL-OPEN: rate-limit-db.ts:45 `return { success: !opts.failClosed }` và caller không truyền failClosed:true → DB trục trặc là throttle tự tắt, đúng lúc hệ thống đang yếu. (2) Không có trần SỐ SCAN ĐỒNG THỜI như phần 'Cân nhắc' của khuyến nghị: 10 lượt khởi động/phút × maxDuration 300s ⇒ một member vẫn duy trì được ~50 invocation 300s song song; key có cả workspaceId nên member của N workspace được N lần ngân sách đó → nguy cơ đốt quota OAuth dùng chung của agency mới chỉ giảm chứ chưa hết. (3) Ngưỡng 10/phút rộng hơn gợi ý 'vài scan/phút'.

---

### HT-018

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Đường logout THẬT vẫn không bump sessionVersion. Có một hàm ĐÃ vá nhưng là CODE CHẾT.

1) src/lib/auth.ts:51-54 — nguyên vẹn như finding mô tả:
`export async function logout() { const cookieStore = await cookies(); cookieStore.set('session', '', { expires: new Date(0) }) }` → chỉ xoá cookie trình duyệt.

2) src/app/api/auth/logout/route.ts — chỉ ghi `auditLog.create({ action: 'auth.logout' })` rồi dòng cuối `await logout(); redirect('/login')`. KHÔNG có `prisma.user.update({ sessionVersion: { increment: 1 } })`.

3) Hàm có bản vá — src/actions/auth-actions.ts:404-420 `logoutAction()` với comment `[AUDIT HT-018 fix]` (dòng 405) và `data: { sessionVersion: { increment: 1 } }` (dòng 414) — KHÔNG CÓ CALLER NÀO. `grep -rn "logoutAction" --include=*.ts --include=*.tsx .` toàn repo (trừ node_modules) trả về ĐÚNG 1 dòng: chính dòng định nghĩa 404. Mọi nút Đăng xuất thực tế đi qua GET /api/auth/logout: src/components/layout/AppSidebar.tsx:475 (`window.location.href = '/api/auth/logout'`), src/components/layout/CommandMenu.tsx:83, src/app/welcome/WelcomeClient.tsx:110, src/components/auth/EmailMigrationModal.tsx:149, và các redirect ở admin/layout.tsx:39, dashboard/layout.tsx:41, team/(browser)/layout.tsx:28.

4) Bước 3 của kịch bản vẫn chạy: `User.sessionVersion` trong DB không đổi sau logout → so sánh ở src/lib/security.ts:77-81 (`tokenSessionVersion < dbSessionVersion` → chỉ throw khi nhỏ hơn) và src/lib/profile-permissions.ts:54 vẫn PASS cho token replay.

5) getSession() (src/lib/auth.ts:65-74) chỉ `decrypt(session)`, không đọc DB, không kiểm sessionVersion — đúng như finding.

6) Rolling refresh gia hạn vô hạn vẫn còn: src/middleware.ts:145-162 — `if (sessionPayload?.user && !sessionPayload.user.isImpersonating)` … `msLeft < (SESSION_MAX_AGE * 1000) / 2` → `encrypt({ user: sessionPayload.user, ... }, '${SESSION_MAX_AGE}s')`, copy nguyên `user` (kèm sessionVersion cũ). SESSION_MAX_AGE = 30 ngày (src/lib/jwt.ts:8).
```

**Ghi chú:** Đây là bẫy 'trông như đã vá': có comment `[AUDIT HT-018 fix]` trong auth-actions.ts nhưng gắn vào hàm không ai gọi (logoutAction có từ commit fa31709, phần bump được thêm ở bfca2e6). Fix thật cần đặt bump vào src/lib/auth.ts:logout() hoặc vào src/app/api/auth/logout/route.ts trước lời gọi `logout()`, HOẶC đổi các nút UI sang gọi logoutAction. Lưu ý đánh đổi UX đã ghi trong finding: bump là toàn cục → đăng xuất mọi thiết bị.

---

### HT-019

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/lib/auth.ts:76-96, `createImpersonationSession()` — TTL mật mã đã được truyền tường minh, chặn bước 4 của kịch bản ("kẻ giữ được chuỗi cookie đó vẫn có thể set lại và request ... trong tối đa 7 ngày").

Dòng 88-96 (phiên đóng vai): `const impersonatedSessionStr = await encrypt({ user: { ...targetUser, isImpersonating: true, originalAdminId: ..., impersonationExpiresAt: expires.toISOString() }, expires }, '2h')` — tham số thứ 2 = `'2h'`, kèm comment `[AUDIT HT-019 fix] JWT exp = 2h to match the impersonation window (was 1-week default)`.
Dòng 83 (phiên admin cất giữ): `await encrypt({ user: originalUser, expires }, '2h')` — cũng đã truyền TTL.

Đối chiếu src/lib/jwt.ts:16-22: `export async function encrypt(payload: any, ttl: string = '1 week')` … `.setExpirationTime(ttl)`. Vì `'2h'` giờ được truyền, default `'1 week'` KHÔNG còn áp dụng → claim `exp` = +2h. decrypt() (jwt.ts:24-29) dùng `jwtVerify` sẽ ném lỗi sau mốc 2h, và getSession() (auth.ts:69-73) bắt lỗi → trả `null`. Token replay sau 2h không còn được server honor.

Cửa 2h không thể bị kéo dài: src/middleware.ts:145 `if (sessionPayload?.user && !sessionPayload.user.isImpersonating)` — rolling refresh CỐ Ý bỏ qua phiên impersonation, nên `exp` 2h không được gia hạn.

Dòng 77 `const expires = new Date(Date.now() + 2 * 60 * 60 * 1000)` vẫn dùng cho thuộc tính cookie (dòng 102, 111) và cho claim `impersonationExpiresAt` (dòng 93) — giờ đã khớp với TTL mật mã.
```

**Ghi chú:** Vá bởi commit bfca2e6 (`git log -S"'2h'" -- src/lib/auth.ts`). Số dòng lệch so với finding (85 → 88-96).
RESIDUAL 1 (nhánh defense-in-depth chưa làm): KHÔNG chỗ nào server-side đọc/enforce `impersonationExpiresAt` — getSession() (auth.ts:65-74) và verifyActiveSession/verifyWorkspaceAccess (src/lib/security.ts) chỉ dựa vào `exp` của JWT. Hiện `exp` = 2h nên trùng khớp, nhưng nếu ai đó bỏ tham số `'2h'` lần nữa thì lỗ tái xuất hiện ngay, không có lớp chặn thứ hai.
RESIDUAL 2 (trong 2h): cookie vẫn `secure: false` khi ELECTRON_DESKTOP hoặc non-production (auth.ts:104, 112) → token đóng vai vẫn có thể bị chặn bắt qua HTTP và replay trong tối đa 2 giờ.
TÁC DỤNG PHỤ CHỨC NĂNG (không phải lỗ bảo mật, nên báo owner): stopImpersonationSession (auth.ts:119-141) khôi phục `admin_session` với thuộc tính cookie `expires` = +7 ngày (dòng 122) NHƯNG chuỗi JWT đó được ký TTL '2h' ở dòng 83 → sau ~2h kể từ lúc bắt đầu đóng vai, admin quay lại phiên gốc sẽ bị văng ra login dù cookie còn hạn.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh: src/lib/auth.ts:83 và :88-96 truyền '2h' vào encrypt(); src/lib/jwt.ts:16-21 dùng chính tham số đó cho .setExpirationTime(ttl). Tôi CHẠY THỬ jose 6.1.3 trong node_modules của repo (SignJWT.setExpirationTime('2h')) → exp-iat = 7200s, tức '2h' được parse đúng, không rơi về default '1 week'. Bước 4 kịch bản (replay chuỗi cookie sau khi trình duyệt tự xóa ở mốc 2h, kéo tới 7 ngày) chết tại decrypt→jwtVerify (jwt.ts:24-28) ném JWTExpired → getSession() catch tại auth.ts:71-73 trả null. Tôi kiểm luôn hướng 'vá một đường, hở đường khác': grep toàn bộ src cho `.set('session'` chỉ ra 5 điểm ghi cookie phiên — middleware.ts:154 (đã loại phiên đóng vai bằng điều kiện `!sessionPayload.user.isImpersonating` ở :145), auth.ts:23 login, auth.ts:42 loginWithProfile, auth.ts:110 (phiên đóng vai, 2h), auth.ts:127 (khôi phục). login/loginWithProfile chỉ có 3 caller: auth-actions.ts:378/382 (đăng nhập mới, không copy isImpersonating), user-actions.ts:61 và profile-actions.ts:563 — cả hai đều bị chặn TRƯỚC bởi `if (session.user.isImpersonating) return {error}` tại user-actions.ts:18 và profile-actions.ts:520, nên không có đường nào copy payload isImpersonating sang TTL 30 ngày. Kết luận DA_VA của agent kia đứng vững.
```

**Rủi ro còn lại:** (1) KHÔNG có lớp thứ hai: không chỗ nào server-side đọc `impersonationExpiresAt` (getSession auth.ts:65-74, verifyActiveSession/verifyWorkspaceAccess trong src/lib/security.ts chỉ dựa `exp`) → nếu ai đó xóa tham số '2h' lần nữa thì lỗ tái xuất hiện ngay, im lặng. (2) Trong 2h vẫn replay được: cookie `secure` = false khi ELECTRON_DESKTOP hoặc non-production (auth.ts:104, :112). (3) Chức năng (không phải bảo mật): stopImpersonationSession (auth.ts:119-141) đặt cookie `expires` +7 ngày ở :122 nhưng chuỗi JWT bên trong ký TTL '2h' ở :83 — nếu admin dừng đóng vai SAU 2h thì bị văng ra login; nếu dừng trong 2h thì rolling refresh (middleware.ts:145-162) tái cấp 30 ngày nên không thấy triệu chứng.

---

### HT-020

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Chỉ nhánh MEMBER được vá, nhánh GUEST — đúng nhánh mà kịch bản khai thác dùng — vẫn nguyên.
Đã vá (member): src/lib/review/comments.ts:639-644 `if (!/^image\//.test(input.mimeType) || /svg/i.test(input.mimeType)) throw apiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ đính kèm được ảnh (không hỗ trợ SVG).')` với comment `[AUDIT HT-020 fix]`.
CHƯA vá (guest) — chạy lại từng bước kịch bản:
• Bước 2 (POST /api/r/{slug}/comment-attachments/initiate với mimeType='image/svg+xml'): src/app/api/r/[slug]/comment-attachments/initiate/route.ts:39 parse bằng `initiateAttachmentSchema` (định nghĩa src/lib/review/comments.ts:82-88, `mimeType: z.string()` — KHÔNG ràng buộc), rồi dòng 41 gọi initiateGuestAttachment. Tại src/lib/review/share-comments.ts:483 chỉ còn `if (!/^image\//.test(input.mimeType))` — KHÔNG có bộ lọc /svg/, 'image/svg+xml' lọt.
• Bước 3 (PUT giữ Content-Type SVG): src/lib/review/share-comments.ts:493 `presignPutObject(key, input.mimeType, ttl)` → src/lib/review/r2.ts:83 `new PutObjectCommand({ ..., ContentType: contentType })` ký đúng Content-Type client gửi.
• Bước 4 (đính vào comment): schema attachment guest src/lib/review/share-comments.ts:36 `mimeType: z.string().regex(/^image\//, 'image_only')` — svg+xml vẫn khớp.
• Bước 5 (/raw phục vụ inline): src/lib/review/share-comments.ts:507 `return presignGetObject(attach.r2Key, { expiresIn: 15 * 60 })` — không truyền downloadFileName, mà src/lib/review/r2.ts:137-139 CHỈ set ResponseContentDisposition khi có downloadFileName → R2 trả nguyên Content-Type: image/svg+xml, render inline.
```

**Ghi chú:** Số dòng lệch: finding ghi comments.ts:559 / share-comments.ts:483 — nay initiateAttachment ở comments.ts:636 (đã vá), initiateGuestAttachment vẫn đúng share-comments.ts:477-495. Vá còn thiếu 3/4 điểm mà finding liệt kê: share-comments.ts:483 (initiateGuestAttachment), share-comments.ts:36 và comments.ts:60 (attachmentInputSchema.mimeType vẫn chỉ regex /^image\//). Phòng thủ tầng 2 (ép ResponseContentDisposition ở /raw) cũng chưa có cho cả hai endpoint raw (member src/app/api/review/comment-attachments/[id]/raw + guest src/app/api/r/[slug]/comment-attachments/[id]/raw).

---

### HT-021

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Toàn bộ chuỗi khai thác còn nguyên. Bước 1 (comment ẩn danh → tự nhận danh tính khách): src/lib/review/share-auth.ts:336-356 `resolveGuestForWrite` vẫn kết thúc bằng `const linkGuest = await createLinkClientGuestSession(share, { userAgent }); if (linkGuest) return linkGuest` (dòng 353-354), và `createLinkClientGuestSession` dòng 309-327 vẫn tạo GuestSession với `name: client.name` (dòng 320) + `emailVerifiedAt: new Date()` (dòng 322), không hề hỏi tên/email. Vẫn được cắm vào 3 route: src/app/api/r/[slug]/comments/route.ts:57, comments/[id]/reactions/route.ts:31, comment-attachments/initiate/route.ts:32 (comments/route.ts:57-62 truyền `guestInput ?? null` nên khách ẩn danh rơi thẳng vào nhánh auto-identity, rồi dòng 67-68 set cookie rv_guest). Bước 2 (ký duyệt dưới tên khách): src/app/api/r/[slug]/decision/route.ts:45 `let guest = await getGuestSession(share, req.cookies)` — `getGuestSession` (share-auth.ts:154-165) chỉ kiểm tokenHash + shareLinkId, KHÔNG lọc session tổng hợp; rồi src/lib/review/share-decision.ts:182-183 `const signerName = guest.name; const signerEmail = guest.email`. Guard `isSyntheticGuestEmail` (share-auth.ts:59-61) tuy ĐÃ tồn tại và comment dòng 52-56 nói rõ 'must NEVER be treated as email-verified for a client SIGN-OFF decision', nhưng grep toàn src cho thấy nó CHỈ được gọi ở src/lib/review/guest-subscribe.ts:194 (đếm reviewer slot) — KHÔNG hề được gọi trong share-decision.ts hay decision/route.ts.
```

**Ghi chú:** Guard tồn tại nhưng chưa nối vào đường quyết định — đây là điểm sửa rẻ nhất nếu owner đảo quyết định. Đúng như finding mô tả, đây là MIỄN TRỪ CÓ CHỦ Ý: share-decision.ts:176-181 ghi rõ '[Owner decision 2026-07-15] ... The owner explicitly waived impersonation protection here ("mạo danh không quan trọng")'. Phạm vi vẫn bị bó bởi các gate khác trong submitGuestDecision: dòng 137-139 (phải có asset.taskId), 168-171 (từ chối task đã huỷ/archive), 172-174 (isClientFacingPhase). Cần owner ra quyết định, không nên tự vá.

---

### HT-022

**Mức:** High · **Kết luận:** CHƯA VÁ _(agent xác minh chấm ĐÃ VÁ, phản biện lật lại)_

**Bằng chứng từ agent xác minh:**

```
src/actions/global-settings.ts:20-28 — thêm gate đặc quyền sau verifyActiveSession:
```
const uid = (sess.session as any)?.user?.id as string | undefined
if (!uid) return { account: '', password: '' }
const adminMembership = await prisma.workspaceMember.findFirst({
    where: { userId: uid, role: { in: ['OWNER', 'ADMIN'] } },
    select: { id: true },
})
if (!adminMembership && !sess.isAdmin) {
    return { account: '', password: '' }
}
```
Chặn bước 2-3 của kịch bản (user tự đăng ký gọi getFrameAccount rồi nhận plaintext): tài khoản self-signup không thuộc workspace nào → findFirst dòng 22-25 trả null, và sess.isAdmin = !!dbUser.isTreasurer (src/lib/security.ts:278) = false → dòng 26-28 return chuỗi rỗng, thoát TRƯỚC khi đọc Task 'global-system-settings' (dòng 30) và trước khi JSON.parse trả password (dòng 39-43).
```

**Ghi chú:** Vá bởi commit bfb58d5. Chọn phương án 'scope theo workspace OWNER/ADMIN' trong 'Đề xuất sửa'. Dư (thiết kế, ngoài kịch bản gốc): credential vẫn là GLOBAL (Task workspaceId=null) và vẫn trả PLAINTEXT password cho bất kỳ OWNER/ADMIN của BẤT KỲ tenant nào → phần 'cross-team/cross-tenant' ở tiêu đề chưa đóng hoàn toàn; ngoài ra updateFrameAccount (dòng 54-60) vẫn CHỈ yêu cầu session active — mọi user đăng nhập vẫn GHI ĐÈ được credential dùng chung (đây là hướng khác, không nằm trong HT-022).

**Vòng phản biện** — phán quyết: **BÁC BỎ** (lỗ hổng vẫn còn)

```
BÁC BỎ — kịch bản khai thác của finding CHẠY NGUYÊN VẸN. Cổng mới ở src/actions/global-settings.ts:22-28 hỏi: `prisma.workspaceMember.findFirst({ where: { userId: uid, role: { in: ['OWNER','ADMIN'] } } })` — chú ý KHÔNG có ràng buộc workspaceId/profileId, tức là 'có phải OWNER/ADMIN của BẤT KỲ workspace nào không'. Nhưng chính luồng đăng ký công khai TỰ CẤP đặc quyền đó: src/actions/signup-actions.ts (header :3-4 ghi rõ 'Public signup server action') trong transaction :242-297 tạo Profile (:244), User role='USER' (:255-269), Workspace mặc định (:272-279) rồi `tx.workspaceMember.create({ data: { userId, workspaceId, role: 'OWNER' } })` (:280-286) + ProfileAccess role='OWNER' (:291-297). Vậy kịch bản gốc chỉ đổi đúng số bước: 1) tự đăng ký qua signup public → ngay lập tức có hàng WorkspaceMember role='OWNER'; 2) gọi getFrameAccount(); 3) findFirst :22-25 TRẢ VỀ hàng đó → điều kiện `!adminMembership` là false → KHÔNG return sớm ở :26-28 → chạy tiếp :30-43 và trả về plaintext { account, password }. Người ngoài tự đăng ký vẫn lấy được credential Frame.io dùng chung — đúng 'Ảnh hưởng' mà finding mô tả. Bằng chứng dòng mà agent kia đưa ra ('tài khoản self-signup không thuộc workspace nào → findFirst trả null') SAI về mặt dữ kiện: signup-actions.ts:272-286 chứng minh ngược lại.
```

**Rủi ro còn lại:** Hai lỗ liền kề cùng file (ngoài phạm vi HT-022 nhưng cùng tài sản): (a) credential vẫn GLOBAL (Task id='global-system-settings', workspaceId=null tại :64-77) và trả PLAINTEXT cho OWNER/ADMIN của BẤT KỲ tenant nào → phần 'cross-tenant' ở tiêu đề finding chưa đóng kể cả nếu vá được self-signup; (b) updateFrameAccount (:54-84) vẫn CHỈ đòi verifyActiveSession — mọi user đăng nhập vẫn GHI ĐÈ được credential dùng chung. Hướng sửa đúng: gate theo đặc quyền nền tảng (super-admin/treasurer) và KHÔNG trả password về client (chỉ trả trạng thái đã cấu hình / masked), như 'Đề xuất sửa' của finding.

---

### HT-023

**Mức:** Medium · **Kết luận:** CHƯA VÁ _(agent xác minh chấm ĐÃ VÁ, phản biện lật lại)_

**Bằng chứng từ agent xác minh:**

```
src/actions/cross-team-actions.ts:200-205 — guard mới cho target ADMIN:
```
// [AUDIT HT-023 fix] Removing a peer ADMIN's access is OWNER-only...
if (targetAccess.role === 'ADMIN' && callerRole !== 'OWNER' && callerId !== userId) {
    return { success: false, error: 'Chỉ chủ sở hữu (OWNER) mới được gỡ quyền của quản trị viên (ADMIN).' }
}
```
Chặn đúng bước 3 của kịch bản ('targetAccess.role=ADMIN != OWNER nên không bị chặn ở dòng 197 → transaction xoá'): với ADMIN A gọi removeCrossTeamAccess(adminB_userId, P, ws), targetAccess.role==='ADMIN' (đọc ở dòng 190-193), callerRole==='ADMIN' (dòng 179) ≠ 'OWNER', callerId≠userId → return lỗi tại dòng 204, thoát TRƯỚC prisma.$transaction ở dòng 219-233 nên WorkspaceMember/ProfileAccess của B không bị xoá. Guard OWNER cũ vẫn ở dòng 197-199.
```

**Ghi chú:** Vá bởi commit d252250. CHÚ Ý — vá một PHẦN: câu cuối kịch bản ('Tương tự có thể khoá bất kỳ USER/thành viên nào có ProfileAccess row') VẪN CHẠY: guard chỉ đặc cách target role==='ADMIN', còn dòng 227-229 vẫn `profileAccess.deleteMany({ where: { userId, profileId, role: { not: 'OWNER' } } })`, nên một profile ADMIN vẫn gỡ được thành viên role USER của home-profile — trái ma trận 'Xóa member | OWNER ✅ | ADMIN ❌' (profile-permissions.ts:12, canRemoveMember dòng 92-95 vẫn OWNER-only). Khuyến nghị (b) 'siết OWNER-only cho thao tác chạm thành viên non-du-học' chưa được áp; cũng chưa phân biệt grant du-học với thành viên home-profile.

**Vòng phản biện** — phán quyết: **BÁC BỎ** (lỗ hổng vẫn còn)

```
BÁC BỎ (vá MỘT NỬA). Guard mới src/actions/cross-team-actions.ts:203-205 đúng là chặn nhánh target ADMIN (tôi xác nhận nó nằm trước $transaction ở :219-233). NHƯNG finding HT-023 bao trùm cả 'thành viên' — tiêu đề FINDINGS.md:400 ghi rõ 'gỡ đồng-cấp ADMIN / THÀNH VIÊN', và câu cuối Kịch bản khai thác (FINDINGS.md:406) là 'Tương tự có thể khoá bất kỳ USER/thành viên nào có ProfileAccess row'. Đường đó VẪN CHẠY nguyên vẹn: một ADMIN của profile P gọi removeCrossTeamAccess(userC, P, wsInP) với userC role='USER' → :180-181 isProfileAdmin=true nên qua auth; :197 (chỉ chặn OWNER) qua; :203 (chỉ đặc cách ADMIN) qua; rồi transaction :219-233 xoá sạch WorkspaceMember của C ở MỌI workspace của P (:220-222), WorkspaceInvitation (:223-225), ProfileAccess (:227-229) và ProfileAccessRequest (:230-232) — C bị đá khỏi tenant. Tôi tự đối chiếu bất đối xứng: cửa chính tắc removeFromProfileAction (src/actions/profile-member-actions.ts:161-168) gate bằng canRemoveMember = OWNER-only (src/lib/profile-permissions.ts:92-95), và ma trận profile-permissions.ts:12 ghi 'Xóa member | OWNER ✅ | ADMIN ❌'. Vậy năng lực OWNER-only vẫn rò cho ADMIN qua cửa hông này — đúng bản chất lỗ hổng mà finding nêu.
```

**Rủi ro còn lại:** Cả hai khuyến nghị gốc (FINDINGS.md:408) đều chưa áp: (a) không có kiểm tra target thực sự là grant du-học (không đối chiếu User.profileId của target với profileId), nên action 'gỡ quyền du học' vẫn xoá được thành viên home-profile; (b) chưa siết OWNER-only cho thao tác chạm thành viên non-du-học. Hệ quả DoS: một ADMIN có thể lần lượt gỡ toàn bộ USER của tenant.

---

### HT-024

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/invoice-actions.ts. Kịch bản gốc bước 1: tạo hoá đơn customPrepaid=500, applyDeposit=false → invoice.depositDeducted lưu 500 nhưng depositBalance không đổi; bước 2: voidInvoice → `depositBalance: { increment: 500 }`. CHẶN TẠI: (a) dòng 411 khi create luôn set `clientDepositDeducted: 0` (không còn null cho hoá đơn mới — grep cho thấy `invoice.create` chỉ tồn tại DUY NHẤT ở dòng 394); (b) dòng 466-479: chỉ khi thực sự `decrement: deduct` khỏi depositBalance (dòng 467-472) mới ghi ngược `data: { clientDepositDeducted: deduct }` lên invoice (dòng 476-479); (c) dòng 645 `const refundAmount = fresh.clientDepositDeducted != null ? fresh.clientDepositDeducted : fresh.depositDeducted` + dòng 646 `if (Number(refundAmount) > 0)`. Với kịch bản khai thác: clientDepositDeducted = 0 → refundAmount = 0 → khối `tx.client.update({ depositBalance: { increment } })` (dòng 647-652) KHÔNG chạy → không có 500 credit khống. Cột đã khai báo tại prisma/schema.prisma:765 `clientDepositDeducted Decimal?`.
```

**Ghi chú:** Vá bởi commit d252250. Số dòng lệch (594 → 640-652). Residual (dữ liệu cũ, không phải code): hoá đơn tạo TRƯỚC commit này có clientDepositDeducted = NULL → fallback dòng 645 vẫn refund depositDeducted (gồm customPrepaid) y như cũ; cần backfill/diễn giải dữ liệu lịch sử nếu muốn triệt để. Ngoài ra schema thêm cột nhưng KHÔNG có file migration trong prisma/migrations (repo này tiến hoá schema bằng db push — clientSnapshot/billingSnapshot cũng không có migration) → phải đảm bảo prod đã có cột.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Xác nhận độc lập, KHÔNG bác bỏ được cho kịch bản đã nêu. Bất biến 'hoàn đúng phần đã thực trừ' được giữ bởi cặp lệnh trong CÙNG một transaction: src/actions/invoice-actions.ts:466 `if (deduct > 0)` bọc cả `client.update depositBalance: { decrement: deduct }` (:467-472) LẪN `invoice.update data: { clientDepositDeducted: deduct }` (:476-479) — không có nhánh nào ghi clientDepositDeducted khác 0 mà không thực sự trừ balance; mọi hoá đơn mới khởi tạo với `clientDepositDeducted: 0` ở :411. Void đọc lại dưới advisory lock (:615-621) và dùng `refundAmount = fresh.clientDepositDeducted != null ? ... : fresh.depositDeducted` (:645) + `if (Number(refundAmount) > 0)` (:646). Với kịch bản gốc (customPrepaid=500, applyDeposit=false): data.clientDepositDeducted falsy → khối :459-481 không chạy → clientDepositDeducted=0 → refundAmount=0 → khối increment :647-652 KHÔNG chạy. Tôi tự kiểm hai đường vòng: (1) grep toàn repo `invoice.create` chỉ có 1 hit (:394) — không có đường tạo hoá đơn nào khác bỏ qua :411; (2) grep `depositBalance` toàn src/ cho thấy CHỈ 2 chỗ ghi: :470 (decrement) và :650 (increment) — không có action/route nào khác cộng số dư ký quỹ. Biến thể tôi thử: gửi clientDepositDeducted phồng lên vẫn bị clamp `Math.min(..., available)` ở :465 rồi ghi lại đúng `deduct`, nên refund luôn == số thực rời khỏi balance.
```

**Rủi ro còn lại:** (1) Dữ liệu lịch sử: fallback ở :645 khiến MỌI hoá đơn tạo trước bản vá (clientDepositDeducted = NULL) vẫn hoàn nguyên depositDeducted (gồm customPrepaid) — bất kỳ hoá đơn cũ chưa void nào có customPrepaid>0 vẫn sinh tín dụng ảo đúng một lần khi bị void. Cần backfill trước khi coi là đóng hẳn. (2) Triển khai: cột clientDepositDeducted chỉ khai báo ở prisma/schema.prisma:765, KHÔNG có file migration nào trong prisma/migrations (grep -rl chỉ trả về schema.prisma) — repo tiến hoá schema bằng db push; nếu prod chưa push, createInvoiceRecord (:411) và voidInvoice (:620) sẽ throw ở runtime.

---

### HT-025

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/share-link-actions.ts:25-44 `gateShareLinkAdmin`. Dòng 31-33 CHÍNH LÀ chỗ chặn bước 2 của kịch bản ('A dùng cookie cũ POST thẳng tới createClientShareLink'): `if (!(await isSessionLive(session))) { return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' } }` — đặt NGAY SAU getSession() dòng 26-27 và TRƯỚC mọi truy vấn/mint token. `isSessionLive` (src/lib/profile-permissions.ts:46-56) hit DB thật: `prisma.user.findUnique({ select: { role: true, sessionVersion: true } })` rồi `if (!dbUser || dbUser.role === 'LOCKED') return false` (dòng 53) → chặn nhánh tài khoản bị khoá; `if (((session?.user?.sessionVersion) ?? 0) < (dbUser.sessionVersion ?? 0)) return false` (dòng 54) → chặn nhánh logout-all-devices / reset mật khẩu. Cả 3 action đều đi qua gate này: createClientShareLink dòng 47, revokeClientShareLink dòng 92, listClientShareLinks dòng 122 — không action nào bypass. Import dòng 20. Commit: d252250.
```

**Ghi chú:** Cách vá khác đề xuất trong finding (giữ getSession()+canManageShareLinks rồi CHÈN isSessionLive, thay vì thay bằng verifyProfileAdminAccess) nhưng đạt đúng hai bất biến mà finding đòi (LOCKED + sessionVersion) và giữ nguyên ngữ nghĩa OWNER/ADMIN-của-profile ở dòng 39-42. Không tìm thấy đường vòng: grep `gateShareLinkAdmin` trong file cho đúng 4 hit (1 định nghĩa + 3 caller).

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Xác nhận độc lập, KHÔNG bác bỏ được. src/actions/share-link-actions.ts:31-33 gọi `isSessionLive(session)` ngay sau getSession() (:26-27) và TRƯỚC mọi truy vấn workspace (:34), kiểm tra client (:51) hay mint token (:62-71) — chặn đúng bước 2 kịch bản ('A dùng cookie cũ POST thẳng tới createClientShareLink'). isSessionLive (src/lib/profile-permissions.ts:46-56) hit DB thật (:49-52) rồi chặn LOCKED ở :53 và stale token ở :54 (`tokenSessionVersion < dbSessionVersion`) — đúng hai bất biến mà finding đòi. Cả 3 action đi qua gate: :47, :92, :122, và mỗi caller kiểm `'error' in gate` ngay dòng kế (:48, :93, :123) nên không có nhánh nào chạy tiếp sau lỗi. Tôi tự kiểm đường vòng mà agent kia không nêu: grep toàn repo `clientShareLink.create` chỉ có 1 hit trong src/ (share-link-actions.ts:63) — các hit còn lại nằm trong scripts/test-*.ts (harness offline, không phải endpoint). share-portal-actions.ts:609/650/668/686 chỉ update metadata thông báo qua token khách, không mint được link mới. Không có API route nào tạo ClientShareLink.
```

**Rủi ro còn lại:** Nhỏ: phiên đóng-vai (createImpersonationSession, src/lib/auth.ts:76-91) mint payload từ targetUser chỉ gồm id/username/nickname/role/email (impersonation-actions.ts:78-84) — KHÔNG có sessionVersion, nên isSessionLive coerce về 0 và sẽ chặn nếu nạn nhân từng bump sessionVersion. Đây là fail-closed (an toàn), chỉ là điểm cần biết khi test hồi quy.

---

### HT-026

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
NỬA ĐÃ VÁ (đường @mention) — src/actions/task-comment-actions.ts:274-284 trong createTaskComment():
```
let notifyTargets = mentions.filter((m) => m !== userId)
if (visibility === 'INTERNAL' && notifyTargets.length > 0) {
    const rows = await prisma.user.findMany({ where: { id: { in: notifyTargets } }, select: { id: true, role: true, clientId: true } })
    const clientAccountIds = new Set(rows.filter((r) => r.role === 'CLIENT' || r.clientId != null).map((r) => r.id))
    notifyTargets = notifyTargets.filter((m) => !clientAccountIds.has(m))
}
```
Dòng 283 chặn BƯỚC 3 của kịch bản gốc (resolveMentions map '@jacob' → userId khách → vòng notify). Commit d252250.

NỬA CHƯA VÁ (đường assignTaskComment — finding gọi là 'Cùng lỗi lặp lại ở assignTaskComment() dòng 398'):
- src/actions/task-comment-actions.ts:356-362 `isWorkspaceMember()` VẪN chỉ kiểm tồn tại row, KHÔNG loại CLIENT/clientId:
  `const m = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: candidateUserId }, select: { id: true } }); return !!m`
- src/actions/task-comment-actions.ts:371-374 select của comment KHÔNG lấy `visibility` (`select: { taskId: true, isDeleted: true, body: true }`) → nhánh notify không thể biết comment là INTERNAL.
- src/actions/task-comment-actions.ts:411-416 gửi nguyên preview bất kể visibility:
  `body: `${actorName}: ${c.body.slice(0, 140)}`` + `metadata: { ..., preview: c.body.slice(0, 200) }` + `broadcastNotificationToUser(assigneeUserId, ...)`.
Không có dòng nào trong assignTaskComment chặn tài khoản khách nhận nội dung INTERNAL.

XÁC MINH KHẢ NĂNG TỚI ĐƯỢC: `git show d252250 -- src/actions/task-comment-actions.ts` cho thấy patch CHỈ sửa createTaskComment (+17 dòng), không đụng assignTaskComment. Tài khoản đủ điều kiện vẫn tồn tại: (a) User role='USER' nhưng clientId != null vẫn được mời làm WorkspaceMember bình thường — guard duy nhất ở member-actions.ts:367 và :403 chỉ chặn `role === 'CLIENT'` / ProfileAccess role CLIENT, KHÔNG hề xét clientId (chính lớp mà bản vá createTaskComment ở dòng 281 phải thêm vào); (b) row CLIENT cũ còn sót — member-actions.ts:215-217 tự thừa nhận ('Drop any CLIENT-role account that slipped in via a stray WorkspaceMember row'), chỉ lọc ở tầng DTO chứ không xoá row, và src/lib/workspace-membership.ts:94 chỉ chặn tạo MỚI.
```

**Ghi chú:** PHÂN LOẠI CHUA_VA vì vá một nửa. Kịch bản 4 bước viết trong finding (@mention) ĐÃ bị chặn tại dòng 283; nhưng 'Vấn đề' của finding — 'Đường notify của bình luận không tôn trọng ranh giới visibility INTERNAL/CLIENT' — vẫn đúng cho đường thứ hai mà chính finding nêu tên (assignTaskComment:398). Bullet thứ 2 của 'Đề xuất sửa' ('Với assignTaskComment, chặn giao comment INTERNAL cho tài khoản role CLIENT — kiểm tra User.role/ProfileAccess thay vì chỉ WorkspaceMember tồn tại') CHƯA được áp dụng. Việc cần làm còn lại RẤT hẹp: (1) thêm `visibility: true` vào select dòng 373; (2) khi visibility==='INTERNAL', tra User.role/clientId của assigneeUserId và từ chối/không notify — dùng lại đúng vị từ `r.role === 'CLIENT' || r.clientId != null` ở dòng 281. Số dòng lệch so với finding gốc: createTaskComment notify nay ở 285-294 (finding ghi 270-279); assign notify nay ở 407-418 (finding ghi 398). Ghi chú phụ: nhánh resolve/reopen phía dưới (dòng 427+) cũng gửi preview c.body theo cùng mẫu — nên rà cùng lúc.

---

### HT-027

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/lib/review/folders.ts:1455-1466 (restoreItems, ngay sau `const access = await requireReviewAccess({ workspaceId })` ở dòng 1450):
```
if (!access.isAdmin) {
    const forbidden = folderRows.find((f) => f.createdById !== access.userId)
    if (forbidden) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ người tạo hoặc quản trị được khôi phục thư mục này.', { failedItemId: forbidden.id })
    }
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })
    assertFolderPathsMutable(scope, [
        ...folderRows.map((f) => f.path),
        ...assetRows.map((a) => a.folder?.path).filter((p): p is string => !!p),
        ...versionRows.map((v) => v.asset.folder?.path).filter((p): p is string => !!p),
    ])
}
```
CHẶN BƯỚC NÀO: kịch bản gốc là 'POST /api/review/trash/restore body {"items":[{"type":"folder","id":"<folder-do-admin-xoa-ngoai-pham-vi>"}]}' bằng tài khoản USER. Dòng 1456-1459 (FR-B07) ném 403 ngay tại bước POST đó vì folder do admin tạo → `f.createdById !== access.userId` khớp → không bao giờ tới `prisma.$transaction` ở dòng 1505, tức không có un-delete/re-home. Biến thể type='asset'/'version' bị dòng 1461-1465 (FR-03) chặn: assertFolderPathsMutable (src/lib/review/folder-scope.ts:127-130) lặp qua từng path và ném outOfScope() 403 khi `!isPathMutable`, và isPathMutable (folder-scope.ts:109-112) chỉ true khi path nằm dưới allowedPrefixes.
Điều kiện phụ đã thoả: assetRows dòng 1436 nay có `include: { folder: { select: { path: true } } }`, versionRows dòng 1439-1442 có `asset: { select: { id: true, folder: { select: { path: true } } } }` — đúng cái finding cảnh báo là 'hiện chưa lấy path'. Import sẵn ở folders.ts:18/23.
KHẢ NĂNG TỚI ĐƯỢC còn nguyên (không phải KHONG_REACHABLE): src/app/api/review/trash/restore/route.ts vẫn `export const POST = withReviewRoute(...)` gọi `restoreItems(parsed.data)`.
```

**Ghi chú:** Số dòng lệch mạnh so với finding: restoreItems nay ở dòng 1425 (finding ghi 949), deleteItems ở 1135 (finding ghi 775-787) — do các commit trash-lifecycle 50e97eb/16cac71 chen vào giữa. Vá bởi commit d252250. Bản vá bám sát 'Đề xuất sửa' của finding gồm cả điểm 'phải include folder.path khi truy vấn assetRows', và còn mở rộng thêm cho type 'version' (loại item mới xuất hiện sau lúc kiểm toán) — không có lỗ hở theo kiểu quên nhánh mới. Guard đặt TRƯỚC transaction nên không có TOCTOU ghi-một-phần.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/lib/review/folders.ts:1425-1534 (restoreItems — nay ở :1425, finding ghi :949). Kịch bản gốc (USER là thành viên workspace POST /api/review/trash/restore với folder do admin tạo/xoá ngoài phạm vi) bị chặn tại :1455-1459: `if (!access.isAdmin) { const forbidden = folderRows.find((f) => f.createdById !== access.userId); if (forbidden) throw apiError(403, 'FORBIDDEN', ...) }` — ném 403 nên KHÔNG bao giờ tới `prisma.$transaction` ở :1505, tức không có un-delete/re-home. Biến thể asset/version bị :1460-1465 chặn: getFolderScope + assertFolderPathsMutable (src/lib/review/folder-scope.ts:127-130 lặp từng path, ném outOfScope() 403 khi !isPathMutable; isPathMutable :109-112 chỉ true khi path nằm dưới allowedPrefixes). Guard đặt TRƯỚC transaction → không có TOCTOU ghi-một-phần. Tôi kiểm thêm 3 điểm mà agent kia không nêu: (1) điều kiện dữ liệu đã đủ — assetRows :1436 có `include: { folder: { select: { path: true } } }`, versionRows :1439-1442 có asset.folder.path (đúng cảnh báo 'hiện chưa lấy path' của finding); (2) `.filter((p): p is string => !!p)` ở :1463-1464 KHÔNG mở lỗ bỏ sót vì prisma/schema.prisma khai ReviewAsset.folderId là `String` KHÔNG nullable (onDelete: Restrict) và ReviewVersion.assetId cũng không nullable → folder luôn tồn tại, không có item nào lọt qua vòng kiểm path; (3) access.isAdmin là WORKSPACE-scoped chứ không phải User.role toàn cục (src/lib/review/access.ts:79-94: OR của workspaceRole/profileRole OWNER|ADMIN, và `isAdmin: isWorkspaceAdmin && !isGuest`) → một ADMIN toàn cục chỉ là MEMBER của workspace này KHÔNG bypass được. Đường vào duy nhất vẫn sống: src/app/api/review/trash/restore/route.ts:20-24 `export const POST = withReviewRoute(...)`, và workspaceId được suy ra TỪ CHÍNH các row (:1447-1449) chứ không nhận từ body → không tự chọn được workspace.
```

**Rủi ro còn lại:** Với type 'folder', kiểm tra hiệu dụng thực chất chỉ là creator-only: getFolderScope (folder-scope.ts:81) đưa mọi folder `createdById = userId, systemKey: null` vào allowedPrefixes, nên folder do chính editor tạo luôn tự thoả assertFolderPathsMutable. Đúng bằng deleteItems nên nhất quán, không phải lỗ mới.

---

### HT-028

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/lib/review/folders.ts:1285-1291 (listTrash):
```
if (!access.isAdmin) {
    const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin })
    if (!scope.unrestricted) {
        rootFolders = rootFolders.filter((f) => isPathVisible(scope, f.path))
        rootAssets = rootAssets.filter((a) => isPathVisible(scope, a.folder?.path ?? ''))
    }
}
```
và dòng 1320-1324 cho nhánh version:
```
let rootVersions = delVersions
if (!access.isAdmin) {
    const scope = await getFolderScope({ ... })
    if (!scope.unrestricted) rootVersions = rootVersions.filter((v) => isPathVisible(scope, v.asset.folder?.path ?? ''))
}
```
CHẶN BƯỚC NÀO: kịch bản gốc là 'GET /api/review/trash?workspaceId=W → nhận items[] gồm tên + id + người xoá của mọi mục đã xoá toàn workspace'. Dòng 1288-1289 cắt rootFolders/rootAssets TRƯỚC khi mảng `all` được dựng (dòng 1368-1405) — nên tên (f.name/a.name), id, và deletedBy (loadUserRefs ở dòng 1361-1365 chỉ nhận deletedById của tập ĐÃ lọc) của mục ngoài subtree không bao giờ vào DTO. Không còn id nào để chuyền sang chuỗi khai thác restore.
isPathVisible (src/lib/review/folder-scope.ts:103-106) trả false khi path không giao với allowedPrefixes.
Điều kiện phụ đã thoả: dòng 1261 select nay có `path: true` cho delFolders, dòng 1265 có `folder: { select: { path: true } }` cho delAssets — đúng thứ finding nói là còn thiếu.
PHÂN TRANG: lọc chạy trước `const total = all.length` (dòng 1408) và trước lát cắt cursor (dòng 1412-1418), khớp yêu cầu 'cần lọc trước khi cắt trang' trong mục Rủi ro khi sửa — total không rò số lượng mục ngoài phạm vi.
KHẢ NĂNG TỚI ĐƯỢC còn nguyên: src/app/api/review/trash/route.ts vẫn `export const GET = withReviewRoute(...)` gọi `listTrash({ workspaceId, limit, cursor })`.
```

**Ghi chú:** Số dòng lệch: listTrash nay ở 1247 (finding ghi 852). Vá bởi commit d252250. Nhánh 'version' (rootVersions) không có trong finding gốc — nó được thêm bởi commit trash-lifecycle 50e97eb SAU mốc kiểm toán 72e6457 — nhưng cũng đã được lọc scope ở dòng 1323, nên không mở lại lỗ cũ qua đường mới. Một điểm nhỏ đáng biết (KHÔNG phải lỗ của HT-028): truy vấn SQL raw tính folderMeta dòng 1339-1357 và groupBy vCounts dòng 1294-1296 chạy SAU khi lọc (chỉ trên rootFolders/rootAssetIds đã cắt), nên không rò kích thước/đếm của cây ngoài phạm vi.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Xác nhận độc lập, KHÔNG bác bỏ được. src/lib/review/folders.ts:1285-1291 cắt rootFolders/rootAssets, và :1320-1324 cắt rootVersions, TRƯỚC khi mọi thứ hạ nguồn chạy: loadUserRefs (:1361-1365, chỉ nhận deletedById của tập đã lọc), mảng DTO `all` (:1368-1405), `total = all.length` (:1408) và lát cắt cursor (:1412-1418) — nên tên, id, deletedBy và cả TỔNG SỐ đều không rò mục ngoài subtree, đúng yêu cầu 'lọc trước khi cắt trang'. Điều kiện phụ đã thoả: `path: true` ở :1261, `folder: { select: { path: true } }` ở :1265 và :1317. Điểm tôi kiểm thêm mà agent kia bỏ qua — bẫy `?? ''`: `isPathVisible(scope, a.folder?.path ?? '')` (:1289) sẽ trả TRUE cho MỌI scope nếu path rỗng, vì folder-scope.ts:105 có `p.startsWith(path)`. Nhưng bẫy này không kích hoạt được: prisma/schema.prisma:1686-1687 khai `folderId String` + `folder ReviewFolder` bắt buộc (onDelete: Restrict), và ReviewVersion.assetId (:1723) cũng bắt buộc → path không bao giờ rỗng. Chuỗi khai thác 'liệt kê id → restore trái phép' cũng đã bị cắt đầu kia: restoreItems gate scope ở :1455-1466 (assertFolderPathsMutable). Khả năng tới được vẫn nguyên (src/app/api/review/trash/route.ts GET → listTrash), nhưng dữ liệu trả về đã bị thu hẹp.
```

**Rủi ro còn lại:** Theo thiết kế, isPathVisible (folder-scope.ts:103-106) vẫn cho TỔ TIÊN hiển thị (`p.startsWith(path)`), nên tên + người xoá của folder container nằm trên đường dẫn tới subtree được giao vẫn lộ trong thùng rác. Đây khớp đúng hành vi listChildren/getFolderTree nên không phá bất biến FR-03, nhưng cần biết khi định nghĩa 'không rò gì cả'.

---

### HT-029

**Mức:** High · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
(a) Cấu hình build KHÔNG chặn .env: electron/builder.config.js:73-78 `extraResources: [{ from: '../.next/standalone', to: 'standalone', filter: ['**/*'] }, ...]` — không có mẫu loại trừ nào kiểu '!**/.env'; next.config.ts:32 `...(process.env.ELECTRON_DESKTOP ? { output: 'standalone' as const } : {})` và toàn file next.config.ts KHÔNG có outputFileTracingExcludes (grep 'outputFileTracing' = 0 kết quả). package.json:13 `build:desktop: cross-env ELECTRON_DESKTOP=1 next build && ... electron && npm run build` — không có assertion build-time nào kiểm .env. (b) Artifact VẪN TỒN TẠI trên đĩa (kiểm bằng ls trực tiếp, không dựa vào git): trong worktree này `ls electron/release` → 'No such file or directory' và không có .next/standalone, NHƯNG bản build gốc còn nguyên ở worktree anh em: C:/Users/Dareu/.gemini/antigravity/playground/blazing-station/.claude/worktrees/cranky-austin/electron/release/ chứa 'HustlyTasker Setup 1.0.0.exe' (520,581,414 bytes) + win-unpacked/, và `find . -name .env` trả về ./win-unpacked/resources/standalone/.claude/worktrees/cranky-austin/.env (2733 bytes) — đúng đường dẫn finding mô tả. Kiểm nội dung KHÔNG in giá trị, chỉ tên key + độ dài: DATABASE_URL(len 121), JWT_SECRET(53), RESEND_API_KEY(36), RESEND_FROM_EMAIL(24), ADMIN_EMAIL(27), CRON_SECRET(64), NEXT_PUBLIC_APP_URL(24), GPT4_API_KEY(21), NEXT_PUBLIC_SUPABASE_URL(40), NEXT_PUBLIC_SUPABASE_ANON_KEY(208), UPSTASH_REDIS_REST_URL(41), UPSTASH_REDIS_REST_TOKEN(62), NEXT_PUBLIC_TURNSTILE_SITE_KEY(24), TURNSTILE_SECRET_KEY(35) — tất cả đều có giá trị khác rỗng.
```

**Ghi chú:** KHÔNG xếp KHONG_REACHABLE: tuy cây mission-control chưa có electron/release (gitignore dòng 50 '/electron/release/', dòng 34 '.env*'), cấu hình build hiện tại vẫn sẽ tái tạo đúng lỗ đó ở lần `npm run build:desktop` kế tiếp, và installer đã dựng vẫn nằm trên đĩa ở worktree cranky-austin. KHÔNG in bất kỳ giá trị secret nào. Hai việc cần làm vẫn còn nguyên: (1) thêm loại trừ .env ở extraResources filter + assertion build-time; (2) xoay vòng toàn bộ 14 key trên (chúng đã tồn tại plaintext trong một artifact phân phối được).

---

### HT-030

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/invoice-actions.ts — cùng bộ vá với HT-024 nhưng phủ luôn nhánh clamp mà HT-030 mô tả. Kịch bản gốc: (1) clientDepositDeducted lớn hơn available nên bị clamp, depositBalance chỉ bị trừ phần thực; (2) void refund theo invoice.depositDeducted (= deposit thực + customPrepaid) → chênh lệch là credit khống. CHẶN TẠI: dòng 465 `const deduct = Math.max(0, Math.min(data.clientDepositDeducted, available))` — số SAU clamp; dòng 467-472 trừ đúng `deduct`; dòng 476-479 `await tx.invoice.update({ where:{id:invoice.id}, data:{ clientDepositDeducted: deduct } })` ghi CHÍNH số đã rời khỏi depositBalance (nằm trong cùng $transaction dòng 392 nên trừ-và-ghi là nguyên tử); rồi dòng 645 refund `fresh.clientDepositDeducted`. Do đó refund == đúng số đã clamp-và-trừ, không bao giờ gồm customPrepaid (customPrepaid vẫn nằm ở invoice.depositDeducted dòng 410, chỉ để hiển thị/PDF, không tham gia refund nữa). Bước (3) của kịch bản (số dư phồng khấu trừ hoá đơn sau) mất nguồn nạp.
```

**Ghi chú:** Vá bởi commit d252250; cùng cặp dòng với HT-024 nhưng đây là nhánh clamp. Số dòng lệch (594 → 640-652). Cách vá đúng như 'Đề xuất sửa' của finding (thêm cột clientDepositDeducted + refund theo cột đó). Residual giống HT-024: hoá đơn cũ clientDepositDeducted = NULL rơi vào fallback dòng 645 và vẫn refund sai; migration/backfill dữ liệu lịch sử CHƯA làm.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được, và tôi đã kiểm cả những thứ agent kia bỏ qua. Đường ghi: src/actions/invoice-actions.ts:411 đặt clientDepositDeducted:0 NGAY trong invoice.create (nên mọi hoá đơn MỚI không bao giờ NULL); :465 deduct = Math.max(0, Math.min(data.clientDepositDeducted, available)); :467-472 decrement đúng deduct; :476-479 tx.invoice.update ghi CHÍNH số deduct — cả ba nằm trong cùng $transaction mở ở :392 nên trừ-và-ghi là nguyên tử. Đường hoàn: :645 refundAmount = fresh.clientDepositDeducted ?? fresh.depositDeducted, đọc lại DƯỚI pg_advisory_xact_lock (:615) và sau re-check status (:622), rồi increment ở :647-652 — customPrepaid (nằm trong depositDeducted, ghi ở :410) không còn tham gia hoàn tiền. Kiểm bổ sung để loại đường vòng: grep depositBalance toàn src/ + mcp-server/src → CHỈ có 2 chỗ ghi (invoice-actions.ts:470 decrement, :650 increment), không có action/API/MCP nào khác nạp số dư cọc; grep invoice.create/invoice.update → chỉ 394/476/625 (+ payment-actions.ts:89 chỉ set status='PAID', admin-profile-actions.ts:82 chỉ null profileId) nên không có đường nào cho phép set clientDepositDeducted tuỳ ý rồi void để rút. prisma/schema.prisma:765 xác nhận cột clientDepositDeducted Decimal? có thật.
```

**Rủi ro còn lại:** Dữ liệu lịch sử CHƯA xử lý: schema để cột nullable và :645 cố ý fallback về depositDeducted, nên mọi hoá đơn tạo TRƯỚC commit d252250 (clientDepositDeducted = NULL) khi void vẫn hoàn cả phần customPrepaid = vẫn nạp credit khống đúng như finding mô tả. Chưa có migration/backfill. Không tự vũ trang lại được (hoá đơn mới luôn có giá trị), nhưng số hoá đơn cũ trên production là kho đạn sẵn có cho finance user.

---

### HT-031

**Mức:** High · **Kết luận:** CHƯA VÁ _(agent xác minh chấm ĐÃ VÁ, phản biện lật lại)_

**Bằng chứng từ agent xác minh:**

```
Vá cả NƠI GHI lẫn NƠI RENDER (commit bfb58d5). GHI — src/actions/update-task-details.ts:13-20 `sanitizeExternalUrl`: `if (/^https?:\/\//i.test(s)) return s; if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return '' // non-http scheme (javascript:, data:, …) → drop`. Nó chặn ĐÚNG bước 1 của kịch bản (editor role USER + assignee gọi updateTaskDetails với `javascript:fetch(...)`) tại dòng 78: `if (data.productLink !== undefined) updateData.productLink = sanitizeExternalUrl(data.productLink)` trong nhánh non-admin — chuỗi javascript: bị biến thành '' trước khi chạm Prisma; nhánh admin cũng bọc ở dòng 65. RENDER — src/components/portal/calm/DeliverableDetailPanel.tsx:16-19 `safeHref` trả '#' cho mọi scheme phi-http, được dùng ở CẢ HAI sink finding nêu: dòng 105 `<a href={safeHref(d.reviewUrl || d.productLink)}>` và dòng 166 `<a href={safeHref(d.productLink)}> Download files`. Portal 'The Desk' (cây mới) cũng đã có: src/components/portal/desk/DeliverableSheet.tsx:21-24 safeHref, dùng ở dòng 125, 154, 225. Không còn đường ghi nào cho editor: các write productLink khác đều admin-gated (bulk-task-actions.ts:148/265, admin-actions.ts:228).
```

**Ghi chú:** CÒN TỒN DƯ, không làm kịch bản gốc sống lại nhưng cần đưa vào backlog: (1) NGUỒN chưa lọc — src/actions/admin-actions.ts:121 + 228 vẫn `productLink: productLink || null` thô từ formData, không qua sanitizeExternalUrl (finding có nêu đích danh admin-actions.ts:228 trong phần Đề xuất sửa); bulk-task-actions.ts:148/265 cũng thô. (2) SINK chưa lọc — src/components/mobile/TaskDrawer.tsx:210-214 vẫn `<a href={task.productLink} target="_blank">` thô, đúng chỗ finding cảnh báo. Ghép lại: một ADMIN vẫn lưu được `javascript:` qua form tạo/sửa task, và nó sẽ chạy khi staff bấm trong TaskDrawer (XSS app nội bộ). Đây KHÔNG phải leo thang editor→khách như finding mô tả (portal đã kín 2 lớp), mà là admin→staff, mức độ thấp hơn hẳn; nhưng 2 dòng đó nên được vá nốt để đóng hẳn HT-031.

**Vòng phản biện** — phán quyết: **BÁC BỎ** (lỗ hổng vẫn còn)

```
BÁC BỎ. Lỗ hổng stored-XSS qua productLink VẪN CÒN, và agent kia sai về mặt sự kiện khi khẳng định 'chỉ ADMIN mới còn lưu được javascript:'. ĐƯỜNG GHI THỨ HAI, chưa lọc, do CHÍNH EDITOR trong finding gọi được: src/actions/task-management-actions.ts (dòng 1 là 'use server' → server action = POST endpoint công khai). Hàm updateTask(id, data, workspaceId): nhánh non-admin (:57-91) kiểm sở hữu ở :59 (task.assigneeId !== user.id → Forbidden — tức ĐÚNG editor được giao task là qua), rồi delete hàng loạt trường tiền/tenancy/status/deadline/assignee nhưng KHÔNG hề delete productLink và KHÔNG gọi sanitizeExternalUrl; :107 workspacePrisma.task.update({ where:{id}, data }) ghi nguyên văn. Bản vá bfb58d5 chỉ bọc src/actions/update-task-details.ts (:65, :78) — một đường vào trong hai. ĐƯỜNG RENDER vẫn thô ở app nhân viên, đúng chỗ finding cảnh báo và thêm một chỗ finding chưa biết: src/components/mobile/TaskDrawer.tsx:212 href={task.productLink} (sống, được import ở src/components/mobile/MobileTaskView.tsx:17) và src/components/mission-control/McTaskDrawer.tsx:266 href={detail.productLink} (dữ liệu thô từ src/lib/mc-task-drawer-data.ts:116, render bởi src/app/[workspaceId]/mc/task/[taskId]/page.tsx và McKanban). Đường khai thác còn sót, chạy được nguyên vẹn: editor (role USER, assignee) POST updateTask(taskId, { productLink: "javascript:..." }, wsId) → lưu thô → admin/nhân sự mở task drawer và bấm link → JS chạy trong origin app nội bộ với cookie phiên của ADMIN → gọi được server action admin-only nhân danh họ. Đây là leo thang USER→ADMIN, nặng hơn chiều editor→khách mà finding mô tả. Phần ĐÃ đóng thật (tôi xác nhận): chân cổng portal khách — safeHref ở src/components/portal/calm/DeliverableDetailPanel.tsx:16-19 dùng tại :105/:166 và src/components/portal/desk/DeliverableSheet.tsx:21-26 dùng tại :125/:154/:225; regex /^[a-z][a-z0-9+.\-]*:/i bắt javascript:/data:/vbscript: và trả '#'.
```

**Rủi ro còn lại:** Ngoài 2 đường trên còn 3 nguồn ghi thô nữa: src/actions/admin-actions.ts:121+228 (productLink: productLink || null lấy trực tiếp từ formData — chính dòng finding nêu đích danh trong Đề xuất sửa) và src/actions/bulk-task-actions.ts:148 + :265. Để đóng hẳn HT-031 cần: (a) sanitizeExternalUrl ở cả 5 nguồn ghi (update-task-details đã có 2), (b) safeHref ở TaskDrawer.tsx:212 và McTaskDrawer.tsx:266, (c) backfill quét Task.productLink hiện có trong DB vì payload có thể đã nằm sẵn ở đó.

---

### HT-032

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/payroll-actions.ts:43-62 (confirmPayment). Kịch bản gốc: sau khi kỳ đã khoá+PAID, admin POST confirmPayment({userId: nạn nhân, totalAmount: 999999999, ...}) → upsert ghi đè số lương đã khoá. CHẶN TẠI: dòng 47-50 `const cycleLock = await workspacePrisma.payrollLock.findUnique({ where:{ month_year_workspaceId:{ month, year, workspaceId } }, select:{ isLocked:true } })` và dòng 51-53 `if (cycleLock?.isLocked) return { error: 'Kỳ lương ... đã bị KHÓA ...', code: 'PAYROLL_LOCKED' }` — nằm TRƯỚC `workspacePrisma.payroll.upsert` ở dòng 64, đối xứng với revertPayment (dòng 186-191). Biến thể 'đặt totalAmount âm/không khớp' bị chặn tại dòng 57-59 (`base<0||bonusAmt<0||total<0` → error) và dòng 60-62 (`Math.abs(total-(base+bonusAmt))>1` → error). Không lách được bằng cách gửi month/year khác: dòng 40-41 resolve cycle server-side `extractPayrollCycle(ws?.name)`, bỏ hoàn toàn data.month/data.year của client.
```

**Ghi chú:** Vá bởi commit d252250. Số dòng lệch (43 → 43-62). Còn 2 dư lượng ngoài kịch bản chính: (1) gợi ý 'chặn ghi đè khi record đã PAID' CHƯA làm — kỳ CHƯA khoá vẫn cho update record status=PAID; (2) lock-check (dòng 47) và upsert (dòng 64) không nằm chung transaction/advisory lock nên vẫn có khe TOCTOU rất hẹp với calculateMonthlyBonus đang khoá đồng thời. Số tiền vẫn do client cung cấp, chỉ được kiểm tính nhất quán chứ không tính lại server-side.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc src/actions/payroll-actions.ts: guard nằm ĐÚNG CHỖ và ĐÚNG THỨ TỰ — :47-50 đọc payrollLock, :51-53 return sớm khi isLocked, còn payroll.upsert ở :64. Điểm mấu chốt mà agent kia không chứng minh nhưng tôi đã kiểm: khóa có thể bị 'lệch key' làm guard vô dụng không? KHÔNG — confirmPayment resolve cycle server-side tại :40-41 bằng extractPayrollCycle(ws.name), bỏ hoàn toàn data.month/data.year của client, và đây CHÍNH LÀ key mà bên ghi khóa dùng: bonus-actions.ts:139 (`extractPayrollCycle(workspace.name)`) → :400-401 `tx.payrollLock.upsert({where:{month_year_workspaceId:{month:currentMonth,year:currentYear,workspaceId}}})`. Cùng cặp (month,year,workspaceId) ⇒ findUnique ở :47-48 không thể trượt khóa. Biến thể số tiền bị chặn tại :57-59 (âm) và :60-62 (|total-(base+bonus)|>1). Đường ghi khác: grep `payroll.(upsert|update|create|delete)` toàn repo chỉ còn payroll-actions.ts:64 và :204 (revertPayment, đã có guard :186-191); phần còn lại là script migrate + restore_final.js ở root (không phải endpoint). update-task-details.ts:89-102 chỉ ĐỌC Payroll để chặn sửa tài chính khi PAID, không ghi. Kịch bản 'sau khi kỳ đã khóa, POST confirmPayment ghi đè 999999999' không còn chạy được.
```

**Rủi ro còn lại:** (1) Gợi ý 'chặn ghi đè khi record đã PAID' CHƯA làm: kỳ chưa khóa vẫn cho update một record status=PAID (nhánh update :73-79 ghi đè baseSalary/bonus/totalAmount). (2) Đọc khóa (:47) và upsert (:64) KHÔNG cùng transaction/advisory lock → còn khe TOCTOU hẹp với calculateMonthlyBonus (bản thân nó là HT-009, ghi bonus ngoài transaction). (3) Số tiền vẫn 100% do client cung cấp, chỉ được kiểm tính nhất quán chứ không tính lại server-side.

---

### HT-033

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Kịch bản ban-evasion trong finding (X bị LOCKED → createProfileForUser → createWorkspaceAction) VẪN CHẠY. (1) src/actions/profile-actions.ts:232-266 createProfileForUser: auth duy nhất là `const session = await getSession()` (:233) + `if (!session?.user?.id)` (:234), sau đó chỉ có rate-limit 5 profile (:244-252) rồi `tx.profile.create` (:256) và `tx.profileAccess.create({ data: { userId: session.user.id, profileId: profile.id, role: 'OWNER' } })` (:262-264) — KHÔNG có isSessionLive; grep isSessionLive trong file chỉ khớp :326/329, :389/392, :433/436 (3 action khác), không có ở 232. (2) src/actions/workspace-actions.ts:12-29 createWorkspaceAction: `getSession()` (:13) rồi `canCreateWorkspace(session.user.id, profileId)` (:27); hàm này tại src/lib/profile-permissions.ts:71-74 chỉ gọi getProfileRole → `prisma.profileAccess.findUnique(... select:{role:true})` (:26-29), KHÔNG đọc User.role hay User.sessionVersion → ProfileAccess OWNER vừa tự cấp ở bước 1 là đủ. (3) Không có lớp chặn thượng nguồn: getSession (src/lib/auth.ts:65-74) chỉ `decrypt(session)` không chạm DB; src/middleware.ts:142-144 ghi rõ việc thu hồi phiên KHÔNG enforce ở middleware mà đẩy xuống DAL — nhưng DAL ở 2 action trên trống gate. Các instance getSession()-only khác cũng vẫn trống (grep isSessionLive|LOCKED|sessionVersion): notification-actions.ts 0 hit, push-actions.ts 0 hit, tracking-actions.ts 0 hit (pingHeartbeat :91-99 chỉ getSession), contact-actions.ts chỉ lọc LOCKED cho ĐỐI TƯỢNG tìm kiếm (:31) chứ không kiểm caller, username-actions.ts:73-78 completeUsernameMigration, user-actions.ts:11-13 changePassword, profile-actions.ts:183-210 updateProfile và :508-513 changePassword.
```

**Ghi chú:** ĐÃ VÁ MỘT PHẦN — ghi nhận để không vá trùng: src/lib/auth-guard.ts:36-47 nay có gate liveness trung tâm trong getCurrentUser (`if (user.role === 'LOCKED') throw` :40-42 và so sánh tokenVersion < dbVersion :43-47, comment ghi '[AUDIT HT-033 fix]'), nên nhóm '[getCurrentUser()-only]' của bảng instance đã đóng: #12 schedule-actions (còn thêm verifyWorkspaceAccess :18/:236) và #13 email-migration-actions. Phần còn lại là toàn bộ nhóm '[getSession()-only]' #1-#10, trong đó #1 createProfileForUser + #4 createWorkspaceAction là cặp ban-evasion đúng mục 'Ưu tiên' mà finding chỉ định. #11 admin-profile-actions thuộc finding riêng, không kiểm ở đây.

---

### HT-034

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/actions/tracking-actions.ts:157-164 thêm helper callerIsClient và gọi ở đầu cả 4 hàm (getSessionTrends:173, getRecentEventLogs:224, getFrictionData:267, getLivePresence:318), mỗi chỗ đều `if (await callerIsClient((authSession?.user as any)?.id, profileId)) return [];`
```
async function callerIsClient(userId, profileId) {
    if (!userId) return true
    const [user, pa] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
        prisma.profileAccess.findUnique({ where: { userId_profileId: { userId, profileId } }, select: { role: true } }),
    ])
    return user?.role === 'CLIENT' || pa?.role === 'CLIENT'
}
```
Chặn bước 4 của kịch bản: attacker vẫn làm được bước 2 (POST /api/profile/select set sessionProfileId) và bước 3 (dispatch Next-Action), nhưng vì sessionProfileId chính là profile mà họ có ProfileAccess.role='CLIENT', truy vấn dòng 161 trả pa.role==='CLIENT' → dòng 163 true → hàm return [] TRƯỚC mọi truy vấn presence/event (getLivePresence thoát ở dòng 318, trước prisma.userPresence.findMany dòng 322). Nhánh legacy User.role='CLIENT' cũng bị bắt bởi cùng dòng 163.
```

**Ghi chú:** Vá bởi commit d252250. Cách vá là deny-list CLIENT chứ không phải allow-list như 'Đề xuất sửa' (verifyWorkspaceAccess(workspaceId,'MEMBER') + đổi chữ ký nhận workspaceId) — nên chữ ký 4 hàm và 4 Client Component không đổi. Dư: (a) vẫn tin sessionProfileId trần, không xác nhận caller là thành viên nội bộ THẬT; (b) một User role='USER' bình thường (staff không phải admin) vẫn đọc được presence/nhật ký toàn profile — nằm ngoài phạm vi HT-034 (finding chỉ nói về bất biến CLIENT-never-internal); (c) mỗi lần gọi tốn thêm 2 query DB.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được. src/actions/tracking-actions.ts:157-164 callerIsClient đọc role TỪ DB (prisma.user.findUnique + prisma.profileAccess.findUnique theo userId_profileId), KHÔNG tin claim role trong JWT — điểm này quan trọng vì bước 2 kịch bản re-sign JWT giữ nguyên role. Gọi ở đầu cả 4 hàm: :173 getSessionTrends, :224 getRecentEventLogs, :267 getFrictionData, :318 getLivePresence, mỗi chỗ 'if (await callerIsClient(...)) return []' đặt TRƯỚC truy vấn dữ liệu (getLivePresence thoát ở :318, prisma.userPresence.findMany mãi :322) → chặn đúng bước 4. Vì sessionProfileId ở bước 2 buộc phải là profile mà attacker có ProfileAccess (src/app/api/profile/select/route.ts:47-59 trả 403 nếu không có row), truy vấn ở :161 luôn tìm thấy đúng row role='CLIENT' → :163 true. Cả hai hình thái CLIENT trong finding (User.role='CLIENT' legacy và ProfileAccess.role='CLIENT') đều bị bắt bởi cùng dòng :163. Tự kiểm bề mặt anh em (đề phòng vá một cửa): các hàm analytics còn lại ở src/actions/analytics-actions.ts:9/99/147/203/263 đều đã gác bằng verifyWorkspaceAccess; 3 export còn lại của tracking-actions (forceFlush/trackEvent/pingHeartbeat) là ghi/tự-scope, không phải kênh đọc.
```

**Rủi ro còn lại:** (1) Deny-list chứ không allow-list, và nó phụ thuộc vào việc mọi CLIENT đều CÓ row ProfileAccess role='CLIENT'. Tôi grep toàn repo: KHÔNG tồn tại đường code nào tạo ProfileAccess role='CLIENT' (chỉ có bộ lọc member-actions.ts:167) — tài khoản CLIENT là dữ liệu legacy/thủ công. Nếu có tài khoản khách 'mồ côi' kiểu User.role='USER' + User.profileId = profile agency mà KHÔNG có row PA, nó vẫn qua /api/profile/select nhờ nhánh own-profile (route.ts:43-45) và callerIsClient trả false → vẫn rò. (2) Vẫn tin sessionProfileId trần, không xác nhận caller là thành viên nội bộ thật như 'Đề xuất sửa' yêu cầu (verifyWorkspaceAccess(workspaceId,'MEMBER')). (3) Nhân viên role USER thường (không admin) vẫn đọc được presence/nhật ký toàn profile — ngoài phạm vi HT-034 nhưng là lỗ phân quyền còn mở. (4) Thêm 2 query DB mỗi lần gọi (4 component polling).

---

### HT-035

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
Chỉ MỘT template (taskDelivered) được escape; các vector khác mà finding nêu đích danh vẫn nội suy thô.
Đã vá: src/lib/email-templates.ts:11-14 `safeEmailUrl` (`/^https?:\/\//i.test(s) ? escapeHtml(s) : ''`) + dòng 121-124 `escapeHtml(userName/taskTitle/clientName)` + dòng 134-136 chỉ emit `<a href="${safeLink}">` khi safeLink không rỗng → bước 'productLink = http://ok">…' của kịch bản bị chặn.
CHƯA vá — vẫn khớp mô tả lỗ hổng, cùng file src/lib/email-templates.ts:
• taskAssigned dòng 65 `<p><strong>Nhiệm vụ:</strong> ${taskTitle}</p>` và dòng 75 `wrapTemplate(content, `[New Task] … ${taskTitle}`)` → tiêu đề chảy thẳng vào `<h1 …>${title}</h1>` tại dòng 33. Có caller thật: src/actions/admin-actions.ts:312.
• taskFeedback dòng 205 `<p style="font-style: italic;">"${feedback}"</p>` và dòng 214 chèn ${taskTitle} vào subject/h1 — feedback do admin nhập, KHÔNG escape. Caller: src/actions/task-actions.ts:296 và :309.
• taskStatusBulkDigest dòng 161-165 `${item.title}`, `${item.clientName}`, `${item.oldStatus}`, `${newStatus}` thô trong <td>. Caller: src/actions/bulk-task-actions.ts:628.
• notificationRealtime dòng 291-292 `${notification.title}` / `${notification.body}` thô, và dòng 304 `wrapTemplate(content, notification.title)`.
• taskStarted dòng 93-99 và taskCompleted dòng 224/235 cũng thô (ngoài danh sách finding).
escapeHtml có sẵn tại src/lib/notification-emails/shared/format.ts:122-130 nhưng chỉ được taskDelivered dùng.
```

**Ghi chú:** Vá một phần. Bước khai thác chính xác trong finding (editor set productLink → email taskDelivered) ĐÃ bị chặn bởi safeEmailUrl + escapeHtml. Nhưng chính finding liệt kê Vị trí gồm taskAssigned (50-64), taskStatusBulkDigest (140-155), taskFeedback (187), notificationRealtime (273-274) và nêu 'Tương tự tiêu đề task hoặc feedback có thể chèn link giả' — các đường này vẫn chèn được <a href="https://phishing"> vào email có định danh HustlyTasker, nên xếp CHUA_VA. Số dòng lệch: taskDelivered nay 116 (finding ghi 104-118), taskFeedback 197-215, notificationRealtime 262-305. wrapTemplate (dòng 18-50) cũng không escape tham số title.

---

### HT-036

**Mức:** High · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
Guard mới: mcp-server/src/services/guards.ts:15-24 `export async function assertWorkspaceMember(wsId, userId) { const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: wsId, userId }, select: { id: true } }); if (!member) throw new Error(`User ${userId} is not a member of workspace ${wsId}`) }`. Chặn từng bước của kịch bản: (1) assign_task{workspaceId:'A', assigneeId:<user của tenant khác>} → mcp-server/src/services/assign-service.ts:30 `await assertWorkspaceMember(wsId, assigneeId)` chạy TRƯỚC task.update ở dòng 51 → throw, không ghi assigneeId. (2) bulk_assign_tasks → assign-service.ts:145 `await assertWorkspaceMember(wsId, assigneeId)` chạy trước prisma.$transaction ở dòng 157 (kiểm 1 lần trước vòng lặp đúng như khuyến nghị). (3) claim_task → mcp-server/src/services/marketplace-service.ts:103 `await assertWorkspaceMember(wsId, userId)` trước $transaction dòng 106 và updateMany dòng 136. Hai đường ghi assignee còn lại cũng được bịt: task-service.ts:68 (createTask, trước task.create dòng 98) và task-service.ts:269 (updateTaskDetails — cũng là đường của tool bulk_update_details, tools/bulk-ops.ts:41 gọi updateTaskDetails). Không có tool nào ghi thẳng prisma (grep 'prisma\.' trong mcp-server/src/tools/ = 0 kết quả).
```

**Ghi chú:** Vá bởi commit 09e67a4 'security(audit): MCP cross-tenant guards + web Medium cluster' (file guards.ts hoàn toàn mới, chỉ có 1 commit trong lịch sử). Comment trong code ghi rõ '[AUDIT HT-036 fix]'. Số dòng lệch so với finding (assignTask nay ở 16-68, bulkAssignTasks 133-208). Lưu ý phụ: assertWorkspaceMember dùng prisma thô, không lọc theo role — user CLIENT-role có WorkspaceMember vẫn qua được; đây là siết chặt hơn trước nhưng lỏng hơn velox-helpers-actions.ts (role:'MEMBER').

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc mcp-server/src/services/guards.ts:15-24 (assertWorkspaceMember → prisma.workspaceMember.findFirst, throw nếu không có) và kiểm TỪNG điểm ghi assigneeId có đứng TRƯỚC lệnh ghi không: assign-service.ts:30 (trước task.update :51), assign-service.ts:145 (trước prisma.$transaction :157 → tx.task.update :189, kiểm 1 lần trước vòng lặp đúng khuyến nghị), marketplace-service.ts:103 (trước $transaction :106 và updateMany :136). Điểm mạnh mà tôi tự kiểm chứ không tin agent kia: grep 'assigneeId' toàn mcp-server/src để LIỆT KÊ ĐỦ đường ghi — ngoài 3 tool trong finding còn task-service.ts:68 (createTask, trước task.create :98) và task-service.ts:269 (updateTaskDetails, trước task.update :275); cả 5 đều đã gác. tools/ không chạm prisma trực tiếp (grep 'prisma\.' trong mcp-server/src/tools = 0 kết quả) và bulk_update_details (tools/bulk-ops.ts:40) đi qua updateTaskDetails nên thừa hưởng guard :269. Không có thư mục dist/ trong mcp-server (chỉ src/), nên không có artifact biên dịch cũ chạy vòng qua guard. Kịch bản assign_task{workspaceId:'A', assigneeId:<user tenant khác>} nay throw trước khi ghi.
```

**Rủi ro còn lại:** (1) assertWorkspaceMember dùng prisma thô, KHÔNG lọc role — mọi WorkspaceMember (kể cả hàng role CLIENT/ADMIN) đều qua, lỏng hơn chuẩn của web app velox-helpers-actions.ts:192 (`role:'MEMBER'`); vẫn gán được task cho người không phải editor trong cùng workspace. (2) Guard là truy vấn RIÊNG đặt ngoài transaction (assign-service.ts:30 vs update :51; marketplace-service.ts:103 vs $transaction :106) → về lý thuyết còn khe TOCTOU nếu membership bị thu hồi giữa hai bước (không đáng kể). (3) Mô tả tool task-assign.ts:15 ('The assignee must be a member of the workspace') nay mới đúng sự thật.

---

### HT-037

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
electron/main/ipc-handlers.ts:18-20 `ipcMain.handle('env:get-all', () => { return getAllEnvVars() })` — không kiểm event.sender/origin, không lọc key. electron/main/env-manager.ts:85-87 `export function getAllEnvVars(): EnvSchema { return { ...store.store } }` trả NGUYÊN object, schema (env-manager.ts:11-20) gồm DATABASE_URL, JWT_SECRET, CRON_SECRET, RESEND_API_KEY, UPSTASH_REDIS_REST_TOKEN, MCP_*. electron/main/preload.ts:19-20 `getEnvVars: (): Promise<Record<string,string>> => ipcRenderer.invoke('env:get-all')` expose vô điều kiện vào window.hustly (dòng 9 contextBridge.exposeInMainWorld('hustly', {...})), 'env:get-all' cũng nằm trong allowedChannels preload.ts:60. Renderer đúng là web app: electron/main/window-manager.ts:24 `preload: path.join(__dirname,'preload.js')` + dòng 35 `mainWindow.loadURL(\`http://localhost:${port}\`)` — cùng preload cho cửa sổ Next.js chính. Không có preload riêng cho wizard (setup-wizard.ts:31 dùng chính preload.js).
```

**Ghi chú:** Không có commit nào chạm electron/main/ipc-handlers.ts sau cc03b6b. Kịch bản `await window.hustly.getEnvVars()` từ bất kỳ script nào trong renderer vẫn chạy nguyên vẹn. Số dòng khớp đúng finding (18).

---

### HT-038

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
electron/main/ipc-handlers.ts:22-24 nguyên văn `ipcMain.handle('env:set', (_event, key: string, value: string) => { setEnvVar(key as any, value) })` — vẫn `key as any`, không allowlist key, không validate value, không kiểm sender. electron/main/env-manager.ts:92-97 `export function setEnvVar<K extends keyof EnvSchema>(key: K, value: EnvSchema[K]): void { store.set(key, value) }` ghi thẳng electron-store. electron/main/preload.ts:22-23 `setEnvVar: (key: string, value: string): Promise<void> => ipcRenderer.invoke('env:set', key, value)` vẫn expose cho renderer web app, và 'env:set' nằm trong allowedChannels preload.ts:61. Bước 'ghi đè bền vững' vẫn thông: giá trị lưu ở store rồi được bơm lại vào process.env qua getStoredEnvVars() (env-manager.ts:69-80) ở lần khởi động Next server kế tiếp.
```

**Ghi chú:** Cùng tình trạng HT-037 — file chưa từng được sửa sau cc03b6b. Số dòng khớp đúng finding (22). window.hustly.setEnvVar('DATABASE_URL', ...) / ('JWT_SECRET', ...) vẫn thực hiện được từ renderer.

---

### HT-039

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
electron/main/setup-wizard.ts:93-99 nguyên văn: `const client = new Client({ connectionString, connectionTimeoutMillis: 8000, ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined })`. Đúng nghịch lý mà finding mô tả: chuỗi có sslmode=require lại bị hạ xuống chấp nhận mọi cert. Handler vẫn sống và vẫn tới được từ wizard: setup-wizard.ts:56-61 `const onTestDb = async (_event, connectionString) => testDatabaseConnection(connectionString)` + `ipcMain.handle('wizard:test-db', onTestDb)`; kênh 'wizard:test-db' còn nằm trong allowedChannels của preload.ts:65. testDatabaseConnection gọi client.connect() (dòng 102) → gửi user/password Postgres qua TLS không xác thực CA/hostname.
```

**Ghi chú:** File electron/main/setup-wizard.ts chỉ có 1 commit trong lịch sử (cc03b6b), không có commit vá nào sau kiểm toán. Số dòng khớp gần đúng finding (96 → nay 96-98).

---

### HT-040

**Mức:** Medium · **Kết luận:** CHƯA VÁ

**Bằng chứng từ agent xác minh:**

```
mcp-server/src/services/status-service.ts:97-116: `const updated = await wsPrisma.task.update({ where:{id:taskId}, data:updateData, select:{...} })` rồi `return {...}` — KHÔNG có prisma.auditLog.create, không $transaction bọc audit. Grep toàn bộ mcp-server/src cho 'auditLog|audit(' chỉ ra ĐÚNG 1 kết quả duy nhất, và nó là đường ĐỌC: status-service.ts:130 `const logs = await prisma.auditLog.findMany({ where: { workspaceId: wsId, targetType:'Task', targetId: taskId, action: { startsWith: 'task.' } } })`. Vì không đường ghi nào tạo action 'task.*' từ MCP nên getStatusHistory (dòng 123-157) vẫn trả []. Các mutation khác cũng không ghi audit: assign-service.ts:51 (assignTask update), :109 (unassignTask), :189 (bulkAssignTasks update trong tx), task-service.ts:204 `await wsPrisma.task.delete(...)` (deleteTask), marketplace-service.ts:136 (claimTask updateMany), :200 (returnTask).
```

**Ghi chú:** Commit 09e67a4 chỉ thêm guards authz (HT-036/041), không đụng gì tới audit. Kịch bản nguyên vẹn: update_task_status{newStatus:'Hoàn tất'} → task đổi status (tạo nghĩa vụ lương) → get_status_history trả [] và /admin/audit-log không thấy. Đường 'Đã hủy' còn tự set isArchived (status-service.ts:89-91) — cũng không để lại dấu vết.

---

### HT-041

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
mcp-server/src/services/task-service.ts:63-65: `// [AUDIT HT-041 fix] ... await assertClientInProfile(data.clientId)` — nằm TRƯỚC khi build createData (dòng 71, gán clientId dòng 73) và trước `wsPrisma.task.create({ data, include: { client: {select:{id,name}} } })` ở dòng 98-104. Thân guard: mcp-server/src/services/guards.ts:27-38 `const client = await prisma.client.findUnique({ where: { id: clientId }, select: { profileId: true, status: true } }); if (!client || client.profileId !== ctx.profileId) throw new Error(`Client ${clientId} does not belong to this profile`)` + chặn status SOFT_DELETED/MERGED. Bước bị chặn: 'liệt kê tuần tự clientId để moi tên khách xuyên tenant' — findUnique chỉ select profileId/status (KHÔNG select name), và throw xảy ra trước task.create nên response include client{name} không bao giờ được tạo. Ranh giới tenant của Client đúng là profile, không phải workspace: prisma/schema.prisma:511-518 ghi rõ 'Clients are now identified per-PROFILE (one canonical id, visible in every workspace of the profile). Do NOT write workspaceId on new clients'.
```

**Ghi chú:** Vá bởi commit 09e67a4. Khác đề xuất gốc: audit đề nghị wsPrisma.client.findFirstOrThrow (scope theo workspaceId), code chọn scope theo profileId — hợp với mô hình canonical-client hiện tại, và vẫn chặn đúng lỗ xuyên-tenant. Dư địa còn lại (không phải lỗ của finding này): client cùng profile nhưng workspace khác vẫn gán được (đúng thiết kế), và Client cũ có profileId = null sẽ bị throw → có thể là regression chức năng với dữ liệu legacy. updateTaskDetails không nhận clientId nên không có đường vòng.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự đọc mcp-server/src/services/task-service.ts:52-107 và mcp-server/src/services/guards.ts. Bước 'liệt kê tuần tự clientId để moi tên khách xuyên tenant' bị chặn tại :65 `await assertClientInProfile(data.clientId)` — nằm TRƯỚC khi dựng createData (:71, gán clientId :73) và trước `wsPrisma.task.create({ data, include: { client: { select: { id: true, name: true } } } })` (:98-104). Thân guard guards.ts:27-38: `findUnique({ where: { id: clientId }, select: { profileId: true, status: true } })` — CHỈ select profileId/status, KHÔNG select name — rồi `if (!client || client.profileId !== ctx.profileId) throw`; thêm chặn status SOFT_DELETED/MERGED (:36-38). Vì throw xảy ra trước task.create nên response chứa client.name không bao giờ được sinh ra → đường rò tên khách đóng. Ranh giới tenant đúng là profile chứ không phải workspace (prisma/schema.prisma:511-518 ghi Client là canonical per-PROFILE), và ctx.profileId được neo chắc: validateWorkspaceAccess (mcp-server/src/auth-context.ts:40-64) từ chối wsId có `ws.profileId !== ctx.profileId` (:53-55) nên không thể lấy một workspace ngoài profile làm bàn đạp. Tôi grep toàn bộ mcp-server/src cho 'clientId': chỉ có createTask (đường ghi duy nhất nhận clientId, đã có guard), ListTasksFilters.clientId (:157-158, đường ĐỌC và where đã bị wsPrisma scope theo workspaceId nên clientId lạ chỉ trả rỗng), và các trường serialize (:309, query-service.ts:154). updateTaskDetails/bulk_update_details KHÔNG nhận clientId → không có đường vòng.
```

**Rủi ro còn lại:** 1) Client hợp lệ CÙNG profile nhưng khác workspace vẫn gán được — đúng thiết kế canonical-client, không phải lỗ. 2) Dữ liệu legacy có Client.profileId = null sẽ luôn throw ở guards.ts:33 → regression chức năng tiềm tàng khi tạo task cho khách cũ. 3) Thông điệp lỗi phân biệt 'does not belong to this profile' với 'is not active' → oracle nhỏ về sự tồn tại/trạng thái của clientId, nhưng KHÔNG lộ tên khách (đúng thứ finding lo).

---

### HT-042

**Mức:** Medium · **Kết luận:** ĐÃ VÁ

**Bằng chứng từ agent xác minh:**

```
src/lib/review/download-zip.ts:110-113 (nhánh FOLDER trong collectZipFiles — đúng chỗ finding chỉ là `zipPath: `${prefix}${x.relPath}``):
```
const zipPath = [
    ...(multiRoot ? [sanitizeSegment(f.name)] : []),
    ...x.relPath.split('/').map(sanitizeSegment),
].filter(Boolean).join('/')
entries.push({ r2Key, zipPath })
```
và sanitizeSegment nay diệt cả segment '..' (dòng 27-33):
```
function sanitizeSegment(name: string): string {
    const s = (name || '').replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_').trim()
    if (!s || s === '.' || s === '..') return '_'
    return s
}
```
CHẶN BƯỚC NÀO của kịch bản 4 bước:
- Bước 1 (fileName = `../../../../../../../../etc/cron.d/evil`): relPath được `split('/')` ở dòng 112 → các segment '..' tách rời → dòng 31 đổi mỗi '..' thành '_'. Biến thể Windows `..\..\Startup\evil.lnk`: '\\' nằm trong class ký tự ở dòng 30 nên bị đổi thành '_' trước.
- Bước 2/3 (multi-select → multiRoot=true → prefix=`TenFolder/`): prefix nay là `sanitizeSegment(f.name)` (dòng 111), không còn là chuỗi thô.
- Biến thể 'tạo cây folder `sub/../../`' mà finding nêu: `dir` do getFolderManifest ghép từ tên folder cũng đi qua cùng `split('/').map(sanitizeSegment)` ở dòng 112, nên folder tên '..' → '_'.
KẾT QUẢ: zipPath giao cho `archive.append(body, { name: entry.zipPath })` (src/app/api/review/download-zip/route.ts:67) không thể chứa segment '..' hay '\\' — không còn phụ thuộc vào archiver sanitizePath (thứ chỉ cắt '../' ở ĐẦU chuỗi).
Thứ tự đúng: dedupe(entries) chạy ở dòng 121, SAU khi sanitize — khớp lưu ý 'giữ dedupe() chạy sau khi sanitize'.
```

**Ghi chú:** Vá bởi commit riêng 50d5ea5 'security(audit): HT-042 zip-slip in bulk folder download'. Số dòng lệch nhẹ: nhánh folder nay ở 107-118 (finding ghi 103). Bản vá chọn phương án 'làm sạch ở tầng zip' (bullet 1 của Đề xuất sửa); phương án 'chặn tại nguồn' (validateName từ chối '..'/'\\' ở folders.ts, sanitizeFileName ở upload-service.ts) CHƯA áp — nhưng đó là defense-in-depth, không cần cho việc đóng zip-slip: mọi entry path đều qua sanitizeSegment nên dữ liệu bẩn trong DB không thoát ra được zip. Đã đối chiếu thêm đường zip THỨ HAI ngoài phạm vi finding — src/app/api/share/[token]/download-zip/route.ts — nó cũng an toàn: relPathOf() sanitize từng segment tên folder (dòng 163) và fileName ở dòng 218, với cùng lớp neutralise '.'/'..' ở dòng 60-64.

**Vòng phản biện** — phán quyết: giữ nguyên kết luận an toàn

```
Tự xác minh được. src/lib/review/download-zip.ts:110-113 dựng zipPath bằng cách split('/') rồi map(sanitizeSegment) TỪNG segment, cộng prefix multiRoot cũng đã qua sanitizeSegment(f.name) ở :111 — không còn chuỗi thô như finding mô tả. sanitizeSegment (:27-33) thay [/\\:*?"<>|\x00-\x1f]+ thành '_' RỒI trim RỒI ánh xạ ''/'.'/'..' → '_' (:31); thứ tự replace-trim-check này quan trọng và đúng: ' ..' cũng thành '_'. Chặn từng bước kịch bản: bước 1 fileName '../../../etc/cron.d/evil' → mỗi '..' là một segment riêng sau split → '_'; biến thể Windows '..\\..' → '\\' bị thay trước khi tới check; bước 2/3 multiRoot prefix hết thô; biến thể 'folder tên ..' cũng đi qua cùng map. Đường đi tới archiver: src/app/api/review/download-zip/route.ts:67 archive.append(body, { name: entry.zipPath }) — không còn phụ thuộc sanitizePath của archiver (thứ chỉ cắt '../' ở đầu). Thứ tự đúng: dedupe() ở :121 chạy SAU sanitize và chỉ chèn ' (2)' nên không tái sinh traversal. Tôi tự kiểm ĐƯỜNG ZIP THỨ HAI ngoài phạm vi finding: src/app/api/share/[token]/download-zip/route.ts cũng an toàn — sanitizeSegment y hệt ở :60-64, áp cho tên folder ở :163 (relPathOf) và tên file ở :214/:218 trước khi ghép ở :219, append ở :295.
```

**Rủi ro còn lại:** Chỉ vá ở tầng zip (bullet 1 của Đề xuất sửa); CHẶN TẠI NGUỒN chưa làm: validateName trong src/lib/review/folders.ts vẫn nhận tên folder '..' và tên chứa '\\', upload-service.ts vẫn chỉ kiểm độ dài fileName. Nghĩa là dữ liệu bẩn (fileName '../../x', folder tên '..') vẫn được TẠO và nằm lại trong ReviewVersion.fileName/ReviewFolder.name; hai route zip hiện tại trung hoà được, nhưng bất kỳ consumer mới nào của relPath/fileName (export khác, rsync, script vận hành, tên file gợi ý khi tải lẻ) sẽ mở lại lỗ hổng vì bất biến chỉ tồn tại ở nơi tiêu thụ chứ không ở nơi lưu.

---
