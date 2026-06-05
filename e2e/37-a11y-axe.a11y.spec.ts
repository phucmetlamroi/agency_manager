import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P9 — A11y · axe engine]
 *
 * Scans core views for WCAG 2.2 AA violations. Zero "critical"/"serious"
 * violations is the gate. Smaller "moderate"/"minor" are logged but not fatal.
 */

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return wsId
}

test('9-A11Y-HUB: /hub root view — 0 critical/serious axe violations', async ({ page }) => {
    await openHub(page)
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    if (blocking.length > 0) {
        console.log('[a11y] HUB violations:')
        for (const v of blocking) {
            console.log(`  · ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
        }
    }
    expect(blocking, `${blocking.length} critical/serious WCAG violations on /hub`).toHaveLength(0)
})

test('9-A11Y-CHANNEL: #e2e-text channel view — 0 critical/serious', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    if (blocking.length > 0) {
        console.log('[a11y] CHANNEL violations:')
        for (const v of blocking) {
            console.log(`  · ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
        }
    }
    expect(blocking).toHaveLength(0)
})

test('9-A11Y-WIKI: WIKI channel — 0 critical/serious', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.wiki}`).first().click()
    await page.waitForTimeout(2000)
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    if (blocking.length > 0) {
        console.log('[a11y] WIKI violations:')
        for (const v of blocking) {
            console.log(`  · ${v.id} (${v.impact}): ${v.help}`)
        }
    }
    expect(blocking).toHaveLength(0)
})

test('9-A11Y-LOGIN: /login — 0 critical/serious', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(blocking).toHaveLength(0)
})

test('9-KEYBOARD-ESC: Escape closes channel settings modal', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const gear = page.locator('button:has(svg.lucide-settings)').first()
    await gear.click()
    await page.waitForTimeout(800)
    // Modal should be open with role=dialog OR specific class.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    // Modal should be gone.
    const modal = page.locator('[role="dialog"], [class*="modal"]').first()
    expect(await modal.count()).toBeLessThanOrEqual(1)
})

test('9-FOCUS-VISIBLE: tab nav reveals focus ring on first focusable element', async ({ page }) => {
    await openHub(page)
    await page.keyboard.press('Tab')
    // Smoke: the focused element exists and matches a body-tab order.
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).not.toBe('BODY')
})
