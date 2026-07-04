// [Review module P1] MIME allowlist + size caps + magic-byte table.
// Source of truth: API-SPEC §2 + UPLOAD-PIPELINE §4.1/§4.2. Images/video ONLY.

/** Video MIME whitelist (UPLOAD-PIPELINE §4.1). mkv sometimes reports empty
 *  MIME — the API falls back to the extension for that case. */
export const VIDEO_MIME_ALLOWLIST = new Set<string>([
    'video/mp4',
    'video/x-m4v',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
    'video/x-msvideo',
    'video/mpeg',
    'video/3gpp',
    'video/x-ms-wmv',
])

/** Image MIME whitelist (UPLOAD-PIPELINE §4.2). HEIC/TIFF/SVG/RAW rejected on
 *  purpose (sharp can't decode HEIC/RAW on Vercel; SVG = XSS risk). */
export const IMAGE_MIME_ALLOWLIST = new Set<string>([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/bmp',
])

/** Extensions we trust to be video when the browser sends an empty/generic MIME. */
export const VIDEO_EXT_FALLBACK = new Set<string>([
    'mkv', 'mp4', 'm4v', 'mov', 'webm', 'avi', 'mpeg', 'mpg', '3gp', 'wmv',
])

// Caps (API-SPEC §2 / error 413). Video 5GB (real-world max ~2GB), image 100MB.
export const VIDEO_MAX_BYTES = BigInt(5 * 1024 * 1024 * 1024)
export const IMAGE_MAX_BYTES = BigInt(100 * 1024 * 1024)
export const ATTACHMENT_MAX_BYTES = BigInt(10 * 1024 * 1024) // comment images (P4)

export type MediaKind = 'VIDEO' | 'IMAGE'

/**
 * Classify an upload from its MIME (+ filename fallback for empty-MIME mkv).
 * Returns null when neither list matches → caller responds 415.
 */
export function mediaKindFromMime(mimeType: string, fileName: string): MediaKind | null {
    const mime = (mimeType || '').toLowerCase().trim()
    if (VIDEO_MIME_ALLOWLIST.has(mime)) return 'VIDEO'
    if (IMAGE_MIME_ALLOWLIST.has(mime)) return 'IMAGE'
    // Empty/generic MIME (application/octet-stream, ''): trust a video extension.
    if (mime === '' || mime === 'application/octet-stream') {
        const ext = fileName.toLowerCase().split('.').pop() || ''
        if (VIDEO_EXT_FALLBACK.has(ext)) return 'VIDEO'
    }
    return null
}

/** Byte cap for a media kind. */
export function capForKind(kind: MediaKind): bigint {
    return kind === 'VIDEO' ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
}
