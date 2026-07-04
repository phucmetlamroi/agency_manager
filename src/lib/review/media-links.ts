// [Review module P1.7] Build the signed poster + storyboard links a client needs
// to render a READY video, minting short-lived Mux tokens (see mux-jwt.ts). Kept
// out of dto.ts so the DTO module stays free of node:crypto (server-only here).

import { mintPlaybackTokens } from './mux-jwt'
import type { MediaLinks } from './dto'

const MUX_IMAGE = 'https://image.mux.com'

/**
 * Signed media links for a READY video, or null when there is no Mux playback id
 * yet (still processing) or the version is an image (no Mux asset — served via a
 * presigned R2 URL in a later phase). Mints a fresh short-lived token set per call.
 */
export function buildMediaLinks(v: { muxPlaybackId: string | null; thumbTime: number | null }): MediaLinks | null {
    if (!v.muxPlaybackId) return null
    const { tokens } = mintPlaybackTokens(v.muxPlaybackId)
    const time = v.thumbTime != null ? `time=${encodeURIComponent(v.thumbTime)}&` : ''
    return {
        playbackId: v.muxPlaybackId,
        posterUrl: `${MUX_IMAGE}/${v.muxPlaybackId}/thumbnail.webp?${time}token=${tokens.thumbnail}`,
        storyboardVttUrl: `${MUX_IMAGE}/${v.muxPlaybackId}/storyboard.vtt?token=${tokens.storyboard}`,
    }
}
