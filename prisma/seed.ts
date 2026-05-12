import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * [Sprint Z] SaaS multi-tenant — no super admin. Users tự signup qua public form.
 * Seed file no-op (chỉ giữ skeleton để Prisma không error khi `prisma db seed` được gọi).
 *
 * Pre-Sprint Z behavior (đã loại bỏ):
 *   - Tạo user `admin` với role=ADMIN (super admin)
 *   - Tạo user `staff` với role=USER
 *
 * Nếu cần test data: dùng signup flow + admin-profile-actions.ts (Owner-gated).
 */
async function main() {
    console.log('🌱 [Sprint Z] Seeding no-op — SaaS model uses public signup. Skipping.')
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
