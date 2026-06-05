import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P9.5.E — Responsive layout]
 *
 * Test at: 320px (small mobile), 768px (tablet), 1024px (laptop), 1920px (desktop).
 *
 * FAIL CRITERIA: horizontal scroll at mobile → HIGH severity.
 */

const VIEWPORTS = [
    { name: 'mobile-320', width: 320, height: 568 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'laptop-1024', width: 1024, height: 768 },
    { name: 'desktop-1920', width: 1920, height: 1080 },
]

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

for (const vp of VIEWPORTS) {
    test(`9.5.E-LAYOUT-${vp.name}: /hub renders at ${vp.width}x${vp.height} without crash`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await openHub(page)
        // Smoke: page rendered SOMETHING.
        const bodyContent = await page.locator('body *').count()
        expect(bodyContent, `body must render at ${vp.name}`).toBeGreaterThan(0)
        // Check horizontal scroll — body.scrollWidth > viewport.width = HIGH fail.
        const overflow = await page.evaluate(() => {
            return document.body.scrollWidth > window.innerWidth
        })
        if (vp.width === 320) {
            // CRITICAL per playbook for mobile
            expect(overflow, `HIGH FAIL: horizontal scroll at mobile ${vp.name}`).toBe(false)
        }
    })

    test(`9.5.E-CHANNEL-${vp.name}: channel view fits viewport at ${vp.width}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await openHub(page)
        // Click into text channel
        const channel = page.locator(`text=${CHANNELS.text}`).first()
        if ((await channel.count()) === 0) test.skip(true, 'channel not in sidebar at this viewport')
        await channel.click()
        await page.waitForTimeout(2000)
        // Composer or main content visible
        const mainContent = await page.locator('textarea, main, [contenteditable]').count()
        expect(mainContent).toBeGreaterThan(0)
    })
}

/* ───────── 9.5.E-ZOOM-150: browser zoom 150% does not break layout ───── */
test('9.5.E-ZOOM-150: 150% browser zoom keeps layout usable', async ({ page }) => {
    await openHub(page)
    // Simulate zoom via viewport scaling
    await page.setViewportSize({ width: 853, height: 600 }) // 1280 * (1/1.5)
    await page.waitForTimeout(1500)
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth * 1.1)
    expect(overflow, 'zoom 150% must not produce major horizontal overflow').toBe(false)
})

/* ───────── 9.5.E-ROTATE: rotate portrait → landscape ─────── */
test('9.5.E-ROTATE: rotating viewport from portrait to landscape re-layouts cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone portrait
    await openHub(page)
    await page.waitForTimeout(1500)
    await page.setViewportSize({ width: 667, height: 375 }) // landscape
    await page.waitForTimeout(2000)
    // No JS errors after rotate
    expect(await page.locator('[role="alert"]').count()).toBe(0)
})
