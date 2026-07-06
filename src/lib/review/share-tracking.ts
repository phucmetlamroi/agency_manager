// [Review module P5.1] Guest tracking (FR-F06): ShareActivity events + the
// viewCount/lastViewedAt counters, with the 30-minute per-session debounce.
//
// The debounce lives in a small httpOnly cookie (rv_t_{slug} = {o,v} unix secs)
// instead of a DB lookup — anonymous "nameless views" have no GuestSession row
// to key on, and the cookie survives exactly as long as the session semantics
// the spec wants. Events are written through the SINGLE events/playback routes;
// the content GET stays side-effect-free (deviation from API-SPEC §5.5.2 noted
// in IMPLEMENTATION-NOTES — one writer beats two racing ones).

import type { GuestSession, ShareLink } from '@prisma/client'
import { prisma } from '@/lib/db'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import type { CookieReader } from './share-auth'
import { throttleCookieName } from './share-auth'

export const EVENT_THROTTLE_SEC = 30 * 60
export const THROTTLE_COOKIE_TTL_SEC = 24 * 60 * 60

export interface ShareThrottle {
    /** last link_opened, unix seconds */
    o?: number
    /** last asset_viewed, unix seconds */
    v?: number
}

export function readThrottle(cookies: CookieReader, slug: string): ShareThrottle {
    const raw = cookies.get(throttleCookieName(slug))?.value
    if (!raw) return {}
    try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object') {
            const t = parsed as Record<string, unknown>
            return {
                o: typeof t.o === 'number' ? t.o : undefined,
                v: typeof t.v === 'number' ? t.v : undefined,
            }
        }
    } catch {
        /* corrupted cookie → treat as fresh session */
    }
    return {}
}

export function throttleAllows(last: number | undefined): boolean {
    return !last || Date.now() / 1000 - last > EVENT_THROTTLE_SEC
}

const guestFields = (guest: GuestSession | null) => ({
    guestSessionId: guest?.id ?? null,
    guestName: guest?.name ?? null,
})

/** link_opened: one activity row + batched-ish counter bump, atomically. */
export async function recordLinkOpened(
    share: ShareLink,
    guest: GuestSession | null,
    userAgent: string | null,
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.shareLink.update({
            where: { id: share.id },
            data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
        })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.SHARE_LINK_OPENED,
            workspaceId: share.workspaceId,
            taskId: share.taskId,
            shareLinkId: share.id,
            ...guestFields(guest),
            meta: userAgent ? { userAgent: userAgent.slice(0, 300) } : undefined,
        })
    })
}

export async function recordAssetViewed(
    share: ShareLink,
    v: { assetId: string; versionId: string; versionNumber: number },
    guest: GuestSession | null,
): Promise<void> {
    await recordActivity(prisma, {
        type: REVIEW_ACTIVITY.SHARE_ASSET_VIEWED,
        workspaceId: share.workspaceId,
        taskId: share.taskId,
        shareLinkId: share.id,
        assetId: v.assetId,
        versionId: v.versionId,
        ...guestFields(guest),
        meta: { versionNumber: v.versionNumber },
    })
}

export async function recordDownloaded(
    share: ShareLink,
    v: { assetId: string; versionId: string; versionNumber: number },
    guest: GuestSession | null,
): Promise<void> {
    await recordActivity(prisma, {
        type: REVIEW_ACTIVITY.SHARE_DOWNLOADED,
        workspaceId: share.workspaceId,
        taskId: share.taskId,
        shareLinkId: share.id,
        assetId: v.assetId,
        versionId: v.versionId,
        ...guestFields(guest),
        meta: { versionNumber: v.versionNumber },
    })
}
