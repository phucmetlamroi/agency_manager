// [review-fixes P1 / FR-03] Editor folder-scope.
//
// Một editor (role USER, KHÔNG phải admin/owner workspace) chỉ được THẤY + SỬA
// folder/asset thuộc các folder được GIAO — suy ra từ:
//   1) Task.assigneeId = editor  → ReviewFolder.taskId của task đó (folder video-level),
//   2) ReviewAsset.taskId của task đó → folder chứa nó,
//   3) folder do chính editor tạo (ReviewFolder.createdById).
// ADMIN/OWNER workspace = `unrestricted` (thấy + sửa tất cả — không đổi hành vi cũ).
//
// Dùng materialized path (ReviewFolder.path = "/{rootId}/.../{id}/", luôn kết thúc "/"
// nên prefix-match an toàn — id phân tách bằng "/"):
//   - visible = folder là TỔ TIÊN của (để điều hướng xuống tới), BẰNG, hoặc NẰM DƯỚI
//               một allowed prefix. (Tổ tiên hiện để duyệt; anh chị em bị ẩn.)
//   - mutable = folder BẰNG hoặc NẰM DƯỚI một allowed prefix. (Tổ tiên chỉ xem, KHÔNG sửa.)
//
// UI TeamBrowser GIỮ NGUYÊN — chỉ dữ liệu server trả/nhận bị thu hẹp (mọi route
// /api/review/* tự re-check, defense-in-depth).

import { prisma } from '@/lib/db'
import { apiError } from './errors'

export interface FolderScope {
    /** true = admin/owner workspace → không giới hạn path. */
    unrestricted: boolean
    /** Materialized paths của folder được giao (đã gộp: bỏ path nằm dưới path khác). */
    allowedPrefixes: string[]
}

/** Compute an editor's folder scope in a workspace. Admin/owner → unrestricted. */
export async function getFolderScope(input: {
    userId: string
    workspaceId: string
    isAdmin: boolean
}): Promise<FolderScope> {
    if (input.isAdmin) return { unrestricted: true, allowedPrefixes: [] }

    const tasks = await prisma.task.findMany({
        where: { workspaceId: input.workspaceId, assigneeId: input.userId },
        select: { id: true },
    })
    const taskIds = tasks.map((t) => t.id)

    const [taskFolders, assetFolders, ownFolders] = await Promise.all([
        taskIds.length
            ? prisma.reviewFolder.findMany({
                  where: { workspaceId: input.workspaceId, taskId: { in: taskIds } },
                  select: { path: true },
              })
            : Promise.resolve([] as { path: string }[]),
        taskIds.length
            ? prisma.reviewAsset.findMany({
                  where: { workspaceId: input.workspaceId, taskId: { in: taskIds } },
                  select: { folder: { select: { path: true } } },
              })
            : Promise.resolve([] as { folder: { path: string } | null }[]),
        prisma.reviewFolder.findMany({
            where: { workspaceId: input.workspaceId, createdById: input.userId },
            select: { path: true },
        }),
    ])

    const set = new Set<string>()
    for (const f of taskFolders) set.add(f.path)
    for (const a of assetFolders) if (a.folder?.path) set.add(a.folder.path)
    for (const f of ownFolders) set.add(f.path)

    return { unrestricted: false, allowedPrefixes: dedupePrefixes([...set]) }
}

/** Keep only the highest ancestors — drop any prefix that is itself under another. */
export function dedupePrefixes(paths: string[]): string[] {
    const sorted = [...paths].sort((a, b) => a.length - b.length)
    const kept: string[] = []
    for (const p of sorted) if (!kept.some((k) => p.startsWith(k))) kept.push(p)
    return kept
}

/** Editor may SEE/navigate this folder: ancestor of, equal to, or under an allowed folder. */
export function isPathVisible(scope: FolderScope, path: string): boolean {
    if (scope.unrestricted) return true
    return scope.allowedPrefixes.some((p) => path.startsWith(p) || p.startsWith(path))
}

/** Editor may WRITE here (rename/move/delete/copy-into): equal to or under an allowed folder. */
export function isPathMutable(scope: FolderScope, path: string): boolean {
    if (scope.unrestricted) return true
    return scope.allowedPrefixes.some((p) => path.startsWith(p))
}

function outOfScope() {
    return apiError(403, 'FORBIDDEN', 'Bạn không có quyền trên mục ngoài phạm vi được giao.')
}

/** Throw 403 unless the folder path is mutable for this scope. */
export function assertFolderPathMutable(scope: FolderScope, path: string): void {
    if (!isPathMutable(scope, path)) throw outOfScope()
}

/** Throw 403 unless EVERY folder path is mutable (bulk folder mutations). No-op for admins. */
export function assertFolderPathsMutable(scope: FolderScope, paths: string[]): void {
    if (scope.unrestricted) return
    for (const p of paths) if (!isPathMutable(scope, p)) throw outOfScope()
}

/** Resolve an asset → its folder path and assert read (visible) / write (mutable) scope. */
export async function assertAssetInScope(scope: FolderScope, assetId: string, mode: 'read' | 'write'): Promise<void> {
    if (scope.unrestricted) return
    const asset = await prisma.reviewAsset.findFirst({
        where: { id: assetId },
        select: { folder: { select: { path: true } } },
    })
    const path = asset?.folder?.path ?? null
    const ok = path != null && (mode === 'read' ? isPathVisible(scope, path) : isPathMutable(scope, path))
    if (!ok) throw outOfScope()
}

/** Resolve a version → its asset's folder path and assert read (visible) / write (mutable) scope. */
export async function assertVersionInScope(scope: FolderScope, versionId: string, mode: 'read' | 'write'): Promise<void> {
    if (scope.unrestricted) return
    const v = await prisma.reviewVersion.findFirst({
        where: { id: versionId },
        select: { asset: { select: { folder: { select: { path: true } } } } },
    })
    const path = v?.asset?.folder?.path ?? null
    const ok = path != null && (mode === 'read' ? isPathVisible(scope, path) : isPathMutable(scope, path))
    if (!ok) throw outOfScope()
}
