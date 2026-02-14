
import { prisma } from '../src/lib/db'

async function main() {
    console.log('--- SEEDING BILLING PROFILE ---')

    // Check if one exists
    const count = await prisma.billingProfile.count()
    if (count > 0) {
        console.log('Billing Profile already exists.')
        return
    }

    const profile = await prisma.billingProfile.create({
        data: {
            profileName: 'Agency Default',
            beneficiaryName: 'Agency Manager LLC',
            bankName: 'Techcombank',
            accountNumber: '1903333333333',
            swiftCode: 'TCBVNVX',
            address: 'District 1, Ho Chi Minh City, Vietnam',
            isDefault: true
        }
    })

    console.log(`Created Billing Profile: ${profile.profileName} (ID: ${profile.id})`)
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect())
