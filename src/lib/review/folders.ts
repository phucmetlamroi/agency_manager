// [Review module P2.1] Team asset-browser read+mutation service (API-SPEC §1).
// Infinite-depth folder tree scoped to a month workspace. Every entry point
// re-verifies workspace membership from the RESOLVED workspace (defense in depth
// — never trusts the caller's scope). Carries NO finance fields: the review
// models have none, so nothing here can leak jobPriceUSD to non-admin staff.
//
// The workspace "root" is a REAL ReviewFolder row (systemKey `ws:{id}`, parentId
// null, depth 0) — created lazily by the task-upload auto-chain (P1.5) or on the
// first browser "New Folder". The browser's root view = that row's children;
// createFolder(parentId=null) nests under it. Materialized `path` powers subtree
// scans + ancestor byte-rollups in one UPDATE (DATA-MODEL §9, §11).

import { prisma } from '@/lib/db'
import { Prisma, ReviewState } from '@prisma/client'
import { randomUUID } from 'crypto'
import { requireReviewAccess } from './access'
import {
    getFolderScope,
    isPathVisible,
    isPathMutable,
    assertFolderPathMutable,
    assertFolderPathsMutable,
    assertAssetInScope,
} from './folder-scope'
import { apiError } from './errors'
import {
    serializeFolder,
    serializeAsset,
    serializeVersion,
    toUserRef,
    type FolderDto,
    type AssetDto,
    type ItemType,
    type UserRef,
} from './dto'
import { buildMediaLinks } from './media-links'
import { buildSystemKey } from './upload-helpers'

const MAX_DEPTH = 20 // API-SPEC §1.1 (block abuse)
const NAME_MAX = 255
const TREE_CAP = 2000 // §1.4
const BULK_CAP = 200 // §1.6/§1.8 (PRD FR-B11)
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

export interface BreadcrumbItem {
    id: string
    name: string
}

export type SortField = 'name' | 'createdAt' | 'status' | 'duration' | 'sizeBytes' | 'uploader' | 'commentCount'
export type SortDir = 'asc' | 'desc'

export interface ListChildrenResult {
    folders: FolderDto[]
    assets: AssetDto[]
    summary: { folderCount: number; assetCount: number; totalBytes: string }
    nextCursor: string | null
}

export interface TrashItemDto {
    type: ItemType
    id: string
    name: string
    deletedAt: string
    purgeAt: string
    deletedBy: UserRef | null
    restorable: boolean
    meta: { itemCount?: number; sizeBytes?: string; versionCount?: number }
}

// ─────────────────────────── helpers ───────────────────────────

/** ids embedded in a materialized path "/a/b/c/" → ["a","b","c"] (root → self). */
export function pathIds(path: string): string[] {
    return path.split('/').filter(Boolean)
}

/** ancestor ids of a folder, EXCLUDING itself (root → parent). */
function ancestorIdsAbove(folder: { path: string }): string[] {
    return pathIds(folder.path).slice(0, -1)
}

function validateName(raw: string | undefined | null): string {
    const name = (raw ?? 'Untitled Folder').trim()
    if (name.length < 1 || name.length > NAME_MAX) {
        throw apiError(400, 'VALIDATION_ERROR', 'Tên thư mục phải từ 1–255 ký tự.')
    }
    if (name.includes('/')) {
        throw apiError(400, 'VALIDATION_ERROR', 'Tên thư mục không được chứa dấu "/".')
    }
    return name
}

/**
 * Resolve a non-colliding folder name under `parentId` by appending " (2)", " (3)"…
 * (FR-B03 AC3). Folder names carry no DB unique, so this is a best-effort read-then-
 * pick inside the caller's tx; a truly-simultaneous duplicate could still slip a twin
 * (acceptable — the spec explicitly makes names non-unique). Runs on the caller's tx.
 */
async function uniqueChildName(tx: Prisma.TransactionClient, parentId: string, desired: string): Promise<string> {
    const siblings = await tx.reviewFolder.findMany({
        where: { parentId, deletedAt: null },
        select: { name: true },
    })
    const taken = new Set(siblings.map((s) => s.name))
    if (!taken.has(desired)) return desired
    for (let i = 2; i < 1000; i++) {
        const candidate = `${desired} (${i})`
        if (!taken.has(candidate)) return candidate
    }
    return `${desired} (${randomUUID().slice(0, 8)})`
}

/** Add `delta` bytes (may be negative) to every folder in `ids` in one UPDATE. */
export async function addBytesToAncestors(tx: Prisma.TransactionClient, ids: string[], delta: bigint): Promise<void> {
    if (ids.length === 0 || delta === BigInt(0)) return
    await tx.$executeRaw(
        Prisma.sql`UPDATE "ReviewFolder" SET "totalSizeBytes" = "totalSizeBytes" + ${delta} WHERE id IN (${Prisma.join(ids)})`,
    )
}

/** Sum of live version bytes for a stack (the bytes it contributes to folder rollups). */
export async function liveStackBytes(tx: Prisma.TransactionClient, assetId: string): Promise<bigint> {
    const agg = await tx.reviewVersion.aggregate({ where: { assetId, deletedAt: null }, _sum: { sizeBytes: true } })
    return agg._sum.sizeBytes ?? BigInt(0)
}

interface RootRef {
    id: string
    path: string
    depth: number
    name: string
}

/** Read the workspace root (systemKey `ws:{id}`) — null if it doesn't exist yet. */
async function readRoot(workspaceId: string): Promise<RootRef | null> {
    const row = await prisma.reviewFolder.findUnique({ where: { systemKey: buildSystemKey({ workspaceId }) } })
    return row ? { id: row.id, path: row.path, depth: row.depth, name: row.name } : null
}

/**
 * Ensure the workspace root exists. Runs OUTSIDE any caller transaction (its own
 * create + P2002 refetch) so a create race — a browser New-Folder colliding with
 * a task-upload auto-chain in a fresh workspace — never aborts the caller's tx.
 */
async function ensureWorkspaceRoot(workspaceId: string, createdById?: string): Promise<RootRef> {
    const systemKey = buildSystemKey({ workspaceId })
    const existing = await prisma.reviewFolder.findUnique({ where: { systemKey } })
    if (existing) return existing
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
    const id = randomUUID()
    try {
        const created = await prisma.reviewFolder.create({
            data: {
                id,
                workspaceId,
                parentId: null,
                name: ws?.name || 'Team',
                path: `/${id}/`,
                depth: 0,
                systemKey,
                createdById: createdById ?? null,
            },
        })
        return created
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const row = await prisma.reviewFolder.findUnique({ where: { systemKey } })
            if (row) return row
        }
        throw e
    }
}

/** Batch-load users → UserRef map (display-name rules applied once). */
async function loadUserRefs(userIds: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (ids.length === 0) return new Map()
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
    })
    const map = new Map<string, UserRef>()
    for (const u of users) {
        const ref = toUserRef(u)
        if (ref) map.set(u.id, ref)
    }
    return map
}

// ─────────────────────────── create ───────────────────────────

export async function createFolder(input: {
    workspaceId: string
    parentId: string | null
    name?: string
}): Promise<FolderDto> {
    const access = await requireReviewAccess({ workspaceId: input.workspaceId })
    const name = validateName(input.name)

    // Resolve the parent id up front. Root is ensured OUTSIDE the mutation tx.
    let parentId = input.parentId
    if (parentId == null) {
        const root = await ensureWorkspaceRoot(input.workspaceId, access.userId)
        parentId = root.id
    }

    const folder = await prisma.$transaction(async (tx) => {
        const parent = await tx.reviewFolder.findFirst({
            where: { id: parentId!, workspaceId: input.workspaceId, deletedAt: null },
            select: { id: true, path: true, depth: true },
        })
        if (!parent) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục cha.')
        if (parent.depth + 1 > MAX_DEPTH) {
            throw apiError(400, 'VALIDATION_ERROR', 'Vượt quá độ sâu thư mục tối đa.', { reason: 'max_depth' })
        }
        const finalName = await uniqueChildName(tx, parent.id, name)
        const id = randomUUID()
        const created = await tx.reviewFolder.create({
            data: {
                id,
                workspaceId: input.workspaceId,
                parentId: parent.id,
                name: finalName,
                path: `${parent.path}${id}/`,
                depth: parent.depth + 1,
                createdById: access.userId,
            },
        })
        await tx.reviewFolder.update({ where: { id: parent.id }, data: { itemCount: { increment: 1 } } })
        return created
    })

    const createdBy = folder.createdById ? (await loadUserRefs([folder.createdById])).get(folder.createdById) : null
    return serializeFolder(folder, { createdBy: createdBy ?? null })
}

// ─────────────────────── create folder tree (folder upload) ───────────────────────

const TREE_PATHS_CAP = 250 // folders per folder-upload drop (§3.5/§11.2)
const TREE_DEPTH_CAP = 10 // relative-path segments per drop

interface FolderRef {
    id: string
    path: string
    depth: number
}

/** Get-or-create one named child under `parent` (match by name in the SAME parent). */
async function getOrCreateChild(
    workspaceId: string,
    parent: FolderRef,
    name: string,
    userId: string,
): Promise<FolderRef> {
    const existing = await prisma.reviewFolder.findFirst({
        where: { parentId: parent.id, workspaceId, name, deletedAt: null },
        select: { id: true, path: true, depth: true },
    })
    if (existing) return existing
    if (parent.depth + 1 > MAX_DEPTH) {
        throw apiError(400, 'VALIDATION_ERROR', 'Vượt quá độ sâu thư mục tối đa.', { reason: 'max_depth' })
    }
    return prisma.$transaction(async (tx) => {
        const again = await tx.reviewFolder.findFirst({
            where: { parentId: parent.id, workspaceId, name, deletedAt: null },
            select: { id: true, path: true, depth: true },
        })
        if (again) return again // lost a race — reuse the winner
        const id = randomUUID()
        const created = await tx.reviewFolder.create({
            data: {
                id,
                workspaceId,
                parentId: parent.id,
                name,
                path: `${parent.path}${id}/`,
                depth: parent.depth + 1,
                createdById: userId,
            },
        })
        await tx.reviewFolder.update({ where: { id: parent.id }, data: { itemCount: { increment: 1 } } })
        return { id: created.id, path: created.path, depth: created.depth }
    })
}

/**
 * Recreate a folder tree from a folder-upload's distinct relative dir paths (e.g.
 * ["Brand A", "Brand A/Teasers"]) under `parentId` (null = workspace root). Get-or-
 * creates by name within each parent (existing folders are reused, NOT suffixed —
 * unlike the interactive New-Folder flow). Returns a path→folderId map the client
 * uses to place each file. Caps: ≤250 folders, ≤10 levels per drop.
 */
export async function createFolderTree(input: {
    workspaceId: string
    parentId: string | null
    paths: string[]
}): Promise<{ map: Record<string, string> }> {
    const access = await requireReviewAccess({ workspaceId: input.workspaceId })

    // Normalize: trim segments, drop blanks, add every ancestor prefix so intermediate
    // dirs get created, and dedup.
    const norm = new Set<string>()
    for (const raw of input.paths) {
        const parts = raw.split('/').map((s) => s.trim()).filter(Boolean)
        if (parts.length === 0) continue
        if (parts.length > TREE_DEPTH_CAP) {
            throw apiError(400, 'VALIDATION_ERROR', `Cây thư mục quá sâu (tối đa ${TREE_DEPTH_CAP} cấp).`, { reason: 'tree_depth' })
        }
        for (const p of parts) {
            if (p.length > NAME_MAX) throw apiError(400, 'VALIDATION_ERROR', 'Tên thư mục quá dài.')
        }
        for (let i = 1; i <= parts.length; i++) norm.add(parts.slice(0, i).join('/'))
    }
    if (norm.size === 0) return { map: {} }
    if (norm.size > TREE_PATHS_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Vượt quá ${TREE_PATHS_CAP} thư mục trong một lần tải lên.`, { reason: 'tree_cap' })
    }

    // Ensure the base (root ensured OUTSIDE any tx to dodge the P2002 create race).
    let baseId = input.parentId
    if (baseId == null) baseId = (await ensureWorkspaceRoot(input.workspaceId, access.userId)).id
    const base = await prisma.reviewFolder.findFirst({
        where: { id: baseId, workspaceId: input.workspaceId, deletedAt: null },
        select: { id: true, path: true, depth: true },
    })
    if (!base) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục đích.')

    // Fail fast on the ABSOLUTE resulting depth (base.depth + deepest relative path).
    // getOrCreateChild also enforces MAX_DEPTH per folder, but its per-folder tx commits
    // are not wrapped in one tx — pre-checking here avoids a mid-tree throw leaving orphans.
    const maxSegments = [...norm].reduce((m, p) => Math.max(m, p.split('/').length), 0)
    if (base.depth + maxSegments > MAX_DEPTH) {
        throw apiError(400, 'VALIDATION_ERROR', 'Vượt quá độ sâu thư mục tối đa.', { reason: 'max_depth' })
    }

    // Resolve shallow-first so each parent exists before its children.
    const sorted = [...norm].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
    const cache = new Map<string, FolderRef>()
    cache.set('', base)
    const map: Record<string, string> = {}
    for (const path of sorted) {
        const parts = path.split('/')
        const name = parts[parts.length - 1]
        const parent = cache.get(parts.slice(0, -1).join('/'))
        if (!parent) continue // unreachable given prefixes + shallow-first
        const folder = await getOrCreateChild(input.workspaceId, parent, name, access.userId)
        cache.set(path, folder)
        map[path] = folder.id
    }
    return { map }
}

// ─────────────────────── get + breadcrumb ───────────────────────

export async function getFolder(folderId: string): Promise<{ folder: FolderDto; breadcrumb: BreadcrumbItem[] }> {
    const folder = await prisma.reviewFolder.findFirst({ where: { id: folderId, deletedAt: null } })
    if (!folder) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
    const access = await requireReviewAccess({ workspaceId: folder.workspaceId })
    // [FR-03] editor chỉ xem folder trong phạm vi được giao (tổ tiên / self / con).
    const scope = await getFolderScope({ userId: access.userId, workspaceId: folder.workspaceId, isAdmin: access.isAdmin })
    if (!isPathVisible(scope, folder.path)) throw apiError(403, 'FORBIDDEN', 'Bạn không có quyền xem thư mục này.')

    const ancestorIds = ancestorIdsAbove(folder)
    let breadcrumb: BreadcrumbItem[] = []
    if (ancestorIds.length > 0) {
        const rows = await prisma.reviewFolder.findMany({
            where: { id: { in: ancestorIds } },
            select: { id: true, name: true },
        })
        const byId = new Map(rows.map((r) => [r.id, r.name]))
        // element 0 = workspace root, always relabelled "Team" per UI-UX §1.2/§1.4.2.
        breadcrumb = ancestorIds.map((id, i) => ({ id, name: i === 0 ? 'Team' : (byId.get(id) ?? '—') }))
    }

    const createdBy = folder.createdById ? (await loadUserRefs([folder.createdById])).get(folder.createdById) : null
    return { folder: serializeFolder(folder, { createdBy: createdBy ?? null }), breadcrumb }
}

// ─────────────────────── list children ───────────────────────

function assetOrderBy(sort: SortField, dir: SortDir): Prisma.ReviewAssetOrderByWithRelationInput[] {
    const tiebreak: Prisma.ReviewAssetOrderByWithRelationInput = { id: 'asc' }
    switch (sort) {
        case 'name':
            return [{ name: dir }, tiebreak]
        case 'status':
            return [{ statusId: dir }, tiebreak]
        case 'duration':
            return [{ currentVersion: { durationMs: dir } }, tiebreak]
        case 'sizeBytes':
            return [{ currentVersion: { sizeBytes: dir } }, tiebreak]
        case 'uploader':
            return [{ currentVersion: { uploaderId: dir } }, tiebreak]
        case 'commentCount':
            return [{ currentVersion: { commentCount: dir } }, tiebreak]
        case 'createdAt':
        default:
            return [{ createdAt: dir }, tiebreak]
    }
}

export async function listChildren(input: {
    workspaceId?: string
    folderId: string | null // null / "root" → workspace root
    sort?: SortField
    dir?: SortDir
    limit?: number
    cursor?: string | null
}): Promise<ListChildrenResult> {
    const sort = input.sort ?? 'createdAt'
    const dir = input.dir ?? 'desc'
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

    // Resolve the container folder + its workspace, THEN re-check access from it.
    let container: { id: string; totalSizeBytes: bigint; path: string; workspaceId: string }
    let access
    if (input.folderId == null) {
        if (!input.workspaceId) throw apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId cho thư mục gốc.')
        access = await requireReviewAccess({ workspaceId: input.workspaceId })
        const root = await readRoot(input.workspaceId)
        if (!root) {
            return { folders: [], assets: [], summary: { folderCount: 0, assetCount: 0, totalBytes: '0' }, nextCursor: null }
        }
        const row = await prisma.reviewFolder.findUnique({ where: { id: root.id }, select: { id: true, totalSizeBytes: true, path: true, workspaceId: true } })
        if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục gốc.')
        container = row
    } else {
        const row = await prisma.reviewFolder.findFirst({
            where: { id: input.folderId, deletedAt: null },
            select: { id: true, workspaceId: true, totalSizeBytes: true, path: true },
        })
        if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
        access = await requireReviewAccess({ workspaceId: row.workspaceId })
        container = row
    }
    const parentId = container.id

    // [FR-03] editor folder-scope: ẩn folder/asset ngoài phạm vi được giao (UI TeamBrowser
    // không đổi). Container không xem được → trả rỗng. Container là tổ tiên (visible-nhưng-
    // -không-mutable) → chỉ hiện folder-con-on-path, KHÔNG hiện asset (asset chỉ ở folder được giao).
    const scope = await getFolderScope({ userId: access.userId, workspaceId: container.workspaceId, isAdmin: access.isAdmin })
    if (!isPathVisible(scope, container.path)) {
        return { folders: [], assets: [], summary: { folderCount: 0, assetCount: 0, totalBytes: '0' }, nextCursor: null }
    }
    const showAssets = isPathMutable(scope, container.path)

    // Folders only on the first page (cursor paginates assets). Folders sort by name
    // (dir applied when the user sorts by name; else always ascending — §1.3).
    const isFirstPage = !input.cursor
    const folderDir: SortDir = sort === 'name' ? dir : 'asc'
    const [folderRows, folderCount, assetCount] = await Promise.all([
        isFirstPage
            ? prisma.reviewFolder.findMany({ where: { parentId, deletedAt: null }, orderBy: { name: folderDir } })
            : Promise.resolve([]),
        prisma.reviewFolder.count({ where: { parentId, deletedAt: null } }),
        prisma.reviewAsset.count({ where: { folderId: parentId, deletedAt: null } }),
    ])

    // [FR-03] con chỉ giữ folder xem được (tổ tiên on-path + self + con); asset chỉ khi mutable.
    const visibleFolderRows = scope.unrestricted ? folderRows : folderRows.filter((f) => isPathVisible(scope, f.path))

    const assetRows = showAssets
        ? await prisma.reviewAsset.findMany({
              where: { folderId: parentId, deletedAt: null },
              include: { currentVersion: true },
              orderBy: assetOrderBy(sort, dir),
              take: limit + 1,
              ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
          })
        : []
    const hasMore = assetRows.length > limit
    const pageAssets = hasMore ? assetRows.slice(0, limit) : assetRows
    const nextCursor = hasMore ? pageAssets[pageAssets.length - 1].id : null

    const userRefs = await loadUserRefs([
        ...visibleFolderRows.map((f) => f.createdById),
        ...pageAssets.map((a) => a.createdById),
        ...pageAssets.map((a) => a.currentVersion?.uploaderId),
    ])

    const assetIds = pageAssets.map((a) => a.id)
    const [versionCounts, commentSums] = await Promise.all([
        assetIds.length
            ? prisma.reviewVersion.groupBy({ by: ['assetId'], where: { assetId: { in: assetIds }, deletedAt: null }, _count: { _all: true } })
            : Promise.resolve([] as { assetId: string; _count: { _all: number } }[]),
        assetIds.length
            ? prisma.reviewVersion.groupBy({ by: ['assetId'], where: { assetId: { in: assetIds }, deletedAt: null }, _sum: { commentCount: true } })
            : Promise.resolve([] as { assetId: string; _sum: { commentCount: number | null } }[]),
    ])
    const vCount = new Map(versionCounts.map((r) => [r.assetId, r._count._all]))
    const cSum = new Map(commentSums.map((r) => [r.assetId, r._sum.commentCount ?? 0]))

    // [L11] Self-heal the folder counters (the task-upload path never maintains itemCount /
    // totalSizeBytes, so they read 0 → "X mục • 0 B dù có video 10MB"). Per folder, compute:
    //   • cnt   = DIRECT-children count (subfolders + direct assets) — this is the DTO's documented
    //             "N mục" semantic AND the input to the delete-confirmation warning, so it must stay
    //             direct-children, not recursive (else deleting a folder of empty subfolders drops
    //             its "và N mục bên trong" warning).
    //   • bytes = RECURSIVE subtree bytes over ALL live versions (matches liveStackBytes, the metric
    //             the denormalized rollup accumulates — not just the head version).
    // Materialized path "/{rootId}/…/{id}/" → `d.path LIKE pf.path || '%'` = self + descendants;
    // the trailing slash blocks sibling-prefix false matches (/a/ vs /ab/). Gated to unrestricted
    // (admin): a folder-scoped editor must not get a recursive total spanning out-of-scope
    // descendants (FR-03). Every pf.id yields exactly one row (subquery form, no INNER-JOIN drop).
    const recAgg = new Map<string, { cnt: number; bytes: string }>()
    if (scope.unrestricted) {
        const aggIds = [...visibleFolderRows.map((f) => f.id), container.id]
        const rows = await prisma.$queryRaw<{ folderId: string; cnt: number; bytes: string }[]>`
            SELECT pf.id AS "folderId",
                ((SELECT COUNT(*) FROM "ReviewFolder" cf WHERE cf."parentId" = pf.id AND cf."deletedAt" IS NULL)
                 + (SELECT COUNT(*) FROM "ReviewAsset" ca WHERE ca."folderId" = pf.id AND ca."deletedAt" IS NULL))::int AS cnt,
                COALESCE((
                    SELECT SUM(v."sizeBytes")
                    FROM "ReviewFolder" d
                    JOIN "ReviewAsset" a ON a."folderId" = d.id AND a."deletedAt" IS NULL
                    JOIN "ReviewVersion" v ON v."assetId" = a.id AND v."deletedAt" IS NULL
                    WHERE d.path LIKE pf.path || '%' AND d."deletedAt" IS NULL
                ), 0)::text AS bytes
            FROM "ReviewFolder" pf
            WHERE pf.id IN (${Prisma.join(aggIds)})
        `
        for (const r of rows) recAgg.set(r.folderId, { cnt: Number(r.cnt), bytes: r.bytes })
    }

    const folders = visibleFolderRows.map((f) => {
        const dto = serializeFolder(f, { createdBy: f.createdById ? userRefs.get(f.createdById) ?? null : null })
        // Unrestricted → live-recomputed counters (direct-child count + recursive bytes);
        // restricted → keep the denormalized/gated value untouched.
        return scope.unrestricted ? { ...dto, itemCount: recAgg.get(f.id)?.cnt ?? 0, totalBytes: recAgg.get(f.id)?.bytes ?? '0' } : dto
    })
    const assets = pageAssets.map((a) => {
        const v = a.currentVersion
        const currentVersion = v
            ? serializeVersion(v, {
                  uploader: v.uploaderId ? userRefs.get(v.uploaderId) ?? null : null,
                  media: buildMediaLinks({ muxPlaybackId: v.muxPlaybackId, thumbTime: v.thumbTime }),
              })
            : null
        return serializeAsset(a, {
            currentVersion,
            createdBy: a.createdById ? userRefs.get(a.createdById) ?? null : null,
            versionCount: vCount.get(a.id) ?? 0,
            commentCountTotal: cSum.get(a.id) ?? 0,
        })
    })

    return {
        folders,
        assets,
        summary: {
            // [FR-03] không lộ số lượng anh-chị-em ngoài phạm vi cho editor.
            folderCount: scope.unrestricted ? folderCount : visibleFolderRows.length,
            assetCount: showAssets ? assetCount : 0,
            // [L11] Meta-header bytes = recursive subtree total of the current folder (unrestricted);
            // restricted keeps the existing gated denormalized value.
            totalBytes: scope.unrestricted
                ? recAgg.get(container.id)?.bytes ?? '0'
                : showAssets
                  ? container.totalSizeBytes.toString()
                  : '0',
        },
        nextCursor,
    }
}

// ─────────────────────────── tree ───────────────────────────

export async function getFolderTree(
    workspaceId: string,
): Promise<{ folders: { id: string; parentId: string | null; name: string; hasChildren: boolean }[] }> {
    const access = await requireReviewAccess({ workspaceId })
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })
    const rows = await prisma.reviewFolder.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, parentId: true, name: true, path: true },
        orderBy: { name: 'asc' },
        take: TREE_CAP + 1,
    })
    if (rows.length > TREE_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', 'Workspace vượt quá giới hạn số thư mục.', { reason: 'tree_cap' })
    }
    // [FR-03] editor chỉ thấy folder trong phạm vi được giao (tổ tiên on-path + self + con).
    const visible = scope.unrestricted ? rows : rows.filter((r) => isPathVisible(scope, r.path))
    const hasChild = new Set(visible.map((r) => r.parentId).filter((x): x is string => !!x))
    return { folders: visible.map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, hasChildren: hasChild.has(r.id) })) }
}

// ─────────────────────────── rename ───────────────────────────

export async function renameFolder(
    folderId: string,
    input: { name: string; expectedRowVersion: number },
): Promise<FolderDto> {
    const name = validateName(input.name)
    const existing = await prisma.reviewFolder.findFirst({ where: { id: folderId, deletedAt: null } })
    if (!existing) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
    const access = await requireReviewAccess({ workspaceId: existing.workspaceId })
    // [FR-03] editor chỉ đổi tên folder trong phạm vi được giao.
    assertFolderPathMutable(
        await getFolderScope({ userId: access.userId, workspaceId: existing.workspaceId, isAdmin: access.isAdmin }),
        existing.path,
    )

    if (existing.rowVersion !== input.expectedRowVersion) {
        throw apiError(409, 'ROW_VERSION_MISMATCH', 'Thư mục đã bị thay đổi bởi người khác. Tải lại rồi thử lại.', {
            current: { id: existing.id, name: existing.name, rowVersion: existing.rowVersion },
        })
    }
    const updated = await prisma.reviewFolder.update({
        where: { id: folderId },
        data: { name, rowVersion: { increment: 1 } },
    })
    const createdBy = updated.createdById ? (await loadUserRefs([updated.createdById])).get(updated.createdById) : null
    return serializeFolder(updated, { createdBy: createdBy ?? null })
}

// ─────────────────────────── move ───────────────────────────

export async function moveItems(input: {
    items: { type: ItemType; id: string; expectedRowVersion: number }[]
    targetFolderId: string | null // null = workspace root
}): Promise<{ moved: { type: ItemType; id: string; rowVersion: number }[] }> {
    if (input.items.length < 1 || input.items.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Số mục phải từ 1–${BULK_CAP}.`)
    }
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)

    const [folderRows, assetRows] = await Promise.all([
        prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: null } }),
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null }, include: { folder: { select: { path: true } } } }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    const access = await requireReviewAccess({ workspaceId })
    // [FR-03] editor chỉ di chuyển mục TRONG phạm vi được giao (nguồn); đích check trong tx.
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })
    assertFolderPathsMutable(scope, [...folderRows.map((f) => f.path), ...assetRows.map((a) => a.folder.path)])

    // Ensure root (if target = root) BEFORE the mutation tx to avoid create-in-tx aborts.
    let resolvedTargetId = input.targetFolderId
    if (resolvedTargetId == null) resolvedTargetId = (await ensureWorkspaceRoot(workspaceId)).id

    return prisma.$transaction(async (tx) => {
        // [P3] Serialize concurrent moves in this workspace: two reciprocal moves (A→B ‖ B→A) must
        // not both pass the cycle guard on stale pre-tx paths. With the lock held one move fully
        // commits before the other reads, and we RE-READ the rows below so the guard + rowVersion
        // checks run against CURRENT data, never the pre-tx snapshot.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`
        const target = await tx.reviewFolder.findFirst({
            where: { id: resolvedTargetId!, deletedAt: null },
            select: { id: true, path: true, depth: true, workspaceId: true },
        })
        if (!target) throw apiError(409, 'STATE_INVALID', 'Thư mục đích không hợp lệ hoặc đã bị xóa.')
        if (target.workspaceId !== workspaceId) throw apiError(400, 'CROSS_WORKSPACE', 'Thư mục đích khác workspace.')
        // [FR-03] đích cũng phải nằm trong phạm vi được giao.
        assertFolderPathMutable(scope, target.path)

        // [P3] Re-read moved rows under the lock (paths/rowVersions may have changed since the pre-tx
        // snapshot). [P1] Then drop any selected folder nested under another selected folder: the
        // ancestor's move relocates the whole subtree, so re-processing a descendant rewrites its path
        // against a now-stale row (parentId ends up at target while path stays under the ancestor).
        const freshFolders = folderIds.length
            ? await tx.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: null } })
            : []
        if (freshFolders.length !== folderIds.length) throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
        const freshAssets = assetIds.length
            ? await tx.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null }, include: { folder: { select: { path: true } } } })
            : []
        if (freshAssets.length !== assetIds.length) throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
        const nestedFolderIds = new Set(
            freshFolders.filter((f) => freshFolders.some((o) => o.id !== f.id && f.path.startsWith(o.path))).map((f) => f.id),
        )

        const moved: { type: ItemType; id: string; rowVersion: number }[] = []

        for (const folder of freshFolders) {
            const item = input.items.find((i) => i.type === 'folder' && i.id === folder.id)!
            if (folder.rowVersion !== item.expectedRowVersion) {
                throw apiError(409, 'ROW_VERSION_MISMATCH', 'Thư mục đã thay đổi.', { failedItemId: folder.id, current: folder.rowVersion })
            }
            if (nestedFolderIds.has(folder.id)) {
                // [P1] Rides along with its selected ancestor's subtree move — acknowledge, don't re-move.
                moved.push({ type: 'folder', id: folder.id, rowVersion: folder.rowVersion })
                continue
            }
            if (folder.parentId === target.id) {
                moved.push({ type: 'folder', id: folder.id, rowVersion: folder.rowVersion })
                continue // already there — no-op
            }
            // Cycle guard: target must not be the folder itself or a descendant.
            if (target.id === folder.id || target.path.startsWith(folder.path)) {
                throw apiError(400, 'FOLDER_CYCLE', 'Không thể di chuyển thư mục vào chính nó hoặc thư mục con.', { failedItemId: folder.id })
            }
            const oldPrefix = folder.path
            const newPrefix = `${target.path}${folder.id}/`
            const depthDelta = target.depth + 1 - folder.depth
            await tx.$executeRaw(
                Prisma.sql`UPDATE "ReviewFolder" SET "path" = ${newPrefix} || substring("path" from ${oldPrefix.length + 1}), "depth" = "depth" + ${depthDelta} WHERE "path" LIKE ${oldPrefix + '%'}`,
            )
            const updated = await tx.reviewFolder.update({
                where: { id: folder.id },
                data: { parentId: target.id, rowVersion: { increment: 1 } },
                select: { rowVersion: true },
            })
            if (folder.parentId) await tx.reviewFolder.update({ where: { id: folder.parentId }, data: { itemCount: { decrement: 1 } } })
            await tx.reviewFolder.update({ where: { id: target.id }, data: { itemCount: { increment: 1 } } })
            // totalSizeBytes: move the subtree bytes off the old ancestor chain onto the new one.
            await addBytesToAncestors(tx, ancestorIdsAbove(folder), -folder.totalSizeBytes)
            await addBytesToAncestors(tx, pathIds(target.path), folder.totalSizeBytes)
            moved.push({ type: 'folder', id: folder.id, rowVersion: updated.rowVersion })
        }

        for (const asset of freshAssets) {
            const item = input.items.find((i) => i.type === 'asset' && i.id === asset.id)!
            if (asset.rowVersion !== item.expectedRowVersion) {
                throw apiError(409, 'ROW_VERSION_MISMATCH', 'Asset đã thay đổi.', { failedItemId: asset.id, current: asset.rowVersion })
            }
            if (asset.folderId === target.id) {
                moved.push({ type: 'asset', id: asset.id, rowVersion: asset.rowVersion })
                continue
            }
            const oldFolder = await tx.reviewFolder.findUnique({ where: { id: asset.folderId }, select: { path: true } })
            const updated = await tx.reviewAsset.update({
                where: { id: asset.id },
                data: { folderId: target.id, rowVersion: { increment: 1 } },
                select: { rowVersion: true },
            })
            await tx.reviewFolder.update({ where: { id: asset.folderId }, data: { itemCount: { decrement: 1 } } })
            await tx.reviewFolder.update({ where: { id: target.id }, data: { itemCount: { increment: 1 } } })
            const bytes = await liveStackBytes(tx, asset.id)
            if (oldFolder) await addBytesToAncestors(tx, pathIds(oldFolder.path), -bytes)
            await addBytesToAncestors(tx, pathIds(target.path), bytes)
            moved.push({ type: 'asset', id: asset.id, rowVersion: updated.rowVersion })
        }

        return { moved }
    })
}

// ─────────────────────── delete (soft) ───────────────────────

export async function deleteItems(input: {
    items: { type: ItemType; id: string }[]
}): Promise<{ deleted: { type: ItemType; id: string }[]; purgeAt: string }> {
    if (input.items.length < 1 || input.items.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Số mục phải từ 1–${BULK_CAP}.`)
    }
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)
    const [folderRows, assetRows] = await Promise.all([
        prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: null } }),
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null }, include: { folder: { select: { path: true } } } }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại hoặc đã ở trong thùng rác.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    const access = await requireReviewAccess({ workspaceId })

    // FR-B07 permission: a USER may only delete FOLDERS they created; ADMIN deletes any
    // (asset delete is unrestricted for members). Enforced server-side, not just in the UI.
    if (!access.isAdmin) {
        const forbidden = folderRows.find((f) => f.createdById !== access.userId)
        if (forbidden) {
            throw apiError(403, 'FORBIDDEN', 'Chỉ người tạo hoặc quản trị được xóa thư mục này.', { failedItemId: forbidden.id })
        }
    }
    // [FR-03] editor chỉ xóa mục TRONG phạm vi được giao (cộng FR-B07 creator-only ở trên).
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })
    assertFolderPathsMutable(scope, [...folderRows.map((f) => f.path), ...assetRows.map((a) => a.folder.path)])

    // [P1/P2] When the selection contains a folder AND something nested under it, the ancestor's
    // subtree sweep already soft-deletes the descendant with the ANCESTOR's deleteBatchId. Processing
    // the descendant again would give it a SECOND batchId (so a restore of the ancestor leaves it
    // orphaned in trash) and, for folders, an extra itemCount/byte decrement. Skip descendants of a
    // selected folder — they ride along with the ancestor's sweep.
    const nestedFolderIds = new Set(
        folderRows.filter((f) => folderRows.some((o) => o.id !== f.id && f.path.startsWith(o.path))).map((f) => f.id),
    )
    const coveredAssetIds = new Set(
        assetRows.filter((a) => folderRows.some((f) => a.folder.path.startsWith(f.path))).map((a) => a.id),
    )

    const now = new Date()
    await prisma.$transaction(async (tx) => {
        for (const folder of folderRows) {
            if (nestedFolderIds.has(folder.id)) continue // covered by its selected ancestor's subtree sweep
            const batchId = randomUUID()
            const del = { deletedAt: now, deletedById: access.userId, deleteBatchId: batchId }
            // Subtree folder ids (incl. self) via materialized-path prefix.
            const subFolders = await tx.reviewFolder.findMany({
                where: { path: { startsWith: folder.path }, deletedAt: null },
                select: { id: true },
            })
            const subFolderIds = subFolders.map((f) => f.id)
            await tx.reviewFolder.updateMany({ where: { id: { in: subFolderIds } }, data: del })
            const subAssets = await tx.reviewAsset.findMany({
                where: { folderId: { in: subFolderIds }, deletedAt: null },
                select: { id: true },
            })
            const subAssetIds = subAssets.map((a) => a.id)
            if (subAssetIds.length) {
                await tx.reviewAsset.updateMany({ where: { id: { in: subAssetIds } }, data: del })
                await tx.reviewVersion.updateMany({ where: { assetId: { in: subAssetIds }, deletedAt: null }, data: del })
            }
            // Counters: parent loses the folder; ancestors above lose its subtree bytes.
            if (folder.parentId) await tx.reviewFolder.update({ where: { id: folder.parentId }, data: { itemCount: { decrement: 1 } } })
            await addBytesToAncestors(tx, ancestorIdsAbove(folder), -folder.totalSizeBytes)
        }

        for (const asset of assetRows) {
            if (coveredAssetIds.has(asset.id)) continue // covered by a selected ancestor folder's subtree sweep
            const batchId = randomUUID()
            const bytes = await liveStackBytes(tx, asset.id)
            const del = { deletedAt: now, deletedById: access.userId, deleteBatchId: batchId }
            await tx.reviewAsset.update({ where: { id: asset.id }, data: del })
            await tx.reviewVersion.updateMany({ where: { assetId: asset.id, deletedAt: null }, data: del })
            await tx.reviewFolder.update({ where: { id: asset.folderId }, data: { itemCount: { decrement: 1 } } })
            const folder = await tx.reviewFolder.findUnique({ where: { id: asset.folderId }, select: { path: true } })
            if (folder) await addBytesToAncestors(tx, pathIds(folder.path), -bytes)
        }
    })

    const purgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    return { deleted: input.items.map((i) => ({ type: i.type, id: i.id })), purgeAt }
}

// ─────────────────────── trash list ───────────────────────

export async function listTrash(input: {
    workspaceId: string
    limit?: number
    cursor?: string | null
}): Promise<{ items: TrashItemDto[]; total: number; nextCursor: string | null }> {
    await requireReviewAccess({ workspaceId: input.workspaceId })
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

    // Fetch every deleted folder/asset in the workspace; batch roots are identified
    // in-memory (workspace trash is bounded; nightly purge caps growth).
    const [delFolders, delAssets] = await Promise.all([
        prisma.reviewFolder.findMany({
            where: { workspaceId: input.workspaceId, deletedAt: { not: null } },
            select: { id: true, name: true, parentId: true, deletedAt: true, deletedById: true, deleteBatchId: true, itemCount: true, totalSizeBytes: true, orphanedFromPurge: true },
        }),
        prisma.reviewAsset.findMany({
            where: { workspaceId: input.workspaceId, deletedAt: { not: null } },
            select: { id: true, name: true, folderId: true, deletedAt: true, deletedById: true, deleteBatchId: true },
        }),
    ])

    const folderById = new Map(delFolders.map((f) => [f.id, f]))
    // A deleted FOLDER is a batch root when its parent is NOT deleted in the same batch.
    const rootFolders = delFolders.filter((f) => {
        if (!f.parentId) return true
        const parent = folderById.get(f.parentId)
        return !parent || parent.deleteBatchId !== f.deleteBatchId
    })
    // A deleted ASSET is a batch root when its folder is NOT deleted in the same batch.
    const rootAssets = delAssets.filter((a) => {
        const folder = folderById.get(a.folderId)
        return !folder || folder.deleteBatchId !== a.deleteBatchId
    })

    const rootAssetIds = rootAssets.map((a) => a.id)
    const vCounts = rootAssetIds.length
        ? await prisma.reviewVersion.groupBy({ by: ['assetId'], where: { assetId: { in: rootAssetIds } }, _count: { _all: true } })
        : []
    const vCount = new Map(vCounts.map((r) => [r.assetId, r._count._all]))

    const userRefs = await loadUserRefs([...rootFolders.map((f) => f.deletedById), ...rootAssets.map((a) => a.deletedById)])
    const purgeAtOf = (deletedAt: Date) => new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const all: TrashItemDto[] = [
        ...rootFolders.map((f): TrashItemDto => ({
            type: 'folder',
            id: f.id,
            name: f.name,
            deletedAt: f.deletedAt!.toISOString(),
            purgeAt: purgeAtOf(f.deletedAt!),
            deletedBy: f.deletedById ? userRefs.get(f.deletedById) ?? null : null,
            restorable: !f.orphanedFromPurge,
            meta: { itemCount: f.itemCount, sizeBytes: f.totalSizeBytes.toString() },
        })),
        ...rootAssets.map((a): TrashItemDto => ({
            type: 'asset',
            id: a.id,
            name: a.name,
            deletedAt: a.deletedAt!.toISOString(),
            purgeAt: purgeAtOf(a.deletedAt!),
            deletedBy: a.deletedById ? userRefs.get(a.deletedById) ?? null : null,
            restorable: true,
            meta: { versionCount: vCount.get(a.id) ?? 0 },
        })),
    ]
    all.sort((x, y) => (x.deletedAt < y.deletedAt ? 1 : x.deletedAt > y.deletedAt ? -1 : 0)) // deletedAt desc

    const total = all.length
    // [CC2] A cursor whose item left the trash (restored / nightly-purged between the client's page
    // requests) makes findIndex return -1, and -1 + 1 = 0 would silently restart at page 1 (the client
    // appends duplicate rows). Treat an unresolvable cursor as end-of-list instead.
    let start = 0
    if (input.cursor) {
        const idx = all.findIndex((i) => i.id === input.cursor)
        if (idx === -1) return { items: [], total, nextCursor: null }
        start = idx + 1
    }
    const page = all.slice(start, start + limit)
    const nextCursor = start + limit < total ? page[page.length - 1]?.id ?? null : null
    return { items: page, total, nextCursor }
}

// ─────────────────────── restore ───────────────────────

export async function restoreItems(input: {
    items: { type: ItemType; id: string }[]
}): Promise<{ restored: { type: ItemType; id: string; restoredToFolderId: string | null; movedToRoot: boolean }[] }> {
    if (input.items.length < 1 || input.items.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Số mục phải từ 1–${BULK_CAP}.`)
    }
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)
    const [folderRows, assetRows] = await Promise.all([
        prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: { not: null } } }),
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: { not: null } } }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length) {
        throw apiError(404, 'NOT_IN_TRASH', 'Một hoặc nhiều mục không nằm trong thùng rác.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    await requireReviewAccess({ workspaceId })

    // Ensure the fallback root exists BEFORE the tx (re-home landing zone).
    const root = await ensureWorkspaceRoot(workspaceId)

    return prisma.$transaction(async (tx) => {
        const restored: { type: ItemType; id: string; restoredToFolderId: string | null; movedToRoot: boolean }[] = []

        for (const folder of folderRows) {
            const batchId = folder.deleteBatchId
            const clear = { deletedAt: null, deletedById: null, deleteBatchId: null }
            // Original parent still alive? If not, re-home to workspace root.
            const parent = folder.parentId
                ? await tx.reviewFolder.findFirst({ where: { id: folder.parentId, deletedAt: null }, select: { id: true, path: true, depth: true } })
                : null
            let target: { id: string; path: string; depth: number }
            let movedToRoot = false
            if (parent) {
                target = parent
            } else if (root.id === folder.id) {
                // Restoring the workspace root itself (edge): it stays at depth 0.
                target = { id: folder.id, path: folder.path, depth: folder.depth }
            } else {
                target = root
                movedToRoot = folder.parentId != null // only "moved" if it HAD a (now-gone) parent
            }

            // Clear the whole batch (folder + subtree + versions).
            if (batchId) {
                await tx.reviewFolder.updateMany({ where: { deleteBatchId: batchId }, data: clear })
                await tx.reviewAsset.updateMany({ where: { deleteBatchId: batchId }, data: clear })
                await tx.reviewVersion.updateMany({ where: { deleteBatchId: batchId }, data: clear })
            } else {
                await tx.reviewFolder.update({ where: { id: folder.id }, data: clear })
            }

            // Re-home: rebuild subtree paths/depths under the new parent.
            if (target.id !== folder.parentId && target.id !== folder.id) {
                const oldPrefix = folder.path
                const newPrefix = `${target.path}${folder.id}/`
                const depthDelta = target.depth + 1 - folder.depth
                await tx.$executeRaw(
                    Prisma.sql`UPDATE "ReviewFolder" SET "path" = ${newPrefix} || substring("path" from ${oldPrefix.length + 1}), "depth" = "depth" + ${depthDelta} WHERE "path" LIKE ${oldPrefix + '%'}`,
                )
                await tx.reviewFolder.update({ where: { id: folder.id }, data: { parentId: target.id, orphanedFromPurge: movedToRoot } })
            }

            // Counters: give the subtree bytes back to the landing parent chain
            // (NOT the folder's own row — it kept its bytes through the delete).
            if (target.id !== folder.id) {
                await tx.reviewFolder.update({ where: { id: target.id }, data: { itemCount: { increment: 1 } } })
                await addBytesToAncestors(tx, pathIds(target.path), folder.totalSizeBytes)
            }
            restored.push({ type: 'folder', id: folder.id, restoredToFolderId: target.id === folder.id ? null : target.id, movedToRoot })
        }

        for (const asset of assetRows) {
            const batchId = asset.deleteBatchId
            const clear = { deletedAt: null, deletedById: null, deleteBatchId: null }
            const folder = await tx.reviewFolder.findFirst({ where: { id: asset.folderId, deletedAt: null }, select: { id: true, path: true } })
            const landing = folder ?? { id: root.id, path: root.path }
            const movedToRoot = !folder

            if (batchId) {
                await tx.reviewAsset.updateMany({ where: { deleteBatchId: batchId }, data: clear })
                await tx.reviewVersion.updateMany({ where: { deleteBatchId: batchId }, data: clear })
            } else {
                await tx.reviewAsset.update({ where: { id: asset.id }, data: clear })
            }
            if (movedToRoot) {
                await tx.reviewAsset.update({ where: { id: asset.id }, data: { folderId: landing.id, orphanedFromPurge: true } })
            }
            const bytes = await liveStackBytes(tx, asset.id)
            await tx.reviewFolder.update({ where: { id: landing.id }, data: { itemCount: { increment: 1 } } })
            await addBytesToAncestors(tx, pathIds(landing.path), bytes)
            restored.push({ type: 'asset', id: asset.id, restoredToFolderId: landing.id, movedToRoot })
        }

        return { restored }
    })
}

// ─────────────────────── rename asset ───────────────────────

/** 1–255 chars, trimmed. Unlike folders, asset display names MAY contain "/". */
function validateAssetName(raw: string): string {
    const name = raw.trim()
    if (name.length < 1 || name.length > NAME_MAX) {
        throw apiError(400, 'VALIDATION_ERROR', 'Tên phải từ 1–255 ký tự.')
    }
    return name
}

/** Serialize ONE asset (head version + counts + refs) — used by rename responses. */
async function loadAssetDto(assetId: string): Promise<AssetDto> {
    const asset = await prisma.reviewAsset.findFirst({
        where: { id: assetId, deletedAt: null },
        include: { currentVersion: true },
    })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const [vCount, cSum] = await Promise.all([
        prisma.reviewVersion.count({ where: { assetId, deletedAt: null } }),
        prisma.reviewVersion.aggregate({ where: { assetId, deletedAt: null }, _sum: { commentCount: true } }),
    ])
    const refs = await loadUserRefs([asset.createdById, asset.currentVersion?.uploaderId])
    const v = asset.currentVersion
    const currentVersion = v
        ? serializeVersion(v, {
              uploader: v.uploaderId ? refs.get(v.uploaderId) ?? null : null,
              media: buildMediaLinks({ muxPlaybackId: v.muxPlaybackId, thumbTime: v.thumbTime }),
          })
        : null
    return serializeAsset(asset, {
        currentVersion,
        createdBy: asset.createdById ? refs.get(asset.createdById) ?? null : null,
        versionCount: vCount,
        commentCountTotal: cSum._sum.commentCount ?? 0,
    })
}

export async function renameAsset(
    assetId: string,
    input: { name: string; expectedRowVersion: number },
): Promise<AssetDto> {
    const name = validateAssetName(input.name)
    const existing = await prisma.reviewAsset.findFirst({ where: { id: assetId, deletedAt: null } })
    if (!existing) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: existing.workspaceId })
    // [FR-03] editor chỉ đổi tên asset trong phạm vi được giao.
    await assertAssetInScope(
        await getFolderScope({ userId: access.userId, workspaceId: existing.workspaceId, isAdmin: access.isAdmin }),
        assetId,
        'write',
    )

    if (existing.rowVersion !== input.expectedRowVersion) {
        throw apiError(409, 'ROW_VERSION_MISMATCH', 'Asset đã bị thay đổi bởi người khác. Tải lại rồi thử lại.', {
            current: { id: existing.id, name: existing.name, rowVersion: existing.rowVersion },
        })
    }
    await prisma.reviewAsset.update({ where: { id: assetId }, data: { name, rowVersion: { increment: 1 } } })
    return loadAssetDto(assetId)
}

// ─────────────────────── copy / duplicate (copy-on-reference) ───────────────────────

const MAX_COPY_ITEMS = 500 // total rows (folders + assets) created per copy op — safety valve (§1.7)

/**
 * Copy folders (recursive) + assets into `targetFolderId` (null = workspace root).
 * COPY-ON-REFERENCE (API-SPEC §1.7): each copied version is a NEW row that SHARES the
 * source's `r2Key` + `muxPlaybackId` (instant, $0 — no object copy, no re-encode).
 *
 * Repo-vs-spec adjustment (IMPLEMENTATION-NOTES): the schema makes `muxAssetId` UNIQUE,
 * so a copy CANNOT share it — the copy's `muxAssetId` is left null. Every serving path
 * (playback JWT, thumbnail, storyboard, original download) keys off `muxPlaybackId` /
 * `r2Key`, so the copy streams/downloads fine; `muxAssetId` is only used for webhook
 * correlation + purge ref-counting (a P6 concern). Comments/share/old versions are NOT
 * copied (clean copy, like frame.io). Only READY head versions are copyable: non-ready
 * assets are SKIPPED (folder copy) or rejected (single-asset copy) so a copy can never be
 * a permanently-"processing" orphan (it would never receive the source's Mux webhook).
 *
 * Built as a two-phase op: plan the whole new subtree in memory (recursive reads via the
 * materialized path — a handful of queries), then materialize with bulk createMany's, so
 * even a large subtree is ~6 queries and never trips the tx / function timeout.
 */
interface PlannedFolder {
    newId: string
    parentNewId: string
    name: string
    path: string
    depth: number
    itemCount: number
    bytes: bigint
}
interface PlannedAsset {
    newAssetId: string
    newVersionId: string
    folderNewId: string
    name: string
    bytes: bigint
    v: {
        fileName: string
        mediaKind: Prisma.ReviewVersionCreateManyInput['mediaKind']
        mimeType: string
        sizeBytes: bigint
        durationMs: number | null
        fpsNumerator: number | null
        fpsDenominator: number | null
        width: number | null
        height: number | null
        videoCodec: string | null
        audioCodec: string | null
        r2Key: string | null
        muxPlaybackId: string | null
        thumbTime: number | null
        thumbnailKey: string | null
        pipelineStatus: Prisma.ReviewVersionCreateManyInput['pipelineStatus']
        uploadedAt: Date | null
        readyAt: Date | null
        uploaderId: string
    }
    assetMediaKind: Prisma.ReviewAssetCreateManyInput['mediaKind']
}

export async function copyItems(input: {
    items: { type: ItemType; id: string }[]
    targetFolderId: string | null
    duplicate?: boolean
}): Promise<{ copied: { type: ItemType; id: string; newId: string }[]; skippedAssets: number }> {
    if (input.items.length < 1 || input.items.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Số mục phải từ 1–${BULK_CAP}.`)
    }
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)
    const [srcFolders, srcAssets] = await Promise.all([
        prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: null } }),
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null }, include: { currentVersion: true, folder: { select: { path: true } } } }),
    ])
    if (srcFolders.length !== folderIds.length || srcAssets.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
    }
    const workspaces = new Set([...srcFolders.map((f) => f.workspaceId), ...srcAssets.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    const access = await requireReviewAccess({ workspaceId })

    let resolvedTargetId = input.targetFolderId
    if (resolvedTargetId == null) resolvedTargetId = (await ensureWorkspaceRoot(workspaceId, access.userId)).id
    const target = await prisma.reviewFolder.findFirst({
        where: { id: resolvedTargetId, deletedAt: null },
        select: { id: true, path: true, depth: true, workspaceId: true },
    })
    if (!target) throw apiError(404, 'NOT_FOUND', 'Thư mục đích không hợp lệ hoặc đã bị xóa.')
    if (target.workspaceId !== workspaceId) throw apiError(400, 'CROSS_WORKSPACE', 'Thư mục đích khác workspace.')
    // [FR-03] editor chỉ copy TỪ mục xem được (nguồn) VÀO đích trong phạm vi được giao.
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })
    if (!scope.unrestricted) {
        for (const f of srcFolders) if (!isPathVisible(scope, f.path)) throw apiError(403, 'FORBIDDEN', 'Bạn không có quyền trên mục ngoài phạm vi được giao.')
        for (const a of srcAssets) if (!isPathVisible(scope, a.folder.path)) throw apiError(403, 'FORBIDDEN', 'Bạn không có quyền trên mục ngoài phạm vi được giao.')
        assertFolderPathMutable(scope, target.path)
    }

    // ---- plan phase (in memory) ----
    const plannedFolders: PlannedFolder[] = []
    const plannedAssets: PlannedAsset[] = []
    const folderMap = new Map<string, PlannedFolder>() // newId → planned
    const copied: { type: ItemType; id: string; newId: string }[] = []
    let skippedAssets = 0
    const budget = { n: 0 }
    const consume = () => {
        budget.n += 1
        if (budget.n > MAX_COPY_ITEMS) {
            throw apiError(400, 'VALIDATION_ERROR', `Không thể sao chép quá ${MAX_COPY_ITEMS} mục một lần.`, { reason: 'copy_cap' })
        }
    }

    // Sibling names already in the target — top-level copied folders resolve unique names
    // against this set (+ names assigned during this op) so "(2)" suffixes stay correct.
    const targetSiblings = await prisma.reviewFolder.findMany({
        where: { parentId: target.id, deletedAt: null },
        select: { name: true },
    })
    const takenTopNames = new Set(targetSiblings.map((s) => s.name))
    const uniqueTopName = (desired: string): string => {
        if (!takenTopNames.has(desired)) {
            takenTopNames.add(desired)
            return desired
        }
        for (let i = 2; i < 1000; i++) {
            const cand = `${desired} (${i})`
            if (!takenTopNames.has(cand)) {
                takenTopNames.add(cand)
                return cand
            }
        }
        const cand = `${desired} (${randomUUID().slice(0, 8)})`
        takenTopNames.add(cand)
        return cand
    }

    const planAsset = (
        source: (typeof srcAssets)[number] | Awaited<ReturnType<typeof prisma.reviewAsset.findMany>>[number] & { currentVersion?: unknown },
        cv: NonNullable<(typeof srcAssets)[number]['currentVersion']>,
        folderNewId: string,
        name: string,
    ): PlannedAsset => {
        consume()
        const pa: PlannedAsset = {
            newAssetId: randomUUID(),
            newVersionId: randomUUID(),
            folderNewId,
            name,
            bytes: cv.sizeBytes,
            assetMediaKind: source.mediaKind,
            v: {
                fileName: cv.fileName,
                mediaKind: cv.mediaKind,
                mimeType: cv.mimeType,
                sizeBytes: cv.sizeBytes,
                durationMs: cv.durationMs,
                fpsNumerator: cv.fpsNumerator,
                fpsDenominator: cv.fpsDenominator,
                width: cv.width,
                height: cv.height,
                videoCodec: cv.videoCodec,
                audioCodec: cv.audioCodec,
                r2Key: cv.r2Key,
                muxPlaybackId: cv.muxPlaybackId, // SHARED
                thumbTime: cv.thumbTime,
                thumbnailKey: cv.thumbnailKey,
                pipelineStatus: cv.pipelineStatus, // READY (guaranteed by caller)
                uploadedAt: cv.uploadedAt,
                readyAt: cv.readyAt,
                uploaderId: cv.uploaderId,
            },
        }
        plannedAssets.push(pa)
        return pa
    }

    // Plan one source folder subtree under `parentNewId`/`parentPath`/`parentDepth`.
    const planFolderSubtree = async (
        sourceFolder: { id: string; path: string; depth: number },
        topName: string,
    ): Promise<string> => {
        // whole subtree in 2 reads via the materialized path (self + descendants).
        const subFolders = await prisma.reviewFolder.findMany({
            where: { path: { startsWith: sourceFolder.path }, deletedAt: null },
            select: { id: true, parentId: true, path: true, depth: true, name: true },
            orderBy: { depth: 'asc' },
        })
        const subFolderIds = subFolders.map((f) => f.id)
        const subAssets = await prisma.reviewAsset.findMany({
            where: { folderId: { in: subFolderIds }, deletedAt: null },
            include: { currentVersion: true },
        })

        const idMap = new Map<string, string>() // source folderId → new folderId
        for (const f of subFolders) idMap.set(f.id, randomUUID())

        // Folders shallow-first so a parent's new path is ready before its children.
        for (const f of subFolders) {
            consume()
            const newId = idMap.get(f.id)!
            const isTop = f.id === sourceFolder.id
            let parentNewId: string
            let parentPath: string
            let parentDepth: number
            if (isTop) {
                parentNewId = target.id
                parentPath = target.path
                parentDepth = target.depth
            } else {
                parentNewId = idMap.get(f.parentId!)! // parent is inside the subtree
                const parentPlanned = folderMap.get(parentNewId)!
                parentPath = parentPlanned.path
                parentDepth = parentPlanned.depth
            }
            const depth = parentDepth + 1
            if (depth > MAX_DEPTH) {
                throw apiError(400, 'VALIDATION_ERROR', 'Vượt quá độ sâu thư mục tối đa.', { reason: 'max_depth' })
            }
            const pf: PlannedFolder = {
                newId,
                parentNewId,
                name: isTop ? topName : f.name,
                path: `${parentPath}${newId}/`,
                depth,
                itemCount: 0,
                bytes: BigInt(0),
            }
            plannedFolders.push(pf)
            folderMap.set(newId, pf)
        }

        // Assets in the subtree → copy READY head versions; skip the rest.
        for (const a of subAssets) {
            const cv = a.currentVersion
            if (!cv || cv.pipelineStatus !== 'READY' || !cv.r2Key) {
                skippedAssets += 1
                continue
            }
            const folderNewId = idMap.get(a.folderId)!
            planAsset(a, cv, folderNewId, a.name)
        }

        return idMap.get(sourceFolder.id)!
    }

    // Top-level items in the requested order.
    for (const item of input.items) {
        if (item.type === 'folder') {
            const f = srcFolders.find((x) => x.id === item.id)!
            // Cycle guard: can't copy a folder into itself or a descendant.
            if (target.id === f.id || target.path.startsWith(f.path)) {
                throw apiError(400, 'FOLDER_CYCLE', 'Không thể sao chép thư mục vào chính nó hoặc thư mục con.', { failedItemId: f.id })
            }
            const topName = uniqueTopName(input.duplicate ? `${f.name} (copy)` : f.name)
            const newId = await planFolderSubtree({ id: f.id, path: f.path, depth: f.depth }, topName)
            copied.push({ type: 'folder', id: f.id, newId })
        } else {
            const a = srcAssets.find((x) => x.id === item.id)!
            const cv = a.currentVersion
            if (!cv || cv.pipelineStatus !== 'READY' || !cv.r2Key) {
                skippedAssets += 1
                continue
            }
            const name = input.duplicate ? `${a.name} (copy)` : a.name
            const pa = planAsset(a, cv, target.id, name)
            copied.push({ type: 'asset', id: a.id, newId: pa.newAssetId })
        }
    }

    // ---- roll up counters (itemCount + recursive bytes) ----
    for (const pa of plannedAssets) {
        const pf = folderMap.get(pa.folderNewId) // undefined = top-level asset copied straight into target
        if (pf) {
            pf.itemCount += 1
            pf.bytes += pa.bytes
        }
    }
    for (const pf of plannedFolders) {
        const parent = folderMap.get(pf.parentNewId)
        if (parent) parent.itemCount += 1 // each planned folder is a direct child of its planned parent
    }
    // deepest-first so a child's total is finalized before it rolls into its parent.
    for (const pf of [...plannedFolders].sort((a, b) => b.depth - a.depth)) {
        const parent = folderMap.get(pf.parentNewId)
        if (parent) parent.bytes += pf.bytes
    }

    // Bytes added to the target's ancestor chain + how many direct children target gains.
    let bytesToTarget = BigInt(0)
    let targetItemsGained = 0
    for (const c of copied) {
        if (c.type === 'folder') {
            const pf = folderMap.get(c.newId)!
            bytesToTarget += pf.bytes
            targetItemsGained += 1
        } else {
            const pa = plannedAssets.find((x) => x.newAssetId === c.newId)!
            bytesToTarget += pa.bytes
            targetItemsGained += 1
        }
    }

    if (plannedFolders.length === 0 && plannedAssets.length === 0) {
        return { copied, skippedAssets } // nothing copyable (e.g. single non-ready asset skipped)
    }

    // ---- materialize (bulk) ----
    await prisma.$transaction(
        async (tx) => {
            if (plannedFolders.length) {
                await tx.reviewFolder.createMany({
                    data: plannedFolders.map((pf) => ({
                        id: pf.newId,
                        workspaceId,
                        parentId: pf.parentNewId,
                        name: pf.name,
                        path: pf.path,
                        depth: pf.depth,
                        createdById: access.userId,
                        itemCount: pf.itemCount,
                        totalSizeBytes: pf.bytes,
                    })),
                })
            }
            if (plannedAssets.length) {
                await tx.reviewAsset.createMany({
                    data: plannedAssets.map((pa) => ({
                        id: pa.newAssetId,
                        folderId: pa.folderNewId,
                        workspaceId,
                        name: pa.name,
                        mediaKind: pa.assetMediaKind,
                        createdById: access.userId,
                        currentVersionId: null, // linked after versions exist (circular FK)
                    })),
                })
                await tx.reviewVersion.createMany({
                    data: plannedAssets.map((pa) => ({
                        id: pa.newVersionId,
                        assetId: pa.newAssetId,
                        versionNumber: 1,
                        workspaceId,
                        fileName: pa.v.fileName,
                        mediaKind: pa.v.mediaKind,
                        mimeType: pa.v.mimeType,
                        sizeBytes: pa.v.sizeBytes,
                        pipelineStatus: pa.v.pipelineStatus,
                        uploadedAt: pa.v.uploadedAt,
                        readyAt: pa.v.readyAt,
                        durationMs: pa.v.durationMs,
                        fpsNumerator: pa.v.fpsNumerator,
                        fpsDenominator: pa.v.fpsDenominator,
                        width: pa.v.width,
                        height: pa.v.height,
                        videoCodec: pa.v.videoCodec,
                        audioCodec: pa.v.audioCodec,
                        r2Key: pa.v.r2Key,
                        muxAssetId: null, // MUST be null (schema UNIQUE) — copy shares muxPlaybackId instead
                        muxPlaybackId: pa.v.muxPlaybackId,
                        thumbTime: pa.v.thumbTime,
                        thumbnailKey: pa.v.thumbnailKey,
                        reviewState: ReviewState.DRAFT,
                        commentCount: 0,
                        uploaderId: pa.v.uploaderId,
                    })),
                })
                // Link each new asset's head to its (single) new version in one statement.
                const newAssetIds = plannedAssets.map((pa) => pa.newAssetId)
                await tx.$executeRaw(
                    Prisma.sql`UPDATE "ReviewAsset" a SET "currentVersionId" = v.id FROM "ReviewVersion" v WHERE v."assetId" = a.id AND a.id IN (${Prisma.join(newAssetIds)})`,
                )
            }
            // Target gains the top-level children + the whole copied byte weight up its chain.
            await tx.reviewFolder.update({ where: { id: target.id }, data: { itemCount: { increment: targetItemsGained } } })
            await addBytesToAncestors(tx, pathIds(target.path), bytesToTarget)
        },
        { timeout: 30000, maxWait: 15000 },
    )

    return { copied, skippedAssets }
}

// ─────────────────────── folder download manifest ───────────────────────

const MAX_MANIFEST_FILES = 500 // §1.7 [S] — client-side sequential presigned GET queue

/**
 * Flatten a folder subtree into a list of its live assets' READY head versions with a
 * relative path (dir/…/fileName) — the client downloads each via the per-version
 * download-url route (which re-checks access + presigns). No presigning here (kept in
 * one place). Truncated at MAX_MANIFEST_FILES (surfaced so the UI can warn).
 */
export async function getFolderManifest(
    folderId: string,
): Promise<{ folderName: string; files: { versionId: string; fileName: string; relPath: string }[]; truncated: boolean }> {
    const folder = await prisma.reviewFolder.findFirst({ where: { id: folderId, deletedAt: null } })
    if (!folder) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
    const access = await requireReviewAccess({ workspaceId: folder.workspaceId })
    // [FR-03] editor chỉ tải subtree trong phạm vi được giao; folder ngoài phạm vi → 403.
    const scope = await getFolderScope({ userId: access.userId, workspaceId: folder.workspaceId, isAdmin: access.isAdmin })
    if (!isPathVisible(scope, folder.path)) throw apiError(403, 'FORBIDDEN', 'Bạn không có quyền xem thư mục này.')

    const subFolders = await prisma.reviewFolder.findMany({
        where: { path: { startsWith: folder.path }, deletedAt: null },
        select: { id: true, name: true, path: true },
    })
    // [FR-03] chỉ liệt kê asset trong folder được giao (mutable) — folder tổ tiên xem-được
    // nhưng KHÔNG lộ filename asset của người khác.
    const includableFolderIds = scope.unrestricted
        ? new Set(subFolders.map((f) => f.id))
        : new Set(subFolders.filter((f) => isPathMutable(scope, f.path)).map((f) => f.id))
    // relative dir for a subfolder = names of the folders BELOW `folder` on its path.
    const nameById = new Map(subFolders.map((f) => [f.id, f.name]))
    const relDirOf = (f: { path: string }): string => {
        const ids = pathIds(f.path)
        const baseIdx = ids.indexOf(folder.id)
        const belowBase = baseIdx >= 0 ? ids.slice(baseIdx + 1) : ids
        return belowBase.map((id) => nameById.get(id) ?? '—').join('/')
    }
    const relDirByFolderId = new Map(subFolders.map((f) => [f.id, relDirOf(f)]))

    const assets = await prisma.reviewAsset.findMany({
        where: { folderId: { in: [...includableFolderIds] }, deletedAt: null },
        include: { currentVersion: { select: { id: true, fileName: true, pipelineStatus: true, r2Key: true } } },
        orderBy: [{ folderId: 'asc' }, { name: 'asc' }],
    })

    const files: { versionId: string; fileName: string; relPath: string }[] = []
    let truncated = false
    for (const a of assets) {
        const cv = a.currentVersion
        if (!cv || cv.pipelineStatus !== 'READY' || !cv.r2Key) continue
        if (files.length >= MAX_MANIFEST_FILES) {
            truncated = true
            break
        }
        const dir = relDirByFolderId.get(a.folderId) ?? ''
        files.push({ versionId: cv.id, fileName: cv.fileName, relPath: dir ? `${dir}/${cv.fileName}` : cv.fileName })
    }
    return { folderName: folder.name, files, truncated }
}
