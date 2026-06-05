import { test, expect } from '@playwright/test'
import { discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3B · Channel create gate] As MEMBER (no admin) — "Tạo kênh" button,
 * "Quản lý vai trò" button, and "Nhóm" button must all be ABSENT (these are
 * ADMIN-gated). Search button stays visible (any member can search).
 */

test('member1 does NOT see admin-only buttons in Chat header', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    // Search IS visible for every member.
    await expect(page.locator('button[title="Tìm tin nhắn"]')).toBeVisible({ timeout: 10_000 })

    // Admin-only buttons must NOT be present.
    await expect(page.locator('button[title="Tạo kênh"]')).toBeHidden()
    await expect(page.locator('button[title="Quản lý vai trò"]')).toBeHidden()
    await expect(page.locator('button[title="Tạo nhóm kênh"]')).toBeHidden()
})
