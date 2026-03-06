import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function syncClientUsernames() {
    try {
        const users = await prisma.user.findMany({
            where: {
                role: 'CLIENT'
            }
        })

        const clients = await prisma.client.findMany()
        const clientMap = new Map(clients.map(c => [c.id.toString(), c.name]))

        const password = '123456'
        const hashedPassword = await bcrypt.hash(password, 10)

        console.log(`Processing ${users.length} client users...`)

        for (const user of users) {
            // Regex to match "client_[ID]_[TIMESTAMP]"
            const match = user.username.match(/^client_(\d+)_/)
            if (match) {
                const clientId = match[1]
                const clientName = clientMap.get(clientId)

                if (clientName) {
                    // Normalize username: lowercase, no spaces? 
                    // Or keep as is? User said "tên của khách hàng", usually names have spaces.
                    // But usernames often shouldn't. Let's use a URL-friendly/lowercase version or keep it readable.
                    // Actually, let's keep it readable but handle potential uniqueness issues.
                    let newUsername = clientName.trim()

                    // Check if another user already has this username (excluding the current one)
                    const existing = await prisma.user.findFirst({
                        where: {
                            username: newUsername,
                            id: { not: user.id }
                        }
                    })

                    if (existing) {
                        newUsername = `${newUsername}_${clientId}`
                    }

                    console.log(`Updating ${user.username} -> ${newUsername}`)

                    await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            username: newUsername,
                            password: hashedPassword,
                            plainPassword: password
                        }
                    })
                }
            } else if (user.username === 'test_client') {
                // Skip or update? Skip for now.
            }
        }

        console.log('Sync completed successfully.')

    } catch (err) {
        console.error('Error during sync:', err)
    } finally {
        await prisma.$disconnect()
    }
}

syncClientUsernames()
