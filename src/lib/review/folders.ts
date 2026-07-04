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
import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { requireReviewAccess } from './access'
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
function pathIds(path: string): string[] {
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
async function addBytesToAncestors(tx: Prisma.TransactionClient, ids: string[], delta: bigint): Promise<void> {
    if (ids.length === 0 || delta === BigInt(0)) return
    await tx.$executeRaw(
        Prisma.sql`UPDATE "ReviewFolder" SET "totalSizeBytes" = "totalSizeBytes" + ${delta} WHERE id IN (${Prisma.join(ids)})`,
    )
}

/** Sum of live version bytes for a stack (the bytes it contributes to folder rollups). */
async function liveStackBytes(tx: Prisma.TransactionClient, assetId: string): Promise<bigint> {
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
    await requireReviewAccess({ workspaceId: folder.workspaceId })

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
    let container: { id: string; totalSizeBytes: bigint }
    if (input.folderId == null) {
        if (!input.workspaceId) throw apiError(400, 'VALIDATION_ERROR', 'Thiếu workspaceId cho thư mục gốc.')
        await requireReviewAccess({ workspaceId: input.workspaceId })
        const root = await readRoot(input.workspaceId)
        if (!root) {
            return { folders: [], assets: [], summary: { folderCount: 0, assetCount: 0, totalBytes: '0' }, nextCursor: null }
        }
        const row = await prisma.reviewFolder.findUnique({ where: { id: root.id }, select: { id: true, totalSizeBytes: true } })
        if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục gốc.')
        container = row
    } else {
        const row = await prisma.reviewFolder.findFirst({
            where: { id: input.folderId, deletedAt: null },
            select: { id: true, workspaceId: true, totalSizeBytes: true },
        })
        if (!row) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
        await requireReviewAccess({ workspaceId: row.workspaceId })
        container = { id: row.id, totalSizeBytes: row.totalSizeBytes }
    }
    const parentId = container.id

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

    const assetRows = await prisma.reviewAsset.findMany({
        where: { folderId: parentId, deletedAt: null },
        include: { currentVersion: true },
        orderBy: assetOrderBy(sort, dir),
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    })
    const hasMore = assetRows.length > limit
    const pageAssets = hasMore ? assetRows.slice(0, limit) : assetRows
    const nextCursor = hasMore ? pageAssets[pageAssets.length - 1].id : null

    const userRefs = await loadUserRefs([
        ...folderRows.map((f) => f.createdById),
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

    const folders = folderRows.map((f) =>
        serializeFolder(f, { createdBy: f.createdById ? userRefs.get(f.createdById) ?? null : null }),
    )
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
        summary: { folderCount, assetCount, totalBytes: container.totalSizeBytes.toString() },
        nextCursor,
    }
}

// ─────────────────────────── tree ───────────────────────────

export async function getFolderTree(
    workspaceId: string,
): Promise<{ folders: { id: string; parentId: string | null; name: string; hasChildren: boolean }[] }> {
    await requireReviewAccess({ workspaceId })
    const rows = await prisma.reviewFolder.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, parentId: true, name: true },
        orderBy: { name: 'asc' },
        take: TREE_CAP + 1,
    })
    if (rows.length > TREE_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', 'Workspace vượt quá giới hạn số thư mục.', { reason: 'tree_cap' })
    }
    const hasChild = new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))
    return { folders: rows.map((r) => ({ id: r.id, parentId: r.parentId, name: r.name, hasChildren: hasChild.has(r.id) })) }
}

// ─────────────────────────── rename ───────────────────────────

export async function renameFolder(
    folderId: string,
    input: { name: string; expectedRowVersion: number },
): Promise<FolderDto> {
    const name = validateName(input.name)
    const existing = await prisma.reviewFolder.findFirst({ where: { id: folderId, deletedAt: null } })
    if (!existing) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
    await requireReviewAccess({ workspaceId: existing.workspaceId })

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
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null } }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    await requireReviewAccess({ workspaceId })

    // Ensure root (if target = root) BEFORE the mutation tx to avoid create-in-tx aborts.
    let resolvedTargetId = input.targetFolderId
    if (resolvedTargetId == null) resolvedTargetId = (await ensureWorkspaceRoot(workspaceId)).id

    return prisma.$transaction(async (tx) => {
        const target = await tx.reviewFolder.findFirst({
            where: { id: resolvedTargetId!, deletedAt: null },
            select: { id: true, path: true, depth: true, workspaceId: true },
        })
        if (!target) throw apiError(409, 'STATE_INVALID', 'Thư mục đích không hợp lệ hoặc đã bị xóa.')
        if (target.workspaceId !== workspaceId) throw apiError(400, 'CROSS_WORKSPACE', 'Thư mục đích khác workspace.')

        const moved: { type: ItemType; id: string; rowVersion: number }[] = []

        for (const folder of folderRows) {
            const item = input.items.find((i) => i.type === 'folder' && i.id === folder.id)!
            if (folder.rowVersion !== item.expectedRowVersion) {
                throw apiError(409, 'ROW_VERSION_MISMATCH', 'Thư mục đã thay đổi.', { failedItemId: folder.id, current: folder.rowVersion })
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

        for (const asset of assetRows) {
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
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: null } }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại hoặc đã ở trong thùng rác.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    const access = await requireReviewAccess({ workspaceId })

    const now = new Date()
    await prisma.$transaction(async (tx) => {
        for (const folder of folderRows) {
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
    const start = input.cursor ? all.findIndex((i) => i.id === input.cursor) + 1 : 0
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
