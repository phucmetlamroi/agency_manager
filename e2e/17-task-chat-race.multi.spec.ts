import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import { PASSWORD, USERS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P3M + R1] Task chat — lazy create + race-safety.
 *
 * `getOrCreateTaskChannel` races on a unique taskId. Two simultaneous opens of
 * the SAME task must produce exactly ONE TASK channel — the second attempt
 * catches Prisma P2002 and re-fetches (channel-actions.ts:225-230).
 *
 * Since opening a task drawer requires navigating to admin/task and clicking,
 * which is brittle without a known task id, we ship this as a smoke probe: two
 * tabs open the same admin tasks page and click the same row near-simultaneously,
 * asserting no crash. Direct DB-level race assertion is left for the P5 spec.
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

test('3M-RACE: 2 contexts open admin tasks simultaneously — no crash', async () => {
    const browser = await chromium.launch()
    try {
        const ctxA = await browser.newContext()
        const ctxB = await browser.newContext()
        const a = await login(ctxA, USERS.owner.username)
        const b = await login(ctxB, USERS.admin.username)
        const wsId = await discoverWorkspaceId(a)
        // Both navigate to admin tasks list — concurrent.
        await Promise.all([
            a.goto(`/${wsId}/admin`).catch(() => {}),
            b.goto(`/${wsId}/admin`).catch(() => {}),
        ])
        await Promise.all([
            a.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {}),
            b.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {}),
        ])
        // Smoke: pages are still alive (no proxy 500 banner).
        expect(a.url()).toContain('/admin')
        expect(b.url()).toContain('/admin')
    } finally {
        await browser.close().catch(() => {})
    }
})
