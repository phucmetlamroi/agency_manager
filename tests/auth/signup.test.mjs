import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Execute the real TypeScript modules with isolated dependency mocks. No DB,
// email, BotID service or production credentials are used by this suite.
function loadModule(path, dependencies = {}, globals = {}) {
    const filename = new URL(`../../${path}`, import.meta.url)
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    })
    const exports = {}
    runInNewContext(outputText, {
        exports,
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
            return dependencies[name]
        },
        console,
        process: { env: {} },
        setTimeout: callback => { callback(); return 0 },
        ...globals,
    }, { filename: filename.pathname })
    return exports
}

const input = {
    displayName: 'Signup Test', username: 'signup.test1', email: 'signup@example.com',
    password: 'test-only-password', acceptTos: true, honeypot: '',
}

const deployments = [
    ['self-hosted production', {}, false],
    ['Vercel production', { VERCEL: '1' }, true],
    ['Vercel preview', { VERCEL: '1', VERCEL_ENV: 'preview' }, true],
    ['disabled Vercel flag', { VERCEL: '0' }, false],
    ['Electron with inherited Vercel flag', { VERCEL: '1', ELECTRON_DESKTOP: '1' }, false],
]

for (const [name, env, enabled] of deployments) {
    test(`BotID rewrites and client instrumentation agree: ${name}`, async () => {
        const config = loadModule('next.config.ts', {
            'next-intl/plugin': () => config => config,
            'botid/next/config': createRequire(import.meta.url)('botid/next/config'),
        }, { process: { env } }).default
        const rewrites = await config.rewrites?.() ?? []
        assert.equal(rewrites.some(rule => rule.destination.includes('/bot-protection/')), enabled)
        let initCalls = 0
        loadModule('src/instrumentation-client.ts', {
            'botid/client/core': { initBotId({ protect }) {
                initCalls++
                assert.equal(protect[0].path, '/api/auth/signup')
                assert.equal(protect[0].method, 'POST')
            } },
        }, { process: { env: config.env } })
        assert.equal(initCalls, enabled ? 1 : 0)
    })
}

function signupAction({ env = {}, bot = false, limited = false } = {}) {
    const calls = []
    const create = model => ({ create: async () => { calls.push(model); return { id: model } } })
    const tx = Object.fromEntries(
        ['profile', 'user', 'workspace', 'workspaceMember', 'profileAccess', 'emailVerificationToken'].map(model => [model, create(model)]),
    )
    const { signupAction: action } = loadModule('src/actions/signup-actions.ts', {
        '@/lib/db': { prisma: {
            user: { findUnique: async () => null, findFirst: async () => null },
            $transaction: callback => callback(tx), auditLog: create('audit'),
        } },
        bcryptjs: { hash: async () => 'test-hash' },
        'next/headers': { headers: async () => new Headers() },
        crypto: { randomInt: () => 0 },
        '@/lib/otp': { generateRandomToken: () => 'test-token', hashToken: () => 'test-token-hash' },
        '@/lib/password-validator': { validatePasswordFull: async () => { calls.push('password'); return { valid: true } } },
        '@/lib/email-validator': { validateEmailForSignup: () => ({ valid: true }) },
        '@/lib/username-validation': { validateUsername: () => ({ valid: true }) },
        'botid/server': { checkBotId: async () => {
            calls.push('botid')
            assert.equal(env.VERCEL, '1', 'BotID must never run without Vercel request context')
            assert.ok(!env.ELECTRON_DESKTOP)
            return { isBot: bot }
        } },
        '@/lib/rate-limit-upstash': {
            checkSignupIp: async () => { calls.push('ip-limit'); return { success: !limited, retryAfter: limited ? 60 : undefined } },
            checkSignupEmail: async () => { calls.push('email-limit'); return { success: true } },
        },
        '@/lib/email': { sendEmail: async () => { calls.push('email') } },
        '@/lib/notification-emails/templates/auth/verify-email': { buildVerifyEmailEmail: () => ({ subject: 'test', html: 'test' }) },
    }, { process: { env: { NODE_ENV: 'production', ...env } } })
    return { action, calls }
}

for (const [name, env, enabled] of deployments) {
    test(`signup reaches account creation with correct BotID mode: ${name}`, async () => {
        const { action, calls } = signupAction({ env })
        assert.equal((await action(input)).success, true)
        assert.equal(calls.includes('botid'), enabled)
        for (const step of ['ip-limit', 'email-limit', 'password', 'user', 'profileAccess', 'workspaceMember', 'emailVerificationToken', 'email']) {
            assert.ok(calls.includes(step), `Missing signup step: ${step}`)
        }
    })
}

test('Vercel still rejects bots before creating an account', async () => {
    const { action, calls } = signupAction({ env: { VERCEL: '1' }, bot: true })
    assert.equal((await action(input)).success, false)
    assert.ok(!calls.includes('user'))
})

test('self-hosted signup still enforces rate limits', async () => {
    const { action, calls } = signupAction({ limited: true })
    const result = await action(input)
    assert.equal(result.success, false)
    assert.equal(result.retryAfter, 60)
    assert.ok(!calls.includes('user'))
})

test('honeypot still silently rejects signup', async () => {
    const { action, calls } = signupAction()
    assert.equal((await action({ ...input, honeypot: 'bot-filled' })).success, true)
    assert.equal(calls.length, 0)
})

async function submit(response) {
    const { submitSignup } = loadModule('src/lib/signup-client.ts', {}, {
        fetch: async (url, options) => {
            assert.equal(url, '/api/auth/signup')
            assert.equal(options.method, 'POST')
            assert.deepEqual(JSON.parse(options.body), input)
            if (response instanceof Error) throw response
            return response
        },
    })
    return submitSignup(input)
}

test('successful signup and inline validation remain supported', async () => {
    assert.equal((await submit(Response.json({ success: true }))).success, true)
    const result = await submit(Response.json({ success: false, errors: { email: 'Email không hợp lệ.' } }, { status: 400 }))
    assert.equal(result.errors.email, 'Email không hợp lệ.')
})

for (const status of [502, 504]) {
    test(`HTML proxy ${status} is reported as a service error, not a network failure`, async () => {
        const result = await submit(new Response('<html>Bad gateway</html>', { status }))
        assert.equal(result.success, false)
        assert.match(result.message, /Dịch vụ đăng ký/)
    })
}

test('rate limits preserve server guidance, with a fallback for non-JSON responses', async () => {
    const result = await submit(Response.json({ success: false, message: 'Thử lại sau 60 giây.' }, { status: 429 }))
    assert.equal(result.message, 'Thử lại sau 60 giây.')
    assert.match((await submit(new Response('', { status: 429 }))).message, /Quá nhiều yêu cầu/)
})

test('blocked responses and failed fetches have actionable messages', async () => {
    assert.match((await submit(new Response('', { status: 403 }))).message, /bị chặn/)
    assert.match((await submit(new TypeError('Failed to fetch'))).message, /Không thể gửi yêu cầu/)
})

test('malformed responses never claim signup succeeded', async () => {
    for (const data of [null, {}, { success: 'true' }, { success: false, errors: {} }]) {
        const result = await submit(Response.json(data))
        assert.equal(result.success, false)
        assert.ok(result.message)
    }
    assert.equal((await submit(Response.json({ success: true }, { status: 500 }))).success, false)
})
