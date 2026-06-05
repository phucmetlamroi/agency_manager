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

/**
 * Discover the E2E workspace ID from the sidebar after login. Tests then
 * navigate to `/${workspaceId}/hub` without depending on a hard-coded UUID.
 * Falls back to scraping the current URL if the sidebar isn't present.
 */
export async function discoverWorkspaceId(page: import('@playwright/test').Page): Promise<string> {
    // The workspace ID is in the URL right after login — go to root and observe.
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    const m = page.url().match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)
    if (m) return m[1]
    // Fallback: try /admin link in sidebar
    const link = page.locator('a[href*="/admin"]').first()
    if ((await link.count()) > 0) {
        const href = await link.getAttribute('href')
        const m2 = href?.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i)
        if (m2) return m2[1]
    }
    throw new Error('Could not discover workspace ID from URL or sidebar')
}
