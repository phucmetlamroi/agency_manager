# HustlyTasker — System Model (Phase 0 artifact)

> Generated 2026-06-05 against branch `claude/cranky-austin` (head `ab51c54`) for
> the Discord-benchmarked E2E test playbook. The artifact answers the playbook's
> PASS criterion for Phase 0: "list every model, route, server action with its
> auth/permission status, and explicitly flag any server action lacking an auth
> or permission check (these become Phase 6 targets)."

## 1. Stack

| Layer | Version (from `package.json`) |
|---|---|
| Next.js | **16.1.6** (App Router, Turbopack dev) |
| React | **19.2.3** |
| Prisma ORM | **5.22** |
| Database | Neon Postgres (production) / Neon test branch (E2E) |
| Realtime | Supabase Realtime Broadcast — topic `channel:{channelId}` |
| Voice/Video | LiveKit (`livekit-client`, server-minted JWTs) |
| Rich text | Tiptap v3 (wiki) — sanitized server-side via `isomorphic-dompurify@3.0.0-rc.2` |
| Test runner | `@playwright/test`, `@axe-core/playwright` |
| Notes | NOT installed: Pa11y, k6 (playbook Phase 7 + 9 dependencies missing) |

## 2. Tooling detection (Phase 2 gating)

| Tool | Status | Notes |
|---|---|---|
| Playwright | ✅ installed + 30+ specs under `e2e/` | Multi-context realtime project configured (`playwright.config.ts:74-80`) |
| @axe-core/playwright | ✅ installed | **No specs actually call `injectAxe`/`checkA11y` yet** — Phase 9 not started |
| Pa11y | ❌ missing | Phase 9 requires a 2nd a11y engine |
| k6 | ❌ missing | Phase 7 load suite has no runner |
| dompurify (server) | ✅ wired in `src/actions/wiki-actions.ts:3` | Used in wiki save path |

## 3. Prisma models — chat surface

| Model | File:line | Purpose / key fields |
|---|---|---|
| `Workspace` | `prisma/schema.prisma:55` | multi-tenant scope, `profileId` FK |
| `WorkspaceMember` | `:108` | `role` (OWNER/ADMIN/MEMBER) — `verifyWorkspaceAccess` source |
| `User` | `:123` | `clientId Int?` FK (CLIENT portal users) |
| `ProfileAccess` | `:245` | `role ProfileRole` — OWNER/ADMIN/USER/CLIENT/GUEST |
| `Channel` | `:1215` | `type TEXT|FORUM|WIKI|TASK`, `visibility`, `postPolicy`, `slowModeSeconds`, `createdById`, `clientId Int?` |
| `Category` | `:1201` | container for ordered channels in sidebar |
| `Message` | `:1251` | `content`, `parentId` (thread), `replyCount`, `pinnedAt`, `pinnedById`, `editedAt`, `deletedAt` (soft delete) |
| `Reaction` | `:1283` | unique `(messageId, userId, emoji)` |
| `Mention` | `:1299` | per-mention row for @notification fan-out |
| `Attachment` | `:1424` | `mimeType`, `sizeBytes`, `url` (Vercel Blob) |
| `LinkPreview` | `:1383` | **NEW** OG card cache (just shipped `ChatP3-3` / `ab51c54`) |
| `ChannelMember` | `:1314` | per-channel role (MEMBER/MODERATOR), `muted` |
| `CustomRole` | `:1335` | workspace-wide role (Phase 2) |
| `CustomRoleMember` | `:1350` | M:N user ↔ role |
| `ChannelOverwrite` | `:1367` | per-channel ALLOW/DENY × VIEW/POST/MANAGE |
| `WikiPage` | `:1399` | Tiptap document tree (`parentId`, soft delete) |
| `Notification` | `:989` | in-app notifications + broadcast |

## 4. Routes (App Router)

| Route | Notes |
|---|---|
| `/login`, `/signup`, `/forgot-password` | Public |
| `/[workspaceId]/hub` | **Unified Chat surface** (TEXT/FORUM/WIKI in one shell — `src/app/[workspaceId]/hub/page.tsx`) |
| `/[workspaceId]/dashboard`, `/[workspaceId]/admin/*` | Internal staff surfaces — `verifyWorkspaceAccess` |
| `/[workspaceId]/admin/wiki` | Legacy wiki route — kept alive after merge, redirects via nav |
| `/portal/[locale]/[workspaceId]` | Client portal — `getClientSession()` gate |
| `/portal/[locale]/[workspaceId]/tasks`, `/invoices` | Portal data surfaces |
| `/api/auth/google/{authorize,callback}` | OAuth |
| `/api/auth/{logout,reset-password,migrate-email,verify-email,verify-otp,signup,forgot-password,role}` | Auth API |
| `/api/livekit/{token,active}` | LiveKit JWT minting + active-call enumeration |
| `/api/integrations/{dropbox,google-drive}/{authorize,callback}` | OAuth |
| `/api/integrations/scan-folder` | Velox classifier |
| `/api/cron/*` | Cron — protected by `Authorization: Bearer ${CRON_SECRET}` |
| `/api/notifications/unsubscribe` | Email unsubscribe |

## 5. Server actions — chat surface auth/permission matrix

> Every chat action goes through `authorizeChannel(workspaceId, channelId, action)`
> from `src/lib/channel-permissions.ts:136`, which is layered:
> 1. `verifyWorkspaceAccess('MEMBER')` — BOLA/IDOR gate (`src/lib/security.ts:38`)
> 2. Channel-scope lookup by `(id, workspaceId)`
> 3. Per-channel `ChannelMember` role
> 4. `ChannelOverwrite` ALLOW/DENY resolution (`applyChannelOverwrites`, `:87`)
>
> `verifyWorkspaceAccess` **excludes the CLIENT role** at `:109` — portal users
> can never enter the staff path. CLIENT path is **separate**: `authorizeClientChannel`
> in `client-portal-actions.ts:730`.

### 5.1 `src/actions/message-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `getMessages` | 197 | `authorizeChannel(_, _, 'VIEW')` :202 | Cursor pagination |
| `sendMessage` | 219 | `authorizeChannel('POST')` :228 + `checkChatWriteLimit('sendMessage')` :238 (30/10s) | Server-side rate limit |
| `editMessage` | 374 | `authorizeChannel('VIEW')` :390 + author/MOD/owner check :395 + `checkChatWriteLimit('editMessage')` :399 (30/min) | **CLEARS + re-unfurls LinkPreview** (ChatP3-3) |
| `deleteMessage` | 421 | `authorizeChannel('VIEW')` :434 + author/MOD/owner check :430 | Soft delete |
| `togglePinMessage` | 452 | `authorizeChannel('MANAGE')` :464 | No god-mode for workspace admin |
| `getPinnedMessages` | 479 | `authorizeChannel('VIEW')` :481 | |
| `getThreadReplies` | 495 | `authorizeChannel('VIEW')` :503 | |

### 5.2 `src/actions/channel-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `getHubData` | 69 | `verifyWorkspaceAccess('MEMBER')` :75 + `visibleChannelWhere(userId)` :87 | Sidebar list — never leaks non-member channels |
| `createCategory` | 96 | `verifyWorkspaceAccess('MEMBER')` :97 + `hasAtLeastRole(_, 'ADMIN')` :98 | Admin gate |
| `createChannel` | 114 | `verifyWorkspaceAccess('MEMBER')` :124 + `hasAtLeastRole(_, 'ADMIN')` | Admin gate |
| `renameChannel` | 161 | `authorizeChannel('MANAGE')` :163 | |
| `deleteChannel` | 176 | `authorizeChannel('MANAGE')` :178 | |
| `getOrCreateTaskChannel` | 194 | `verifyWorkspaceAccess('MEMBER')` :198 | **R1 race candidate** — see risk matrix |
| `updateChannelSettings` | 288 | `authorizeChannel('MANAGE')` :294 | |
| `getChannelAccess` | 314 | `authorizeChannel('MANAGE')` :326 | Returns staff + CLIENT options (ChatP2-5) |
| `setChannelMembers` | 369 | `authorizeChannel('MANAGE')` :372 | CLIENTs restricted to TEXT (ChatP2-5) |
| `getMyChannelMute` | 439 | `verifyWorkspaceAccess('MEMBER')` :443 | |
| `setChannelMuted` | 451 | `verifyWorkspaceAccess('MEMBER')` :456 | |
| `getMyChannelManage` | 469 | `authorizeChannel('MANAGE')` :474 (boolean) | UI gear visibility |
| `getChannelMembers` | 486 | `authorizeChannel('VIEW')` :491 | @-mention autocomplete pool |
| `markChannelRead` | 510 | `authorizeChannel('VIEW')` :515 | Unread badge clear |
| `getUnreadCounts` | 531 | `verifyWorkspaceAccess('MEMBER')` :533 | |
| `getChannelOverwrites` | 569 | `authorizeChannel('MANAGE')` :577 | Phase 2 roles UI |
| `setChannelOverwrite` | 601 | `authorizeChannel('MANAGE')` :610 | Phase 2 roles UI |

### 5.3 `src/actions/wiki-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `getWikiTree` | 59 | per-channel `authorizeChannel('VIEW')` when `channelId` set; else `verifyWorkspaceAccess('MEMBER')` | |
| `getWikiPage` | 77 | same dual gate | |
| `createWikiPage` | 92 | same dual gate (`POST` action) | HTML sanitized via DOMPurify before insert |
| `updateWikiPage` | 143 | same dual gate (`POST`) + `checkChatWriteLimit('wikiSave')` (60/min) | HTML sanitized |
| `deleteWikiPage` | 170 | same dual gate (`MANAGE`) | Soft delete — cascades to children (R9 candidate) |

### 5.4 `src/actions/reaction-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `toggleReaction` | 24 | `authorizeChannel('POST')` + `checkChatWriteLimit('reaction')` (60/10s) | Unique `(messageId, userId, emoji)` (R15) |

### 5.5 `src/actions/upload-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `uploadChatAttachment` | 323 | `authorizeChannel('POST')` | 10MB cap, 10 files |
| `uploadAvatar` | 120 | self-only | |
| `uploadPaymentQr` | 55 | self-only | |
| `uploadProfileBanner` | 208 | profile OWNER | |
| `uploadProfileLogo` | 258 | profile OWNER | |

### 5.6 `src/actions/notification-actions.ts`

| Action | Gate | Notes |
|---|---|---|
| `createNotificationInternal` (`createAndBroadcastNotifications`) | **no caller-facing gate** — internal helper | Always invoked from another gated action |
| `getMyNotifications`, `markRead`, `markAllRead` | `getSession()` only | self-scoped (no IDOR risk) |

### 5.7 `src/actions/client-portal-actions.ts` (CLIENT path)

| Action | line | Gate | Notes |
|---|---|---|---|
| `getPortalUserId` | 43 | profile-scoped CLIENT `ProfileAccess` | |
| `getClientTasks`, `getClientProjects`, `getClientInvoices` | 178, 245, 272 | `getClientSession()` + `getRelatedClientIds()` scope | |
| `submitTaskRating` | 305 | task-ownership check :316 | |
| `getOrCreateClientChannelAsClient` | 754 | `getClientSession()` | Returns default channel + any TEXT channel the client was invited to (ChatP2-5) |
| `getClientMessages` | 829 | `authorizeClientChannel` :730 — clientId match OR ChannelMember row, TEXT-only | |
| `sendClientMessage` | 846 | same | 4000-char cap, notification fan-out |
| `approveDeliverable`, `requestDeliverableChanges` | 498, 558 | task-ownership check | |

### 5.8 `src/actions/member-actions.ts`

| Action | line | Gate | Notes |
|---|---|---|---|
| `inviteToWorkspace` | 277 | `verifyWorkspaceAccess` + role check | |
| `changeWorkspaceMemberRole` | 907 | OWNER only | |
| `removeWorkspaceMember` | 985 | OWNER/ADMIN | |
| `acceptWorkspaceInvitation` | 619 | token-based | |
| `inviteClientToProfile` | 528 | OWNER/ADMIN | Creates `ProfileAccess(role=CLIENT)` |

## 6. Realtime infrastructure

| Concern | File:line |
|---|---|
| Supabase channel broadcast | `src/lib/notification-broadcast.ts` — `broadcastToChannel` + 3s `AbortController` timeout (Phase 6 hardening) |
| Channel topic | `getChannelBroadcastTopic(id)` = `channel:{id}` (`src/lib/chat-channels.ts:26`) |
| Thread topic | `getThreadBroadcastTopic(id)` = `thread:{id}` (`:31`) |
| Event keys | `CHAT_EVENTS` (`src/lib/chat-channels.ts:8-21`) — MESSAGE_NEW/EDIT/DELETE, REACTION, PIN, THREAD_REPLY, CALL_STARTED/ENDED, TYPING |
| Client subscribe hook | `src/hooks/useSupabaseChannel.ts` |
| Presence hook | `src/hooks/usePresence.ts` |
| **15s polling fallback** | `src/components/hub/ChannelView.tsx:165` (every 15s if doc visible) |
| Self-echo dedupe | by message id in `mergeNew` (`ChannelView.tsx` + portal `MessageModal.tsx:26`) |

## 7. LiveKit surface

| Concern | File |
|---|---|
| Token mint | `src/app/api/livekit/token/route.ts` — JWT signed server-side |
| Room enumeration | `src/app/api/livekit/active/route.ts` |
| Client modal | `src/components/hub/CallRoomModal.tsx` — dynamic import (~3MB SDK) |
| Notes | Default LiveKit token TTL is **6 hours** — playbook recommends shortening (Phase 6O), not yet implemented |

## 8. Tiptap + sanitization

| Concern | Where |
|---|---|
| Wiki editor | `src/components/hub/WikiClient.tsx` — Tiptap config there |
| Sanitization (server-side) | `src/actions/wiki-actions.ts:3-25` — `isomorphic-dompurify` sanitize on every save |
| Tiptap Link safety | `Link.configure({ HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } })` (audited Phase 6 hardening) |
| Chat composer | Plain textarea (`ChannelView.tsx`) — no HTML allowed |
| Link unfurl SSRF guard | `src/lib/link-unfurl.ts:62-103` — dns lookup + private-IP block + port allowlist + 2MB body cap (ChatP3-3 / `ab51c54`) |

## 9. Rate limits (production)

`src/lib/chat-rate-limit.ts:17-20` (in-memory token bucket via `rateLimit` lib):
- `sendMessage` — **30 msgs / 10s** per user
- `editMessage` — **30 edits / minute** per user
- `reaction` — **60 toggles / 10s** per user
- `wikiSave` — **60 autosaves / minute** per page

> Compare to Discord reference (50 req/s global, 10k invalid/10min IP-ban). HustlyTasker
> is **stricter on per-action** but has **no global per-IP cap** — Phase 6 candidate.

## 10. Flagged for Phase 6

> Actions missing or thin on explicit auth/permission per playbook P0.8 criterion.
> All are candidates for Phase 6 security probes.

| Action | Concern |
|---|---|
| `getOrCreateTaskChannel` (`channel-actions.ts:194`) | Race-condition: 2 concurrent opens — relies on unique `taskId` index; needs **R1 probe** |
| `createNotificationInternal` (`notification-actions.ts:11`) | Internal-only — should never be called from a route; verify call sites |
| All `/api/auth/*` `POST` routes | Already audited in Phase 1 prior work but not re-checked under playbook lens |
| LiveKit `/api/livekit/token` | TTL is default 6h — Phase 6O recommends short TTL; **verify HS256 secret hygiene + room+identity scope** |
| Link unfurl `unfurlMessage` | New code (ChatP3-3) — SSRF guard added but **untested under E2E** |
| `wiki-actions.updateWikiPage` | Sanitization via DOMPurify — verify it blocks `javascript:` + `<svg onload>` server-side (Phase 6A) |

## 11. Open parity gaps vs playbook (informational)

| Gap | Playbook section | Action |
|---|---|---|
| No `data-testid` attributes across components | P3 generally | Phase 3 specs use role/text — will keep |
| Edit-message UI present, delete present, rename: present | P3B/P3C | Better than playbook expected |
| No DM (Direct Messages) | P11 | Discord parity gap |
| No @everyone/@here | P3D | Discord parity gap |
| No stickers, GIF picker | P11 | Discord parity gap |
| No audit log UI surface | P11 | DB table exists; no UI |
| No stage channels | P11 | Discord parity gap |
| `Channel.type=TASK` channels excluded from sidebar | P3M | Confirmed at `getHubData` `:87` |
