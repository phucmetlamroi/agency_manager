const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const profile = await prisma.profile.findFirst({ where: { name: 'Hustly Team' } });
  const workspace = await prisma.workspace.findFirst({ where: { name: { contains: '3/2026' } } });
  const client = await prisma.client.findFirst({ where: { name: 'Zac' } });
  
  console.log('Profile:', profile?.id);
  console.log('Workspace:', workspace?.id);
  console.log('Client:', client?.id);
}

main().finally(() => prisma.$disconnect());
