import { env } from './env'
import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

// Configure Neon to use WebSocket (Node.js environments)
if (typeof window === 'undefined') {
    neonConfig.webSocketConstructor = ws
}

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? (() => {
    const connectionString = env.DATABASE_URL
    const isPlaceholder = connectionString === "placeholder_url_replace_me"

    if (isPlaceholder && env.NODE_ENV === 'production') {
        console.error("❌ CRITICAL: DATABASE_URL is missing in production!")
    }

    const pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 15000, // 15s for extra stability
        idleTimeoutMillis: 10000,
        max: 5, // Allow small pooling
    })

    // Error handler to prevent pool from crashing process
    pool.on('error', (err) => console.error('Neon Pool Error', err))

    const adapter = new PrismaNeon(pool)
    const client = new PrismaClient({
        adapter,
        log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    })

    globalForPrisma.prisma = client
    return client
})()
