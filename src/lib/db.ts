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
    // Only initialize pool if we have a connection string
    const connectionString = env.DATABASE_URL
    const isPlaceholder = connectionString === "placeholder_url_replace_me"

    if (isPlaceholder && env.NODE_ENV === 'production') {
        console.error("❌ CRITICAL: DATABASE_URL is missing in production!")
    }

    // Use a slightly longer timeout and prevent too many idle connections
    const pool = new Pool({
        connectionString,
        connectionTimeoutMillis: 10000, // 10s
        idleTimeoutMillis: 30000,       // 30s
        max: 1                          // Limit connections per lambda instance
    })

    const adapter = new PrismaNeon(pool)
    const client = new PrismaClient({ adapter })

    // Cache the client globally to prevent connection leakage across lambda warm starts
    globalForPrisma.prisma = client
    return client
})()
