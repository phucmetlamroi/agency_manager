// [Review module P4.2] Client-side fetch wrappers for the review player. Thin
// helpers over the /api/review/* routes (each re-verifies workspace access server
// side — nothing here is trusted for authorization). Throws a human-readable Error.

export interface PlaybackToken {
    playbackId: string
    tokens: { playback: string; thumbnail: string; storyboard: string }
    expiresAt: string
}

async function errMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body?.error?.message) return body.error.message
    } catch {
        /* non-JSON */
    }
    return `Lỗi ${res.status}. Vui lòng thử lại.`
}

/** Mint 6h Mux signed tokens for a READY video version (POST §2.9). */
export async function fetchPlaybackToken(versionId: string): Promise<PlaybackToken> {
    const res = await fetch(`/api/review/versions/${versionId}/playback-token`, {
        method: 'POST',
        credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as PlaybackToken
}

/** Short-lived presigned R2 GET of the original file (image display + download). */
export async function fetchDownloadUrl(versionId: string): Promise<{ url: string; fileName: string; expiresAt: string }> {
    const res = await fetch(`/api/review/versions/${versionId}/download-url`, {
        method: 'POST',
        credentials: 'same-origin',
    })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as { url: string; fileName: string; expiresAt: string }
}

/** Mux signed HLS master playlist URL for a playback id + short token. */
export function hlsUrl(playbackId: string, playbackToken: string): string {
    return `https://stream.mux.com/${playbackId}.m3u8?token=${playbackToken}`
}
