const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Mocking the getWorkspacePrisma logic
function getWorkspacePrisma(workspaceId, profileId) {
    return prisma.$extends({
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!args) args = {};
                    const isBypassed = ['Profile', 'User', 'Workspace', 'Agency'].includes(model);
                    if (['findMany', 'groupBy'].includes(operation)) {
                        args.where = {
                            ...(args.where || {}),
                            ...(!isBypassed ? { workspaceId } : {}),
                            ...(profileId ? { profileId } : {})
                        };
                    }
                    return query(args);
                }
            }
        }
    });
}

async function main() {
  const workspaceId = '9efcc594-ee68-4b7b-91e4-c61e1ad6a00e'; // Get this from previous research
  const profileId = '194c0015-c31a-41ee-b607-35d88dfe443a'; // Carpe Diem
  
  const ctx = getWorkspacePrisma(workspaceId, profileId);

  const completed = await ctx.task.groupBy({
    by: ['assigneeId'],
    where: { status: 'Hoàn tất', assigneeId: { not: null } },
    _count: { id: true }
  });
  console.log('Completed:', completed);

  const errors = await ctx.errorLog.groupBy({
    by: ['userId'],
    _sum: { calculatedScore: true }
  });
  console.log('Errors:', errors);

  const userIds = [...new Set([...completed.map(t => t.assigneeId), ...errors.map(e => e.userId)])];
  console.log('User IDs:', userIds);

  const users = await ctx.user.findMany({
    where: { id: { in: userIds } }
  });
  console.log('Users found:', users.map(u => ({id: u.id, username: u.username, role: u.role})));
}

main().finally(() => prisma.$disconnect());
