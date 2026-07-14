// [review-fixes P4/FR-11] POST /api/r/:slug/notifications/request-pin — email a 6-digit code
// so a guest can turn on review updates for an asset. ANTI-ENUMERATION: this route ALWAYS
// answers 200 (rate-limit/invalid folded into the body status), never leaking whether an email
// or asset exists. Limits: 3/10min per (email+share), 10/day per IP, 60s cooldown per (email+share).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { requestGuestPin } from '@/lib/review/guest-subscribe'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z
    .object({
        assetId: z.string().min(1).max(64),
        email: z.string().trim().email().max(254).optional(),
        // [AUDIT H2] Sign-off verification — force a fresh PIN so verify-pin stamps this session.
        signoff: z.boolean().optional(),
    })
    .strict()

/**
 * [AUDIT L3] Canonical INBOX key for the per-target-email cap. A raw-string cap is defeated by
 * subaddressing — victim@gmail.com, victim+1@gmail.com, and v.i.c.t.i.m@gmail.com are different strings
 * but the SAME physical inbox — so each variant would otherwise get its own daily budget. Strip the
 * "+tag" (subaddressing, near-universal) and, for Gmail, the dots the provider ignores. Used ONLY to
 * key the rate-limit; the PIN itself is still sent to the exact address the guest typed.
 */
function canonicalEmailKey(email: string): string {
    const at = email.lastIndexOf('@')
    if (at < 1) return email
    let local = email.slice(0, at)
    let domain = email.slice(at + 1)
    const plus = local.indexOf('+')
    if (plus >= 0) local = local.slice(0, plus)
    // gmail.com and googlemail.com are the SAME Google inbox and both ignore dots — fold to one key.
    if (domain === 'googlemail.com') domain = 'gmail.com'
    if (domain === 'gmail.com') local = local.replace(/\./g, '')
    return `${local}@${domain}`
}

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)

    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    // NEUTRAL envelope: EVERY in-scope request returns exactly this, so the body can never reveal
    // whether the email is already subscribed/verified, rate-limited, or brand-new (enumeration
    // oracle). The guest's own "already on" UI is driven by the session-gated GET status endpoint,
    // never by this response.
    const neutral = () => apiJson({ status: 'pin_sent' })

    const bodyEmail = (parsed.data.email ?? '').trim().toLowerCase()
    const sessionEmail = (guest?.email ?? '').trim().toLowerCase()
    const email = bodyEmail || sessionEmail
    if (!email) return neutral()

    // Skip-PIN / auto-subscribe is allowed ONLY for the guest's OWN session email; a body-supplied
    // foreign email must always earn a fresh PIN (no force-subscribe of arbitrary addresses).
    const isOwnEmail = !!sessionEmail && email === sessionEmail

    const ip = getClientIp(req)
    // Cooldown (60s) + burst (3/10min per email+share) + IP/day. On limit we silently skip the send
    // but keep the envelope identical — the rate-limit state must not leak either.
    const cooldown = await limitDb(`r:notif:cd:${email}:${share.id}`, 1, 60)
    const burst = await limitDb(`r:notif:pin:${email}:${share.id}`, 3, 600)
    const perIp = await limitDb(`r:notif:ip:${ip}`, 10, 86_400)
    // [AUDIT L3] Global cap PER TARGET INBOX across ALL shares + IPs — the per-(email,share) burst let
    // a botnet fan out to one victim address via many shares (email-bombing with the agency sender).
    // Keyed on the CANONICAL inbox (subaddressing stripped) so +tag / gmail-dot variants share one
    // 10/day budget instead of each getting its own.
    const perEmail = await limitDb(`r:notif:email:${canonicalEmailKey(email)}`, 10, 86_400)
    if (!cooldown.success || !burst.success || !perIp.success || !perEmail.success) return neutral()

    await requestGuestPin({
        share,
        assetId: parsed.data.assetId,
        email,
        isOwnEmail,
        guestSessionId: guest?.id ?? null,
        ip,
        alwaysSendCode: parsed.data.signoff === true,
    })
    return neutral()
})
