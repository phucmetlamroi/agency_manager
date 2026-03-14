const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  console.log('Admin user:', JSON.stringify(user, null, 2));
}

main().finally(() => prisma.$disconnect());
