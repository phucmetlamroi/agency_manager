'use server'

/**
 * [Canonical Clients 2026-06] PUBLIC server actions for the share-link portal.
 *
 * There is NO session here — the token IS the credential. Every action
 * re-resolves the token through resolveShareToken (single chokepoint:
 * hash-at-rest lookup, revocation, expiry, rate limit, uniform null failure)
 * and authorizes strictly via `task.clientId ∈ scope.clientIds` +
 * `task.workspaceId ∈ scope.workspaceIds`.
 *
 * Bodies are ports of the account-portal actions (client-portal-actions.ts —
 * removed in P5) with identical state-machine guards, sanitization and
 * notification fan-out. Audit rows carry `actorUserId: null` +
 * `viaShareLinkId` so admin forensics can distinguish link-driven actions.
 */

import { prisma } from '@/lib/db'
import { serializeDecimal } from '@/lib/serialization'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { deriveClientStatus, deriveNeedsYou, isClientFacingPhase } from '@/lib/portal-derive'
import { findClientReviewSlugs, getOrCreateClientReviewSlug } from '@/lib/review/shares'
import { cookies } from 'next/headers'
import {
    GUEST_COOKIE_TTL_SEC,
    createGuestSession,
    getGuestSession,
    guestCookieAttrs,
    guestCookieName,
    resolveShareClient,
    resolveShareOwnerClientIds,
} from '@/lib/review/share-auth'
import { guestAppBaseUrl } from '@/lib/review/guest-emails/wrap'
import { sanitizeClientText, FEEDBACK_MAX_LEN, RATING_FEEDBACK_MAX_LEN, TITLE_MAX_LEN, LINK_MAX_LEN } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'
import { limitDb } from '@/lib/review/rate-limit-db'
import { resolveShareToken, getRequestIp } from '@/lib/share-link-auth'
import { generateOtp, hashOtp, verifyOtp, generateRandomToken } from '@/lib/otp'
import { sendEmail } from '@/lib/email'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { isValidReaction } from '@/lib/comment-reactions'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'
import type { ClientRequestPortalDTO } from '@/components/portal/calm/types'

/**
 * [Onboarding 2026-07] Carry the portal's ALREADY-VERIFIED notify email into the
 * screening room, so the client is never asked to identify themselves twice.
 *
 * THE BUG THIS REPLACES: /r/[slug] pre-filled the client's name (to skip the
 * name/email modal) even when no guest session existed. The player then believed
 * it had an identity, never opened the modal, and posted the decision without
 * one — so the API answered 401 "Please add your name and email to review." The
 * only thing that could have created the session was the modal that had just been
 * skipped, so the client was stuck in a loop with no way out. It surfaced once the
 * 30-day guest cookie expired, on a client who had verified their email months
 * earlier and reasonably expected that to be enough.
 *
 * WHY THIS IS NOT A WEAKENING: the screening room's own identity modal verifies
 * nothing — any name and any email are accepted (see GuestReviewApp: "NO email
 * PIN: the owner waived impersonation protection on approvals"). The portal's
 * notify email, by contrast, passed an emailed OTP. Minting the session from it
 * RAISES the assurance behind an approval, and attributes it to a confirmed
 * address instead of free text.
 *
 * Authorization: the token is re-resolved through the usual chokepoint, and the
 * review share must belong to a client inside that token's scope — so a link can
 * only ever mint an identity for its own client's videos.
 */
export async function ensureScreeningIdentity(
    token: string,
    slug: string,
): Promise<{ ok: boolean }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { ok: false }

    const share = await prisma.shareLink.findUnique({ where: { slug }, include: { items: true } })
    if (!share || share.revokedAt) return { ok: false }
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { ok: false }

    const jar = await cookies()
    // Already identified in this browser → nothing to do.
    if (await getGuestSession(share, jar)) return { ok: true }

    // The video must belong to THIS token's client (or one of its sub-brands).
    // [Codex review 2026-07] Authorize on the OWNING client ids, NOT on the display
    // name. resolveShareClient walks UP to the top-level client so comments read
    // "Jack" instead of the sub-brand "MotoHalo" — using that id as the access check
    // rejected the rightful owner (a sub-brand token never contains its parent's id,
    // and a task-less multi-asset share resolves to null), sending a client who had
    // already verified their email straight back to the Name/Email modal. That false
    // rejection is friction the owner explicitly asked us to remove.
    const ownerIds = await resolveShareOwnerClientIds(share)
    if (!ownerIds.some((id) => scope.clientIds.includes(id))) return { ok: false }

    const link = await prisma.clientShareLink.findUnique({
        where: { id: scope.shareLinkId },
        select: { notifyEmail: true, notifyEmailVerifiedAt: true },
    })
    // No confirmed email yet → fall through; the player still shows its modal.
    if (!link?.notifyEmail || !link.notifyEmailVerifiedAt) return { ok: false }

    // Display name only — never an access decision.
    const owner = await resolveShareClient(share)
    const created = await createGuestSession(share, {
        name: scope.clientName || owner?.name || 'Client',
        email: link.notifyEmail.toLowerCase(),
        userAgent: null,
    })
    jar.set(guestCookieName(slug), created.rawToken, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    return { ok: true }
}

/**
 * [Statements 2026-07] Whitelist the client-facing payment details out of an
 * Invoice.billingSnapshot Json blob.
 *
 * Every field below is one the generated invoice PDF ALREADY prints for this
 * client (invoice-generator.ts bank block + footer) — so surfacing them in the
 * portal discloses nothing new; it just means the client no longer has to open
 * a PDF to find out where to send the money. The blob is untyped and written by
 * the issuing flow, so we copy field-by-field: any key added to it later stays
 * server-side unless someone deliberately adds it here.
 */
function pickClientFacingBank(snapshot: unknown): {
    agencyName: string | null
    beneficiaryName: string | null
    bankName: string | null
    accountNumber: string | null
    swiftCode: string | null
    address: string | null
    notes: string | null
} | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
    const s = snapshot as Record<string, unknown>
    const str = (v: unknown): string | null =>
        typeof v === 'string' && v.trim() ? v.trim() : null
    const out = {
        agencyName: str(s.agencyName),
        beneficiaryName: str(s.beneficiaryName),
        bankName: str(s.bankName),
        accountNumber: str(s.accountNumber),
        swiftCode: str(s.swiftCode),
        address: str(s.address),
        notes: str(s.notes),
    }
    // All-empty snapshot → null so the UI can skip the block entirely.
    return Object.values(out).some(Boolean) ? out : null
}

/* ───────────────────────────────────────────────────────────────────────────
   Reads
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Full snapshot for the share page: tasks + invoices of the client (and its
 * subsidiaries) across EVERY ACTIVE workspace of the profile — "toàn bộ lịch
 * sử từ trước tới giờ".
 *
 * Field whitelist mirrors the old getClientTasks exactly — most importantly
 * the [Sprint J P0] exclusion of jobPriceUSD (agency revenue must never leak
 * to clients).
 */
export async function getShareSnapshot(token: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return null

    const [tasks, invoices] = await Promise.all([
        prisma.task.findMany({
            where: {
                clientId: { in: scope.clientIds },
                workspaceId: { in: scope.workspaceIds },
                // [Vanishing work 2026-07] Cancelling a task sets isArchived (task-actions),
                // so `isArchived: false` erased it from the client's history RETROACTIVELY —
                // a production they discussed last week simply was not in the list, with no
                // tombstone and no count. Any mis-click, any cancel-and-recreate, any bulk
                // tidy-up did that. Keep archived work OUT by default, but keep the ones the
                // client demonstrably knew about: clientReview is only ever written once a
                // deliverable has been through their hands, so it is the tightest possible
                // "they saw this" marker and it survives the cancel. Those come back as a
                // read-only 'Closed' row (portal-derive maps 'Đã hủy'), never as work in
                // progress and never actionable — findScopedTask still refuses every write
                // on an archived task.
                // Only SETTLED decisions come back. Readmitting 'AWAITING' was actively
                // harmful: deriveClientStatus reads clientReview BEFORE status, so a
                // cancelled task would render 'Awaiting your review', deriveNeedsYou would
                // return true, and it would sit in the Action tray with a live Approve
                // button — which every write path then refuses, because findScopedTask
                // still requires isArchived:false. The client would be left with a badge
                // saying one video is waiting on them, attached to a button that answers
                // "this link is invalid", forever. Worse than the vanishing it replaced.
                OR: [
                    { isArchived: false },
                    { AND: [{ isArchived: true }, { clientReview: { in: ['APPROVED', 'CHANGES'] } }] },
                ],
            },
            select: {
                id: true,
                title: true,
                status: true,
                isArchived: true,
                deadline: true,
                createdAt: true,
                updatedAt: true,
                type: true,
                productLink: true,
                // [2026-06-29] jobPriceUSD INCLUDED for client billing transparency. The
                // client PAYS this USD price, so they may see it in their OWN portal. This
                // path is reachable only via the client's token-gated ClientShareLink (no
                // staff/editor ever calls getShareSnapshot); staff surfaces still strip it
                // via sanitizeTaskForUser. Policy change confirmed by owner (admin+client see
                // USD, no one else). Do NOT add jobPriceUSD to any staff serialization.
                jobPriceUSD: true,
                clientId: true,
                workspaceId: true,
                notes_vi: true,
                notes_en: true,
                references: true,
                resources: true,
                collectFilesLink: true,
                // [Authz 2026-07] frameUsername / framePassword / frameNote are NOT selected.
                // They were being shipped to the client page and rendered behind a "Need a
                // login to review?" toggle. Nothing in the data says whose Frame.io account
                // they are — some tasks may carry the agency's shared login — and a stored
                // password reaching a party who may not own it is not a risk worth carrying
                // for a convenience link. frameNote goes with them: it is free text written
                // by staff for staff, in Vietnamese. Owner confirmed: strip, re-enable later
                // if a client-owned credential field is ever wanted as its own field.
                duration: true,
                clientReview: true,
                clientFeedback: true,
                clientReviewedAt: true,
                client: {
                    select: { id: true, name: true, parent: { select: { name: true } } },
                },
                project: { select: { id: true, name: true } },
                // [Authz 2026-07] Narrowed from `rating: true`. The DTO type declares four
                // fields, but the type does not strip at runtime — `...task` spread the WHOLE
                // Rating row, which carries staffId. That is the editor's stable identity,
                // handed to the client on every rated task, re-opening exactly the leak
                // `assignee: null` two lines below exists to close (the client works with the
                // manager and must not know who edited). clientId and shareLinkId rode along too.
                rating: {
                    select: {
                        creativeQuality: true,
                        responsiveness: true,
                        communication: true,
                        qualitativeFeedback: true,
                    },
                },
                assignee: { select: { username: true, nickname: true } },
                // [Trial P0] Manager ("Người quản lý") — the ONLY staff identity the client may see.
                assignedBy: { select: { username: true, nickname: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.invoice.findMany({
            where: {
                clientId: { in: scope.clientIds },
                workspaceId: { in: scope.workspaceIds },
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                invoiceNumber: true,
                issueDate: true,
                dueDate: true,
                // [Statements 2026-07] The money breakdown the client needs to reconcile
                // the lines against the total. Without subtotal/tax/deposit an invoice
                // carrying VAT or a deposit deduction can NEVER add up on screen.
                subtotalAmount: true,
                taxPercent: true,
                taxAmount: true,
                depositDeducted: true,
                totalDue: true,
                status: true,
                filePath: true,
                // Read for the bank block ONLY — never forwarded raw (see mappedInvoices).
                billingSnapshot: true,
                clientId: true,
                workspaceId: true,
                items: { select: { description: true, quantity: true, unitPrice: true, amount: true } },
            },
        }),
    ])

    // ── Workspace identity for the client-facing period filter ────────────
    // [Atelier 2026-06] The client asked for the admin's "Tháng X/2026"
    // workspace switcher. We only surface workspaces that ACTUALLY hold this
    // client's data ("sổ workspace mình đã làm") — not every empty month of the
    // profile — and order them newest-first like the admin dropdown does. The
    // name lookup is a single batched query over the ids already present in the
    // result set (no extra scope widening, no security surface).
    const presentWsIds = Array.from(
        new Set([
            ...tasks.map((t) => t.workspaceId),
            ...invoices.map((i) => i.workspaceId),
        ].filter((id): id is string => !!id)),
    )
    const wsRows = presentWsIds.length
        ? await prisma.workspace.findMany({
            where: { id: { in: presentWsIds } },
            select: { id: true, name: true, createdAt: true },
        })
        : []
    const wsNameById = new Map(wsRows.map((w) => [w.id, w.name]))
    const workspaces = wsRows
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((w) => ({ id: w.id, name: w.name }))

    // [Hotfix 2026-06-13] serializeDecimal keeps Date objects AS-IS (it only
    // unwraps Prisma Decimal), but the calm `Deliverable`/`Invoice` DTOs declare
    // their date fields as `string` and the surfaces treat them as such
    // (OverviewSurface sorts via `updatedAt.localeCompare(...)`). A raw Date
    // survives the RSC boundary as a Date in the browser → `.localeCompare is
    // not a function` crash on the share page. Stringify every date field here,
    // mirroring how the old getClientInvoices did `.toISOString()`.
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

    // ── [B5/P4] Give the client the FULL review board (source of truth) ──────────
    // Root cause of "Not uploaded yet": the portal only read the flat task.productLink /
    // task.clientReview, which only the admin-Duyệt bridge fills. When a task reaches the
    // client phase WITHOUT the bridge committing (admin set A5 by hand/bulk, or the bridge
    // threw after the status flip), those stay null → no review link, wrong badge. Fix: read
    // the review module directly — join ReviewAsset by taskId and, for CLIENT-PHASE tasks
    // only (R5 gate below), materialize the `/r/{slug}` guest review board the client uses to
    // WATCH + leave timecode comments + annotate + approve (their feedback syncs back to the
    // task via the guest decision route). getOrCreateClientReviewSlug reuses an existing live
    // share (incl. a bridge-created one) or mints a default open share — the link the bridge
    // would have made.
    const taskIds = tasks.map((t) => t.id)
    const reviewAssets = taskIds.length
        ? await prisma.reviewAsset.findMany({
            where: {
                taskId: { in: taskIds },
                deletedAt: null,
                currentVersion: { is: { pipelineStatus: 'READY', muxPlaybackId: { not: null }, deletedAt: null } },
            },
            select: { id: true, taskId: true, workspaceId: true, createdById: true },
            orderBy: { createdAt: 'desc' }, // newest live stack per task wins
        })
        : []
    // taskId → the live READY asset (the deliverable to review). First (newest) per task.
    const readyAssetByTask = new Map<string, { id: string; taskId: string | null; workspaceId: string; createdById: string }>()
    for (const a of reviewAssets) {
        if (a.taskId && !readyAssetByTask.has(a.taskId)) readyAssetByTask.set(a.taskId, a)
    }

    const guestBase = guestAppBaseUrl()
    // [QA 2026-07-18] Detect a link to OUR OWN review board (`/r/{slug}`) ROBUSTLY — by path + known
    // host, not a brittle `startsWith(base)` that a host/scheme/www drift or a relative link would
    // defeat (letting a revoked link slip through). External links (frame.io/Drive) never match.
    const OWN_HOSTS = new Set<string>(['hustlytasker.xyz', 'www.hustlytasker.xyz'])
    try { OWN_HOSTS.add(new URL(guestBase).host.toLowerCase()) } catch { /* base malformed → keep fallback hosts */ }
    const isOwnReviewLink = (u: string | null): boolean => {
        if (!u) return false
        try {
            const url = new URL(u, guestBase) // relative `/r/…` resolves against our own base
            return url.pathname.startsWith('/r/') && OWN_HOSTS.has(url.host.toLowerCase())
        } catch { return false }
    }
    // [Parity review 2026-07] Resolve every existing review slug in ONE indexed query
    // first. This loop used to call the get-or-CREATE helper per task on every portal
    // page load — 1–2 reads plus a possible WRITE each. In the steady state every
    // client-facing task already has a board, so this answers them all and writes nothing.
    const clientFacingAssetIds = tasks
        .filter((t) => readyAssetByTask.get(t.id) && isClientFacingPhase(t.status, t.clientReview))
        .map((t) => readyAssetByTask.get(t.id)!.id)
    const slugByAsset = await findClientReviewSlugs(clientFacingAssetIds)

    const mappedTasks = await Promise.all(tasks.map(async ({ assignedBy, ...task }) => {
        // R5 gate: only surface a review board when the task is in a CLIENT-facing phase.
        const asset = readyAssetByTask.get(task.id)
        let reviewUrl: string | null = null
        // A cancelled task must never reach the minting branch. isClientFacingPhase is true
        // whenever clientReview != null regardless of status, so without this guard a mere
        // portal READ could CREATE a fresh open, download-enabled /r/ board for work the
        // admin had cancelled and whose old board they had deliberately revoked.
        if (!task.isArchived && asset && isClientFacingPhase(task.status, task.clientReview)) {
            const known = slugByAsset.get(asset.id)
            if (known) {
                reviewUrl = `${guestBase}/r/${known}`
            } else {
                try {
                    // null = an admin revoked this asset's client board; the kill switch holds.
                    const minted = await getOrCreateClientReviewSlug(asset)
                    reviewUrl = minted ? `${guestBase}/r/${minted}` : null
                } catch {
                    // Any hiccup minting the share → degrade to "Not uploaded yet" rather than 500.
                    reviewUrl = null
                }
            }
        }
        // Synthesize AWAITING ONLY in-memory when a review board is surfaced but the client
        // hasn't decided yet — drives the badge ('Awaiting your review') + needsYou. The REAL
        // task.clientReview (APPROVED/CHANGES) always wins the ?? and stays in the DTO.
        const effClientReview = task.clientReview ?? (reviewUrl ? 'AWAITING' : null)
        // [QA 2026-07-18] Only ever hand the client OUR OWN review board through the freshly-minted,
        // R5-gated, always-LIVE `reviewUrl` — never a stored `task.productLink` /r/ link. task-sync.ts
        // stamps `productLink = reviewUrl` when a task is sent to the client; a later version revokes
        // that share but the dead URL lingers, so a task whose reviewUrl is null (R5-gated OR a mint
        // hiccup) shipped a "This link is no longer available" link. So touch ONLY our own /r/ links —
        // swap them for the fresh reviewUrl, or drop them when there's none. EXTERNAL delivery/download
        // links (frame.io / Drive) are ALWAYS preserved — they back the sheet's "Download files" button.
        const clientProductLink = isOwnReviewLink(task.productLink) ? (reviewUrl ?? null) : task.productLink
        const effProductLink = clientProductLink
        // [Authz 2026-07] The raw internal status never leaves the server. It is a Vietnamese
        // staff-workflow label — including the four internalOnly ones ("Đã nộp video (nội bộ)"
        // and friends) — and it was being spread straight into the client's page payload by
        // `...task`. No portal component reads it: everything renders `clientStatus`, which is
        // derived below. It stayed on the wire only because the spread was never pruned.
        const { status: _internalStatus, ...taskSafe } = task
        return {
        ...taskSafe,
        productLink: clientProductLink,
        // [Trial P0 — isolation] The client must NEVER receive the editor's identity;
        // ship the Manager instead ("client làm việc với manager, không biết editor").
        assignee: null,
        manager: assignedBy ? (assignedBy.nickname || assignedBy.username) : null,
        // [Invoice i18n] Never ship the raw Vietnamese staff instruction (notes_vi) to a
        // foreign client. The portal renders only notes_en; null notes_vi here so it can never
        // leak via a future `notes_en || notes_vi` fallback (the pattern staff TaskDrawer uses).
        notes_vi: null,
        deadline: iso(task.deadline),
        createdAt: iso(task.createdAt)!,
        updatedAt: iso(task.updatedAt)!,
        clientReviewedAt: iso(task.clientReviewedAt),
        // A cancelled row is a tombstone: it exists so the client's history is honest,
        // never as live work. Force it past deriveClientStatus, which would otherwise
        // read the surviving clientReview and label it 'Completed' or 'In revision'.
        clientStatus: task.isArchived ? 'Closed' : deriveClientStatus(task.status, effClientReview),
        needsYou: task.isArchived
            ? false
            : deriveNeedsYou({ status: task.status, productLink: effProductLink, clientReview: effClientReview }),
        clientPath: formatClientHierarchy(task.client),
        workspaceName: task.workspaceId ? wsNameById.get(task.workspaceId) ?? null : null,
        reviewUrl,
        }
    }))

    // [Statements 2026-07] `billingSnapshot` is an untyped Json blob frozen at issue
    // time; it holds the agency's payment details but may also accrete unrelated
    // internal keys. NEVER spread it into the client payload — destructure it OUT and
    // forward an explicit whitelist of the six fields the PDF's bank block already
    // shows the client anyway. Anything not listed here stays server-side by default.
    const mappedInvoices = invoices.map(({ billingSnapshot, ...inv }) => ({
        ...inv,
        issueDate: iso(inv.issueDate)!,
        dueDate: iso(inv.dueDate),
        workspaceName: inv.workspaceId ? wsNameById.get(inv.workspaceId) ?? null : null,
        bank: pickClientFacingBank(billingSnapshot),
    }))

    // [Trial P3 — white-label] The agency's brand for the client portal lockup:
    // logo + name + optional accent (settings.portalAccent). Only these three
    // brand fields leave the server — never any other profile/settings data.
    const brandProfile = scope.profileId
        ? await prisma.profile.findUnique({ where: { id: scope.profileId }, select: { name: true, logoUrl: true, settings: true } })
        : null
    const rawAccent = brandProfile?.settings && typeof brandProfile.settings === 'object' && !Array.isArray(brandProfile.settings)
        ? (brandProfile.settings as any).portalAccent
        : null
    const brandAccent = typeof rawAccent === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(rawAccent) ? rawAccent : null

    return {
        clientName: scope.clientName,
        profileName: scope.profileName,
        brandName: brandProfile?.name || scope.profileName,
        brandLogoUrl: brandProfile?.logoUrl || null,
        brandAccent,
        workspaces,
        tasks: serializeDecimal(mappedTasks) as typeof mappedTasks,
        invoices: serializeDecimal(mappedInvoices) as typeof mappedInvoices,
    }
}

/** Resolve a token to a task it owns (or null) — the authz primitive here. */
async function findScopedTask(
    token: string,
    taskId: string,
    select: Record<string, boolean>,
): Promise<{ scope: Awaited<ReturnType<typeof resolveShareToken>>; task: any }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { scope: null, task: null }
    // Cast: the select object is dynamic, so Prisma can't narrow the payload
    // type — callers only touch the whitelisted fields they selected.
    const task = (await prisma.task.findFirst({
        where: {
            id: taskId,
            clientId: { in: scope.clientIds },
            workspaceId: { in: scope.workspaceIds },
            // [AUDIT R6 — fix] Match the getShareSnapshot read filter (isArchived:false).
            // Since cancel→archive ('Đã hủy' sets isArchived=true) the snapshot hides
            // archived tasks; without this, a client holding an old deliverable URL
            // could still approve/request-changes on a cancelled task, flipping its
            // status while isArchived stays true (status desync, invisible to admin).
            isArchived: false,
        },
        select: select as any,
    })) as any
    return { scope, task }
}

/* ───────────────────────────────────────────────────────────────────────────
   [Phase C] Client notification-email settings — token-scoped. The email is stored on the
   ClientShareLink the token resolves to and verified with a 6-digit OTP; it persists until
   the client changes/removes it. Review-status emails fan out to it (see guest-notify).
   ─────────────────────────────────────────────────────────────────────────── */

const NOTIFY_EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTIFY_CODE_TTL_MS = 15 * 60 * 1000

function renderNotifyVerifyEmailHtml(code: string, brand: string): string {
    const b = brand.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
    return `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827;">
<h1 style="font-size:18px;margin:0 0 12px;">Confirm your email</h1>
<p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 16px;">Enter this code in your ${b} client portal to start receiving review updates:</p>
<div style="font-size:30px;font-weight:800;letter-spacing:6px;text-align:center;background:#f4f4f5;border-radius:10px;padding:16px;color:#111827;">${code}</div>
<p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">This code expires in 15 minutes. If you didn't request it, you can ignore this email.</p>
</div>`
}

/**
 * Collapse an address to the mailbox it actually reaches, for rate-limit keys ONLY.
 * Never store or send this — it is deliberately lossy. `+tag` suffixes are stripped for every
 * provider (universally a same-inbox alias); dots are stripped only for Gmail, which is the one
 * major provider that ignores them.
 */
const PLUS_ALIAS_DOMAINS = new Set([
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com',
    'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'fastmail.com', 'zoho.com', 'aol.com',
])

function notifyInboxKey(email: string): string {
    const at = email.lastIndexOf('@')
    if (at < 1) return email
    let local = email.slice(0, at)
    const domain = email.slice(at + 1)
    // [Review round 2] Only for providers that DEFINITELY treat +tag as an alias of one
    // mailbox. Stripping it everywhere was wrong: a company running its own mail server can
    // provision ops@ and ops+vip@ as two real, separate mailboxes, and collapsing them meant
    // three code requests to the first told the second "Too many attempts for this email"
    // before it had ever asked for one. Unknown domains keep their local part intact — the
    // worst case there is a cap that is merely per-address, which is where it started.
    if (PLUS_ALIAS_DOMAINS.has(domain)) {
        const plus = local.indexOf('+')
        if (plus > 0) local = local.slice(0, plus)
    }
    // Dots are ignored by Gmail only — and googlemail.com is the SAME mailbox as gmail.com,
    // so it has to fold into one key or the alias this exists to close survives at half
    // strength (a.b@googlemail.com and ab@gmail.com are one inbox, two buckets).
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
        return `${local.replace(/\./g, '')}@gmail.com`
    }
    return `${local}@${domain}`
}

/** Current notify-email state for the portal Settings panel. Null = invalid token. */
export async function getPortalNotifyEmail(
    token: string,
): Promise<{ email: string | null; verified: boolean; pending: string | null } | null> {
    const scope = await resolveShareToken(token)
    if (!scope) return null
    const link = await prisma.clientShareLink.findUnique({
        where: { id: scope.shareLinkId },
        select: { notifyEmail: true, notifyEmailVerifiedAt: true, notifyEmailPending: true },
    })
    return {
        email: link?.notifyEmail ?? null,
        verified: !!link?.notifyEmailVerifiedAt,
        pending: link?.notifyEmailPending ?? null,
    }
}

/** Step 1: client enters an email → store as pending + email them a 6-digit code. */
export async function requestPortalNotifyEmail(
    token: string,
    rawEmail: string,
): Promise<{ success: boolean; error?: string }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is no longer valid.' }
    const email = (rawEmail || '').trim().toLowerCase()
    if (!NOTIFY_EMAIL_RX.test(email) || email.length > 200) {
        return { success: false, error: 'Please enter a valid email address.' }
    }
    // [AUDIT HT-015 fix] Cap verification emails PER TARGET INBOX with the PERSISTENT DB limiter
    // (survives serverless cold-starts, unlike the in-memory rateLimit below). Without a per-inbox
    // cap keyed on the destination address, the portal could be abused to email-bomb an arbitrary
    // victim inbox (the per-link+ip cap doesn't bound how many distinct addresses one caller hits).
    // [Authz 2026-07] Key on the DELIVERY inbox, not the typed string. The cap existed to stop
    // this endpoint being used to email-bomb an arbitrary victim, but keying on the raw address
    // meant victim+1@gmail.com, victim+2@… and v.i.c.t.i.m@… were three separate buckets
    // delivering to one mailbox — 3/hour became unbounded for the cost of typing a plus sign.
    const inboxRl = await limitDb(`portal-notify-inbox:${notifyInboxKey(email)}`, 3, 60 * 60)
    if (!inboxRl.success) {
        return { success: false, error: 'Too many attempts for this email. Please try again later.' }
    }
    const ip = await getRequestIp()
    const rl = await rateLimit(`portal-notify-req:${scope.shareLinkId}:${ip}`, 5, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many attempts. Please try again in an hour.' }

    const code = generateOtp()
    await prisma.clientShareLink.update({
        where: { id: scope.shareLinkId },
        data: {
            notifyEmailPending: email,
            notifyEmailCodeHash: hashOtp(code),
            notifyEmailCodeExpiresAt: new Date(Date.now() + NOTIFY_CODE_TTL_MS),
        },
    })
    void sendEmail({
        to: email,
        subject: 'Your verification code',
        html: renderNotifyVerifyEmailHtml(code, scope.profileName),
    }).catch(() => { /* best-effort; the client can re-request */ })
    return { success: true }
}

/** Step 2: client enters the code → promote pending → the live verified email. */
export async function verifyPortalNotifyEmail(
    token: string,
    rawCode: string,
): Promise<{ success: boolean; error?: string }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is no longer valid.' }
    // Bound OTP brute-force: a 6-digit code with a 15-min TTL must not be guessable. Cap attempts
    // per link+ip (defense-in-depth on top of resolveShareToken's per-ip limiter).
    const ip = await getRequestIp()
    const rl = await rateLimit(`portal-notify-verify:${scope.shareLinkId}:${ip}`, 10, NOTIFY_CODE_TTL_MS)
    if (!rl.success) return { success: false, error: 'Too many attempts. Please try again later.' }
    const link = await prisma.clientShareLink.findUnique({
        where: { id: scope.shareLinkId },
        select: { notifyEmailPending: true, notifyEmailCodeHash: true, notifyEmailCodeExpiresAt: true },
    })
    if (!link?.notifyEmailPending || !link.notifyEmailCodeHash || !link.notifyEmailCodeExpiresAt) {
        return { success: false, error: 'No pending verification. Please request a code first.' }
    }
    if (link.notifyEmailCodeExpiresAt.getTime() < Date.now()) {
        return { success: false, error: 'The code has expired. Please request a new one.' }
    }
    if (!verifyOtp((rawCode || '').trim(), link.notifyEmailCodeHash)) {
        return { success: false, error: 'Incorrect code. Please try again.' }
    }
    await prisma.clientShareLink.update({
        where: { id: scope.shareLinkId },
        data: {
            notifyEmail: link.notifyEmailPending,
            notifyEmailVerifiedAt: new Date(),
            notifyEmailPending: null,
            notifyEmailCodeHash: null,
            notifyEmailCodeExpiresAt: null,
            notifyEmailUnsubToken: generateRandomToken(),
        },
    })
    return { success: true }
}

/** Client removes/unlinks their notify email (or clears a stuck pending request). */
export async function removePortalNotifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is no longer valid.' }
    await prisma.clientShareLink.update({
        where: { id: scope.shareLinkId },
        data: {
            notifyEmail: null,
            notifyEmailVerifiedAt: null,
            notifyEmailPending: null,
            notifyEmailCodeHash: null,
            notifyEmailCodeExpiresAt: null,
            notifyEmailUnsubToken: null,
        },
    })
    return { success: true }
}

/** One-click / page unsubscribe from portal notify emails — auth is the unsubscribe token
 *  itself (baked into the email link/header), NOT the share token. Clears the notify email. */
export async function unsubscribePortalNotify(unsubToken: string): Promise<{ success: boolean }> {
    if (!unsubToken || unsubToken.length < 20 || unsubToken.length > 128) return { success: false }
    const res = await prisma.clientShareLink.updateMany({
        where: { notifyEmailUnsubToken: unsubToken },
        data: {
            notifyEmail: null,
            notifyEmailVerifiedAt: null,
            notifyEmailPending: null,
            notifyEmailCodeHash: null,
            notifyEmailCodeExpiresAt: null,
            notifyEmailUnsubToken: null,
        },
    })
    return { success: res.count > 0 }
}

/* ───────────────────────────────────────────────────────────────────────────
   Writes — every thao tác "back ngược lại cho phía admin": notification to
   assignee + assigning admin, audit row with shareLinkId + ip/UA.
   ─────────────────────────────────────────────────────────────────────────── */

async function notifyStaff(
    task: { assigneeId: string | null; assignedById: string | null; title: string },
    taskId: string,
    title: string,
    body: string,
) {
    const recipients = new Set<string>()
    if (task.assigneeId) recipients.add(task.assigneeId)
    if (task.assignedById) recipients.add(task.assignedById)
    for (const uid of recipients) {
        try {
            const notif = await createNotificationInternal({
                userId: uid,
                type: 'TASK_STATUS_CHANGED',
                title,
                body,
                taskId,
                actorId: undefined,
            })
            void broadcastNotificationToUser(uid, {
                id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                taskId, createdAt: notif.createdAt, isRead: false,
            })
        } catch (e) {
            console.error('[share-portal] notify failed', e)
        }
    }
}

/**
 * Notify the profile's OWNER/ADMIN staff that a client submitted a brand-new task.
 * A fresh client-submitted task has no assignee/assigner yet, so `notifyStaff`
 * (which targets task.assigneeId/assignedById) doesn't apply — route to the
 * profile admins instead.
 */
async function notifyProfileAdmins(profileId: string, title: string, body: string, taskId: string) {
    try {
        const admins = await prisma.profileAccess.findMany({
            where: { profileId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        for (const { userId } of admins) {
            try {
                const notif = await createNotificationInternal({
                    userId, type: 'TASK_STATUS_CHANGED', title, body, taskId, actorId: undefined,
                })
                void broadcastNotificationToUser(userId, {
                    id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                    taskId, createdAt: notif.createdAt, isRead: false,
                })
            } catch (e) {
                console.error('[share-portal] notifyProfileAdmins one failed', e)
            }
        }
    } catch (e) {
        console.error('[share-portal] notifyProfileAdmins query failed', e)
    }
}

/** Client approves a deliverable via the public link → task 'Hoàn tất'. */
export async function approveDeliverableViaToken(token: string, taskId: string) {
    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true,
        clientReview: true, workspaceId: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the deliverable no longer exists.' }
    if (task.status === 'Hoàn tất' || task.clientReview === 'APPROVED') {
        return { success: false, error: 'This deliverable has already been approved.' }
    }
    // [AUDIT HT-014/HT-006 fix] A client may only approve a deliverable that is ACTUALLY in the
    // client-facing phase — one an admin has sent to them. Without this, a valid share token could
    // approve a task still in an INTERNAL phase, jumping it straight to 'Hoàn tất' (= editor payroll)
    // and bypassing the whole review flow. Same gate the read path uses to decide whether to expose
    // the deliverable at all, now enforced on the write path. (Owner decision Q1: client approve =
    // complete — but only for a build genuinely delivered to the client.)
    if (!isClientFacingPhase(task.status, task.clientReview)) {
        return { success: false, error: 'This deliverable is not currently awaiting your review.' }
    }

    await prisma.task.update({
        where: { id: taskId },
        data: {
            status: 'Hoàn tất',
            deadline: null,
            clientReview: 'APPROVED',
            clientReviewedAt: new Date(),
            version: { increment: 1 },
        },
    })

    await notifyStaff(
        task, taskId,
        'Khách đã duyệt sản phẩm 🎉',
        `Khách hàng "${scope.clientName}" đã duyệt "${task.title}" (qua link chia sẻ). Task được đánh dấu Hoàn tất.`,
    )

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.client_approved',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status },
        after: { status: 'Hoàn tất', clientReview: 'APPROVED', viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    if (task.workspaceId) {
        try {
            revalidatePath(`/${task.workspaceId}/admin`)
            revalidatePath(`/${task.workspaceId}/dashboard`)
        } catch { /* best-effort */ }
    }
    return { success: true }
}

/**
 * [Batch approval 2026-07] Approve MANY deliverables in one action.
 *
 * WHY: clients who commission in batches (a month of reels at once) had to open and
 * approve every single video by hand — and in the review room the Download button only
 * unlocks after approval, so a 20-video month meant 20 round trips before they could
 * take delivery. That, plus one-file-at-a-time downloads, is what a paying client meant
 * by "really hard to navigate … we're getting behind".
 *
 * SAFETY: this is NOT a shortcut around the review gate. Every task goes through the
 * SAME three checks as approveDeliverableViaToken — token scope (findScopedTask's
 * where-clause, replicated here for one round trip), not-already-approved, and
 * isClientFacingPhase (an admin actually sent it to this client). Anything failing a
 * check is silently skipped and reported in `skipped`, never approved. Approval writes
 * 'Hoàn tất', which drives editor payroll, so a partial batch must never guess.
 */
const MAX_BULK_APPROVE = 50

export async function approveDeliverablesViaToken(
    token: string,
    taskIds: string[],
): Promise<{ success: boolean; approved: number; skipped: number; error?: string }> {
    const ids = [...new Set((taskIds || []).filter((t): t is string => typeof t === 'string' && !!t))]
    if (ids.length === 0) return { success: false, approved: 0, skipped: 0, error: 'Please select at least one video.' }
    if (ids.length > MAX_BULK_APPROVE) {
        return { success: false, approved: 0, skipped: 0, error: `You can approve up to ${MAX_BULK_APPROVE} videos at a time.` }
    }

    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, approved: 0, skipped: 0, error: 'This link is invalid.' }

    // Same where-clause as findScopedTask — token scope + not archived.
    const tasks = await prisma.task.findMany({
        where: {
            id: { in: ids },
            clientId: { in: scope.clientIds },
            workspaceId: { in: scope.workspaceIds },
            isArchived: false,
        },
        select: {
            id: true, title: true, status: true, assigneeId: true, assignedById: true,
            clientReview: true, workspaceId: true,
        },
    })

    const eligible = tasks.filter(
        (t) =>
            t.status !== 'Hoàn tất' &&
            t.clientReview !== 'APPROVED' &&
            isClientFacingPhase(t.status, t.clientReview),
    )
    const skipped = ids.length - eligible.length
    if (eligible.length === 0) {
        return { success: false, approved: 0, skipped, error: 'None of those are awaiting your review.' }
    }

    // One transaction: a half-applied batch would leave the client unsure what they
    // approved, and payroll reading a partial month.
    //
    // [Authz 2026-07] The precondition is re-stated INSIDE the write. This used to be
    // `update({ where: { id } })` — the eligibility test above ran against a snapshot read
    // moments earlier, so an admin cancelling or completing a task in that window was
    // silently overwritten: 'Đã hủy' flipped back to 'Hoàn tất', which is a payroll-bearing
    // status. updateMany with the same conditions makes the check and the write one atomic
    // step; a row that stopped qualifying reports count 0 and is counted as skipped instead
    // of clobbered. Interactive transaction so a mid-batch failure still rolls back whole.
    //
    // [Review round 2] The first version of this precondition was still incomplete, and one
    // gap was serious. It pinned `status: { not: 'Hoàn tất' }` rather than the status actually
    // READ, so a task seen at 'Đã gửi video (khách)' with clientReview null — the ordinary
    // awaiting-client state — could be moved BACK to 'Đã nộp video (nội bộ)' by a re-upload
    // (a documented A5→A2 transition) and this write would still stamp it 'Hoàn tất':
    // approving an internal cut the client never saw, and creating payroll for it. It also
    // omitted clientId/workspaceId, so a task reassigned to another client mid-request stayed
    // writable by the old client's token. Every field the eligibility test relied on is now
    // restated, including the tenancy scope.
    //
    // Still ONE STATEMENT PER TASK, deliberately: updateMany reports only a count, and both the
    // honest approved/skipped figures and the per-recipient notifications need to know exactly
    // WHICH ids landed. What changed is the budget. Prisma's interactive-transaction default is
    // 5s and db.ts configures none, so 50 sequential round-trips to Neon could blow it and roll
    // the WHOLE batch back, leaving the client staring at "Approving..." having approved
    // nothing. 20s covers 50 round-trips several times over.
    const approvedIds = await prisma.$transaction(async (tx) => {
        const done: string[] = []
        for (const t of eligible) {
            const res = await tx.task.updateMany({
                where: {
                    id: t.id,
                    isArchived: false,
                    // Pin the status that was READ, not merely "not completed" - see above.
                    status: t.status,
                    clientReview: t.clientReview,
                    // Tenancy, restated: a task reassigned to another client mid-request must
                    // stop being writable by this token.
                    clientId: { in: scope.clientIds },
                    workspaceId: { in: scope.workspaceIds },
                },
                data: {
                    status: 'Hoàn tất',
                    deadline: null,
                    clientReview: 'APPROVED',
                    clientReviewedAt: new Date(),
                    version: { increment: 1 },
                },
            })
            if (res.count > 0) done.push(t.id)
        }
        return done
    }, { timeout: 20_000, maxWait: 10_000 })

    const approvedSet = new Set(approvedIds)
    const applied = eligible.filter((t) => approvedSet.has(t.id))
    if (applied.length === 0) {
        return { success: false, approved: 0, skipped: ids.length, error: 'Those have already been updated. Please refresh.' }
    }

    // ONE notification per person — 20 separate bells for one client action is noise that
    // gets muted, which is how a change request goes unnoticed in the first place.
    //
    // [Authz 2026-07] Grouped BY RECIPIENT. Every notification used to be built from
    // eligible[0]: the same deep link for everyone (so an editor clicking their bell landed
    // on a colleague's task) and a body listing every title in the batch (so each editor was
    // shown the names of other clients' work they have nothing to do with). Each person now
    // gets their own tasks, their own count, and a link that goes where it says.
    const byRecipient = new Map<string, typeof applied>()
    for (const t of applied) {
        // Set, not array: on a small team the assignee IS the manager, and pushing per role
        // counted that task twice — "Khách đã duyệt 2 video" listing one title twice, from one
        // approval. A person hears about each task once.
        for (const uid of new Set([t.assigneeId, t.assignedById].filter(Boolean) as string[])) {
            const arr = byRecipient.get(uid) ?? []
            arr.push(t)
            byRecipient.set(uid, arr)
        }
    }
    for (const [uid, mine] of byRecipient) {
        const titles = mine.map((t) => t.title).filter(Boolean)
        const preview = titles.slice(0, 3).join(', ') + (titles.length > 3 ? `, +${titles.length - 3} nữa` : '')
        await notifyStaff(
            { assigneeId: uid, assignedById: null, title: mine[0].title },
            mine[0].id,
            mine.length > 1 ? 'Khách đã duyệt nhiều sản phẩm 🎉' : 'Khách đã duyệt sản phẩm 🎉',
            `Khách hàng "${scope.clientName}" đã duyệt ${mine.length} video qua link chia sẻ: ${preview}. Các task được đánh dấu Hoàn tất.`,
        )
    }

    // Awaited, not fire-and-forget. These are the only record that a payroll-bearing status
    // change came from a share link rather than a staff member; `void audit(...)` after a
    // committed transaction means the batch can land with no trail at all if the process is
    // torn down first, which on a serverless function is the normal case, not an edge one.
    await Promise.all(applied.map((t) =>
        audit({
            workspaceId: t.workspaceId, actorUserId: null, action: 'task.client_approved',
            targetType: 'Task', targetId: t.id,
            before: { status: t.status },
            after: { status: 'Hoàn tất', clientReview: 'APPROVED', viaShareLinkId: scope.shareLinkId, bulk: true },
        }).catch(() => { /* one failed audit row must not fail the client's approval */ }),
    ))

    const workspaces = new Set(applied.map((t) => t.workspaceId).filter(Boolean) as string[])
    for (const ws of workspaces) {
        try {
            revalidatePath(`/${ws}/admin`)
            revalidatePath(`/${ws}/dashboard`)
        } catch { /* best-effort */ }
    }

    // Report what actually landed, not what we hoped would: ids.length - applied.length
    // counts both the never-eligible and anything an admin changed underneath us.
    return { success: true, approved: applied.length, skipped: ids.length - applied.length }
}

/** Client requests changes via the public link → task 'Revision' + feedback. */
export async function requestChangesViaToken(token: string, taskId: string, feedback: string) {
    const clean = sanitizeClientText(feedback || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Please describe the changes you would like.' }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, title: true, status: true, assigneeId: true, assignedById: true, workspaceId: true,
        clientReview: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the deliverable no longer exists.' }
    if (task.status === 'Hoàn tất') {
        return { success: false, error: 'This deliverable is already completed — changes can no longer be requested.' }
    }
    // [AUDIT HT-014 fix] Same client-facing-phase gate as approve — a client can only request
    // changes on a deliverable actually delivered to them, not on an internal-phase task.
    if (!isClientFacingPhase(task.status, task.clientReview)) {
        return { success: false, error: 'This deliverable is not currently awaiting your review.' }
    }

    await prisma.task.update({
        where: { id: taskId },
        data: {
            status: 'Revision',
            deadline: null,
            clientReview: 'CHANGES',
            clientFeedback: clean,
            clientReviewedAt: new Date(),
            version: { increment: 1 },
        },
    })

    await notifyStaff(
        task, taskId,
        'Khách yêu cầu chỉnh sửa',
        `Khách hàng "${scope.clientName}" yêu cầu chỉnh sửa "${task.title}" (qua link chia sẻ): ${clean.slice(0, 160)}`,
    )

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.client_changes_requested',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status },
        after: { status: 'Revision', clientReview: 'CHANGES', feedback: clean, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    if (task.workspaceId) {
        try {
            revalidatePath(`/${task.workspaceId}/admin`)
            revalidatePath(`/${task.workspaceId}/dashboard`)
        } catch { /* best-effort */ }
    }
    return { success: true }
}

/**
 * Star rating via the public link. Same guards as the account version
 * (M5/M6): integers 1-5, task completed, Rating.taskId unique, assignee
 * exists. Provenance: clientId=null, shareLinkId set, ratedVia='SHARE_LINK'.
 */
export async function submitRatingViaToken(
    token: string,
    taskId: string,
    creativeQuality: number,
    responsiveness: number,
    communication: number,
    qualitativeFeedback?: string,
) {
    const isValidStar = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5
    if (!isValidStar(creativeQuality) || !isValidStar(responsiveness) || !isValidStar(communication)) {
        return { success: false, error: 'Ratings must be whole numbers from 1 to 5.' }
    }

    const { scope, task } = await findScopedTask(token, taskId, {
        id: true, assigneeId: true, workspaceId: true, status: true, clientReview: true,
    })
    if (!scope || !task) return { success: false, error: 'This link is invalid or the item no longer exists.' }

    const statusOk = task.status === 'Hoàn tất' || task.clientReview === 'APPROVED'
    if (!statusOk) return { success: false, error: 'You can only rate a completed deliverable.' }

    const existing = await prisma.rating.findUnique({ where: { taskId } })
    if (existing) return { success: false, error: 'This deliverable has already been rated.' }

    if (!task.assigneeId) return { success: false, error: 'This deliverable has not been assigned yet.' }

    const safeFeedback = qualitativeFeedback
        ? sanitizeClientText(qualitativeFeedback, RATING_FEEDBACK_MAX_LEN)
        : null

    try {
        await prisma.rating.create({
            data: {
                taskId,
                clientId: null,
                shareLinkId: scope.shareLinkId,
                ratedVia: 'SHARE_LINK',
                staffId: task.assigneeId,
                creativeQuality,
                responsiveness,
                communication,
                qualitativeFeedback: safeFeedback,
                workspaceId: task.workspaceId || undefined,
            },
        })
        return { success: true }
    } catch (err) {
        console.error('[submitRatingViaToken] Error:', err)
        return { success: false, error: 'Could not save your rating. Please try again.' }
    }
}

/* ───────────────────────────────────────────────────────────────────────────
   Client Task Submission — the client creates a NEW task from the portal.
   ─────────────────────────────────────────────────────────────────────────── */

/** URL sanity: trimmed http(s) link, control/tag stripped, length-capped. */
function cleanLink(raw: string | undefined): string {
    return sanitizeClientText(raw || '', LINK_MAX_LEN)
}
function looksLikeUrl(s: string): boolean {
    return /^https?:\/\/\S+$/i.test(s)
}

/**
 * Dropdown options for the "create task" form — the client picks BOTH the month
 * (workspace) and the brand (sub-client), restricted to this link's own scope.
 * Workspaces are filtered to ACTIVE (never submit into a trashed/archived month).
 */
export async function getSubmitOptionsViaToken(token: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return null
    const [workspaces, brands] = await Promise.all([
        prisma.workspace.findMany({
            where: { id: { in: scope.workspaceIds }, status: 'ACTIVE' },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.client.findMany({
            where: { id: { in: scope.clientIds }, status: 'ACTIVE' },
            select: { id: true, name: true },
        }),
    ])
    // Root/canonical client first, then subs alphabetically.
    const brandList = brands
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => (a.id === scope.clientId ? -1 : b.id === scope.clientId ? 1 : a.name.localeCompare(b.name)))
    return {
        workspaces: workspaces.map((w) => ({ id: w.id, label: w.name })),
        brands: brandList,
        clientName: scope.clientName,
    }
}

/**
 * Client creates a task from the portal. Token-authed (no session); every input
 * is re-validated against the link's scope server-side. The task lands UNASSIGNED
 * ('Đang đợi giao') with the Raw/B-roll links encoded in the pipe format the admin
 * TaskDetailModal parses; the requirement goes to notes_vi. Admin then triages.
 */
export async function createTaskViaToken(
    token: string,
    input: { workspaceId: string; clientId: number; title: string; rawLink: string; brollLink?: string; notes?: string },
) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    // Per-link burst guard (best-effort; the 256-bit token is the real wall).
    const rl = await rateLimit(`client-create-task:${scope.shareLinkId}`, 20, 60 * 60 * 1000)
    // [L18a] These errors surface to the (English) client portal via CreateTaskPanel → keep them EN
    // to match line 493; only the internal staff UI is Vietnamese.
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' }

    // Fail-closed scope checks — client cannot inject another profile's/client's id.
    if (!input || typeof input.workspaceId !== 'string' || typeof input.clientId !== 'number') {
        return { success: false, error: 'Missing information.' }
    }
    if (!scope.workspaceIds.includes(input.workspaceId)) return { success: false, error: 'Invalid month.' }
    if (!scope.clientIds.includes(input.clientId)) return { success: false, error: 'Invalid brand.' }

    // The chosen month must still be ACTIVE.
    const ws = await prisma.workspace.findFirst({
        where: { id: input.workspaceId, status: 'ACTIVE' },
        select: { id: true },
    })
    if (!ws) return { success: false, error: 'This month is no longer active.' }

    // Validate + sanitize.
    const title = sanitizeClientText(input.title || '', TITLE_MAX_LEN)
    if (!title) return { success: false, error: 'Please enter a project / video name.' }
    const rawLink = cleanLink(input.rawLink)
    if (!looksLikeUrl(rawLink)) return { success: false, error: 'Invalid raw link (must start with http/https).' }
    const brollLink = input.brollLink ? cleanLink(input.brollLink) : ''
    if (brollLink && !looksLikeUrl(brollLink)) return { success: false, error: 'Invalid b-roll link.' }
    const notes = input.notes ? sanitizeClientText(input.notes, FEEDBACK_MAX_LEN) : ''

    // Encode to the format the admin TaskDetailModal parses (split('|') → RAW:/BROLL:).
    const resources = `RAW: ${rawLink}` + (brollLink ? ` | BROLL: ${brollLink}` : '')

    let task: { id: string; title: string }
    try {
        task = await prisma.task.create({
            data: {
                title,
                resources,
                notes_vi: notes || null,
                clientId: input.clientId,
                workspaceId: input.workspaceId,
                profileId: scope.profileId,           // from scope, never client input
                status: 'Đang đợi giao',              // unassigned pool, admin triages
                assigneeId: null,
                assignedById: null,
                type: 'Khách gửi',                    // distinct label → admin spots client submissions
                version: 0,
                isArchived: false,
            },
            select: { id: true, title: true },
        })
    } catch (err) {
        console.error('[createTaskViaToken] create failed', err)
        return { success: false, error: 'Không tạo được task. Vui lòng thử lại.' }
    }

    await notifyProfileAdmins(
        scope.profileId,
        'Khách gửi yêu cầu mới',
        `Khách hàng "${scope.clientName}" vừa gửi task: "${title}"`,
        task.id,
    )

    void audit({
        workspaceId: input.workspaceId, actorUserId: null, action: 'task.client_submitted',
        targetType: 'Task', targetId: task.id,
        after: { title, clientId: input.clientId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    try {
        revalidatePath(`/${input.workspaceId}/admin`)
        revalidatePath(`/${input.workspaceId}/admin/queue`)
        revalidatePath(`/${input.workspaceId}/dashboard`)
    } catch { /* best-effort */ }

    return { success: true, taskId: task.id }
}

/* ───────────────────────────────────────────────────────────────────────────
   Client Task Submission v2 — request INTAKE (ClientTaskRequest) + sub-brand
   creation. Supersedes the v1 direct-to-Task path above: the portal wizard now
   calls submitClientRequestViaToken, which creates a NEW ClientTaskRequest and
   emails every profile OWNER/ADMIN. An admin later accepts it into a real Task
   from the "Hộp thư yêu cầu" inbox. createTaskViaToken is retained but unused.
   ─────────────────────────────────────────────────────────────────────────── */

const DESIRED_TYPES = new Set(['Short form', 'Long form', 'Trial'])
/** Max ACTIVE sub-brands a client may create under one parent via the portal. */
const SUBCLIENT_CAP = 20
/** Deepest ancestor chain a client may create through the portal. See createSubClientViaToken. */
const MAX_SUBCLIENT_DEPTH = 4

/**
 * Realtime + bespoke-VN-email fan-out to every profile OWNER/ADMIN about a fresh
 * client request. Uses the TASK_CLIENT_SUBMITTED type so the notification email
 * pipeline picks the taskClientSubmitted template (all data via metadata — no
 * Task exists yet).
 */
async function notifyProfileAdminsOfRequest(
    scope: NonNullable<Awaited<ReturnType<typeof resolveShareToken>>>,
    req: { id: string; title: string; workspaceId: string; rawFootage: string | null; notes: string | null },
    monthLabel: string | null,
) {
    try {
        const admins = await prisma.profileAccess.findMany({
            where: { profileId: scope.profileId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { userId: true },
        })
        const body = `Khách hàng "${scope.clientName}" vừa gửi yêu cầu: "${req.title}"`
        for (const { userId } of admins) {
            try {
                const notif = await createNotificationInternal({
                    userId,
                    type: 'TASK_CLIENT_SUBMITTED',
                    title: 'Yêu cầu mới từ khách hàng',
                    body,
                    metadata: {
                        brand: scope.clientName,
                        projectTitle: req.title,
                        monthLabel,
                        rawLink: req.rawFootage,
                        clientNotes: req.notes,
                        requestId: req.id,
                        inboxWorkspaceId: req.workspaceId,
                    },
                })
                void broadcastNotificationToUser(userId, {
                    id: notif.id, type: notif.type, title: notif.title, body: notif.body,
                    taskId: null, createdAt: notif.createdAt, isRead: false,
                })
            } catch (e) {
                console.error('[share-portal] notifyProfileAdminsOfRequest one failed', e)
            }
        }
    } catch (e) {
        console.error('[share-portal] notifyProfileAdminsOfRequest query failed', e)
    }
}

export interface SubmitClientRequestInput {
    workspaceId: string
    clientId: number
    title: string
    videoList?: string
    desiredType?: string
    desiredDeadline?: string
    rawFootage: string
    collectFile?: string
    bRoll?: string
    references?: string
    submitFolder?: string
    script?: string
    notes?: string
}

/**
 * Client submits a work request from the portal wizard. Token-authed (no
 * session); every id is re-validated against the link's scope. Creates a
 * ClientTaskRequest (status NEW) — NOT a Task — and notifies profile admins.
 * Carries no finance/assignee/frame fields (leak discipline).
 */
export async function submitClientRequestViaToken(token: string, input: SubmitClientRequestInput) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    const rl = await rateLimit(`client-submit-request:${scope.shareLinkId}`, 20, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' }

    // Fail-closed scope checks — client cannot inject another profile's ids.
    if (!input || typeof input.workspaceId !== 'string' || typeof input.clientId !== 'number') {
        return { success: false, error: 'Missing information.' }
    }
    if (!scope.workspaceIds.includes(input.workspaceId)) return { success: false, error: 'Invalid period.' }
    if (!scope.clientIds.includes(input.clientId)) return { success: false, error: 'Invalid brand.' }

    const ws = await prisma.workspace.findFirst({
        where: { id: input.workspaceId, status: 'ACTIVE' },
        select: { id: true, name: true },
    })
    if (!ws) return { success: false, error: 'This period is no longer active.' }

    // Validate + sanitize.
    const title = sanitizeClientText(input.title || '', TITLE_MAX_LEN)
    if (!title) return { success: false, error: 'Please enter a project / video name.' }

    const rawFootage = cleanLink(input.rawFootage)
    if (!looksLikeUrl(rawFootage)) return { success: false, error: 'The raw footage link is invalid (must start with http/https).' }

    // Optional links — validate only when provided.
    const optLink = (v: string | undefined, label: string):
        | { ok: true; val: string | null }
        | { ok: false; error: string } => {
        if (!v || !v.trim()) return { ok: true, val: null }
        const c = cleanLink(v)
        if (!looksLikeUrl(c)) return { ok: false, error: `The ${label} link is invalid.` }
        return { ok: true, val: c }
    }
    const collect = optLink(input.collectFile, 'collect files')
    if (!collect.ok) return { success: false, error: collect.error }
    const broll = optLink(input.bRoll, 'b-roll')
    if (!broll.ok) return { success: false, error: broll.error }
    const refs = optLink(input.references, 'reference')
    if (!refs.ok) return { success: false, error: refs.error }
    const submit = optLink(input.submitFolder, 'submission folder')
    if (!submit.ok) return { success: false, error: submit.error }
    const scriptL = optLink(input.script, 'script')
    if (!scriptL.ok) return { success: false, error: scriptL.error }

    const videoList = input.videoList ? sanitizeClientText(input.videoList, FEEDBACK_MAX_LEN) : null
    const notes = input.notes ? sanitizeClientText(input.notes, FEEDBACK_MAX_LEN) : null
    const desiredType = input.desiredType && DESIRED_TYPES.has(input.desiredType) ? input.desiredType : null
    let desiredDeadline: Date | null = null
    if (input.desiredDeadline) {
        const d = new Date(input.desiredDeadline)
        if (!isNaN(d.getTime())) desiredDeadline = d
    }

    let req: { id: string }
    try {
        req = await prisma.clientTaskRequest.create({
            data: {
                profileId: scope.profileId,          // from scope, never client input
                workspaceId: input.workspaceId,
                clientId: input.clientId,
                viaShareLinkId: scope.shareLinkId,
                submittedVia: 'SHARE_LINK',
                title,
                videoList,
                desiredType,
                desiredDeadline,
                rawFootage,
                collectFile: collect.val,
                bRoll: broll.val,
                refs: refs.val,
                submitFolder: submit.val,
                script: scriptL.val,
                notes,
                status: 'NEW',
            },
            select: { id: true },
        })
    } catch (err) {
        console.error('[submitClientRequestViaToken] create failed', err)
        return { success: false, error: 'Could not send your request. Please try again.' }
    }

    await notifyProfileAdminsOfRequest(
        scope,
        { id: req.id, title, workspaceId: input.workspaceId, rawFootage, notes },
        ws.name,
    )

    void audit({
        workspaceId: input.workspaceId, actorUserId: null, action: 'request.client_submitted',
        targetType: 'ClientTaskRequest', targetId: req.id,
        after: { title, clientId: input.clientId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    try {
        revalidatePath(`/${input.workspaceId}/admin/requests`)
    } catch { /* best-effort */ }

    return { success: true, requestId: req.id }
}

/**
 * Client creates a sub-brand (child client) under an in-scope parent brand.
 * Token-authed; parent must be in scope; profileId forced from scope. The new
 * brand auto-enters the link's scope via name-path resolution on the next
 * resolveShareToken (no extra wiring). Rate-limited tighter than requests.
 */
export async function createSubClientViaToken(token: string, input: { name: string; parentId: number }) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    // DB-backed, like every other portal write: the in-memory limiter resets on each cold start,
    // so on serverless it capped almost nothing.
    const rl = await limitDb(`client-create-subclient:${scope.shareLinkId}`, 10, 60 * 60)
    if (!rl.success) return { success: false, error: 'Too many requests. Please try again later.' }

    if (!input || typeof input.parentId !== 'number') return { success: false, error: 'Missing information.' }
    if (!scope.clientIds.includes(input.parentId)) return { success: false, error: 'Invalid parent brand.' }

    const name = sanitizeClientText(input.name || '', TITLE_MAX_LEN)
    if (!name) return { success: false, error: 'Please enter a brand name.' }

    // Parent must belong to the link's profile (defense-in-depth beyond scope). This read is a
    // fast rejection only — it is NOT the authorization. `parentAt` is carried into the locked
    // section below, which re-proves the parent has not moved or been trashed since.
    const parent = await prisma.client.findFirst({
        where: { id: input.parentId, profileId: scope.profileId, status: 'ACTIVE' },
        select: { id: true, parentId: true },
    })
    if (!parent) return { success: false, error: 'Invalid parent brand.' }
    const parentAt = parent.parentId

    const existing = await prisma.client.count({
        where: { parentId: input.parentId, status: 'ACTIVE' },
    })
    if (existing >= SUBCLIENT_CAP) return { success: false, error: 'You have reached the maximum number of sub-brands.' }

    // [Authz 2026-07] SUBCLIENT_CAP bounds the WIDTH of one parent, not the DEPTH of the tree —
    // and depth is the expensive dimension. resolveShareToken rebuilds a name path for every
    // ACTIVE client in the profile on EVERY portal request, walking parentId upward each time,
    // so cost is O(clients × depth). A client could chain sub-brand inside sub-brand without
    // limit and permanently slow every page load for that agency, from the public side, with no
    // staff action. Four levels is deeper than any real brand hierarchy here.
    let depth = 0
    let cursor: number | null = input.parentId
    const walked = new Set<number>()
    while (cursor != null && depth < MAX_SUBCLIENT_DEPTH && !walked.has(cursor)) {
        walked.add(cursor)
        const row: { parentId: number | null } | null = await prisma.client.findUnique({
            where: { id: cursor },
            select: { parentId: true },
        })
        depth++
        cursor = row?.parentId ?? null
    }
    if (cursor != null || depth >= MAX_SUBCLIENT_DEPTH) {
        return { success: false, error: 'This brand is already nested as deeply as we allow. Ask the studio to add it for you.' }
    }

    // [Authz 2026-07 round 4] THE DUPLICATE GUARD, and the same profile lock the CRM writers
    // take. This path was missed entirely: it creates an ACTIVE Client and had no name check at
    // all, so a client could type a brand name that already exists under their parent and get a
    // second ACTIVE row at the same (profile, parent, name) position — no race required. Two
    // rows on one name path collapse into ONE share scope in resolveShareToken, so either
    // client's link then reads the other's tasks, invoices and files. Six locked CRM actions
    // count for nothing while a public, unauthenticated-by-session endpoint writes past them.
    let client: { id: number; name: string }
    try {
        const outcome: { ok: true; row: { id: number; name: string } } | { ok: false; error: string } =
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope.profileId}, 0))`

                // [round 5 review] The parent's authorization and state are re-proved HERE, not
                // just in the pre-flight read. Everything above ran unlocked, so an admin could
                // detach or trash the parent in between and this write would still land:
                //   • detach -> the parent becomes an independent root that this token no longer
                //     owns on its next request, and we would have written into someone else's
                //     hierarchy while reporting success;
                //   • delete  -> an ACTIVE brand created under a SOFT_DELETED parent, invisible
                //     in the active tree and outside any trashed subtree, so nothing surfaces or
                //     cleans it up.
                // Pinning parentId to the value read a moment ago catches BOTH without having to
                // re-derive the whole token scope: any re-parenting changes it.
                const freshParent = await tx.client.findFirst({
                    where: { id: input.parentId, profileId: scope.profileId, status: 'ACTIVE', parentId: parentAt },
                    select: { id: true },
                })
                if (!freshParent) {
                    return { ok: false as const, error: 'That brand has just changed. Please reload and try again.' }
                }

                // Recounted inside the lock as well: two concurrent creates with DIFFERENT names
                // both read 19 outside it and both committed, taking the parent to 21.
                const liveCount = await tx.client.count({
                    where: { parentId: input.parentId, status: 'ACTIVE' },
                })
                if (liveCount >= SUBCLIENT_CAP) {
                    return { ok: false as const, error: 'You have reached the maximum number of sub-brands.' }
                }

                const norm = (s: string) => (s ?? '').normalize('NFC').trim().toLowerCase()
                const siblings = await tx.client.findMany({
                    where: { parentId: input.parentId, status: 'ACTIVE' },
                    select: { name: true },
                })
                if (siblings.some((s) => norm(s.name) === norm(name))) {
                    return { ok: false as const, error: `You already have a brand called "${name.trim()}".` }
                }
                const row = await tx.client.create({
                    data: {
                        name,
                        parentId: input.parentId,
                        profileId: scope.profileId,   // forced from scope, never client input
                        status: 'ACTIVE',
                    },
                    select: { id: true, name: true },
                })
                return { ok: true as const, row }
            })
        if (!outcome.ok) return { success: false, error: outcome.error }
        client = outcome.row
    } catch (err) {
        console.error('[createSubClientViaToken] create failed', err)
        return { success: false, error: 'Could not create the brand. Please try again.' }
    }

    void audit({
        workspaceId: null, actorUserId: null, action: 'client.created_via_share_link',
        targetType: 'Client', targetId: String(client.id),
        after: { name, parentId: input.parentId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    return { success: true, clientId: client.id, name: client.name }
}

/** Human labels for the deliverable Activity timeline (port of the account version). */
const ACTIVITY_LABELS: Record<string, string> = {
    'task.assigned': 'Project opened',
    'task.started': 'Editing started',
    'task.delivered': 'Submitted for your review',
    'task.completed': 'Approved & delivered',
    'task.client_approved': 'You approved & delivered',
    'task.client_changes_requested': 'You requested changes',
}

export async function getActivityViaToken(token: string, taskId: string) {
    const { scope, task } = await findScopedTask(token, taskId, { id: true })
    if (!scope || !task) return []

    const rows = await prisma.auditLog.findMany({
        where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(ACTIVITY_LABELS) } },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })

    // [Trial P0 — isolation fix] NEVER surface a staff member's real name to the
    // client. Any staff-actor row is shown as a generic label; only the client's
    // own link-driven rows (actorUserId=null) are "You". (Previously leaked the
    // editor/admin nickname here, breaking the "client never knows the editor" rule.)
    return rows.map(r => ({
        label: ACTIVITY_LABELS[r.action] || r.action,
        who: r.actorUserId ? 'Nhóm biên tập' : 'You',
        date: r.createdAt.toISOString(),
    }))
}

/* ───────────────────────────────────────────────────────────────────────────
   [Trial P1] Task comments — the client side of the ClickUp-style feed. The
   client sees ONLY visibility=CLIENT comments (hard-filtered here) merged with
   client-safe activity; anything they post is forced to CLIENT visibility. Staff
   identity is never surfaced (author shows as "The team").
   ─────────────────────────────────────────────────────────────────────────── */

export interface ClientFeedItem {
    kind: 'comment' | 'event'
    id: string
    authorName: string
    body?: string
    label?: string
    createdAt: string
    isMine?: boolean
    /** [P3] null = top-level; else the parent comment id (reply threads). */
    parentId?: string | null
    /** [P3] Aggregated emoji reactions (mine = this share link reacted). */
    reactions?: { emoji: string; count: number; mine: boolean }[]
}

export async function getCommentFeedViaToken(token: string, taskId: string): Promise<ClientFeedItem[]> {
    const { scope, task } = await findScopedTask(token, taskId, { id: true })
    if (!scope || !task) return []

    const [comments, auditRows] = await Promise.all([
        prisma.taskComment.findMany({
            where: { taskId, visibility: 'CLIENT', isDeleted: false },
            orderBy: { createdAt: 'asc' },
            select: { id: true, authorType: true, body: true, createdAt: true, parentId: true },
        }),
        prisma.auditLog.findMany({
            where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(ACTIVITY_LABELS) } },
            orderBy: { createdAt: 'asc' }, take: 30,
        }),
    ])

    // [P3] Reactions on the CLIENT-visible comments only; mine = this share link.
    const commentIds = comments.map(c => c.id)
    const reactionRows = commentIds.length
        ? await prisma.taskCommentReaction.findMany({ where: { commentId: { in: commentIds } }, select: { commentId: true, emoji: true, viaShareLinkId: true } })
        : []
    const reactionsByComment = new Map<string, { emoji: string; count: number; mine: boolean }[]>()
    for (const r of reactionRows) {
        const arr = reactionsByComment.get(r.commentId) || []
        const existing = arr.find(a => a.emoji === r.emoji)
        if (existing) { existing.count++; if (r.viaShareLinkId === scope.shareLinkId) existing.mine = true }
        else arr.push({ emoji: r.emoji, count: 1, mine: r.viaShareLinkId === scope.shareLinkId })
        reactionsByComment.set(r.commentId, arr)
    }

    const commentItems: ClientFeedItem[] = comments.map(c => ({
        kind: 'comment',
        id: c.id,
        // Never reveal a staff name to the client; their own posts read as "You".
        authorName: c.authorType === 'CLIENT' ? 'You' : 'The team',
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        isMine: c.authorType === 'CLIENT',
        parentId: c.parentId ?? null,
        reactions: reactionsByComment.get(c.id) || [],
    }))
    const eventItems: ClientFeedItem[] = auditRows.map(r => ({
        kind: 'event',
        id: `evt-${r.id}`,
        authorName: r.actorUserId ? 'The team' : 'You',
        label: ACTIVITY_LABELS[r.action] || r.action,
        createdAt: r.createdAt.toISOString(),
    }))

    return [...commentItems, ...eventItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function postCommentViaToken(token: string, taskId: string, body: string, parentId?: string | null) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }

    const rl = await rateLimit(`client-comment:${scope.shareLinkId}`, 30, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many messages. Please try again later.' }

    const { task } = await findScopedTask(token, taskId, { id: true, clientId: true, workspaceId: true, assignedById: true, title: true })
    if (!task) return { success: false, error: 'This link is invalid or the item no longer exists.' }

    const clean = sanitizeClientText(body || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Please write a message.' }

    // [P3] Reply: the parent must be a live CLIENT-visible comment on THIS task
    // (a client can never reply to — or even see — an internal note).
    let safeParentId: string | null = null
    if (parentId) {
        const parent = await prisma.taskComment.findFirst({
            where: { id: parentId, taskId, isDeleted: false, visibility: 'CLIENT' },
            select: { id: true },
        })
        if (!parent) return { success: false, error: 'The comment you replied to no longer exists.' }
        safeParentId = parent.id
    }

    let created: { id: string; createdAt: Date }
    try {
        created = await prisma.taskComment.create({
            data: {
                taskId,
                authorType: 'CLIENT',
                visibility: 'CLIENT',        // forced — a client can never post an internal note
                body: clean,
                viaShareLinkId: scope.shareLinkId,
                clientId: task.clientId ?? null,
                mentions: [],
                parentId: safeParentId,
            },
            select: { id: true, createdAt: true },
        })
    } catch (err) {
        console.error('[postCommentViaToken] create failed', err)
        return { success: false, error: 'Could not post your comment. Please try again.' }
    }

    // Notify the task's Manager (assignedById) that the client commented.
    if (task.assignedById) {
        try {
            const n = await createNotificationInternal({
                userId: task.assignedById, type: 'TASK_COMMENT', title: 'Khách hàng bình luận',
                body: `Khách hàng "${scope.clientName}" bình luận trong "${task.title}": ${clean.slice(0, 140)}`,
                taskId, metadata: { taskTitle: task.title, preview: clean.slice(0, 200) },
            })
            void broadcastNotificationToUser(task.assignedById, {
                id: n.id, type: n.type, title: n.title, body: n.body, taskId, createdAt: n.createdAt, isRead: false,
            })
        } catch (e) { console.error('[postCommentViaToken] notify manager failed', e) }
    }

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'task.comment_added',
        targetType: 'Task', targetId: taskId,
        after: { via: 'share_link', viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })

    return { success: true, id: created.id, createdAt: created.createdAt.toISOString() }
}

/**
 * [P3] Toggle the client's emoji reaction on a CLIENT-visible comment. Keyed by
 * the share link (anonymous). Re-resolves scope + confirms the comment belongs
 * to a task in scope AND is CLIENT-visible (never lets a token touch an internal
 * note). Lightly rate-limited.
 */
export async function toggleReactionViaToken(token: string, commentId: string, emoji: string) {
    const scope = await resolveShareToken(token)
    if (!scope) return { success: false, error: 'This link is invalid.' }
    if (!isValidReaction(emoji)) return { success: false, error: 'Unsupported reaction.' }

    const rl = await rateLimit(`client-react:${scope.shareLinkId}`, 120, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Too many actions. Please try again later.' }

    const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, isDeleted: false, visibility: 'CLIENT' },
        select: { id: true, taskId: true },
    })
    if (!comment) return { success: false, error: 'This comment no longer exists.' }

    // Confirm the comment's task is inside this token's scope.
    const { task } = await findScopedTask(token, comment.taskId, { id: true })
    if (!task) return { success: false, error: 'This link is invalid.' }

    const existing = await prisma.taskCommentReaction.findFirst({
        where: { commentId, emoji, viaShareLinkId: scope.shareLinkId },
        select: { id: true },
    })
    if (existing) {
        await prisma.taskCommentReaction.delete({ where: { id: existing.id } })
        return { success: true, reacted: false }
    }
    await prisma.taskCommentReaction.create({ data: { commentId, emoji, viaShareLinkId: scope.shareLinkId } })
    return { success: true, reacted: true }
}

/* ───────────────────────────────────────────────────────────────────────────
   [The Desk] Correspondence — client's own work requests + the studio's reply.
   READ-ONLY: only findMany, uniform null failure, no writes/revalidate/audit.
   ─────────────────────────────────────────────────────────────────────────── */

const REQUEST_STATUS_LABEL: Record<string, { status: ClientRequestPortalDTO['status']; label: string }> = {
    NEW: { status: 'pending', label: 'Submitted' },
    REVIEWING: { status: 'reviewing', label: 'Under review' },
    ACCEPTED: { status: 'accepted', label: 'Accepted' },
    REJECTED: { status: 'declined', label: 'Declined' },
}

/**
 * The client's own ClientTaskRequest rows, most-recent first, scoped by the SAME
 * dual-membership guard as every other token read (`clientId ∈ scope.clientIds`
 * AND `workspaceId ∈ scope.workspaceIds`). A whitelist `select` never touches the
 * staff-only columns (reviewedById, viaShareLinkId, profileId, submittedVia); the
 * studio's decision note is exposed ONLY once a decision exists (rejectionNote on
 * a decline, taskId on an accept). No finance/assignee fields exist on this model
 * by design. Orphaned (clientId=null) rows fail the `in` and are excluded.
 */
export async function getClientRequestsViaToken(token: string): Promise<ClientRequestPortalDTO[] | null> {
    const scope = await resolveShareToken(token)
    if (!scope) return null

    const rows = await prisma.clientTaskRequest.findMany({
        where: { clientId: { in: scope.clientIds }, workspaceId: { in: scope.workspaceIds } },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true, title: true, status: true,
            desiredType: true, desiredDeadline: true, videoList: true, notes: true,
            rawFootage: true, collectFile: true, bRoll: true, refs: true, submitFolder: true, script: true,
            rejectionNote: true, taskId: true, createdAt: true, reviewedAt: true, workspaceId: true,
            client: { select: { id: true, name: true, parent: { select: { name: true } } } },
        },
    })

    // Batched period-label lookup (does not widen scope — ids come from the scoped rows).
    const wsIds = Array.from(new Set(rows.map(r => r.workspaceId).filter(Boolean)))
    const wsRows = wsIds.length
        ? await prisma.workspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true } })
        : []
    const wsNameById = new Map(wsRows.map(w => [w.id, w.name]))
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

    return rows.map((r): ClientRequestPortalDTO => {
        const m = REQUEST_STATUS_LABEL[r.status] ?? { status: 'pending' as const, label: 'Submitted' }
        return {
            id: r.id,
            title: r.title,
            status: m.status,
            statusLabel: m.label,
            submittedAt: r.createdAt.toISOString(),
            reviewedAt: iso(r.reviewedAt),
            desiredType: r.desiredType,
            desiredDeadline: iso(r.desiredDeadline),
            videoList: r.videoList,
            notes: r.notes,
            rawFootage: r.rawFootage,
            collectFile: r.collectFile,
            bRoll: r.bRoll,
            refs: r.refs,
            submitFolder: r.submitFolder,
            script: r.script,
            // Studio reply is surfaced ONLY after a decision — note on decline, task on accept.
            studioReply: r.status === 'REJECTED' ? (r.rejectionNote ?? null) : null,
            linkedTaskId: r.status === 'ACCEPTED' ? (r.taskId ?? null) : null,
            brandName: r.client ? (r.client.parent ? `${r.client.parent.name} / ${r.client.name}` : r.client.name) : null,
            periodName: wsNameById.get(r.workspaceId) ?? null,
        }
    })
}
