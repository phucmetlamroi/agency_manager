import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== PROBE: User 'Pullio' (mhuy05122003@gmail.com) in 'Kẻ Cô Độc' profile ===\n");

  // 1. Find user Pullio by email
  const user = await prisma.user.findFirst({
    where: { email: "mhuy05122003@gmail.com" },
    select: {
      id: true,
      username: true,
      email: true,
      profileId: true,
      nickname: true,
      displayName: true,
    },
  });

  console.log("--- Q1: Does user Pullio exist? ---");
  if (user) {
    console.log(`  YES. userId: ${user.id}`);
    console.log(`  username: ${user.username}`);
    console.log(`  displayName: ${user.displayName}`);
    console.log(`  nickname: ${user.nickname}`);
    console.log(`  email: ${user.email}`);
    console.log(`  profileId (User.profileId): ${user.profileId}`);
  } else {
    console.log("  NO user found with email mhuy05122003@gmail.com");
    // Try by username
    const byUsername = await prisma.user.findFirst({
      where: { username: { contains: "Pullio", mode: "insensitive" } },
      select: { id: true, username: true, email: true, profileId: true },
    });
    if (byUsername) {
      console.log(`  Found by username search: ${JSON.stringify(byUsername, null, 2)}`);
    } else {
      console.log("  Also not found by username 'Pullio'.");
    }
    await prisma.$disconnect();
    return;
  }

  // 2. Find "Kẻ Cô Độc" profile
  console.log("\n--- Q2: Does 'Kẻ Cô Độc' profile exist? ---");
  const profile = await prisma.profile.findFirst({
    where: { name: { contains: "Kẻ Cô Độc" } },
    select: { id: true, name: true, status: true },
  });

  if (profile) {
    console.log(`  YES. profileId: ${profile.id}`);
    console.log(`  name: ${profile.name}`);
    console.log(`  status: ${profile.status}`);
  } else {
    console.log("  NO profile found with name containing 'Kẻ Cô Độc'.");
    // List all profiles for reference
    const allProfiles = await prisma.profile.findMany({
      select: { id: true, name: true },
      take: 20,
    });
    console.log("  All profiles:", JSON.stringify(allProfiles, null, 2));
    await prisma.$disconnect();
    return;
  }

  // 3. Does Pullio have a WorkspaceMember row in any workspace belonging to "Kẻ Cô Độc"?
  console.log("\n--- Q3: WorkspaceMember rows for Pullio in 'Kẻ Cô Độc' workspaces? ---");
  const kcdWorkspaces = await prisma.workspace.findMany({
    where: { profileId: profile.id },
    select: { id: true, name: true, status: true },
  });
  console.log(`  'Kẻ Cô Độc' has ${kcdWorkspaces.length} workspace(s):`);
  for (const ws of kcdWorkspaces) {
    console.log(`    - ${ws.name} (id: ${ws.id}, status: ${ws.status})`);
  }

  const memberRows = await prisma.workspaceMember.findMany({
    where: {
      userId: user.id,
      workspaceId: { in: kcdWorkspaces.map((w) => w.id) },
    },
    include: { workspace: { select: { name: true } } },
  });

  if (memberRows.length > 0) {
    console.log(`  YES. Pullio has ${memberRows.length} WorkspaceMember row(s):`);
    for (const m of memberRows) {
      console.log(`    - workspace: ${m.workspace.name}, role: ${m.role}, joinedAt: ${m.joinedAt}`);
    }
  } else {
    console.log("  NO WorkspaceMember rows for Pullio in any 'Kẻ Cô Độc' workspace.");
  }

  // 4. Does Pullio have a ProfileAccess row for "Kẻ Cô Độc"?
  console.log("\n--- Q4: ProfileAccess row for Pullio → 'Kẻ Cô Độc'? ---");
  const profileAccess = await prisma.profileAccess.findUnique({
    where: {
      userId_profileId: { userId: user.id, profileId: profile.id },
    },
  });

  if (profileAccess) {
    console.log(`  YES. ProfileAccess exists:`);
    console.log(`    role: ${profileAccess.role}`);
    console.log(`    grantedAt: ${profileAccess.grantedAt}`);
  } else {
    console.log("  NO ProfileAccess row for Pullio in 'Kẻ Cô Độc'.");
  }

  // 5. Would Pullio appear in workspace user queries?
  console.log("\n--- Q5: Would Pullio appear in findMany queries for 'Kẻ Cô Độc' workspaces? ---");
  const userProfileIdMatch = user.profileId === profile.id;
  console.log(`  User.profileId matches 'Kẻ Cô Độc' profileId? ${userProfileIdMatch}`);
  console.log(`    (User.profileId = ${user.profileId}, Profile.id = ${profile.id})`);
  console.log(`  Has ProfileAccess for 'Kẻ Cô Độc'? ${!!profileAccess}`);
  console.log(`  Has WorkspaceMember in 'Kẻ Cô Độc' workspaces? ${memberRows.length > 0}`);

  console.log("\n  CONCLUSION:");
  if (userProfileIdMatch || profileAccess || memberRows.length > 0) {
    console.log("  YES - Pullio WOULD appear in queries for 'Kẻ Cô Độc' workspaces because:");
    if (userProfileIdMatch) console.log("    - User.profileId directly matches the profile");
    if (profileAccess) console.log(`    - Has ProfileAccess (role: ${profileAccess.role})`);
    if (memberRows.length > 0) console.log("    - Has explicit WorkspaceMember row(s)");
  } else {
    console.log("  NO - Pullio would NOT appear. They have:");
    console.log("    - No User.profileId match");
    console.log("    - No ProfileAccess row");
    console.log("    - No WorkspaceMember row in any 'Kẻ Cô Độc' workspace");
  }

  // Bonus: Check what profile Pullio IS linked to
  if (user.profileId && user.profileId !== profile.id) {
    const linkedProfile = await prisma.profile.findUnique({
      where: { id: user.profileId },
      select: { id: true, name: true },
    });
    console.log(`\n  [BONUS] Pullio's User.profileId links to: ${linkedProfile?.name || "UNKNOWN"} (${user.profileId})`);
  }

  // Bonus: Check all ProfileAccess rows for Pullio
  const allAccess = await prisma.profileAccess.findMany({
    where: { userId: user.id },
    include: { profile: { select: { name: true } } },
  });
  if (allAccess.length > 0) {
    console.log(`\n  [BONUS] All ProfileAccess rows for Pullio (${allAccess.length}):`);
    for (const a of allAccess) {
      console.log(`    - profile: ${a.profile.name} (${a.profileId}), role: ${a.role}, grantedAt: ${a.grantedAt}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
