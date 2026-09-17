// [Review module P1] Mux Video REST wrapper — hand-rolled fetch (no @mux/mux-node).
// We use exactly 3 endpoints (create/get/delete asset); a new dep would re-run
// `prisma db push` on every Vercel build (the P0-pre incident), so we avoid it.
// Playback-token JWT signing lives in mux-jwt.ts (P1.7).

import { parseFps } from './upload-helpers'

const MUX_API = 'https://api.mux.com'

export class MuxError extends Error {
    constructor(
        public status: number,
        message: string,
        public body?: unknown,
    ) {
        super(message)
        this.name = 'MuxError'
    }
}

function authHeader(): string {
    const id = process.env.MUX_TOKEN_ID
    const secret = process.env.MUX_TOKEN_SECRET
    if (!id || !secret) throw new Error('[review/mux] missing MUX_TOKEN_ID / MUX_TOKEN_SECRET')
    return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

async function muxFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${MUX_API}${path}`, {
        method,
        headers: {
            Authorization: authHeader(),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 204) return undefined as T
    const text = await res.text()
    let json: unknown = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        /* non-JSON body */
    }
    if (!res.ok) {
        const messages = (json as { error?: { messages?: string[] } })?.error?.messages
        throw new MuxError(res.status, messages?.join('; ') || `Mux ${method} ${path} → ${res.status}`, json)
    }
    return (json as { data?: T })?.data as T
}

export interface MuxAsset {
    id: string
    status: 'preparing' | 'ready' | 'errored' | string
    duration?: number // seconds (float)
    playback_ids?: { id: string; policy: 'public' | 'signed' }[]
    tracks?: {
        type: 'video' | 'audio' | string
        max_width?: number
        max_height?: number
        max_frame_rate?: number
        encoding?: string // codec
    }[]
    errors?: { type?: string; messages?: string[] }
    passthrough?: string
}

/**
 * Create a Mux asset that PULLS the original from a presigned R2 GET URL.
 * Locked params: signed playback, passthrough=versionId.
 * [BR-06 tier 3 — E1 approved 2026-07-07] video_quality='plus' (was 'basic'). 'basic'
 * caps the ladder at 720p, so even after the ABR/rendition_order fixes 1080p sources
 * stayed a touch soft on 1080p displays. 'plus' unlocks up to the source resolution +
 * a better encode (~$0.03/min extra, MUX_ENCODING). Applies to NEW assets only —
 * existing 'basic' assets are unaffected (no re-encode, no migration).
 */
export async function createMuxAsset(opts: {
    inputUrl: string
    passthrough: string
    /** [Giải trí 2026-08] Kho phim cho chọn mức encode từng phim ('basic' = miễn phí
     *  encode nhưng cap 720p). Bỏ trống ⇒ 'plus' — module Tệp gọi không truyền, hành
     *  vi giữ nguyên từng byte. */
    videoQuality?: 'basic' | 'plus'
}): Promise<MuxAsset> {
    return muxFetch<MuxAsset>('POST', '/video/v1/assets', {
        input: [{ url: opts.inputUrl }],
        playback_policy: ['signed'],
        video_quality: opts.videoQuality ?? 'plus',
        passthrough: opts.passthrough,
    })
}

export async function getMuxAsset(assetId: string): Promise<MuxAsset> {
    return muxFetch<MuxAsset>('GET', `/video/v1/assets/${assetId}`)
}

/** Delete a Mux asset (reconcile timeout / task cleanup). Idempotent-ish (404 ok). */
export async function deleteMuxAsset(assetId: string): Promise<void> {
    try {
        await muxFetch<void>('DELETE', `/video/v1/assets/${assetId}`)
    } catch (e) {
        if (e instanceof MuxError && e.status === 404) return
        throw e
    }
}

export interface MuxReadyMeta {
    muxPlaybackId: string | null
    durationMs: number | null
    fpsNumerator: number | null
    fpsDenominator: number | null
    width: number | null
    height: number | null
    videoCodec: string | null
    audioCodec: string | null
}

/** Extract the ReviewVersion metadata columns from a ready Mux asset. */
export function extractReadyMeta(asset: MuxAsset): MuxReadyMeta {
    const signed = asset.playback_ids?.find((p) => p.policy === 'signed') ?? asset.playback_ids?.[0]
    const video = asset.tracks?.find((t) => t.type === 'video')
    const audio = asset.tracks?.find((t) => t.type === 'audio')
    const fps = video?.max_frame_rate != null ? parseFps(video.max_frame_rate) : null
    return {
        muxPlaybackId: signed?.id ?? null,
        durationMs: asset.duration != null ? Math.round(asset.duration * 1000) : null,
        fpsNumerator: fps?.num ?? null,
        fpsDenominator: fps?.den ?? null,
        width: video?.max_width ?? null,
        height: video?.max_height ?? null,
        videoCodec: video?.encoding ?? null,
        audioCodec: audio?.encoding ?? null,
    }
}
