import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Start seeding billing profiles...')

    const profileData = {
        profileName: 'VCB USD',
        beneficiaryName: 'DOAN VAN NHAT HUY',
        bankName: 'Joint Stock Commercial Bank for Foreign Trade of Vietnam (Vietcombank)',
        accountNumber: '1062074096',
        swiftCode: '', // User didn't provide specific SWIFT, leaving empty for now or could look it up (BFTV VN VX)
        address: '289 Ton Duc Thang, Tan An, Hoi An, Quang Nam',
        notes: 'Currency: USD\nDelivery Method: Bank deposit & debit card',
        isDefault: true,
    }

    // Check if exists
    const existing = await prisma.billingProfile.findFirst({
        where: { accountNumber: profileData.accountNumber }
    })

    if (existing) {
        console.log('Profile exists, updating...')
        await prisma.billingProfile.update({
            where: { id: existing.id },
            data: profileData
        })
    } else {
        // Unset other defaults if any
        await prisma.billingProfile.updateMany({
            where: { isDefault: true },
            data: { isDefault: false }
        })

        console.log('Creating new profile...')
        await prisma.billingProfile.create({
            data: profileData
        })
    }

    console.log('Seeding finished.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
