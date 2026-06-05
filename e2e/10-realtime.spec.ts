import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Phase 5 · realtime sync] Two-context multi-user scenario. Opens ONE browser
 * with two independent contexts (different storageState files = different users),
 * both viewing the same channel, then asserts events propagate from A → B within
 * the realtime + polling-fallback window.
 *
 * The realtime project does NOT set a default storageState — we always create
 * contexts explicitly here.
 */

async function pageFor(role: 'owner' | 'member1', browser: import('@playwright/test').Browser): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext({ storageState: `e2e/.auth/${role}.json` })
    const page = await ctx.newPage()
    return { ctx, page }
}

test('A sends a message → B receives it within the realtime window', async ({ browser }) => {
    const a = await pageFor('owner', browser)
    const b = await pageFor('member1', browser)

    try {
        const wsId = await discoverWorkspaceId(a.page)
        await Promise.all([a.page.goto(`/${wsId}/hub`), b.page.goto(`/${wsId}/hub`)])

        await Promise.all([
            a.page.locator(`text=${CHANNELS.text}`).first().click(),
            b.page.locator(`text=${CHANNELS.text}`).first().click(),
        ])
        await a.page.locator('textarea').first().waitFor()
        await b.page.locator('textarea').first().waitFor()

        const msg = `RT-${Date.now()}`
        const composerA = a.page.locator('textarea').first()
        await composerA.fill(msg)
        await composerA.press('Enter')

        // 25s = realtime (~1s) + polling fallback (15s) + slack.
        await expect(b.page.getByText(msg).first()).toBeVisible({ timeout: 25_000 })
    } finally {
        await a.ctx.close()
        await b.ctx.close()
    }
})

test('typing in A surfaces "đang gõ" in B', async ({ browser }) => {
    const a = await pageFor('owner', browser)
    const b = await pageFor('member1', browser)

    try {
        const wsId = await discoverWorkspaceId(a.page)
        await Promise.all([a.page.goto(`/${wsId}/hub`), b.page.goto(`/${wsId}/hub`)])

        await Promise.all([
            a.page.locator(`text=${CHANNELS.text}`).first().click(),
            b.page.locator(`text=${CHANNELS.text}`).first().click(),
        ])
        await a.page.locator('textarea').first().waitFor()
        await b.page.locator('textarea').first().waitFor()

        // Type without sending; broadcast fires every 2.5s.
        const composerA = a.page.locator('textarea').first()
        await composerA.fill('typing test message')
        // Wait a beat for the realtime broadcast to propagate.
        await b.page.waitForTimeout(2_000)
        await composerA.fill('typing test message changed')

        await expect(b.page.getByText(/đang gõ/i).first()).toBeVisible({ timeout: 12_000 })
    } finally {
        await a.ctx.close()
        await b.ctx.close()
    }
})

test('online presence: A appears online in B\'s view after sending', async ({ browser }) => {
    const a = await pageFor('owner', browser)
    const b = await pageFor('member1', browser)

    try {
        const wsId = await discoverWorkspaceId(a.page)
        await Promise.all([a.page.goto(`/${wsId}/hub`), b.page.goto(`/${wsId}/hub`)])

        await Promise.all([
            a.page.locator(`text=${CHANNELS.text}`).first().click(),
            b.page.locator(`text=${CHANNELS.text}`).first().click(),
        ])
        await a.page.locator('textarea').first().waitFor()
        await b.page.locator('textarea').first().waitFor()

        const composerA = a.page.locator('textarea').first()
        const msg = `presence-${Date.now()}`
        await composerA.fill(msg)
        await composerA.press('Enter')

        await expect(b.page.getByText(msg).first()).toBeVisible({ timeout: 25_000 })
        // Presence dot is span[title="Đang online"] — appears on the message's avatar.
        await expect(b.page.locator('span[title="Đang online"]').first()).toBeVisible({ timeout: 15_000 })
    } finally {
        await a.ctx.close()
        await b.ctx.close()
    }
})
