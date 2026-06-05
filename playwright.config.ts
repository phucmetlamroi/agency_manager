import { defineConfig, devices } from '@playwright/test'

/**
 * [E2E Phase 2] Playwright config for the Discord-benchmarked Chat playbook.
 *
 * Targets the local Next.js dev server (user runs `npm run dev` separately so
 * we can point DATABASE_URL at the Neon `test` branch). Auth state is created
 * once per role in `auth.setup.ts` and reused via storageState — single login
 * per role × N tests, not N logins.
 */
export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: false, // realtime tests rely on stable channel state — serialize until we add isolation
    workers: 1, // single worker so tests don't race over shared seed
    retries: process.env.CI ? 2 : 0,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'e2e/.report', open: 'never' }],
        ['json', { outputFile: 'e2e/.report/results.json' }],
    ],
    use: {
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
    },
    projects: [
        // Setup project — runs first, logs in each role, saves storage state.
        { name: 'setup', testMatch: /auth\.setup\.ts/ },

        // Anonymous (no auth) — login page, public surfaces.
        { name: 'anon', use: { ...devices['Desktop Chrome'] }, testMatch: /.*\.anon\.spec\.ts/, dependencies: ['setup'] },

        // Authenticated per role — reuses storageState from setup.
        {
            name: 'owner',
            use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/owner.json' },
            testMatch: /.*\.(owner|all)\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'admin',
            use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
            testMatch: /.*\.admin\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'member1',
            use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/member1.json' },
            testMatch: /.*\.member\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'member3',
            use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/member3.json' },
            testMatch: /.*\.member3\.spec\.ts/,
            dependencies: ['setup'],
        },
    ],
})
