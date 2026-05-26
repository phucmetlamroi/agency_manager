/**
 * [Quick Create] Scan Dropbox / Google Drive folders for video files.
 *
 * Uses native `fetch` — NO SDK dependency.
 *
 * Each provider scanner:
 *   1. Lists folder contents (with pagination)
 *   2. Filters to video MIME types
 *   3. Extracts duration from provider-specific media metadata
 *   4. Builds preview URLs
 *
 * Returns an array of ScannedVideo objects ready for the Quick Create preview table.
 */

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

export interface ScannedVideo {
  /** Filename without extension (used as default task title) */
  name: string
  /** Filename with extension */
  fullName: string
  /** Video duration in seconds (0 if metadata unavailable) */
  durationSeconds: number
  /** File size in bytes */
  sizeBytes: number
  /** Direct preview/view URL at the provider */
  previewUrl: string
  /** Full path inside the cloud storage folder */
  path: string
  /** Provider-specific file identifier */
  fileId: string
}

/**
 * Video extensions we recognize. Used as a fallback when MIME type
 * is missing or generic (e.g. "application/octet-stream").
 */
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv',
  '.m4v', '.mxf', '.prores', '.ts', '.flv', '.3gp',
])

/**
 * Returns true if the filename looks like a video based on extension.
 */
function hasVideoExtension(filename: string): boolean {
  const ext = filename.lastIndexOf('.') !== -1
    ? filename.slice(filename.lastIndexOf('.')).toLowerCase()
    : ''
  return VIDEO_EXTENSIONS.has(ext)
}

/**
 * Strip the file extension from a filename.
 */
function stripExtension(filename: string): string {
  const dotIdx = filename.lastIndexOf('.')
  return dotIdx > 0 ? filename.slice(0, dotIdx) : filename
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Dropbox Scanner                                                    */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Dropbox file entry shape (subset we care about).
 * @see https://www.dropbox.com/developers/documentation/http/documentation#files-list_folder
 */
interface DropboxFileEntry {
  '.tag': 'file' | 'folder' | 'deleted'
  id: string
  name: string
  path_display: string
  size: number
  media_info?: {
    '.tag': 'pending' | 'metadata'
    metadata?: {
      '.tag': string // 'video' | 'photo'
      duration?: number // milliseconds
    }
  }
}

interface DropboxListFolderResponse {
  entries: DropboxFileEntry[]
  cursor: string
  has_more: boolean
}

/**
 * Scan a Dropbox folder for video files.
 *
 * @param accessToken    - Decrypted OAuth access token.
 * @param folderPath     - Path INSIDE the namespace (own folder) or shared link
 *                         ('' = root). '/sub/path' to scan a sub-folder of shared link.
 * @param sharedFolderId - Optional shared folder ID for building preview URLs.
 * @param sharedLinkUrl  - [Quick Create fix] Full Dropbox shared URL. When set,
 *                         path is INTERPRETED RELATIVE TO this shared link instead
 *                         of user's own Dropbox root. Required for /scl/fo/ and /sh/
 *                         links — without it the API lists user's home Dropbox.
 * @param maxFiles       - Safety cap to prevent runaway scans (default 200).
 */
export async function scanDropboxFolder(
  accessToken: string,
  folderPath: string,
  sharedFolderId?: string,
  sharedLinkUrl?: string,
  maxFiles: number = 200,
): Promise<ScannedVideo[]> {
  const videos: ScannedVideo[] = []

  // Initial list_folder request
  let response = await fetchDropboxListFolder(accessToken, folderPath, sharedLinkUrl)

  // Process entries + handle pagination
  processDropboxEntries(response.entries, videos, sharedFolderId, sharedLinkUrl)

  while (response.has_more && videos.length < maxFiles) {
    response = await fetchDropboxListFolderContinue(accessToken, response.cursor)
    processDropboxEntries(response.entries, videos, sharedFolderId, sharedLinkUrl)
  }

  const trimmed = videos.slice(0, maxFiles)

  // [Quick Create fix] Per-file enrichment: Dropbox often omits media_info
  // when files are accessed via shared_link. Re-query each video by its file ID
  // (which works across namespaces) to try to get duration metadata.
  // Best-effort — if it fails, durationSeconds stays 0 and user can input manually.
  if (sharedLinkUrl) {
    await enrichDropboxDurations(accessToken, trimmed)
  }

  return trimmed
}

/**
 * [Quick Create fix] Attempt to fetch media_info for videos that lack it.
 * Uses files/get_metadata with file ID (works cross-namespace).
 * Runs in parallel with 8-way concurrency cap to keep total latency low.
 */
async function enrichDropboxDurations(
  accessToken: string,
  videos: ScannedVideo[],
): Promise<void> {
  const needEnrich = videos.filter((v) => v.durationSeconds === 0)
  if (needEnrich.length === 0) return

  // Run with concurrency cap to avoid hammering the API
  const concurrency = 8
  let cursor = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < needEnrich.length) {
        const idx = cursor++
        const video = needEnrich[idx]
        try {
          const res = await fetch(
            'https://api.dropboxapi.com/2/files/get_metadata',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                path: video.fileId, // file ID works across namespaces
                include_media_info: true,
              }),
            },
          )
          if (!res.ok) continue // best-effort
          const data = await res.json()
          const durationMs = data?.media_info?.metadata?.duration
          if (typeof durationMs === 'number' && durationMs > 0) {
            video.durationSeconds = Math.round(durationMs / 1000)
          }
        } catch {
          // swallow — duration stays 0, user inputs manually
        }
      }
    }),
  )
}

async function fetchDropboxListFolder(
  accessToken: string,
  path: string,
  sharedLinkUrl?: string,
): Promise<DropboxListFolderResponse> {
  // [Quick Create fix] When sharedLinkUrl is set, pass it as shared_link so the
  // API lists files INSIDE that shared folder. Otherwise path is interpreted as
  // user's own Dropbox namespace (which gave wrong results — always returned
  // user's home root files regardless of what user pasted).
  const body: any = {
    path: path || '',
    recursive: false,
    include_media_info: true,
    include_deleted: false,
    limit: 100,
  }
  if (sharedLinkUrl) {
    body.shared_link = { url: sharedLinkUrl }
  }

  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Dropbox list_folder failed: ${res.status} — ${errText}`)
  }

  return res.json()
}

async function fetchDropboxListFolderContinue(
  accessToken: string,
  cursor: string,
): Promise<DropboxListFolderResponse> {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cursor }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Dropbox list_folder/continue failed: ${res.status} — ${errText}`)
  }

  return res.json()
}

function processDropboxEntries(
  entries: DropboxFileEntry[],
  videos: ScannedVideo[],
  sharedFolderId?: string,
  sharedLinkUrl?: string,
): void {
  for (const entry of entries) {
    if (entry['.tag'] !== 'file') continue

    // Check if it's a video — prefer media_info tag, fallback to extension
    const isVideoByMedia = entry.media_info?.metadata?.['.tag'] === 'video'
    const isVideoByExt = hasVideoExtension(entry.name)
    if (!isVideoByMedia && !isVideoByExt) continue

    // Duration: media_info.metadata.duration is in milliseconds
    const durationMs = entry.media_info?.metadata?.duration ?? 0
    const durationSeconds = Math.round(durationMs / 1000)

    // Build preview URL
    const encodedName = encodeURIComponent(entry.name)
    let previewUrl: string
    if (sharedLinkUrl) {
      // [Quick Create fix] Use original shared link with ?preview= query — most reliable
      // way to deep-link into the shared folder view.
      const separator = sharedLinkUrl.includes('?') ? '&' : '?'
      previewUrl = `${sharedLinkUrl}${separator}preview=${encodedName}`
    } else if (sharedFolderId) {
      previewUrl = `https://www.dropbox.com/scl/fo/${sharedFolderId}?preview=${encodedName}`
    } else {
      // For /home/ paths, link to the file directly
      previewUrl = `https://www.dropbox.com/home${entry.path_display}`
    }

    videos.push({
      name: stripExtension(entry.name),
      fullName: entry.name,
      durationSeconds,
      sizeBytes: entry.size,
      previewUrl,
      path: entry.path_display,
      fileId: entry.id,
    })
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Google Drive Scanner                                               */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Google Drive file resource shape (subset we care about).
 * @see https://developers.google.com/drive/api/v3/reference/files
 */
interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size?: string // string in API response
  videoMediaMetadata?: {
    width?: number
    height?: number
    durationMillis?: string // string in API response
  }
}

interface GoogleDriveListResponse {
  files: GoogleDriveFile[]
  nextPageToken?: string
}

/**
 * Scan a Google Drive folder for video files.
 *
 * @param accessToken - Decrypted OAuth access token.
 * @param folderId    - Google Drive folder ID.
 * @param maxFiles    - Safety cap (default 200).
 */
export async function scanGoogleDriveFolder(
  accessToken: string,
  folderId: string,
  maxFiles: number = 200,
): Promise<ScannedVideo[]> {
  const videos: ScannedVideo[] = []
  let pageToken: string | undefined

  do {
    const response = await fetchGoogleDriveFiles(accessToken, folderId, pageToken)

    for (const file of response.files) {
      // Filter: only video MIME types or video extensions
      const isVideoByMime = file.mimeType.startsWith('video/')
      const isVideoByExt = hasVideoExtension(file.name)
      if (!isVideoByMime && !isVideoByExt) continue

      // Duration: videoMediaMetadata.durationMillis is a string of milliseconds
      const durationMs = file.videoMediaMetadata?.durationMillis
        ? parseInt(file.videoMediaMetadata.durationMillis, 10)
        : 0
      const durationSeconds = Math.round(durationMs / 1000)

      // Size: API returns as string
      const sizeBytes = file.size ? parseInt(file.size, 10) : 0

      videos.push({
        name: stripExtension(file.name),
        fullName: file.name,
        durationSeconds,
        sizeBytes,
        previewUrl: `https://drive.google.com/file/d/${file.id}/view`,
        path: `/${file.name}`, // Google Drive doesn't expose full path in list
        fileId: file.id,
      })

      if (videos.length >= maxFiles) break
    }

    pageToken = response.nextPageToken
  } while (pageToken && videos.length < maxFiles)

  return videos.slice(0, maxFiles)
}

async function fetchGoogleDriveFiles(
  accessToken: string,
  folderId: string,
  pageToken?: string,
): Promise<GoogleDriveListResponse> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,videoMediaMetadata)',
    pageSize: '100',
    orderBy: 'name',
  })

  if (pageToken) {
    params.set('pageToken', pageToken)
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    },
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Google Drive files.list failed: ${res.status} — ${errText}`)
  }

  return res.json()
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Velox Deep Scan v3.1 — Recursive scanner                                */
/*                                                                          */
/*  Returns a RawScanTree (defined in scan-classifier.ts) that the          */
/*  classifier can run Phase 0-2 over. Caps:                                */
/*    - Max depth: 4 levels                                                 */
/*    - Max files: 500 across the whole scan                                */
/*    - Sequential per-folder traversal (rate-limit friendly)               */
/* ════════════════════════════════════════════════════════════════════════ */

import type {
  RawScanTree,
  RawScanSubfolder,
} from './scan-classifier'
import type { FileEntry } from './velox-helpers'
import {
  isVideoFile as isVideoFn,
  isAudioFile as isAudioFn,
  isImageFile as isImageFn,
  isDocumentFile as isDocFn,
} from './scan-classifier-helpers'

const MAX_DEPTH = 4
const MAX_FILES_PER_SCAN = 500

interface RecursiveContext {
  /** Total files seen so far (across whole scan tree) — soft cap */
  fileCount: number
  /** Files skipped because cap reached (for diagnostics) */
  ignoredDeepFiles: string[]
}

/** Build a FileEntry from raw provider entry data */
function buildFileEntry(args: {
  fileId: string
  name: string
  mimeType: string
  durationSeconds: number
  sizeBytes: number
  previewUrl: string
  depth: number
  parentFolderName: string
  parentFolderPath: string
}): FileEntry {
  const { name } = args
  const stripped = stripExtension(name)
  return {
    fileId: args.fileId,
    name: stripped,
    fullName: name,
    mimeType: args.mimeType,
    durationSeconds: args.durationSeconds,
    sizeBytes: args.sizeBytes,
    previewUrl: args.previewUrl,
    isVideo: isVideoFn(name, args.mimeType),
    isAudio: isAudioFn(name, args.mimeType),
    isImage: isImageFn(name, args.mimeType),
    isDocument: isDocFn(name, args.mimeType),
    depth: args.depth,
    parentFolderName: args.parentFolderName,
    parentFolderPath: args.parentFolderPath,
  }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Dropbox recursive scanner                                               */
/* ════════════════════════════════════════════════════════════════════════ */

/** All entries (file + folder) at a single Dropbox folder level */
interface DropboxRawEntries {
  files: FileEntry[]
  subfolders: Array<{ name: string; pathLower: string; pathDisplay: string }>
}

async function listDropboxLevel(
  accessToken: string,
  folderPath: string,
  sharedLinkUrl: string | undefined,
  sharedFolderId: string | undefined,
  depth: number,
  parentFolderName: string,
  ctx: RecursiveContext,
): Promise<DropboxRawEntries> {
  const files: FileEntry[] = []
  const subfolders: DropboxRawEntries['subfolders'] = []

  let response = await fetchDropboxListFolder(accessToken, folderPath, sharedLinkUrl)
  let safetyBreak = false
  while (true) {
    for (const entry of response.entries) {
      if (ctx.fileCount >= MAX_FILES_PER_SCAN) {
        ctx.ignoredDeepFiles.push((entry as any).name ?? '(unknown)')
        safetyBreak = true
        break
      }
      if (entry['.tag'] === 'folder') {
        // @ts-expect-error — folder entries in Dropbox API have path_lower
        const pathLower = entry.path_lower ?? entry.path_display
        subfolders.push({
          name: entry.name,
          pathLower,
          pathDisplay: entry.path_display,
        })
      } else if (entry['.tag'] === 'file') {
        const durationMs = entry.media_info?.metadata?.duration ?? 0
        const durationSeconds = Math.round(durationMs / 1000)

        // Build preview URL — same logic as processDropboxEntries
        const encodedName = encodeURIComponent(entry.name)
        let previewUrl: string
        if (sharedLinkUrl) {
          const separator = sharedLinkUrl.includes('?') ? '&' : '?'
          previewUrl = `${sharedLinkUrl}${separator}preview=${encodedName}`
        } else if (sharedFolderId) {
          previewUrl = `https://www.dropbox.com/scl/fo/${sharedFolderId}?preview=${encodedName}`
        } else {
          previewUrl = `https://www.dropbox.com/home${entry.path_display}`
        }

        files.push(
          buildFileEntry({
            fileId: entry.id,
            name: entry.name,
            mimeType: entry.media_info?.metadata?.['.tag']
              ? `video/${entry.media_info.metadata['.tag']}`
              : '', // empty — extension fallback handles it
            durationSeconds,
            sizeBytes: entry.size,
            previewUrl,
            depth,
            parentFolderName,
            parentFolderPath: folderPath,
          }),
        )
        ctx.fileCount++
      }
    }

    if (safetyBreak || !response.has_more) break
    response = await fetchDropboxListFolderContinue(accessToken, response.cursor)
  }

  return { files, subfolders }
}

async function recursiveScanDropbox(
  accessToken: string,
  folderPath: string,
  sharedLinkUrl: string | undefined,
  sharedFolderId: string | undefined,
  ctx: RecursiveContext,
  depth: number,
  parentFolderName: string,
): Promise<{ files: FileEntry[]; subfolders: RawScanSubfolder[] }> {
  if (depth >= MAX_DEPTH) {
    return { files: [], subfolders: [] }
  }

  const level = await listDropboxLevel(
    accessToken,
    folderPath,
    sharedLinkUrl,
    sharedFolderId,
    depth,
    parentFolderName,
    ctx,
  )

  // Sequential recurse into subfolders (rate-limit friendly)
  const subProfiles: RawScanSubfolder[] = []
  for (const sub of level.subfolders) {
    if (ctx.fileCount >= MAX_FILES_PER_SCAN) break
    // Build sub-path relative to shared link root, or absolute path
    const subPath = sub.pathDisplay
    const inner = await recursiveScanDropbox(
      accessToken,
      subPath,
      sharedLinkUrl,
      sharedFolderId,
      ctx,
      depth + 1,
      sub.name,
    )

    // Build subfolder URL — for shared links append &path=, for absolute paths use /home/
    let subUrl: string
    if (sharedLinkUrl) {
      const separator = sharedLinkUrl.includes('?') ? '&' : '?'
      // Strip the parent shared path prefix — keep only the sub-path
      subUrl = `${sharedLinkUrl}${separator}preview=${encodeURIComponent(sub.name)}`
    } else if (sharedFolderId) {
      subUrl = `https://www.dropbox.com/scl/fo/${sharedFolderId}?path=${encodeURIComponent(subPath)}`
    } else {
      subUrl = `https://www.dropbox.com/home${subPath}`
    }

    subProfiles.push({
      name: sub.name,
      fullPath: subPath,
      url: subUrl,
      depth: depth + 1,
      files: inner.files,
      subSubfolders: inner.subfolders,
    })
  }

  return { files: level.files, subfolders: subProfiles }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Google Drive recursive scanner                                          */
/* ════════════════════════════════════════════════════════════════════════ */

interface GoogleDriveAllListResponse {
  files: Array<{
    id: string
    name: string
    mimeType: string
    size?: string
    videoMediaMetadata?: { durationMillis?: string }
  }>
  nextPageToken?: string
}

/** GDrive list — returns BOTH files and folders for a given parent ID */
async function fetchGoogleDriveLevel(
  accessToken: string,
  folderId: string,
  pageToken?: string,
): Promise<GoogleDriveAllListResponse> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,videoMediaMetadata)',
    pageSize: '100',
    orderBy: 'name',
  })
  if (pageToken) params.set('pageToken', pageToken)

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown')
    throw new Error(`Google Drive files.list failed: ${res.status} — ${errText}`)
  }
  return res.json()
}

async function recursiveScanGoogleDrive(
  accessToken: string,
  folderId: string,
  folderName: string,
  folderPath: string,
  ctx: RecursiveContext,
  depth: number,
): Promise<{ files: FileEntry[]; subfolders: RawScanSubfolder[] }> {
  if (depth >= MAX_DEPTH) {
    return { files: [], subfolders: [] }
  }

  const files: FileEntry[] = []
  const subfolderRefs: Array<{ id: string; name: string }> = []
  let pageToken: string | undefined

  do {
    const response = await fetchGoogleDriveLevel(accessToken, folderId, pageToken)
    for (const file of response.files) {
      if (ctx.fileCount >= MAX_FILES_PER_SCAN) {
        ctx.ignoredDeepFiles.push(file.name)
        break
      }
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
      if (isFolder) {
        subfolderRefs.push({ id: file.id, name: file.name })
      } else {
        const durationMs = file.videoMediaMetadata?.durationMillis
          ? parseInt(file.videoMediaMetadata.durationMillis, 10)
          : 0
        files.push(
          buildFileEntry({
            fileId: file.id,
            name: file.name,
            mimeType: file.mimeType,
            durationSeconds: Math.round(durationMs / 1000),
            sizeBytes: file.size ? parseInt(file.size, 10) : 0,
            previewUrl: `https://drive.google.com/file/d/${file.id}/view`,
            depth,
            parentFolderName: folderName,
            parentFolderPath: folderPath,
          }),
        )
        ctx.fileCount++
      }
    }
    pageToken = response.nextPageToken
  } while (pageToken && ctx.fileCount < MAX_FILES_PER_SCAN)

  // Sequential recurse subfolders
  const subProfiles: RawScanSubfolder[] = []
  for (const sub of subfolderRefs) {
    if (ctx.fileCount >= MAX_FILES_PER_SCAN) break
    const subPath = `${folderPath}/${sub.name}`
    const inner = await recursiveScanGoogleDrive(
      accessToken,
      sub.id,
      sub.name,
      subPath,
      ctx,
      depth + 1,
    )
    subProfiles.push({
      name: sub.name,
      fullPath: subPath,
      url: `https://drive.google.com/drive/folders/${sub.id}`,
      depth: depth + 1,
      files: inner.files,
      subSubfolders: inner.subfolders,
    })
  }

  return { files, subfolders: subProfiles }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Unified entry: recursiveScanFolder                                      */
/* ════════════════════════════════════════════════════════════════════════ */

export interface RecursiveScanInput {
  provider: 'dropbox' | 'google_drive'
  accessToken: string
  /** Dropbox: folder path. GDrive: folder ID. */
  folderIdentifier: string
  /** Dropbox only — the original shared link URL (for shared folders) */
  sharedLinkUrl?: string
  /** Dropbox only — the shared folder ID for preview URL construction */
  sharedFolderId?: string
  /** Display name of the root folder (last path segment) */
  rootName?: string
}

/**
 * Recursive scan entry point for Velox Deep Scan v3.1. Walks the cloud folder
 * tree up to depth 4, caps at 500 files. Returns a RawScanTree ready for
 * `classifyScan` in scan-classifier.ts.
 *
 * Sequential traversal (no parallel folder walking) → respects provider rate
 * limits. The 500-file cap protects against runaway scans on huge folders.
 */
export async function recursiveScanFolder(
  input: RecursiveScanInput,
): Promise<RawScanTree> {
  const ctx: RecursiveContext = {
    fileCount: 0,
    ignoredDeepFiles: [],
  }

  const rootName = input.rootName ?? 'root'

  if (input.provider === 'dropbox') {
    const result = await recursiveScanDropbox(
      input.accessToken,
      input.folderIdentifier,
      input.sharedLinkUrl,
      input.sharedFolderId,
      ctx,
      0,
      rootName,
    )
    return {
      originalUrl: input.sharedLinkUrl ?? '',
      rootPath: input.folderIdentifier || '/',
      rootUrl: input.sharedLinkUrl ?? '',
      rootFiles: result.files,
      rootSubfolders: result.subfolders,
      ignoredDeepFiles: ctx.ignoredDeepFiles,
    }
  }

  // google_drive
  const result = await recursiveScanGoogleDrive(
    input.accessToken,
    input.folderIdentifier,
    rootName,
    `/${rootName}`,
    ctx,
    0,
  )
  return {
    originalUrl: `https://drive.google.com/drive/folders/${input.folderIdentifier}`,
    rootPath: `/${rootName}`,
    rootUrl: `https://drive.google.com/drive/folders/${input.folderIdentifier}`,
    rootFiles: result.files,
    rootSubfolders: result.subfolders,
    ignoredDeepFiles: ctx.ignoredDeepFiles,
  }
}
