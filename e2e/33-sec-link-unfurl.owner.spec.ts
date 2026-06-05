import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P6P + link-unfurl SSRF · ChatP3-3]
 *
 * The link unfurler (src/lib/link-unfurl.ts) has explicit SSRF guards:
 * private IPs blocked, port allowlist, 2MB body cap, 5s timeout, HTML-only.
 *
 * Probes:
 *   - localhost / 127.0.0.1 URL in a message must NOT produce a LinkPreview
 *   - 10.x.x.x / 169.254.169.254 (AWS metadata) URL must not preview
 *   - https://example.com (public) MAY preview (depends on network in CI)
 */

async function openText(page: import('@playwright/test').Page) {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await page.locator(`text=${CHANNELS.text}`).first().click()
    await page.locator('textarea').first().waitFor()
}

async function send(page: import('@playwright/test').Page, body: string) {
    await page.locator('textarea').first().fill(body)
    await page.locator('textarea').first().press('Enter')
    const tag = body.split(' ')[0]
    await expect(page.getByText(tag, { exact: false }).first()).toBeVisible({ timeout: 45_000 })
}

const SSRF_URLS = [
    'http://localhost/test',
    'http://127.0.0.1/probe',
    'http://10.0.0.1/internal',
    'http://169.254.169.254/latest/meta-data', // AWS metadata
    'http://192.168.1.1/router',
    'http://[::1]/v6loop',
]

for (const url of SSRF_URLS) {
    test(`6-SSRF-BLOCK: link unfurl skips ${url}`, async ({ page }) => {
        await openText(page)
        const tag = `ssrf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        await send(page, `${tag} ${url}`)
        // Wait for the after() unfurl pipeline to either skip or complete (5s budget).
        await page.waitForTimeout(8000)
        // Find the message row and assert NO link-preview card child is rendered.
        const row = page.getByText(tag).first().locator('xpath=ancestor::div[contains(@class,"group")][1]')
        // A preview card has `border-white/10 bg-white/[0.02]` styling — easier: look
        // for an <a> inside the row that links to our URL with a thumbnail/image sibling.
        const previewAnchor = row.locator(`a[href*="${url.split('://')[1].split('/')[0]}"]`)
        expect(await previewAnchor.count(), `CRITICAL SSRF: link preview rendered for ${url}`).toBe(0)
    })
}
