/**
 * [E2E Phase 2] Seed deterministic test fixtures into the Neon `test` branch.
 *
 * Creates ONLY new rows prefixed `e2e_` — never deletes / never mutates existing
 * data. Safe to re-run (idempotent: upsert by username / unique key).
 *
 * After seed completes, tests can log in as `e2e_owner` / `e2e_admin` / ... with
 * password `e2e!Test2026` and operate on workspace `e2e-workspace`.
 *
 *   $env:DATABASE_URL = "<test branch URL>"
 *   npx tsx scripts/seed-e2e-fixtures.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const PASSWORD = 'e2e!Test2026'

interface UserSpec {
    username: string
    displayName: string
    profileRole: 'OWNER' | 'ADMIN' | 'USER' | 'CLIENT'
    workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST' | null // null = not in workspace (e.g. client)
}

const USERS: UserSpec[] = [
    { username: 'e2e_owner', displayName: 'Nguyễn Văn Đức (Owner)', profileRole: 'OWNER', workspaceRole: 'OWNER' },
    { username: 'e2e_admin', displayName: 'Trần Thị Hồng (Admin)', profileRole: 'ADMIN', workspaceRole: 'ADMIN' },
    { username: 'e2e_member1', displayName: 'Phạm Quốc Anh', profileRole: 'USER', workspaceRole: 'MEMBER' },
    { username: 'e2e_member2', displayName: 'Lê Thị Mai', profileRole: 'USER', workspaceRole: 'MEMBER' },
    { username: 'e2e_member3', displayName: 'Hoàng Văn Tú', profileRole: 'USER', workspaceRole: 'MEMBER' },
    { username: 'e2e_guest', displayName: 'Bùi Thị Lan', profileRole: 'USER', workspaceRole: 'GUEST' },
    { username: 'e2e_client', displayName: 'James (Client UK)', profileRole: 'CLIENT', workspaceRole: null },
]

async function findOrCreateProfile(name: string) {
    const existing = await prisma.profile.findFirst({ where: { name } })
    if (existing) return existing
    return prisma.profile.create({ data: { name } })
}

async function findOrCreateWorkspace(name: string, profileId: string) {
    const existing = await prisma.workspace.findFirst({ where: { name, profileId } })
    if (existing) return existing
    return prisma.workspace.create({ data: { name, profileId } })
}

async function upsertUser(spec: UserSpec, hashed: string, profileId: string) {
    return prisma.user.upsert({
        where: { username: spec.username },
        update: { displayName: spec.displayName, emailVerified: true, hasCompletedEmailMigration: true, usernameSetByUser: true, profileId },
        create: {
            username: spec.username,
            password: hashed,
            displayName: spec.displayName,
            email: `${spec.username}@e2e.local`,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            hasCompletedEmailMigration: true,
            usernameSetByUser: true,
            authProvider: 'email',
            hasAcceptedTerms: true,
            termsAcceptedAt: new Date(),
            profileId,
            role: 'USER',
        },
    })
}

async function ensureProfileAccess(userId: string, profileId: string, role: UserSpec['profileRole']) {
    await prisma.profileAccess.upsert({
        where: { userId_profileId: { userId, profileId } },
        update: { role },
        create: { userId, profileId, role },
    })
}

async function ensureWorkspaceMember(userId: string, workspaceId: string, role: string) {
    await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId, workspaceId } },
        update: { role },
        create: { userId, workspaceId, role },
    })
}

async function ensureCategory(workspaceId: string, profileId: string, name: string, position: number) {
    const existing = await prisma.category.findFirst({ where: { workspaceId, name } })
    if (existing) return existing
    return prisma.category.create({ data: { workspaceId, profileId, name, position } })
}

async function ensureChannel(opts: {
    workspaceId: string
    profileId: string
    name: string
    type: 'TEXT' | 'WIKI' | 'FORUM'
    createdById: string
    categoryId?: string | null
    postPolicy?: 'EVERYONE' | 'ADMINS_ONLY'
}) {
    const existing = await prisma.channel.findFirst({ where: { workspaceId: opts.workspaceId, name: opts.name, type: opts.type } })
    if (existing) return existing
    const position = await prisma.channel.count({ where: { workspaceId: opts.workspaceId } })
    return prisma.channel.create({
        data: {
            workspaceId: opts.workspaceId,
            profileId: opts.profileId,
            name: opts.name,
            type: opts.type,
            visibility: 'PRIVATE',
            postPolicy: opts.postPolicy ?? 'EVERYONE',
            position,
            createdById: opts.createdById,
            categoryId: opts.categoryId ?? null,
        },
    })
}

async function ensureChannelMember(channelId: string, userId: string, workspaceId: string, profileId: string, role: 'MEMBER' | 'MODERATOR') {
    await prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        update: { role },
        create: { channelId, userId, workspaceId, profileId, role },
    })
}

async function ensureCustomRole(workspaceId: string, profileId: string, name: string, color: string, position: number) {
    const existing = await prisma.customRole.findFirst({ where: { workspaceId, name } })
    if (existing) return existing
    return prisma.customRole.create({ data: { workspaceId, profileId, name, color, position } })
}

async function ensureRoleMember(roleId: string, userId: string, workspaceId: string) {
    await prisma.customRoleMember.upsert({
        where: { roleId_userId: { roleId, userId } },
        update: {},
        create: { roleId, userId, workspaceId },
    })
}

async function ensureOverwrite(channelId: string, workspaceId: string, subjectType: 'ROLE' | 'USER', subjectId: string, allow: string, deny: string) {
    await prisma.channelOverwrite.upsert({
        where: { channelId_subjectType_subjectId: { channelId, subjectType, subjectId } },
        update: { allow, deny },
        create: { channelId, workspaceId, subjectType, subjectId, allow, deny },
    })
}

async function main() {
    console.log('[E2E seed] start. password for all users: ' + PASSWORD)

    const hashed = await bcrypt.hash(PASSWORD, 10)

    // 1. Profile
    const profile = await findOrCreateProfile('E2E Test Profile')
    console.log(`  profile: ${profile.id} "${profile.name}"`)

    // 2. Users + ProfileAccess
    const users: Record<string, { id: string; username: string; spec: UserSpec }> = {}
    for (const spec of USERS) {
        const u = await upsertUser(spec, hashed, profile.id)
        await ensureProfileAccess(u.id, profile.id, spec.profileRole)
        users[spec.username] = { id: u.id, username: u.username, spec }
        console.log(`  user: ${spec.username} (${spec.profileRole}) ${u.id}`)
    }

    // 3. Workspace
    const workspace = await findOrCreateWorkspace('E2E Workspace', profile.id)
    console.log(`  workspace: ${workspace.id} "${workspace.name}"`)

    // 4. WorkspaceMember (skip CLIENT user — they belong to portal, not workspace)
    for (const spec of USERS) {
        if (spec.workspaceRole) {
            await ensureWorkspaceMember(users[spec.username].id, workspace.id, spec.workspaceRole)
        }
    }

    // 5. Category
    const category = await ensureCategory(workspace.id, profile.id, 'E2E Suite', 0)

    // 6. Channels
    const ownerId = users['e2e_owner'].id
    const adminId = users['e2e_admin'].id
    const m1 = users['e2e_member1'].id
    const m2 = users['e2e_member2'].id
    const m3 = users['e2e_member3'].id

    const text = await ensureChannel({ workspaceId: workspace.id, profileId: profile.id, name: 'e2e-text', type: 'TEXT', createdById: ownerId, categoryId: category.id })
    const wiki = await ensureChannel({ workspaceId: workspace.id, profileId: profile.id, name: 'e2e-wiki', type: 'WIKI', createdById: ownerId, categoryId: category.id })
    const forum = await ensureChannel({ workspaceId: workspace.id, profileId: profile.id, name: 'e2e-forum', type: 'FORUM', createdById: ownerId, categoryId: category.id })
    const adminsOnly = await ensureChannel({ workspaceId: workspace.id, profileId: profile.id, name: 'e2e-admins-only', type: 'TEXT', createdById: ownerId, categoryId: category.id, postPolicy: 'ADMINS_ONLY' })

    console.log(`  channels: text=${text.id} wiki=${wiki.id} forum=${forum.id} adminsOnly=${adminsOnly.id}`)

    // 7. Channel membership
    // text: owner (MOD), admin, member1, member2 — NOT member3, NOT guest
    for (const [u, r] of [[ownerId, 'MODERATOR'], [adminId, 'MEMBER'], [m1, 'MEMBER'], [m2, 'MEMBER']] as const) {
        await ensureChannelMember(text.id, u, workspace.id, profile.id, r)
    }
    // wiki: all staff
    for (const [u, r] of [[ownerId, 'MODERATOR'], [adminId, 'MEMBER'], [m1, 'MEMBER'], [m2, 'MEMBER'], [m3, 'MEMBER']] as const) {
        await ensureChannelMember(wiki.id, u, workspace.id, profile.id, r)
    }
    // forum: owner + member1 + member2 (member3 excluded — used to test access denial)
    for (const [u, r] of [[ownerId, 'MODERATOR'], [m1, 'MEMBER'], [m2, 'MEMBER']] as const) {
        await ensureChannelMember(forum.id, u, workspace.id, profile.id, r)
    }
    // adminsOnly: owner + admin + all members
    for (const [u, r] of [[ownerId, 'MODERATOR'], [adminId, 'MEMBER'], [m1, 'MEMBER'], [m2, 'MEMBER'], [m3, 'MEMBER']] as const) {
        await ensureChannelMember(adminsOnly.id, u, workspace.id, profile.id, r)
    }

    // 8. Custom roles
    const editor = await ensureCustomRole(workspace.id, profile.id, 'E2E Editor', '#a78bfa', 0)
    const reviewer = await ensureCustomRole(workspace.id, profile.id, 'E2E Reviewer', '#60a5fa', 1)
    await ensureRoleMember(editor.id, m1, workspace.id)
    await ensureRoleMember(editor.id, m2, workspace.id)
    await ensureRoleMember(reviewer.id, m3, workspace.id)
    console.log(`  roles: editor=${editor.id} (m1,m2) reviewer=${reviewer.id} (m3)`)

    // 9. Channel overwrite matrix — covers the ALLOW/DENY × VIEW/POST/MANAGE combos
    //    needed for Phase 4 cells from playbook. We seed on a dedicated overwrite-test
    //    channel so the regular happy-path tests on `e2e-text` aren't disturbed.

    // Reviewer role on `e2e-text`: ALLOW VIEW + DENY POST (regression — kept).
    await ensureOverwrite(text.id, workspace.id, 'ROLE', reviewer.id, 'VIEW', 'POST')

    // Dedicated overwrite test channel (e2e-overwrites) — owner only by default;
    // we add per-row overwrites that the Phase 4 spec asserts directly.
    const overwriteChannel = await ensureChannel({
        workspaceId: workspace.id, profileId: profile.id,
        name: 'e2e-overwrites', type: 'TEXT', createdById: ownerId, categoryId: category.id,
    })
    await ensureChannelMember(overwriteChannel.id, ownerId, workspace.id, profile.id, 'MODERATOR')
    await ensureChannelMember(overwriteChannel.id, adminId, workspace.id, profile.id, 'MEMBER')
    await ensureChannelMember(overwriteChannel.id, m1, workspace.id, profile.id, 'MEMBER')
    await ensureChannelMember(overwriteChannel.id, m2, workspace.id, profile.id, 'MEMBER')
    await ensureChannelMember(overwriteChannel.id, m3, workspace.id, profile.id, 'MEMBER')

    // Editor role: ALLOW VIEW+POST (positive grant). m1 + m2 hold this role.
    await ensureOverwrite(overwriteChannel.id, workspace.id, 'ROLE', editor.id, 'VIEW,POST', '')
    // Reviewer role: DENY POST (negative — m3 holds this role and is also a member; should not be able to post).
    await ensureOverwrite(overwriteChannel.id, workspace.id, 'ROLE', reviewer.id, '', 'POST')
    // Member-specific DENY VIEW on m1: tests "user DENY beats role ALLOW" (m1 is in Editor with ALLOW VIEW).
    // This is the most important Phase 4 case — m1 must NOT see the channel.
    await ensureOverwrite(overwriteChannel.id, workspace.id, 'USER', m1, '', 'VIEW')
    // Member-specific ALLOW MANAGE on m2: lets m2 manage the channel even though only role-level perms are set elsewhere.
    await ensureOverwrite(overwriteChannel.id, workspace.id, 'USER', m2, 'MANAGE', '')

    // 10. CLIENT portal wiring — Client record, User.clientId FK, ProfileAccess.CLIENT.clientId.
    //     Without this the CLIENT user can sign in but `getRelatedClientIds` returns [] and
    //     the portal looks empty. Required for Phase 4 client-in-channel tests + Phase 6 IDOR.
    const clientUser = users['e2e_client']
    let e2eClientRecord = await prisma.client.findFirst({ where: { name: 'James Studio (E2E)', profileId: profile.id } })
    if (!e2eClientRecord) {
        e2eClientRecord = await prisma.client.create({
            data: { name: 'James Studio (E2E)', profileId: profile.id, workspaceId: workspace.id },
        })
    }
    await prisma.user.update({ where: { id: clientUser.id }, data: { clientId: e2eClientRecord.id } })
    await prisma.profileAccess.updateMany({
        where: { userId: clientUser.id, profileId: profile.id, role: 'CLIENT' },
        data: { clientId: e2eClientRecord.id },
    })

    // 11. Second workspace — required by playbook for cross-tenant IDOR probes (Phase 6C).
    //     Same profile (so admin-level access carries) but DIFFERENT channel set;
    //     a member from workspace A who tries to read a channel by id in B must be denied.
    const workspaceB = await findOrCreateWorkspace('E2E Workspace B', profile.id)
    await ensureWorkspaceMember(ownerId, workspaceB.id, 'OWNER')
    await ensureWorkspaceMember(adminId, workspaceB.id, 'ADMIN')
    // Intentionally DO NOT add member1/2/3 to workspace B — that's the IDOR probe target.
    const categoryB = await ensureCategory(workspaceB.id, profile.id, 'E2E B Suite', 0)
    const textB = await ensureChannel({
        workspaceId: workspaceB.id, profileId: profile.id,
        name: 'e2e-text-b', type: 'TEXT', createdById: ownerId, categoryId: categoryB.id,
    })
    await ensureChannelMember(textB.id, ownerId, workspaceB.id, profile.id, 'MODERATOR')
    await ensureChannelMember(textB.id, adminId, workspaceB.id, profile.id, 'MEMBER')

    console.log(`\n[E2E seed] DONE.`)
    console.log(`  Login: <username>/e2e!Test2026  at  /login`)
    console.log(`  Workspace A: ${workspace.id}  (route: /${workspace.id}/hub)`)
    console.log(`  Workspace B: ${workspaceB.id}  (cross-tenant IDOR probe — only owner+admin)`)
    console.log(`  Members in #e2e-text: owner(MOD), admin, member1, member2 — NOT member3, NOT guest`)
    console.log(`  Reviewer role on #e2e-text: ALLOW VIEW + DENY POST  → member3 should SEE but not post`)
    console.log(`  Overwrite channel: ${overwriteChannel.id}`)
    console.log(`    - Editor role ALLOW VIEW,POST · Reviewer role DENY POST`)
    console.log(`    - USER DENY VIEW on member1 (Editor) → DENY-beats-role ALLOW probe`)
    console.log(`    - USER ALLOW MANAGE on member2 → user-level grant probe`)
    console.log(`  CLIENT wiring: e2e_client → Client id=${e2eClientRecord.id} "James Studio (E2E)"`)
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e)
        return prisma.$disconnect().finally(() => process.exit(1))
    })
