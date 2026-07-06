// [Review module P5.5] Staff-side browser wrappers for /api/review/shares* +
// the get-or-create asset share ("Copy link khách"). VN errors (internal UI).

import type { ShareDto, ShareActivityDto, ShareState } from './shares'

export type { ShareDto, ShareActivityDto, ShareState } from './shares'

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

export interface CreateSharePayload {
    workspaceId: string
    items: { type: 'asset' | 'folder'; id: string }[]
    name?: string
    allowComments?: boolean
    allowDownload?: boolean
    downloadOnlyWhenApproved?: boolean
    showAllVersions?: boolean
    password?: string | null
    expiresAt?: string | null
}

export function apiCreateShare(payload: CreateSharePayload): Promise<{ share: ShareDto }> {
    return fetch('/api/review/shares', jsonInit('POST', payload)).then((r) => okJson(r))
}

export function apiListShares(q: {
    workspaceId: string
    taskId?: string
    assetId?: string
    state?: ShareState
}): Promise<{ items: ShareDto[]; nextCursor: string | null; total: number }> {
    const sp = new URLSearchParams({ workspaceId: q.workspaceId })
    if (q.taskId) sp.set('taskId', q.taskId)
    if (q.assetId) sp.set('assetId', q.assetId)
    if (q.state) sp.set('state', q.state)
    return fetch(`/api/review/shares?${sp}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => okJson(r))
}

export function apiGetShareDetail(id: string): Promise<{ share: ShareDto; activity: ShareActivityDto[] }> {
    return fetch(`/api/review/shares/${id}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) => okJson(r))
}

export function apiUpdateShare(
    id: string,
    patch: Partial<Omit<CreateSharePayload, 'workspaceId' | 'items'>> & { expectedRowVersion: number },
): Promise<{ share: ShareDto }> {
    return fetch(`/api/review/shares/${id}`, jsonInit('PATCH', patch)).then((r) => okJson(r))
}

export function apiSetShareRevoked(id: string, revoked: boolean): Promise<{ share: ShareDto }> {
    return fetch(`/api/review/shares/${id}/revoke`, jsonInit('POST', { revoked })).then((r) => okJson(r))
}

export function apiDeleteShare(id: string): Promise<{ deleted: true }> {
    return fetch(`/api/review/shares/${id}`, jsonInit('DELETE')).then((r) => okJson(r))
}

/** "Copy link khách": one ACTIVE default share per asset, created on first click. */
export function apiGetOrCreateAssetShare(assetId: string): Promise<{ share: ShareDto; created: boolean }> {
    return fetch(`/api/review/assets/${assetId}/share`, jsonInit('POST')).then((r) => okJson(r))
}
