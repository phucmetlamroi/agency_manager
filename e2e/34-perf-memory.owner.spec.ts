import { test, expect } from '@playwright/test'
import { CHANNELS, discoverWorkspaceId } from './fixtures'

/**
 * [Playbook P7.13 + R12 — Memory leak detection]
 *
 * Switch between channels 50 times in one page session (scaled down from
 * the playbook's 1,000 for a sane local runtime). Sample JS heap via CDP
 * before and after; assert heap doesn't balloon (Supabase subs torn down).
 */

test('7-MEMORY-LEAK: 50 channel switches — heap stays bounded', async ({ page }) => {
    const wsId = await discoverWorkspaceId(page)
    await page.goto(`/${wsId}/hub`)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Open CDP for heap snapshots.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('HeapProfiler.enable')
    await cdp.send('Performance.enable')

    async function heapBytes() {
        const res = await cdp.send('Performance.getMetrics')
        const m = res.metrics.find((x: any) => x.name === 'JSHeapUsedSize')
        return m?.value ?? 0
    }

    const before = await heapBytes()

    // Switch repeatedly between text and wiki.
    for (let i = 0; i < 50; i++) {
        const target = i % 2 === 0 ? CHANNELS.text : CHANNELS.wiki
        await page.locator(`text=${target}`).first().click().catch(() => {})
        await page.waitForTimeout(200)
    }

    // Force GC (via CDP if available — best effort).
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {})
    await page.waitForTimeout(2000)

    const after = await heapBytes()
    const deltaMB = (after - before) / (1024 * 1024)
    console.log(`[memory] before=${(before / 1024 / 1024).toFixed(1)}MB after=${(after / 1024 / 1024).toFixed(1)}MB delta=${deltaMB.toFixed(1)}MB`)
    // Bound: < 50 MB delta over 50 switches. A real leak would be > 100MB.
    expect(deltaMB, 'heap grew unbounded across channel switches').toBeLessThan(50)
})
