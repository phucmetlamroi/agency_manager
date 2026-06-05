import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3E/3F/3G · reactions / threads / pins] As OWNER on e2e-text. Owner is
 * createdById so canManage=true (pin/unpin allowed).
 */

async function openChannel(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
}

async function sendOne(page: import('@playwright/test').Page, msg: string) {
    const composer = page.locator('textarea').first()
    await composer.fill(msg)
    await composer.press('Enter')
    // Use getByText (matches Phase 2 pattern). 45s covers Neon RTT + Supabase
    // broadcast 3s cap + notification fan-out for 3-recipient channel.
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 45_000 })
}

test('react with thumbs-up via quick-emoji popup', async ({ page }) => {
    await openChannel(page)
    const msg = `reaction-${Date.now()}`
    await sendOne(page, msg)

    const row = page.getByText(msg).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Thêm cảm xúc"]').click()
    await page.getByRole('button', { name: '👍' }).first().click()

    await expect(row.getByText('👍').first()).toBeVisible({ timeout: 8_000 })
})

test('open thread drawer from Reply icon — header + 2 composers visible', async ({ page }) => {
    await openChannel(page)
    const msg = `thread-parent-${Date.now()}`
    await sendOne(page, msg)

    const row = page.getByText(msg).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Trả lời / mở thread"]').click()

    await expect(page.getByText('Thread').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('textarea')).toHaveCount(2, { timeout: 8_000 })
})

test('reply in thread + parent shows "1 trả lời" badge', async ({ page }) => {
    await openChannel(page)
    const parent = `thread-${Date.now()}`
    await sendOne(page, parent)

    const row = page.getByText(parent).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Trả lời / mở thread"]').click()

    await expect(page.locator('textarea')).toHaveCount(2, { timeout: 8_000 })

    const replyText = `reply-${Date.now()}`
    await page.locator('textarea').nth(1).fill(replyText)
    await page.locator('textarea').nth(1).press('Enter')

    await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 15_000 })

    // Close drawer; backdrop click closes ThreadPanel (clicking the dark backdrop area).
    await page.keyboard.press('Escape')

    // Parent's "1 trả lời" badge appears via MESSAGE_EDIT realtime — may take a few seconds.
    await expect(page.getByText(/1 trả lời/i).first()).toBeVisible({ timeout: 15_000 })
})

test('pin own message + unpin via row hover', async ({ page }) => {
    await openChannel(page)
    const msg = `pin-${Date.now()}`
    await sendOne(page, msg)

    const row = page.getByText(msg).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await row.hover()
    await row.locator('button[title="Ghim tin"]').click()
    await expect(page.getByText(/đã ghim tin/i).first()).toBeVisible({ timeout: 8_000 })

    await row.hover()
    await row.locator('button[title="Bỏ ghim"]').click()
    await expect(page.getByText(/đã bỏ ghim/i).first()).toBeVisible({ timeout: 8_000 })
})

test('owner opens "Tin đã ghim" popover from channel header', async ({ page }) => {
    await openChannel(page)
    await page.locator('button[title="Tin đã ghim"]').click()
    await expect(page.getByText(/tin đã ghim/i).first()).toBeVisible({ timeout: 5_000 })
})
