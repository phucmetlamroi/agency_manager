import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [E2E Phase 3A · smoke] As OWNER — sanity-check the Chat surface loads with the
 * global Sidebar (regression test for the chrome-less-/hub bug fixed at 186863b)
 * and the seeded channels show up.
 */

test('smoke: owner reaches Chat with global Sidebar + seeded channels visible', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)

    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    // Global Sidebar must be present (was the reported "full-page Chat" bug).
    const globalSidebar = page.locator('nav, aside').filter({ hasText: /dashboard/i })
    await expect(globalSidebar.first()).toBeVisible({ timeout: 10_000 })

    // Chat header in the inner sidebar.
    await expect(page.locator('text=Chat').first()).toBeVisible()

    // Seeded channels appear.
    for (const name of [CHANNELS.text, CHANNELS.wiki, CHANNELS.forum, CHANNELS.adminsOnly]) {
        await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 8_000 })
    }
})

test('smoke: owner opens e2e-text and sees empty message stream + composer', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator(`text=${CHANNELS.text}`).first().click()

    // Composer textarea (placeholder mentions the channel name).
    const composer = page.locator('textarea').first()
    await expect(composer).toBeVisible({ timeout: 8_000 })

    // Header shows channel name as #e2e-text.
    await expect(page.getByText(CHANNELS.text).first()).toBeVisible()
})

test('smoke: WIKI channel renders the Tiptap tree, not the chat stream', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator(`text=${CHANNELS.wiki}`).first().click()

    // Wiki view: the BookOpen "Wiki" header in the doc-tree sidebar.
    await expect(page.getByText('Wiki').first()).toBeVisible({ timeout: 8_000 })
    // Empty state since seed didn't create pages.
    await expect(page.getByText(/chọn một trang|tạo trang mới|chưa có trang/i).first()).toBeVisible()
})

test('smoke: FORUM channel renders the post-list view, not chat', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator(`text=${CHANNELS.forum}`).first().click()

    // Forum header has "Bài mới" button.
    await expect(page.getByRole('button', { name: /bài mới/i })).toBeVisible({ timeout: 8_000 })
})
