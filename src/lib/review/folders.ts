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
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { parseVideoTitle } from './parse-task-context'
import {
    serializeFolder,
    serializeAsset,
    serializeVersion,
    toUserRef,
    type FolderDto,
    type AssetDto,
    type ItemType,
    type TrashItemType,
    type UserRef,
} from './dto'
import { buildMediaLinks, buildPosterUrl } from './media-links'
import { buildSystemKey } from './upload-helpers'
import { reviewLog } from './logger'

const MAX_DEPTH = 20 // API-SPEC §1.1 (block abuse)
const NAME_MAX = 255
const TREE_CAP = 2000 // §1.4
const BULK_CAP = 200 // §1.6/§1.8 (PRD FR-B11)
const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

export interface BreadcrumbItem {
    id: string
    name: string
    /** true = this ancestor is in the trash. It is NOT navigable (getFolder 404s on it), so the
     *  UI must render it as plain text rather than a link that dead-ends. */
    deleted?: boolean
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
    type: TrashItemType
    id: string
    name: string
    deletedAt: string
    purgeAt: string
    deletedBy: UserRef | null
    restorable: boolean
    meta: {
        itemCount?: number
        sizeBytes?: string
        versionCount?: number
        /** Folders only — descendants that are still LIVE under this trashed folder. Non-zero means
         *  "Xóa vĩnh viễn" cannot complete: the purge refuses to destroy a folder that still holds
         *  live rows (purge.ts folderHasDescendantRow). Surfaced so the UI can say so up front. */
        liveDescendants?: number
    }
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
    if (!row) return null
    // Same trap as ensureFolder/ensureRootFolder: the systemKey lookup ignores deletedAt, and this
    // one feeds the ROOT LISTING (listChildren, folderId == null). A trashed root would keep
    // serving "Tệp" as if nothing were wrong while every child query filtered against it. Revive
    // rather than return null — returning null would blank the whole workspace's Files instead.
    if (row.deletedAt) await reviveSystemFolderChain(row.id)
    return { id: row.id, path: row.path, depth: row.depth, name: row.name }
}

/**
 * Ensure the workspace root exists. Runs OUTSIDE any caller transaction (its own
 * create + P2002 refetch) so a create race — a browser New-Folder colliding with
 * a task-upload auto-chain in a fresh workspace — never aborts the caller's tx.
 */
async function ensureWorkspaceRoot(workspaceId: string, createdById?: string): Promise<RootRef> {
    const systemKey = buildSystemKey({ workspaceId })
    const existing = await prisma.reviewFolder.findUnique({ where: { systemKey } })
    if (existing) {
        // A trashed root would hide the ENTIRE workspace's Files while still squatting the
        // unique systemKey (so no replacement can ever be created). See reviveSystemFolderChain.
        if (existing.deletedAt) await reviveSystemFolderChain(existing.id)
        return existing
    }
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

/**
 * Un-trash a SYSTEM folder (systemKey != null) and every soft-deleted ancestor above it.
 *
 * WHY THIS EXISTS — the "delivered video is invisible in Tệp" bug (2026-07-27 report):
 * `ReviewFolder.systemKey` is @unique, and every find-or-create path resolves it with a
 * plain findUnique that does NOT filter `deletedAt`. So the moment a system folder is
 * trashed, its key is squatted FOREVER: no replacement row can be created, and every later
 * task upload silently re-parents fresh content underneath a soft-deleted ancestor. The
 * content is then unreachable — the tree, the root listing and getFolder all filter
 * `deletedAt: null` — while the purge cron refuses to reap the trashed folder because it
 * still holds live descendants. A permanent, self-perpetuating dead zone. Measured on prod:
 * one trashed client folder was swallowing 5 delivered videos over 20 days.
 *
 * The caller is uploading INTO this path right now, so refusing is not an option (the editor
 * cannot restore a folder they usually cannot even see). Reviving is the only outcome that
 * matches intent, and it self-heals the moment anyone uploads for that client again.
 *
 * Scope is deliberately narrow — ONLY the folder rows on the ancestor chain, never the
 * original delete batch. Content the admin meant to throw away stays in the trash and stays
 * restorable; we just re-open the corridor to it.
 *
 * Byte rollups need NO adjustment: `addBytesToAncestors` has never filtered `deletedAt`, so
 * uploads made while the ancestor was trashed already propagated their bytes all the way to
 * the root. The only bytes missing upstairs belong to the original batch, which stays trashed
 * — so leaving the totals alone is exactly right. `itemCount` DOES need the +1 that
 * `deleteItems` took away from the live parent.
 */
export async function reviveSystemFolderChain(folderId: string): Promise<void> {
    const folder = await prisma.reviewFolder.findUnique({
        where: { id: folderId },
        select: { id: true, path: true, workspaceId: true, name: true },
    })
    if (!folder) return

    // root → … → self. Anything on this chain that is trashed blocks reachability. `folder.id` is
    // unioned in explicitly: a row whose materialized path never got patched off the '/' placeholder
    // (create succeeded, patch didn't) would otherwise yield an empty chain and silently skip the
    // very folder we were asked to revive.
    const chain = Array.from(new Set([...pathIds(folder.path), folder.id]))
    const trashed = await prisma.reviewFolder.findMany({
        where: { id: { in: chain }, deletedAt: { not: null } },
        select: { id: true, parentId: true, depth: true, name: true },
    })
    if (trashed.length === 0) return

    // Shallowest first so a parent is already live when its child's itemCount lands.
    trashed.sort((a, b) => a.depth - b.depth)
    const revivedIds = new Set(trashed.map((f) => f.id))

    await prisma.$transaction(async (tx) => {
        for (const f of trashed) {
            // updateMany + `deletedAt: { not: null }` rather than update-by-id: two uploads racing
            // into the same trashed client folder would both observe deletedAt and both bump the
            // parent's itemCount. Here only the writer that actually flips the row counts it.
            const flipped = await tx.reviewFolder.updateMany({
                where: { id: f.id, deletedAt: { not: null } },
                data: { deletedAt: null, deletedById: null, deleteBatchId: null },
            })
            if (flipped.count === 0) continue // someone else revived it first
            // Give the parent back the child `deleteItems` decremented — but only when the
            // parent is genuinely live now (either it never was trashed, or we just revived
            // it in this same loop). Otherwise the count would drift upward.
            if (f.parentId) {
                const parentLive =
                    revivedIds.has(f.parentId) ||
                    (await tx.reviewFolder.count({ where: { id: f.parentId, deletedAt: null } })) > 0
                if (parentLive) {
                    await tx.reviewFolder.update({ where: { id: f.parentId }, data: { itemCount: { increment: 1 } } })
                }
            }
        }
    })

    reviewLog('warn', 'folders.revived_trashed_system_chain', {
        folderId: folder.id,
        workspaceId: folder.workspaceId,
        revived: trashed.map((f) => f.name),
    })
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

    // [AUDIT L1] A non-admin editor may only create a subfolder under a folder in their WRITABLE
    // scope (FR-03) — not under an arbitrary folder in another editor's subtree. Enforced only for an
    // EXPLICIT parent; a null parent (→ workspace root) creates a benign top-level folder they own,
    // consistent with initiateUpload's own folder handling.
    const explicitParent = input.parentId != null
    const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin })

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
        if (explicitParent) assertFolderPathMutable(scope, parent.path)
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
    // [audit 2026-07 S1-4] Thiếu hẳn chốt phạm vi ở đây, trong khi createFolder (hàm anh em,
    // cùng file) ĐÃ có `assertFolderPathMutable(scope, parent.path)`. Đây không phải chủ đích
    // mà là bỏ sót, và nó nặng hơn "ghi ngoài phạm vi": mỗi thư mục tạo ra được đóng dấu
    // createdById = người gọi và systemKey = null — đúng hình dạng mà getFolderScope nguồn 3
    // biến thành allowedPrefix. Tức đây là công cụ TỰ CẤP THÊM phạm vi, không chỉ ghi bậy.
    // Chỉ chặn khi người gọi tự chỉ định parentId; nhánh parentId = null rơi về gốc workspace,
    // đúng luồng kéo-thả hợp lệ mà chính S1-4 phải giữ cho chạy được.
    if (input.parentId != null) {
        const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin })
        assertFolderPathMutable(scope, base.path)
    }

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
            // deletedAt is load-bearing: this lookup deliberately does NOT filter it (a trashed
            // ancestor must still be NAMED so the trail reads sensibly), but the UI then rendered
            // it as a link whose target getFolder refuses with 404 "Không tìm thấy thư mục." —
            // the mystery the 2026-07-27 bug report hit. Flag it instead of hiding it.
            select: { id: true, name: true, deletedAt: true },
        })
        const byId = new Map(rows.map((r) => [r.id, r]))
        // element 0 = workspace root, always relabelled "Team" per UI-UX §1.2/§1.4.2.
        breadcrumb = ancestorIds.map((id, i) => ({
            id,
            name: i === 0 ? 'Team' : (byId.get(id)?.name ?? '—'),
            deleted: byId.get(id)?.deletedAt != null,
        }))
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
                      -- [audit 2026-07-27 · MED] The deletedAt test above only clears the descendant
                      -- ITSELF; a live folder sitting under a TRASHED one still qualified, so bytes
                      -- nobody can see anywhere in the grid were charged to the header total. That is
                      -- how a root could read "2 mục • 10.2 GB" while both visible folders held 200 MB,
                      -- with no way to find the rest. Exclude a descendant with any trashed folder
                      -- between it and pf.
                      AND NOT EXISTS (
                          SELECT 1 FROM "ReviewFolder" anc
                          WHERE anc."deletedAt" IS NOT NULL
                            AND anc.id <> d.id
                            AND anc.path LIKE pf.path || '%'
                            AND d.path LIKE anc.path || '%'
                      )
                ), 0)::text AS bytes
            FROM "ReviewFolder" pf
            WHERE pf.id IN (${Prisma.join(aggIds)})
        `
        for (const r of rows) recAgg.set(r.folderId, { cnt: Number(r.cnt), bytes: r.bytes })
    }

    // [Owner review 2026-07-22 — "folder mù"] Content mosaic for the folder cards. For each visible
    // folder, take its first up-to-2 DIRECT child assets (head version), so the card can show what
    // is inside instead of a blank icon. ONE window-function query over all the page's folders — no
    // N+1: ROW_NUMBER partitioned by folderId, keep rn ≤ 2. `currentVersionId` is the head; assets
    // still UPLOADING have none and are skipped by the INNER JOIN (they have nothing to preview).
    //
    // Gated to `scope.unrestricted`, exactly like the recursive counters above: a folder-scoped
    // editor (FR-03) already gets the plain icon + gated counters, and must not receive a poster of
    // a child asset outside their writable subtree. Admins/unrestricted editors get the mosaic.
    // First page only (folders are only listed there).
    // Cap: each preview tile of a video costs one RSA signature (buildPosterUrl), and the folder
    // list is unbounded, so a folder with hundreds of subfolders would block the event loop on signs.
    // Bound the work to the first N folders (already name-ordered); the rest show the plain icon.
    const PREVIEW_FOLDER_CAP = 60
    const previewByFolder = new Map<string, { assetId: string; muxPlaybackId: string | null; thumbTime: number | null; mediaKind: string }[]>()
    const previewFolderRows = visibleFolderRows.slice(0, PREVIEW_FOLDER_CAP)
    if (scope.unrestricted && previewFolderRows.length) {
        const pvIds = previewFolderRows.map((f) => f.id)
        const pv = await prisma.$queryRaw<{ folderId: string; assetId: string; muxPlaybackId: string | null; thumbTime: number | null; mediaKind: string }[]>`
            SELECT t."folderId", t."assetId", t."muxPlaybackId", t."thumbTime", t."mediaKind"
            FROM (
                SELECT a."folderId" AS "folderId", a.id AS "assetId", a."mediaKind"::text AS "mediaKind",
                       v."muxPlaybackId" AS "muxPlaybackId", v."thumbTime" AS "thumbTime",
                       ROW_NUMBER() OVER (PARTITION BY a."folderId" ORDER BY a."createdAt" ASC, a.id ASC) AS rn
                FROM "ReviewAsset" a
                JOIN "ReviewVersion" v ON v.id = a."currentVersionId"
                WHERE a."folderId" IN (${Prisma.join(pvIds)}) AND a."deletedAt" IS NULL
            ) t
            WHERE t.rn <= 2
        `
        for (const r of pv) {
            const list = previewByFolder.get(r.folderId)
            if (list) list.push(r); else previewByFolder.set(r.folderId, [r])
        }
    }

    const folders = visibleFolderRows.map((f) => {
        const cnt = scope.unrestricted ? recAgg.get(f.id)?.cnt ?? 0 : f.itemCount
        // Build the mosaic: video tiles first (a poster is minted only for a Mux-ready video; an
        // image or a still-processing video yields poster:null → the card shows a kind glyph), then
        // the "+N" overflow. Sub-folder tiles are NOT synthesized here — when a folder has fewer
        // than 2 child assets the remaining slots stay empty and the overflow count carries the
        // rest, which keeps this to the single asset query. `more` mirrors the client portal: total
        // direct children minus the tiles actually shown.
        const pvRows = previewByFolder.get(f.id) ?? []
        const tiles = pvRows.map((r) => ({
            // buildPosterUrl = ONE RSA sign (not buildMediaLinks' three) — a tile needs only the
            // thumbnail token, and this runs up to 2× per folder over the whole page.
            poster: buildPosterUrl({ muxPlaybackId: r.muxPlaybackId, thumbTime: r.thumbTime }),
            kind: (r.mediaKind === 'IMAGE' ? 'image' : 'video') as 'image' | 'video',
        }))
        const preview = tiles.length > 0 ? { tiles, more: Math.max(0, cnt - tiles.length) } : null
        const dto = serializeFolder(f, {
            createdBy: f.createdById ? userRefs.get(f.createdById) ?? null : null,
            preview,
        })
        // Unrestricted → live-recomputed counters (direct-child count + recursive bytes);
        // restricted → keep the denormalized/gated value untouched.
        return scope.unrestricted ? { ...dto, itemCount: cnt, totalBytes: recAgg.get(f.id)?.bytes ?? '0' } : dto
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

// ─────────────────────── group / ungroup (foldering 2026-07-27) ───────────────────────

/** Free name in `folderId`, appending " (2)", " (3)"… until the partial unique index is satisfied:
 *  UNIQUE ("folderId", lower("name")) WHERE "deletedAt" IS NULL. */
async function freeAssetName(tx: Prisma.TransactionClient, folderId: string, desired: string): Promise<string> {
    const siblings = await tx.reviewAsset.findMany({
        where: { folderId, deletedAt: null },
        select: { name: true },
    })
    const taken = new Set(siblings.map((s) => s.name.toLowerCase()))
    if (!taken.has(desired.toLowerCase())) return desired
    for (let n = 2; n < 1000; n++) {
        const candidate = `${desired} (${n})`
        if (!taken.has(candidate.toLowerCase())) return candidate
    }
    return `${desired} (${randomUUID().slice(0, 8)})`
}

/**
 * "Bỏ thư mục" — lift a folder's videos up to its parent and remove the now-empty wrapper.
 *
 * The manual counterpart to the automatic decision at upload time: uploads only create the
 * per-task folder for a dropped SET, but a set can later shrink to one, or the grouping can
 * simply be unwanted. Rather than guessing on the user's behalf we give them the inverse.
 *
 * Refuses rather than cascades when the folder has sub-folders (nothing here decides where a
 * whole subtree should land) or is referenced by a share link (ShareLinkItem → folder is
 * onDelete: Cascade, so removing it would silently break a link already sent to a client).
 */
export async function ungroupFolder(input: { folderId: string }): Promise<{ movedAssetIds: string[]; parentId: string }> {
    const folder = await prisma.reviewFolder.findFirst({
        where: { id: input.folderId, deletedAt: null },
        select: { id: true, name: true, parentId: true, path: true, workspaceId: true, createdById: true },
    })
    if (!folder) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
    if (!folder.parentId) throw apiError(409, 'STATE_INVALID', 'Không bỏ được thư mục gốc.')

    const access = await requireReviewAccess({ workspaceId: folder.workspaceId })
    // Same gate as deleteItems: a non-admin may only restructure folders they created, inside
    // their assigned subtree.
    if (!access.isAdmin) {
        if (folder.createdById !== access.userId) {
            throw apiError(403, 'FORBIDDEN', 'Chỉ người tạo hoặc quản trị được bỏ thư mục này.')
        }
        const scope = await getFolderScope({ userId: access.userId, workspaceId: folder.workspaceId, isAdmin: false })
        assertFolderPathsMutable(scope, [folder.path])
    }

    const [childFolders, shareItems] = await Promise.all([
        prisma.reviewFolder.count({ where: { parentId: folder.id, deletedAt: null } }),
        prisma.shareLinkItem.count({ where: { folderId: folder.id } }),
    ])
    if (childFolders > 0) {
        throw apiError(409, 'STATE_INVALID', 'Thư mục còn thư mục con — di chuyển chúng ra trước.')
    }
    if (shareItems > 0) {
        throw apiError(409, 'STATE_INVALID', 'Thư mục đang được chia sẻ qua link — gỡ link chia sẻ trước.')
    }

    const parentId = folder.parentId
    return prisma.$transaction(async (tx) => {
        const assets = await tx.reviewAsset.findMany({
            where: { folderId: folder.id, deletedAt: null },
            select: { id: true, name: true },
        })
        for (const a of assets) {
            const name = await freeAssetName(tx, parentId, a.name)
            await tx.reviewAsset.update({ where: { id: a.id }, data: { folderId: parentId, name } })
        }
        // Trashed assets still point at this folder (ReviewAsset.folder is onDelete: Restrict), so
        // they have to come along or the delete below throws — and a restore must not resurrect an
        // item into a folder that no longer exists.
        await tx.reviewAsset.updateMany({
            where: { folderId: folder.id, deletedAt: { not: null } },
            data: { folderId: parentId },
        })
        await tx.reviewFolder.delete({ where: { id: folder.id } })
        // Parent loses one folder, gains the assets. Ancestor byte totals are unchanged: these
        // bytes were already counted through this folder on the way up.
        await tx.reviewFolder.update({
            where: { id: parentId },
            data: { itemCount: { increment: assets.length - 1 } },
        })
        reviewLog('info', 'folders.ungrouped', { folderId: folder.id, name: folder.name, assets: assets.length })
        return { movedAssetIds: assets.map((a) => a.id), parentId }
    })
}

/**
 * "Gộp thành thư mục" — the inverse: put selected videos into a new folder beside them.
 *
 * Covers the case the upload path deliberately refuses to guess: hook 2 arrives days after
 * hook 1, as a separate single upload. That gesture already means "next version", so it can
 * never auto-group; the user says so here instead.
 */
export async function groupAssetsIntoFolder(input: {
    assetIds: string[]
    name: string
}): Promise<{ folderId: string }> {
    if (input.assetIds.length < 2 || input.assetIds.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Chọn từ 2–${BULK_CAP} video để gộp.`)
    }
    const name = validateName(input.name)
    const assets = await prisma.reviewAsset.findMany({
        where: { id: { in: input.assetIds }, deletedAt: null },
        select: { id: true, name: true, folderId: true, workspaceId: true, folder: { select: { path: true } } },
    })
    if (assets.length !== input.assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều video không tồn tại.')
    }
    const parents = new Set(assets.map((a) => a.folderId))
    if (parents.size !== 1) {
        throw apiError(400, 'VALIDATION_ERROR', 'Chỉ gộp được các video đang nằm chung một thư mục.')
    }
    const workspaces = new Set(assets.map((a) => a.workspaceId))
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các video không cùng workspace.')
    const parentId = [...parents][0]
    const workspaceId = [...workspaces][0]

    const access = await requireReviewAccess({ workspaceId })
    if (!access.isAdmin) {
        const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: false })
        assertFolderPathsMutable(scope, [assets[0].folder?.path ?? ''])
    }

    // createFolder runs its own access check + name de-dup + counter bookkeeping.
    const folder = await createFolder({ workspaceId, parentId, name })
    await prisma.$transaction(async (tx) => {
        for (const a of assets) {
            const free = await freeAssetName(tx, folder.id, a.name)
            await tx.reviewAsset.update({ where: { id: a.id }, data: { folderId: folder.id, name: free } })
        }
        await tx.reviewFolder.update({ where: { id: parentId }, data: { itemCount: { decrement: assets.length } } })
        await tx.reviewFolder.update({ where: { id: folder.id }, data: { itemCount: { increment: assets.length } } })
    })
    reviewLog('info', 'folders.grouped', { folderId: folder.id, name, assets: assets.length })
    return { folderId: folder.id }
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

    // [audit 2026-07-27 · MED] The workspace root is infrastructure, not a user artifact, and must
    // never be trashable. Trashing it left /team rendering a healthy-looking EMPTY root — the root is
    // resolved by systemKey, and that lookup does not filter deletedAt — while the sidebar went blank
    // and every breadcrumb 404'd: a silent whole-workspace outage with no error anywhere. FR-B07 below
    // does not catch it, because the auto-chain used to stamp the root with the first uploading
    // editor's id, so that editor passes the creator check on it. The id is reachable: /api/review/tree
    // hands it to the client. Narrower than the audit's "reject every systemKey folder" — auto-created
    // client/video folders stay deletable, since reviveSystemFolderChain now un-squats a trashed key
    // instead of letting it poison the workspace forever.
    const rootRow = folderRows.find((f) => f.parentId === null)
    if (rootRow) {
        throw apiError(409, 'STATE_INVALID', 'Không thể xóa thư mục gốc của workspace — hãy xóa nội dung bên trong.', {
            failedItemId: rootRow.id,
        })
    }

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
        // [audit 2026-07-27 · LOW] Same workspace lock moveItems takes. Without it, an upload starting
        // just before this tx could insert its ReviewAsset AFTER the subtree snapshot below is taken,
        // leaving a live asset under a folder this call is trashing — invisible in the grid and enough
        // to block that folder's purge forever. initiateUpload now takes the same lock, so the two
        // serialize instead of interleaving.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`
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
    const access = await requireReviewAccess({ workspaceId: input.workspaceId })
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)

    // Fetch every deleted folder/asset in the workspace; batch roots are identified
    // in-memory (workspace trash is bounded; nightly purge caps growth).
    // [AUDIT HT-028] `path` / `folder.path` are selected so a non-admin's view can be folder-scoped.
    const [delFolders, delAssets] = await Promise.all([
        prisma.reviewFolder.findMany({
            where: { workspaceId: input.workspaceId, deletedAt: { not: null } },
            select: { id: true, name: true, path: true, parentId: true, deletedAt: true, deletedById: true, deleteBatchId: true, itemCount: true, totalSizeBytes: true, orphanedFromPurge: true },
        }),
        prisma.reviewAsset.findMany({
            where: { workspaceId: input.workspaceId, deletedAt: { not: null } },
            select: { id: true, name: true, folderId: true, deletedAt: true, deletedById: true, deleteBatchId: true, folder: { select: { path: true } } },
        }),
    ])

    const folderById = new Map(delFolders.map((f) => [f.id, f]))
    // A deleted FOLDER is a batch root when its parent is NOT deleted in the same batch.
    let rootFolders = delFolders.filter((f) => {
        if (!f.parentId) return true
        const parent = folderById.get(f.parentId)
        return !parent || parent.deleteBatchId !== f.deleteBatchId
    })
    // A deleted ASSET is a batch root when its folder is NOT deleted in the same batch.
    let rootAssets = delAssets.filter((a) => {
        const folder = folderById.get(a.folderId)
        return !folder || folder.deleteBatchId !== a.deleteBatchId
    })

    // [AUDIT HT-028 fix] FR-03: a non-admin editor must only SEE trash items inside their assigned
    // subtree. Trash names + who-deleted are exactly the metadata listChildren/getFolderTree hide
    // out-of-scope, so listTrash applies the same folder-scope filter.
    if (!access.isAdmin) {
        const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin })
        if (!scope.unrestricted) {
            rootFolders = rootFolders.filter((f) => isPathVisible(scope, f.path))
            rootAssets = rootAssets.filter((a) => isPathVisible(scope, a.folder?.path ?? ''))
        }
    }

    const rootAssetIds = rootAssets.map((a) => a.id)
    const vCounts = rootAssetIds.length
        ? await prisma.reviewVersion.groupBy({ by: ['assetId'], where: { assetId: { in: rootAssetIds } }, _count: { _all: true } })
        : []
    const vCount = new Map(vCounts.map((r) => [r.assetId, r._count._all]))

    // [audit 2026-07-27 · HIGH] Versions deleted one-at-a-time out of a multi-version stack were
    // invisible here: listTrash only ever queried folders and assets. The confirm dialog promises
    // "chuyển vào Đã xóa gần đây (khôi phục được trong 30 ngày)", the purge cron destroys exactly
    // these rows at day 30, and in between nothing in the product could show or restore them.
    // A trashed version is a trash ROOT only when its asset is still alive AND it is not riding
    // along in the asset's/folder's delete batch — otherwise the stack row already represents it.
    const delVersions = await prisma.reviewVersion.findMany({
        where: {
            workspaceId: input.workspaceId,
            deletedAt: { not: null },
            asset: { deletedAt: null },
        },
        select: {
            id: true,
            versionNumber: true,
            deletedAt: true,
            deletedById: true,
            sizeBytes: true,
            asset: { select: { id: true, name: true, folder: { select: { path: true } } } },
        },
    })
    let rootVersions = delVersions
    if (!access.isAdmin) {
        const scope = await getFolderScope({ userId: access.userId, workspaceId: input.workspaceId, isAdmin: access.isAdmin })
        if (!scope.unrestricted) rootVersions = rootVersions.filter((v) => isPathVisible(scope, v.asset.folder?.path ?? ''))
    }

    // [audit 2026-07-27 · MED] Trash rows used to read `itemCount` / `totalSizeBytes` straight off the
    // row. The task-upload auto-chain never maintains those counters (neither initiateUpload nor
    // completeUpload calls addBytesToAncestors), so exactly the folders at the centre of the original
    // incident presented as "0 mục · 0 B" — an admin hunting a missing video sees what looks like an
    // empty stray and reaches for Xóa vĩnh viễn on the one container that could make it reachable.
    // listChildren already self-heals this way ([L11] above); the trash list now does too.
    //
    // Counted WITHOUT a deletedAt filter on purpose: everything under a trashed folder is trashed, so
    // filtering to live rows is what produced the 0 in the first place. `live` is tracked separately —
    // it is the count that blocks Xóa vĩnh viễn (purge.ts folderHasDescendantRow), so the UI can warn
    // instead of reporting a silent no-op as success.
    const folderMeta = new Map<string, { cnt: number; bytes: string; live: number }>()
    if (rootFolders.length) {
        const metaRows = await prisma.$queryRaw<{ folderId: string; cnt: number; bytes: string; live: number }[]>`
            SELECT pf.id AS "folderId",
                ((SELECT COUNT(*) FROM "ReviewFolder" cf WHERE cf."parentId" = pf.id)
                 + (SELECT COUNT(*) FROM "ReviewAsset" ca WHERE ca."folderId" = pf.id))::int AS cnt,
                COALESCE((
                    SELECT SUM(v."sizeBytes")
                    FROM "ReviewFolder" d
                    JOIN "ReviewAsset" a ON a."folderId" = d.id
                    JOIN "ReviewVersion" v ON v."assetId" = a.id
                    WHERE d.path LIKE pf.path || '%'
                ), 0)::text AS bytes,
                ((SELECT COUNT(*) FROM "ReviewFolder" lf
                   WHERE lf.path LIKE pf.path || '%' AND lf.id <> pf.id AND lf."deletedAt" IS NULL)
                 + (SELECT COUNT(*) FROM "ReviewAsset" la
                     JOIN "ReviewFolder" ld ON ld.id = la."folderId"
                    WHERE ld.path LIKE pf.path || '%' AND la."deletedAt" IS NULL))::int AS live
            FROM "ReviewFolder" pf
            WHERE pf.id IN (${Prisma.join(rootFolders.map((f) => f.id))})
        `
        for (const r of metaRows) folderMeta.set(r.folderId, { cnt: Number(r.cnt), bytes: r.bytes, live: Number(r.live) })
    }

    const userRefs = await loadUserRefs([
        ...rootFolders.map((f) => f.deletedById),
        ...rootAssets.map((a) => a.deletedById),
        ...rootVersions.map((v) => v.deletedById),
    ])
    const purgeAtOf = (deletedAt: Date) => new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const all: TrashItemDto[] = [
        ...rootVersions.map((v): TrashItemDto => ({
            type: 'version',
            id: v.id,
            // The stack name alone would be ambiguous — several versions of one asset can sit in
            // the trash at once. Name the version so the admin can tell them apart.
            name: `${v.asset.name} · v${v.versionNumber}`,
            deletedAt: v.deletedAt!.toISOString(),
            purgeAt: purgeAtOf(v.deletedAt!),
            deletedBy: v.deletedById ? userRefs.get(v.deletedById) ?? null : null,
            restorable: true,
            meta: { sizeBytes: v.sizeBytes.toString() },
        })),
        ...rootFolders.map((f): TrashItemDto => ({
            type: 'folder',
            id: f.id,
            name: f.name,
            deletedAt: f.deletedAt!.toISOString(),
            purgeAt: purgeAtOf(f.deletedAt!),
            deletedBy: f.deletedById ? userRefs.get(f.deletedById) ?? null : null,
            restorable: !f.orphanedFromPurge,
            meta: {
                itemCount: folderMeta.get(f.id)?.cnt ?? f.itemCount,
                sizeBytes: folderMeta.get(f.id)?.bytes ?? f.totalSizeBytes.toString(),
                liveDescendants: folderMeta.get(f.id)?.live ?? 0,
            },
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
    items: { type: TrashItemType; id: string }[]
}): Promise<{ restored: { type: TrashItemType; id: string; restoredToFolderId: string | null; movedToRoot: boolean }[] }> {
    if (input.items.length < 1 || input.items.length > BULK_CAP) {
        throw apiError(400, 'VALIDATION_ERROR', `Số mục phải từ 1–${BULK_CAP}.`)
    }
    const folderIds = input.items.filter((i) => i.type === 'folder').map((i) => i.id)
    const assetIds = input.items.filter((i) => i.type === 'asset').map((i) => i.id)
    const versionIds = input.items.filter((i) => i.type === 'version').map((i) => i.id)
    const [folderRows, assetRows, versionRows] = await Promise.all([
        prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: { not: null } } }),
        prisma.reviewAsset.findMany({ where: { id: { in: assetIds }, deletedAt: { not: null } }, include: { folder: { select: { path: true } } } }),
        // A version is only restorable on its own while its stack is alive; if the asset is also
        // trashed the caller must restore the ASSET, which brings the whole batch back with it.
        prisma.reviewVersion.findMany({
            where: { id: { in: versionIds }, deletedAt: { not: null }, asset: { deletedAt: null } },
            include: { asset: { select: { id: true, folder: { select: { path: true } } } } },
        }),
    ])
    if (folderRows.length !== folderIds.length || assetRows.length !== assetIds.length || versionRows.length !== versionIds.length) {
        throw apiError(404, 'NOT_IN_TRASH', 'Một hoặc nhiều mục không nằm trong thùng rác.')
    }
    const workspaces = new Set([...folderRows.map((f) => f.workspaceId), ...assetRows.map((a) => a.workspaceId), ...versionRows.map((v) => v.workspaceId)])
    if (workspaces.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...workspaces][0]
    const access = await requireReviewAccess({ workspaceId })

    // [AUDIT HT-027 fix] FR-B07 + FR-03 (mirror deleteItems): a non-admin editor may only restore
    // FOLDERS they created, and only items within their assigned subtree. Without this an editor
    // could restore ANY trashed item in the workspace — incl. another editor's out-of-scope items.
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

    // [audit 2026-07-27 · HIGH] Order + nesting, the two things deleteItems guards and this did not.
    //
    // ORDER: the loop below re-homes a folder to the workspace ROOT whenever its parent is still
    // deleted. `folderRows` came straight from findMany, i.e. in no particular order, so restoring
    // a parent and a separately-trashed child together was a coin flip: if the child happened to be
    // processed first its parent was still trashed, so the child was ripped out of its parent, dumped
    // at the root, and stamped orphanedFromPurge — which (see the `clear` objects below) used to be
    // permanent. Shallowest-first makes the parent live before its child is considered.
    const orderedFolderRows = [...folderRows].sort((a, b) => a.depth - b.depth)

    // NESTING: a descendant that shares its ancestor's deleteBatchId is already un-deleted by the
    // ancestor's batch-wide updateMany. Processing it again re-increments the parent's itemCount,
    // even though deleteItems only ever decremented ONCE (for the batch root). Skip those — but keep
    // a descendant trashed in a DIFFERENT batch, whose own count really was decremented separately.
    const skipFolderIds = new Set(
        orderedFolderRows
            .filter((f) =>
                orderedFolderRows.some(
                    (g) => g.id !== f.id && f.path.startsWith(g.path) && g.deleteBatchId != null && g.deleteBatchId === f.deleteBatchId,
                ),
            )
            .map((f) => f.id),
    )
    const skipAssetIds = new Set(
        assetRows
            .filter((a) =>
                orderedFolderRows.some(
                    (g) =>
                        (a.folder?.path ?? '').startsWith(g.path) && g.deleteBatchId != null && g.deleteBatchId === a.deleteBatchId,
                ),
            )
            .map((a) => a.id),
    )

    // Ensure the fallback root exists BEFORE the tx (re-home landing zone).
    const root = await ensureWorkspaceRoot(workspaceId)

    return prisma.$transaction(async (tx) => {
        const restored: { type: TrashItemType; id: string; restoredToFolderId: string | null; movedToRoot: boolean }[] = []

        for (const folder of orderedFolderRows) {
            if (skipFolderIds.has(folder.id)) continue // rides along with its selected ancestor's batch
            const batchId = folder.deleteBatchId
            // [audit 2026-07-27 · HIGH] orphanedFromPurge MUST be cleared here. It is set when a
            // restore re-homes an item to the root, and nothing ever unset it — so listTrash's
            // `restorable: !orphanedFromPurge` stayed false forever and the Trash UI hard-disabled
            // both the checkbox and the Restore button the NEXT time that item was trashed, with the
            // tooltip "thư mục gốc đã bị xóa vĩnh viễn" which was no longer true. Meanwhile the purge
            // never consulted the flag, so the item the UI refused to restore was still destroyed on
            // schedule. Restoring into a live tree means the item is no longer orphaned; say so.
            const clear = { deletedAt: null, deletedById: null, deleteBatchId: null, orphanedFromPurge: false }
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
            if (skipAssetIds.has(asset.id)) continue // rides along with its selected ancestor's batch
            const batchId = asset.deleteBatchId
            const clear = { deletedAt: null, deletedById: null, deleteBatchId: null, orphanedFromPurge: false }
            const folder = await tx.reviewFolder.findFirst({ where: { id: asset.folderId, deletedAt: null }, select: { id: true, path: true } })
            const landing = folder ?? { id: root.id, path: root.path }
            const movedToRoot = !folder

            // [audit 2026-07-27 · MED] Clearing the WHOLE batch is only correct when this asset is the
            // batch root — an asset-only delete, where deleteItems mints one batch id per asset, so the
            // batch is just this asset and its versions. When the id instead came from a FOLDER's
            // subtree sweep, the batch also holds the sibling assets and the folder rows. Clearing it
            // here un-deleted every sibling while every folder stayed trashed, leaving them live under
            // a trashed parent: invisible in the grid, 404 by folder, reachable only by direct id — the
            // exact symptom from the original bug report, reproducible with no systemKey involved. It
            // also pinned the parent forever, since purge refuses a folder with live descendants.
            // Restore only what was asked for in that case; the re-home below then lands it somewhere
            // visible rather than under the trashed folder.
            const batchHasFolders = batchId ? (await tx.reviewFolder.count({ where: { deleteBatchId: batchId } })) > 0 : false
            if (batchId && !batchHasFolders) {
                await tx.reviewAsset.updateMany({ where: { deleteBatchId: batchId }, data: clear })
                await tx.reviewVersion.updateMany({ where: { deleteBatchId: batchId }, data: clear })
            } else {
                await tx.reviewAsset.update({ where: { id: asset.id }, data: clear })
                // Only the versions that went down WITH this asset. Versions trashed separately
                // earlier (their own batch, or none) were a deliberate act and stay in the trash.
                await tx.reviewVersion.updateMany({
                    where: { assetId: asset.id, deleteBatchId: batchId ?? null, deletedAt: { not: null } },
                    data: clear,
                })
            }
            if (movedToRoot) {
                await tx.reviewAsset.update({ where: { id: asset.id }, data: { folderId: landing.id, orphanedFromPurge: true } })
            }
            const bytes = await liveStackBytes(tx, asset.id)
            await tx.reviewFolder.update({ where: { id: landing.id }, data: { itemCount: { increment: 1 } } })
            await addBytesToAncestors(tx, pathIds(landing.path), bytes)
            restored.push({ type: 'asset', id: asset.id, restoredToFolderId: landing.id, movedToRoot })
        }

        // [audit 2026-07-27 · HIGH] Restoring a single version back onto a live stack. Mirrors what
        // deleteVersion's non-last-version branch did: it re-pointed the head away and subtracted the
        // version's bytes from the folder rollup, so both have to come back.
        for (const version of versionRows) {
            const clear = { deletedAt: null, deletedById: null, deleteBatchId: null }
            if (version.deleteBatchId) {
                await tx.reviewVersion.updateMany({ where: { deleteBatchId: version.deleteBatchId }, data: clear })
            } else {
                // Legacy row from before deleteVersion minted a batch id — restore it by id.
                await tx.reviewVersion.update({ where: { id: version.id }, data: clear })
            }
            // Recompute the head from scratch rather than assuming the restored version wins: it may
            // be an OLDER version than the current head, in which case the head must not move.
            const head = await tx.reviewVersion.findFirst({
                where: { assetId: version.assetId, deletedAt: null },
                orderBy: { versionNumber: 'desc' },
                select: { id: true },
            })
            if (head) await tx.reviewAsset.update({ where: { id: version.assetId }, data: { currentVersionId: head.id } })
            const folderPath = version.asset.folder?.path
            if (folderPath) await addBytesToAncestors(tx, pathIds(folderPath), version.sizeBytes)
            restored.push({ type: 'version', id: version.id, restoredToFolderId: version.assetId, movedToRoot: false })
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
    // [foldering 2026-07-27] Record the rename. Besides closing an audit gap (this was the one
    // mutation in the module that left no trace), the row is the marker initiateTaskUpload reads to
    // know this name was chosen by a PERSON — after which the auto "keep the deliverable's name in
    // sync with its task title" behaviour must leave it alone.
    if (name !== existing.name) {
        await recordActivity(prisma, {
            type: REVIEW_ACTIVITY.ASSET_RENAMED,
            workspaceId: existing.workspaceId,
            taskId: existing.taskId,
            folderId: existing.folderId,
            assetId,
            actorUserId: access.userId,
            meta: { old: existing.name, new: name },
        })
    }
    return loadAssetDto(assetId)
}

/**
 * "Reset về tên Task" — put a deliverable's name back to whatever its task title parses to, and
 * hand it back to automatic sync.
 *
 * A manual rename opts the asset out of that sync (see assetNameIsAutoManaged). Without a way back,
 * one accidental rename froze that deliverable's name forever. Recording a NEWER asset.name_reset
 * re-enables sync while leaving the rename in the audit trail — nothing is rewritten, the newest
 * intent simply wins.
 */
export async function resetAssetNameToTask(assetId: string): Promise<AssetDto> {
    const asset = await prisma.reviewAsset.findFirst({
        where: { id: assetId, deletedAt: null },
        select: { id: true, name: true, workspaceId: true, folderId: true, taskId: true },
    })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    if (!asset.taskId) throw apiError(409, 'STATE_INVALID', 'Video này không gắn với task nào nên không có tên task để lấy.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    await assertAssetInScope(
        await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }),
        assetId,
        'write',
    )
    const task = await prisma.task.findUnique({
        where: { id: asset.taskId },
        select: { title: true, client: { select: { name: true } } },
    })
    if (!task) throw apiError(409, 'STATE_INVALID', 'Task gắn với video này không còn tồn tại.')

    const desired = validateAssetName(parseVideoTitle(task.title, task.client?.name ?? '').video)
    // Same partial unique index as everywhere else: a sibling in this folder may already own the
    // name (flat mode shares one client folder across tasks), so take the next free suffix.
    const finalName = await prisma.$transaction((tx) => freeAssetName(tx, asset.folderId, desired))

    await prisma.reviewAsset.update({ where: { id: assetId }, data: { name: finalName, rowVersion: { increment: 1 } } })
    await recordActivity(prisma, {
        type: REVIEW_ACTIVITY.ASSET_NAME_RESET,
        workspaceId: asset.workspaceId,
        taskId: asset.taskId,
        folderId: asset.folderId,
        assetId,
        actorUserId: access.userId,
        meta: { old: asset.name, new: finalName },
    })
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
                // [audit 2026-07-27 · MED] The subtree read above filters `deletedAt: null`, so a
                // TRASHED intermediate folder is skipped while its LIVE children are kept — reachable
                // whenever a task upload lands new content under a trashed ancestor. For such a child
                // the parent was never added to idMap, and the two `!` assertions turned that into
                // `TypeError: Cannot read properties of undefined (reading 'path')`: a raw 500 with no
                // apiError envelope, i.e. Copy silently broken forever on that client folder with no
                // message. Skip the orphan (and its assets, via the idMap delete) rather than crash —
                // copying content whose parent the admin deliberately trashed is not wanted either.
                const mappedParent = f.parentId ? idMap.get(f.parentId) : undefined
                const parentPlanned = mappedParent ? folderMap.get(mappedParent) : undefined
                if (!parentPlanned) {
                    idMap.delete(f.id) // its assets resolve through idMap too — they drop with it
                    reviewLog('warn', 'folders.copy_skipped_orphan_subtree', {
                        folderId: f.id,
                        parentId: f.parentId,
                        sourceFolderId: sourceFolder.id,
                    })
                    continue
                }
                parentNewId = mappedParent!
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
            // Its folder may have been dropped just above as an orphan under a trashed ancestor.
            const folderNewId = idMap.get(a.folderId)
            if (!folderNewId) {
                skippedAssets += 1
                continue
            }
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
    // [audit 2026-07-27 · LOW] `deletedAt: null` above clears each subfolder itself but says nothing
    // about its ANCESTORS, so a live folder under a TRASHED one was included: the zip carried content
    // the Files browser cannot show and the admin believes is deleted — and the same manifest builds
    // the client-facing bundle, so "deleted" material went out to whoever received the archive. The
    // trashed ancestor's id is also missing from nameById, which is how `?? '—'` below invented a
    // real top-level directory literally named "—".
    const liveIds = new Set(subFolders.map((f) => f.id))
    const reachable = subFolders.filter((f) => {
        const ids = pathIds(f.path)
        const baseIdx = ids.indexOf(folder.id)
        // Every id between the requested folder and this one must be a live subfolder.
        return baseIdx < 0 || ids.slice(baseIdx + 1, -1).every((id) => liveIds.has(id))
    })

    // [FR-03] chỉ liệt kê asset trong folder được giao (mutable) — folder tổ tiên xem-được
    // nhưng KHÔNG lộ filename asset của người khác.
    const includableFolderIds = scope.unrestricted
        ? new Set(reachable.map((f) => f.id))
        : new Set(reachable.filter((f) => isPathMutable(scope, f.path)).map((f) => f.id))
    // relative dir for a subfolder = names of the folders BELOW `folder` on its path.
    const nameById = new Map(reachable.map((f) => [f.id, f.name]))
    const relDirOf = (f: { path: string }): string | null => {
        const ids = pathIds(f.path)
        const baseIdx = ids.indexOf(folder.id)
        const belowBase = baseIdx >= 0 ? ids.slice(baseIdx + 1) : ids
        const names: string[] = []
        for (const id of belowBase) {
            const name = nameById.get(id)
            // Fail loudly instead of inventing a placeholder directory: a gap here means the path
            // crosses a folder we deliberately excluded, so the file does not belong in the archive.
            if (name == null) return null
            names.push(name)
        }
        return names.join('/')
    }
    const relDirByFolderId = new Map<string, string>()
    for (const f of reachable) {
        const dir = relDirOf(f)
        if (dir != null) relDirByFolderId.set(f.id, dir)
    }

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
        const dir = relDirByFolderId.get(a.folderId)
        if (dir == null) continue // unresolvable relative path — see relDirOf
        files.push({ versionId: cv.id, fileName: cv.fileName, relPath: dir ? `${dir}/${cv.fileName}` : cv.fileName })
    }
    return { folderName: folder.name, files, truncated }
}
