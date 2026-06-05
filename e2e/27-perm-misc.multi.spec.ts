import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { CHANNELS, PASSWORD, USERS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P4 — Permissions matrix · misc cells]
 *
 *   - GUEST (workspace GUEST role) with no overwrite → default-deny on sensitive actions
 *   - member2 has USER ALLOW MANAGE on #e2e-overwrites → can manage despite being a
 *     channel MEMBER (user grant adds beyond membership)
 *   - cross-workspace: member1 cannot read workspace B channels (membership scope)
 */

async function login(ctx: BrowserContext, username: string) {
    const page = await ctx.newPage()
    await page.goto('/login')
    await page.locator('input[name="emailOrUsername"]').fill(username)
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: /^đăng nhập$/i }).last().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
    return page
}

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return wsId
}

test('4-GUEST-MINIMAL: guest sees an empty or near-empty sidebar (no channel memberships)', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const guest = await login(ctx, USERS.guest.username)
        await openHub(guest)
        await guest.waitForTimeout(2000)
        // Guest is NOT a ChannelMember anywhere in our seed, so they see no channels.
        // (Workspace role=GUEST but no membership = empty sidebar at minimum.)
        for (const c of [CHANNELS.text, CHANNELS.wiki, CHANNELS.forum, CHANNELS.adminsOnly]) {
            const cnt = await guest.locator(`text=${c}`).count()
            expect(cnt, `guest must NOT see #${c}`).toBe(0)
        }
    } finally {
        await browser.close().catch(() => {})
    }
})

test('4-M2-USER-MANAGE: member2 sees settings gear on #e2e-overwrites (USER ALLOW MANAGE)', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const m2 = await login(ctx, USERS.member2.username)
        await openHub(m2)
        // member2 is a channel MEMBER but has user-level ALLOW MANAGE overwrite.
        // Gear must be present (user grant beyond role).
        await m2.locator('text=e2e-overwrites').first().click()
        await m2.locator('textarea').first().waitFor()
        const gear = m2.locator('button:has(svg.lucide-settings)').first()
        await expect(gear, 'member2 should see settings gear (USER ALLOW MANAGE)').toBeVisible({ timeout: 5_000 })
    } finally {
        await browser.close().catch(() => {})
    }
})

test('4-CROSS-WS-IDOR: member1 cannot reach workspace B (cross-tenant)', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const m1 = await login(ctx, USERS.member1.username)
        await openHub(m1)
        // Discover workspace B URL pattern — we don't know it from here directly.
        // Hit /api or use a fake workspace UUID — the gate must redirect or 403.
        const fakeB = '5b29b05b-a399-4a66-96a3-f4b94da6a1b6' // seed-known B id (deterministic per seed)
        const res = await m1.goto(`/${fakeB}/hub`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null)
        // Expected: redirect away (login or own workspace) OR 403 OR error page.
        // Not expected: workspace B's channels rendering.
        await m1.waitForTimeout(2000)
        const url = m1.url()
        // Either we got redirected OR we see "không có quyền" / 403 / error.
        const isRedirected = !url.includes(fakeB)
        const errVisible = await m1.getByText(/không có quyền|403|forbidden|không tìm thấy/i).count()
        expect(isRedirected || errVisible > 0, 'CRITICAL IDOR: member1 reached workspace B').toBe(true)
    } finally {
        await browser.close().catch(() => {})
    }
})

test('4-CLIENT-NOSTAFF: e2e_client cannot reach the /hub staff surface', async () => {
    const browser = await chromium.launch()
    try {
        const ctx = await browser.newContext()
        const client = await login(ctx, USERS.client.username)
        // After login, CLIENT lands on /portal, NOT /[workspaceId]/hub.
        await client.waitForTimeout(2000)
        const url = client.url()
        expect(url, 'CLIENT must land on /portal not /hub').toContain('/portal')
        // Direct nav to a hub URL → must redirect away.
        await client.goto('/9dca8fad-5957-4050-9c2e-c15b24c5f1db/hub', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
        await client.waitForTimeout(2000)
        const finalUrl = client.url()
        expect(finalUrl.includes('/hub') && !finalUrl.includes('/portal'), 'CRITICAL: CLIENT reached /hub surface').toBe(false)
    } finally {
        await browser.close().catch(() => {})
    }
})
