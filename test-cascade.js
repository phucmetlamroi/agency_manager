const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { username: 'admin' } });
  const errorDict = await prisma.errorDictionary.findFirst();
  const workspace = await prisma.workspace.findFirst();
  
  if (!user || !errorDict || !workspace) {
    console.log('Admin user, ErrorDict, or Workspace not found');
    return;
  }

  console.log(`Using Workspace: ${workspace.id}`);

  console.log('Creating test task...');
  const task = await prisma.task.create({
    data: {
      title: 'TEST_CASCADE_TASK',
      status: 'Đang thực hiện',
      workspaceId: workspace.id
    }
  });
  console.log(`Created Task ID: ${task.id}`);

  console.log('Creating error log for task...');
  const log = await prisma.errorLog.create({
    data: {
      taskId: task.id,
      userId: user.id,
      errorId: errorDict.id,
      calculatedScore: 10,
      detectedById: user.id,
      workspaceId: workspace.id
    }
  });
  console.log(`Created ErrorLog ID: ${log.id}`);

  console.log('Deleting task...');
  await prisma.task.delete({ where: { id: task.id } });
  console.log('Task deleted.');

  console.log('Checking if ErrorLog still exists...');
  const checkLog = await prisma.errorLog.findUnique({ where: { id: log.id } });
  if (checkLog) {
    console.log('FAILED: ErrorLog still exists!');
  } else {
    console.log('SUCCESS: ErrorLog was deleted via cascade.');
  }
}

main().finally(() => prisma.$disconnect());
