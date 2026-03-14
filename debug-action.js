const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAction(workspaceId, userId) {
    try {
        console.log(`Testing with workspaceId: ${workspaceId}, userId: ${userId}`);
        
        // Simulating the logic in getUserErrorDetails
        const dict = await prisma.errorDictionary.findMany({
            where: { isActive: true }
        });
        console.log(`Found ${dict.length} active dictionary entries.`);

        // Note: In the real app, we use getWorkspacePrisma which injects workspaceId filters.
        // Here we'll do it manually to see if the data exists.
        const errorLogsGrouped = await prisma.errorLog.groupBy({
            by: ['errorId'],
            where: { 
                userId: userId,
                workspaceId: workspaceId
            },
            _sum: { frequency: true, calculatedScore: true }
        });
        console.log(`Grouped error logs count: ${errorLogsGrouped.length}`);
        console.log('Grouped data:', JSON.stringify(errorLogsGrouped, null, 2));

        const logMap = new Map(errorLogsGrouped.map((entry) => [entry.errorId, entry]));
        
        const details = dict.map((d) => {
            const logEntry = logMap.get(d.id);
            return {
                errorId: d.id,
                code: d.code,
                description: d.description,
                totalFrequency: logEntry?._sum.frequency || 0,
                totalPenalty: logEntry?._sum.calculatedScore || 0
            };
        });

        console.log(`Resulting details length: ${details.length}`);
        const totalFreq = details.reduce((acc, curr) => acc + curr.totalFrequency, 0);
        console.log(`Total frequency in details: ${totalFreq}`);
        
    } catch (error) {
        console.error('Error during testAction:', error);
    }
}

// From the user's screenshot, it seems "Bao Phuc" is the user. 
// I need "Bao Phuc"'s ID and the workspaceId.
async function findIds() {
    const user = await prisma.user.findFirst({ where: { username: "Bao Phuc" } });
    const workspace = await prisma.workspace.findFirst({ where: { name: "Tháng 3/2026" } });
    
    if (user && workspace) {
        await testAction(workspace.id, user.id);
    } else {
        console.log('User or Workspace not found');
        if (!user) console.log('User "Bao Phuc" not found');
        if (!workspace) console.log('Workspace "Tháng 3/2026" not found');
    }
}

findIds().catch(console.error);
