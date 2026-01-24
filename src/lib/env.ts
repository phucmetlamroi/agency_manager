import { z } from 'zod'

const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    // Default value added to prevents build failure if user forgets to set env var in Vercel.
    // WARNING: In production, you should set this variable!
    JWT_SECRET: z.string().min(10).default("temporary-build-secret-key-change-me"),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export const env = envSchema.parse(process.env)

if (env.JWT_SECRET === "temporary-build-secret-key-change-me") {
    console.warn("⚠️  WARNING: Using default JWT_SECRET. Auth tokens will be invalid if server restarts or key changes. Please set JWT_SECRET env var in Vercel.")
}
