// [Review module P5.1] Staff-side share-link service (API-SPEC §5.1–5.4, FR-F01/F04/F05).
// Guests never call anything here — their surface is share-auth/share-guest.
//
// Permission model (PRD FR-F04):
//   create: any member. list: ADMIN sees the workspace's links; USER sees links
//   they created + links on tasks assigned to them. update options: creator or
//   ADMIN. revoke/un-revoke: creator or ADMIN. hard delete: ADMIN only.
// Share always targets the STACK (asset) or a folder — never a version.

import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import type { Prisma, ShareLink } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { apiError } from './errors'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { toUserRef, type ItemType, type UserRef } from './dto'
import { auditReviewFeed } from './feed-audit'

const SLUG_LEN = 12
const MAX_ITEMS = 20
const BCRYPT_ROUNDS = 10
const PASSWORD_MIN = 4
const PASSWORD_MAX = 72 // bcrypt input cap

export type ShareState = 'active' | 'revoked' | 'expired'

export interface ShareItemRef {
    type: ItemType
    id: string
    title: string
}

export interface ShareDto {
    id: string
    slug: string
    url: string
    name: string
    items: ShareItemRef[]
    allowComments: boolean
    allowDownload: boolean
    downloadOnlyWhenApproved: boolean
    showAllVersions: boolean
    hasPassword: boolean
    expiresAt: string | null
    revokedAt: string | null
    state: ShareState
    viewCount: number
    lastViewedAt: string | null
    taskId: string | null
    createdBy: UserRef | null
    createdAt: string
    rowVersion: number
}

export interface ShareActivityDto {
    id: string
    type: string
    guestName: string | null
    /** ADMIN only — plain members always get null (GDPR minimization). */
    guestEmail: string | null
    actorName: string | null
    meta: Record<string, unknown> | null
    createdAt: string
}

export function shareUrl(slug: string): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz').replace(/\/$/, '')
    return `${base}/r/${slug}`
}

export function shareState(share: Pick<ShareLink, 'revokedAt' | 'expiresAt'>): ShareState {
    if (share.revokedAt) return 'revoked'
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return 'expired'
    return 'active'
}

type ShareWithItemsRow = Prisma.ShareLinkGetPayload<{ include: { items: true } }>

/** Batch-resolve item titles + creators for a page of shares (2 queries total). */
async function serializeShares(rows: ShareWithItemsRow[]): Promise<ShareDto[]> {
    const assetIds = new Set<string>()
    const folderIds = new Set<string>()
    const userIds = new Set<string>()
    for (const s of rows) {
        userIds.add(s.createdById)
        for (const i of s.items) {
            if (i.assetId) assetIds.add(i.assetId)
            if (i.folderId) folderIds.add(i.folderId)
        }
    }
    const [assets, folders, users] = await Promise.all([
        assetIds.size
            ? prisma.reviewAsset.findMany({ where: { id: { in: [...assetIds] } }, select: { id: true, name: true } })
            : [],
        folderIds.size
            ? prisma.reviewFolder.findMany({ where: { id: { in: [...folderIds] } }, select: { id: true, name: true } })
            : [],
        userIds.size
            ? prisma.user.findMany({
                  where: { id: { in: [...userIds] } },
                  select: { id: true, username: true, nickname: true, avatarUrl: true },
              })
            : [],
    ])
    const assetName = new Map(assets.map((a) => [a.id, a.name]))
    const folderName = new Map(folders.map((f) => [f.id, f.name]))
    const userById = new Map(users.map((u) => [u.id, u]))

    return rows.map((s) => {
        const items: ShareItemRef[] = [...s.items]
            .sort((a, b) => a.sortIndex - b.sortIndex)
            .map((i) =>
                i.assetId
                    ? { type: 'asset' as const, id: i.assetId, title: assetName.get(i.assetId) ?? '—' }
                    : { type: 'folder' as const, id: i.folderId!, title: folderName.get(i.folderId!) ?? '—' },
            )
        return {
            id: s.id,
            slug: s.slug,
            url: shareUrl(s.slug),
            name: s.name ?? items[0]?.title ?? 'Link chia sẻ',
            items,
            allowComments: s.allowComments,
            allowDownload: s.allowDownload,
            downloadOnlyWhenApproved: s.downloadOnlyWhenApproved,
            showAllVersions: s.showAllVersions,
            hasPassword: s.passwordHash != null, // never emit the hash
            expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
            revokedAt: s.revokedAt ? s.revokedAt.toISOString() : null,
            state: shareState(s),
            viewCount: s.viewCount,
            lastViewedAt: s.lastViewedAt ? s.lastViewedAt.toISOString() : null,
            taskId: s.taskId,
            createdBy: toUserRef(userById.get(s.createdById) ?? null),
            createdAt: s.createdAt.toISOString(),
            rowVersion: s.rowVersion,
        }
    })
}

async function serializeShare(row: ShareWithItemsRow): Promise<ShareDto> {
    return (await serializeShares([row]))[0]
}

// ─────────────────────────── create (FR-F01) ───────────────────────────

export interface CreateShareInput {
    workspaceId: string
    items: { type: ItemType; id: string }[]
    name?: string
    allowComments?: boolean
    allowDownload?: boolean
    downloadOnlyWhenApproved?: boolean
    showAllVersions?: boolean
    password?: string | null
    expiresAt?: string | null
}

export async function createShareLink(input: CreateShareInput): Promise<{ share: ShareDto }> {
    const access = await requireReviewAccess({ workspaceId: input.workspaceId })

    if (!input.items.length || input.items.length > MAX_ITEMS) {
        throw apiError(400, 'VALIDATION_ERROR', `Chọn 1–${MAX_ITEMS} mục để chia sẻ.`)
    }
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)

    const [assets, folders] = await Promise.all([
        assetIds.length
            ? prisma.reviewAsset.findMany({
                  where: { id: { in: assetIds }, workspaceId: input.workspaceId, deletedAt: null },
                  select: { id: true, taskId: true },
              })
            : [],
        folderIds.length
            ? prisma.reviewFolder.findMany({
                  where: { id: { in: folderIds }, workspaceId: input.workspaceId, deletedAt: null },
                  select: { id: true },
              })
            : [],
    ])
    if (assets.length !== assetIds.length || folders.length !== folderIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Có mục không tồn tại hoặc đã nằm trong thùng rác.')
    }

    const expiresAt = parseExpiry(input.expiresAt)
    const passwordHash = await hashPassword(input.password)

    // Single-asset share created from a task's deliverable inherits the taskId —
    // powers the drawer's share table + "Copy link khách".
    const taskId = assets.length === 1 && folders.length === 0 ? assets[0].taskId : null

    const share = await prisma.$transaction(async (tx) => {
        const created = await tx.shareLink.create({
            data: {
                slug: nanoid(SLUG_LEN),
                workspaceId: input.workspaceId,
                taskId,
                name: input.name?.trim() || null,
                allowComments: input.allowComments ?? true,
                allowDownload: input.allowDownload ?? false,
                downloadOnlyWhenApproved: input.downloadOnlyWhenApproved ?? true,
                showAllVersions: input.showAllVersions ?? false,
                passwordHash,
                expiresAt,
                createdById: access.userId,
                items: {
                    create: input.items.map((i, idx) => ({
                        assetId: i.type === 'asset' ? i.id : null,
                        folderId: i.type === 'folder' ? i.id : null,
                        sortIndex: idx,
                    })),
                },
            },
            include: { items: true },
        })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.SHARE_CREATED,
            workspaceId: input.workspaceId,
            taskId,
            shareLinkId: created.id,
            assetId: assets.length === 1 ? assets[0].id : null,
            actorUserId: access.userId,
            meta: { slug: created.slug },
        })
        return created
    })
    // FR-G01: "{user} đã tạo link review" into the task feed + admin log.
    void auditReviewFeed({
        action: 'video.share_created',
        workspaceId: input.workspaceId,
        taskId,
        assetId: assets.length === 1 ? assets[0].id : null,
        actorUserId: access.userId,
        meta: { slug: share.slug },
    })
    return { share: await serializeShare(share) }
}

/**
 * "Copy link khách" (FR-A06 AC3): one ACTIVE share per asset, get-or-create with
 * defaults in a single click. Reuses the oldest live link that contains the asset
 * as a direct item; otherwise creates a fresh default share.
 */
export async function getOrCreatePrimaryShareForAsset(
    assetId: string,
): Promise<{ share: ShareDto; created: boolean }> {
    const asset = await prisma.reviewAsset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: { id: true, workspaceId: true, taskId: true },
    })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })

    // Reuse an existing ACTIVE share for this asset — but for a non-admin only if it's
    // in their FR-F04 scope (own, or on a task assigned to them). Otherwise "Copy link
    // khách" would hand back a colleague's slug/url (id leak → the getShareDetail vector),
    // so an out-of-scope member falls through to creating their own default share instead.
    const scope: Prisma.ShareLinkWhereInput = access.isAdmin
        ? {}
        : { OR: [{ createdById: access.userId }, ...(asset.taskId ? [{ taskId: asset.taskId }] : [])] }

    // [O2] Serialize get-or-create for THIS asset with a transaction-scoped advisory lock: two
    // concurrent "Copy link khách" calls could both miss the existing-share check and each mint a
    // duplicate ACTIVE share (the second becomes an orphan URL surviving a revoke of the "primary").
    // The lock is held until this tx commits, by which point a share created below is visible to the
    // next waiter, which reuses it instead of creating another.
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${asset.id}, 0))`
        const existing = await tx.shareLink.findFirst({
            where: {
                revokedAt: null,
                AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, scope],
                items: { some: { assetId: asset.id } },
            },
            orderBy: { createdAt: 'asc' },
            include: { items: true },
        })
        // A non-admin's task-scope reuse still requires the task to actually be assigned to
        // them; the `taskId` filter above only narrows to the asset's task, so re-check.
        if (existing && !access.isAdmin && existing.createdById !== access.userId) {
            if (asset.taskId) {
                const mine = await tx.task.findFirst({
                    where: { id: asset.taskId, workspaceId: asset.workspaceId, assigneeId: access.userId },
                    select: { id: true },
                })
                if (!mine) {
                    const { share } = await createShareLink({ workspaceId: asset.workspaceId, items: [{ type: 'asset', id: asset.id }] })
                    return { share, created: true }
                }
            }
        }
        if (existing) return { share: await serializeShare(existing), created: false }

        const { share } = await createShareLink({
            workspaceId: asset.workspaceId,
            items: [{ type: 'asset', id: asset.id }],
        })
        return { share, created: true }
    })
}

/**
 * [B5/P4] TOKEN-SAFE get-or-create of the client review link for a task deliverable.
 * Unlike getOrCreatePrimaryShareForAsset this does NOT call requireReviewAccess — the
 * CALLER (share-portal getShareSnapshot) has already authorized the asset through the
 * client's own share-token scope (task.clientId ∈ scope) AND the R5 client-phase gate.
 * It materializes the `/r/{slug}` link the admin-Duyệt bridge would have created when the
 * task was sent to the client, for the case where the bridge never committed.
 *
 * Reuses ANY live (non-revoked, unexpired) share that already exposes this asset — incl.
 * a bridge-created one — so it never mints a second link. Otherwise creates a default OPEN
 * share (no password), owned by the asset's creator (the uploader — a real staff User FK).
 * Silent: no activity / audit feed (this is a client-driven read, not a staff action).
 * Returns the slug for `/r/{slug}`.
 */
export async function getOrCreateClientReviewSlug(asset: {
    id: string
    workspaceId: string
    taskId: string | null
    createdById: string
}): Promise<string> {
    // 1. Try to find a live share link containing this asset that ALREADY has allowDownload enabled
    // and no password, to avoid minting duplicates when one is already available.
    const alreadyEnabled = await prisma.shareLink.findFirst({
        where: {
            revokedAt: null,
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            items: { some: { assetId: asset.id } },
            allowDownload: true,
            downloadOnlyWhenApproved: false,
            passwordHash: null,
        },
        orderBy: { createdAt: 'asc' },
        select: { slug: true },
    })
    if (alreadyEnabled) {
        return alreadyEnabled.slug
    }

    // 2. Try to find an existing active share that is unambiguously the client's own board
    // (created by the asset's uploader, single-item, no password). We can safely upgrade this.
    const upgradable = await prisma.shareLink.findFirst({
        where: {
            revokedAt: null,
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
            items: { some: { assetId: asset.id } },
            createdById: asset.createdById,
            passwordHash: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            slug: true,
            _count: {
                select: { items: true }
            }
        }
    })
    if (upgradable && upgradable._count.items === 1) {
        await prisma.shareLink.update({
            where: { id: upgradable.id },
            data: { allowDownload: true, downloadOnlyWhenApproved: false },
        })
        return upgradable.slug
    }

    const created = await prisma.shareLink.create({
        data: {
            slug: nanoid(SLUG_LEN),
            workspaceId: asset.workspaceId,
            taskId: asset.taskId,
            allowComments: true,
            showAllVersions: false,
            // Client downloads the original (identical to the uploaded file) from their review
            // board. Not gated behind approval so the download works as soon as it's shared.
            allowDownload: true,
            downloadOnlyWhenApproved: false,
            createdById: asset.createdById,
            items: { create: [{ assetId: asset.id, sortIndex: 0 }] },
        },
        select: { slug: true },
    })
    return created.slug
}

// ─────────────────────────── list / detail (FR-F04) ───────────────────────────

export interface ListSharesQuery {
    workspaceId: string
    taskId?: string
    assetId?: string
    state?: ShareState
    limit?: number
    cursor?: string
}

export async function listShares(q: ListSharesQuery): Promise<{ items: ShareDto[]; nextCursor: string | null; total: number }> {
    const access = await requireReviewAccess({ workspaceId: q.workspaceId })
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200)

    const where: Prisma.ShareLinkWhereInput = { workspaceId: q.workspaceId }
    if (q.taskId) where.taskId = q.taskId
    if (q.assetId) where.items = { some: { assetId: q.assetId } }
    if (q.state === 'revoked') where.revokedAt = { not: null }
    if (q.state === 'active') {
        where.revokedAt = null
        where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    }
    if (q.state === 'expired') {
        where.revokedAt = null
        where.expiresAt = { lte: new Date() }
    }

    // USER scope: own links + links on tasks assigned to them (PRD FR-F04 AC3).
    if (!access.isAdmin) {
        const myTasks = await prisma.task.findMany({
            where: { workspaceId: q.workspaceId, assigneeId: access.userId },
            select: { id: true },
        })
        where.AND = [{ OR: [{ createdById: access.userId }, { taskId: { in: myTasks.map((t) => t.id) } }] }]
    }

    const [rows, total] = await Promise.all([
        prisma.shareLink.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit + 1,
            ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
            include: { items: true },
        }),
        prisma.shareLink.count({ where }),
    ])
    const page = rows.slice(0, limit)
    return {
        items: await serializeShares(page),
        nextCursor: rows.length > limit ? page[page.length - 1].id : null,
        total,
    }
}

export async function getShareDetail(id: string): Promise<{ share: ShareDto; activity: ShareActivityDto[] }> {
    const row = await prisma.shareLink.findUnique({ where: { id }, include: { items: true } })
    if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy link chia sẻ.')
    const access = await requireReviewAccess({ workspaceId: row.workspaceId })
    // FR-F04 scope: a plain USER may only see shares they created OR on tasks assigned
    // to them — same rule listShares enforces. Without this a member could read another
    // member's guest-activity feed (names/views) by learning the share id. 404 (not 403)
    // so it doesn't confirm the id exists to an out-of-scope member.
    await assertShareInScope(row, access)

    const events = await prisma.reviewActivity.findMany({
        where: { shareLinkId: row.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
    })

    // guestEmail is ADMIN-only (GDPR minimization) — resolved via GuestSession.
    const emailBySession = new Map<string, string>()
    if (access.isAdmin) {
        const sessionIds = [...new Set(events.map((e) => e.guestSessionId).filter((x): x is string => !!x))]
        if (sessionIds.length) {
            const sessions = await prisma.guestSession.findMany({
                where: { id: { in: sessionIds } },
                select: { id: true, email: true },
            })
            for (const s of sessions) emailBySession.set(s.id, s.email)
        }
    }
    const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((x): x is string => !!x))]
    const actors = actorIds.length
        ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, username: true, nickname: true } })
        : []
    const actorName = new Map(actors.map((u) => [u.id, u.nickname || u.username]))

    return {
        share: await serializeShare(row),
        activity: events.map((e) => ({
            id: e.id,
            type: e.type,
            guestName: e.guestName,
            guestEmail: e.guestSessionId ? emailBySession.get(e.guestSessionId) ?? null : null,
            actorName: e.actorUserId ? actorName.get(e.actorUserId) ?? null : null,
            meta: (e.meta as Record<string, unknown> | null) ?? null,
            createdAt: e.createdAt.toISOString(),
        })),
    }
}

// ─────────────────────────── update options (FR-F05) ───────────────────────────

export interface UpdateShareInput {
    name?: string
    allowComments?: boolean
    allowDownload?: boolean
    downloadOnlyWhenApproved?: boolean
    showAllVersions?: boolean
    /** string = set new password · null = remove · absent = keep */
    password?: string | null
    expiresAt?: string | null
    expectedRowVersion: number
}

export async function updateShareOptions(id: string, input: UpdateShareInput): Promise<{ share: ShareDto }> {
    const row = await requireShareManageAccess(id)

    const data: Prisma.ShareLinkUpdateManyMutationInput = { rowVersion: { increment: 1 } }
    if (input.name !== undefined) data.name = input.name.trim() || null
    if (input.allowComments !== undefined) data.allowComments = input.allowComments
    if (input.allowDownload !== undefined) data.allowDownload = input.allowDownload
    if (input.downloadOnlyWhenApproved !== undefined) data.downloadOnlyWhenApproved = input.downloadOnlyWhenApproved
    if (input.showAllVersions !== undefined) data.showAllVersions = input.showAllVersions
    if (input.password !== undefined) data.passwordHash = await hashPassword(input.password)
    if (input.expiresAt !== undefined) data.expiresAt = parseExpiry(input.expiresAt)

    const res = await prisma.shareLink.updateMany({
        where: { id, rowVersion: input.expectedRowVersion },
        data,
    })
    if (res.count === 0) {
        const current = await prisma.shareLink.findUnique({ where: { id }, include: { items: true } })
        throw apiError(409, 'ROW_VERSION_MISMATCH', 'Link đã bị thay đổi. Tải lại rồi thử lại.', {
            current: current ? await serializeShare(current) : null,
        })
    }
    const updated = await prisma.shareLink.findUniqueOrThrow({ where: { id }, include: { items: true } })
    return { share: await serializeShare(updated) }
}

// ─────────────────────────── revoke / un-revoke / delete (FR-F04) ───────────────────────────

export async function setShareRevoked(id: string, revoked: boolean): Promise<{ share: ShareDto }> {
    const { row, access } = await requireShareManageAccessFull(id)
    if (!!row.revokedAt === revoked) {
        return { share: await serializeShare(row) } // idempotent no-op
    }
    const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.shareLink.update({
            where: { id },
            data: { revokedAt: revoked ? new Date() : null, rowVersion: { increment: 1 } },
            include: { items: true },
        })
        await recordActivity(tx, {
            type: revoked ? REVIEW_ACTIVITY.SHARE_REVOKED : REVIEW_ACTIVITY.SHARE_UNREVOKED,
            workspaceId: row.workspaceId,
            taskId: row.taskId,
            shareLinkId: row.id,
            actorUserId: access.userId,
            meta: { slug: row.slug },
        })
        return u
    })
    // FR-G01: "{user} đã thu hồi / mở lại link review" — distinct actions so the feed
    // + admin log don't mislabel a re-opened link as revoked.
    void auditReviewFeed({
        action: revoked ? 'video.share_revoked' : 'video.share_unrevoked',
        workspaceId: row.workspaceId,
        taskId: row.taskId,
        actorUserId: access.userId,
        meta: { slug: row.slug, revoked },
    })
    return { share: await serializeShare(updated) }
}

export async function deleteShare(id: string): Promise<{ deleted: true }> {
    const row = await prisma.shareLink.findUnique({ where: { id } })
    if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy link chia sẻ.')
    // WORKSPACE-scoped admin (OWNER/ADMIN of the workspace or its profile) — NOT the
    // global JWT role. `admin:true` on requireReviewAccess gates on the GLOBAL User.role
    // which both under- and over-permits here: a global-ADMIN who is only a MEMBER of
    // this workspace could hard-delete (escalation, more than revoke allows), while a
    // workspace OWNER whose global role is USER could not delete their own link. Use the
    // same workspace-scoped predicate as revoke/update (access.isAdmin).
    const access = await requireReviewAccess({ workspaceId: row.workspaceId })
    if (!access.isAdmin) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ admin của workspace mới xóa được link.')
    }
    await prisma.shareLink.delete({ where: { id } }) // activity rows survive (no FK)
    return { deleted: true }
}

// ─────────────────────────── helpers ───────────────────────────

async function requireShareManageAccess(id: string) {
    const { row } = await requireShareManageAccessFull(id)
    return row
}

/** FR-F04 read scope for a non-admin: creator, or a link on a task assigned to them.
 *  Throws 404 (anti-enumeration) when out of scope. Admins pass unconditionally. */
async function assertShareInScope(
    row: { createdById: string; taskId: string | null; workspaceId: string },
    access: { userId: string; isAdmin: boolean },
): Promise<void> {
    if (access.isAdmin || row.createdById === access.userId) return
    if (row.taskId) {
        const mine = await prisma.task.findFirst({
            where: { id: row.taskId, workspaceId: row.workspaceId, assigneeId: access.userId },
            select: { id: true },
        })
        if (mine) return
    }
    throw apiError(404, 'NOT_FOUND', 'Không tìm thấy link chia sẻ.')
}

/** Creator or workspace-ADMIN — the manage bar for options + revoke (FR-F04 AC3). */
async function requireShareManageAccessFull(id: string) {
    const row = await prisma.shareLink.findUnique({ where: { id }, include: { items: true } })
    if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy link chia sẻ.')
    const access = await requireReviewAccess({ workspaceId: row.workspaceId })
    if (!access.isAdmin && row.createdById !== access.userId) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ người tạo link hoặc admin mới chỉnh được link này.')
    }
    return { row, access }
}

async function hashPassword(password: string | null | undefined): Promise<string | null> {
    if (password == null) return null
    const trimmed = password.trim()
    if (trimmed.length < PASSWORD_MIN || trimmed.length > PASSWORD_MAX) {
        throw apiError(400, 'VALIDATION_ERROR', `Mật khẩu phải từ ${PASSWORD_MIN}–${PASSWORD_MAX} ký tự.`)
    }
    return bcrypt.hash(trimmed, BCRYPT_ROUNDS)
}

function parseExpiry(value: string | null | undefined): Date | null {
    if (value == null) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) {
        throw apiError(400, 'VALIDATION_ERROR', 'Ngày hết hạn không hợp lệ.')
    }
    return d
}
