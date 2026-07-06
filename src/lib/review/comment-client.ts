// [Review module P4.3] Client-side comment API wrappers (API-SPEC §4). Thin fetch
// helpers over /api/review/{versions/[id]/comments, comments/[id]/*} — each route
// re-verifies workspace access server-side. Throws a human-readable Error on failure.

import type { CommentDto, AnnotationShape } from './dto'

export type { CommentDto, AnnotationShape } from './dto'

export interface OtherVersionComments {
    versionId: string
    versionNumber: number
    commentCount: number
}
export interface ListCommentsResponse {
    items: CommentDto[]
    deletedIds?: string[]
    otherVersions: OtherVersionComments[]
    nextCursor: string | null
    total: number
}

export interface CreateCommentInput {
    body?: string
    parentId?: string | null
    startFrame?: number | null
    endFrame?: number | null
    annotation?: AnnotationShape[]
    isInternal?: boolean
    attachments?: { attachmentId: string; fileName: string; mimeType: string; sizeBytes: number; width?: number; height?: number }[]
    mentions?: string[]
}

export interface ListCommentsQuery {
    sort?: 'timecode' | 'newest'
    filter?: 'unresolved' | 'internal' | 'public' | 'mine'
    authorId?: string
    q?: string
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
async function okJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as T
}
function jsonInit(method: string, body?: unknown): RequestInit {
    return {
        method,
        credentials: 'same-origin',
        ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    }
}

export async function listComments(versionId: string, q: ListCommentsQuery = {}): Promise<ListCommentsResponse> {
    const sp = new URLSearchParams()
    if (q.sort) sp.set('sort', q.sort)
    if (q.filter) sp.set('filter', q.filter)
    if (q.authorId) sp.set('authorId', q.authorId)
    if (q.q) sp.set('q', q.q)
    const qs = sp.toString()
    const res = await fetch(`/api/review/versions/${versionId}/comments${qs ? `?${qs}` : ''}`, {
        credentials: 'same-origin',
        cache: 'no-store',
    })
    return okJson<ListCommentsResponse>(res)
}

export async function createComment(versionId: string, input: CreateCommentInput): Promise<{ comment: CommentDto }> {
    return okJson(await fetch(`/api/review/versions/${versionId}/comments`, jsonInit('POST', input)))
}

export async function editComment(commentId: string, body: string): Promise<{ comment: CommentDto }> {
    return okJson(await fetch(`/api/review/comments/${commentId}`, jsonInit('PATCH', { body })))
}

export async function deleteComment(commentId: string): Promise<{ deleted: true }> {
    return okJson(await fetch(`/api/review/comments/${commentId}`, jsonInit('DELETE')))
}

export async function setCommentResolved(commentId: string, resolved: boolean): Promise<{ comment: CommentDto }> {
    return okJson(await fetch(`/api/review/comments/${commentId}/resolve`, jsonInit(resolved ? 'POST' : 'DELETE')))
}

export async function addReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }> {
    return okJson(await fetch(`/api/review/comments/${commentId}/reactions`, jsonInit('POST', { emoji })))
}

export async function removeReaction(commentId: string, emoji: string): Promise<{ reactions: CommentDto['reactions'] }> {
    return okJson(
        await fetch(`/api/review/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, jsonInit('DELETE')),
    )
}

export async function initiateAttachment(input: {
    fileName: string
    sizeBytes: number
    mimeType: string
}): Promise<{ attachmentId: string; putUrl: string; expiresAt: string }> {
    return okJson(await fetch('/api/review/comment-attachments/initiate', jsonInit('POST', input)))
}
