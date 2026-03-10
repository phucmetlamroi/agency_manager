import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Starting data migration...')

    // 1. Create Default Profile: "Hustly Team"
    let defaultProfile = await prisma.profile.findFirst({
        where: { name: 'Hustly Team' }
    })

    if (!defaultProfile) {
        console.log('Creating default profile: Hustly Team')
        defaultProfile = await prisma.profile.create({
            data: {
                name: 'Hustly Team',
                settings: {
                    theme: 'dark',
                    language: 'vi'
                }
            }
        })
    } else {
        console.log('Default profile "Hustly Team" already exists. Using ID:', defaultProfile.id)
    }

    const pId = defaultProfile.id

    // 2. Migrate existing records to this Profile
    console.log('Migrating Users...')
    const uRes = await prisma.user.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${uRes.count} Users.`)

    console.log('Migrating Workspaces...')
    const wRes = await prisma.workspace.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${wRes.count} Workspaces.`)

    console.log('Migrating Tasks...')
    const tRes = await prisma.task.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${tRes.count} Tasks.`)

    console.log('Migrating Clients...')
    const cRes = await prisma.client.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${cRes.count} Clients.`)

    console.log('Migrating Projects...')
    const prRes = await prisma.project.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${prRes.count} Projects.`)

    console.log('Migrating Invoices...')
    const iRes = await prisma.invoice.updateMany({
        where: { profileId: null },
        data: { profileId: pId }
    })
    console.log(`Updated ${iRes.count} Invoices.`)

    // Additional Tracking Models
    try {
        console.log('Migrating MonthlyBonus...')
        await prisma.monthlyBonus.updateMany({ where: { profileId: null }, data: { profileId: pId } })
        
        console.log('Migrating Payroll...')
        await prisma.payroll.updateMany({ where: { profileId: null }, data: { profileId: pId } })
        
        console.log('Migrating PayrollLock...')
        await prisma.payrollLock.updateMany({ where: { profileId: null }, data: { profileId: pId } })
        
        console.log('Migrating PerformanceMetric...')
        await prisma.performanceMetric.updateMany({ where: { profileId: null }, data: { profileId: pId } })
        
    } catch(e) {
        console.log("Error migrating tracking models (maybe none exist):", e)
    }

    console.log('Migration completed successfully!')
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
