import { prisma } from '@/lib/db'

export interface StaffUser {
    id: string
    username: string
    displayName: string | null
}

/**
 * All staff users of a workspace (the universe addable to channels / roles) =
 * WorkspaceMember(role ADMIN/MEMBER) ∪ profile ProfileAccess(role OWNER/ADMIN/USER).
 * CLIENT + GUEST excluded. Shared by channel membership + custom-role management.
 */
export async function getWorkspaceStaff(workspaceId: string): Promise<StaffUser[]> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    const USER_SELECT = { id: true, username: true, displayName: true } as const
    const [wm, pa] = await Promise.all([
        prisma.workspaceMember.findMany({ where: { workspaceId, role: { in: ['ADMIN', 'MEMBER'] } }, select: { user: { select: USER_SELECT } } }),
        ws?.profileId
            ? prisma.profileAccess.findMany({ where: { profileId: ws.profileId, role: { in: ['OWNER', 'ADMIN', 'USER'] } }, select: { user: { select: USER_SELECT } } })
            : Promise.resolve([] as Array<{ user: StaffUser }>),
    ])
    const byId = new Map<string, StaffUser>()
    for (const w of wm) if (w.user) byId.set(w.user.id, w.user)
    for (const p of pa) if (p.user) byId.set(p.user.id, p.user)
    return Array.from(byId.values()).sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username))
}
