import { z } from 'zod'

const JWT_SECRET_DEFAULT = "temporary-build-secret-key-change-me"

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("placeholder_url_replace_me"),
    JWT_SECRET: z.string().min(10).default(JWT_SECRET_DEFAULT),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Helper to clean quotes that users might copy-paste into Vercel
const cleanEnvValue = (val: string | undefined) => {
    if (!val) return val
    return val.trim().replace(/^['"](.*)['"]$/, '$1')
}

const rawEnv = {
    ...process.env,
    DATABASE_URL: cleanEnvValue(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    JWT_SECRET: cleanEnvValue(process.env.JWT_SECRET)
}

const parsed = envSchema.safeParse(rawEnv)

if (!parsed.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2))
}

export const env = parsed.success ? parsed.data : envSchema.parse({})

// [AUDIT R1 — CRITICAL fix] Fail CLOSED at runtime in production if JWT_SECRET is
// missing or the public, source-controlled placeholder. Booting on the placeholder
// lets anyone forge session JWTs (full auth bypass / impersonation of any role).
// We still allow the build phase (next build) to run on the placeholder so a deploy
// doesn't break when the real secret is only injected at runtime.
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE && env.JWT_SECRET === JWT_SECRET_DEFAULT) {
    throw new Error(
        '[env] JWT_SECRET is unset or set to the default placeholder in production. ' +
        'Set a strong, secret JWT_SECRET. Refusing to start (fail closed).'
    )
}

if (env.DATABASE_URL === "placeholder_url_replace_me" && env.NODE_ENV === 'production') {
    console.error("❌ ERROR: No DATABASE_URL or POSTGRES_URL found in Vercel env!")
}

// [AUDIT P5-005] Fail CLOSED on an Inngest misconfiguration in production. A truthy INNGEST_DEV
// puts the /api/inngest handler into dev mode, which SKIPS webhook signature verification — anyone
// could then POST-invoke background functions (including the destructive review-janitor that hard-
// deletes Mux assets / R2 objects / DB rows). It must never be set in prod. Mirrors the JWT_SECRET
// fail-closed guard above. (Default = unset = cloud mode = signature required = safe.)
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE) {
    const inngestDev = (process.env.INNGEST_DEV || '').trim().toLowerCase()
    if (inngestDev === '1' || inngestDev === 'true') {
        throw new Error(
            '[env] INNGEST_DEV is truthy in production — this disables Inngest webhook signature ' +
            'verification. Unset it. Refusing to start (fail closed).'
        )
    }
    if (!process.env.INNGEST_SIGNING_KEY) {
        console.error('[env] INNGEST_SIGNING_KEY is not set in production — Inngest cloud mode requires it for signed webhooks.')
    }
}
