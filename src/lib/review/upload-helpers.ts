// [Review module P1] Pure helpers for the upload pipeline — no I/O, unit-testable.
// Part sizing (UPLOAD-PIPELINE §4), R2 key + folder systemKey builders,
// filename sanitize, and a cheap magic-byte content guard (real gate = Mux).

import type { MediaKind } from './media-constants'

const MB = 1024 * 1024
const GB = 1024 * MB

/**
 * Multipart part size (UPLOAD-PIPELINE §4, table line): ≤500MB → 10MB,
 * ≤2GB → 20MB, >2GB → 50MB. The last part may be smaller. When the whole
 * file fits one part, callers upload a single presigned PUT (images).
 */
export function computePartSize(sizeBytes: bigint | number): number {
    const size = typeof sizeBytes === 'bigint' ? sizeBytes : BigInt(Math.trunc(sizeBytes))
    if (size <= BigInt(500 * MB)) return 10 * MB
    if (size <= BigInt(2 * GB)) return 20 * MB
    return 50 * MB
}

/** Number of parts for a size + partSize (≥1). */
export function computePartCount(sizeBytes: bigint | number, partSize: number): number {
    const size = typeof sizeBytes === 'bigint' ? sizeBytes : BigInt(Math.trunc(sizeBytes))
    if (size <= BigInt(0)) return 1
    return Number((size + BigInt(partSize) - BigInt(1)) / BigInt(partSize))
}

/** True when the file uploads as a single PUT (no multipart) — images / tiny files. */
export function isSinglePart(sizeBytes: bigint | number, partSize: number): boolean {
    const size = typeof sizeBytes === 'bigint' ? sizeBytes : BigInt(Math.trunc(sizeBytes))
    return size <= BigInt(partSize)
}

/**
 * Make a filename safe for an R2 key: NFC normalize, keep the extension, replace
 * every non [A-Za-z0-9._-] rune with '_', collapse repeats, and cap the total to
 * ≤180 bytes (keeps well under S3 key limits with the prefix). Never returns ''.
 */
export function sanitizeFileName(name: string): string {
    const norm = (name || '').normalize('NFC').trim()
    const dot = norm.lastIndexOf('.')
    let base = dot > 0 ? norm.slice(0, dot) : norm
    let ext = dot > 0 ? norm.slice(dot + 1) : ''

    const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_{2,}/g, '_').replace(/^[._-]+|[._-]+$/g, '')
    base = clean(base) || 'file'
    ext = clean(ext)

    // Cap total bytes (base + '.' + ext) to 180, trimming the base.
    const enc = new TextEncoder()
    const suffix = ext ? `.${ext}` : ''
    const budget = 180 - enc.encode(suffix).length
    if (enc.encode(base).length > budget) {
        // Trim by characters until it fits (multi-byte safe).
        while (base.length > 1 && enc.encode(base).length > budget) base = base.slice(0, -1)
    }
    return `${base}${suffix}`
}

/**
 * R2 object key for an original file:
 *   review/{workspaceId}/{assetId}/v{n}/{sanitizedFileName}
 * (matches ReviewVersion.r2Key comment in schema.)
 */
export function buildR2Key(
    workspaceId: string,
    assetId: string,
    versionNumber: number,
    fileName: string,
): string {
    return `review/${workspaceId}/${assetId}/v${versionNumber}/${sanitizeFileName(fileName)}`
}

/**
 * Deterministic ASCII slug for a brand/sub-client name → part of the folder
 * systemKey so a renamed brand folder is still matched. Falls back to 'brand'.
 */
export function slugifyBrand(name: string): string {
    const slug = (name || '')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '') // strip combining marks (accents)
        .replace(/[đĐ]/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return slug || 'brand'
}

/**
 * Idempotency key for an auto-created folder level (task-upload folder tree).
 * The chain is: root → client → [brand] → task-video. `systemKey` is unique in
 * the schema, so upserting by it makes ensureTaskFolderPath race-safe and
 * rename-tolerant (matched by key, not by display name).
 */
export function buildSystemKey(level: {
    workspaceId: string
    clientId?: string | null
    brandKey?: string | null
    taskId?: string | null
}): string {
    const parts = [`ws:${level.workspaceId}`]
    if (level.clientId) parts.push(`client:${level.clientId}`)
    if (level.brandKey) parts.push(`brand:${level.brandKey}`)
    if (level.taskId) parts.push(`task:${level.taskId}`)
    return parts.join(':')
}

/**
 * Cheap content sniff on the first bytes of an uploaded object (P1.4 verify step).
 * Returns true when the leading bytes look like the declared kind. Mux is the real
 * gatekeeper for video codecs; this only rejects obvious junk (e.g. a text file
 * renamed .mp4). Lenient by design: unknown-but-plausible binary passes.
 */
export function looksLikeMedia(kind: MediaKind, head: Uint8Array): boolean {
    if (head.length < 12) return false
    const b = head
    const ascii = (off: number, s: string) => s.split('').every((c, i) => b[off + i] === c.charCodeAt(0))

    if (kind === 'VIDEO') {
        // ISO-BMFF (mp4/mov/m4v/3gp/avif-in-video): 'ftyp' at offset 4.
        if (ascii(4, 'ftyp')) return true
        // Matroska/WebM EBML header: 1A 45 DF A3.
        if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true
        // AVI (RIFF....AVI ) and generic RIFF.
        if (ascii(0, 'RIFF')) return true
        // MPEG program/transport/elementary stream start codes.
        if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01) return true // MPEG-PS/ES
        if (b[0] === 0x47) return true // MPEG-TS sync byte
        // ASF/WMV GUID: 30 26 B2 75.
        if (b[0] === 0x30 && b[1] === 0x26 && b[2] === 0xb2 && b[3] === 0x75) return true
        // FLV.
        if (ascii(0, 'FLV')) return true
        return false
    }
    // IMAGE
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true // JPEG
    if (b[0] === 0x89 && ascii(1, 'PNG')) return true // PNG
    if (ascii(0, 'GIF8')) return true // GIF
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return true // WEBP
    if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis') || ascii(8, 'mif1'))) return true // AVIF
    if (ascii(0, 'BM')) return true // BMP
    return false
}

/** Parse a Mux frame-rate string ("30000/1001" or "29.97") → rational fps. */
export function parseFps(raw: string | number | null | undefined): { num: number; den: number } | null {
    if (raw == null) return null
    if (typeof raw === 'number') return ratFromDecimal(raw)
    const s = raw.trim()
    if (s.includes('/')) {
        const [n, d] = s.split('/').map((x) => Number(x))
        if (Number.isFinite(n) && Number.isFinite(d) && d > 0) return { num: n, den: d }
        return null
    }
    const dec = Number(s)
    return Number.isFinite(dec) ? ratFromDecimal(dec) : null
}

/** Common broadcast decimals → exact rationals; else round to /1. */
function ratFromDecimal(fps: number): { num: number; den: number } | null {
    if (!Number.isFinite(fps) || fps <= 0) return null
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01
    if (near(fps, 29.97)) return { num: 30000, den: 1001 }
    if (near(fps, 23.976)) return { num: 24000, den: 1001 }
    if (near(fps, 59.94)) return { num: 60000, den: 1001 }
    if (near(fps, 47.952)) return { num: 48000, den: 1001 }
    return { num: Math.round(fps), den: 1 }
}
