import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'
import * as dotenv from 'dotenv'

dotenv.config()

async function test() {
    console.log('Testing connection...')
    neonConfig.webSocketConstructor = ws
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const adapter = new PrismaNeon(pool)
    const prisma = new PrismaClient({ adapter })

    try {
        const count = await prisma.user.count()
        console.log('User count:', count)
    } catch (e) {
        console.error('Error:', e)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

test()
