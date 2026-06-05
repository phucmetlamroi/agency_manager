import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [E2E Phase 4 · permissions deny] As MEMBER3. Per seed-e2e-fixtures.ts member3 is:
 *   - Workspace MEMBER
 *   - NOT a member of `e2e-text` (probe visibleChannelWhere deny path)
 *   - NOT a member of `e2e-forum` (same)
 *   - IS a member of `e2e-wiki` and `e2e-admins-only`
 *   - Holds the "E2E Reviewer" custom role, which has overwrite on e2e-text:
 *     ALLOW VIEW + DENY POST. So member3 should SEE e2e-text via role overwrite,
 *     but composer should be UX-locked (server also denies).
 *
 * This file is the security backstop — if any assertion here flips green→red,
 * a permission bypass has been introduced.
 */

test.use({ storageState: 'e2e/.auth/member3.json' })

test('member3 does NOT see e2e-forum (not a member, no overwrite)', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    // Wiki + admins-only are visible (seeded membership).
    await expect(page.locator(`text=${CHANNELS.wiki}`).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`text=${CHANNELS.adminsOnly}`).first()).toBeVisible()

    // forum: not a member + no role overwrite → must be hidden.
    await expect(page.locator(`text=${CHANNELS.forum}`).first()).toBeHidden()
})

test('member3 SEES e2e-text via Reviewer role ALLOW VIEW overwrite', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    // Seed gives Reviewer role ALLOW VIEW on e2e-text → member3 (in Reviewer) sees it.
    await expect(page.locator(`text=${CHANNELS.text}`).first()).toBeVisible({ timeout: 10_000 })
})

test('member3 CANNOT post in e2e-text — Reviewer role DENY POST overwrite', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()

    // Either composer is fully absent (UX hides it for no-POST users) OR sending
    // returns an error. Try to send and assert no message round-trips.
    const composer = page.locator('textarea').first()
    if (await composer.isVisible().catch(() => false)) {
        const probe = `member3-should-not-see-${Date.now()}`
        await composer.fill(probe)
        await composer.press('Enter')
        await page.waitForTimeout(3_000)

        // Scope assertion to rendered <p> message bodies — exclude the composer textarea
        // (which can retain the value when the server rejected).
        const messageHits = await page.locator('p').filter({ hasText: probe }).count()
        expect(messageHits).toBe(0)

        // And the composer should still hold the text (or an error toast appeared) —
        // either way, sendMessage did NOT optimistic-clear (its success path clears it).
        // We don't strictly assert which signal; the lack of a rendered message is enough.
    }
})
