const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function simulateLayout(userId, workspaceId) {
    console.log(`Simulating query for UserId: ${userId} and WorkspaceId: ${workspaceId}`)

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
    })
    console.log('User Role from DB:', user?.role)

    const membership = await prisma.workspaceMember.findFirst({
        where: {
            userId: userId,
            workspaceId: workspaceId
        }
    })
    console.log('Membership found:', !!membership)
    if (membership) console.log('Membership details:', membership)
}

// IDs from previous script
const adminId = '9bb3cf99-3647-468c-be44-34f080b3be5d'
const legacyWorkspaceId = '6b06ba3e-07b9-46f2-8dbb-5f962a0a9782'

simulateLayout(adminId, legacyWorkspaceId)
    .catch(console.error)
    .finally(() => prisma.$disconnect())
