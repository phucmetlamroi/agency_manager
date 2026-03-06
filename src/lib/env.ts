import { z } from 'zod'

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("placeholder_url_replace_me"),
    JWT_SECRET: z.string().min(10).default("temporary-build-secret-key-change-me"),
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

if (env.JWT_SECRET === "temporary-build-secret-key-change-me" && env.NODE_ENV === 'production') {
    console.warn("⚠️  WARNING: JWT_SECRET is using DEFAULT value in production!")
}

if (env.DATABASE_URL === "placeholder_url_replace_me" && env.NODE_ENV === 'production') {
    console.error("❌ ERROR: No DATABASE_URL or POSTGRES_URL found in Vercel env!")
}
