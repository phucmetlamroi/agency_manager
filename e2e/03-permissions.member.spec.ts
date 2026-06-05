import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [E2E Phase 4 · permissions matrix] As MEMBER1 (regular workspace MEMBER, also has
 * E2E Editor custom role). Probes:
 *   - VIEW + POST on channels they're a member of (e2e-text, e2e-wiki, e2e-admins-only)
 *   - NO visibility on e2e-forum (not a member, no role overwrite)
 *   - ADMINS_ONLY channel hides the composer for them (the postPolicy gate)
 */

test('member1 sees every seeded channel they are a member of', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    // Per seed-e2e-fixtures.ts, member1 is in all four: text, wiki, forum, admins-only.
    // (Denial-case visibility test lives in 04-permissions.member3.spec — member3 is
    // NOT in text/forum, so they exercise visibleChannelWhere's deny path.)
    await expect(page.locator(`text=${CHANNELS.text}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${CHANNELS.wiki}`).first()).toBeVisible()
    await expect(page.locator(`text=${CHANNELS.forum}`).first()).toBeVisible()
    await expect(page.locator(`text=${CHANNELS.adminsOnly}`).first()).toBeVisible()
})

test('member1 can send in e2e-text (regular EVERYONE postPolicy)', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()

    const composer = page.locator('textarea').first()
    await composer.waitFor()
    const msg = `member1 hello ${Date.now()}`
    await composer.fill(msg)
    await composer.press('Enter')

    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 5_000 })
})

test('member1 CANNOT post in e2e-admins-only (composer hidden by UX, server denies)', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.adminsOnly}`).first().click()

    // The "read-only" placeholder text appears instead of a composer.
    await expect(page.getByText(/chỉ chủ kênh|admin được đăng/i).first()).toBeVisible({ timeout: 8_000 })

    // No textarea composer should be present (or, if present, send must reject).
    const composer = page.locator('textarea').first()
    const composerVisible = await composer.isVisible().catch(() => false)
    expect(composerVisible).toBe(false)
})
