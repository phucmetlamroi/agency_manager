/**
 * Debug: User báo save delivery fails. Tìm task "Ronda · Jim Cam Koroto(Reel)"
 * và check assignee's permissions trên workspace.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    // Find task by title pattern
    const task = await prisma.task.findFirst({
        where: { title: { contains: 'Jim Cam' } },
        select: {
            id: true,
            title: true,
            status: true,
            assigneeId: true,
            workspaceId: true,
            productLink: true,
            workspace: {
                select: {
                    name: true,
                    profileId: true,
                    createdAt: true,
                    profile: { select: { name: true } },
                },
            },
            assignee: {
                select: { id: true, username: true, nickname: true, displayName: true, profileId: true },
            },
        },
    })

    if (!task) {
        console.log('Task not found.')
        return
    }

    console.log(`=== Task: "${task.title}" ===`)
    console.log(`  id=${task.id.slice(0, 8)}, status=${task.status}`)
    console.log(`  workspace="${task.workspace?.name}" (createdAt=${task.workspace?.createdAt.toISOString().slice(0, 10)})`)
    console.log(`  profile="${task.workspace?.profile?.name}" (id=${task.workspace?.profileId?.slice(0, 8)})`)
    console.log(`  productLink="${task.productLink ?? '-'}"`)

    if (!task.assignee || !task.workspaceId) {
        console.log('No assignee or workspace.')
        return
    }

    const u = task.assignee
    console.log(`\n=== Assignee: ${u.nickname ?? u.displayName ?? u.username} ===`)
    console.log(`  id=${u.id.slice(0, 8)}, profileId(home)=${u.profileId?.slice(0, 8) ?? 'NULL'}`)

    // ProfileAccess
    if (task.workspace?.profileId) {
        const access = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId: u.id, profileId: task.workspace.profileId } },
            select: { role: true, grantedAt: true },
        })
        console.log(`  ProfileAccess(${task.workspace.profile?.name}): ${access ? `${access.role}, grantedAt=${access.grantedAt.toISOString().slice(0, 10)}` : 'NONE'}`)
        if (access?.role === 'ADMIN') {
            const cutoffPass = task.workspace.createdAt >= access.grantedAt
            console.log(`    Admin grantedAt cutoff: workspace.createdAt(${task.workspace.createdAt.toISOString().slice(0, 10)}) >= grantedAt(${access.grantedAt.toISOString().slice(0, 10)}) = ${cutoffPass}`)
        }
    }

    // WorkspaceMember row
    const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: u.id, workspaceId: task.workspaceId } },
        select: { role: true },
    })
    console.log(`  WorkspaceMember: ${member ? member.role : 'NONE'}`)

    // Determine effective workspaceRole via Sprint Z logic
    const profAccess = task.workspace?.profileId
        ? await prisma.profileAccess.findUnique({
              where: { userId_profileId: { userId: u.id, profileId: task.workspace.profileId } },
              select: { role: true, grantedAt: true },
          })
        : null

    let workspaceRole: string | null = null
    if (profAccess?.role === 'OWNER') workspaceRole = 'OWNER'
    else if (profAccess?.role === 'ADMIN' && task.workspace && task.workspace.createdAt >= profAccess.grantedAt) workspaceRole = 'ADMIN'
    else if (member) workspaceRole = member.role
    // [Sprint Z+1 hotfix] Profile member fallback → MEMBER
    else if (profAccess) workspaceRole = 'MEMBER'

    console.log(`\n=== Effective workspaceRole (Sprint Z+1 hotfix logic): ${workspaceRole ?? 'NONE — would throw SECURITY_VIOLATION'} ===`)
    console.log(`  requiredRole='MEMBER' for updateTaskDetails`)
    const ROLE_WEIGHT: Record<string, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, GUEST: 1 }
    const accessOk = workspaceRole && ROLE_WEIGHT[workspaceRole] >= ROLE_WEIGHT['MEMBER']
    console.log(`  Pass MEMBER check? ${accessOk ? '✅ YES' : '❌ NO — SAVE FAILS HERE'}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
