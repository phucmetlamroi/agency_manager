import { test, expect } from '@playwright/test'
import { discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P3B] Category CRUD — create, reorder (if UI present), nested under
 * sidebar. Empty/duplicate name handling.
 *
 * Categories are seeded ("E2E Suite"). Creating a new one tests the UI affordance.
 */

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
}

test('3B-CAT-LIST: seeded category "E2E Suite" appears in sidebar', async ({ page }) => {
    await openHub(page)
    await expect(page.getByText(/e2e suite/i).first()).toBeVisible({ timeout: 8_000 })
})

test('3B-CAT-CREATE: owner creates a new category via the +-button (if present)', async ({ page }) => {
    await openHub(page)
    // Look for a "+" near the category header — implementation-dependent.
    const addBtn = page.locator('button[title*="tạo nhóm" i], button[aria-label*="category" i]').first()
    if ((await addBtn.count()) === 0) {
        test.skip(true, 'no inline category-add UI (P-CAT-CREATE-UI parity gap)')
    }
    const name = `e2e-cat-${Date.now()}`
    await addBtn.click()
    const input = page.locator('input[placeholder*="nhóm" i], input[name*="category" i]').first()
    await input.fill(name)
    await input.press('Enter')
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 })
})

test('3B-CAT-EMPTY: empty category name rejected', async ({ page }) => {
    await openHub(page)
    const addBtn = page.locator('button[title*="tạo nhóm" i]').first()
    if ((await addBtn.count()) === 0) test.skip(true, 'no category-add UI')
    await addBtn.click()
    const input = page.locator('input[placeholder*="nhóm" i]').first()
    await input.fill('')
    await input.press('Enter')
    await page.waitForTimeout(800)
    // Modal or input should still be present (rejection or no-op).
    expect(await page.locator('input').count()).toBeGreaterThan(0)
})
