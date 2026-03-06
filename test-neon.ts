import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

async function testConnection() {
    // Hardcoded URL from your .env for a direct test
    const connectionString = "postgresql://neondb_owner:npg_Va1R6XWdvOjM@ep-autumn-flower-ah1srq67.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

    console.log(`Connecting to Neon...`)

    const pool = new Pool({ connectionString })

    try {
        const start = Date.now()
        const res = await pool.query('SELECT NOW(), current_database()')
        console.log('✅ Connection Successful!')
        console.log('Database Name:', res.rows[0].current_database)

        const userCount = await pool.query('SELECT count(*) as count FROM "User"')
        console.log('User Count:', userCount.rows[0].count)

        const end = Date.now()
        console.log(`Response Time: ${end - start}ms`)

    } catch (err) {
        console.error('❌ Connection Failed!')
        console.error(err)
    } finally {
        await pool.end()
    }
}

testConnection()
