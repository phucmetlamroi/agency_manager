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
