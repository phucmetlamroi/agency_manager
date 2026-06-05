import { test, expect } from '@playwright/test'
import { discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3M · Search + 3J · Roles] As OWNER. Verifies SearchModal min-length +
 * hit/empty rendering, and that RolesManagerModal lists the seeded roles.
 */

test('Search modal opens + the < 2 char hint is shown', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    await page.locator('button[title="Tìm tin nhắn"]').click()

    const searchInput = page.locator('input[placeholder*="Tìm tin"]')
    await expect(searchInput).toBeVisible({ timeout: 8_000 })

    await searchInput.fill('a')
    await expect(page.getByText(/ít nhất 2 ký tự/i).first()).toBeVisible({ timeout: 5_000 })
})

test('Search query >= 2 chars triggers a search and shows either hits or empty state', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator('button[title="Tìm tin nhắn"]').click()
    const searchInput = page.locator('input[placeholder*="Tìm tin"]')
    await expect(searchInput).toBeVisible({ timeout: 8_000 })

    await searchInput.fill('xin')

    // Wait for: either "không tìm thấy" empty-state OR at least one hit card.
    const empty = page.getByText(/không tìm thấy kết quả/i).first()
    const hitWithChannel = page.locator('text=/#e2e-/i').first()
    await expect(async () => {
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasHit = await hitWithChannel.isVisible().catch(() => false)
        expect(hasEmpty || hasHit).toBe(true)
    }).toPass({ timeout: 10_000 })
})

test('Search modal closes via X button', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator('button[title="Tìm tin nhắn"]').click()

    const input = page.locator('input[placeholder*="Tìm tin"]')
    await expect(input).toBeVisible({ timeout: 8_000 })

    // Click the X icon button inside the modal (last one before the input area is
    // the close button, which carries the X svg). Use force in case overlay blocks.
    await page.locator('button:has(svg.lucide-x)').first().click()
    await expect(input).toBeHidden({ timeout: 5_000 })
})

test('Roles Manager modal opens + shows seeded roles', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await page.locator('button[title="Quản lý vai trò"]').click()
    await expect(page.getByRole('heading', { name: /^vai trò$/i }).first()).toBeVisible({ timeout: 8_000 })

    // Role list is fetched async — generous timeout for Neon RTT.
    await expect(page.getByText('E2E Editor').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('E2E Reviewer').first()).toBeVisible()
})
