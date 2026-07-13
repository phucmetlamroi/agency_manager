// [B1] Server-side IMAGE preview derivative. The guest image "view" path (`/api/r/:slug/versions/
// :versionId/view-url`) must NOT hand back the original full-resolution master — otherwise the
// share's `allowDownload` / `downloadOnlyWhenApproved` gates (enforced by download-url) are silently
// bypassed for every image deliverable (an unapproved / download-disabled image could be exfiltrated
// at full res via the view URL). Instead we serve a DOWNSCALED + lightly-watermarked derivative,
// generated on first view and cached in R2 under a deterministic key (no schema column). The original
// master stays reachable only through the gated download-url route.

import sharp from 'sharp'
import { getObjectBytes, putObjectBytes, headObject } from './r2'

const PREVIEW_MAX_DIM = 1600 // longest edge of the preview (never upscales)
const PREVIEW_QUALITY = 78

/** Deterministic R2 key for a version's preview derivative. */
export function imagePreviewKey(versionId: string): string {
    return `previews/${versionId}.webp`
}

/** A faint diagonal "PREVIEW" watermark sized to the rendered image. */
function watermarkSvg(w: number, h: number): string {
    const fontSize = Math.max(16, Math.round(Math.min(w, h) / 12))
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="50%" font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="#ffffff" fill-opacity="0.30" text-anchor="middle" dominant-baseline="middle" transform="rotate(-30 ${w / 2} ${h / 2})">PREVIEW</text></svg>`
}

/**
 * Return the R2 key of a downscaled + watermarked preview for an IMAGE version, generating and caching
 * it on first request. Idempotent: a concurrent double-generate just overwrites the same bytes. Serve
 * the returned key via a presigned GET from the view path — never the original `r2Key`.
 */
export async function getOrCreateImagePreview(version: { id: string; r2Key: string }): Promise<string> {
    const key = imagePreviewKey(version.id)
    if (await headObject(key)) return key

    const original = await getObjectBytes(version.r2Key)
    // `failOn:'none'` tolerates minor corruption; `.rotate()` bakes in EXIF orientation.
    const resized = await sharp(Buffer.from(original), { failOn: 'none' })
        .rotate()
        .resize({ width: PREVIEW_MAX_DIM, height: PREVIEW_MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .toBuffer({ resolveWithObject: true })

    let out: Buffer
    try {
        const wm = Buffer.from(watermarkSvg(resized.info.width, resized.info.height))
        out = await sharp(resized.data).composite([{ input: wm, gravity: 'center' }]).webp({ quality: PREVIEW_QUALITY }).toBuffer()
    } catch {
        // The DOWNSCALE is the real anti-exfil protection; the SVG-text watermark needs fonts and is
        // best-effort. If compositing fails (missing fonts / SVG loader), fall back to the plain
        // downscaled preview rather than failing the view.
        out = await sharp(resized.data).webp({ quality: PREVIEW_QUALITY }).toBuffer()
    }

    await putObjectBytes(key, out, 'image/webp')
    return key
}
