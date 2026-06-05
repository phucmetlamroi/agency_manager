import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P4 — Permissions matrix · member3 cells]
 *
 * member3 = workspace MEMBER + holds "E2E Reviewer" custom role.
 *
 * Seeded overwrites involving Reviewer:
 *   - on #e2e-text     : Reviewer role ALLOW VIEW + DENY POST → m3 sees but cannot post
 *   - on #e2e-overwrites : Reviewer role DENY POST → m3 cannot post here either
 *   - m3 is also a ChannelMember on #e2e-wiki + #e2e-forum + #e2e-overwrites + #e2e-admins-only
 *
 * Critical cells:
 *   - role ALLOW VIEW grants visibility to a NON-MEMBER (#e2e-text — m3 is NOT in channel-text members)
 *   - role DENY POST blocks posting even though channel postPolicy=EVERYONE
 */

async function openHub(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    return wsId
}

test('4-M3-VIEW-VIA-ALLOW: member3 sees #e2e-text via Reviewer role ALLOW VIEW (non-member)', async ({ page }) => {
    await openHub(page)
    // m3 is NOT a ChannelMember of #e2e-text but the Reviewer ALLOW VIEW overwrite
    // grants visibility — playbook explicitly tests this cell.
    await expect(page.locator(`text=${CHANNELS.text}`).first()).toBeVisible({ timeout: 8_000 })
})

test('4-M3-DENY-POST-WINS: member3 cannot post in #e2e-text (Reviewer DENY POST)', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.waitForTimeout(2000)
    // The composer might be disabled OR a "no permission" hint shown OR the send call
    // returns an error. Accept any of these as a DENY signal.
    const composer = page.locator('textarea').first()
    if ((await composer.count()) === 0) {
        // Composer hidden entirely — that's a valid DENY signal.
        return
    }
    const isDisabled = await composer.getAttribute('disabled')
    if (isDisabled !== null) return
    // If composer is enabled, try sending — server should reject.
    const tag = `m3-deny-${Date.now()}`
    await composer.fill(tag)
    await composer.press('Enter')
    await page.waitForTimeout(3500)
    // Message must NOT appear (server denied).
    const visible = await page.getByText(tag).count()
    expect(visible, 'member3 must NOT post in #e2e-text (Reviewer DENY POST)').toBe(0)
})

test('4-M3-VIEW-WIKI: member3 sees #e2e-wiki (ChannelMember)', async ({ page }) => {
    await openHub(page)
    await expect(page.locator(`text=${CHANNELS.wiki}`).first()).toBeVisible({ timeout: 8_000 })
})

test('4-M3-NOFORUM: member3 does NOT see #e2e-forum (not a member, no overwrite)', async ({ page }) => {
    await openHub(page)
    await page.waitForTimeout(2000)
    // Seed line 204-207: forum members = owner + m1 + m2 only. m3 not in.
    // No overwrite grants forum VIEW to Reviewer role.
    const forumItem = page.locator(`text=${CHANNELS.forum}`)
    expect(await forumItem.count(), 'member3 must NOT see #e2e-forum (no membership, no overwrite)').toBe(0)
})

test('4-M3-VIEW-ADMINSONLY: member3 sees #e2e-admins-only (member but postPolicy=ADMINS_ONLY)', async ({ page }) => {
    await openHub(page)
    await expect(page.locator(`text=${CHANNELS.adminsOnly}`).first()).toBeVisible({ timeout: 8_000 })
})

test('4-M3-NOPOST-ADMINSONLY: member3 cannot post in #e2e-admins-only', async ({ page }) => {
    await openHub(page)
    await page.locator(`text=${CHANNELS.adminsOnly}`).first().click()
    await page.waitForTimeout(2000)
    const composer = page.locator('textarea').first()
    if ((await composer.count()) === 0) return // composer hidden = DENY
    const tag = `m3-ao-${Date.now()}`
    await composer.fill(tag)
    await composer.press('Enter')
    await page.waitForTimeout(3500)
    expect(await page.getByText(tag).count(), 'member3 must NOT post in #e2e-admins-only').toBe(0)
})
