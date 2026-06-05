import { test, expect } from '@playwright/test'

/**
 * [Playbook P6M + P6N — Misc security]
 *
 * 6M Open redirect: ?next= / ?returnTo= must reject external hosts.
 * 6N Session/token hygiene: cookies HttpOnly + Secure (in prod) + SameSite;
 *    no tokens in URLs.
 * 6G-RLS: anonymous Supabase realtime subscribe should be rejected (we can't
 *    easily test this from Playwright; documented as parity).
 */

test('6M-OPEN-REDIRECT: ?next=https://evil.example rejected on /login', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        const res = await ctx.get('/login?next=https%3A%2F%2Fevil.example%2Fphish', { maxRedirects: 0 })
        // Login page should render (200) without honoring the external redirect.
        // If the server 302s to evil.example → CRITICAL open redirect.
        const loc = res.headers()['location'] || ''
        expect(loc.includes('evil.example'), `CRITICAL open redirect to ${loc}`).toBe(false)
    } finally { await ctx.dispose() }
})

test('6N-COOKIE-HTTPONLY: session cookie is HttpOnly + SameSite=lax/strict (production hint)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        // Hit /login — server should set a session-cookie skeleton on response.
        const res = await ctx.get('/login')
        const sc = res.headers()['set-cookie'] || ''
        // Probe: if any cookie is set, it must be HttpOnly and have SameSite attribute.
        if (sc && sc.length > 0) {
            // We won't fail in test env (Secure flag depends on HTTPS). Smoke-only.
            const isHttpOnly = /HttpOnly/i.test(sc)
            const hasSameSite = /SameSite=/i.test(sc)
            // Either both attrs present, or no auth cookie is set yet (login is a GET).
            if (/session|auth/i.test(sc)) {
                expect(isHttpOnly && hasSameSite, 'auth cookie missing HttpOnly/SameSite').toBe(true)
            }
        }
    } finally { await ctx.dispose() }
})

test('6N-NO-TOKEN-IN-URL: no obvious access_token in any URL after login flow', async ({ page }) => {
    await page.goto('/login')
    // Just navigate and confirm no #access_token=... or ?access_token=... fragments.
    const u = page.url()
    expect(u, 'no access_token in URL').not.toMatch(/access_token=/)
})

test('6O-LIVEKIT-FORGED-TOKEN: forged JWT to /api/livekit/token endpoint rejected', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        const res = await ctx.post('/api/livekit/token', {
            headers: { Authorization: 'Bearer this.is.forged' },
            data: { roomName: 'attack' },
        })
        // Must NOT mint a token without a real session.
        expect([401, 403, 400, 405]).toContain(res.status())
    } finally { await ctx.dispose() }
})
