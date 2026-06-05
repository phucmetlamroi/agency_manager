import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P3J + P6O] LiveKit token surface — token mint endpoint scope, room
 * naming. Full call audio/video subscribe is left to manual QA (Playwright's
 * fake-media flags require browser config that's not portable across CI).
 *
 * Probes:
 *   - /api/livekit/token requires auth (Phase 6 sub-test)
 *   - call button appears in TEXT channel header
 */

async function openText(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
}

test('3J-CALL-BTN: TEXT channel header shows call (Video/Phone) button', async ({ page }) => {
    await openText(page)
    const callBtn = page.locator('button:has(svg.lucide-video), button:has(svg.lucide-phone-call)').first()
    await expect(callBtn).toBeVisible({ timeout: 5_000 })
})

test('3J-TOKEN-AUTH: unauthenticated POST /api/livekit/token rejected', async ({ playwright }) => {
    const ctx = await playwright.request.newContext()
    try {
        const res = await ctx.post('/api/livekit/token', { data: { roomName: 'test' } })
        // Must NOT return a token without a session — expect 401/403 OR an error body.
        expect([401, 403, 400, 500]).toContain(res.status())
    } finally {
        await ctx.dispose()
    }
})
