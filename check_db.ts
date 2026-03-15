import { prisma } from './src/lib/db';

async function check() {
  const users = await prisma.user.findMany({
    where: { username: { in: ['Bao Phuc', 'Bảo Phúc'] } },
    select: { id: true, username: true, profileId: true }
  });
  console.log('Users:', users);

  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: ['legacy-feb-2026', 'legacy-mar-2026'] } },
    select: { id: true, name: true, profileId: true }
  });
  console.log('Workspaces:', workspaces);

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: { in: users.map(u => u.id) } }
  });
  console.log('Memberships:', memberships);
}

check();
