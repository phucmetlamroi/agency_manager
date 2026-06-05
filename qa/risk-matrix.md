# HustlyTasker — Risk Matrix R1-R18 (Phase 1 artifact)

> Generated 2026-06-05 against branch `claude/cranky-austin` (head `ab51c54`).
> Format per playbook P1: `{risk, file:line, likelihood H/M/L, impact H/M/L,
> concrete probe, expected safe behavior, mapped phase test ID}`.
>
> "PASS CRITERIA: every risk has a concrete probe mapped to a later phase's test ID."

Legend — **H** High, **M** Medium, **L** Low.
Phase IDs use playbook nomenclature: `P3A`–`P3N` (functional), `P4` (perms), `P5`
(realtime), `P6` (security), `P10` (regression).

---

## R1 — Race: `getOrCreateTaskChannel` double-create

- **File:line**: `src/actions/channel-actions.ts:194`
- **Likelihood**: **M** — only triggers under simultaneous `/task/:id` opens.
- **Impact**: **H** — duplicate TASK channels = duplicate message streams = data drift.
- **Probe** (`P3M-RACE`): in 2 contexts simultaneously call `getOrCreateTaskChannel(workspaceId, taskId)` within < 50ms; query `prisma.channel.count({ where: { taskId } })` → must equal **1**.
- **Expected**: Prisma unique constraint on `taskId` makes the second insert throw `P2002`; the catch block at `:226` re-fetches and returns the same row.
- **Mitigation present**: try/catch race fallback at `channel-actions.ts:225-230`.

## R2 — Auth bypass: server action called without a session

- **File:line**: all `'use server'` actions in `src/actions/*.ts` (~120 actions catalogued in system-model.md §5)
- **Likelihood**: **M** — Next.js Server Actions expose hidden POST endpoints; anyone can POST.
- **Impact**: **C (Critical)** — full BOLA/IDOR if any unguarded action exists.
- **Probe** (`P6D-AUTH`): for every catalogued action, fetch it from an **unauthenticated** browser context (cleared cookies). Expect 401 or `SECURITY_VIOLATION` thrown.
- **Expected**: every chat action calls `verifyWorkspaceAccess()` or `authorizeChannel()` which throws `SECURITY_VIOLATION` if no session.
- **Notes**: spec must include `getOrCreateTaskChannel`, `markChannelRead`, `getUnreadCounts` — these are easy to miss.

## R3 — IDOR: read/write another workspace's resource by ID guessing

- **File:line**: `src/lib/security.ts:38` (`verifyWorkspaceAccess`) + `src/lib/channel-permissions.ts:147-151` (channel lookup scoped by `workspaceId`)
- **Likelihood**: **M** — UUIDs are not enumerable but URL-leak risk exists.
- **Impact**: **C (Critical)** — cross-tenant data leak.
- **Probe** (`P6C-IDOR`): login as MEMBER1; call `getMessages(WORKSPACE_B_ID, CHANNEL_B_ID)` — must reject. Repeat with `togglePinMessage`, `getWikiPage`, `getChannelOverwrites`, `getChannelMembers`, `getPinnedMessages`, `markChannelRead`.
- **Expected**: every action either throws `SECURITY_VIOLATION` (channel lookup scoped to workspaceId returns null) or returns an empty/403 shape.

## R4 — XSS surface (messages, mentions, channel names, wiki, forum, search, filenames)

- **File:line**: 
  - Chat composer: plain text (`ChannelView.tsx`), low risk
  - Wiki HTML: `src/actions/wiki-actions.ts:16` calls `DOMPurify.sanitize` with strict allowlist
  - Tiptap Link: configured `rel='noopener noreferrer'` + `target='_blank'` (Phase 6 prior hardening)
  - Link unfurl: server fetches OG title/description (`src/lib/link-unfurl.ts:226`) — output stored as plain text, **NOT rendered as HTML in `ChannelView.tsx:607-636`** (uses React text nodes — safe)
- **Likelihood**: **M**
- **Impact**: **C (stored XSS)** if wiki sanitization fails.
- **Probe** (`P6A-XSS`): inject the 8 standard payloads (script, img/onerror, javascript: href, iframe, svg/onload, broken-tag, markdown javascript:, data:text/html) into:
  - chat message → assert renders as literal text
  - channel name (createChannel) → assert sidebar shows literal text
  - wiki content (raw POST to `updateWikiPage`, bypassing the Tiptap UI) → assert DB row has scripts stripped; on render, alert never fires
  - forum post title + body
  - search query reflection
  - file name
- **Expected**: zero alert dialogs; sanitized output in DB for wiki path.
- **CVE relevance**: Tiptap Link extension CVE-2025-14284 — `javascript:` URL — Phase 6 specifically asserts this.

## R5 — Slow-mode bypass via thread replies / edits / mentions / rapid resend

- **File:line**: `src/lib/chat-rate-limit.ts:17-20` enforces per-user write limits **but slow-mode itself is per-channel**. Channel `slowModeSeconds` is applied in `sendMessage` (`src/actions/message-actions.ts` — need to verify it gates by `Channel.slowModeSeconds`).
- **Likelihood**: **M**
- **Impact**: **M** — bypassing slow mode is annoying but not catastrophic.
- **Probe** (`P6J-SLOWMODE`):
  1. set channel slow-mode = 30s
  2. send msg A, then attempt: (a) reply in thread, (b) edit msg A 5×, (c) rapid resend (10 calls in 1s), (d) mention spam
  3. each path must respect slow-mode for non-MODERATOR users
- **Expected**: all paths return rate-limit error; MOD bypasses.

## R6 — Permission edge: member-DENY beats role-ALLOW + no god-mode

- **File:line**: `src/lib/channel-permissions.ts:87-112` (`applyChannelOverwrites`)
- **Likelihood**: **L** — well-tested resolver
- **Impact**: **C** — getting this wrong = catastrophic permission leak
- **Probe** (`P4-DENY-WINS`):
  - case A: role ALLOW POST + user DENY POST → `canPost === false`
  - case B: workspace ADMIN + channel DENY VIEW → `canView === false` (HustlyTasker stricter than Discord; admin must NOT bypass)
  - case C: GUEST no overwrite → default-deny
  - case D: MOD can delete others' msgs, MEMBER cannot
  - case E: VIEW denied implicitly denies POST (HustlyTasker semantics — verify)
- **Expected**: 100% match the DENY>ALLOW rule.
- **Notes**: ADMIN-bypasses-DENY = **CRITICAL god-mode finding** per playbook.

## R7 — Realtime ordering under concurrent sends

- **File:line**: Supabase broadcast in `notification-broadcast.ts` (no server-side message ordering); clients order by `createdAt`.
- **Likelihood**: **M** — clock skew + broadcast jitter
- **Impact**: **L** — UX glitch; eventual consistency via 15s poll
- **Probe** (`P5-ORDER`): 3 contexts each send 10 rapid messages; capture each tab's final DOM order; assert **same ordering across all 3 tabs** (by server timestamp).
- **Expected**: identical ordering across tabs; the 15s poll reconciles any tab that missed a broadcast.

## R8 — Optimistic update vs server-truth divergence

- **File:line**: `ChannelView.tsx` (`mergeNew` dedupe) + portal `MessageModal.tsx:26`
- **Likelihood**: **M**
- **Impact**: **M** — duplicate DOM nodes or ghost messages.
- **Probe** (`P5-OPT-CONFLICT`):
  - send while offline (Playwright CDP `Network.emulateNetworkConditions offline=true`) → assert UI shows "queued"/error, NO ghost message
  - reconnect → assert exactly 1 DOM node + 1 DB row
- **Expected**: server truth wins; optimistic local message is replaced/dropped if send failed.

## R9 — Soft-delete cascade: deleting wiki parent orphans children

- **File:line**: `src/actions/wiki-actions.ts:170` (`deleteWikiPage`) — soft delete via `deletedAt`; children NOT cascaded.
- **Likelihood**: **H** — easy to trigger
- **Impact**: **M** — UX confusion (orphan rows visible? hidden?)
- **Probe** (`P3K-ORPHAN`): create parent + child wiki pages; soft-delete parent; assert child either (a) is also hidden in tree, or (b) is recoverable via "Trash" surface; never crashes the tree render.
- **Expected**: documented behavior; no crash; no data loss.

## R10 — Orphan channel (`createdById = null`) rendering/permission behavior

- **File:line**: `src/lib/channel-permissions.ts:52` — `const isOwner = channel.createdById != null && userId === channel.createdById`
- **Likelihood**: **L** — only when the creator account was hard-deleted (`onDelete: SetNull`)
- **Impact**: **M** — channel has no owner → MANAGE only via MODERATOR
- **Probe** (`P10-ORPHAN`): create channel as user X; hard-delete X (`prisma.user.delete`); login as MOD → MANAGE works; login as MEMBER → MANAGE denied; sidebar still renders the channel; no crash on settings modal open.
- **Expected**: safe degradation.

## R11 — Workspace-switch leaks state from prior workspace

- **File:line**: `src/components/hub/HubClient.tsx` (workspace-scoped) + Supabase channel topic `channel:{id}` is global
- **Likelihood**: **M** — Supabase channel subscription must be torn down on workspace switch
- **Impact**: **H** — could show messages from prior workspace = data leak
- **Probe** (`P10-WS-SWITCH`): login as MEMBER1 with access to WS_A + WS_B; open WS_A channel; have MEMBER2 send to WS_A; switch to WS_B; receive should NOT echo into the WS_B UI; channel list in sidebar must be WS_B's only.
- **Expected**: subscription cleanup on `useEffect` unmount + sidebar reload from `getHubData(WS_B)` returns only WS_B channels.

## R12 — Memory leak: Supabase subscriptions not torn down on channel switch

- **File:line**: `src/hooks/useSupabaseChannel.ts` — verify the cleanup function unsubscribes
- **Likelihood**: **M**
- **Impact**: **M** — memory growth on long sessions
- **Probe** (`P7-LEAK`): Playwright switches between 50 channels in one page session; sample JS heap via CDP `HeapProfiler.takeHeapSnapshot`; assert heap does not grow unbounded.
- **Expected**: snapshots after switch 5 vs switch 50 — RSS/JSHeapSize delta < 50MB.

## R13 — Attachment URL forgery / unauthorized access

- **File:line**: `src/actions/upload-actions.ts:323` (`uploadChatAttachment`) + Vercel Blob URLs
- **Likelihood**: **M** — Blob URLs are unguessable per Vercel (cryptographic random) but if logged or shared they're public.
- **Impact**: **H** — file disclosure
- **Probe** (`P6E-FORGE`): get a real attachment URL; have a different user paste it into their browser; assert **served** (Vercel Blob is public-by-token) — record as a documented limitation, OR if signed URL: assert 403.
- **Expected**: documented behavior — Vercel Blob URLs are bearer tokens; recommend rotation/signed URLs for sensitive attachments.

## R14 — Mention spam / mention of user not in channel

- **File:line**: `src/actions/message-actions.ts:108` (`parseMentions`) + `notifyMentions` (later in same file)
- **Likelihood**: **M**
- **Impact**: **M** — notification spam; potential membership disclosure
- **Probe** (`P3D-MENTION-PRIV`):
  - mention a user **not in the channel** → assert: NO notification fires AND the mention does NOT reveal that user's membership (mention rendered as plain text, no autocomplete pre-populated)
  - mention a user 100× in one message → assert: 1 notification (dedupe per-message)
- **Expected**: notification scope restricted to channel members.

## R15 — Reaction unique-constraint violation (double-click race)

- **File:line**: `prisma/schema.prisma:1283` (unique `(messageId, userId, emoji)`) + `src/actions/reaction-actions.ts:24` (`toggleReaction`)
- **Likelihood**: **M** — Playwright double-click is reproducible
- **Impact**: **L** — P2002 leaks via 500; UX glitch
- **Probe** (`P3E-DBL-CLICK`): same user clicks the emoji button 2× in < 50ms; assert exactly 1 reaction row exists; no 500 error surfaces in UI.
- **Expected**: toggle logic is idempotent OR P2002 caught and converted to a no-op.

## R16 — Thread `replyCount` drift after delete/soft-delete

- **File:line**: `src/actions/message-actions.ts:268-270` (replyCount increment on send) + `:421` (deleteMessage — does NOT decrement)
- **Likelihood**: **H** — confirmed by code reading; soft-delete leaves count stale.
- **Impact**: **M** — badge shows "3 replies" when 2 visible.
- **Probe** (`P3F-DRIFT`):
  - send msg A; reply 3 times; assert badge "3 trả lời"
  - delete reply 2; assert badge — playbook lets us choose semantics (Discord distinguishes `message_count` vs `total_message_sent`); document HustlyTasker's chosen semantic.
- **Expected**: documented semantic; either decrement-on-delete OR keep-total-and-show-active-count.

## R17 — Pin/unpin race producing duplicate or zero pins

- **File:line**: `src/actions/message-actions.ts:452` (`togglePinMessage`)
- **Likelihood**: **L** — single-row toggle, low contention
- **Impact**: **L**
- **Probe** (`P3G-PIN-RACE`): 2 contexts both click "Pin" on same msg within 50ms; assert final state = pinned (idempotent) + exactly 1 pinned event broadcast OR a deterministic last-write-wins log.
- **Expected**: convergent state.

## R18 — Presence false positive (online after disconnect)

- **File:line**: `src/hooks/usePresence.ts` + Supabase presence
- **Likelihood**: **M** — Supabase presence has ~30s heartbeat
- **Impact**: **L**
- **Probe** (`P3I-PRES`): 2 contexts; A goes offline (Playwright `context.close()`); B's view of "A is online" must clear within Supabase's heartbeat window (≤30s).
- **Expected**: presence dot turns off within heartbeat.

---

## Coverage map → playbook phases

| Risk | Mapped to phase | Coverage today |
|---|---|---|
| R1 | P3M (task chat) | ❌ no spec |
| R2 | P6D (auth bypass) | ❌ no spec |
| R3 | P6C (IDOR) | ⚠️ partial — 04-clients-in-channels covers staff/CLIENT split |
| R4 | P6A (XSS) | ❌ no spec (prod hardened: DOMPurify + Tiptap Link config) |
| R5 | P6J (slow mode) | ❌ no spec |
| R6 | P4 (permissions) | ⚠️ partial — 03-permissions covers visibility/post; DENY-wins gap |
| R7 | P5 (realtime ordering) | ❌ no spec |
| R8 | P5 (optimistic conflict) | ❌ no spec |
| R9 | P3K (wiki cascade) | ❌ no spec |
| R10 | P10 (orphan channel) | ❌ no spec |
| R11 | P10 (workspace switch) | ❌ no spec |
| R12 | P7 (memory leak) | ❌ no spec (no k6) |
| R13 | P6E (attachment forgery) | ❌ no spec |
| R14 | P3D (mention privacy) | ⚠️ partial — 06-composer covers happy path |
| R15 | P3E (reaction race) | ⚠️ partial — 07-reactions covers thumbs-up; no double-click race |
| R16 | P3F (replyCount drift) | ⚠️ partial — 07-reactions checks count appears, not drift |
| R17 | P3G (pin race) | ⚠️ partial — 07-pin covers single-user happy path |
| R18 | P3I (presence) | ⚠️ partial — 10-realtime covers presence appears, not clear-on-disconnect |

## Coverage summary

- **0 / 18 risks have a dedicated probe today** (all are either partial happy-path coverage or untested)
- **6 risks are CRITICAL impact** (R2, R3, R4, R6) — must have probes before any production-grade verdict
- **Phase 6 (security) is the highest leverage next step** — covers R2, R3, R4, R5, R13 in one go

## Next steps recommended by this matrix

1. **Phase 6 spec sprint** — write R2, R3, R4, R13 probes as `*.security.spec.ts`. ~4-6h.
2. **Phase 4 fill-in** — write R6 DENY-wins matrix. ~2-3h.
3. **Phase 5 fill-in** — write R7, R8 ordering + optimistic conflict. ~2-3h.
4. **Phase 3 edge probes** — R1 race, R9 cascade, R14 mention privacy, R15 reaction race, R16 replyCount drift, R17 pin race. ~3-4h.
5. **Phase 7 + 9** — requires installing k6 + Pa11y first. ~half-day plus the writing.
