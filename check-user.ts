import { PrismaClient } from '@prisma/client'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

async function main() {
    const pool = new Pool({ connectionString: "postgresql://neondb_owner:npg_Va1R6XWdvOjM@ep-autumn-flower-ah1srq67.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" })
    const adapter = new PrismaNeon(pool)
    const prisma = new PrismaClient({ adapter })

    try {
        const user = await prisma.user.findUnique({
            where: { username: 'admin' },
            select: { id: true, username: true, role: true }
        })
        console.log('Result:', JSON.stringify(user))
    } catch (e) {
        console.error('Error:', e)
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

main()
