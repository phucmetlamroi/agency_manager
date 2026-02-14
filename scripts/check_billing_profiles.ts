
import { prisma } from '../src/lib/db'

async function main() {
    console.log('--- BILLING PROFILES CHECK ---')
    const profiles = await prisma.billingProfile.findMany()
    console.log(`Found ${profiles.length} profiles.`)
    profiles.forEach(p => {
        console.log(`- [${p.id}] ${p.profileName} (Default: ${p.isDefault})`)
    })
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect())
