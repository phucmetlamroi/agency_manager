# AUDIT_REPORT — HustlyTasker (web app)

> Rà soát code toàn hệ thống bằng đa-agent + xác minh đối kháng. Đây là review code (đọc+suy luận), không phải QA click tay; phủ rộng nhưng không đảm bảo 100%.

## Vòng 1 — tổng quan
- Lỗi thô: **64** → nghiêm trọng (high/critical/blocker): **27** → **đã xác nhận sau đối kháng: 24** (bác bỏ 3).
- Medium/Low: **37** (ghi nhận, không chặn hội tụ).

## Lỗi ĐÃ XÁC NHẬN (xếp theo mức độ)

### 1. [BLOCKER] toggleTreasurer has ZERO auth — privilege escalation to finance/payroll on any user
- **File:** `src/actions/toggle-treasurer.ts` (6-17) · domain: Server-action authz sweep (src/actions/*.ts) · verify 3/3
- **Tác động:** Any unauthenticated or low-privilege caller can POST to this server action and set isTreasurer on ARBITRARY userId in any workspace. isTreasurer is a privilege flag: verifyActiveSession returns isAdmin:!!dbUser.isTreasurer, and finance/page.tsx grants canViewFinance via !!user.isTreasurer, payroll grants canCalculateBonus via isTreasurer. So flipping it grants cross-workspace access to USD revenue, payroll, and bonus data — a full vertical privilege escalation.
- **Cách sửa:** At top: const access = await verifyWorkspaceAccess(workspaceId,'OWNER') (or profile OWNER check); reject otherwise. Also verify the target userId belongs to the same profile/workspace before mutating, and audit-log the change.

### 2. [BLOCKER] global-settings getFrameAccount/updateFrameAccount: no auth, plaintext shared credential read+write
- **File:** `src/actions/global-settings.ts` (7-57) · domain: Server-action authz sweep (src/actions/*.ts) · verify 3/3
- **Tác động:** Both are exported 'use server' actions = unauthenticated HTTP endpoints. getFrameAccount returns a globally-shared account+password in cleartext to anyone; updateFrameAccount lets anyone overwrite them. Credentials are stored unencrypted in Task.notes_vi (workspaceId:null global row). Unauthenticated credential disclosure + tampering.
- **Cách sửa:** Gate both with verifyActiveSession/verifyWorkspaceAccess at OWNER/ADMIN level (this is a system-wide secret). Encrypt the password at rest instead of storing JSON plaintext in notes_vi; never return the password to clients that don't need it.

### 3. [BLOCKER] createInvoiceRecord & voidInvoice gate on GLOBAL treasurer/admin flag, never verifyWorkspaceAccess → cross-tenant invoice creation/void
- **File:** `src/actions/invoice-actions.ts` (290-294, 448-453) · domain: Finance — invoice + payment + pricing + exchange rate · verify 3/3
- **Tác động:** A treasurer (or legacy account-role ADMIN) of Workspace A can create invoices, mark tasks INVOICED, deduct/refund client deposits, and VOID invoices in ANY OTHER workspace B simply by passing workspaceId=B. The auth gate is `if (!user || (!user.isSuperAdmin && !user.isTreasurer)) return Unauthorized` — both flags are GLOBAL account flags (auth-guard.ts: isSuperAdmin = user.role==='ADMIN', isTreasurer = user.isTreasurer), not workspace-scoped. getWorkspacePrisma only injects a workspaceId filter; it does NOT verify membership, so the cross-tenant write succeeds.
- **Cách sửa:** Replace the flag-only check with `await verifyWorkspaceAccess(workspaceId, 'ADMIN')` (or MEMBER + treasurer) at the top of createInvoiceRecord and voidInvoice, and use the returned profileId, exactly as the read actions do.

### 4. [BLOCKER] uploadPaymentQr / uploadAvatar: IDOR — any user can overwrite any user's avatar & payment QR
- **File:** `src/actions/upload-actions.ts` (53-116, 118-184) · domain: Schedule + availability + tags + uploads + audit · verify 3/3
- **Tác động:** Both server actions take a client-supplied userId and write to that User row with NO session or ownership check. An authenticated attacker can call uploadAvatar(victimId, ...) or uploadPaymentQr(victimId, bankName, accountNum, ...) to overwrite any user's avatar, and — worse — their payment bank name/account number/QR, redirecting payouts. This is a direct BOLA + financial-fraud vector.
- **Cách sửa:** Add a session check: const session = await getSession(); if (!session?.user?.id || session.user.id !== userId) return { error: 'Forbidden' }. Ignore the client-passed userId entirely and use session.user.id.

### 5. [CRITICAL] JWT_SECRET silently falls back to a hardcoded default in production (forgeable sessions)
- **File:** `src/lib/env.ts` (5, 27-31) · domain: Auth & session · verify 3/3
- **Tác động:** If JWT_SECRET (and POSTGRES_URL aside) is missing/misnamed in the production env, the app does NOT fail to boot — env.JWT_SECRET resolves to the public, source-controlled string "temporary-build-secret-key-change-me" and only emits a console.warn. jwt.ts signs/verifies every session cookie with this key (HS256). Anyone who reads this repo can forge a session JWT for {user:{id:<any userId>, role:'ADMIN', sessionVersion:9999,...}} and fully bypass auth / impersonate any account, including TREASURER/OWNER.
- **Cách sửa:** In production, throw (fail closed) when JWT_SECRET is the default or unset, instead of console.warn — e.g. refine the schema to reject the sentinel value when NODE_ENV==='production', or `if (prod && secret===default) throw`. Never allow a deployable build to run on the placeholder secret.

### 6. [CRITICAL] Legacy User.role==='ADMIN' is an unscoped global super-admin for profile selection
- **File:** `src/app/api/profile/select/route.ts` (39) · domain: Multi-tenancy & access control · verify 2/3
- **Tác động:** Despite the codebase-wide claim that the super-admin model was removed (security.ts, profile-actions.ts), this route still grants access to ANY profileId if user.role==='ADMIN', then re-signs the session JWT embedding that profileId. Combined with the layout only checking 'has ProfileAccess to workspace profile', a legacy ADMIN account can pivot into any tenant's profile context. Severity hinges on whether legacy ADMIN rows still exist (sprint-z-verify-rbac.ts:104 flags them as still-present 'legacy super-admin role').
- **Cách sửa:** Remove the user.role==='ADMIN' branch; require a ProfileAccess row (the crossTeamAccess check just below already does this). Decommission any remaining role='ADMIN' accounts.

### 7. [CRITICAL] Impersonation gated only by legacy global ADMIN role with NO target scope — cross-tenant account takeover
- **File:** `src/actions/impersonation-actions.ts` (8-29) · domain: Multi-tenancy & access control · verify 2/3
- **Tác động:** startImpersonation(targetUserId, workspaceId) authorizes solely on session.user.role==='ADMIN' and performs NO check that targetUserId shares a profile/workspace with the actor. targetUserId is an attacker-controllable server-action arg. A legacy ADMIN can impersonate ANY user in ANY tenant; the impersonated session inherits the target's full role (auth.ts:83-91), so impersonating an OWNER/treasurer of another profile yields that user's privileges. No re-validation that target is impersonatable.
- **Cách sửa:** Verify the actor has admin rights in a profile/workspace the target belongs to (e.g. verifyWorkspaceAccess + confirm target is a member of that profile). Forbid impersonating users with equal/higher privilege. Replace the legacy role==='ADMIN' gate with profile-scoped authz.

### 8. [CRITICAL] Task admin actions gate on legacy global super-admin role, never call verifyWorkspaceAccess — cross-tenant mutation by any role='ADMIN' account
- **File:** `src/actions/task-management-actions.ts` (11-32 (deleteTask), 35-78 (updateTask), 81-92 (assignTask); src/actions/task-actions.ts:16-69) · domain: Tasks & workflow · verify 3/3
- **Tác động:** Authz is `getCurrentUser()` (login-only) + `user.isSuperAdmin = (account.role==='ADMIN')`. Per Sprint Z (security.ts:30, scripts/sprint-z-verify-rbac.ts:104) the global super-admin model was REMOVED and `verifyWorkspaceAccess` no longer honors account role='ADMIN'. These task actions never call verifyWorkspaceAccess(workspaceId). A legacy/seeded account with global role='ADMIN' (belonging to ANY profile) passes `isSuperAdmin` and can deleteTask/assignTask/updateTask/updateTaskStatus on ANY workspace's tasks just by supplying its workspaceId — getWorkspacePrisma scopes the row by workspaceId but performs NO membership check on the caller. Cross-tenant data destruction / takeover.
- **Cách sửa:** Replace `getCurrentUser()` + `isSuperAdmin` gate with `verifyWorkspaceAccess(workspaceId, 'ADMIN')` (for delete/assign/admin-update) and `verifyWorkspaceAccess(workspaceId, 'MEMBER')` + assignee-ownership for self-update, exactly as bulk-task-actions.ts already does.

### 9. [CRITICAL] PayrollLock anti-fraud revert guard is dead — confirm/revert use cycle key (0,0), lock lives at real month/year
- **File:** `src/actions/payroll-actions.ts` (143-155 (revertPayment); src/app/[workspaceId]/admin/payroll/page.tsx:162-163; src/components/admin/PayrollCard.tsx:50) · domain: Finance — payroll + bonus · verify 3/3
- **Tác động:** The CRITICAL anti-fraud fix this file documents (block revert after a cycle is locked, so a treasurer can't revert→delete payroll→inflate bonus) NEVER fires. A paid payroll can always be reverted/deleted even when the cycle is locked, re-enabling the exact fraud vector the code claims to close.
- **Cách sửa:** Resolve the real month/year on the server inside confirmPayment/revertPayment via extractPayrollCycle(workspace.name) instead of trusting client-passed month/year; stop hardcoding 0/0 in page.tsx and PayrollCard. Then the lock check operates on the same cycle key calculateMonthlyBonus locks.

### 10. [HIGH] updateTaskDetails: any workspace MEMBER can write productLink/notes_en to tasks they are not assigned to (intra-workspace BOLA)
- **File:** `src/actions/update-task-details.ts` (22-58, 106-109) · domain: Tasks & workflow · verify 3/3
- **Tác động:** Non-admin branch only requires verifyWorkspaceAccess(workspaceId,'MEMBER') and never checks `currentTask.assigneeId === caller.id`. Any member can overwrite the delivery link (productLink) and notes_en of ANY task in the workspace, including tasks assigned to other editors — sabotage / false delivery, and productLink change can trigger the isUserDelivery email/notification path on the next status move.
- **Cách sửa:** In the non-admin branch, fetch the task (already fetched as currentTask) and reject if `currentTask.assigneeId !== access.userId` before applying productLink/notes_en.

### 11. [HIGH] Payroll records stored at fake cycle (0,0) — historical/month reporting broken, prior month overwritten
- **File:** `src/actions/payroll-actions.ts` (35-62 (confirmPayment upsert); page.tsx:162-163) · domain: Finance — payroll + bonus · verify 2/3
- **Tác động:** Every Payroll row is written with month=0/year=0, fully decoupled from the workspace's real cycle. Year-end/per-month payroll history cannot be reconstructed, and because the upsert key is (userId,0,0,workspaceId), if a workspace is ever reused across months each new payment overwrites the previous month's payroll for that user (silent financial data loss).
- **Cách sửa:** Derive month/year server-side from workspace.name (extractPayrollCycle) in confirmPayment rather than from the client, matching the cycle used by bonus calc.

### 12. [HIGH] createInvoiceRecord trusts client-supplied clientDepositDeducted — no validation against actual depositBalance
- **File:** `src/actions/invoice-actions.ts` (349-357) · domain: Finance — invoice + payment + pricing + exchange rate · verify 3/3
- **Tác động:** depositDeducted/clientDepositDeducted, subtotalAmount, taxAmount, totalDue all come straight from the caller and are written verbatim. The deposit decrement `depositBalance: { decrement: data.clientDepositDeducted }` is never bounded by the client's current depositBalance, so a caller can drive depositBalance negative or fabricate a deposit credit that wasn't there, corrupting the finance ledger. None of the money figures are recomputed server-side from task jobPriceUSD.
- **Cách sửa:** Inside the tx, read client.depositBalance, clamp clientDepositDeducted to it (reject if exceeding), and recompute subtotal/tax/totalDue server-side from the selected tasks' jobPriceUSD instead of trusting the payload.

### 13. [HIGH] Double-billing race: UNBILLED check is outside the transaction and updateMany doesn't re-assert invoiceStatus
- **File:** `src/actions/invoice-actions.ts` (296-347) · domain: Finance — invoice + payment + pricing + exchange rate · verify 3/3
- **Tác động:** The guard counts INVOICED tasks BEFORE opening the $transaction, and the in-tx `task.updateMany({ where: { id: { in: taskIds } } })` filters only by id — not by `invoiceStatus: 'UNBILLED'`. Two concurrent createInvoiceRecord calls (or a retry) for the same completed tasks both pass the pre-check, then both create an invoice and overwrite invoiceId, so a task gets billed twice (revenue double-counted / second invoice silently steals the link).
- **Cách sửa:** Move the billed-check inside the tx and make the updateMany conditional: `where: { id: { in: taskIds }, invoiceStatus: 'UNBILLED' }`; if updated count < taskIds length, throw to roll back.

### 14. [HIGH] calculateInvoicePreview has NO auth check — leaks any workspace's task jobPriceUSD totals
- **File:** `src/actions/invoice-actions.ts` (249-269) · domain: Finance — invoice + payment + pricing + exchange rate · verify 3/3
- **Tác động:** This 'use server' action does no verifyWorkspaceAccess and no getCurrentUser. Any authenticated user can pass an arbitrary workspaceId + taskIds and receive a subtotal computed from jobPriceUSD (agency revenue, an admin-only sensitive field per task-sanitize.ts). getWorkspacePrisma filters by workspaceId but does not check the caller is a member, so a non-member/non-admin can enumerate and sum revenue of any workspace's tasks.
- **Cách sửa:** Add `await verifyWorkspaceAccess(workspaceId, 'ADMIN')` (jobPriceUSD is admin-only) at the start, or remove the action if the client computes preview locally.

### 15. [HIGH] CRM client/project mutations have no workspace-access or role check (IDOR + privilege escalation)
- **File:** `src/actions/crm-actions.ts` (73-114, 118-135, 177-202, 272-309, 315-349, 354-371, 378-446) · domain: CRM + clients + share-link + public portal · verify 3/3
- **Tác động:** Every mutating CRM server action (createClient, updateClient, createProject, deleteClient, restoreClient, permanentlyDeleteClient, mergeClientIntoParent, unmergeClient, getClientDetail) is a 'use server' action that can be invoked directly by ANY authenticated user. None of them call verifyWorkspaceAccess (24 other action files do) nor any role predicate. The ONLY scoping is getWorkspacePrisma(workspaceId, sessionProfileId), which confines Client rows to the caller's own profile but enforces NO workspace membership and NO minimum role. Consequences: (a) a profile USER or even a view-only CLIENT-role member can permanently delete / soft-delete / merge / rename any client in their profile — destructive admin-only operations elsewhere are gated to OWNER/ADMIN; (b) a profile ADMIN whose grantedAt cutoff should block older workspaces can still operate on ANY workspace of the profile, bypassing the verifyWorkspaceAccess createdAt>=grantedAt rule; (c) createProject injects the attacker-supplied workspaceId into a new Project with no membership check on that workspace.
- **Cách sửa:** Add `await verifyWorkspaceAccess(workspaceId, 'ADMIN')` (or 'MEMBER' for read-only getClientDetail/getClients) at the top of every action and derive profileId from its return, not from the raw session claim. Destructive ops (permanentlyDeleteClient, deleteClient, merge) should require ADMIN/OWNER.

### 16. [HIGH] pingHeartbeat is an unauthenticated IDOR: any caller can forge presence + session rows for arbitrary userId
- **File:** `src/actions/tracking-actions.ts` (91-136) · domain: Notifications + realtime + cron · verify 3/3
- **Tác động:** The 'use server' action accepts currentUserId from the client (PresenceTracker passes it as a prop) and performs NO getSession() check and NO comparison of currentUserId against the caller's real session. An attacker can call pingHeartbeat('ONLINE', '<any-user-id>') to (a) mark any user as ONLINE/AWAY in the admin live-presence board, and (b) upsert a Session row keyed by their own tracking_session_id cookie but with userId set to the victim, attacker-controlled ipAddress/countryCode/city headers (x-client-ip / x-client-country / x-client-city) — poisoning analytics, geo, and session attribution for any account. No workspace/profile scoping either.
- **Cách sửa:** Derive the user from getSession() on the server; ignore the client-supplied currentUserId (or reject if it != session.user.id). Do not trust x-client-ip/country/city from arbitrary headers unless set by a trusted proxy.

### 17. [HIGH] Per-user realtime channel `user:<id>` is not a private/authorized channel — risk of cross-user notification leak
- **File:** `src/hooks/useSupabaseChannel.ts` (33-39) · domain: Notifications + realtime + cron · verify 3/3
- **Tác động:** Clients subscribe to getUserNotificationChannel(userId) = `user:${userId}` using the public NEXT_PUBLIC_SUPABASE_ANON_KEY, and the channel is created WITHOUT `config: { private: true }`. Server broadcasts notification payloads (title/body, taskId, metadata) to that topic via the REST broadcast API. Unless Supabase Realtime Authorization (RLS on realtime.messages) is enabled for the project, any holder of the anon key (shipped in the client bundle) can `supabase.channel('user:<victimId>').subscribe()` and receive another user's real-time notifications — a cross-user information leak. No `private:true` config and no realtime RLS migration exists anywhere in the repo.
- **Cách sửa:** Mark these channels `config: { private: true }` and add a Supabase Realtime Authorization RLS policy on realtime.messages so a user may only join `user:<theirOwnId>`; or move fan-out to authenticated server-validated postgres_changes. Confirm anon key cannot subscribe to arbitrary user topics.

### 18. [HIGH] getEffectiveAvailability is an unauthenticated server action leaking any user's schedule cross-tenant
- **File:** `src/actions/schedule-actions.ts` (224-258) · domain: Schedule + availability + tags + uploads + audit · verify 3/3
- **Tác động:** Unlike every other action in this file, getEffectiveAvailability performs NO validateAccess/session check. As an exported 'use server' function it is an RPC endpoint callable directly by any client with arbitrary workspaceId/profileId/userId, returning that user's recurring rules and BLOCK/ADD exceptions (incl. reasons). Cross-workspace/cross-profile read leak of schedule data.
- **Cách sửa:** Call await validateAccess(workspaceId, userId, profileId) (or at least verifyWorkspaceAccess MEMBER) at the top, matching the other actions in this file.

### 19. [HIGH] tag-actions: tag queries scoped by userId only on global prisma — cross-workspace tag bleed & broken limit/dup checks
- **File:** `src/actions/tag-actions.ts` (74-83, 105-116, 128-136, 155-161) · domain: Schedule + availability + tags + uploads + audit · verify 3/3
- **Tác động:** TagCategory is workspace+profile scoped (schema), but createTag/updateTag/deleteTag/setTaskTags use the global prisma client and filter by userId ONLY. The MAX_TAGS_PER_USER count and duplicate-name check span ALL workspaces for that user, so a user active in several workspaces gets wrong limits/false 'Tag đã tồn tại'. updateTag/deleteTag locate the tag by id with only a userId ownership check (no workspaceId), letting an admin in workspace A rename/delete their own tag that belongs to workspace B; setTaskTags can attach a tag from another workspace to a task. Tenant isolation for tags is not enforced.
- **Cách sửa:** Add workspaceId (and profileId) to every where clause, or use getWorkspacePrisma(workspaceId, profileId) for TagCategory ops so injection enforces scope consistently.

### 20. [HIGH] Payment (money ledger) has NO foreign keys — orphan-prone, zero referential integrity on financial records
- **File:** `prisma/schema.prisma` (680-696) · domain: Data model integrity (prisma/schema.prisma) · verify 3/3
- **Tác động:** The 'Sổ thu tiền' payment ledger stores clientId/workspaceId/profileId/invoiceId as plain scalars with no `@relation`/FK constraint. Deleting a Workspace, Profile, Client, or Invoice leaves dangling Payment rows pointing at non-existent ids (no Cascade, no SetNull, no Restrict). Money totals can silently reference deleted clients/invoices; a merged client (status='MERGED') keeps its old id on Payment rows and is never remapped (merge-clients-manual.ts remaps task/invoice/project/pricingRule/user/profileAccess but NOT payment), so post-merge the ledger double-counts under both the survivor and the merged duplicate id.
- **Cách sửa:** Add real relations (client/workspace/invoice) with explicit onDelete (Restrict for client/workspace to protect money, SetNull for invoice). At minimum add Payment.clientId remap to the merge script so MERGED ids don't survive in the ledger.

### 21. [MEDIUM] getCurrentUser() does not enforce LOCKED role or sessionVersion — stale/banned sessions can still mutate the account (email migration)
- **File:** `src/lib/auth-guard.ts` (21-46) · domain: Auth & session · verify 3/3
- **Tác động:** getCurrentUser only checks that the user row exists; it ignores role==='LOCKED' and the sessionVersion invalidation mechanism that verifyActiveSession enforces. email-migration-actions.ts (requestEmailMigrationOtp / verifyEmailMigrationOtp) authenticate solely via getCurrentUser, so: (a) a user banned by an admin (role LOCKED) whose 7–30 day cookie is still valid can still drive the flow; (b) after a password reset / 'logout all devices' bumps sessionVersion, the old JWT is meant to be dead but getCurrentUser still accepts it, letting a holder of a stolen pre-reset cookie change the account's email (account-takeover primitive). getCurrentUser is reused broadly, widening the blast radius.
- **Cách sửa:** Make getCurrentUser reject LOCKED accounts and compare JWT sessionVersion against the DB value (reuse verifyActiveSession's logic), so revocation/ban/global-logout propagate to every action that authenticates through it.

### 22. [MEDIUM] FSM transition validation is fully disabled — validateTransition always returns isValid:true, so any status can jump to any status
- **File:** `src/lib/fsm-config.ts` (122-125) · domain: Tasks & workflow · verify 3/3
- **Tác động:** Every FSM guard across updateTaskStatus (task-actions.ts:73) and bulkUpdateTaskStatus (bulk-task-actions.ts:484) is a no-op. A user can force illegal transitions: e.g. assignee can move their own task directly 'Nhận task' → 'Hoàn tất' (skipping work/review), or 'Hoàn tất' → 'Đang thực hiện', bypassing the intended admin-only finish/reject gates encoded in TRANSITIONS. The only remaining guard is the canonical-status check and (for single update) self-ownership. No state-machine integrity.
- **Cách sửa:** Re-enable real transition checks against TRANSITIONS (lookup from→to legality + requiredRole), or if FSM is intentionally dropped, enforce the critical guards explicitly: only ADMIN may set 'Hoàn tất'; assignee may only do Nhận task→Đang thực hiện→Revision. Confirm intent before shipping.

### 23. [MEDIUM] Profile soft-delete has no member/workspace guard — OWNER queues populated tenant for cascade hard-delete
- **File:** `src/actions/profile-actions.ts` (352-388) · domain: Members + profiles + workspaces (invite/accept/role/transfer/soft-delete) · verify 2/3
- **Tác động:** A profile OWNER can soft-delete a profile that still contains many users, workspaces, tasks, invoices and payroll. Unlike the legacy admin-profile-actions.deleteProfile (which refuses if userCount/workspaceCount/taskCount > 0), deleteProfileAction performs an unconditional status='SOFT_DELETED' with hardDeleteAfter = now+30d. After the grace window the documented cron hard-deletes and cascades workspaces/tasks/members, destroying every co-member's data. No confirmation of emptiness, no notification to other members, and other members are not even OWNER so they cannot restore it.
- **Cách sửa:** Before soft-deleting, count active members (ProfileAccess excluding self), workspaces and tasks; refuse or require explicit force-confirm when non-empty, mirroring admin-profile-actions.deleteProfile. Restore should be grantable by any remaining OWNER/ADMIN, and getMyTrashedProfiles already restricts restore to role==='OWNER' — ensure a co-owner exists or notify members.

### 24. [LOW] Workspace layout fails OPEN on cross-profile access mismatch (relies on downstream guard that pages don't call)
- **File:** `src/app/[workspaceId]/layout.tsx` (75-97) · domain: Multi-tenancy & access control · verify 2/3
- **Tác động:** When the active profileId differs from the workspace's profile and the user has NO ProfileAccess to the workspace's profile, the code does NOT redirect — it keeps the user's own profileId and renders, with a comment 'để downstream verifyWorkspaceAccess catch'. But dashboard/page.tsx never calls verifyWorkspaceAccess. The only thing preventing a cross-tenant data render is the dual workspaceId+profileId injection in getWorkspacePrisma (which mismatches and returns empty for profiled rows). Any query path using a bypassed/no-profile model, raw prisma, or a nullable-profileId row is unprotected.
- **Cách sửa:** Fail closed: if workspaceCheck.profileId !== profileId && !xAccess → redirect('/login') (or call canAccessWorkspace/verifyWorkspaceAccess in the layout for every workspace, not just admin subpages).

## Medium / Low (ghi nhận — sẽ xử ở đợt sau)
- [medium] `src/actions/auth-actions.ts` — Login IP rate-limit fails open on Upstash error
- [low] `src/app/api/auth/google/callback/route.ts` — Google OAuth CSRF state compared with non-constant-time !==
- [medium] `src/actions/cross-team-actions.ts` — approveCrossTeamAccess does not verify approver is ADMIN/OWNER of the target profile
- [low] `src/actions/cross-team-actions.ts` — Cross-team ProfileAccess created without explicit role
- [medium] `src/actions/tag-actions.ts` — getTaskTags checks session but not workspace scope (cross-workspace tag read)
- [medium] `src/actions/create-user.ts` — createUser requires only an authenticated profile member — no ADMIN/OWNER role gate
- [low] `src/actions/leaderboard-actions.ts` — refreshLeaderboardAction unauthenticated cache-bust
- [medium] `src/actions/task-management-actions.ts` — assignTask / bulkAssignTasks do not validate that the assignee belongs to the workspace/profile
- [medium] `src/actions/task-actions.ts` — updateTaskStatus optimistic lock is bypassable: omitting currentVersion downgrades to an unconditional updateMany
- [medium] `src/actions/bonus-actions.ts` — calculateMonthlyBonus is non-atomic — bonus/rank creates run outside the $transaction after the lock is set
- [medium] `src/actions/payroll-actions.ts` — confirmPayment trusts client-supplied totalAmount/bonus/baseSalary and never checks PayrollLock
- [low] `src/actions/bonus-actions.ts` — Bonus ranking sort contradicts its documented algorithm (incomeScore/errorRate computed but unused)
- [medium] `src/actions/invoice-actions.ts` — voidInvoice deposit refund is not idempotent — concurrent double-void can double-refund
- [low] `src/lib/exchange-rate.ts` — Exchange rate silently falls back to a hardcoded constant on total source failure
- [low] `src/actions/crm-actions.ts` — getClientDetail ratings use a global, unscoped username→User lookup
- [medium] `src/actions/profile-member-actions.ts` — inviteToProfileAction grants ProfileAccess with no consent and ignores allowExternalInvites
- [medium] `src/actions/profile-member-actions.ts` — Non-owner ADMIN can mint unlimited new ADMINs via inviteToProfileAction
- [medium] `src/actions/profile-actions.ts` — createProfileForUser rate-limit double-counts memberships, denying legitimate creation
- [medium] `src/actions/member-actions.ts` — acceptWorkspaceInvitation does not refuse legacy account-role CLIENT users → ghost members
- [low] `src/actions/workspace-actions.ts` — deleteWorkspaceAction soft-delete fallback hard-deletes with stale metadata snapshot
- [medium] `src/app/api/integrations/google-drive/authorize/route.ts` — OAuth authorize routes don't verify workspace access — token can be attached to an arbitrary workspace
- [medium] `src/actions/velox-batch-actions.ts` — Batch task create writes per-row clientId with no workspace/profile ownership check (cross-profile reference)
- [low] `src/actions/integration-actions.ts` — refreshTokenIfNeeded has a read-modify-write race; concurrent scans can refresh-token twice and persist a stale token
- [low] `src/app/api/cron/hard-delete-workspaces/route.ts` — Hard-delete crons compare CRON_SECRET with non-constant-time `key !== secret`
- [medium] `src/lib/env.ts` — Unsubscribe token signing key falls back to a public default JWT_SECRET in production (warn-only)
- [low] `src/actions/tracking-actions.ts` — trackEvent stores metadata as a JSON string into a (likely) Json column and has no auth
- [medium] `src/app/api/test-email/route.ts` — test-email diagnostic accepts CRON_SECRET via query string and leaks env-var presence + RESEND_API_KEY prefix; still live in prod
- [low] `src/app/api/webhooks/calendar/route.ts` — Calendar webhook is unauthenticated and parses/logs arbitrary JSON (validation-token reflection)
- [low] `src/app/api/invoices/generate/route.ts` — invoices/generate renders fully client-supplied invoice content with no workspace/profile scoping
- [medium] `src/actions/upload-actions.ts` — Image uploads skip validation when file.type is empty — MIME allowlist bypassable
- [low] `src/actions/availability-actions.ts` — availability read/write actions return raw error.message to client
- [medium] `prisma/schema.prisma` — Role/status fields stored as free-form String instead of enums — enum drift, invalid values writable
- [medium] `prisma/schema.prisma` — Tenancy fields nullable where the app treats them as required — silent cross-tenant fallback risk
- [low] `prisma/schema.prisma` — Rating.taskId @unique blocks re-rating and Rating.workspaceId nullable allows unscoped rating rows
- [low] `src/lib/task-sanitize.ts` — sanitizeTaskForUser is a denylist of 3 fields — any new admin-only money field silently leaks
- [medium] `src/components/mobile/TaskDrawer.tsx` — javascript: URI XSS via task.productLink in mobile TaskDrawer (unguarded href)
- [low] `src/components/dashboard/AddTaskModal.tsx` — Unsanitized TipTap HTML rendered via dangerouslySetInnerHTML in AddTaskModal preview

## Đã kiểm tra → BÁC BỎ (báo động giả)
- Account-global isTreasurer grants admin-panel access to EVERY workspace across ALL profiles (cross-tenant finance leak) (chỉ 1/3 agent cho là thật)
- Client.parent onDelete: Cascade silently over-deletes the entire subsidiary subtree on hard delete (chỉ 0/3 agent cho là thật)
- No unique constraint on Client (profileId, name, parentId) — duplicate canonical clients accumulate (chỉ 1/3 agent cho là thật)

## Độ phủ theo domain
- **Auth & session** — 4 finding. Read: src/lib/auth.ts, jwt.ts, security.ts (verifyWorkspaceAccess + verifyActiveSession), otp.ts, google-auth.ts, env.ts, rate-limit-upstash.ts, auth-guard.ts; src/actions/auth-actions.ts, signup-acti
- **Multi-tenancy & access control** — 6 finding. Read in full: prisma-workspace.ts, security.ts, profile-permissions.ts, workspace-roles.ts, middleware.ts, [workspaceId]/layout.tsx, admin/layout.tsx, api/profile/select/route.ts, profile-actions.ts, 
- **Server-action authz sweep (src/actions/*.ts)** — 5 finding. Read all Explore-flagged actions plus the authz helpers (src/lib/security.ts: verifyWorkspaceAccess, verifyActiveSession). Confirmed the privilege meaning of isTreasurer by tracing admin/finance/page.
- **Tasks & workflow** — 5 finding. Read task-actions.ts, task-management-actions.ts, bulk-task-actions.ts, claim-actions.ts, update-task-details.ts, fsm-config.ts, task-statuses.ts, task-invariants.ts, prisma-workspace.ts, auth-guard.t
- **Finance — payroll + bonus** — 5 finding. Read in full: payroll-actions.ts, bonus-actions.ts, bonus-config-actions.ts, leaderboard-actions.ts, finance-helpers.ts; plus supporting security.ts (verifyWorkspaceAccess), prisma-workspace.ts (works
- **Finance — invoice + payment + pricing + exchange rate** — 6 finding. Read in full: src/actions/invoice-actions.ts, payment-actions.ts, pricing-rule-actions.ts; src/lib/exchange-rate.ts, task-sanitize.ts, invoice-generator.ts; plus src/app/api/invoices/[id]/download/rou
- **CRM + clients + share-link + public portal** — 2 finding. Read share-link-auth.ts, share-portal-actions.ts, share-link-actions.ts, client-dedupe.ts, client-hierarchy.ts, crm-actions.ts, sanitize.ts, profile-permissions.ts, prisma-workspace.ts, security.ts, s
- **Members + profiles + workspaces (invite/accept/role/transfer/soft-delete)** — 6 finding. Read all five target files plus src/lib/security.ts (verifyWorkspaceAccess), src/lib/workspace-guards.ts (ensureNotLastOwner is now a no-op by design), src/lib/profile-permissions.ts, and the relevant
- **Velox + cloud integrations (cloud-scanner, OAuth, token encryption, batch/raw-footage actions)** — 3 finding. Read in full: cloud-scanner.ts, cloud-link-parser.ts, token-encryption.ts, integration-actions.ts, velox-batch-actions.ts, raw-footage-actions.ts, velox-helpers-actions.ts, scan-folder route, both dro
- **Notifications + realtime + cron** — 5 finding. Read all six cron routes (auth-cleanup, check-deadline, cleanup-notifications, hard-delete-profiles, hard-delete-workspaces, send-digest), the unsubscribe route + JWT token verifier, notification-broa
- **Misc API routes (webhooks, invoices, exports, exchange-rate, time, log-client-error, import-jan-2026, test-email, workspace/first)** — 3 finding. Read all 10 assigned routes plus supporting libs (prisma-workspace.ts, security.ts, exchange-rate.ts, profile-routing.ts) and verified the Invoice schema. WELL-GUARDED (no finding): invoices/[id]/down
- **Schedule + availability + tags + uploads + audit** — 5 finding. Read in full: schedule-actions.ts, availability-actions.ts, tag-actions.ts, upload-actions.ts, audit-actions.ts, lib/audit-log.ts; cross-checked prisma-workspace.ts injection logic and schema for Sche
- **Data model integrity (prisma/schema.prisma)** — 6 finding. Read prisma/schema.prisma in full and cross-checked the highest-risk relations against real code: crm-actions.ts (deleteClient/permanentlyDeleteClient + collectClientSubtreeIds), scripts/merge-clients
- **Sensitive-data exposure to client (task/finance serialization to non-admin)** — 1 finding. Traced the non-admin serialization surfaces end-to-end. CLEAN paths (correctly guarded, NOT reported): (1) User dashboard src/app/[workspaceId]/dashboard/page.tsx:133 calls sanitizeTaskListForUser(raw
- **Validation / injection / XSS / redirect** — 2 finding. Reviewed all dangerouslySetInnerHTML sinks: AddTaskModal (raw — flagged, self-XSS low), TaskDetailModal:1349 and TaskDrawer:176 (both DOMPurify-sanitized — safe), LandingPage:233 (static inline script
