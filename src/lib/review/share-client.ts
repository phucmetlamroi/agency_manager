// [Review module P5.3] Browser fetch wrappers for the GUEST share API
// (/api/r/{slug}/*) — the guest twin of comment-client.ts + player-api.ts.
// English error messages; every route re-resolves the share server-side.

import type { CommentDto, CreateCommentInput, ListCommentsQuery, ListCommentsResponse } from './comment-client'
import type { PlaybackToken } from './player-api'
import type { GuestShareContent } from './share-guest'

export type { GuestShareContent, GuestAssetView, GuestVersionView } from './share-guest'

async function errMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: { message?: string; code?: string } }
        if (body?.error?.message) return body.error.message
    } catch {
        /* non-JSON */
    }
    return `Error ${res.status}. Please try again.`
}
async function okJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as T
}

/** Error that preserves the API envelope's `code` so callers can branch on it (e.g. the decision
 *  route's VERIFICATION_REQUIRED / DECISIONS_DISABLED gates — AUDIT H1/H2). */
export class GuestApiError extends Error {
    readonly status: number
    readonly code?: string
    constructor(message: string, status: number, code?: string) {
        super(message)
        this.name = 'GuestApiError'
        this.status = status
        this.code = code
    }
}
async function okJsonCoded<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let code: string | undefined
        let message = `Error ${res.status}. Please try again.`
        try {
            const b = (await res.json()) as { error?: { message?: string; code?: string } }
            if (b?.error?.code) code = b.error.code
            if (b?.error?.message) message = b.error.message
        } catch {
            /* non-JSON */
        }
        throw new GuestApiError(message, res.status, code)
    }
    return (await res.json()) as T
}
function jsonInit(method: string, body?: unknown): RequestInit {
    return {
        method,
        credentials: 'same-origin',
        ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    }
}

export interface GuestIdentityInput {
    name: string
    email: string
}

export interface GuestDecisionResult {
    reviewState: 'draft' | 'awaiting_review' | 'changes_requested' | 'approved'
    message: string
}

/** All guest endpoints for ONE slug, bound once. */
export function guestShareApi(slug: string) {
    const base = `/api/r/${slug}`
    return {
        fetchContent(): Promise<GuestShareContent> {
            return fetchNoStore(base).then((r) => okJson(r))
        },
        unlock(password: string): Promise<{ unlocked: true }> {
            return fetch(`${base}/unlock`, jsonInit('POST', { password })).then((r) => okJson(r))
        },
        identify(guest: GuestIdentityInput & { force?: boolean }): Promise<{ guest: { name: string } }> {
            return fetch(`${base}/identity`, jsonInit('POST', guest)).then((r) => okJson(r))
        },
        fetchPlaybackToken(versionId: string): Promise<PlaybackToken> {
            return fetch(`${base}/playback-token`, jsonInit('POST', { versionId })).then((r) => okJson(r))
        },
        /** Guest list — maps the guest response shape onto ListCommentsResponse and
         *  reports which comment ids belong to THIS guest session (edit/delete). */
        async listComments(
            versionId: string,
            _q: ListCommentsQuery,
            onMine?: (ids: string[]) => void,
        ): Promise<ListCommentsResponse> {
            const res = await fetchNoStore(`${base}/versions/${versionId}/comments`).then((r) =>
                okJson<{
                    items: CommentDto[]
                    deletedIds?: string[]
                    mineIds: string[]
                    total: number
                }>(r),
            )
            onMine?.(res.mineIds)
            return { items: res.items, deletedIds: res.deletedIds, otherVersions: [], nextCursor: null, total: res.total }
        },
        createComment(versionId: string, input: CreateCommentInput & { guest?: GuestIdentityInput }): Promise<{ comment: CommentDto }> {
            const { isInternal: _drop, mentions: _drop2, ...rest } = input
            return fetch(`${base}/comments`, jsonInit('POST', { versionId, ...rest })).then((r) => okJson(r))
        },
        editComment(commentId: string, body: string): Promise<{ comment: CommentDto }> {
            return fetch(`${base}/comments/${commentId}`, jsonInit('PATCH', { body })).then((r) => okJson(r))
        },
        deleteComment(commentId: string): Promise<{ deleted: true }> {
            return fetch(`${base}/comments/${commentId}`, jsonInit('DELETE')).then((r) => okJson(r))
        },
        addReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }> {
            return fetch(`${base}/comments/${commentId}/reactions`, jsonInit('POST', { emoji })).then((r) => okJson(r))
        },
        removeReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }> {
            return fetch(`${base}/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, jsonInit('DELETE')).then((r) =>
                okJson(r),
            )
        },
        initiateAttachment(input: { fileName: string; sizeBytes: number; mimeType: string }): Promise<{
            attachmentId: string
            putUrl: string
            expiresAt: string
        }> {
            return fetch(`${base}/comment-attachments/initiate`, jsonInit('POST', input)).then((r) => okJson(r))
        },
        submitDecision(input: { versionId: string; decision: 'approve' | 'request_changes'; note?: string }): Promise<GuestDecisionResult> {
            // okJsonCoded so the UI can catch GuestApiError.code === 'VERIFICATION_REQUIRED' /
            // 'DECISIONS_DISABLED' and drive the sign-off verification step (AUDIT H1/H2).
            return fetch(`${base}/decision`, jsonInit('POST', input)).then((r) => okJsonCoded(r))
        },
        fetchDownloadUrl(versionId: string): Promise<{ url: string; fileName: string; expiresAt: string }> {
            return fetchNoStore(`${base}/download-url?versionId=${encodeURIComponent(versionId)}`).then((r) => okJson(r))
        },
        /** Inline DISPLAY url for an IMAGE asset — not gated by allowDownload. */
        fetchImageViewUrl(versionId: string): Promise<{ url: string; expiresAt: string }> {
            return fetchNoStore(`${base}/versions/${encodeURIComponent(versionId)}/view-url`).then((r) => okJson(r))
        },
        sendEvent(type: 'link_opened' | 'asset_viewed', versionId?: string): Promise<void> {
            return fetch(`${base}/events`, jsonInit('POST', { type, ...(versionId ? { versionId } : {}) }))
                .then(() => undefined)
                .catch(() => undefined) // tracking is best-effort — never surface
        },
    }
}
export type GuestShareApi = ReturnType<typeof guestShareApi>

function fetchNoStore(url: string): Promise<Response> {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
}
