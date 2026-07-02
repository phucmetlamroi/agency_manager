/**
 * [Trial P3] Server-side Web Push sender — fully gated on VAPID env.
 *
 * If VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY are not set, every export
 * here is a silent no-op: the toggle won't appear (getVapidPublicKey() → null),
 * nothing is stored, nothing is sent. So shipping this with keys UNSET changes
 * NOTHING at runtime — the user configures keys later to switch it on.
 *
 * `web-push` is imported dynamically so it never enters the client bundle and a
 * missing/broken install can't break an unrelated build path.
 */
import { prisma } from '@/lib/db'

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@hustlytasker.app'

export function isWebPushConfigured(): boolean {
    return Boolean(PUBLIC_KEY && PRIVATE_KEY)
}

export interface WebPushPayload {
    title: string
    body?: string
    url?: string
    tag?: string
}

/**
 * Push `payload` to every subscription the user has. No-op (returns 0) when
 * VAPID isn't configured or the user has no subscriptions. Dead endpoints
 * (404/410 from the push service) are pruned. Never throws to the caller —
 * this is always fire-and-forget alongside the in-app notification + email.
 */
export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<number> {
    if (!isWebPushConfigured()) return 0

    let subs: { id: string; endpoint: string; p256dh: string; auth: string }[]
    try {
        subs = await prisma.pushSubscription.findMany({
            where: { userId },
            select: { id: true, endpoint: true, p256dh: true, auth: true },
        })
    } catch { return 0 }
    if (subs.length === 0) return 0

    let webpush: typeof import('web-push')
    try {
        webpush = (await import('web-push')).default as unknown as typeof import('web-push')
    } catch (e) {
        console.error('[web-push] module load failed', e)
        return 0
    }
    try {
        webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
    } catch (e) {
        console.error('[web-push] invalid VAPID config', e)
        return 0
    }

    const body = JSON.stringify({
        title: payload.title,
        body: payload.body ?? '',
        url: payload.url ?? '/',
        tag: payload.tag,
    })

    const gone: string[] = []
    let sent = 0
    await Promise.all(subs.map(async (s) => {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
            sent++
        } catch (err: any) {
            const code = err?.statusCode
            if (code === 404 || code === 410) gone.push(s.id)
            else console.error('[web-push] send failed', code, err?.body ?? err?.message)
        }
    }))

    if (gone.length) {
        try { await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } }) } catch { /* best-effort prune */ }
    }
    return sent
}
