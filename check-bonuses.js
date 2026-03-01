const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBonuses() {
    const bonuses = await prisma.monthlyBonus.findMany({
        where: { month: 2, year: 2026 },
        include: { user: { select: { username: true, role: true } } }
    });

    console.log(`Found ${bonuses.length} bonuses for Feb 2026:`);
    bonuses.forEach(b => {
        console.log(`- [${b.user.username}] Rank: ${b.rank}, Role: ${b.user.role}, Amount: ${b.bonusAmount}`);
    });
}

checkBonuses()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
