// [Review module P2.4] Client helpers for Team-browser uploads: gather files from a
// picker or an OS drop (recursing directories), filter to image/video, and enqueue
// them on the shared upload engine — folder uploads first recreate the dir tree via
// POST /api/review/folders/batch, then place each file into its resolved folder.
// The engine (upload-engine.ts) already handles image single-PUT vs video multipart,
// retry/pause/resume, and the placeholder-card store; this just feeds it.

import { uploadEngine, validateFileMeta } from './upload-engine'
import type { UploadTarget } from './upload-store'

export const UPLOAD_ACCEPT = 'image/*,video/*'

export interface DroppedFile {
    file: File
    /** '/'-joined path relative to the drop root, INCLUDING the filename. */
    relPath: string
}

/** Directory portion of a relPath ('' when the file is at the drop root). */
export function fileDir(relPath: string): string {
    const i = relPath.lastIndexOf('/')
    return i === -1 ? '' : relPath.slice(0, i)
}

async function readEntry(entry: FileSystemEntry, prefix: string, out: DroppedFile[]): Promise<void> {
    if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry
        const file = await new Promise<File>((res, rej) => fileEntry.file(res, rej))
        out.push({ file, relPath: prefix + file.name })
    } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        // readEntries yields ≤100 per call — loop until it returns an empty batch.
        for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
            if (batch.length === 0) break
            for (const child of batch) await readEntry(child, `${prefix}${entry.name}/`, out)
        }
    }
}

/** Flatten a drop's DataTransfer into files (recursing dropped folders when supported). */
export async function collectDropFiles(dt: DataTransfer): Promise<DroppedFile[]> {
    const out: DroppedFile[] = []
    const items = dt.items
    const canTraverse =
        items && items.length > 0 && typeof (items[0] as DataTransferItem).webkitGetAsEntry === 'function'
    if (canTraverse) {
        const entries = Array.from(items)
            .map((it) => it.webkitGetAsEntry?.() ?? null)
            .filter((e): e is FileSystemEntry => e != null)
        for (const e of entries) await readEntry(e, '', out)
    } else {
        for (const f of Array.from(dt.files)) out.push({ file: f, relPath: f.name })
    }
    return out
}

/** Turn a FileList (picker) into DroppedFiles, honoring webkitRelativePath for folder pickers. */
export function fromFileList(list: FileList | File[]): DroppedFile[] {
    return Array.from(list).map((file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
        return { file, relPath: rel && rel.length > 0 ? rel : file.name }
    })
}

export interface FilterResult {
    valid: DroppedFile[]
    skipped: number
}

/** Keep only image/video files (client pre-flight); count the rest for a skip toast. */
export function filterValid(files: DroppedFile[]): FilterResult {
    const valid: DroppedFile[] = []
    let skipped = 0
    for (const df of files) {
        const meta = validateFileMeta(df.file.name, df.file.size, df.file.type || 'application/octet-stream')
        if (meta.ok) valid.push(df)
        else skipped++
    }
    return { valid, skipped }
}

/** Enqueue loose files straight into one folder (null = current/root). */
export function enqueueFiles(files: File[], workspaceId: string, folderId: string | null): void {
    const target: UploadTarget = { kind: 'folder', folderId, workspaceId }
    for (const f of files) uploadEngine.enqueue(f, target)
}

/**
 * Folder upload: recreate the directory tree under `baseFolderId` via the batch route,
 * then enqueue each file into its resolved folder (dir-less files go to the base).
 * Throws if the batch route fails (caller surfaces a toast).
 */
export async function enqueueFolderTree(
    dropped: DroppedFile[],
    workspaceId: string,
    baseFolderId: string | null,
): Promise<void> {
    const dirs = new Set<string>()
    for (const d of dropped) {
        const dir = fileDir(d.relPath)
        if (dir) dirs.add(dir)
    }
    let map: Record<string, string> = {}
    if (dirs.size > 0) {
        const res = await fetch('/api/review/folders/batch', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId, parentId: baseFolderId, paths: [...dirs] }),
        })
        if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
            throw new Error(body?.error?.message ?? 'Không tạo được cây thư mục.')
        }
        map = ((await res.json()) as { map: Record<string, string> }).map
    }
    for (const d of dropped) {
        const dir = fileDir(d.relPath)
        const folderId = dir ? map[dir] ?? baseFolderId : baseFolderId
        uploadEngine.enqueue(d.file, { kind: 'folder', folderId, workspaceId })
    }
}
