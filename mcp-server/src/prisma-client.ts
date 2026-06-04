/**
 * Prisma singleton for MCP server.
 * Mirrors src/lib/db.ts pattern but without Next.js dependencies.
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? (() => {
    const connectionString = process.env.MCP_DATABASE_URL || process.env.DATABASE_URL

    if (!connectionString) {
        console.error('[MCP] CRITICAL: No database URL found. Set MCP_DATABASE_URL or DATABASE_URL.')
        process.exit(1)
    }

    const client = new PrismaClient({
        datasources: {
            db: { url: connectionString },
        },
        log: process.env.MCP_DEBUG === '1' ? ['query', 'error', 'warn'] : ['error'],
    })

    globalForPrisma.prisma = client
    return client
})()
