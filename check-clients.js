const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const clients = await prisma.client.findMany({
        select: { name: true, workspaceId: true, profileId: true }
    });
    console.log('Clients:', JSON.stringify(clients, null, 2));
}

main().catch(console.error);
