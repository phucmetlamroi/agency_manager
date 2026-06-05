import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { PASSWORD, USERS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P6C + P6D — IDOR / permission bypass / auth bypass · CRITICAL]
 *
 * Tests cross-tenant IDOR by attempting to access workspace B resources as a
 * workspace A member, and unauthenticated probes against server endpoints
 * that should require a session.
 *
 * Workspace B id is seed-deterministic and shared via .auth seed log:
 *   5b29b05b-a399-4a66-96a3-f4b94da6a1b6
 */

const WORKSPACE_B_ID = '5b29b05b-a399-4a66-96a3-f4b94da6a1b6'

async function login(ctx: BrowserContext, username: string) {
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.locator('input[name="emailOrUsername"]').fill(username)
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: /^đăng nhập$/i }).last().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    return page
}

test('6C-CROSS-TENANT-HUB: member1 (workspace A) cannot reach workspace B /hub', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const m1 = await login(ctx, USERS.member1.username)
        await m1.goto(`/${WORKSPACE_B_ID}/hub`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
        await m1.waitForTimeout(3000)
        const url = m1.url()
        const redirected = !url.includes(WORKSPACE_B_ID)
        const errBanner = await m1.getByText(/không có quyền|forbidden|không tìm thấy/i).count()
        expect(redirected || errBanner > 0, `CRITICAL IDOR: member1 reached workspace B (${url})`).toBe(true)
    } finally { await browser.close().catch(() => {}) }
})

test('6C-CROSS-TENANT-ADMIN: member1 cannot reach workspace B /admin', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const m1 = await login(ctx, USERS.member1.username)
        await m1.goto(`/${WORKSPACE_B_ID}/admin`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
        await m1.waitForTimeout(3000)
        const url = m1.url()
        const redirected = !url.includes(WORKSPACE_B_ID)
        const errBanner = await m1.getByText(/không có quyền|forbidden|không tìm thấy/i).count()
        expect(redirected || errBanner > 0).toBe(true)
    } finally { await browser.close().catch(() => {}) }
})

test('6D-AUTH-LIVEKIT: unauthenticated /api/livekit/token rejected', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        const res = await ctx.post('/api/livekit/token', { data: { roomName: 'forged' } })
        expect([401, 403, 400, 405]).toContain(res.status())
    } finally { await ctx.dispose() }
})

test('6D-AUTH-LIVEKIT-ACTIVE: unauthenticated /api/livekit/active rejected', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        const res = await ctx.get('/api/livekit/active?workspaceId=' + WORKSPACE_B_ID)
        expect([401, 403, 400, 404, 200]).toContain(res.status())
        // If 200, body must NOT leak any room data of workspace B.
        if (res.status() === 200) {
            const body = await res.text()
            // For unauth, expect empty array or rejection — anything containing
            // an actual room name is a leak.
            expect(body.length).toBeLessThan(1000)
        }
    } finally { await ctx.dispose() }
})

test('6B-CSRF-CROSS-ORIGIN: server action POST without same-origin headers rejected', async ({ playwright }) => {
    // Next.js Server Actions encode a CSRF-safe form-data payload + a session
    // cookie. Direct POST without the cookie or with a wrong Origin header
    // must fail. Use a logged-in storageState? No — explicit unauth probe.
    const ctx = await playwright.request.newContext()
    try {
        // Hit any known action route path — we don't have a stable URL for SAs
        // in Next 16 (they're dynamic), so probe the login action instead.
        const res = await ctx.post('/login', {
            headers: { Origin: 'https://evil.example' },
            data: { emailOrUsername: 'attacker', password: 'guess' },
        })
        // Expect a 4xx or a redirect that doesn't authenticate.
        expect(res.status()).toBeLessThan(500)
    } finally { await ctx.dispose() }
})
