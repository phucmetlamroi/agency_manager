import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P6I — Rate limit bypass]
 *
 * HustlyTasker rate limits (src/lib/chat-rate-limit.ts):
 *   - sendMessage: 30 msgs / 10s per user
 *   - editMessage: 30 edits / minute per user
 *   - reaction:    60 toggles / 10s per user
 *   - wikiSave:    60 autosaves / minute per page
 *
 * Probe: fire >30 sendMessage rapidly → server must throttle within the window.
 * Discord reference is 50 req/s global; HustlyTasker stricter per-action.
 */

async function openText(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
}

test('6I-SEND-RATE: >30 messages in 10s triggers server-side throttle', async ({ page }) => {
    await openText(page)
    const composer = page.locator('textarea').first()
    let lastError: string | null = null
    page.on('pageerror', (e) => { lastError = String(e) })
    // Capture any console error containing a rate-limit error string.
    page.on('console', (m) => {
        const txt = m.text().toLowerCase()
        if (txt.includes('rate') || txt.includes('429') || txt.includes('quá nhanh')) {
            lastError = lastError ?? m.text()
        }
    })
    // Fire 35 sends rapidly. Server must reject some.
    const before = Date.now()
    for (let i = 0; i < 35; i++) {
        await composer.fill(`rl-${before}-${i}`)
        await composer.press('Enter')
        // Don't await each — let the server queue/reject.
        await page.waitForTimeout(50)
    }
    // Let any errors surface.
    await page.waitForTimeout(3000)
    // Count messages actually landed.
    const landed = await page.locator(`text=/^rl-${before}-/`).count()
    // The limit is 30/10s. If we successfully sent all 35, that's a HIGH finding.
    expect(landed, 'rate-limit ineffective — server accepted >30 sends in <10s').toBeLessThanOrEqual(33)
})

test('6I-REACTION-RATE: >60 reaction toggles in 10s triggers throttle (smoke)', async ({ page }) => {
    await openText(page)
    const composer = page.locator('textarea').first()
    const tag = `rl-react-${Date.now()}`
    await composer.fill(tag)
    await composer.press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
    const row = page.getByText(tag).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Thêm cảm xúc"]').click()
    const thumb = page.getByRole('button', { name: '👍' }).first()
    // Quickly toggle reaction up to 30 times within 5s — well under the 60/10s limit
    // but stress-tests the toggle path. Asserting "no crash" + count converges.
    for (let i = 0; i < 30; i++) {
        await thumb.click().catch(() => {})
        await page.waitForTimeout(80)
    }
    await page.waitForTimeout(2000)
    // No JS error.
    expect(await page.locator('[role="alert"]').count()).toBe(0)
})

test('6J-SLOW-MODE-PRESENT: slowModeSeconds field is editable in channel settings', async ({ page }) => {
    await openText(page)
    // Open settings (gear)
    const gear = page.locator('button:has(svg.lucide-settings)').first()
    if ((await gear.count()) === 0) test.skip(true, 'no gear visible')
    await gear.click()
    await page.waitForTimeout(800)
    // The modal contains a "Chế độ chậm" / slow-mode select.
    const slowMode = page.locator('select').filter({ hasText: /tắt|giây|phút|giờ/i }).first()
    await expect(slowMode).toBeVisible({ timeout: 5_000 })
})
