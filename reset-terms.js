const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.user.updateMany({
        where: { role: { not: 'ADMIN' } },
        data: { hasAcceptedTerms: false }
    });
    console.log("Đã reset cờ ToS cho toàn bộ user (trừ ADMIN).");
}
main().catch(console.error).finally(() => prisma.$disconnect());
