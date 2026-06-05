import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * [E2E Phase 2] Login each seeded user once and persist their session cookies
 * to e2e/.auth/<role>.json. Each per-role test project loads its storageState
 * and skips the login dance entirely.
 *
 * Run: `npx playwright test --project=setup` (or as a dependency of any project).
 */

const PASSWORD = 'e2e!Test2026'
const AUTH_DIR = path.join(process.cwd(), 'e2e', '.auth')

const ROLES = [
    { username: 'e2e_owner', file: 'owner.json' },
    { username: 'e2e_admin', file: 'admin.json' },
    { username: 'e2e_member1', file: 'member1.json' },
    { username: 'e2e_member2', file: 'member2.json' },
    { username: 'e2e_member3', file: 'member3.json' },
    { username: 'e2e_guest', file: 'guest.json' },
] as const

setup.beforeAll(() => {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
})

for (const r of ROLES) {
    setup(`auth: ${r.username}`, async ({ page, context }) => {
        await page.goto('/login')

        // [confirmed from src/app/login/page.tsx] field is name="emailOrUsername" (type=text).
        await page.locator('input[name="emailOrUsername"]').fill(r.username)
        await page.locator('input[name="password"]').fill(PASSWORD)

        // Submit — last <button> with text "Đăng nhập" is the form submit (the first one
        // with that text is the password visibility toggle wrapper / etc.).
        await page.getByRole('button', { name: /^đăng nhập$/i }).last().click()

        // Wait until we're off /login. Successful login lands on a workspace / admin /
        // dashboard — anything OTHER than /login or /api/*.
        await page.waitForURL((url) => !url.pathname.startsWith('/login') && !url.pathname.startsWith('/api/'), {
            timeout: 30_000,
        })

        // [Phase 3 warmup] Hit the chat surface once so the Neon connection pool is
        // already hot when the actual specs run — saves the 4-15s first-hit cost.
        // ROLES doesn't include CLIENT (portal user) so all entries here can warm /hub.
        try {
            await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
            const m = page.url().match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)
            if (m) {
                await page.goto(`/${m[1]}/hub`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
            }
        } catch {
            // Best-effort — if warmup fails the actual tests will retry.
        }

        await context.storageState({ path: path.join(AUTH_DIR, r.file) })
        expect(fs.existsSync(path.join(AUTH_DIR, r.file))).toBe(true)
    })
}
