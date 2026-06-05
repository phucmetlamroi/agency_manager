import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P4.3 — No god-mode for admins · CRITICAL]
 *
 * HustlyTasker is stricter than Discord: workspace ADMIN is NOT a channel-level
 * super-user. They are subject to ChannelMember + ChannelOverwrite resolution
 * just like a regular member.
 *
 * Seeded admin is a ChannelMember(role=MEMBER) on #e2e-text + #e2e-overwrites +
 * #e2e-admins-only. NOT a member of #e2e-forum, NOT in workspace B.
 *
 * Any cell where admin BYPASSES a DENY = CRITICAL god-mode finding (per playbook).
 */

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return wsId
}

test('4-ADMIN-NOFORUM: admin does NOT see #e2e-forum despite ADMIN workspace role (CRITICAL)', async ({ page }) => {
    await openHub(page)
    await page.waitForTimeout(2000)
    // Admin is workspace ADMIN but NOT a forum ChannelMember. Per HustlyTasker rules,
    // admin must NOT see channels they're not in. A god-mode finding here = CRITICAL.
    const forumItem = page.locator(`text=${CHANNELS.forum}`)
    expect(await forumItem.count(), 'CRITICAL: admin bypassed membership gate on #e2e-forum (god-mode)').toBe(0)
})

test('4-ADMIN-VIEW-TEXT: admin sees #e2e-text (member)', async ({ page }) => {
    await openHub(page)
    await expect(page.locator(`text=${CHANNELS.text}`).first()).toBeVisible({ timeout: 8_000 })
})

test('4-ADMIN-POST-TEXT: admin can post in #e2e-text (channel MEMBER, postPolicy=EVERYONE)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const tag = `admin-post-${Date.now()}`
    await page.locator('textarea').first().fill(tag)
    await page.locator('textarea').first().press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('4-ADMIN-POST-ADMINSONLY: admin can post in #e2e-admins-only (workspace ADMIN bypasses postPolicy)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.adminsOnly}`).first().click()
    await page.locator('textarea').first().waitFor()
    const tag = `admin-ao-${Date.now()}`
    await page.locator('textarea').first().fill(tag)
    await page.locator('textarea').first().press('Enter')
    await expect(page.getByText(tag).first()).toBeVisible({ timeout: 45_000 })
})

test('4-ADMIN-NOMANAGE-TEXT: admin sees no settings gear on #e2e-text (channel MEMBER, not MOD)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
    const gear = page.locator('button:has(svg.lucide-settings)').first()
    // Admin is a channel MEMBER (not OWNER, not MOD) on #e2e-text. Workspace ADMIN
    // role does NOT grant channel MANAGE per HustlyTasker rules. Gear must be absent.
    expect(await gear.count(), 'CRITICAL: admin bypassed channel MANAGE gate (god-mode)').toBe(0)
})

test('4-ADMIN-NOOVERWRITES: admin sees #e2e-overwrites (channel MEMBER, no overwrite DENYing them)', async ({ page }) => {
    await openHub(page)
    await expect(page.locator('text=e2e-overwrites').first()).toBeVisible({ timeout: 8_000 })
})
