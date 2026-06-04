import { PrismaClient } from '@prisma/client'
import { env } from './env'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? (() => {
    const connectionString = env.DATABASE_URL
    const isPlaceholder = connectionString === "placeholder_url_replace_me"

    if (isPlaceholder && env.NODE_ENV === 'production') {
        console.error("❌ CRITICAL: DATABASE_URL is missing in production!")
    }

    // Standard Prisma Client for Node.js runtime (Vercel standard functions)
    // We avoid @neondatabase/serverless Pool here to prevent hangs in standard environments
    const client = new PrismaClient({
        datasources: {
            db: {
                url: connectionString,
            },
        },
        log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    })

    // Always cache the singleton — prevents creating multiple PrismaClient
    // instances (and therefore multiple DB connection pools) in production.
    // The original guard (`!== 'production'`) was a Next.js hot-reload
    // pattern, but in Electron's standalone server the module system is
    // stable, so caching is both safe and necessary.
    globalForPrisma.prisma = client

    return client
})()
