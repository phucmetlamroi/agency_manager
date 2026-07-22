// [Review module P1.7] Build the signed poster + storyboard links a client needs
// to render a READY video, minting short-lived Mux tokens (see mux-jwt.ts). Kept
// out of dto.ts so the DTO module stays free of node:crypto (server-only here).

import { mintPlaybackTokens, signMuxToken } from './mux-jwt'
import type { MediaLinks } from './dto'

const MUX_IMAGE = 'https://image.mux.com'
const POSTER_TTL_SEC = 6 * 60 * 60

/**
 * JUST the signed poster URL — one RSA signature, not the three mintPlaybackTokens mints.
 * Use this where only a thumbnail is needed (folder-card mosaics), NOT the full player: minting the
 * unused playback+storyboard tokens per tile turned the folder listing into an event-loop cliff
 * (6 signs per folder over an unbounded folder count). Null when there is no Mux id (image asset or
 * still-processing video), matching buildMediaLinks.
 */
export function buildPosterUrl(
    v: { muxPlaybackId: string | null; thumbTime: number | null },
    ttlSec: number = POSTER_TTL_SEC,
): string | null {
    if (!v.muxPlaybackId) return null
    const expUnix = Math.floor(Date.now() / 1000) + ttlSec
    const token = signMuxToken(v.muxPlaybackId, 't', expUnix)
    const time = v.thumbTime != null ? `time=${encodeURIComponent(v.thumbTime)}&` : ''
    return `${MUX_IMAGE}/${v.muxPlaybackId}/thumbnail.webp?${time}token=${token}`
}

/**
 * Signed media links for a READY video, or null when there is no Mux playback id
 * yet (still processing) or the version is an image (no Mux asset — served via a
 * presigned R2 URL in a later phase). Mints a fresh short-lived token set per call.
 */
export function buildMediaLinks(
    v: { muxPlaybackId: string | null; thumbTime: number | null },
    ttlSec?: number, // P5: guest links are capped at min(6h, share expiry)
): MediaLinks | null {
    if (!v.muxPlaybackId) return null
    const { tokens } = mintPlaybackTokens(v.muxPlaybackId, ttlSec)
    const time = v.thumbTime != null ? `time=${encodeURIComponent(v.thumbTime)}&` : ''
    return {
        playbackId: v.muxPlaybackId,
        posterUrl: `${MUX_IMAGE}/${v.muxPlaybackId}/thumbnail.webp?${time}token=${tokens.thumbnail}`,
        storyboardVttUrl: `${MUX_IMAGE}/${v.muxPlaybackId}/storyboard.vtt?token=${tokens.storyboard}`,
    }
}
