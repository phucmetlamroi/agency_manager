import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createTestClient() {
    try {
        const workspace = await prisma.workspace.findFirst()
        if (!workspace) {
            console.error('No workspace found')
            return
        }

        const username = 'test_client'
        const password = 'client123'
        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await prisma.user.upsert({
            where: { username },
            update: {
                password: hashedPassword,
                plainPassword: password,
                role: 'CLIENT'
            },
            create: {
                username,
                password: hashedPassword,
                plainPassword: password,
                role: 'CLIENT'
            }
        })

        await prisma.workspaceMember.upsert({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId: workspace.id
                }
            },
            update: {
                role: 'GUEST'
            },
            create: {
                userId: user.id,
                workspaceId: workspace.id,
                role: 'GUEST'
            }
        })

        console.log(`Test client created/updated:`)
        console.log(`Username: ${username}`)
        console.log(`Password: ${password}`)
        console.log(`Workspace: ${workspace.name} (${workspace.id})`)

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

createTestClient()
