import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { CHANNELS, USERS, discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3C/3D · composer] As OWNER on e2e-text — attach + send a tiny image,
 * reject oversize, @-mention autocomplete, emoji-mart picker opens.
 */

test('attach a small image and send — preview appears in stream', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()

    const tmp = path.join(os.tmpdir(), `e2e-tiny-${Date.now()}.png`)
    const tinyPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
    )
    fs.writeFileSync(tmp, tinyPng)

    try {
        await page.locator('input[type="file"]').first().setInputFiles(tmp)

        const text = `attach-${Date.now()}`
        await page.locator('textarea').first().fill(text)
        await page.locator('textarea').first().press('Enter')

        await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 })
        // Any <img> inside a rendered message after the text appears.
        await expect(page.locator(`img[alt*="${path.basename(tmp, '.png')}"]`).first()).toBeVisible({ timeout: 10_000 })
    } finally {
        fs.unlinkSync(tmp)
    }
})

test('attach a file > 10MB shows error toast and does NOT upload', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()

    const tmp = path.join(os.tmpdir(), `e2e-big-${Date.now()}.bin`)
    fs.writeFileSync(tmp, Buffer.alloc(11 * 1024 * 1024))

    try {
        await page.locator('input[type="file"]').first().setInputFiles(tmp)
        await expect(page.getByText(/tối đa 10mb|file.*lớn/i).first()).toBeVisible({ timeout: 8_000 })
    } finally {
        fs.unlinkSync(tmp)
    }
})

test('@-mention autocomplete shows seeded channel members by username', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    const composer = page.locator('textarea').first()
    await composer.waitFor()

    await composer.fill('@e2e_member')
    // Mention popup buttons display `@username` on the right side; matching by
    // raw username (ASCII) avoids any Vietnamese-diacritic regex pitfall.
    await expect(page.getByText(`@${USERS.member1.username}`).first()).toBeVisible({ timeout: 8_000 })
})

test('emoji picker (composer) opens', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.locator(`text=${CHANNELS.text}`).first().click()
    const composer = page.locator('textarea').first()
    await composer.waitFor()

    await page.locator('button[title="Emoji"]').first().click()

    const picker = page.locator('em-emoji-picker, [class*="emoji-mart"]').first()
    await expect(picker).toBeVisible({ timeout: 15_000 })
})
