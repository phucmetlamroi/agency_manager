import { z } from 'zod'

const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default("placeholder_url_replace_me"),
    JWT_SECRET: z.string().min(10).default("temporary-build-secret-key-change-me"),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2))
    // We don't throw here to avoid crashing the entire build/import process if some optional-ish vars are missing,
    // though Prisma will still fail if DATABASE_URL is truly missing.
}

export const env = parsed.success ? parsed.data : envSchema.parse({}) // Fallback to defaults if possible

if (env.JWT_SECRET === "temporary-build-secret-key-change-me" && env.NODE_ENV === 'production') {
    console.warn("⚠️  WARNING: Using default JWT_SECRET in PRODUCTION. Auth tokens will be insecure. Please set JWT_SECRET env var in Vercel.")
}

if (env.DATABASE_URL === "placeholder_url_replace_me" && env.NODE_ENV === 'production') {
    console.error("❌ ERROR: DATABASE_URL is not set in Vercel. Database operations will fail.")
}
