# BACKLOG.md — Low / Info (không chặn GOAL)

> 29 Low + 16 Info từ Lens-1. Nhiều "Info" là XÁC NHẬN ÂM TÍNH (đã soi, an toàn) — giữ lại làm bằng chứng phủ.

## FALSE_POSITIVE đã kiểm (an toàn — tin tốt)
- **EX2 requireReviewAccess({admin:true}) gate global role** — FALSE_POSITIVE: KHÔNG có caller nào truyền {admin:true} trong toàn repo (dead branch). Không khai thác được.
- **EX3 mass-assignment User.role/isTreasurer** — FALSE_POSITIVE: mọi ghi vào user/profile/workspaceMember đều whitelist field tường minh, không spread nguyên body. Code AN TOÀN ở điểm này.

## 🟡 LOW

- **[P1-020] (Low) getWorkspacesForProfile: no membership check on caller-supplied profileId → cross-tenant workspace enumeration (IDOR)** — `src/actions/workspace-actions.ts:134` · OWASP A01:2021 Broken Access Control · reachable=True
  - Vấn đề: Any authenticated user can pass an arbitrary profileId and receive the id/name/description of every ACTIVE workspace in a tenant they have no membership in. This is a cross-tenant object enumeration primitive.
  - Đề xuất: Gate on membership: after the session check, verify the caller has a ProfileAccess role in profileId (e.g. if (!(await getProfileRole(session.user.id, profileId))) return []), matching the pattern used by getProfileMembers.
- **[P1-021] (Low) raw-footage server actions authorize at MEMBER level → any workspace member can overwrite any task's Velox map / hook graph (not just its assignee or an admin)** — `src/actions/raw-footage-actions.ts:132` · OWASP A01:2021 Broken Access Control (missing object-level ownership check) · reachable=True
  - Vấn đề: Any USER-level member of the task's workspace can read and OVERWRITE the raw-footage veloxMap and manualGraph of ANY task in that workspace, including tasks assigned to other editors or unassigned queue tasks they have nothing to do with.
  - Đề xuất: Require admin/owner (verifyProfileAdminAccess) OR that the caller is the task's assignee before mutating TaskRawFootage, mirroring the ownership check updateTaskDetails uses for non-admins.
- **[P1-022] (Low) bulkUpdateTaskDetails lets an admin edit jobPriceUSD/value with no PAID-payroll lock that the single-task path enforces** — `src/actions/bulk-task-actions.ts:267` · OWASP A01:2021 Broken Access Control (inconsistent authorization / control bypass) · reachable=True
  - Vấn đề: An admin can retroactively change wages/prices of tasks whose payroll period is already closed (PAID) by going through the bulk-edit action, bypassing the financial lock that the per-task path guarantees. It also does not recompute profitVND/wageVND consistently (only sets value/jobPriceUSD).
  - Đề xuất: Apply the same payroll-PAID lock (and wageVND/profitVND recompute) in bulkUpdateTaskDetails that updateTaskDetails uses before writing value/jobPriceUSD for any task whose assignee's period is PAID.
- **[P1-023] (Low) getPayrollLockStatus: đọc trạng thái khoá kỳ lương KHÔNG có kiểm quyền** — `src/actions/bonus-actions.ts:38` · OWASP A01:2021 Broken Access Control · reachable=True
  - Vấn đề: Server action là POST endpoint công khai; hàm này lộ boolean isLocked của bất kỳ workspaceId nào cho bất kỳ user đã đăng nhập (thậm chí không cần là thành viên workspace đó).
  - Đề xuất: Thêm verifyWorkspaceAccess(workspaceId, 'ADMIN') (hoặc ít nhất 'MEMBER') ở đầu hàm, catch trả về { isLocked: false } khi SECURITY_VIOLATION.
- **[P1-024] (Low) searchContacts enumerates every user's email across ALL profiles/tenants for any authenticated internal user** — `src/actions/contact-actions.ts:28` · OWASP A01:2021 - Broken Access Control · reachable=True
  - Vấn đề: Any session user (role USER included) can partial-match on '@' or a name fragment and retrieve the email address + owning-profile name of arbitrary users belonging to OTHER tenants/profiles. This is cross-tenant PII exposure via an authenticated enumeration oracle.
  - Đề xuất: If cross-profile contacts are intended, restrict the returned fields (drop raw email unless the two users already share a profile or an ACCEPTED contact) or require an exact email match (not substring) before revealing an address; otherwise scope the search to same-profile users plus existing contacts.
- **[P1-025] (Low) Subscription injection: request-pin auto-subscribe trusts an unverified, self-declared session email** — `src/lib/review/guest-subscribe.ts:91` · OWASP A01:2021 Broken Access Control · reachable=True
  - Vấn đề: The PIN double-opt-in exists precisely because a session email is unverified/self-declared. The auto-subscribe shortcut treats the self-declared session email as 'own/proven', so holding the share link is enough to create a verified GuestSubscription for a third party's address without that party ever receiving or entering a PIN — provided that address already has any live subscription in the system.
  - Đề xuất: Gate the PIN-skip on a genuinely proven identity, not the self-declared session email: require `guest.emailVerifiedAt` set AND `normEmail(guest.email)===email` before taking the emailAlreadyVerified auto-subscribe branch; otherwise always issue a fresh PIN to the target inbox.
- **[P1-026] (Low) test-email: nhận CRON_SECRET qua query string + lộ thông tin env** — `src/app/api/test-email/route.ts:17` · OWASP A09:2021 - Security Logging and Monitoring Failures · reachable=True
  - Vấn đề: CRON_SECRET truyền trong URL query bị ghi vào access log (Vercel), lịch sử proxy, Referer → rò rỉ bí mật cron dùng chung cho MỌI route /api/cron/*. Ngoài ra endpoint gửi email tùy ý tới bất kỳ địa chỉ (?to=) và lộ metadata env.
  - Đề xuất: Bỏ nhánh đọc secret từ query (chỉ chấp nhận header, so sánh timing-safe); bỏ diagnostics lộ env; hoặc xóa hẳn endpoint như comment 'DELETE after debugging' đã ghi.
- **[P1-027] (Low) OAuth state không ràng buộc session-cookie (CSRF) và authorize/callback không kiểm tra membership workspace** — `src/app/api/integrations/dropbox/callback/route.ts:38` · OWASP A01:2021 - Broken Access Control · reachable=True
  - Vấn đề: (1) Không có state-token ràng buộc vào cookie phiên → thiếu chống CSRF OAuth chuẩn; state có thể bị nguỵ tạo vì chỉ là base64 thường. (2) userId/workspaceId trong callback không được kiểm tra quyền: token lưu cho workspace mà user có thể không phải thành viên.
  - Đề xuất: Sinh state ngẫu nhiên, lưu server-side hoặc trong cookie HttpOnly và so khớp ở callback (one-time). Ở callback thêm verifyWorkspaceAccess(state.workspaceId,'MEMBER') trước khi upsert. Sửa comment sai 'encrypted'.
- **[P1-028] (Low) Impersonation lồng nhau ghi đè cookie admin_session → mất phiên gốc và có thể buộc đăng xuất OWNER** — `src/lib/auth.ts:98` · OWASP A04:2021 - Insecure Design (quản lý ngăn xếp phiên khi impersonation lồng nhau) · reachable=True
  - Vấn đề: Kịch bản: OWNER đóng vai ADMIN X (admin_session=OWNER). Trong phiên X (verifyWorkspaceAccess dùng session.user.id=X, role thật=ADMIN → qua cửa 'ADMIN' ở impersonation-actions.ts:14), X gọi startImpersonation đóng vai MEMBER Y. Lần gọi thứ hai ghi đè admin_session = phiên-X (mất phiên OWNER gốc). stopImpersonationSession() (auth.ts:116-138) khôi phục admin_session rồi xóa nó; sau vài lần stop, admin_session không còn → nhánh fallback xóa hẳn `session` (auth.ts:133) → OWNER bị buộc đăng nhập lại.
  - Đề xuất: Chặn impersonation lồng nhau: ở đầu startImpersonation, nếu `(session.user as any).isImpersonating` thì từ chối ('Đang ở phiên đóng vai, hãy thoát trước'). Hoặc dùng ngăn xếp admin_session không ghi đè.
- **[P1-029] (Low) Open redirect via unvalidated workspaceId from OAuth state in Dropbox / Google Drive callbacks** — `src/app/api/integrations/dropbox/callback/route.ts:154` · OWASP A01:2021 Broken Access Control (Open Redirect / CWE-601) · reachable=True
  - Vấn đề: workspaceId comes from user-controlled `state` and is placed unencoded into a `redirect()` target. A value like `//evil.com` (or `/\evil.com`) yields a Location of `//evil.com/admin/settings?...`, which browsers follow as a protocol-relative URL to an external host. The nonce field in state is also never validated, so there is no integrity check on the state payload.
  - Đề xuất: Validate workspaceId before use: reject anything that is not a bare cuid (e.g. `/^[a-z0-9]{20,32}$/i`) and/or confirm the authenticated user is a member of that workspace, before both the DB upsert and every redirect. Prefer redirecting to a fixed safe path (e.g. `/` or a settings route resolved server-side) on any validation failure. Optionally verify the state nonce against a server-stored/cookie value for CSRF integrity.
- **[P1-030] (Low) avatar() nhúng avatarUrl do người dùng kiểm soát vào thuộc tính src của email KHÔNG escape (attribute injection trong email)** — `src/lib/notification-emails/shared/wrapTemplate.ts:158` · OWASP A03:2021 Injection (HTML attribute injection trong email body) · reachable=True
  - Vấn đề: avatarUrl có thể chứa dấu nháy kép để thoát khỏi thuộc tính src và bơm thuộc tính/thẻ HTML vào thân email của người nhận (một staff khác). Vì là email nên JS không chạy (không có DOM script execution ở đa số mail client), tác động thực tế giới hạn ở phá layout / chèn img/anchor lừa đảo, không phải XSS thực thi.
  - Đề xuất: Bọc `url` bằng escapeHtml và/hoặc validate scheme (chỉ cho phép http/https, loại nháy/space) trong avatar(); hoặc drop <img> nếu URL không hợp lệ.
- **[P1-031] (Low) CSP cho phép script-src 'unsafe-inline' và 'unsafe-eval' không nonce — CSP không còn tác dụng chặn XSS** — `next.config.ts:62` · OWASP A05:2021 Security Misconfiguration · reachable=True
  - Vấn đề: Với 'unsafe-inline' + 'unsafe-eval', bất kỳ HTML/attribute injection nào cũng thực thi được JS; CSP không cung cấp lớp phòng thủ thứ hai chống XSS. Các header khác (XFO DENY, nosniff, Referrer-Policy, Permissions-Policy) đều tốt, nhưng script-src này là mắt xích yếu.
  - Đề xuất: Chuyển sang CSP dựa trên nonce (strict-dynamic) do Next.js middleware sinh per-request, bỏ 'unsafe-inline'/'unsafe-eval'. Nếu chưa thể bỏ hẳn ngay, ưu tiên loại 'unsafe-eval' trước.
- **[P1-032] (Low) Thiếu header Strict-Transport-Security (HSTS)** — `next.config.ts:48` · OWASP A05:2021 Security Misconfiguration · reachable=True
  - Vấn đề: Không có HSTS thì lần điều hướng HTTP đầu tiên (hoặc sau khi cache CSP hết) vẫn có thể bị SSL-strip/hạ cấp; cookie session (httpOnly, secure) vẫn có nguy cơ trong kịch bản MITM trước redirect. 'upgrade-insecure-requests' chỉ nâng cấp subresource của trang đã tải, không bảo vệ request tài liệu đầu.
  - Đề xuất: Thêm header `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` cho source '/(.*)' trong next.config headers() (chỉ cho nhánh non-Electron).
- **[P1-033] (Low) Endpoint chẩn đoán test-email còn sống: nhận CRON_SECRET qua query string + gửi mail tới địa chỉ tùy ý** — `src/app/api/test-email/route.ts:18` · OWASP A09:2021 Security Logging and Monitoring Failures · reachable=True
  - Vấn đề: Chấp nhận CRON_SECRET trong URL khiến secret bị ghi vào access-log/proxy-log/history trình duyệt (Referrer-Policy không cứu được query string trong log máy chủ). Nếu secret rò rỉ, endpoint trở thành relay gửi email từ domain agency tới địa chỉ tùy ý.
  - Đề xuất: Xóa endpoint (đúng như comment) hoặc tối thiểu: bỏ nhánh đọc secret từ query string (chỉ nhận header), bỏ tiết lộ tiền tố API key, và giới hạn `to` theo allowlist.
- **[P1-034] (Low) log-client-error: unauth, không rate-limit — log-flood / chi phí ingest DoS + log injection** — `src/app/api/log-client-error/route.ts:17` · OWASP A04:2021 Insecure Design · reachable=True
  - Vấn đề: Không có trần request ⇒ attacker bơm không giới hạn log error vào Vercel; mỗi bản ghi tốn chi phí ingest và làm nhiễu tín hiệu lỗi thật. Chuỗi attacker-controlled đi thẳng vào log (log injection/nhiễu điều tra).
  - Đề xuất: Thêm rate-limit theo IP (dùng getClientIp an toàn + limitDb/Upstash, ví dụ 20/phút/IP) và cân nhắc sampling. Ghi rõ nội dung là dữ liệu chưa tin cậy.
- **[P1-035] (Low) Calendar webhook: unauth, không verify chữ ký, log nguyên body request tùy ý** — `src/app/api/webhooks/calendar/route.ts:8` · OWASP A09:2021 Security Logging and Monitoring Failures · reachable=True
  - Vấn đề: Endpoint unauth phản chiếu/ghi log dữ liệu attacker không giới hạn (log spam/injection). Nếu phần TODO tạo ScheduleException được bật sau này mà vẫn thiếu verify, sẽ thành lỗ ghi dữ liệu unauth thực sự.
  - Đề xuất: Thêm xác thực nguồn (validationToken của Microsoft đã có; bổ sung verify chữ ký/secret cho Google) trước khi xử lý; bỏ log nguyên body hoặc rate-limit + cắt kích thước. Nếu chưa dùng, cân nhắc trả 404/gỡ route cho tới khi hoàn thiện.
- **[P1-036] (Low) FSM vòng đời task bị vô hiệu hóa toàn cục — không có ràng buộc thứ tự chuyển trạng thái ở action layer (chỉ còn guard terminal)** — `src/lib/fsm-config.ts:122` · OWASP A04:2021 Insecure Design · reachable=True
  - Vấn đề: Hệ quả là mọi bước nhảy trạng thái không-terminal đều hợp lệ: task có thể nhảy 'Đang thực hiện' → 'Đã sửa feedback (khách)' (A7) bỏ qua toàn bộ bước trung gian, hoặc assignee tự đưa task 'Revision' → 'Đang thực hiện' (self-reopen). canAutoTransition/STATUS_TRANSITIONS chỉ áp cho đường AUTO (Inngest/webhook/guest) và cho các route review-module có session (markFeedbackDone/confirmFixDone/approveInternalAndSendToClient), KHÔNG áp cho updateTaskStatus gọi trực tiếp.
  - Đề xuất: Hoặc gỡ hẳn lời gọi validateTransition (bỏ phòng thủ chết cho rõ ràng), hoặc thay bằng assertValidTransition/canTransition trong task-state-machine.ts (đã có sẵn, đã cập nhật cho các status mới). Tối thiểu nên enforce cho nhánh non-admin.
- **[P1-037] (Low) createWorkspaceAction: workspace-quota TOCTOU (count-then-create without lock)** — `src/actions/workspace-actions.ts:45` · OWASP A04:2021 - Insecure Design (Business-logic race) · reachable=True
  - Vấn đề: Classic check-then-act: N concurrent createWorkspaceAction calls from the same user all read ownedCount=9 and all pass the `>= 10` guard, then all create — exceeding the intended cap.
  - Đề xuất: Enforce the cap atomically — e.g. take a per-user advisory lock before count+create, or move to a DB-level constraint/counter. Low urgency given the abuse-only impact.
- **[P1-038] (Low) recordPayment: no idempotency key — double-submit inflates client 'paid' ledger total** — `src/actions/payment-actions.ts:74` · OWASP A04:2021 - Insecure Design (Missing idempotency) · reachable=True
  - Vấn đề: Because installments are legitimately multiple rows, there is no natural dedup — but a double-click / retry of the same 'record payment' submission creates two identical Payment rows, and the ledger sum then reports the client as having paid twice the real amount.
  - Đề xuất: Add a client-supplied idempotency token (or a short-window dedup on (clientId, workspaceId, amount, paidAt, invoiceId)) and reject/no-op duplicates; optionally disable the submit button after first submit. Consider a unique constraint keyed on an idempotency id.
- **[P1-039] (Low) Giới hạn 10 workspace/user bị bypass qua race condition (count-then-create không atomic)** — `src/actions/workspace-actions.ts:45` · OWASP A04:2021-Insecure Design · reachable=True
  - Vấn đề: Kiểm tra hạn mức (10 workspace OWNER/user) theo mẫu check-then-act không nguyên tử: đếm ngoài transaction, tạo trong transaction mà không khóa/không đếm lại. Không có ràng buộc DB (unique/partial index) nào cưỡng chế trần này.
  - Đề xuất: Cưỡng chế nguyên tử: (a) thêm partial unique/exclusion constraint hoặc bảng đếm khóa được; hoặc (b) trong transaction dùng advisory lock theo userId (pg_advisory_xact_lock) rồi RE-COUNT workspaceMember(role=OWNER) BÊN TRONG transaction trước khi create — giống mẫu đã dùng cho MAX_REVIEWERS_PER_SHARE ở guest-subscribe.ts (advisory lock + re-count trong tx).
- **[P1-040] (Low) Giới hạn 5 profile/user bị bypass qua race condition (count-then-create không atomic)** — `src/actions/profile-actions.ts:240` · OWASP A04:2021-Insecure Design · reachable=True
  - Vấn đề: Cùng lớp lỗi TOCTOU như createWorkspaceAction: hạn mức 5 profile/user kiểm tra bằng count ngoài transaction rồi create bên trong mà không đếm lại dưới khóa.
  - Đề xuất: Trong transaction, lấy advisory lock theo userId rồi RE-COUNT (profileAccess + profile) bên trong tx trước khi create; hoặc thêm cơ chế đếm cưỡng chế ở tầng DB. Tái dùng đúng mẫu advisory-lock+re-count đã có ở guest-subscribe.ts.
- **[P1-041] (Low) Webhook calendar không xác thực chữ ký/secret (landmine khi bật handler)** — `src/app/api/webhooks/calendar/route.ts:8` · OWASP A07:2021 - Identification and Authentication Failures · reachable=False
  - Vấn đề: Route hoàn toàn không xác thực. Hiện tại handler chỉ console.log(body) và khối createScheduleException đang bị comment (dòng 26-40), nên chưa có side-effect ghi DB — đây là lý do đánh dấu reachable=false. Nhưng TODO ngay bên dưới dự kiến gọi createScheduleException(workspaceId, profileId, userId, ...) với dữ liệu lấy thẳng từ body chưa xác thực.
  - Đề xuất: Thêm xác thực TRƯỚC khi dùng body: với Google dùng channel token/X-Goog-Channel-Token đã đăng ký, với Microsoft Graph so khớp clientState đã lưu; ánh xạ resource→userId từ bản ghi subscription nội bộ thay vì tin body. Không dùng userId/workspaceId lấy từ payload chưa verify.
- **[P1-042] (Low) JWT_SECRET chấp nhận độ dài tối thiểu chỉ 10 ký tự — khoá HS256 yếu, có thể brute-force để giả mạo token** — `src/lib/env.ts:7` · OWASP A02:2021 - Cryptographic Failures · reachable=False
  - Vấn đề: HS256 cần khoá bí mật ≥256-bit (~32 byte ngẫu nhiên) mới an toàn. Schema cho phép secret 10 ký tự. Nếu operator cấu hình JWT_SECRET ngắn/entropy thấp (ví dụ mật khẩu dễ đoán), khoá có thể bị brute-force/dò offline từ một token hợp lệ bắt được, sau đó ký token giả mạo bất kỳ role nào (ADMIN/OWNER).
  - Đề xuất: Nâng ràng buộc: z.string().min(32) (khuyến nghị ≥64 ký tự như SRS đề cập), và ở guard production từ chối khởi động nếu secret ngắn/entropy thấp, không chỉ khớp placeholder. Bổ sung tài liệu yêu cầu sinh secret ngẫu nhiên.
- **[P1-043] (Low) Rate-limit login theo IP fail-OPEN khi Upstash ném exception (không chỉ ở dev)** — `src/actions/auth-actions.ts:215` · OWASP A07:2021 - Identification and Authentication Failures · reachable=False
  - Vấn đề: Thiết kế fail-closed ở tầng rate-limit-upstash.ts bị vô hiệu bởi try/catch fail-open ở caller: khi Upstash gặp lỗi tạm thời trong production (network blip, quota, 5xx), throttle 10 login/phút/IP bị bỏ qua hoàn toàn cho các request đó. Chỉ còn lockout per-user (5 fail/15 phút) là tuyến phòng thủ.
  - Đề xuất: Trong production, để checkLoginIp lỗi thì fail-CLOSED thay vì swallow: bắt lỗi và trả { error: 'Quá nhiều yêu cầu...' } (chặn) khi NODE_ENV==='production', chỉ fail-open ở dev — nhất quán với chính sách của noLimiterResult().
- **[P1-044] (Low) Attribute-value / tag injection trong href của renderCommentMarkdown (href không escape lại)** — `src/lib/comment-markdown.ts:57` · OWASP A03:2021-Injection (XSS) · reachable=False
  - Vấn đề: href chèn vào HTML mà không escape " và >. Comment body do USER/CLIENT nhập (comment thread dùng cả trong admin drawer lẫn client portal qua PortalCommentSection), nên attacker kiểm soát chuỗi này.
  - Đề xuất: Escape href trước khi nội suy vào attribute (thay ", <, > bằng entity) tại dòng 57 và 64, và siết regex url loại ",<,>. Không dựa DOMPurify làm phòng tuyến duy nhất.
- **[P1-045] (Low) QR thanh toán (PII ngân hàng) lưu ở bucket PUBLIC với key đoán được khi chạy driver Supabase** — `src/actions/upload-actions.ts:96` · OWASP A01:2021 Broken Access Control (public-by-URL) · reachable=False
  - Vấn đề: Với STORAGE_DRIVER='supabase' (đường di trú Railway đã tính đến trong chính storage.ts), URL công khai của QR = hàm tất định của key. Chỉ cần biết userId (cuid) + đoán timestamp trong một cửa sổ là dựng lại URL và tải QR ngân hàng của người khác mà không cần đăng nhập, dù QR mang thông tin nhạy cảm (số TK/beneficiary).
  - Đề xuất: Không để PII (QR ngân hàng) trong bucket public tất định. Hoặc chuyển QR sang lưu R2 riêng-tư phục vụ qua presigned GET có auth (như review masters), hoặc thêm thành phần ngẫu nhiên không đoán được vào key kể cả trên Supabase (vd chèn randomBytes vào tên file), thay vì chỉ userId+timestamp.
- **[P1-046] (Low) translateTaskNote goi OpenAI GPT-4 khong rate-limit, khong gioi han do dai input (prompt injection + unbounded cost) - nhung hien la dead code** — `src/lib/gemini-translator.ts:38` · OWASP API4:2023 Unrestricted Resource Consumption / LLM01 Prompt Injection · reachable=False
  - Vấn đề: Neu ham duoc noi vao mot Server Action tao/sua task, moi lan goi = 1 request GPT-4 voi token ti le thuan input do attacker kiem soat: khong cap do dai, khong max_tokens response, khong rate-limit -> dot tien OpenAI (Denial of Wallet). Dong thoi user chen chi thi vao note (prompt injection) de thao tung ban dich.
  - Đề xuất: Truoc khi wire lai: (1) chan do dai input (vd max 4-8K ky tu) va cat/refuse neu vuot; (2) them rate-limit theo profileId/workspaceId; (3) dat max_tokens cho response; (4) escape/sanitize output HTML truoc khi hien thi; (5) goi requireAuth + verifyWorkspaceAccess ngay dau caller. Hoac xoa ham neu tinh nang da bi bo (retry-translation-action.ts da deprecated).
- **[P1-047] (Low) Secret fallback JWT_SECRET hardcode trong source (đã fail-closed ở production)** — `src/lib/env.ts:3` · OWASP A05:2021 - Security Misconfiguration · reachable=False
  - Vấn đề: Có một secret ký JWT được hardcode công khai trong repo. Nếu deploy ở môi trường mà env.NODE_ENV KHÔNG phải 'production' (dev/test/self-host quên set NODE_ENV=production, hoặc build phase) nhưng vẫn phục vụ traffic thật, hệ thống sẽ ký/verify session JWT bằng secret public này — bất kỳ ai biết chuỗi này (nó nằm ngay trong git) đều có thể forge JWT cho mọi role (ADMIN/isTreasurer), toàn quyền bypass auth.
  - Đề xuất: Bỏ giá trị default cho JWT_SECRET (bắt buộc phải set, fail nếu thiếu ở MỌI môi trường non-dev), hoặc mở rộng guard fail-closed để chặn cả khi NODE_ENV != 'production' mà không phải local dev thực sự. Không commit bất kỳ secret ký nào vào source.
- **[P1-048] (Low) Diagnostic endpoint rò prefix RESEND_API_KEY + trạng thái các secret (gated bằng CRON_SECRET)** — `src/app/api/test-email/route.ts:28` · OWASP A01:2021 - Broken Access Control · reachable=False
  - Vấn đề: Endpoint chẩn đoán còn sót lại trong production, phơi 6 ký tự đầu của RESEND_API_KEY và bản đồ secret nào đã cấu hình. Nó KHÔNG trả stack trace client nhưng là info-leak về secret. Được bảo vệ bằng so sánh CRON_SECRET (line 20), nên chỉ caller có CRON_SECRET mới đọc được.
  - Đề xuất: Xóa route /api/test-email khỏi production theo đúng ghi chú trong file; nếu cần giữ, không in bất kỳ phần nào của giá trị secret (bỏ slice(0,6)).

## ⚪ INFO (gồm xác nhận âm tính / an toàn)

- **[P1-049] (Info) sendContactRequest / blockContact accept an arbitrary receiver id with no membership or role validation** — `src/actions/contact-actions.ts:78` · OWASP A01:2021 - Broken Access Control · reachable=True
  - Vấn đề: A caller can craft Contact rows toward any user id in the system, including CLIENT/LOCKED accounts or users in other profiles that would never appear in searchContacts.
  - Đề xuất: Validate the target user is an eligible contact (same eligibility filter as searchContacts: role notIn [LOCKED, CLIENT], and/or shares a profile) before creating Contact rows.
- **[P1-050] (Info) form.notes render raw không sanitize trong preview AddTaskModal** — `src/components/dashboard/AddTaskModal.tsx:1438` · OWASP A03:2021-Injection (XSS) · reachable=True
  - Vấn đề: HTML rich-text notes render thô ngay trong modal.
  - Đề xuất: Bọc DOMPurify.sanitize(form.notes) cho đồng nhất.
- **[P1-051] (Info) retry-translation-action.ts la Server Action public khong kiem tra phien dang nhap** — `src/actions/retry-translation-action.ts:6` · OWASP API2:2023 Broken Authentication · reachable=True
  - Vấn đề: Endpoint khong co auth guard. Vi hien tai khong co side-effect (chi tra chuoi hang), rui ro bang 0 - chi ghi nhan de khong tai kich hoat logic that vao ham nay ma quen them guard.
  - Đề xuất: Xoa han action deprecated nay, hoac neu giu thi them requireAuth o dau de tranh bay khi tai su dung.
- **[P1-052] (Info) Không có route nào thiếu auth/workspace-scope — kiến trúc guard đồng nhất, đạt yêu cầu** — `src/lib/review/route-auth.ts:21` · OWASP A01:2021-Broken Access Control · reachable=False
  - Vấn đề: Không có lỗ hổng. Mỗi service function tự re-derive workspaceId TỪ CHÍNH resource row đã resolve (asset.workspaceId / version→asset.workspaceId / folder.workspaceId / comment→version→asset.workspaceId) rồi gọi requireReviewAccess({workspaceId}) → verifyWorkspaceAccess(id,'MEMBER') (real-time DB check). Kèm assertVersionInScope/assertAssetInScope/assertFolderPathMutable (FR-03 folder-scope) chặn editor ngoài phạm vi. Không route nào truyền thẳng id của client vào workspace-check mà không đối chiếu row thật.
  - Đề xuất: Không cần sửa. Giữ nguyên pattern: route → service → requireReviewAccess({workspaceId: <derive từ row>}) + assert*InScope.
- **[P1-053] (Info) Thao tác đa mục (move/delete/copy/restore) từ chối cross-workspace đúng cách** — `src/lib/review/folders.ts:646` · OWASP A01:2021-Broken Access Control · reachable=False
  - Vấn đề: Không phải lỗ hổng. moveItems gom Set(workspaceId của mọi folder+asset đã load), nếu size !== 1 → ném CROSS_WORKSPACE (dòng 647), rồi requireReviewAccess trên đúng workspace đó + assertFolderPathsMutable trên path nguồn, và trong tx còn assert target.path in-scope (dòng 669-671). mergeStacks (versions.ts:291) cũng chặn source.workspaceId !== target.workspaceId + assert cả 2 asset in-scope.
  - Đề xuất: Không cần.
- **[P1-054] (Info) statuses + comment-attachments/initiate gọi requireReviewAccess() không kèm workspaceId — nhưng workspace-independent, không IDOR** — `src/lib/review/comments.ts:558` · OWASP A01:2021-Broken Access Control · reachable=False
  - Vấn đề: Không phải lỗ hổng. Cả hai không thao tác trên resource thuộc workspace cụ thể nên workspace-scope vô nghĩa: getReviewStatusOptions chỉ trả label status dùng chung; initiateAttachment sinh attachmentId=randomUUID() + key namespaced theo access.userId (attachmentKey(access.userId,...)), object chỉ được ràng buộc + kiểm scope khi createComment gắn nó vào version (comments.ts:111 resolveVersionCtx → requireReviewAccess({workspaceId}) + assertVersionInScope). getAttachmentRawUrl (đọc lại ảnh) re-check qua resolveCommentCtx đầy đủ.
  - Đề xuất: Không bắt buộc. Nếu muốn tối giản attack-surface có thể thêm rate-limit cho initiateAttachment (presign vô hạn key rác), nhưng không phải vấn đề authz.
- **[P1-055] (Info) So sánh CRON_SECRET không timing-safe ở đa số route cron** — `src/app/api/cron/check-deadline/route.ts:25` · OWASP A02:2021 - Cryptographic Failures · reachable=False
  - Vấn đề: So sánh không hằng-thời-gian mở kênh side-channel timing trên CRON_SECRET. Đội đã chuẩn hoá đúng ở auth-cleanup (comment H1) nhưng chưa áp cho các cron còn lại.
  - Đề xuất: Trích safeEqual (timingSafeEqual có kiểm tra độ dài) ra util chung và dùng cho tất cả route cron thay cho '!=='.
- **[P1-056] (Info) profile/select chấp nhận sessionToken trong body để thay cho cookie phiên** — `src/app/api/profile/select/route.ts:18` · OWASP A07:2021 - Identification and Authentication Failures · reachable=False
  - Vấn đề: Mở rộng nguồn nhận diện phiên sang body do 'Vercel Edge Cache Workaround'. decrypt() vẫn xác minh chữ ký JWT nên token không thể nguỵ tạo nếu không có JWT_SECRET → không phải bypass auth. Rủi ro là bề mặt: token phiên bị lộ/log ở phía client (body) có thể tái dùng; quyền truy cập profile vẫn được kiểm tra (profileId === user.profileId hoặc ProfileAccess).
  - Đề xuất: Nếu không còn cần workaround, bỏ nhánh decrypt(sessionToken) từ body và chỉ dựa vào cookie HttpOnly; nếu buộc phải giữ, tránh log body chứa token.
- **[P1-057] (Info) Secret mặc định committed trong source dùng làm fallback ở môi trường non-production (dev/test/preview)** — `src/lib/env.ts:37` · OWASP A05:2021 - Security Misconfiguration · reachable=False
  - Vấn đề: Ở mọi môi trường NODE_ENV != 'production' (dev, test, và bất kỳ deployment nào vô tình không set NODE_ENV=production), hệ thống âm thầm ký/verify session JWT bằng secret công khai nằm trong repo. Bất kỳ ai đọc source đều có thể giả mạo token trên các môi trường đó.
  - Đề xuất: Không đưa secret thật vào default; cân nhắc bỏ hẳn .default() cho JWT_SECRET (bắt buộc phải cung cấp) hoặc mở rộng guard fail-closed để cũng chặn khi chạy phục vụ request (không phải build) mà secret===default bất kể NODE_ENV.
- **[P1-058] (Info) dangerouslySetInnerHTML không sanitize cho form.notes trong AddTaskModal (self-XSS, không tấn công được người khác)** — `src/components/dashboard/AddTaskModal.tsx:1438` · OWASP A03:2021 Injection · reachable=False
  - Vấn đề: HTML thô được chèn không sanitize. Tuy nhiên nội dung là input của chính tác giả trong modal của họ (preview), và khi notes được lưu rồi hiển thị nơi khác (TaskDetailModal.tsx:750, TaskDetailMobile.tsx:447, mobile/TaskDrawer.tsx:200) đều đã bọc DOMPurify.sanitize.
  - Đề xuất: Bọc DOMPurify.sanitize(form.notes) cho nhất quán với các điểm render khác, để tránh trở thành lỗ hổng nếu sau này preview được tái sử dụng ở ngữ cảnh nhiều người xem.
- **[P1-059] (Info) Puppeteer invoice PDF renderer does not fetch attacker URLs (no SSRF) — examined, safe** — `src/lib/invoice-generator.ts:272` · OWASP A10:2021 SSRF (not present) · reachable=False
  - Vấn đề: Because every field is HTML-attribute/entity escaped, an attacker cannot inject `<img src>`, `<link>`, `<iframe>` or similar to force Puppeteer to make an outbound request during `waitUntil:'load'`, and no code navigates the page to a user-controlled URL. `paymentLink` is only placed in an `href` in the static PDF (not auto-fetched, not JS-executed).
  - Đề xuất: No change required. If raw HTML fields are ever added (triple-stache) or a `page.goto(userUrl)` is introduced, add an allowlist/SSRF guard at that point.
- **[P1-060] (Info) Cloud scanner is host-locked to Dropbox/Google APIs; R2 download keys are bucket-bounded — examined, safe** — `src/lib/cloud-scanner.ts:207` · OWASP A10:2021 SSRF / A01 Path Traversal (not present) · reachable=False
  - Vấn đề: No server-side fetch targets an attacker-chosen host, and no key reaches the filesystem, so neither SSRF nor path traversal is reachable on these surfaces.
  - Đề xuất: No change required. Keep the hostname allowlist in parseCloudLink as the single validation choke point; if a future path lets callers supply an arbitrary provider host or a raw fetch URL, add an SSRF allowlist there.
- **[P1-061] (Info) email-migration requestEmailChange gửi OTP tới email đích tùy ý (đã có cap email bền nên rủi ro thấp)** — `src/actions/email-migration-actions.ts:161` · OWASP A04:2021 Insecure Design · reachable=False
  - Vấn đề: Cho phép người dùng đã auth kích một email OTP tới địa chỉ bất kỳ, nhưng checkOtpEmail keyed theo chính email đích (bền, xuyên IP) giới hạn ~3/h/hộp thư ⇒ không thể email-bomb quy mô. Ghi nhận để đối chiếu với luồng portal-notify (điểm khác biệt: portal-notify thiếu cap bền theo email).
  - Đề xuất: Không cần sửa; dùng làm mẫu tham chiếu (checkOtpEmail bền) cho fix của finding #1.
- **[P1-062] (Info) Xac nhan am tinh: khong lo API key AI ra client, khong co endpoint AI thu hai, error-translator la map tinh (khong co injection)** — `src/lib/error-translator.ts:8` · OWASP N/A (xac nhan am tinh) · reachable=False
  - Vấn đề: Khong phat hien ro ri key hay endpoint AI thu hai. Ghi nhan de xac nhan be mat V-AI da duoc quet can.
  - Đề xuất: Khong can. Luu y van hanh: new OpenAI({ apiKey: process.env.GPT4_API_KEY || '' }) khoi tao o module scope voi fallback rong - an toan (chi fail luc goi), khong lo ra client.
- **[P1-063] (Info) MCP status-service cho phép work→'Hoàn tất' không kiểm tra role (trả lương editor) — nhưng chỉ đạt được qua service-account cấp profile** — `mcp-server/src/services/status-service.ts:68` · OWASP A01:2021 Broken Access Control · reachable=False
  - Vấn đề: Về nguyên tắc, đường MCP có thể set task sang 'Hoàn tất' (kích hoạt salaryCompleted) mà không có kiểm tra admin/assignee như web. Tuy nhiên auth-context.ts cho thấy MCP chạy dưới service-account cấp profile (MCP_PROFILE_ID env) = admin toàn profile do chủ dự án kiểm soát, không phải endpoint editor tự gọi bằng credential của mình.
  - Đề xuất: Thêm ghi chú/bất biến trong status-service: MCP là service-account admin (by design); nếu sau này MCP phục vụ per-user, phải nhân bản guard H3 (terminal admin-only) và role check. Cân nhắc chặn (work)→terminal ở MCP để đồng nhất với web.
- **[P1-064] (Info) Mux webhook replay + guest reviewer cap are correctly protected (no defect) — reference for the money paths** — `src/app/api/webhooks/mux/route.ts:74` · OWASP A04:2021 - Insecure Design (verified-safe controls) · reachable=False
  - Vấn đề: No defect. Recorded to document which concurrency-sensitive paths ARE safe (webhook dedup, guest cap, claim, guest decision) versus the unlocked money paths flagged above.
  - Đề xuất: None required. Reuse the advisory-lock / conditional-updateMany pattern already present here in voidInvoice and calculateMonthlyBonus.

## ── PASS 2 (Lens-2) bổ sung ──

### Hạ cấp / FALSE_POSITIVE từ Pass-2 triage
- **P2-001 notification-actions `*Internal` helpers không auth** — FALSE_POSITIVE (mức High) → **Low (debt)**: verifier chứng minh 3 helper KHÔNG được Client Component nào tham chiếu → Next.js loại khỏi client manifest, action-id không dispatch được từ ngoài ⇒ không phải endpoint công khai. **Cảnh báo:** nếu sau này 1 Client Component import chúng thì lập tức thành endpoint forgery/spam không-auth. Đề xuất: tách logic sang `src/lib/notifications.ts` (bỏ khỏi "use server").
- **P2-002 updateFrameAccount thiếu authz** — CONFIRMED nhưng **Low**: ghi đè credential Frame dùng chung được bởi mọi user, NHƯNG tích hợp frame.io đã bị review-module thay thế, credential mồ côi không consumer → chỉ toàn vẹn dữ liệu mức thấp. (Rò rỉ READ nằm ở HT — xem getFrameAccount.)
- **P2-009 Google-Drive OAuth open-redirect qua workspaceId** — CONFIRMED, **Low**, TRÙNG P1-029 (Dropbox/GDrive open-redirect đã ở BACKLOG). Gộp: validate/ký workspaceId trong OAuth state cho cả 2 provider.

### Low/Info khác từ Pass-2
- **[P2-011] (Low) availability-actions self-serve (getMyAvailability/Week, saveMyAvailability) không enforce LOCKED account + sessionVersion — tài khoản bị KHÓA/thu hồi phiên vẫn ghi được lịch khả dụng** — `src/actions/availability-actions.ts:117` · reachable=True
  - saveMyAvailability là một WRITE server action (upsert DailyAvailability) nhưng đi qua nhánh auth KHÔNG bao giờ gọi verifyWorkspaceAccess, nên bản vá R3 (enforce sessionVersion trên write path) và guard LOCKED không áp dụng ở đây. Cookie phi
  - Đề xuất: Thay getCurrentUser()+ensureWorkspaceAccess() bằng verifyWorkspaceAccess(workspaceId, 'MEMBER') ở getMyAvailability, getMyAvailabilityWeek, saveMyAvailability (lấy userId từ access.userId), hoặc bổ su
- **[P2-012] (Low) refreshLeaderboardAction: server action công khai KHÔNG xác thực → bất kỳ ai cũng invalidate cache 'leaderboard'** — `src/actions/leaderboard-actions.ts:5` · reachable=True
  - Thiếu hoàn toàn lớp authn/authz. Bất kỳ khách vãng lai (chưa đăng nhập) nào cũng gọi được và ép làm mất hiệu lực (invalidate) cache tag 'leaderboard' toàn hệ thống — không giới hạn theo tenant/workspace.
  - Đề xuất: Thêm guard ở đầu action: yêu cầu session hợp lệ và, nếu có thể, nhận + verifyWorkspaceAccess(workspaceId, 'MEMBER') rồi mới revalidateTag. Tối thiểu: const s = await getSession(); if (!s?.user?.id) re
- **[P2-013] (Low) createClient nhận parentId tùy ý không kiểm tra same-profile (mass-assignment FK chéo-profile)** — `src/actions/crm-actions.ts:89` · reachable=True
  - parentId là FK tới Client nhưng được ghi thẳng vào record mà không xác thực thuộc profile của caller. Một ADMIN của profile P1 có thể tạo client mới (profileId=P1) với parentId = id của một client thuộc profile P2 (đoán id số nguyên tuần tự
  - Đề xuất: Trước client.create, nếu parentId != null thì kiểm tra parent thuộc cùng profile + ACTIVE + parentId===null, tái dùng đúng logic của mergeClientIntoParent (ví dụ: const parent = await workspacePrisma.
- **[P2-014] (Low) notifications GET thiếu guard assetInShare — rò rỉ email tổng hợp của session (lộ client.id nội bộ) cho khách vô danh giữ slug** — `src/app/api/r/[slug]/notifications/route.ts:22` · reachable=True
  - guestSubscriptionStatus không xác thực assetId nằm trong scope của share, và luôn trả về `email: input.guest.email` trong response body. Với share known-client (share.taskId có client ACTIVE), resolveGuestForWrite/createLinkClientGuestSessi
  - Đề xuất: Thêm guard scope trước khi trả kết quả: trong route, sau requireShare, kiểm tra `share.items.some(i => i.assetId === assetId)` (hoặc gọi assertVersionInShare/assetInShare tương ứng) và trả 404/400 nếu
- **[P2-015] (Low) CRON_SECRET nhận qua query param `?secret=` trong test-email → rò secret qua log/referrer, cho phép gửi email tuỳ ý mạo danh HustlyTasker** — `src/app/api/test-email/route.ts:18` · reachable=True
  - Đưa secret vào query string khiến nó bị ghi vào access log của Vercel, lịch sử trình duyệt, Referer header khi trang có tài nguyên ngoài. Vi phạm nguyên tắc 'không đặt dữ liệu nhạy cảm vào URL'. Nếu CRON_SECRET rò rỉ, attacker gọi `?to=vict
  - Đề xuất: Bỏ nhánh `url.searchParams.get('secret')`, chỉ chấp nhận header/Bearer; dùng timingSafeEqual; và xoá endpoint diagnostic khỏi production như comment đã ghi.
- **[P2-016] (Low) savePushSubscription rebind endpoint sang userId của caller — có thể chiếm/chuyển hướng web-push của nạn nhân nếu biết endpoint (bí mật, khó đoán)** — `src/actions/push-actions.ts:37` · reachable=False
  - Nếu một attacker đã đăng nhập biết được `endpoint` push của nạn nhân, họ có thể gọi savePushSubscription với endpoint đó → bản ghi bị rebind về userId của attacker; sau đó push của attacker (sendWebPushToUser) được đẩy tới trình duyệt nạn n
  - Đề xuất: Khi update mà bản ghi endpoint đang thuộc userId khác, từ chối hoặc xóa-tạo-mới thay vì rebind ngầm; hoặc chỉ update khi `existing.userId === session.userId`.
- **[P2-017] (Low) resolveShareToken mở rộng scope theo NAME-PATH có thể gộp hai client khác nhau nhưng trùng tên gốc trong cùng profile** — `src/lib/share-link-auth.ts:153` · reachable=False
  - Định danh client bằng name-path (đã chuẩn hoá NFC/lowercase) đồng nhất hai thực thể logic KHÁC NHAU nếu tên gốc trùng nhau (ví dụ hai doanh nghiệp cùng tên 'Smith' trong một profile) — link của client này sẽ lộ tài liệu/video của client kia
  - Đề xuất: Cân nhắc bổ sung ràng buộc định danh bằng id/mergedIntoId thay vì (hoặc bên cạnh) name-path, hoặc chặn share-link khi phát hiện >1 cây client trùng tên gốc trong profile.
- **[P2-018] (Info) updateTag/deleteTag: thiếu đối chiếu tag.workspaceId === workspaceId (chỉ chặn theo userId)** — `src/actions/tag-actions.ts:108` · reachable=False
  - Tag được tra bằng global prisma không gán workspaceId; điều kiện phòng thủ duy nhất là quyền sở hữu theo userId. Một ADMIN ở workspace A về lý thuyết có thể sửa/xoá TAG CỦA CHÍNH HỌ nằm ở workspace B thông qua credential của workspace A.
  - Đề xuất: Thêm điều kiện if (tag.workspaceId !== workspaceId) return { error: 'Forbidden' } sau khi tra tag, hoặc dùng getWorkspacePrisma(workspaceId).tagCategory để scope tự động.
- **[P2-019] (Info) getLastClientNote: findUnique client theo id không lọc profile (cross-tenant read primitive, hiện chưa lộ dữ liệu)** — `src/actions/velox-helpers-actions.ts:115` · reachable=False
  - Đầu vào clientId không được ràng buộc thuộc profile trước khi findUnique toàn cục. Đây là một read primitive xuyên tenant.
  - Đề xuất: Thêm điều kiện profileId vào findUnique dòng 114-121: prisma.client.findFirst({where:{id:clientId, OR:[{profileId},{workspaceId:{in:workspaceIds}}]}}); nếu không thấy thì return null.
- **[P2-020] (Info) So sánh CRON_SECRET không hằng-thời-gian ở đa số cron route (không nhất quán với auth-cleanup/mux)** — `src/app/api/cron/check-deadline/route.ts:29` · reachable=False
  - So sánh `!==` không hằng-thời-gian về lý thuyết lộ timing side-channel trên secret. Thực tế secret là chuỗi ngẫu nhiên entropy cao và jitter mạng >> chênh lệch thời gian nên tấn công qua mạng không khả thi; đây là điểm hardening/nhất quán c
  - Đề xuất: Trích xuất helper `safeEqual` (đã có sẵn trong auth-cleanup) và dùng chung cho tất cả cron route.

## ── PASS 3 (Lens-3) bổ sung ──

### FALSE_POSITIVE / hạ cấp / trùng (Pass-3 triage)
- **P3-001 uploadPaymentQr/uploadAvatar thiếu auth** — FALSE_POSITIVE: code ĐÃ VÁ (AUDIT R1) — `getSession()` bỏ qua userId client, ghi theo session id. KHÔNG còn IDOR. (Tin tốt: đường nhận-tiền đã an toàn.)
- **P3-006 admin-profile-actions gate JWT username=="admin"** — FALSE_POSITIVE → Info: không khai thác được như mô tả.
- **P3-010 bulkUpdateTaskStatus thiếu optimistic-lock** — CONFIRMED nhưng **Low** (clobber flip đồng thời của pipeline, tác động thấp).
- **P3-009 voidInvoice TOCTOU (check status ngoài tx)** — TRÙNG **HT-005** (cùng voidInvoice double-refund TOCTOU). Gộp: 1 fix advisory-lock/idempotent bọc cả re-check status.

### Low/Info khác từ Pass-3 (gồm khoảng trống độ phủ do RT8 completeness-critic nêu)
- **[P3-013] (Low) Đọc token-authed của khách làm gỡ bỏ cổng downloadOnlyWhenApproved trên ShareLink do staff tạo** — `src/lib/review/shares.ts:372` · reachable=True
  - Nhánh 'upgradable' (355-378) tìm BẤT KỲ ShareLink còn sống chứa asset, do người upload tạo, single-item, không mật khẩu, rồi UPDATE thành allowDownload:true + downloadOnlyWhenApproved:false. Nhưng createShareLink mặc địn
- **[P3-014] (Low) TOCTOU hạn mức tạo Workspace/Profile — count-then-create không nguyên tử, vượt trần khi gọi đồng thời** — `src/actions/workspace-actions.ts:45` · reachable=True
  - Kiểm-tra-rồi-hành-động (check-then-act) trên bộ đếm nằm ngoài giao dịch: N request đồng thời của cùng một user đều đọc ownedCount=9 (hoặc profile count=4), tất cả vượt qua guard và cùng tạo → số workspace/profile vượt tr
- **[P3-015] (Low) dangerouslySetInnerHTML render form.notes KHÔNG sanitize trong AddTaskModal (bất nhất với 3 chỗ render notes khác)** — `src/components/dashboard/AddTaskModal.tsx:1438` · reachable=False
  - form.notes render thô. Đây là input của chính admin trong wizard nên là self-XSS; chỉ trở thành cross-user nếu form.notes được seed từ nguồn không tin cậy — nhưng đường intake client-request đã strip tag qua sanitizeClie
- **[P3-016] (Info) getWorkspacesForProfile: liệt kê workspace của BẤT KỲ profileId nào chỉ với một session bất kỳ (thiếu authz theo ProfileAccess) — hiện reachable=false vì không Client Component nào gọi (bị DCE khỏi manifest)** — `src/actions/workspace-actions.ts:134` · reachable=False
  - Latent IDOR chéo-tenant: nếu được đưa vào action manifest, bất kỳ user đăng nhập (kể cả CLIENT) truyền profileId tùy ý sẽ đọc được tên/mô tả toàn bộ workspace của tenant khác. Grep toàn repo (src/**) cho thấy KHÔNG có ca
- **[P3-017] (Info) No dedicated Taint/injection dataflow lens (L3-Taint) ever ran — SSTI/XSS/zip-slip sinks D1 flagged remain unverified end-to-end** — `src/app/api/review/download-zip/route.ts:51` · reachable=False
  - Injection-class coverage is incidental (HT-008 new Function, HT-020 svg XSS came from Component/EntryPoint lenses), not from a systematic source->sink dataflow pass. The XSS/zip-slip sinks above were not traced.
- **[P3-018] (Info) COVERAGE LEDGER is 100% empty (all cells '-') — exit criterion G2 cannot be demonstrated** — `docs/security-audit/AUDIT_STATE.md:67` · reachable=False
  - Coverage is narrated in the PASS-HISTORY table but never recorded per-file. There is no way to distinguish 'scanned, clean' from 'never opened' for any file — e.g. bulk-task-actions.ts (7 bulk mutators), member-actions.t
- **[P3-019] (Info) LiveKit room-token grant path (D1 #8), calendar-webhook stub (D34/D56), and website/ package have no closing finding or ledger row** — `src/lib/integration-tokens.ts:1` · reachable=False
  - If a LiveKit token endpoint is wired without room==workspace binding, any authed user could mint a token for an arbitrary room (cross-tenant AV eavesdrop). If unwired, that must be recorded so it cannot silently activate

## ── PASS 4 (Lens-4 GapClosure: mcp-server / electron / infra) bổ sung ──

- **P4-005 MCP delete_task hard-delete** — FALSE_POSITIVE→Info: thực tế guard đủ / không như mô tả.
- **P4-007 electron-store encryptionKey hardcode** — Low (obfuscation-only, không phải secret thật).
- **P4-008 BrowserWindow thiếu will-navigate/setWindowOpenHandler** — Low (defense-in-depth cho P4-002/003).
- **P4-011 zip-slip** — TRÙNG P4-010 (=HT của zip-slip).

### Low/Info + GAP-CLASS còn lại (RT8/G8 critic nêu)
- **[P4-013] (Low) bulk_update_details & bulk_update_status KHÔNG giới hạn số lượng taskIds (bulk_assign giới hạn 50) — mỗi phần tử là 1 round-trip validateWorkspaceAccess tuần tự** — `mcp-server/src/tools/bulk-ops.ts:18`
  - Không có trần kích thước mảng và không gộp transaction; N phần tử = ~3N truy vấn tuần tự lên DB prod dùng chung với web app.
- **[P4-014] (Low) Artifact desktop không ký số + luồng auto-update chỉ là placeholder (không verify chữ ký update)** — `electron/builder.config.js:102`
  - Installer NSIS + exe không ký → người dùng không thể xác minh tính toàn vẹn/nguồn gốc; nếu sau này bật electron-updater mà vẫn không ký + không verify chữ ký, sẽ mở đường cho MITM đẩy update độc. Hiện
- **[P4-015] (Low) renderStatusBadge nội suy raw task-status vào HTML email không escape (defense-in-depth)** — `src/lib/notification-emails/shared/statusMap.ts:46`
  - Nhánh unknown-status của getStatusInfo dùng nguyên chuỗi status làm label và renderStatusBadge nhúng nó vào HTML email không escape. Nếu một chuỗi status tùy ý chứa HTML (vd `</span><img src=x onerror
- **[P4-016] (Low) calendar-sync.generateAuthUrl dùng state = userId thô, không có CSRF nonce (OAuth login/link CSRF + lộ userId)** — `src/lib/calendar-sync.ts:17`
  - OAuth state phải là token ngẫu nhiên, một lần, gắn với session người dùng để chống CSRF ở bước callback. Dùng userId thô nghĩa là: (1) không chống được account-linking CSRF (attacker ép victim liên kế
- **[P4-017] (Low) invoice-generator tải + thực thi binary Chromium từ GitHub release lúc runtime, không kiểm tra integrity** — `src/lib/invoice-generator.ts:220`
  - Binary thực thi được kéo từ nguồn ngoài lúc runtime, không có checksum/pin nội dung (chỉ pin theo tag version — tag GitHub có thể bị di dời/ghi đè). Nếu release bị chiếm hoặc URL bị chuyển hướng (DNS/
- **[P4-018] (Info) LiveKit server SDK được khai báo dependency + CSP mở kết nối tới livekit.cloud nhưng KHÔNG có endpoint mint room token nào — bề mặt nghe lén call không tồn tại trong code (kết luận âm tính)** — `package.json:93`
  - Tôi grep toàn repo (case-insensitive) cho `AccessToken`, `VideoGrant`, `addGrant`, `toJwt`, `RoomServiceClient`, `LIVEKIT_API`, và mọi import `livekit-server-sdk`/`livekit-client`/`@livekit` trong src
- **[P4-019] (Info) Microsite hoàn toàn tĩnh — KHÔNG có backend/secret/form/endpoint nào rò rỉ (kết luận xác nhận)** — `website/src/main.js:1`
  - Không có bề mặt tấn công động: không nơi nhận input người dùng, không gửi dữ liệu đi đâu, không key/secret nào được nhúng client-side.
- **[P4-020] (Info) Không có Content-Security-Policy / security headers cho microsite (không có file cấu hình host)** — `website/index.html:40`
  - Thiếu CSP / X-Content-Type-Options / Referrer-Policy ở tầng phản hồi. Vì site thuần tĩnh không nội dung do người dùng sinh ra nên không có sink XSS, nhưng defense-in-depth vẫn nên có header.
- **[P4-021] (Info) package.json khai báo gsap + lenis là dependency runtime nhưng src/ không hề import → bề mặt supply-chain thừa** — `website/package.json:12`
  - Dependency được cài mà không dùng làm phình lockfile và mở rộng bề mặt supply-chain (postinstall, npm audit noise) một cách vô ích; dễ gây hiểu nhầm rằng landing dùng GSAP/Lenis (README/skill mô tả st
- **[P4-022] (Info) Subject email nội suy raw user-data (taskTitle/brand/inviterName/workspaceName) — header-injection defense-in-depth** — `src/lib/notification-emails/templates/taskAssigned.ts:63`
  - Subject nhận raw taskTitle/brand/tên profile/tên workspace do người dùng đặt. Nếu lớp gửi mail nối chuỗi này vào header SMTP thô, ký tự CR/LF trong tiêu đề có thể chèn header (Bcc/Reply-To) hoặc tách 
- **[P4-023] (Info) computeWorkspaceFinance: doanh thu 'thực tế' đếm cả task đã lưu trữ trong khi 'dự kiến' loại chúng → lệch báo cáo tiền** — `src/lib/finance-helpers.ts:64`
  - Hai tập không nhất quán: lưu trữ một task đã hoàn tất làm nó biến mất khỏi doanh thu 'dự kiến' nhưng vẫn tính vào doanh thu 'thực tế'; kéo theo pendingCount = allTasks.length - completedTasks.length c
- **[P4-024] (Info) GAP CLASS: mcp-server/ là bề mặt GHI THỨ HAI vào cùng prod DB nhưng chưa có lens riêng kiểm PARITY guard nghiệp vụ (FSM / PayrollLock / salary-terminal)** — `mcp-server/src/services/status-service.ts:68`
  - MCP có thể set task→'Hoàn tất' (kích hoạt salaryCompleted) và các mutation khác mà không đi qua H3 (admin-only terminal), PayrollLock, hay FSM STATUS_TRANSITIONS như web. Nếu sau này MCP phục vụ per-u
- **[P4-025] (Info) GAP CLASS: Inngest/background-job + webhook-signature authz chưa chạy thành pass riêng; INNGEST_SIGNING_KEY vắng mặt trong env.ts** — `src/app/api/inngest/route.ts:11`
  - Không có lens nào kiểm hệ thống lớp background-job/webhook: (1) /api/inngest có thực sự bắt buộc chữ ký ký ở prod không; (2) các webhook (calendar unauth — P1-035/041, mux) verify ra sao. Class này ch
- **[P4-026] (Info) GAP CLASS: chưa có lens Dependency/SCA + rò secret vào client-bundle (NEXT_PUBLIC_* / output standalone)** — `src/lib/storage.ts:28`
  - Hai class thiếu pass riêng: phân tích thành phần phụ thuộc (npm audit / lockfile CVE) và rà secret client-exposure. HT-029 (electron .env) cho thấy standalone-copy là điểm rò thật; chưa quét toàn diện

## ── PASS 5 (Lens-5 Untested-class) + PASS 6 (MCP-parity sweep + triage) ──

> Sau triage độc lập (verifier ≠ finder), **KHÔNG có finding C/H/M mới nào sống sót** — mọi thứ hạ Low/Info hoặc FALSE_POSITIVE. Đây là bằng chứng bão hoà (G1).

### FALSE_POSITIVE (an toàn thật — ghi lại để khỏi báo lại)
- **[P5-001] (FALSE_POSITIVE→Info) "MCP updateTaskStatus thiếu PayrollLock guard"** — `mcp-server/src/services/status-service.ts:68`
  - Quan sát thô đúng (BLOCKED_TRANSITIONS không chặn 'Hoàn tất'→'Revision') NHƯNG **không có gap parity**: web cũng KHÔNG có PayrollLock guard trên đổi status (FSM đã tắt — `fsm-config.ts:124` luôn trả valid; guard status duy nhất là H3 chỉ chặn NON-admin). MCP chạy service-account = admin-tương-đương, nên admin-trên-web làm y hệt. PayrollLock guard CHỈ ở `revertPayment` (xoá bản ghi Payroll — thao tác khác). Snapshot lương (`MonthlyBonus`/`Payroll`) bất biến; flip status LIVE không hồi tố. **Hướng thiệt hại còn NGƯỢC** (rời 'Hoàn tất' làm GIẢM doanh thu hoàn tất). ⇒ Không có đường khai thác tài chính.

### Low (defense-in-depth / parity — chấp nhận rủi ro hoặc sửa khi tiện)
- **[P5-002] (Low, DUP của P4-024 + web P1-022) MCP bulk_update_details/updateTaskDetails thiếu PAID-payroll lock** — `mcp-server/src/services/task-service.ts:242`
  - CONFIRMED về code: ghi đè jobPriceUSD/value/wageVND/profitVND không kiểm task thuộc kỳ Payroll đã `PAID` (web `update-task-details.ts:68-89` CÓ kiểm). Nhưng actor = service-account cấp profile (admin do chủ dự án kiểm soát), không leo thang từ editor; cùng defect web đã chấm Low. Instance cụ thể của gap-class MCP-parity (P4-024).
- **[P5-003] (Low) MCP mutation không ghi AuditLog** — `mcp-server/src/services/status-service.ts:97`
  - CONFIRMED: `updateTaskStatus` + `updateTaskDetails` đổi status/tiền nhưng không tạo AuditLog; `get_status_history` đọc `auditLog` action `task.*` nên trả rỗng cho mọi mutation qua MCP. Thuần observability/non-repudiation — không leo thang, không cross-tenant, không hỏng data.
- **[P5-004] (Low, DUP của P4-007) electron-store encryptionKey hardcode `'hustly-tasker-desktop-v1'`** — `electron/main/env-manager.ts:24`
  - CONFIRMED, tác động thật (lộ JWT_SECRET→forge session, DATABASE_URL→DB prod) NHƯNG cần AV:Local (đọc filesystem victim); secret do user tự nhập qua setup-wizard, không bake trong binary phát tán. Obfuscation-only đúng như bản chất electron-store. Đã có ở P4-007.
- **[P5-005] (Low, reachable=false) Thiếu env-guard fail-closed cho Inngest signing** — `src/app/api/inngest/route.ts:11`
  - CONFIRMED kỹ thuật: `INNGEST_DEV=1` ở prod → mode='dev' → bỏ qua xác thực chữ ký → POST giả invoke `review-janitor` (xoá cứng Mux+R2+DB trash>30 ngày). NHƯNG mặc định = cloud (an toàn); `.env`/`.env.example` KHÔNG set `INNGEST_DEV` ở đâu → tiền đề khai thác VẮNG. Khuyến nghị: thêm `INNGEST_SIGNING_KEY` vào `env.ts` + chặn `INNGEST_DEV` ở prod (fail-closed như JWT_SECRET).
- ~~**[P6-SWEEP-1] (Low) MCP assign/bulk_assign/claim bỏ guard rank-D red-card**~~ — **VÔ HIỆU 2026-07-31.**
  - Phát hiện gốc: web chặn giao task cho editor "thẻ đỏ" (rank-D), MCP không có → lệch luật nghiệp vụ.
  - Đã được vá, rồi **cả luật lẫn bản vá bị gỡ bỏ** theo quyết định của chủ dự án: Rank D không còn
    chặn giao việc ở bất kỳ đâu. Không còn parity nào để giữ. **Đừng cắm lại guard này.**
- **[P6-SWEEP-2] (Low) MCP ghi task không có version-predicate (mất optimistic-lock)** — `mcp-server/src/services/status-service.ts:97`
  - Web dùng `updateMany where {version}` để chặn lost-update; MCP `update({version:{increment:1}})` không có điều kiện version → 2 đường ghi prod (web+MCP) đồng thời có thể clobber âm thầm. Latent.

### ÂM TÍNH có bằng chứng (đóng class — dùng cho FINAL_REPORT)
- **SQLi**: 16 call-site `$queryRaw/$executeRaw` đều `Prisma.sql`/`Prisma.join` tham số hoá; 0 `queryRawUnsafe`. KHÔNG reachable. (L5-6, folders.ts:119/713, member-actions.ts:1217/1291, comments.ts:530/539, rate-limit-db.ts:25)
- **Client-bundle secret**: chỉ `NEXT_PUBLIC_*` công khai đúng ý định; không rò secret server. (notification-broadcast.ts:9)
- **Prototype-pollution / mass-assign-JSON**: không có sink `deepMerge`/`Object.assign`/`__proto__` trong `src/actions` (đường raw-spread duy nhất là HT-007 đã báo).
- **Server-Action CSRF**: không nới `serverActions.allowedOrigins` → giữ Origin-check mặc định Next 15/16.
- **MCP READ-surface** (query-service.ts getWorkspaceStats/listUsers/searchTasks/getDashboardSummary): đều qua `validateWorkspaceAccess(wsId)` enforce `ws.profileId===ctx.profileId` — scoping read=write đồng nhất; jobPriceUSD chỉ phơi cho service-account admin cấp profile (admin-xem-data-admin), không rò cho staff non-admin.
