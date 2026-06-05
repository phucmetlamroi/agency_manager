/**
 * [E2E Phase 2] Shared seed-known fixtures + helpers. Keep IDs queryable by name
 * rather than hard-coded UUIDs so the tests are resilient to re-seeds (seed-e2e-
 * fixtures.ts is idempotent; re-running keeps the same usernames but UUIDs of new
 * Neon test-branch resets will differ).
 */

export const PASSWORD = 'e2e!Test2026'

export const USERS = {
    owner: { username: 'e2e_owner', displayName: 'Nguyễn Văn Đức (Owner)' },
    admin: { username: 'e2e_admin', displayName: 'Trần Thị Hồng (Admin)' },
    member1: { username: 'e2e_member1', displayName: 'Phạm Quốc Anh' },
    member2: { username: 'e2e_member2', displayName: 'Lê Thị Mai' },
    member3: { username: 'e2e_member3', displayName: 'Hoàng Văn Tú' },
    guest: { username: 'e2e_guest', displayName: 'Bùi Thị Lan' },
    client: { username: 'e2e_client', displayName: 'James (Client UK)' },
} as const

export const WORKSPACE_NAME = 'E2E Workspace'
export const CHANNELS = {
    text: 'e2e-text',
    wiki: 'e2e-wiki',
    forum: 'e2e-forum',
    adminsOnly: 'e2e-admins-only',
} as const

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Cached read of e2e/.auth/workspace-ids.json (written by seed-e2e-fixtures.ts).
 * Without this file (or in legacy mode), the helper falls back to URL scraping
 * which is brittle when a profile-member user has access to multiple workspaces.
 */
let _wsIds: { a: string; b: string; profileId?: string } | null | undefined

function loadWorkspaceIds(): { a: string; b: string; profileId?: string } | null {
    if (_wsIds !== undefined) return _wsIds ?? null
    try {
        const p = path.join(process.cwd(), 'e2e', '.auth', 'workspace-ids.json')
        if (!existsSync(p)) { _wsIds = null; return null }
        const parsed = JSON.parse(readFileSync(p, 'utf8')) as { a: string; b: string; profileId?: string }
        _wsIds = parsed
        return parsed
    } catch {
        _wsIds = null
        return null
    }
}

/**
 * Discover the E2E workspace ID. Prefers the deterministic file written by the
 * seed (`e2e/.auth/workspace-ids.json`) — picks workspace A by default. Falls
 * back to URL-scraping for legacy tests that ran before the seed wrote the file.
 *
 * Pass key='b' to target the cross-tenant workspace (IDOR probes).
 */
export async function discoverWorkspaceId(
    page: import('@playwright/test').Page,
    key: 'a' | 'b' = 'a',
): Promise<string> {
    const ids = loadWorkspaceIds()
    if (ids) return ids[key]

    // [Legacy fallback] file is missing — re-seed to populate. Tries URL match.
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const m = page.url().match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)
    if (m) return m[1]
    const link = page.locator('a[href*="/admin"]').first()
    if ((await link.count()) > 0) {
        const href = await link.getAttribute('href')
        const m2 = href?.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)
        if (m2) return m2[1]
    }
    throw new Error(
        'Could not discover workspace ID. Run `npx tsx scripts/seed-e2e-fixtures.ts` to write e2e/.auth/workspace-ids.json.',
    )
}
