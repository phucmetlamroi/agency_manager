import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("Starting Migration to Workspaces...")

    // 1. Ensure Default Workspace Exists
    let defaultWorkspace = await prisma.workspace.findFirst({
        where: { name: 'Hệ Thống Cũ (Legacy)' }
    })

    if (!defaultWorkspace) {
        defaultWorkspace = await prisma.workspace.create({
            data: {
                name: 'Hệ Thống Cũ (Legacy)',
                description: 'Workspace mặc định chứa các dữ liệu trước đợt nâng cấp.'
            }
        })
        console.log(`Created Default Workspace: ${defaultWorkspace.id}`)
    } else {
        console.log(`Using existing Default Workspace: ${defaultWorkspace.id}`)
    }

    const wId = defaultWorkspace.id

    // 2. Migrate Users to WorkspaceMembers
    const users = await prisma.user.findMany()
    console.log(`Found ${users.length} users. Migrating WorkspaceMembers...`)
    let memberCount = 0
    for (const user of users) {
        // Check if member already exists
        const existingMember = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: user.id,
                    workspaceId: wId
                }
            }
        })

        if (!existingMember) {
            await prisma.workspaceMember.create({
                data: {
                    userId: user.id,
                    workspaceId: wId,
                    role: user.role === 'ADMIN' ? 'OWNER' : 'MEMBER'
                }
            })
            memberCount++
        }
    }
    console.log(`Created ${memberCount} new WorkspaceMember records.`)

    // 3. Backfill Tasks
    const tasks = await prisma.task.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${tasks.count} Tasks.`)

    // 4. Backfill Clients
    const clients = await prisma.client.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${clients.count} Clients.`)

    // 5. Backfill Projects
    const projects = await prisma.project.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${projects.count} Projects.`)

    // 6. Backfill Invoices
    const invoices = await prisma.invoice.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${invoices.count} Invoices.`)

    // 7. Backfill Payrolls
    const payrolls = await prisma.payroll.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${payrolls.count} Payrolls.`)

    // 8. Backfill PerformanceMetrics
    const metrics = await prisma.performanceMetric.updateMany({
        where: { workspaceId: null },
        data: { workspaceId: wId }
    })
    console.log(`Updated ${metrics.count} PerformanceMetrics.`)

    console.log("Migration Completed Successfully!")
}

main()
    .catch((e) => {
        console.error("Error running migration:", e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
