import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P4 — Permissions matrix]
 *
 * Owner-side cells:
 *   - owner = channel creator (createdById on every seeded channel) → MANAGE everywhere
 *   - owner sees #e2e-text + #e2e-wiki + #e2e-forum + #e2e-overwrites in sidebar
 *   - owner can pin (MANAGE), open settings (MANAGE), delete others' messages (MOD/owner)
 *
 * These are positive cells. The DENY/no-god-mode cells are in 24-26 (member, member3, admin).
 */

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return wsId
}

test('4-OWNER-VIEW-ALL: owner sees every seeded channel in the sidebar', async ({ page }) => {
    await openHub(page)
    for (const c of [CHANNELS.text, CHANNELS.wiki, CHANNELS.forum]) {
        await expect(page.locator(`text=${c}`).first()).toBeVisible({ timeout: 8_000 })
    }
    // The overwrite-only channel is also seeded — should be visible to owner.
    await expect(page.locator('text=e2e-overwrites').first()).toBeVisible({ timeout: 8_000 })
})

test('4-OWNER-POST: owner can post in #e2e-text', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const tag = `owner-post-${Date.now()}`
    await page.locator('textarea').first().fill(tag)
    await page.locator('textarea').first().press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('4-OWNER-MANAGE: owner sees the settings gear on #e2e-text (MANAGE)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    // Settings gear renders only when canManage = true.
    const gear = page.locator('button:has(svg.lucide-settings)').first()
    await expect(gear).toBeVisible({ timeout: 5_000 })
})

test('4-OWNER-POST-ADMINSONLY: owner can post in #e2e-admins-only (MOD role)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.adminsOnly}`).first().click()
    await page.locator('textarea').first().waitFor()
    const tag = `owner-ao-${Date.now()}`
    await page.locator('textarea').first().fill(tag)
    await page.locator('textarea').first().press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('4-OWNER-PIN: owner can pin a message (MANAGE)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const tag = `owner-pin-${Date.now()}`
    await page.locator('textarea').first().fill(tag)
    await page.locator('textarea').first().press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
    const row = page.getByText(tag).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await expect(row.locator('button[title="Ghim tin"]')).toBeVisible({ timeout: 5_000 })
})
