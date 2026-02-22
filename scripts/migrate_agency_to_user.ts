
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🚀 Starting Agency to User Migration...')

    // 1. Get all Agencies
    const agencies = await prisma.agency.findMany({
        include: {
            owner: true,
            tasks: true
        }
    })

    console.log(`Found ${agencies.length} agencies to migrate.`)

    for (const agency of agencies) {
        console.log(`\nProcessing Agency: ${agency.name} (Code: ${agency.code})`)
        const ownerId = agency.ownerId

        // 2. Handle Tasks
        // Tasks currently assigned to this agency
        const agencyTasks = await prisma.task.findMany({
            where: { assignedAgencyId: agency.id }
        })

        console.log(`- Found ${agencyTasks.length} tasks in Agency Pool.`)

        for (const task of agencyTasks) {
            let updateData: any = {
                assignedAgencyId: null // Clear Agency Link
            }

            // Logic: "Bảo toàn dữ liệu về task họ đã nhận"
            // If task is in Agency Pool (Assignee = NULL), we assign it to the Owner
            // so they don't lose "ownership" of the task.
            if (!task.assigneeId && ownerId) {
                console.log(`  > Task "${task.title}" is unassigned. Assigning to Owner (${agency.owner?.username}).`)
                updateData.assigneeId = ownerId
                updateData.status = 'Đã nhận task' // Ensure valid status for assignee
            } else {
                console.log(`  > Task "${task.title}" already has assignee. Keeping assignment, clearing agency link.`)
            }

            await prisma.task.update({
                where: { id: task.id },
                data: updateData
            })
        }

        // 3. Delete Agency Record (Optional, but clean)
        // We need to clear user references first
    }

    // 4. Update Users (Global Sweep)
    console.log('\n🔄 Updating User Roles and Clearing Agency References...')

    // Reset Rules
    const updateResult = await prisma.user.updateMany({
        where: {
            OR: [
                { role: 'AGENCY_ADMIN' },
                { agencyId: { not: null } }
            ]
        },
        data: {
            role: 'USER',
            agencyId: null
        }
    })

    console.log(`Updated ${updateResult.count} users to normal USER role.`)

    // 5. Delete Agencies
    // Now that users and tasks are unlinked, we can delete the agencies
    const deleteResult = await prisma.agency.deleteMany({})
    console.log(`Deleted ${deleteResult.count} agency records.`)

    console.log('\n✅ Migration Complete!')
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
