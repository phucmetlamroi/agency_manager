const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const dict = await prisma.errorDictionary.findMany({
        where: { isActive: true }
    });
    console.log('Active Dictionary:', JSON.stringify(dict, null, 2));

    const errorLogs = await prisma.errorLog.findMany();
    console.log('Error Logs:', JSON.stringify(errorLogs, null, 2));
}

main().catch(console.error);
