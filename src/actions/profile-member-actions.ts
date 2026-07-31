'use server'

/**
 * [Sprint Z] Profile-level member management — replaces super-admin model with
 * proper RBAC. Only Profile OWNER có thể remove/change roles. Both OWNER + ADMIN
 * có thể invite. USER chỉ có read access.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { ProfileRole } from '@prisma/client'
import {
    canInviteMember,
    canRemoveMember,
    canChangeMemberRole,
    canTransferOwnership,
    getProfileRole,
    getProfileAccess,
    isSessionLive,
} from '@/lib/profile-permissions'
import { audit } from '@/lib/audit-log'

/* ──────────────────────────────────────────────────────────────────── */
/*  Helpers                                                              */
/* ──────────────────────────────────────────────────────────────────── */

async function requireAuthenticated() {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Bạn cần đăng nhập.' as const, session: null }
    }
    // [AUDIT SI-1 / SI-2 — fix HIGH] These canonical profile-member doors authenticate via
    // getSession() (JWT decrypt) only and never reach verifyWorkspaceAccess, so neither the
    // LOCKED ban nor a sessionVersion bump ("logout all devices" / password reset) was enforced
    // on the highest-privilege mutation + roster-read surface. Re-assert live account status here
    // (covers invite / remove / changeRole / transfer / grant / getProfileMembers — all route
    // through this helper). Mirrors acceptWorkspaceInvitation (member-actions.ts) + verifyWorkspaceAccess.
    if (!(await isSessionLive(session))) {
        return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa. Vui lòng đăng nhập lại.' as const, session: null }
    }
    return { error: null, session }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Get profile members                                                  */
/* ──────────────────────────────────────────────────────────────────── */

export async function getProfileMembers(profileId: string) {
    const { error, session } = await requireAuthenticated()
    if (error || !session) return { error, members: [] }

    // Caller phải có role trong profile (kể cả USER cũng read được list).
    // [AUDIT invite-flow R2 — fix] A CLIENT ProfileAccess is a view-only portal grant and must
    // NOT read the internal staff roster. The UI redirects clients away, but this server action
    // is directly callable — reject CLIENT explicitly (mirrors verifyWorkspaceAccess / canAccessWorkspace).
    const role = await getProfileRole(session.user.id, profileId)
    if (!role || role === 'CLIENT') {
        return { error: 'Bạn không có quyền truy cập profile này.', members: [] }
    }

    const accesses = await prisma.profileAccess.findMany({
        // [Roster fix] Only INTERNAL staff (OWNER/ADMIN/USER). A ProfileAccess(role='CLIENT')
        // is a view-only portal grant for a CRM client — never an org "member" — so it must NOT
        // appear in the staff roster (it was leaking client names into "Thành viên tổ chức").
        where: { profileId, role: { not: 'CLIENT' } },
        orderBy: [{ role: 'asc' }, { grantedAt: 'asc' }],
        select: {
            id: true,
            userId: true,
            role: true,
            grantedAt: true,
            user: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    displayName: true,
                    email: true,
                    avatarUrl: true,
                },
            },
        },
    })

    // Mask email if caller is USER (only OWNER/ADMIN see full emails)
    const isPrivileged = role === 'OWNER' || role === 'ADMIN'

    return {
        error: null,
        members: accesses.map((a) => ({
            id: a.id,
            userId: a.userId,
            role: a.role,
            grantedAt: a.grantedAt.toISOString(),
            user: {
                id: a.user.id,
                username: a.user.username,
                nickname: a.user.nickname,
                displayName: a.user.displayName,
                email: isPrivileged ? a.user.email : null,
                avatarUrl: a.user.avatarUrl,
            },
        })),
        callerRole: role,
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Invite to profile                                                    */
/* ──────────────────────────────────────────────────────────────────── */

export async function inviteToProfileAction(
    profileId: string,
    workspaceId: string,
    usernameOrEmail: string,
    role: 'ADMIN' | 'USER' = 'USER',
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER hoặc ADMIN
    if (!(await canInviteMember(session.user.id, profileId))) {
        return { error: 'Bạn không có quyền mời thành viên vào Profile này.' }
    }

    // [AUDIT R5 — fix] Privilege-escalation: canInviteMember allows OWNER *or* ADMIN,
    // but the requested `role` was applied verbatim → an ADMIN could mint another
    // ADMIN. Only a profile OWNER may grant the ADMIN role (mirrors the OWNER-only
    // promote/demote rule in the permission matrix).
    if (role === 'ADMIN') {
        const callerRole = await getProfileRole(session.user.id, profileId)
        if (callerRole !== 'OWNER') {
            return { error: 'Chỉ Owner mới có quyền cấp vai trò Admin.' }
        }
    }

    // [Invite accept-flow] Org membership = ProfileAccess. Instead of the old instant
    // ProfileAccess.create (which force-added the invitee WITHOUT their consent — the reported
    // bug), delegate to the hardened workspace-invitation flow: it creates a PENDING
    // WorkspaceInvitation + notifies the invitee, who must ACCEPT (the dashboard
    // PendingInvitationsBanner → acceptWorkspaceInvitation) before any ProfileAccess is created.
    //
    // inviteToWorkspace carries ALL the R1–R14 guards (deterministic lookup + matchCount>1 refuse,
    // CLIENT/LOCKED reject, allowExternalInvites consent, caller + per-target rate-limit,
    // OWNER-only-grants-ADMIN, no identity echo) and trims/validates the identifier, so we do NOT
    // re-run any of them here — re-running would double-charge the rate-limiter.
    //
    // Role mapping: profile ADMIN → workspace-invitation role 'ADMIN' (acceptWorkspaceInvitation
    // grants ProfileAccess(ADMIN)); profile USER → 'MEMBER' (→ ProfileAccess(USER)). OWNER-only-ADMIN
    // is enforced both above AND inside inviteToWorkspace (via the workspace OWNER role, which only
    // a profile OWNER holds). The invitee not yet in this org always hits the PENDING+accept branch.
    const { inviteToWorkspace } = await import('./member-actions')
    return inviteToWorkspace(workspaceId, usernameOrEmail, role === 'ADMIN' ? 'ADMIN' : 'MEMBER')
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Remove from profile (OWNER only)                                     */
/* ──────────────────────────────────────────────────────────────────── */

export async function removeFromProfileAction(profileId: string, targetUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền xóa thành viên khỏi Profile.' }
    }

    if (targetUserId === session.user.id) {
        return { error: 'Bạn không thể tự xóa mình. Hãy transfer ownership trước.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        select: { role: true },
    })
    if (!targetAccess) {
        return { error: 'Thành viên không tồn tại trong Profile.' }
    }
    if (targetAccess.role === 'OWNER') {
        return { error: 'Không thể xóa OWNER khác. Profile chỉ có 1 OWNER.' }
    }

    // Find all workspaces in profile, delete WorkspaceMember rows
    const workspaces = await prisma.workspace.findMany({
        where: { profileId },
        select: { id: true },
    })
    const workspaceIds = workspaces.map((w) => w.id)

    await prisma.$transaction([
        // Delete WorkspaceMember rows in profile's workspaces
        prisma.workspaceMember.deleteMany({
            where: { userId: targetUserId, workspaceId: { in: workspaceIds } },
        }),
        // [AUDIT invite-flow R1+R3 — fix] HARD-DELETE all of this user's invitation rows across
        // the profile's workspaces. Revoking only PENDING rows left a lingering ACCEPTED/DECLINED
        // row that could be replayed through acceptWorkspaceInvitation's priorAccepted branch to
        // re-mint membership (R3 High). Deleting every (workspaceId, invitedUserId) row removes
        // that replay trigger (mirrors the removeWorkspaceMember fix).
        prisma.workspaceInvitation.deleteMany({
            where: { workspaceId: { in: workspaceIds }, invitedUserId: targetUserId },
        }),
        // [Merge: sole invite path] Delete the ProfileAccess row idempotently. Using deleteMany
        // (not delete) so two admins removing the SAME member concurrently don't trip a P2025 on
        // the second call (delete throws on a missing row → whole tx rolls back → unhandled error).
        // [AUDIT IR-2 — fix] Scope the delete to non-OWNER rows. The OWNER check above is a
        // pre-transaction read (TOCTOU): a concurrent transferProfileOwnershipAction could promote
        // THIS target to OWNER between that read and this delete, and an unconditional delete would
        // then drop the freshly-minted OWNER row → a profile with 0 OWNERs that no server action can
        // recover (changeProfileRole blocks newRole=OWNER; transfer requires an existing OWNER). With
        // `role: { not: 'OWNER' }`, that race deletes 0 rows and the OWNER invariant is preserved.
        prisma.profileAccess.deleteMany({
            where: { userId: targetUserId, profileId, role: { not: 'OWNER' } },
        }),
        // [AUDIT HT-023 fix] BẤT BIẾN: dấu ProfileAccessRequest APPROVED KHÔNG được sống lâu hơn
        // quyền ProfileAccess mà nó chứng nhận.
        // Kể từ HT-023, dấu APPROVED chính là thứ cho phép ADMIN gỡ một người. Đây lại là CỬA
        // CHÍNH TẮC để gỡ thành viên, nên cũng là đường mà một người du học hay mất quyền nhất.
        // Nếu ở đây chỉ xoá quyền mà để dấu lại, thì lần sau người đó được mời vào bằng luồng mời
        // bình thường, dấu cũ vẫn nằm đó và bị nhận vơ cho quyền mới — ADMIN lại gỡ được một thành
        // viên bình thường, tức HT-023 mở lại mà không cần race nào.
        // Bốn nơi xoá ProfileAccess đều phải xoá kèm: ở đây, removeCrossTeamAccess, và hai đường
        // trong member-actions (removeWorkspaceMember + leaveWorkspace).
        prisma.profileAccessRequest.deleteMany({
            where: { userId: targetUserId, targetProfileId: profileId },
        }),
    ])

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.member_removed' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { removedUserId: targetUserId, role: targetAccess.role, workspaceMemberCount: workspaceIds.length },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Change member role (OWNER only)                                      */
/* ──────────────────────────────────────────────────────────────────── */

export async function changeProfileRoleAction(
    profileId: string,
    targetUserId: string,
    newRole: ProfileRole,
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canChangeMemberRole(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền đổi role thành viên.' }
    }

    if (targetUserId === session.user.id) {
        return { error: 'Bạn không thể tự đổi role của mình. Dùng transfer ownership nếu muốn giao quyền.' }
    }

    if (newRole === 'OWNER') {
        return { error: 'Để chuyển quyền OWNER, dùng transferProfileOwnership thay vì changeProfileRole.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        select: { role: true, grantedAt: true },
    })
    if (!targetAccess) {
        return { error: 'Thành viên không tồn tại trong Profile.' }
    }
    if (targetAccess.role === 'OWNER') {
        return { error: 'Không thể demote OWNER. Transfer ownership trước.' }
    }
    // [AUDIT invite-flow R4 — fix] A CLIENT is a view-only portal grant — never promote it to an
    // internal USER/ADMIN role here (mirror the CLIENT guards in inviteToProfileAction / accept).
    if (targetAccess.role === 'CLIENT') {
        return { error: 'Tài khoản này đang là CLIENT (chỉ xem). Hãy gỡ vai trò CLIENT trước khi đổi sang vai trò nội bộ.' }
    }
    if (targetAccess.role === newRole) {
        return { error: 'Thành viên đã có role này.' }
    }

    // [Sprint Z] Update role + reset grantedAt if promoting USER → ADMIN
    // (so admin cutoff applies to future workspaces only)
    const shouldResetGrantedAt = targetAccess.role === 'USER' && newRole === 'ADMIN'

    await prisma.profileAccess.update({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        data: {
            role: newRole,
            ...(shouldResetGrantedAt ? { grantedAt: new Date() } : {}),
        },
    })

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.role_changed' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { targetUserId, role: targetAccess.role },
        after: { targetUserId, role: newRole, grantedAtReset: shouldResetGrantedAt },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Transfer ownership (OWNER only)                                      */
/* ──────────────────────────────────────────────────────────────────── */

export async function transferProfileOwnershipAction(profileId: string, newOwnerUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    if (!(await canTransferOwnership(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền transfer ownership.' }
    }

    if (newOwnerUserId === session.user.id) {
        return { error: 'Bạn đã là Owner.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: newOwnerUserId, profileId } },
        select: { role: true },
    })
    if (!targetAccess) {
        return { error: 'Người được transfer phải là thành viên hiện tại của Profile.' }
    }
    // [AUDIT invite-flow R4 — fix] Never transfer ownership to a view-only CLIENT access row.
    if (targetAccess.role === 'CLIENT') {
        return { error: 'Không thể chuyển quyền sở hữu cho tài khoản CLIENT (chỉ xem). Hãy chuyển họ thành thành viên nội bộ trước.' }
    }

    // [AUDIT IR-1 — fix] Atomic compare-and-swap. The previous swap was two unconditional
    // updates by PK with no lock; two concurrent transfers (O→A and O→B) both passed the
    // pre-check (O still read OWNER) and both committed, minting a SECOND, unremovable co-OWNER
    // (changeProfileRole/removeFromProfile both refuse to touch an OWNER). Guard the caller's
    // demotion with `where: { role: 'OWNER' }`: under Postgres Read Committed the second tx
    // blocks on the caller's row, re-evaluates after the first commits, matches 0 rows, and
    // aborts — so exactly one transfer wins. (Same CAS discipline as acceptWorkspaceInvitation.)
    try {
        await prisma.$transaction(async (tx) => {
            const demoted = await tx.profileAccess.updateMany({
                where: { userId: session.user.id, profileId, role: 'OWNER' },
                data: { role: 'ADMIN' },
            })
            if (demoted.count !== 1) {
                throw new Error('TRANSFER_CONFLICT')
            }
            await tx.profileAccess.update({
                where: { userId_profileId: { userId: newOwnerUserId, profileId } },
                data: { role: 'OWNER' },
            })
        })
    } catch (e: any) {
        if (e?.message === 'TRANSFER_CONFLICT') {
            return { error: 'Quyền sở hữu vừa được thay đổi bởi một thao tác khác. Vui lòng tải lại trang và thử lại.' }
        }
        throw e
    }

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.ownership_transferred' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { ownerId: session.user.id },
        after: { ownerId: newOwnerUserId },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Grant workspace access to Admin (for old workspaces)                 */
/* ──────────────────────────────────────────────────────────────────── */

export async function grantWorkspaceAccessToAdmin(
    profileId: string,
    targetUserId: string,
    workspaceId: string,
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền cấp truy cập workspace cho Admin.' }
    }

    // Target phải là ADMIN trong profile
    const access = await getProfileAccess(targetUserId, profileId)
    if (!access) {
        return { error: 'Người dùng không thuộc Profile.' }
    }
    if (access.role !== 'ADMIN') {
        return { error: 'Chỉ Admin mới cần explicit grant workspace cũ.' }
    }

    // Workspace phải thuộc profile
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true, createdAt: true, name: true },
    })
    if (!ws || ws.profileId !== profileId) {
        return { error: 'Workspace không thuộc Profile này.' }
    }
    if (ws.createdAt >= access.grantedAt) {
        return { error: 'Workspace này đã tự động accessible cho Admin (tạo sau khi promote).' }
    }

    // Create or update WorkspaceMember
    await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
        create: { userId: targetUserId, workspaceId, role: 'ADMIN' },
        update: { role: 'ADMIN' },
    })

    await audit({
        workspaceId,
        actorUserId: session.user.id,
        action: 'profile.admin_workspace_granted' as any,
        targetType: 'Workspace',
        targetId: workspaceId,
        after: { targetUserId, workspaceName: ws.name },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Get workspaces older than Admin's grantedAt (for grant UI)           */
/* ──────────────────────────────────────────────────────────────────── */

export async function getOldWorkspacesForAdmin(profileId: string, targetUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr, workspaces: [] }

    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới truy cập được data này.', workspaces: [] }
    }

    const access = await getProfileAccess(targetUserId, profileId)
    if (!access || access.role !== 'ADMIN') {
        return { error: 'Target không phải Admin.', workspaces: [] }
    }

    const oldWorkspaces = await prisma.workspace.findMany({
        where: { profileId, createdAt: { lt: access.grantedAt } },
        select: {
            id: true,
            name: true,
            createdAt: true,
            members: {
                where: { userId: targetUserId },
                select: { id: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    })

    return {
        error: null,
        workspaces: oldWorkspaces.map((w) => ({
            id: w.id,
            name: w.name,
            createdAt: w.createdAt.toISOString(),
            // Already granted: WorkspaceMember exists
            alreadyGranted: w.members.length > 0,
        })),
    }
}
