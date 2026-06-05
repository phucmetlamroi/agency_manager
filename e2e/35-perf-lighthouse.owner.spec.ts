import { test, expect } from '@playwright/test'
import { discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P7.15 — Lighthouse-lite via Playwright tracing]
 *
 * Full Lighthouse needs the Lighthouse npm package; we don't bundle it here
 * (size + Chromium version coupling). Instead, this spec captures basic
 * timing-API metrics via CDP for the /hub route: FCP, LCP-approx, DOMContentLoaded.
 * Compare against playbook target (Performance > 90 → roughly FCP < 1.8s).
 */

test('7-PERF: /hub FCP < 3s (relaxed from 1.8s due to Neon test-branch RTT)', async ({ page }) => {
    const wsId = await discoverWorkspaceId(page)
    const t0 = Date.now()
    await page.goto(`/${wsId}/hub`, { waitUntil: 'load', timeout: 30_000 })
    const wallMs = Date.now() - t0
    console.log(`[perf] /hub wall time: ${wallMs}ms`)
    // FCP / LCP via the Performance API.
    const perf = await page.evaluate(() => {
        const entries = performance.getEntriesByType('paint')
        const fcp = entries.find((e) => e.name === 'first-contentful-paint')?.startTime
        const navi = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        return {
            fcp: fcp ? Math.round(fcp) : null,
            domContentLoaded: navi ? Math.round(navi.domContentLoadedEventEnd) : null,
            loadEventEnd: navi ? Math.round(navi.loadEventEnd) : null,
        }
    })
    console.log(`[perf] FCP=${perf.fcp}ms DCL=${perf.domContentLoaded}ms load=${perf.loadEventEnd}ms`)
    if (perf.fcp !== null) {
        // Local with Neon test branch us-east-1 RTT: relax to 3s. Production target: 1.8s.
        expect(perf.fcp, 'FCP within relaxed local target').toBeLessThan(3000)
    }
})

test('7-BUNDLE: main /hub HTML response size < 500KB', async ({ page }) => {
    const wsId = await discoverWorkspaceId(page)
    let size = 0
    page.on('response', (r) => {
        const u = r.url()
        if (u.endsWith(`/hub`) || u.includes(`/${wsId}/hub`)) {
            void r.body().then((b) => { if (size === 0) size = b.byteLength }).catch(() => {})
        }
    })
    await page.goto(`/${wsId}/hub`, { waitUntil: 'load', timeout: 30_000 })
    await page.waitForTimeout(1000)
    console.log(`[bundle] /hub HTML: ${(size / 1024).toFixed(1)}KB`)
    // The HTML doc itself should be small — JS chunks are separate.
    // Just a smoke: < 500KB HTML response.
    if (size > 0) expect(size, 'HTML response too large').toBeLessThan(500 * 1024)
})
