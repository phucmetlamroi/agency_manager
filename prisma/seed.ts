import { PrismaClient, UserRole } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting seeding...')

    // 1. Create Super Admin
    const adminPassword = await bcrypt.hash('admin123', 10)
    const admin = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: adminPassword,
            plainPassword: 'admin123',
            role: UserRole.ADMIN,
            nickname: 'Super Admin',
            email: 'admin@example.com',
            reputation: 100,
        },
    })
    console.log('✅ Super Admin created/verified.')

    // 2. Create Default Agency
    const agency = await prisma.agency.upsert({
        where: { code: 'AGC-DEFAULT' },
        update: {},
        create: {
            name: 'Blazing Agency',
            code: 'AGC-DEFAULT',
            status: 'ACTIVE'
        }
    })
    console.log('✅ Default Agency created.')

    // 3. Create Agency Owner (if not exists)
    const ownerPass = await bcrypt.hash('owner123', 10)
    const owner = await prisma.user.upsert({
        where: { username: 'owner' },
        update: {},
        create: {
            username: 'owner',
            password: ownerPass,
            plainPassword: 'owner123',
            role: UserRole.AGENCY_ADMIN,
            nickname: 'Agency Boss',
            ownedAgency: {
                connect: { id: agency.id }
            },
            agencyId: agency.id
        }
    })
    console.log('✅ Agency Owner created.')

    // Link Owner to Agency explicitly if not done by relation
    if (!agency.ownerId) {
        await prisma.agency.update({
            where: { id: agency.id },
            data: { ownerId: owner.id }
        })
    }

    // 4. Create Staff Member
    const staffPass = await bcrypt.hash('staff123', 10)
    await prisma.user.upsert({
        where: { username: 'staff' },
        update: {},
        create: {
            username: 'staff',
            password: staffPass,
            plainPassword: 'staff123',
            role: UserRole.USER,
            nickname: 'Staff One',
            agencyId: agency.id
        }
    })
    console.log('✅ Staff created.')

    console.log('🏁 Seeding completed.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
