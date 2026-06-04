'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { hasAtLeastRole } from '@/lib/workspace-roles'
import { getWorkspaceStaff, type StaffUser } from '@/lib/workspace-staff'
import { revalidatePath } from 'next/cache'

/**
 * [Chat Phase 2] Custom workspace roles (org tiers). Managing roles is ADMIN-gated.
 * Channel access is refined per-channel via ChannelOverwrite (see channel-actions).
 */

export interface CustomRoleDTO {
    id: string
    name: string
    color: string | null
    position: number
    memberCount: number
}

async function resolveProfileId(workspaceId: string, user: unknown): Promise<string | null> {
    const fromSession = (user as { sessionProfileId?: string })?.sessionProfileId
    if (fromSession) return fromSession
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    return ws?.profileId ?? null
}

export async function listRoles(workspaceId: string): Promise<CustomRoleDTO[]> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const roles = await prisma.customRole.findMany({
        where: { workspaceId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, color: true, position: true, _count: { select: { members: true } } },
    })
    return roles.map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, memberCount: r._count.members }))
}

export async function createRole(
    workspaceId: string,
    name: string,
    color?: string | null,
): Promise<{ role: CustomRoleDTO } | { error: string }> {
    const { user, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Chỉ admin mới quản lý vai trò' }
    const clean = name.trim()
    if (!clean) return { error: 'Tên vai trò không được để trống' }
    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }
    const position = await prisma.customRole.count({ where: { workspaceId } })
    const r = await prisma.customRole.create({
        data: { workspaceId, profileId, name: clean.slice(0, 60), color: color ?? null, position },
        select: { id: true, name: true, color: true, position: true },
    })
    revalidatePath(`/${workspaceId}/hub`)
    return { role: { ...r, memberCount: 0 } }
}

export async function updateRole(
    workspaceId: string,
    roleId: string,
    input: { name?: string; color?: string | null },
): Promise<{ success: true } | { error: string }> {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }
    const data: { name?: string; color?: string | null } = {}
    if (typeof input.name === 'string') {
        const c = input.name.trim()
        if (!c) return { error: 'Tên vai trò không được để trống' }
        data.name = c.slice(0, 60)
    }
    if (input.color !== undefined) data.color = input.color
    if (Object.keys(data).length === 0) return { success: true }
    await prisma.customRole.updateMany({ where: { id: roleId, workspaceId }, data })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

export async function deleteRole(workspaceId: string, roleId: string): Promise<{ success: true } | { error: string }> {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }
    // Drop the role + any channel overwrites that targeted it (else they'd be inert orphans).
    await prisma.$transaction([
        prisma.channelOverwrite.deleteMany({ where: { workspaceId, subjectType: 'ROLE', subjectId: roleId } }),
        prisma.customRole.deleteMany({ where: { id: roleId, workspaceId } }),
    ])
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

export async function getRoleMembers(
    workspaceId: string,
    roleId: string,
): Promise<{ members: StaffUser[]; staff: StaffUser[] } | { error: string }> {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }
    const role = await prisma.customRole.findFirst({ where: { id: roleId, workspaceId }, select: { id: true } })
    if (!role) return { error: 'Không tìm thấy vai trò' }
    const [rows, staff] = await Promise.all([
        prisma.customRoleMember.findMany({ where: { roleId, workspaceId }, select: { user: { select: { id: true, username: true, displayName: true } } } }),
        getWorkspaceStaff(workspaceId),
    ])
    return { members: rows.map((r) => r.user).filter(Boolean) as StaffUser[], staff }
}

export async function setRoleMembers(workspaceId: string, roleId: string, userIds: string[]): Promise<{ success: true } | { error: string }> {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }
    const role = await prisma.customRole.findFirst({ where: { id: roleId, workspaceId }, select: { id: true } })
    if (!role) return { error: 'Không tìm thấy vai trò' }
    const staffIds = new Set((await getWorkspaceStaff(workspaceId)).map((s) => s.id))
    const target = new Set(userIds.filter((id) => staffIds.has(id)))
    const existing = await prisma.customRoleMember.findMany({ where: { roleId }, select: { userId: true } })
    const existingIds = new Set(existing.map((e) => e.userId))
    const toAdd = Array.from(target).filter((id) => !existingIds.has(id))
    const toRemove = Array.from(existingIds).filter((id) => !target.has(id))
    await prisma.$transaction([
        ...(toRemove.length ? [prisma.customRoleMember.deleteMany({ where: { roleId, workspaceId, userId: { in: toRemove } } })] : []),
        ...toAdd.map((userId) => prisma.customRoleMember.create({ data: { workspaceId, roleId, userId } })),
    ])
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}
