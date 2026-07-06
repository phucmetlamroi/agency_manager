// [Review module P2.5] Client-side calls for the Team browser's context-menu /
// selection-bar actions: move, copy/duplicate, delete, rename, plus download
// (single version + recursive folder) and clipboard deep-links. Thin fetch wrappers
// over the P2.1/P2.5 /api/review/* routes — each route re-verifies workspace access
// server-side, so nothing here is trusted for authorization. Components own toasts +
// refresh; these throw a human-readable Error on failure.

import type { FolderDto, AssetDto, VersionDto } from './dto'

export type ItemKind = 'folder' | 'asset'
export interface ItemRef {
    type: ItemKind
    id: string
}
export interface MoveRef extends ItemRef {
    rowVersion: number
}

async function errMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body?.error?.message) return body.error.message
    } catch {
        /* non-JSON */
    }
    return `Lỗi ${res.status}. Vui lòng thử lại.`
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as T
}

/* ── mutations ─────────────────────────────────────────────────────────────── */

export async function apiMoveItems(
    items: MoveRef[],
    targetFolderId: string | null,
): Promise<{ moved: { type: ItemKind; id: string; rowVersion: number }[] }> {
    return postJson('/api/review/items/move', {
        items: items.map((i) => ({ type: i.type, id: i.id, expectedRowVersion: i.rowVersion })),
        targetFolderId,
    })
}

export async function apiCopyItems(
    items: ItemRef[],
    targetFolderId: string | null,
    duplicate = false,
): Promise<{ copied: { type: ItemKind; id: string; newId: string }[]; skippedAssets: number }> {
    return postJson('/api/review/items/copy', {
        items: items.map((i) => ({ type: i.type, id: i.id })),
        targetFolderId,
        duplicate,
    })
}

export async function apiDeleteItems(items: ItemRef[]): Promise<{ purgeAt: string }> {
    return postJson('/api/review/items/delete', { items: items.map((i) => ({ type: i.type, id: i.id })) })
}

export interface RestoreResult {
    restored: { type: ItemKind; id: string; restoredToFolderId: string | null; movedToRoot: boolean }[]
}

export async function apiRestoreItems(items: ItemRef[]): Promise<RestoreResult> {
    return postJson('/api/review/trash/restore', { items: items.map((i) => ({ type: i.type, id: i.id })) })
}

/** P6.2 "Delete forever" — ADMIN-only permanent purge (Mux + R2 + rows). */
export async function apiPurgeItems(items: ItemRef[]): Promise<{ versions: number; assets: number; folders: number }> {
    return postJson('/api/review/trash/purge', { items: items.map((i) => ({ type: i.type, id: i.id })) })
}

export async function apiRenameFolder(id: string, name: string, rowVersion: number): Promise<FolderDto> {
    const res = await fetch(`/api/review/folders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expectedRowVersion: rowVersion }),
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return ((await res.json()) as { folder: FolderDto }).folder
}

export async function apiRenameAsset(id: string, name: string, rowVersion: number): Promise<AssetDto> {
    const res = await fetch(`/api/review/assets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expectedRowVersion: rowVersion }),
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return ((await res.json()) as { asset: AssetDto }).asset
}

/* ── P3: version stack + dynamic status ──────────────────────────────────────── */

/** One row of the Manage-Versions modal (serialized VersionDto + head flag). */
export interface VersionRow extends VersionDto {
    isCurrent: boolean
}
export interface AssetVersions {
    asset: {
        id: string
        name: string
        mediaKind: 'video' | 'image'
        currentVersionId: string | null
        folderId: string
    }
    versions: VersionRow[]
}

/** List a stack's live versions, newest → oldest (FR-C02, Manage Versions modal). */
export async function listAssetVersions(assetId: string): Promise<AssetVersions> {
    const res = await fetch(`/api/review/assets/${encodeURIComponent(assetId)}/versions`, {
        credentials: 'same-origin',
        cache: 'no-store',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as AssetVersions
}

/** Delete one version (deleting the last live version trashes the whole stack). */
export async function apiDeleteVersion(
    versionId: string,
): Promise<{ stackDeleted: boolean; assetId: string; currentVersionId: string | null }> {
    const res = await fetch(`/api/review/versions/${encodeURIComponent(versionId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as { stackDeleted: boolean; assetId: string; currentVersionId: string | null }
}

/** Split one version out into its own standalone asset in the same folder (FR-C03). */
export async function apiRemoveFromStack(versionId: string): Promise<{ newAssetId: string; assetId: string }> {
    return postJson(`/api/review/versions/${encodeURIComponent(versionId)}/remove-from-stack`, {})
}

/** Merge a source stack into a target asset as its newest version(s) (FR-C01 path 2). */
export async function apiMergeStacks(
    sourceAssetId: string,
    targetAssetId: string,
): Promise<{ targetAssetId: string; mergedCount: number; currentVersionId: string }> {
    return postJson(`/api/review/assets/${encodeURIComponent(targetAssetId)}/stack`, { sourceAssetId })
}

/** The status dropdown's options — the app's task-status list, read dynamically (FR-D01). */
export async function fetchStatusOptions(): Promise<{ value: string; label: string }[]> {
    const res = await fetch(`/api/review/statuses`, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) throw new Error(await errMessage(res))
    return ((await res.json()) as { options: { value: string; label: string }[] }).options
}

/** Set (or clear, statusId=null) an asset's card status. Optimistic-locked via rowVersion. */
export async function apiSetAssetStatus(
    assetId: string,
    statusId: string | null,
    expectedRowVersion?: number,
): Promise<{ id: string; statusKey: string | null; rowVersion: number }> {
    const res = await fetch(`/api/review/assets/${encodeURIComponent(assetId)}/status`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId, ...(expectedRowVersion !== undefined ? { expectedRowVersion } : {}) }),
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return ((await res.json()) as { asset: { id: string; statusKey: string | null; rowVersion: number } }).asset
}

/** Confirm "Chuyển task sang Hoàn tất" from the drawer banner (FR-D02). */
export async function apiConfirmTaskComplete(taskId: string): Promise<{ ok: true; taskId: string; status: string }> {
    return postJson(`/api/review/tasks/${encodeURIComponent(taskId)}/confirm-complete`, {})
}

/* ── download ──────────────────────────────────────────────────────────────── */

/** Trigger a browser download of one READY version's original file (presigned R2 GET). */
export async function downloadVersion(versionId: string): Promise<void> {
    const res = await fetch(`/api/review/versions/${encodeURIComponent(versionId)}/download-url`, {
        method: 'POST',
        credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    const { url, fileName } = (await res.json()) as { url: string; fileName?: string }
    triggerDownload(url, fileName)
}

/** Anchor-click a URL to download it (the presigned URL carries content-disposition). */
function triggerDownload(url: string, fileName?: string): void {
    const a = document.createElement('a')
    a.href = url
    if (fileName) a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

export interface FolderDownloadResult {
    total: number
    done: number
    truncated: boolean
}

/**
 * Recursively download a folder's originals: fetch the manifest, then download each file
 * sequentially (small gap so the browser doesn't drop rapid-fire downloads). `onProgress`
 * fires after each file. Best-effort per file — one failure doesn't abort the rest.
 */
export async function downloadFolder(
    folderId: string,
    onProgress?: (done: number, total: number) => void,
): Promise<FolderDownloadResult> {
    const res = await fetch(`/api/review/folders/${encodeURIComponent(folderId)}/manifest`, {
        credentials: 'same-origin',
        cache: 'no-store',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    const { files, truncated } = (await res.json()) as {
        files: { versionId: string; fileName: string; relPath: string }[]
        truncated: boolean
    }
    let done = 0
    for (const f of files) {
        try {
            await downloadVersion(f.versionId)
        } catch {
            /* skip this file; keep going */
        }
        done += 1
        onProgress?.(done, files.length)
        if (done < files.length) await sleep(350)
    }
    return { total: files.length, done, truncated }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

/* ── deep-links + clipboard ──────────────────────────────────────────────────── */

export function teamFolderUrl(workspaceId: string, folderId: string | null): string {
    const path = folderId
        ? `/${workspaceId}/admin/team/folder/${encodeURIComponent(folderId)}`
        : `/${workspaceId}/admin/team`
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}${path}`
}

/** Deep-link that opens the asset's folder and pre-selects it (P2; player deep-link = P4). */
export function teamAssetUrl(workspaceId: string, asset: AssetDto): string {
    const base = teamFolderUrl(workspaceId, asset.folderId)
    return `${base}?asset=${encodeURIComponent(asset.id)}`
}

/** Copy text to the clipboard; returns false if the API is unavailable/denied. */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        /* fall through to legacy path */
    }
    try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        ta.remove()
        return ok
    } catch {
        return false
    }
}
