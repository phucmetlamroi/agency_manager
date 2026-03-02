import { z } from 'zod'

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("placeholder_url_replace_me"),
    JWT_SECRET: z.string().min(10).default("temporary-build-secret-key-change-me"),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

// Support Vercel/Neon POSTGRES_URL as a fallback for DATABASE_URL
const rawEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL
}

const parsed = envSchema.safeParse(rawEnv)

if (!parsed.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2))
}

export const env = parsed.success ? parsed.data : envSchema.parse({})

if (env.JWT_SECRET === "temporary-build-secret-key-change-me" && env.NODE_ENV === 'production') {
    console.warn("⚠️  WARNING: Using default JWT_SECRET in PRODUCTION. Please set JWT_SECRET env var in Vercel.")
}

if (env.DATABASE_URL === "placeholder_url_replace_me" && env.NODE_ENV === 'production') {
    console.error("❌ ERROR: DATABASE_URL (hoặc POSTGRES_URL) is not set in Vercel. Database operations will fail.")
}
