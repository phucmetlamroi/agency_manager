// [Review module P1.7] Mux SIGNED playback tokens — hand-rolled RS256 JWT via
// node:crypto (no jsonwebtoken dep; a new dep re-runs `prisma db push` every build).
// Mux's signed-URL token format (mirrors @mux/mux-node's JWT.sign):
//   header  = { alg: 'RS256', typ: 'JWT', kid: <MUX_SIGNING_KEY_ID> }
//   payload = { sub: <playbackId>, aud: <audience>, exp: <unix seconds> }   (no iat)
// The client appends ?token=<jwt> to stream.mux.com / image.mux.com URLs.

import { createSign } from 'node:crypto'

/** Mux audiences: 'v' video/HLS, 't' thumbnail image, 's' storyboard, 'g' gif. */
export type MuxAudience = 'v' | 't' | 's' | 'g'

const DEFAULT_TTL_SEC = 6 * 60 * 60 // API-SPEC §2.9: exp = +6h

function base64url(input: Buffer | string): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
    return buf.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** Resolve the signing key pair from env. Mux ships the private key base64-encoded;
 *  we also accept a raw PEM (with real or escaped newlines) defensively. */
function signingKey(): { kid: string; pem: string } {
    const kid = process.env.MUX_SIGNING_KEY_ID
    const raw = process.env.MUX_SIGNING_PRIVATE_KEY
    if (!kid || !raw) throw new Error('[review/mux-jwt] missing MUX_SIGNING_KEY_ID / MUX_SIGNING_PRIVATE_KEY')
    const pem = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8')
    return { kid, pem }
}

/** Sign one Mux playback JWT for `playbackId` + `aud`, expiring at absolute `expUnix`. */
export function signMuxToken(playbackId: string, aud: MuxAudience, expUnix: number): string {
    const { kid, pem } = signingKey()
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }))
    const payload = base64url(JSON.stringify({ sub: playbackId, aud, exp: expUnix }))
    const signingInput = `${header}.${payload}`
    const signature = createSign('RSA-SHA256').update(signingInput).sign(pem)
    return `${signingInput}.${base64url(signature)}`
}

export interface MuxPlaybackTokens {
    playback: string // aud 'v' — stream.mux.com/{id}.m3u8
    thumbnail: string // aud 't' — image.mux.com/{id}/thumbnail.webp
    storyboard: string // aud 's' — image.mux.com/{id}/storyboard.vtt
}

/** Mint the 3 signed tokens a player needs for one playbackId. All share one `exp`. */
export function mintPlaybackTokens(
    playbackId: string,
    ttlSec: number = DEFAULT_TTL_SEC,
): { tokens: MuxPlaybackTokens; expiresAt: string } {
    const expUnix = Math.floor(Date.now() / 1000) + ttlSec
    return {
        tokens: {
            playback: signMuxToken(playbackId, 'v', expUnix),
            thumbnail: signMuxToken(playbackId, 't', expUnix),
            storyboard: signMuxToken(playbackId, 's', expUnix),
        },
        expiresAt: new Date(expUnix * 1000).toISOString(),
    }
}
