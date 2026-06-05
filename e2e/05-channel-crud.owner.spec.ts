import { test, expect } from '@playwright/test'
import { discoverWorkspaceId } from './fixtures'

/**
 * [Phase 3B · Channel CRUD] As OWNER — create new channels of each type. Owner is
 * workspace OWNER so the "+" create button is visible.
 *
 * Note: Both the "+" icon button (title="Tạo kênh") and the form's submit button
 * have aria-name "Tạo kênh" → strict-mode collision. We target the submit by its
 * unique submit-button classes.
 */

const SUBMIT_BTN = 'button.w-full.bg-violet-600'

test('owner sees "+" create-channel button + Shield + Search in Chat header', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('button[title="Tạo kênh"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('button[title="Quản lý vai trò"]')).toBeVisible()
    await expect(page.locator('button[title="Tìm tin nhắn"]')).toBeVisible()
})

test('owner creates a new TEXT channel and it appears in sidebar', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator('button[title="Tạo kênh"]').click()
    const newName = `e2e-text-${Date.now().toString().slice(-6)}`

    // pressSequentially fires real keystroke events so React's controlled `value` state
    // updates char-by-char. We then submit via Enter on the input (HubClient's onKeyDown
    // handler triggers handleCreateChannel directly), avoiding any flakiness from clicking
    // the form submit button while its `disabled` state is transitioning.
    const input = page.locator('input[placeholder="tên-kênh"]')
    await input.click()
    await input.pressSequentially(newName, { delay: 10 })
    await input.press('Enter')
    // TEXT is default tab; just submit (form's bg-violet-600 button).
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 30_000 })
})

test('owner creates a FORUM channel via type-toggle and it renders post-list', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator('button[title="Tạo kênh"]').click()
    const newName = `e2e-forum-${Date.now().toString().slice(-6)}`

    // pressSequentially fires real keystroke events so React's controlled `value` state
    // updates char-by-char. We then submit via Enter on the input (HubClient's onKeyDown
    // handler triggers handleCreateChannel directly), avoiding any flakiness from clicking
    // the form submit button while its `disabled` state is transitioning.
    const input = page.locator('input[placeholder="tên-kênh"]')
    await input.click()
    await input.pressSequentially(newName, { delay: 10 })
    // Click Forum BEFORE Enter — the type toggle updates newType state used by the submit.
    await page.locator('button:has-text("Forum")').click()
    await input.press('Enter')
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /bài mới/i })).toBeVisible({ timeout: 10_000 })
})

test('owner creates a WIKI channel and it renders the Tiptap tree view', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator('button[title="Tạo kênh"]').click()
    const newName = `e2e-wiki-${Date.now().toString().slice(-6)}`

    // pressSequentially fires real keystroke events so React's controlled `value` state
    // updates char-by-char. We then submit via Enter on the input (HubClient's onKeyDown
    // handler triggers handleCreateChannel directly), avoiding any flakiness from clicking
    // the form submit button while its `disabled` state is transitioning.
    const input = page.locator('input[placeholder="tên-kênh"]')
    await input.click()
    await input.pressSequentially(newName, { delay: 10 })
    // Click "Tài liệu" BEFORE Enter — type toggle updates newType to 'WIKI' before submit.
    await page.locator('button:has-text("Tài liệu")').click()
    await input.press('Enter')
    await expect(page.locator(`text=${newName}`).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/chưa có trang|chọn một trang/i).first()).toBeVisible({ timeout: 10_000 })
})

test('empty channel name keeps the submit button disabled', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator('button[title="Tạo kênh"]').click()
    await expect(page.locator('input[placeholder="tên-kênh"]')).toBeVisible()
    await expect(page.locator(SUBMIT_BTN)).toBeDisabled()
})

test('Escape closes the new-channel form', async ({ page }) => {
    const workspaceId = await discoverWorkspaceId(page)
    await page.goto(`/${workspaceId}/hub`)

    await page.locator('button[title="Tạo kênh"]').click()
    const input = page.locator('input[placeholder="tên-kênh"]')
    await expect(input).toBeVisible()
    await input.press('Escape')
    await expect(input).toBeHidden()
})
