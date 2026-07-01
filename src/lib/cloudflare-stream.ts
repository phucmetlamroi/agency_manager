// [Video Review] Cloudflare Stream server helper.
//
// SERVER-ONLY. Never import this from a client component — it reads the Stream
// API token + signing key from the environment. The browser only ever receives
// a short-lived SIGNED playback token minted here, never the raw UID or key.
//
// Responsibilities:
//  - createDirectUpload(): mint a one-time upload URL so the editor's browser
//    uploads straight to Stream (bytes never touch our server / Vercel's 4.5MB
//    body limit). Video is created with requireSignedURLs so it is unplayable
//    without a token.
//  - mintSignedPlaybackToken(): sign a JWT LOCALLY with the Stream signing key
//    (no per-request /token API call) so playback is gated per viewer, dies in
//    minutes, and optionally allows download.
//  - verifyStreamWebhookSignature(): HMAC-verify the "video ready" webhook.
//  - getStreamVideo(): read details (duration, dimensions) after processing.
//
// Docs: https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/
//       https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
//       https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/

import { createHmac, timingSafeEqual } from 'node:crypto'
import { importPKCS8, SignJWT } from 'jose'

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN
const SIGNING_KEY_ID = process.env.CLOUDFLARE_STREAM_KEY_ID
// Base64 of the PKCS8 PEM Cloudflare returns in the signing key's `pem` field.
const SIGNING_KEY_PEM_B64 = process.env.CLOUDFLARE_STREAM_KEY_PEM
const WEBHOOK_SECRET = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET
// e.g. "customer-abc123def456.cloudflarestream.com" (Stream dashboard → any video → embed).
const CUSTOMER_SUBDOMAIN = process.env.CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN

const API_BASE = ACCOUNT_ID
    ? `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`
    : ''

export class StreamNotConfiguredError extends Error {
    constructor() {
        super('Cloudflare Stream is not configured (missing CLOUDFLARE_* env vars).')
        this.name = 'StreamNotConfiguredError'
    }
}

/** True when the upload/details API can be called (account + token present). */
export function isStreamConfigured(): boolean {
    return Boolean(ACCOUNT_ID && API_TOKEN)
}

/** True when signed playback tokens can be minted (signing key present). */
export function canSignPlayback(): boolean {
    return Boolean(SIGNING_KEY_ID && SIGNING_KEY_PEM_B64)
}

export function getCustomerSubdomain(): string | null {
    return CUSTOMER_SUBDOMAIN ?? null
}

// ---------------------------------------------------------------------------
// Direct creator upload
// ---------------------------------------------------------------------------

export interface DirectUploadOptions {
    /** Reserves duration/storage; unused reservation is released after processing. */
    maxDurationSeconds: number
    /** Restrict which domains may embed/request the manifest. Defence-in-depth. */
    allowedOrigins?: string[]
    /** Apply a pre-created static watermark profile at encode time. */
    watermarkProfileId?: string
    /** Free-form metadata stored on the Stream video (e.g. our taskId/versionId). */
    meta?: Record<string, string>
}

export interface DirectUploadResult {
    /** One-time URL the client POSTs the file to. */
    uploadURL: string
    /** The Stream media id — store this on the VideoVersion row. */
    uid: string
}

/**
 * Mint a one-time direct-creator-upload URL. The video is created with
 * requireSignedURLs=true so it is private until we mint a signed token.
 */
export async function createDirectUpload(opts: DirectUploadOptions): Promise<DirectUploadResult> {
    if (!isStreamConfigured()) throw new StreamNotConfiguredError()

    const body: Record<string, unknown> = {
        maxDurationSeconds: opts.maxDurationSeconds,
        requireSignedURLs: true,
    }
    if (opts.allowedOrigins?.length) body.allowedOrigins = opts.allowedOrigins
    if (opts.watermarkProfileId) body.watermark = { uid: opts.watermarkProfileId }
    if (opts.meta) body.meta = opts.meta

    const res = await fetch(`${API_BASE}/direct_upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) {
        throw new Error(`[stream] direct_upload failed (${res.status}): ${JSON.stringify(json?.errors ?? json)}`)
    }
    return { uploadURL: json.result.uploadURL, uid: json.result.uid }
}

// ---------------------------------------------------------------------------
// Signed playback tokens (local signing)
// ---------------------------------------------------------------------------

export interface SignedTokenOptions {
    /** Token lifetime in seconds. Keep short; Cloudflare caps at 24h. */
    expSeconds?: number
    /** Allow the MP4 download endpoint for this token. Default false (view-only). */
    downloadable?: boolean
    /** Optional Cloudflare accessRules (IP / country gating). */
    accessRules?: unknown[]
}

/**
 * Sign a Stream playback JWT locally with the signing key. Returned string is
 * used in place of the UID in playback URLs:
 *   https://<subdomain>/<token>/manifest/video.m3u8
 */
export async function mintSignedPlaybackToken(uid: string, opts: SignedTokenOptions = {}): Promise<string> {
    if (!canSignPlayback()) throw new StreamNotConfiguredError()

    const pem = Buffer.from(SIGNING_KEY_PEM_B64!, 'base64').toString('utf8')
    const key = await importPKCS8(pem, 'RS256')

    const nowSec = Math.floor(Date.now() / 1000)
    const exp = nowSec + Math.min(opts.expSeconds ?? 3600, 24 * 3600)

    const claims: Record<string, unknown> = { sub: uid, kid: SIGNING_KEY_ID }
    if (opts.downloadable) claims.downloadable = true
    if (opts.accessRules) claims.accessRules = opts.accessRules

    return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: SIGNING_KEY_ID! })
        .setIssuedAt(nowSec)
        .setNotBefore(nowSec)
        .setExpirationTime(exp)
        .sign(key)
}

// ---------------------------------------------------------------------------
// Playback / thumbnail URL builders
// ---------------------------------------------------------------------------

/** HLS manifest URL for a signed token (feed to hls.js). */
export function streamManifestUrl(tokenOrUid: string): string | null {
    if (!CUSTOMER_SUBDOMAIN) return null
    return `https://${CUSTOMER_SUBDOMAIN}/${tokenOrUid}/manifest/video.m3u8`
}

/** Iframe embed URL (fallback player). */
export function streamIframeUrl(tokenOrUid: string): string | null {
    if (!CUSTOMER_SUBDOMAIN) return null
    return `https://${CUSTOMER_SUBDOMAIN}/${tokenOrUid}/iframe`
}

/** Still thumbnail at a given time (seconds). */
export function streamThumbnailUrl(tokenOrUid: string, timeSec = 0): string | null {
    if (!CUSTOMER_SUBDOMAIN) return null
    return `https://${CUSTOMER_SUBDOMAIN}/${tokenOrUid}/thumbnails/thumbnail.jpg?time=${timeSec}s`
}

// ---------------------------------------------------------------------------
// Video details
// ---------------------------------------------------------------------------

export interface StreamVideoDetails {
    uid: string
    readyToStream: boolean
    durationSec: number | null
    width: number | null
    height: number | null
    thumbnail: string | null
}

export async function getStreamVideo(uid: string): Promise<StreamVideoDetails | null> {
    if (!isStreamConfigured()) throw new StreamNotConfiguredError()
    const res = await fetch(`${API_BASE}/${uid}`, {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) return null
    const r = json.result
    return {
        uid: r.uid,
        readyToStream: Boolean(r.readyToStream),
        durationSec: typeof r.duration === 'number' ? r.duration : null,
        width: r.input?.width ?? null,
        height: r.input?.height ?? null,
        thumbnail: r.thumbnail ?? null,
    }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify Cloudflare Stream's `Webhook-Signature: time=<t>,sig1=<hex>` header.
 * The signed message is `${time}.${rawBody}` HMAC-SHA256'd with the webhook
 * secret. Returns false (never throws) on any malformed/failed input.
 */
export function verifyStreamWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!WEBHOOK_SECRET || !signatureHeader) return false
    try {
        const parts = Object.fromEntries(
            signatureHeader.split(',').map((kv) => {
                const i = kv.indexOf('=')
                return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
            }),
        )
        const time = parts['time']
        const sig1 = parts['sig1']
        if (!time || !sig1) return false

        const expected = createHmac('sha256', WEBHOOK_SECRET)
            .update(`${time}.${rawBody}`)
            .digest('hex')

        const a = Buffer.from(expected, 'utf8')
        const b = Buffer.from(sig1, 'utf8')
        if (a.length !== b.length) return false
        return timingSafeEqual(a, b)
    } catch {
        return false
    }
}
