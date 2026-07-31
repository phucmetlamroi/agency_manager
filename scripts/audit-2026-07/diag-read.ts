/** Why does page.evaluate fail on every authenticated screen? Capture the real exception. */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
    const OUT = process.env.AUDIT_OUT_DIR!
    const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
    const b = await chromium.launch()
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addCookies([{ name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' }])
    const p = await ctx.newPage()
    await p.goto(`http://localhost:3000/${s.workspaceId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(4000)

    try { console.log('evaluate  ->', await p.evaluate(() => document.title)) }
    catch (e) { console.log('evaluate  THROW ->', String(e).split('\n')[0].slice(0, 300)) }

    try { console.log('title()   ->', await p.title()) } catch (e) { console.log('title THROW ->', String(e).split('\n')[0].slice(0, 200)) }
    try { console.log('h1        ->', await p.locator('h1').first().innerText({ timeout: 5000 })) } catch (e) { console.log('h1 THROW ->', String(e).split('\n')[0].slice(0, 200)) }
    try { console.log('nav count ->', await p.locator('nav a, aside a').count()) } catch (e) { console.log('nav THROW ->', String(e).split('\n')[0].slice(0, 200)) }
    try { console.log('buttons   ->', await p.locator('button').count()) } catch (e) { console.log('btn THROW ->', String(e).split('\n')[0].slice(0, 200)) }
    try { console.log('body len  ->', (await p.locator('body').innerText({ timeout: 5000 })).length) } catch (e) { console.log('body THROW ->', String(e).split('\n')[0].slice(0, 200)) }

    await b.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
