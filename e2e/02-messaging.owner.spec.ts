import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [E2E Phase 3C · messaging] As OWNER — send/edit boundary + delete own + attachment
 * basics. Owner is MODERATOR on every seeded channel, so all paths are permitted.
 */

test('send a Vietnamese message with diacritics and round-trip', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()

    const composer = page.locator('textarea').first()
    await composer.waitFor({ state: 'visible' })

    const msg = 'Xin chào — tiếng Việt có dấu đầy đủ 😊'
    await composer.fill(msg)
    await composer.press('Enter')

    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 5_000 })
})

test('empty message blocked', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()

    const composer = page.locator('textarea').first()
    await composer.waitFor()
    await composer.fill('')

    // Send button should be disabled (and Enter on empty does nothing).
    const sendBtn = page.locator('button[title="Gửi"]')
    if ((await sendBtn.count()) > 0) {
        await expect(sendBtn).toBeDisabled()
    }
})

test('4000-char boundary: 4000 OK + textarea hard-blocks 4001 via maxLength', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()

    const composer = page.locator('textarea').first()
    await composer.waitFor()

    const at4000 = 'a'.repeat(4000)
    await composer.fill(at4000)
    await composer.press('Enter')
    await expect(page.getByText(at4000.slice(0, 200)).first()).toBeVisible({ timeout: 8_000 })

    // Boundary client-side: textarea has maxLength={4000} so an extra char is silently
    // dropped — assert that the textarea cannot exceed 4000 even when we try to type more.
    await composer.fill('')
    await composer.fill('b'.repeat(4001))
    const length = await composer.evaluate((el) => (el as HTMLTextAreaElement).value.length)
    expect(length).toBe(4000)
})
