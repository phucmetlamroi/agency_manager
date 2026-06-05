import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3K + 3L · Wiki + Forum CRUD] As OWNER. Owner is creator of both
 * e2e-wiki and e2e-forum so has MANAGE.
 */

test('wiki: create a new root page from the tree sidebar', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.wiki}`).first().click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await page.locator('button[title="Tạo trang"]').first().click()
    await expect(page.getByText('Trang mới').first()).toBeVisible({ timeout: 10_000 })
})

test('wiki: edit title → autosave indicator shows "Đã lưu"', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.wiki}`).first().click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Create a page if none exist; click "Trang mới" to ensure it's selected so the
    // editor mounts.
    await page.locator('button[title="Tạo trang"]').first().click()
    // The new page is auto-selected; the title input mounts after the page loads.
    const titleInput = page.locator('input[placeholder="Tiêu đề trang"]')
    await titleInput.waitFor({ state: 'visible', timeout: 15_000 })

    const title = `E2E Wiki ${Date.now().toString().slice(-6)}`
    await titleInput.fill(title)

    // Autosave fires after 800ms debounce; "Đã lưu" indicator follows the server roundtrip.
    await expect(page.getByText(/đã lưu/i).first()).toBeVisible({ timeout: 10_000 })
})

test('forum: create a new post — appears in the list', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.forum}`).first().click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await page.getByRole('button', { name: /bài mới/i }).click()

    const body = `forum-${Date.now().toString().slice(-6)}`
    await page.locator('textarea').first().fill(body)
    await page.getByRole('button', { name: /^đăng$/i }).click()

    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 })
})

test('forum: clicking a post opens the thread drawer', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.forum}`).first().click()
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await page.getByRole('button', { name: /bài mới/i }).click()
    const body = `forum-click-${Date.now().toString().slice(-6)}`
    await page.locator('textarea').first().fill(body)
    await page.getByRole('button', { name: /^đăng$/i }).click()

    // Wait for the post card to render before clicking it.
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 })
    await page.getByText(body).first().click()

    await expect(page.getByText('Thread').first()).toBeVisible({ timeout: 10_000 })
})
