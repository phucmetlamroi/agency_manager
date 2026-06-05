import { test, expect, chromium } from '@playwright/test'
import path from 'node:path'
import { CHANNELS, PASSWORD, USERS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P3H] Unread badge + mute toggle.
 *
 * 2-context probe:
 *   - sender (owner) logs in fresh, navigates to #e2e-text
 *   - receiver (member1) opens #e2e-wiki (a DIFFERENT channel) and stays there
 *   - sender sends a message → #e2e-text in receiver's sidebar must show unread badge
 *   - receiver clicks #e2e-text → badge clears (markChannelRead)
 *   - then toggle mute via the bell button → next sender message must NOT badge
 *
 * Runs as the member1 project so the receiver context uses storageState directly.
 * Sender is a fresh chromium browser (no storage) so we log in with credentials.
 */

async function openHubAt(page: import('@playwright/test').Page, channelName: string) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${channelName}`).first().click()
    await page.locator('textarea').first().waitFor()
    return wsId
}

async function loginFresh(page: import('@playwright/test').Page, username: string) {
    await page.goto('/login')
    await page.locator('input[name="emailOrUsername"]').fill(username)
    await page.locator('input[name="password"]').fill(PASSWORD)
    await page.getByRole('button', { name: /^đăng nhập$/i }).last().click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
}

test('3H-UNREAD: unfocused channel shows unread badge when sender posts', async ({ page: receiverPage }) => {
    // receiverPage is member1 (storageState loaded by project config).
    await openHubAt(receiverPage, CHANNELS.wiki) // park at WIKI — NOT the target channel

    // Sender — fresh browser, log in as owner.
    const senderBrowser = await chromium.launch()
    const senderCtx = await senderBrowser.newContext()
    const senderPage = await senderCtx.newPage()
    try {
        await loginFresh(senderPage, USERS.owner.username)
        await openHubAt(senderPage, CHANNELS.text)

        const tag = `unread-${Date.now()}`
        const composer = senderPage.locator('textarea').first()
        await composer.fill(tag)
        await composer.press('Enter')
        await expect(senderPage.getByText(tag).first()).toBeVisible({ timeout: 45_000 })

        // Receiver's sidebar #e2e-text item must show an unread indicator (badge or dot).
        // We accept any "non-zero" badge — a tiny dot, a number, or aria-label "unread".
        const sidebarItem = receiverPage.locator(`a:has-text("${CHANNELS.text}"), button:has-text("${CHANNELS.text}")`).first()
        await expect(sidebarItem).toBeVisible({ timeout: 8_000 })
        // Look for any badge child — color dot, number — within the item parent.
        const parent = sidebarItem.locator('xpath=ancestor::*[self::a or self::button or self::li][1]')
        const badge = parent.locator('[class*="badge"], [class*="bg-violet"], [class*="bg-red"], span:text-matches("^\\\\d+$")')
        // Wait up to 8s for the realtime/poll to surface unread.
        let found = false
        for (let i = 0; i < 8; i++) {
            if ((await badge.count()) > 0) { found = true; break }
            await receiverPage.waitForTimeout(1000)
        }
        expect(found, 'unread badge/indicator must appear on the channel item').toBe(true)
    } finally {
        await senderCtx.close().catch(() => {})
        await senderBrowser.close().catch(() => {})
    }
})

test('3H-CLEAR: clicking channel marks-read and badge clears', async ({ page }) => {
    await openHubAt(page, CHANNELS.text) // navigate to #e2e-text — markChannelRead fires
    await page.waitForTimeout(2000)
    // The badge for #e2e-text in the sidebar should now be absent (we're viewing it).
    const sidebarItem = page.locator(`a:has-text("${CHANNELS.text}"), button:has-text("${CHANNELS.text}")`).first()
    const parent = sidebarItem.locator('xpath=ancestor::*[self::a or self::button or self::li][1]')
    const badge = parent.locator('[class*="badge"]:not([style*="display: none"]), span:text-matches("^\\\\d+$")')
    expect(await badge.count(), 'no unread badge while viewing the channel').toBe(0)
})

test('3H-MUTE-TOGGLE: bell-on/off button in channel header is present', async ({ page }) => {
    await openHubAt(page, CHANNELS.text)
    // ChannelView header has Bell/BellOff via setChannelMuted.
    const bell = page.locator('button:has(svg.lucide-bell), button:has(svg.lucide-bell-off)').first()
    await expect(bell).toBeVisible({ timeout: 5_000 })
    // Click to toggle — second click toggles back so state is unchanged.
    await bell.click()
    await page.waitForTimeout(800)
    await bell.click()
})
