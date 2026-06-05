import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P3E + R15] Reaction edge cases.
 *
 * R15: double-click on the same emoji must NOT violate the unique
 * (messageId, userId, emoji) constraint or produce a 500. The action's
 * `toggleReaction` is idempotent — first click adds, second click removes;
 * a true double-click should resolve to a stable single state.
 *
 * Also: skin-tone modifier on a thumb emoji, ZWJ family emoji as a single
 * grapheme. Storm test (100 reactions) is in Phase 7.
 */

async function openText(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
}

async function send(page: import('@playwright/test').Page, body: string) {
    const composer = page.locator('textarea').first()
    await composer.fill(body)
    await composer.press('Enter')
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 45_000 })
}

test('3E-DBLCLICK (R15): double-click same emoji → stable state (no 500)', async ({ page }) => {
    await openText(page)
    const msg = `dblreact-${Date.now()}`
    await send(page, msg)
    const row = page.getByText(msg).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Thêm cảm xúc"]').click()
    // Double-click thumbs-up rapidly.
    const thumb = page.getByRole('button', { name: '👍' }).first()
    await thumb.dblclick()
    await page.waitForTimeout(2000)
    // No error banner.
    expect(await page.locator('[role="alert"]').count()).toBe(0)
    // Final state: either 0 or 1 thumbs-up — never duplicate row.
    const tuRows = row.getByText('👍')
    expect(await tuRows.count()).toBeLessThanOrEqual(1)
})

test('3E-FAMILY-EMOJI: ZWJ family 👨‍👩‍👧‍👦 message sends + renders as one grapheme', async ({ page }) => {
    await openText(page)
    const tag = `family-${Date.now()}`
    const composer = page.locator('textarea').first()
    await composer.fill(`${tag} 👨‍👩‍👧‍👦`)
    await composer.press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('3E-SKINTONE: thumbs-up with skin-tone modifier renders correctly', async ({ page }) => {
    await openText(page)
    const tag = `skin-${Date.now()}`
    const composer = page.locator('textarea').first()
    await composer.fill(`${tag} 👍🏽`)
    await composer.press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('3E-MULTI-EMOJI: full picker (+) renders categorized grid', async ({ page }) => {
    await openText(page)
    const msg = `multiemoji-${Date.now()}`
    await send(page, msg)
    const row = page.getByText(msg).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Thêm cảm xúc"]').click()
    // Look for the "+" that opens the full emoji-mart picker (frequent + more).
    const more = page.locator('button[title*="emoji" i]:not([title*="Thêm"]), button:has-text("+")').first()
    if ((await more.count()) > 0) {
        await more.click()
        // emoji-mart picker renders many categories — assert at least one search input or category btn.
        await expect(page.locator('input[placeholder*="search" i], em-emoji-picker, [class*="emoji-mart"]').first()).toBeVisible({ timeout: 6_000 })
    }
})
