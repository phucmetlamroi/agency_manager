// [Review module] Server-side plan for a bulk .zip download of Team "Tệp" items.
// Resolves a mix of folders (recursively) + assets (their current READY version) to a flat list of
// { r2Key, zipPath } entries, all under ONE workspace, with full FR-03 scope enforcement (reuses
// getFolderManifest for folders — which already runs requireReviewAccess + folder scope). The route
// streams these straight from R2 into a zip; nothing is buffered. Videos are STORED (not recompressed),
// so bundling into a .zip is lossless — it never reduces quality, only saves the client many clicks.

import { prisma } from '@/lib/db'
import { apiError } from './errors'
import { requireReviewAccess } from './access'
import { getFolderScope, assertAssetInScope } from './folder-scope'
import { getFolderManifest } from './folders'
import { limitDb } from './rate-limit-db'

/** Hard cap on files per zip (mirrors the manifest cap; a bulk download of thousands is a mistake). */
const MAX_ZIP_FILES = 1000
/**
 * [AUDIT SWEEP-2026-07-30] Trần tổng byte cho một lần tải zip.
 * 20 GB: đủ cho một thư mục giao hàng thật (vài chục bản dựng), nhưng chặn được kịch bản "chọn thư
 * mục gốc lớn nhất rồi bấm tải" đã làm OOM function 3009 MB trên production. Chặn TRƯỚC khi stream,
 * kèm câu báo nói rõ phải chọn ít hơn — thay vì để function bị giết và người dùng thấy treo mãi.
 */
const MAX_ZIP_BYTES = 20 * 1024 * 1024 * 1024
const zipTooLarge = () =>
    apiError(
        413,
        // Dùng mã đã có trong ApiErrorCode — không thêm mã mới cho một chốt nội bộ.
        'FILE_TOO_LARGE',
        'Lượng chọn quá lớn để nén trong một lần tải. Hãy chọn ít thư mục/tệp hơn rồi tải lại.',
    )

export interface ZipEntry {
    r2Key: string
    zipPath: string
}
export interface ZipPlan {
    archiveName: string
    entries: ZipEntry[]
}

/** Strip characters unsafe for a zip entry path segment / a download filename. */
function sanitizeSegment(name: string): string {
    // [AUDIT HT-042] Collapse separators AND neutralize a bare `.`/`..` segment so no single
    // segment can traverse out of the zip target dir when the client extracts.
    const s = (name || '').replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_').trim()
    if (!s || s === '.' || s === '..') return '_'
    return s
}

/** Ensure zip entry paths are unique — a duplicate gets " (2)" etc. before its extension. */
function dedupe(entries: ZipEntry[]): void {
    const seen = new Map<string, number>()
    for (const e of entries) {
        const lower = e.zipPath.toLowerCase()
        const n = seen.get(lower) ?? 0
        seen.set(lower, n + 1)
        if (n > 0) {
            const dot = e.zipPath.lastIndexOf('.')
            const slash = e.zipPath.lastIndexOf('/')
            e.zipPath = dot > slash ? `${e.zipPath.slice(0, dot)} (${n + 1})${e.zipPath.slice(dot)}` : `${e.zipPath} (${n + 1})`
        }
    }
}

/**
 * Build the download plan for a set of folders + assets. Throws the standard review envelope on
 * bad input / cross-workspace / no-access / nothing-ready. Assets resolve to their current READY
 * version; folders expand to every READY head version in their subtree (relative paths preserved).
 */
export async function collectZipFiles(input: { folderIds: string[]; assetIds: string[] }): Promise<ZipPlan> {
    const folderIds = [...new Set(input.folderIds)].filter(Boolean)
    const assetIds = [...new Set(input.assetIds)].filter(Boolean)
    if (!folderIds.length && !assetIds.length) throw apiError(400, 'VALIDATION_ERROR', 'Không có mục nào để tải.')

    const [folders, assets] = await Promise.all([
        folderIds.length
            ? prisma.reviewFolder.findMany({ where: { id: { in: folderIds }, deletedAt: null }, select: { id: true, name: true, workspaceId: true } })
            : Promise.resolve([]),
        assetIds.length
            ? prisma.reviewAsset.findMany({
                  where: { id: { in: assetIds }, deletedAt: null },
                  // [AUDIT SWEEP fix] `sizeBytes` BẮT BUỘC có ở đây. Không có nó thì nhánh asset cộng
                  // 0 byte vào `totalBytes` và trần byte chỉ chặn được nhánh folder — tức hở đúng một
                  // nửa, im lặng. (Tôi đã viết `?? 0` trước khi kiểm select này; đó là cách một bản vá
                  // trông như có tác dụng mà không có.)
                  select: { id: true, workspaceId: true, currentVersion: { select: { r2Key: true, fileName: true, pipelineStatus: true, sizeBytes: true } } },
              })
            : Promise.resolve([]),
    ])
    if (folders.length !== folderIds.length || assets.length !== assetIds.length) {
        throw apiError(404, 'NOT_FOUND', 'Một hoặc nhiều mục không tồn tại.')
    }

    // One workspace only — mirror the move/delete cross-workspace guard.
    const wsSet = new Set([...folders.map((f) => f.workspaceId), ...assets.map((a) => a.workspaceId)])
    if (wsSet.size !== 1) throw apiError(400, 'CROSS_WORKSPACE', 'Các mục không cùng workspace.')
    const workspaceId = [...wsSet][0]
    const access = await requireReviewAccess({ workspaceId })
    // [AUDIT SWEEP-2026-07-30 fix · NEW-internal-zip-no-cap] Route /api/review/download-zip trước
    // đây không có rate-limit, không trần byte. Bất kỳ MEMBER nào (mọi editor/freelancer, hoặc một
    // tài khoản bị chiếm) stream được vô hạn GB qua function 3009 MB — đúng đường đã OOM trên
    // production, và khi function bị giết vì OOM thì KHÔNG có phản hồi HTTP nên người dùng thật thấy
    // treo vĩnh viễn. Chú thích đầu route.ts ghi lại chính sự cố đó.
    //
    // Đặt chốt Ở ĐÂY, không ở route: nó chặn TRƯỚC cả vòng getFolderManifest tốn kém bên dưới. (Bản
    // vá được đề xuất đặt ở route và đọc `access`/`workspaceId` từ giá trị trả về của hàm này —
    // KHÔNG BIÊN DỊCH ĐƯỢC, vì hàm chỉ trả `{ archiveName, entries }`.)
    // Khoá theo NGƯỜI GỬI, không theo folderId: khoá theo folder là xô chung số phận.
    const zipRl = await limitDb(`zip:${access.userId}:${workspaceId}`, 12, 600, { failClosed: true })
    if (!zipRl.success) {
        throw apiError(429, 'RATE_LIMITED', 'Bạn tải quá nhiều lần. Vui lòng chờ vài phút.')
    }
    const scope = await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin })

    const multiRoot = folders.length + assets.length > 1
    const entries: ZipEntry[] = []
    // [AUDIT SWEEP-2026-07-30 fix] Trần BYTE, song song với trần SỐ TỆP đã có. `MAX_ZIP_FILES` một
    // mình không chặn được OOM: 1000 master 4K là hàng trăm GB đi qua một function 3009 MB.
    let totalBytes = 0

    // Assets → their current READY version, at the zip root (folder-name-prefixed only if multi-root).
    for (const a of assets) {
        await assertAssetInScope(scope, a.id, 'read') // FR-03: 403 if out of the editor's assigned area
        const cv = a.currentVersion
        if (!cv || cv.pipelineStatus !== 'READY' || !cv.r2Key) continue
        totalBytes += Number(cv.sizeBytes ?? 0)
        if (totalBytes > MAX_ZIP_BYTES) throw zipTooLarge()
        entries.push({ r2Key: cv.r2Key, zipPath: sanitizeSegment(cv.fileName) })
    }

    // Folders → reuse getFolderManifest (auth + scope + subtree walk, capped), then batch-resolve r2Keys.
    for (const f of folders) {
        const manifest = await getFolderManifest(f.id) // throws 403 if the folder is out of scope
        const versionIds = manifest.files.map((x) => x.versionId)
        if (!versionIds.length) continue
        const vs = await prisma.reviewVersion.findMany({
            where: { id: { in: versionIds }, pipelineStatus: 'READY' },
            // [AUDIT SWEEP fix] `sizeBytes` thêm vào để cộng dồn cho trần byte bên dưới.
            select: { id: true, r2Key: true, sizeBytes: true },
        })
        const keyById = new Map(vs.map((v) => [v.id, v.r2Key]))
        const sizeById = new Map(vs.map((v) => [v.id, Number(v.sizeBytes ?? 0)]))
        // [AUDIT HT-042 fix] Sanitize EACH path segment of the folder tree + filename — not just the
        // root prefix. A folder named `..` or a version fileName with `../` would otherwise land as
        // `Folder/../../etc/...` in the zip; archiver's sanitizePath only strips a LEADING `../`, not
        // one in the middle → zip-slip when the client extracts with a non-hardened tool.
        for (const x of manifest.files) {
            const r2Key = keyById.get(x.versionId)
            if (!r2Key) continue
            const zipPath = [
                ...(multiRoot ? [sanitizeSegment(f.name)] : []),
                ...x.relPath.split('/').map(sanitizeSegment),
            ].filter(Boolean).join('/')
            totalBytes += sizeById.get(x.versionId) ?? 0
            if (totalBytes > MAX_ZIP_BYTES) throw zipTooLarge()
            entries.push({ r2Key, zipPath })
            if (entries.length >= MAX_ZIP_FILES) break
        }
        if (entries.length >= MAX_ZIP_FILES) break
    }

    if (!entries.length) throw apiError(409, 'STATE_INVALID', 'Không có tệp nào sẵn sàng để tải.')
    dedupe(entries)

    const archiveName =
        folders.length === 1 && assets.length === 0
            ? `${sanitizeSegment(folders[0].name) || 'thu-muc'}.zip`
            : 'tep-video.zip'
    return { archiveName, entries }
}
