import { env } from './env'
import { PrismaClient } from '@prisma/client'
import { Pool } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? (() => {
    const connectionString = env.DATABASE_URL
    const isPlaceholder = connectionString === "placeholder_url_replace_me"

    if (isPlaceholder && env.NODE_ENV === 'production') {
        console.error("❌ CRITICAL: DATABASE_URL is missing in production!")
    }

    // Standard pool for Neon with better connection parameters
    const pool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    })

    pool.on('error', (err) => console.error('Neon Pool Error', err))

    const adapter = new PrismaNeon(pool)
    const client = new PrismaClient({
        adapter,
        log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    })

    if (env.NODE_ENV !== 'production') globalForPrisma.prisma = client
    return client
})()
