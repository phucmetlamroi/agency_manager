'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { ensureNotLastOwner, LastOwnerProtectionError } from '@/lib/workspace-guards'
import { isWorkspaceRole, hasAtLeastRole, type WorkspaceRole } from '@/lib/workspace-roles'
import { audit } from '@/lib/audit-log'
import { checkInviteRate, checkInviteCallerRate } from '@/lib/rate-limit-upstash'
import { findUserByEmailOrUsername } from '@/lib/user-lookup'

const INVITATION_EXPIRY_DAYS = 14

// ─── Helper: notify invitee via email + realtime notification ────────
async function notifyInvitee(params: {
    invitationId: string
    inviteeUserId: string
    inviterUserId: string
    workspaceId: string
    role: string
}): Promise<void> {
    const { invitationId, inviteeUserId, inviterUserId, workspaceId, role } = params

    // [F2 stale-notification cleanup] Before delivering a fresh invitation
    // notification, archive any previous unarchived invitation notifications for
    // this user + workspace. Without this, the user can end up clicking an old
    // notification whose embedded invitationId points to a DECLINED / EXPIRED /
    // superseded invitation, causing the "Lời mời đã hết hạn" error even though
    // a fresh PENDING invitation exists.
    try {
        await prisma.notification.updateMany({
            where: {
                userId: inviteeUserId,
                type: 'WORKSPACE_INVITATION_RECEIVED',
                isArchived: false,
                metadata: {
                    path: ['workspaceId'],
                    equals: workspaceId,
                },
            },
            data: { isArchived: true },
        })
    } catch (e) {
        // Best-effort — the smart-fallback in acceptWorkspaceInvitation will
        // also rescue the user if a stale notification survives.
        console.warn('[notifyInvitee] archive stale notifications failed:', e)
    }

    // Lookup data needed for email + notification
    const [invitee, inviter, ws] = await Promise.all([
        prisma.user.findUnique({
            where: { id: inviteeUserId },
            select: { email: true, displayName: true, nickname: true, username: true }
        }),
        prisma.user.findUnique({
            where: { id: inviterUserId },
            select: { displayName: true, nickname: true, username: true }
        }),
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true }
        }),
    ])

    const inviteeName = invitee?.displayName ?? invitee?.nickname ?? invitee?.username ?? 'Bạn'
    const inviterName = inviter?.displayName ?? inviter?.nickname ?? inviter?.username ?? 'Một admin'
    const workspaceName = ws?.name ?? 'workspace'

    // 1. Send email (skip if no email — paranoia)
    if (invitee?.email) {
        try {
            const { buildWorkspaceInvitationEmail } = await import(
                '@/lib/notification-emails/templates/auth/workspace-invitation'
            )
            const { sendEmail } = await import('@/lib/email')
            const emailContent = buildWorkspaceInvitationEmail({
                inviteeName,
                inviterName,
                workspaceName,
                role,
                appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://hustlytasker.xyz',
                expiresHours: INVITATION_EXPIRY_DAYS * 24,
            })
            await sendEmail({
                to: invitee.email,
                subject: emailContent.subject,
                html: emailContent.html,
            })
        } catch (e) {
            console.warn('[notifyInvitee] email failed:', e)
        }
    }

    // 2. Create realtime notification (bell badge + Accept/Decline inline)
    try {
        const { createNotificationInternal } = await import('./notification-actions')
        const { broadcastNotificationToUser } = await import('@/lib/notification-broadcast')
        const notif = await createNotificationInternal({
            userId: inviteeUserId,
            type: 'WORKSPACE_INVITATION_RECEIVED',
            title: `${inviterName} mời bạn tham gia workspace`,
            body: `${workspaceName} · Vai trò: ${role}`,
            actorId: inviterUserId,
            metadata: { invitationId, workspaceId, workspaceName, role },
        })
        if (notif) {
            broadcastNotificationToUser(inviteeUserId, notif as any).catch(() => { })
        }
    } catch (e) {
        console.warn('[notifyInvitee] notification failed:', e)
    }
}

// ─── Get workspace members with roles ────────────────────────────
/**
 * List members visible trong workspace.
 *
 * Architecture: Profile-level membership (giống Slack/Notion):
 * - Tất cả users thuộc Profile của Workspace = members (auto, role MEMBER)
 * - WorkspaceMember row chỉ OVERRIDE role cho cases đặc biệt (OWNER/ADMIN/GUEST)
 *
 * Trả về:
 * - `members`: union của (a) WorkspaceMember explicit + (b) Profile users
 * - Field `source`: 'workspace' (explicit row) | 'profile' (auto from profileId match)
 * - Email masked cho non-ADMIN callers (audit fix #3.2)
 */
export async function getWorkspaceMembers(workspaceId: string) {
    const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    // Get workspace + profileId
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })

    // PRIORITY 1: Explicit WorkspaceMember rows (with custom role)
    const workspaceMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    displayName: true,
                    email: true,
                    avatarUrl: true,
                    role: true,
                }
            }
        },
        orderBy: { joinedAt: 'asc' },
    })

    const explicitUserIds = new Set(workspaceMembers.map(m => m.userId))

    // PRIORITY 2: Profile users không có WorkspaceMember row
    let profileMembers: any[] = []
    if (workspace?.profileId) {
        const profileUsers = await prisma.user.findMany({
            where: {
                profileId: workspace.profileId,
                id: { notIn: Array.from(explicitUserIds) },
                // [Client membership] Exclude deactivated + legacy CLIENT-role accounts
                // + per-profile client-members (view-only portal, not staff members).
                role: { notIn: ['LOCKED', 'CLIENT'] },
                NOT: { profileAccesses: { some: { profileId: workspace.profileId, role: 'CLIENT' } } },
            },
            select: {
                id: true,
                username: true,
                nickname: true,
                displayName: true,
                email: true,
                avatarUrl: true,
                role: true,
                createdAt: true,
            },
        })

        profileMembers = profileUsers.map(u => ({
            id: `profile-${u.id}`,  // synthetic id (no WorkspaceMember row)
            userId: u.id,
            workspaceId,
            role: 'MEMBER',  // default role for Profile-level access
            joinedAt: u.createdAt,
            user: u,
            source: 'profile' as const,
        }))
    }

    // Members có ProfileAccess đến workspace.profileId → cũng tag 'profile'
    // (giúp invitee accept lời mời hiện badge xanh "Profile" giống native member).
    let profileAccessUserIds = new Set<string>()
    if (workspace?.profileId && workspaceMembers.length > 0) {
        const accesses = await prisma.profileAccess.findMany({
            where: {
                profileId: workspace.profileId,
                userId: { in: workspaceMembers.map(m => m.userId) },
            },
            select: { userId: true },
        })
        profileAccessUserIds = new Set(accesses.map(a => a.userId))
    }

    // Combine + tag source. WorkspaceMember có ProfileAccess matching → 'profile'.
    const allMembers = [
        ...workspaceMembers.map(m => ({
            ...m,
            source: profileAccessUserIds.has(m.userId)
                ? ('profile' as const)
                : ('workspace' as const),
        })),
        ...profileMembers,
    // [Client membership] Drop any CLIENT-role account that slipped in via a stray
    // WorkspaceMember row (legacy auto-created clients are not staff members).
    ].filter((m) => m.user?.role !== 'CLIENT')

    // Sort by role weight (OWNER > ADMIN > MEMBER > GUEST)
    const ROLE_ORDER: Record<string, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, GUEST: 1 }
    allMembers.sort((a, b) => (ROLE_ORDER[b.role] ?? 0) - (ROLE_ORDER[a.role] ?? 0))

    // Audit fix #3.2: Mask email khi caller không phải ADMIN+
    const isAdminOrAbove =
        access.isGlobalAdmin
        || access.workspaceRole === 'OWNER'
        || access.workspaceRole === 'ADMIN'

    if (!isAdminOrAbove) {
        // [Sprint J P0] Mask ALL emails (kể cả của caller chính họ) khi non-admin.
        // Trước đây chỉ mask emails của other members → caller's own email vẫn lộ
        // qua list. Vẫn là PII leak vì attacker control session có thể enumerate
        // peer emails qua test cases khác. Strict policy: non-admin = không có
        // email field nào trong response.
        for (const m of allMembers) {
            if (m.user) {
                m.user.email = null
            }
        }
    }

    return { members: allMembers }
}

// ─── Get pending invitations for a workspace ─────────────────────
export async function getWorkspaceInvitations(workspaceId: string) {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    try {
        const invitations = await prisma.workspaceInvitation.findMany({
            where: {
                workspaceId,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
            include: {
                invitedUser: {
                    select: { id: true, username: true, nickname: true, email: true, avatarUrl: true }
                },
                invitedBy: {
                    select: { id: true, username: true, nickname: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        return { invitations }
    } catch (err: any) {
        // Table may not exist pre-migration
        if (err?.code === 'P2021') return { invitations: [] }
        throw err
    }
}

// ─── Get my pending invitations (for invitee) ────────────────────
export async function getMyPendingInvitations() {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { invitations: [] }

    try {
        const invitations = await prisma.workspaceInvitation.findMany({
            where: {
                invitedUserId: session.user.id,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
            include: {
                workspace: { select: { id: true, name: true, description: true } },
                invitedBy: { select: { id: true, username: true, nickname: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return { invitations }
    } catch (err: any) {
        if (err?.code === 'P2021') return { invitations: [] }
        throw err
    }
}

// ─── Invite a user to workspace ──────────────────────────────────
export async function inviteToWorkspace(
    workspaceId: string,
    targetUsername: string,
    role: WorkspaceRole = 'MEMBER',
    message?: string
) {
    const { userId: inviterId, workspaceRole: inviterRole } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    // [AUDIT invite-flow R2 — fix HIGH] Caller-scoped throttle BEFORE the user lookup. The
    // per-(workspace,target) checkInviteRate below runs after the lookup keyed on the resolved
    // target, so it cannot cap probing thousands of DISTINCT emails. This caps the account-
    // enumeration primitive (distinct-email existence oracle) at 40/h/caller.
    const callerRate = await checkInviteCallerRate(inviterId)
    if (!callerRate.success) {
        return { error: `Bạn đang gửi lời mời quá nhanh. Vui lòng thử lại sau ${callerRate.retryAfter ?? 3600} giây.` }
    }

    // [Sprint B] Subscription gating removed — tất cả admin có quyền mời member.

    // Validate role — can't invite as OWNER directly
    if (role === 'OWNER') {
        return { error: 'Không thể mời với vai trò OWNER. Hãy mời làm ADMIN rồi chuyển quyền sở hữu.' }
    }
    if (!isWorkspaceRole(role)) {
        return { error: 'Vai trò không hợp lệ.' }
    }

    // [AUDIT R7 — fix HIGH #1] Privilege-escalation gate: chỉ OWNER mới được mời/cấp
    // vai trò ADMIN. Trước đây một ADMIN bất kỳ có thể mời thêm ADMIN (peer escalation),
    // ngược với sibling changeWorkspaceMemberRole vốn đã chặn (chỉ OWNER đổi ADMIN/OWNER).
    // Path cross-profile lưu invitation.role rồi acceptWorkspaceInvitation honor verbatim,
    // nên gate tại thời điểm mời này bao trùm cả hai luồng.
    if (role === 'ADMIN' && inviterRole !== 'OWNER') {
        return { error: 'Chỉ chủ sở hữu (OWNER) mới có quyền mời/cấp vai trò ADMIN.' }
    }

    const trimmedUsername = targetUsername.trim()
    if (!trimmedUsername) return { error: 'Tên người dùng không được để trống.' }

    // Find target user — deterministic lookup that survives duplicate-email rows.
    const lookup = await findUserByEmailOrUsername<{
        id: string; username: string; nickname: string | null; role: string;
        profileId: string | null; allowExternalInvites: boolean
    }>(trimmedUsername, {
        id: true, username: true, nickname: true, role: true,
        profileId: true, allowExternalInvites: true,
    })
    if (lookup.matchCount > 1) {
        return { error: `Có ${lookup.matchCount} tài khoản dùng email/username "${trimmedUsername}". Yêu cầu admin chạy scripts/audit-duplicate-emails.mjs để gộp trước khi mời.` }
    }
    const targetUser = lookup.user
    if (!targetUser) {
        return { error: 'Tài khoản không tồn tại.' }
    }

    if (targetUser.id === inviterId) {
        return { error: 'Bạn không thể tự mời chính mình.' }
    }

    // [AUDIT invite-flow R1 — fix HIGH] Reject LOCKED/CLIENT targets up front, covering BOTH
    // the same-profile direct-add branch and the cross-profile invite branch. Previously only
    // acceptWorkspaceInvitation (M8) guarded CLIENT, so a same-profile direct-add could mint a
    // staff WorkspaceMember row for a view-only CLIENT — a ghost member with real MEMBER-level
    // access. The lookup already selects `role`.
    if (targetUser.role === 'LOCKED' || targetUser.role === 'CLIENT') {
        return { error: 'Tài khoản này không thể được thêm làm thành viên (CLIENT chỉ xem, hoặc tài khoản đã bị khóa).' }
    }

    // Audit fix #2.8: Cross-profile invite consent
    // Nếu target user đã tắt allowExternalInvites và user thuộc Profile khác →
    // không cho mời. User được quyền refuse "spam invite" từ unknown organizations.
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    if (workspace?.profileId && targetUser.profileId && workspace.profileId !== targetUser.profileId) {
        if (targetUser.allowExternalInvites === false) {
            // [AUDIT invite-flow R2 — fix HIGH] Do NOT echo the resolved @username — a caller who
            // supplied only an email would otherwise convert it into that cross-tenant user's
            // username (email→username de-anonymization).
            return {
                error: 'Người dùng này đã tắt nhận lời mời từ tổ chức khác. Hãy yêu cầu họ bật "Allow external invites" trong Settings trước.',
            }
        }
    }

    // [AUDIT invite-flow R1 — fix HIGH] Mirror the M8 accept guard on the invite/direct-add
    // side: if the target already holds a CLIENT ProfileAccess for THIS workspace's profile,
    // refuse. Minting a staff WorkspaceMember alongside a CLIENT ProfileAccess is the exact
    // inconsistent mixed-state M8 blocks (ghost member + fail-closed portal redirect). Covers
    // the per-profile CLIENT case where User.role is normal but PA(role=CLIENT) exists.
    if (workspace?.profileId) {
        const targetPA = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId: targetUser.id, profileId: workspace.profileId } },
            select: { role: true },
        })
        if (targetPA?.role === 'CLIENT') {
            return { error: 'Tài khoản này đang là CLIENT của tổ chức — hãy gỡ vai trò CLIENT trước khi mời làm thành viên nội bộ.' }
        }
    }

    // Audit fix #2.7: Rate-limit invitation per (workspace, target user) — 5/24h.
    // Trước đây admin có thể spam mời cùng user → invitee inbox flooded.
    const rateLimit = await checkInviteRate(workspaceId, targetUser.id)
    if (!rateLimit.success) {
        return {
            error: `Đã đạt giới hạn 5 lời mời / ngày cho user này. Vui lòng thử lại sau ${rateLimit.retryAfter ?? 86400} giây.`,
        }
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId: targetUser.id,
                workspaceId,
            }
        }
    })

    if (existingMember) {
        // [Z+1.fix5] Check if user has ProfileAccess for this workspace's profile.
        // If NOT → this is an "orphan" membership (created by ensureWorkspaceMembership
        // pre-fix, or accept flow bug). Auto-repair: create ProfileAccess so user
        // becomes VISIBLE in profile-scoped queries (admin page, assignee dropdown).
        if (workspace?.profileId) {
            const hasProfileAccess = await prisma.profileAccess.findUnique({
                where: { userId_profileId: { userId: targetUser.id, profileId: workspace.profileId } }
            })
            if (!hasProfileAccess) {
                // Auto-repair: create missing ProfileAccess
                await prisma.profileAccess.create({
                    data: { userId: targetUser.id, profileId: workspace.profileId, role: 'USER' }
                }).catch((e: any) => {
                    // P2002 = race condition (another process created it), safe to ignore
                    if (e?.code !== 'P2002') console.warn('[inviteToWorkspace] orphan repair failed:', e?.message)
                })

                revalidatePath(`/${workspaceId}/admin/members`)
                return {
                    success: true,
                    directAdd: true,
                    repaired: true,
                    // [AUDIT invite-flow R5 — fix] Echo the caller-supplied identifier, not the
                    // resolved handle (completes the R4 cross-tenant de-anon fix symmetrically).
                    username: trimmedUsername,
                }
            }
        }
        return { error: `${trimmedUsername} đã là thành viên của workspace này.` }
    }

    // [Re-invite policy] Cho phép invite NHIỀU LẦN kể cả khi đã có lời mời
    // PENDING — refresh expiresAt + re-fire notification để invitee thấy lại
    // trên bell + nhận email mới. Schema có unique (workspaceId, invitedUserId,
    // status) nên dùng update thay vì create duplicate.
    // Rate limit `checkInviteRate` ở trên (5/24h) vẫn chống spam.
    let existingInvite: { id: string } | null = null
    try {
        existingInvite = await prisma.workspaceInvitation.findFirst({
            where: {
                workspaceId,
                invitedUserId: targetUser.id,
                status: 'PENDING',
            },
            select: { id: true },
        })
    } catch (err: any) {
        // Table might not exist yet — continue to create
        if (err?.code !== 'P2021') throw err
    }

    // [Z+1.fix5] Check if target user is in the WORKSPACE's profile (not inviter's home profile).
    // This correctly handles cross-profile admins inviting same-profile users.
    // workspace.profileId already fetched at line 315 above.
    // Old code compared inviter.profileId vs target.profileId — wrong semantics when
    // a cross-profile admin invites a user who IS in the workspace's profile.
    const isSameProfile = workspace?.profileId && workspace.profileId === targetUser.profileId

    if (isSameProfile) {
        // Direct add for same-profile users (no Accept/Decline gate needed)
        await prisma.workspaceMember.create({
            data: {
                userId: targetUser.id,
                workspaceId,
                role,
            }
        })

        await audit({
            workspaceId,
            actorUserId: inviterId,
            action: 'member.joined',
            targetType: 'WorkspaceMember',
            targetId: targetUser.id,
            after: { username: targetUser.username, role, method: 'direct_add' },
        })

        // Notify (email + realtime). Direct-add path: invitationId='' nên
        // notification sẽ KHÔNG render Accept/Decline buttons — chỉ là info.
        await notifyInvitee({
            invitationId: '',  // empty = no Accept/Decline (already added)
            inviteeUserId: targetUser.id,
            inviterUserId: inviterId,
            workspaceId,
            role,
        }).catch((err) => console.warn('[inviteToWorkspace direct] notify failed:', err))

        revalidatePath(`/${workspaceId}/admin/members`)
        return { success: true, directAdd: true, username: targetUser.nickname || targetUser.username }
    }

    // Cross-profile: create OR refresh invitation
    try {
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 3600 * 1000)

        let invitation: { id: string }
        let isReinvite = false

        if (existingInvite) {
            // Re-invite: refresh expiresAt + update role/message + re-fire notification
            invitation = await prisma.workspaceInvitation.update({
                where: { id: existingInvite.id },
                data: {
                    role,
                    invitedById: inviterId,
                    message: message?.trim() || null,
                    expiresAt,
                    // Giữ status='PENDING' (đã PENDING từ trước)
                },
                select: { id: true },
            })
            isReinvite = true
        } else {
            invitation = await prisma.workspaceInvitation.create({
                data: {
                    workspaceId,
                    invitedUserId: targetUser.id,
                    role,
                    invitedById: inviterId,
                    message: message?.trim() || null,
                    expiresAt,
                },
                select: { id: true },
            })
        }

        await audit({
            workspaceId,
            actorUserId: inviterId,
            action: 'member.invited',
            targetType: 'WorkspaceInvitation',
            targetId: invitation.id,
            after: { targetUsername: targetUser.username, role, reinvite: isReinvite },
        })

        // Notify invitee + send email (best-effort). Re-invite cũng fire để
        // invitee nhận notification mới (đặc biệt cần cho legacy invitations
        // đã tạo trước feature notification).
        await notifyInvitee({
            invitationId: invitation.id,
            inviteeUserId: targetUser.id,
            inviterUserId: inviterId,
            workspaceId,
            role,
        }).catch((err) => console.warn('[inviteToWorkspace] notify failed:', err))

        revalidatePath(`/${workspaceId}/admin/members`)
        return {
            success: true,
            directAdd: false,
            reinvite: isReinvite,
            // [AUDIT invite-flow R4 — fix HIGH] Echo back the caller-supplied identifier, NOT the
            // resolved nickname/@username. On the CROSS-profile path the caller may have supplied
            // only an email; returning the resolved account's handle/nickname is an email→identity
            // de-anonymization (R2 stripped this from the consent-failure branch but missed this
            // success path). trimmedUsername is exactly what the caller already typed.
            username: trimmedUsername,
        }
    } catch (err: any) {
        if (err?.code === 'P2021') {
            // Fallback: if the invitation table doesn't exist, add directly — but ONLY for
            // same-profile users. [AUDIT invite-flow R2] A cross-profile direct-add here would
            // bypass the Accept/Decline consent gate, so refuse it rather than force-join.
            if (!isSameProfile) {
                return { error: 'Hệ thống lời mời tạm thời không khả dụng. Vui lòng thử lại sau.' }
            }
            await prisma.workspaceMember.create({
                data: {
                    userId: targetUser.id,
                    workspaceId,
                    role,
                }
            })
            revalidatePath(`/${workspaceId}/admin/members`)
            return { success: true, directAdd: true, username: targetUser.nickname || targetUser.username }
        }
        console.error('[inviteToWorkspace] error:', err)
        return { error: 'Lỗi khi mời thành viên.' }
    }
}

// [Canonical Clients 2026-06] `inviteClientToProfile` REMOVED — client
// accounts were replaced by public share links (ClientShareLink). Clients no
// longer get invited or log in; profile OWNER/ADMIN generates a tokenized
// /share/[token] URL from the Clients Manager instead (share-link-actions.ts).
// Pending isClientInvite invitations are revoked by
// scripts/deactivate-legacy-client-accounts.ts.

// ─── Accept workspace invitation ─────────────────────────────────
export async function acceptWorkspaceInvitation(invitationId: string) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }

    try {
        // [AUDIT invite-flow R2 — fix HIGH] accept/decline are the only write paths in the invite
        // flow that authenticate with getSession() alone (JWT decrypt) and skip verifyWorkspaceAccess.
        // Re-assert the account here so a LOCKED (banned) / CLIENT account, or a session revoked via
        // password-reset / "logout all devices" (sessionVersion bump), cannot mint a WorkspaceMember
        // + ProfileAccess(USER) row in another tenant's profile.
        const acceptingUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, sessionVersion: true },
        })
        if (!acceptingUser || acceptingUser.role === 'LOCKED' || acceptingUser.role === 'CLIENT') {
            return { error: 'Tài khoản không đủ điều kiện tham gia workspace (đã bị khóa hoặc là tài khoản khách).' }
        }
        if (((session.user as any).sessionVersion ?? 0) < (acceptingUser.sessionVersion ?? 0)) {
            return { error: 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.' }
        }

        // [F1 diagnostic + F3 smart-fallback] Before the CAS update, inspect the
        // invitation pointed to by the (possibly stale) notification. Common
        // failure modes — give precise messages, and when the user is clicking a
        // stale notification we silently substitute the FRESHEST PENDING
        // invitation for the same workspace so the click "just works".
        const probe = await prisma.workspaceInvitation.findUnique({
            where: { id: invitationId },
            select: { id: true, workspaceId: true, invitedUserId: true, status: true, expiresAt: true, isClientInvite: true, clientId: true, role: true },
        })

        let effectiveId = invitationId
        if (!probe) {
            return { error: 'Lời mời không tồn tại trong hệ thống. Vui lòng yêu cầu admin gửi lại.' }
        }
        if (probe.invitedUserId !== session.user.id) {
            // Wrong user — this can happen if there are duplicate accounts with
            // the same email (User.email is not @unique). Surface clearly.
            return { error: 'Lời mời này không dành cho tài khoản hiện tại. Hãy đăng nhập đúng email khách hàng đã dùng để nhận thư mời.' }
        }

        // [F4 idempotent-accept] If a previously-accepted invitation already
        // exists for this (workspaceId, invitedUserId), accepting THIS one would
        // INSERT/UPDATE a row that violates the @@unique([workspaceId,
        // invitedUserId, status]) constraint → Prisma P2002 → user sees the
        // misleading "Bạn đã là thành viên workspace này" error even though the
        // notification "just" appeared. Detect that case here, ensure their
        // existing membership / profile-access is intact (re-create if a prior
        // accept partially failed), then mark this PENDING invitation as
        // SUPERSEDED so it doesn't keep tripping the constraint, and return
        // success so the notification clears cleanly.
        const priorAccepted = await prisma.workspaceInvitation.findFirst({
            where: {
                workspaceId: probe.workspaceId,
                invitedUserId: session.user.id,
                status: 'ACCEPTED',
                id: { not: probe.id },
            },
            select: { id: true, isClientInvite: true, clientId: true, workspace: { select: { profileId: true, name: true } } },
        })
        if (priorAccepted) {
            // [AUDIT invite-flow R3 — fix HIGH] This branch is PURELY the idempotent "already a
            // member" short-circuit — it avoids the @@unique([workspaceId,invitedUserId,status])
            // collision a genuine double-accept would trip. It must NEVER re-grant access.
            //
            // The R2 version re-minted WorkspaceMember + ProfileAccess here when the user was no
            // longer a member, which let a REMOVED user replay a stale DECLINED/REVOKED/EXPIRED
            // invitation id (a lingering ACCEPTED row makes priorAccepted truthy) and silently
            // restore their own access BEFORE the status/expiry gate below ever ran (R3 High).
            //
            // Now: only short-circuit when the user is STILL a member; otherwise fall through to
            // the normal status/CAS flow, which grants access ONLY for a genuinely-valid PENDING
            // invitation. (Removal also now hard-deletes the user's invitation rows, so a stale
            // ACCEPTED row should not survive a proper removal — this is defense-in-depth, and it
            // means the legitimate "re-invite after removal" case flows through the normal CAS.)
            const stillMember = await prisma.workspaceMember.findUnique({
                where: { userId_workspaceId: { userId: session.user.id, workspaceId: probe.workspaceId } },
                select: { userId: true },
            })
            if (stillMember) {
                try {
                    if (probe.status === 'PENDING') {
                        await prisma.workspaceInvitation.updateMany({
                            where: { id: probe.id, status: 'PENDING' },
                            data: { status: 'EXPIRED', respondedAt: new Date() },
                        })
                    }
                } catch (e) {
                    console.warn('[acceptWorkspaceInvitation] idempotent-accept retire failed (non-fatal):', e)
                }
                return {
                    success: true,
                    workspaceId: probe.workspaceId,
                    workspaceName: priorAccepted.workspace.name,
                    alreadyMember: true,
                }
            }
            // stillMember === null → user was removed since the prior accept. Do NOT short-circuit
            // and do NOT re-mint; fall through so only a valid PENDING invitation can grant access.
        }

        if (probe.status !== 'PENDING' || probe.expiresAt <= new Date()) {
            // Stale — try to find a fresher PENDING invitation for this user +
            // workspace (admin probably re-invited after the old one expired /
            // was declined; the new one's notification just hasn't surfaced
            // visually yet).
            const fresher = await prisma.workspaceInvitation.findFirst({
                where: {
                    workspaceId: probe.workspaceId,
                    invitedUserId: session.user.id,
                    status: 'PENDING',
                    expiresAt: { gt: new Date() },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            })
            if (fresher) {
                console.warn(`[acceptWorkspaceInvitation] stale id=${invitationId} substituted with fresher id=${fresher.id}`)
                effectiveId = fresher.id
            } else {
                if (probe.expiresAt <= new Date()) {
                    return { error: 'Lời mời này đã hết hạn. Vui lòng yêu cầu admin gửi lại.' }
                }
                if (probe.status === 'DECLINED') {
                    return { error: 'Lời mời này đã bị từ chối trước đó. Yêu cầu admin gửi lại nếu cần.' }
                }
                if (probe.status === 'ACCEPTED') {
                    return { error: 'Lời mời này đã được chấp nhận trước đó.' }
                }
                return { error: `Lời mời ở trạng thái "${probe.status}" — không thể chấp nhận.` }
            }
        }

        // Atomic accept: use interactive transaction to prevent TOCTOU race.
        // The updateMany with status='PENDING' acts as a compare-and-swap lock:
        // if another concurrent request already accepted, updateMany returns count=0.
        const result = await prisma.$transaction(async (tx) => {
            // Atomically claim the invitation (CAS: only if still PENDING)
            const updated = await tx.workspaceInvitation.updateMany({
                where: {
                    id: effectiveId,
                    invitedUserId: session.user.id,
                    status: 'PENDING',
                    expiresAt: { gt: new Date() },
                },
                data: {
                    status: 'ACCEPTED',
                    respondedAt: new Date(),
                },
            })

            if (updated.count === 0) {
                // Concurrent accept between probe + CAS — surface plainly.
                return { error: 'Có một thao tác khác vừa xử lý lời mời này. Hãy refresh và thử lại.' }
            }

            // Now read the invitation for workspace info (safe — we own the lock)
            // Use effectiveId (may differ from invitationId when we substituted a
            // fresher invitation in the stale-notification fallback above).
            const invitation = await tx.workspaceInvitation.findUnique({
                where: { id: effectiveId },
                include: {
                    workspace: { select: { id: true, name: true, status: true, profileId: true } },
                    invitedBy: { select: { id: true, username: true, nickname: true } },
                }
            })

            if (!invitation) return { error: 'Lời mời không tồn tại.' }
            if (invitation.workspace.status !== 'ACTIVE') return { error: 'Workspace không còn hoạt động.' }

            // [Canonical Clients] Client invites are no longer accepted — the
            // account portal was replaced by public share links. Any legacy
            // PENDING isClientInvite row that slipped past the revoke script
            // gets refused here (the CAS above already marked it ACCEPTED;
            // refusing without granting access is the safe direction).
            if (invitation.isClientInvite) {
                return { error: 'Lời mời khách hàng đã ngừng hỗ trợ — agency sẽ gửi bạn link theo dõi dự án (không cần tài khoản).' }
            }

            // [Portal Audit M8 · Anti-mixed-state] If this is a STAFF invite but
            // the user is already a CLIENT of the workspace's profile, refuse.
            // Accepting would leave a WorkspaceMember row AND a PA(role=CLIENT)
            // row — an internally-inconsistent state that the fail-closed
            // CLIENT-layout guard would (correctly) keep redirecting to /portal,
            // while staff queries would still surface the user as a ghost member.
            // The admin must first revoke the CLIENT role explicitly.
            if (invitation.workspace.profileId) {
                const existingPA = await tx.profileAccess.findUnique({
                    where: { userId_profileId: { userId: session.user.id, profileId: invitation.workspace.profileId } },
                    select: { role: true },
                })
                if (existingPA?.role === 'CLIENT') {
                    return { error: 'Tài khoản này đang là CLIENT của profile — hãy gỡ vai trò CLIENT trước khi mời làm thành viên nội bộ.' }
                }
            }

            // [Z+1.fix5] Create membership — upsert pattern to prevent P2002 race.
            // Edge case: user was direct-added while invite was pending, OR
            // ensureWorkspaceMembership created orphan row via task assignment.
            // Upsert: if exists → keep existing role (don't downgrade); if not → create.
            await tx.workspaceMember.upsert({
                where: {
                    userId_workspaceId: {
                        userId: session.user.id,
                        workspaceId: invitation.workspaceId,
                    }
                },
                create: {
                    userId: session.user.id,
                    workspaceId: invitation.workspaceId,
                    role: invitation.role,
                },
                update: {},  // don't override existing role (ADMIN stays ADMIN)
            })

            // [Z+1.fix5] Grant ProfileAccess — upsert pattern (bulletproof).
            // Without this, user has WorkspaceMember but is INVISIBLE in
            // profile-scoped queries (assignee picker, admin user list, etc.).
            if (invitation.workspace.profileId) {
                await tx.profileAccess.upsert({
                    where: {
                        userId_profileId: {
                            userId: session.user.id,
                            profileId: invitation.workspace.profileId,
                        }
                    },
                    create: {
                        userId: session.user.id,
                        profileId: invitation.workspace.profileId,
                        role: 'USER',
                    },
                    update: {},  // don't override existing role
                })
            }

            return {
                success: true,
                workspaceId: invitation.workspaceId,
                workspaceName: invitation.workspace.name,
                role: invitation.role,
                inviterId: invitation.invitedBy?.id ?? null,
                inviteeName: session.user.nickname || session.user.username || 'Một thành viên',
            }
        })

        if ('error' in result) return result

        // [Z+1.fix2] Audit best-effort — KHÔNG fail accept flow nếu audit throw.
        // Trước đây audit() ở trong try/catch chính → fail = user thấy "Lỗi khi chấp nhận lời mời"
        // dù transaction đã commit thành công. Workspace member + ProfileAccess đã tạo trong DB,
        // chỉ audit/notification gặp issue.
        try {
            await audit({
                workspaceId: result.workspaceId!,
                actorUserId: session.user.id,
                action: 'member.joined',
                targetType: 'WorkspaceMember',
                targetId: session.user.id,
                after: { role: result.role, method: 'invitation_accepted' },
            })
        } catch (auditErr) {
            console.warn('[acceptWorkspaceInvitation] audit failed (non-fatal):', auditErr)
        }

        // Notify the inviter (best-effort, don't block on failure)
        if (result.inviterId) {
            try {
                const { createNotificationInternal } = await import('./notification-actions')
                const { broadcastNotificationToUser } = await import('@/lib/notification-broadcast')
                const notif = await createNotificationInternal({
                    userId: result.inviterId,
                    type: 'WORKSPACE_INVITATION_ACCEPTED',
                    title: 'Đã có thành viên mới',
                    body: `${result.inviteeName} đã tham gia workspace "${result.workspaceName}".`,
                    actorId: session.user.id,
                    metadata: { workspaceId: result.workspaceId, role: result.role },
                })
                if (notif) {
                    broadcastNotificationToUser(result.inviterId, notif as any).catch(() => { })
                }
            } catch (e) {
                console.warn('[acceptWorkspaceInvitation] notify inviter failed:', e)
            }
        }

        // [Z+1.fix2] revalidatePath also best-effort
        try {
            revalidatePath(`/${result.workspaceId}/admin/members`)
            revalidatePath('/workspace')
        } catch (revalErr) {
            console.warn('[acceptWorkspaceInvitation] revalidate failed (non-fatal):', revalErr)
        }

        return { success: true, workspaceId: result.workspaceId, workspaceName: result.workspaceName }
    } catch (err: any) {
        // [Z+1.fix2] Better error messaging — Prisma-aware + log full detail
        console.error('[acceptWorkspaceInvitation] error:', {
            code: err?.code,
            message: err?.message,
            meta: err?.meta,
            stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
        })

        // Prisma-specific errors
        if (err?.code === 'P2002') return { error: 'Bạn đã là thành viên workspace này.' }
        if (err?.code === 'P2025') return { error: 'Workspace hoặc lời mời không tồn tại / đã bị xóa.' }
        if (err?.code === 'P2003') return { error: 'Reference dữ liệu không hợp lệ (FK constraint).' }

        // Fallback với hint debug
        const detail = err?.message?.slice(0, 80) || 'unknown'
        return { error: `Lỗi khi chấp nhận lời mời: ${detail}` }
    }
}

// ─── Decline workspace invitation ────────────────────────────────
export async function declineWorkspaceInvitation(invitationId: string) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }

    try {
        // [AUDIT invite-flow R2 — fix] Re-assert the account on this getSession()-only write path:
        // reject a LOCKED account or a stale/revoked session (sessionVersion bumped) from mutating
        // invitation state.
        const decliningUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true, sessionVersion: true },
        })
        if (!decliningUser || decliningUser.role === 'LOCKED') {
            return { error: 'Tài khoản đã bị khóa hoặc không tồn tại.' }
        }
        if (((session.user as any).sessionVersion ?? 0) < (decliningUser.sessionVersion ?? 0)) {
            return { error: 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.' }
        }

        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { id: invitationId },
            include: {
                workspace: { select: { name: true } },
                invitedBy: { select: { id: true, username: true } },
            }
        })

        if (!invitation) return { error: 'Lời mời không tồn tại.' }
        if (invitation.invitedUserId !== session.user.id) return { error: 'Forbidden' }
        if (invitation.status !== 'PENDING') return { error: 'Lời mời đã được xử lý.' }

        await prisma.workspaceInvitation.update({
            where: { id: invitationId },
            data: { status: 'DECLINED', respondedAt: new Date() }
        })

        // Notify the inviter
        if (invitation.invitedBy?.id) {
            try {
                const { createNotificationInternal } = await import('./notification-actions')
                const { broadcastNotificationToUser } = await import('@/lib/notification-broadcast')
                const inviteeName = session.user.nickname || session.user.username || 'Một người'
                const notif = await createNotificationInternal({
                    userId: invitation.invitedBy.id,
                    type: 'WORKSPACE_INVITATION_DECLINED',
                    title: 'Lời mời bị từ chối',
                    body: `${inviteeName} đã từ chối lời mời tham gia "${invitation.workspace.name}".`,
                    actorId: session.user.id,
                    metadata: { workspaceId: invitation.workspaceId, role: invitation.role },
                })
                if (notif) {
                    broadcastNotificationToUser(invitation.invitedBy.id, notif as any).catch(() => { })
                }
            } catch (e) {
                console.warn('[declineWorkspaceInvitation] notify inviter failed:', e)
            }
        }

        // [Z+1.fix2] revalidatePath best-effort
        try {
            revalidatePath(`/${invitation.workspaceId}/admin/members`)
        } catch (revalErr) {
            console.warn('[declineWorkspaceInvitation] revalidate failed (non-fatal):', revalErr)
        }
        return { success: true }
    } catch (err: any) {
        console.error('[declineWorkspaceInvitation] error:', {
            code: err?.code,
            message: err?.message,
            meta: err?.meta,
        })

        if (err?.code === 'P2025') return { error: 'Lời mời không tồn tại / đã bị xóa.' }
        if (err?.code === 'P2003') return { error: 'Reference dữ liệu không hợp lệ.' }

        const detail = err?.message?.slice(0, 80) || 'unknown'
        return { error: `Lỗi khi từ chối lời mời: ${detail}` }
    }
}

// ─── Revoke a pending invitation ─────────────────────────────────
export async function revokeWorkspaceInvitation(workspaceId: string, invitationId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    try {
        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { id: invitationId }
        })

        if (!invitation) return { error: 'Lời mời không tồn tại.' }
        if (invitation.workspaceId !== workspaceId) return { error: 'Forbidden' }
        if (invitation.status !== 'PENDING') return { error: 'Lời mời đã được xử lý.' }

        await prisma.workspaceInvitation.update({
            where: { id: invitationId },
            data: { status: 'REVOKED', respondedAt: new Date() }
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'member.invitation_revoked',
            targetType: 'WorkspaceInvitation',
            targetId: invitationId,
            after: { invitedUserId: invitation.invitedUserId },
        })

        revalidatePath(`/${workspaceId}/admin/members`)
        return { success: true }
    } catch (err: any) {
        console.error('[revokeWorkspaceInvitation] error:', err)
        return { error: 'Lỗi khi thu hồi lời mời.' }
    }
}

// ─── Change a member's workspace role ────────────────────────────
export async function changeWorkspaceMemberRole(
    workspaceId: string,
    targetUserId: string,
    newRole: WorkspaceRole
) {
    const { userId: actorId, workspaceRole: actorRole, isGlobalAdmin } =
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    if (!isWorkspaceRole(newRole)) {
        return { error: 'Vai trò không hợp lệ.' }
    }

    // Can't change own role (use transfer ownership instead)
    if (actorId === targetUserId) {
        return { error: 'Bạn không thể tự đổi vai trò. Hãy dùng chức năng chuyển quyền sở hữu.' }
    }

    // OWNER role must use transferOwnership
    if (newRole === 'OWNER') {
        return { error: 'Sử dụng chức năng "Chuyển quyền sở hữu" để chỉ định OWNER mới.' }
    }

    // Find target membership first — need oldRole for all permission checks
    const targetMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        include: {
            user: { select: { username: true, nickname: true } }
        }
    })

    if (!targetMember) return { error: 'Người dùng không phải thành viên workspace này.' }

    const oldRole = targetMember.role

    // PERMISSION: Only OWNER (or global admin) can touch ADMIN-level members.
    // This covers BOTH promoting TO admin AND demoting FROM admin.
    if (!isGlobalAdmin && actorRole !== 'OWNER') {
        if (newRole === 'ADMIN' || oldRole === 'ADMIN' || oldRole === 'OWNER') {
            return { error: 'Chỉ OWNER mới có quyền thay đổi vai trò ADMIN/OWNER.' }
        }
    }

    // Protect last OWNER
    if (oldRole === 'OWNER') {
        try {
            await ensureNotLastOwner(workspaceId, targetUserId)
        } catch (err) {
            if (err instanceof LastOwnerProtectionError) {
                return { error: err.message }
            }
            throw err
        }
    }

    await prisma.workspaceMember.update({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        data: { role: newRole }
    })

    await audit({
        workspaceId,
        actorUserId: actorId,
        action: 'member.role_changed',
        targetType: 'WorkspaceMember',
        targetId: targetUserId,
        before: { role: oldRole, username: targetMember.user.username },
        after: { role: newRole },
    })

    revalidatePath(`/${workspaceId}/admin/members`)
    return { success: true }
}

// ─── Remove a member from workspace ──────────────────────────────
export async function removeWorkspaceMember(workspaceId: string, targetUserId: string) {
    const { userId: actorId, workspaceRole: actorRole, isGlobalAdmin } =
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    if (actorId === targetUserId) {
        return { error: 'Sử dụng "Rời khỏi workspace" để tự rời.' }
    }

    const targetMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        include: {
            user: { select: { username: true, nickname: true, profileId: true } }
        }
    })

    if (!targetMember) return { error: 'Người dùng không phải thành viên workspace này.' }

    // Can't remove OWNER unless you're also OWNER or global admin
    if (targetMember.role === 'OWNER' && !isGlobalAdmin && actorRole !== 'OWNER') {
        return { error: 'Chỉ OWNER mới có quyền xóa OWNER khác.' }
    }

    // Can't remove ADMIN unless you're OWNER or global admin
    if (targetMember.role === 'ADMIN' && !isGlobalAdmin && actorRole !== 'OWNER') {
        return { error: 'Chỉ OWNER mới có quyền xóa ADMIN.' }
    }

    // Protect last OWNER
    if (targetMember.role === 'OWNER') {
        try {
            await ensureNotLastOwner(workspaceId, targetUserId)
        } catch (err) {
            if (err instanceof LastOwnerProtectionError) {
                return { error: err.message }
            }
            throw err
        }
    }

    // [AUDIT invite-flow R1 — fix HIGH] A cross-profile invitee's accept minted a
    // ProfileAccess(role=USER) for THIS workspace's profile, and that PA grants MEMBER access
    // to EVERY workspace in the profile via the verifyWorkspaceAccess fallback. Deleting only
    // the WorkspaceMember row leaves that PA behind, so the "removed" external user silently
    // keeps profile-wide access. When the removed user is a CROSS-profile invitee (home profile
    // differs), holds a plain USER ProfileAccess, and has no OTHER WorkspaceMember row in this
    // profile, also revoke that PA. Never strip a home-profile member or an OWNER/ADMIN/CLIENT PA.
    const removalWorkspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    let alsoRevokeProfileAccess = false
    if (
        removalWorkspace?.profileId &&
        targetMember.user.profileId &&
        removalWorkspace.profileId !== targetMember.user.profileId
    ) {
        const targetPA = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId: targetUserId, profileId: removalWorkspace.profileId } },
            select: { role: true },
        })
        // [AUDIT invite-flow R6 — fix HIGH] Fail-safe-CLOSED: when a cross-profile USER has NO
        // remaining WorkspaceMember row in the profile, revoke their USER ProfileAccess so a
        // removed user cannot keep tenant-wide MEMBER access via the verifyWorkspaceAccess
        // PA->MEMBER fallback (security.ts).
        //
        // The R5 attempt to preserve a separately-granted profile membership via
        // `grantedAt >= joinedAt` was UNSOUND: PA.grantedAt is frozen at the user's FIRST
        // accept-join for the profile (the accept-time PA upsert is a no-op on later accepts), so
        // removing a MULTI-workspace invitee's later-joined workspace LAST wrongly skipped the
        // revoke and re-opened the removal bypass (R6 High). The two legitimate PA provenances
        // (workspace-accept vs direct profile-invite) are indistinguishable in current state
        // without a schema column, so we choose the SAFE (deny, not leak) direction.
        //
        // Blast radius of the resulting over-revoke is narrow: a directly profile-invited member
        // with NO workspace membership is NEVER reached here (this path requires a WorkspaceMember
        // row); only a profile member who ALSO held explicit workspace membership(s) and is removed
        // from ALL of them loses their profile grant — recoverable (OWNER re-invites via
        // inviteToProfileAction). ADMIN/OWNER/CLIENT PAs are never touched (role==='USER' gate).
        if (targetPA?.role === 'USER') {
            const otherMemberships = await prisma.workspaceMember.count({
                where: {
                    userId: targetUserId,
                    workspaceId: { not: workspaceId },
                    workspace: { profileId: removalWorkspace.profileId },
                },
            })
            if (otherMemberships === 0) alsoRevokeProfileAccess = true
        }
    }

    // [AUDIT R14 + invite-flow R3 — fix HIGH] Remove the membership AND HARD-DELETE all of this
    // user's invitation rows for the workspace in the same transaction. The R14 fix only revoked
    // PENDING invites, but a lingering ACCEPTED/DECLINED row could later be replayed through
    // acceptWorkspaceInvitation's priorAccepted branch to silently re-mint membership (R3 High).
    // Deleting every (workspaceId, invitedUserId) row removes that replay trigger entirely — and
    // because the @@unique([workspaceId,invitedUserId,status]) constraint makes "set all to one
    // terminal status" collision-prone, deleteMany is also the cleanest revoke.
    const removalOps: any[] = [
        // [AUDIT invite-flow R5 — fix] deleteMany (not delete) so a concurrent double-remove is a
        // no-op (count=0) instead of throwing P2025 and rolling back the invitation hard-delete.
        // targetMember existence was already validated above.
        prisma.workspaceMember.deleteMany({
            where: { userId: targetUserId, workspaceId },
        }),
        prisma.workspaceInvitation.deleteMany({
            where: { workspaceId, invitedUserId: targetUserId },
        }),
    ]
    if (alsoRevokeProfileAccess && removalWorkspace?.profileId) {
        // [AUDIT invite-flow R2 — fix] deleteMany (not delete) so a concurrent removal of the
        // same ProfileAccess row is a no-op (count=0) instead of throwing P2025 and rolling back
        // the entire removal transaction (which would silently leave the member in place).
        removalOps.push(
            prisma.profileAccess.deleteMany({
                where: { userId: targetUserId, profileId: removalWorkspace.profileId },
            }),
        )
    }
    await prisma.$transaction(removalOps)

    await audit({
        workspaceId,
        actorUserId: actorId,
        action: 'member.removed',
        targetType: 'WorkspaceMember',
        targetId: targetUserId,
        before: { role: targetMember.role, username: targetMember.user.username },
    })

    revalidatePath(`/${workspaceId}/admin/members`)
    return { success: true }
}

// ─── Leave workspace (self-remove) ───────────────────────────────
export async function leaveWorkspace(workspaceId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    // Protect last OWNER
    try {
        await ensureNotLastOwner(workspaceId, userId)
    } catch (err) {
        if (err instanceof LastOwnerProtectionError) {
            return { error: 'Bạn là OWNER duy nhất. Hãy chuyển quyền sở hữu trước khi rời.' }
        }
        throw err
    }

    const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        include: { user: { select: { username: true, profileId: true } } }
    })

    if (!member) return { error: 'Bạn không phải thành viên workspace này.' }

    // [AUDIT invite-flow R4 — fix] Mirror removeWorkspaceMember on self-leave: (1) hard-delete the
    // leaver's invitation rows for this workspace so a future re-invite's accept doesn't collide on
    // @@unique([workspaceId,invitedUserId,status]); (2) revoke the invite-minted ProfileAccess(USER)
    // when the leaver is a CROSS-profile invitee with no other membership in the profile, so
    // "leaving" actually revokes the profile-wide MEMBER fallback rather than leaving it behind.
    const leaveWs = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    let alsoRevokeProfileAccess = false
    if (leaveWs?.profileId && member.user.profileId && leaveWs.profileId !== member.user.profileId) {
        const targetPA = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId: leaveWs.profileId } },
            select: { role: true },
        })
        // [AUDIT invite-flow R6 — fix HIGH] Fail-safe-CLOSED, symmetric with removeWorkspaceMember:
        // revoke a cross-profile USER's ProfileAccess when they have no remaining WorkspaceMember
        // in the profile. The R5 grantedAt>=joinedAt heuristic was unsound (grantedAt is frozen at
        // the first accept-join, so leaving a later-joined workspace last skipped the revoke and
        // re-opened the bypass). See the full rationale at removeWorkspaceMember.
        if (targetPA?.role === 'USER') {
            const otherMemberships = await prisma.workspaceMember.count({
                where: { userId, workspaceId: { not: workspaceId }, workspace: { profileId: leaveWs.profileId } },
            })
            if (otherMemberships === 0) alsoRevokeProfileAccess = true
        }
    }

    const leaveOps: any[] = [
        prisma.workspaceMember.delete({
            where: { userId_workspaceId: { userId, workspaceId } }
        }),
        prisma.workspaceInvitation.deleteMany({
            where: { workspaceId, invitedUserId: userId },
        }),
    ]
    if (alsoRevokeProfileAccess && leaveWs?.profileId) {
        leaveOps.push(
            prisma.profileAccess.deleteMany({
                where: { userId, profileId: leaveWs.profileId },
            }),
        )
    }
    await prisma.$transaction(leaveOps)

    await audit({
        workspaceId,
        actorUserId: userId,
        action: 'member.left',
        targetType: 'WorkspaceMember',
        targetId: userId,
        before: { role: member.role, username: member.user.username },
    })

    revalidatePath('/workspace')
    return { success: true }
}

// ─── Get users available to invite (workspace's profile members, not already workspace members) ──
export async function getAvailableUsersForInvite(workspaceId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    // [Z+1.fix5] Use workspace's profileId (not inviter's home profileId).
    // This ensures the "select mode" list matches admin page behavior
    // (workspacePrisma queries OR: [{profileId}, {profileAccesses}]).
    // Also include users with ProfileAccess to workspace's profile — they are
    // legitimate profile members (e.g. cross-team invitees who already have access).
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })

    // Fallback to inviter's profileId if workspace has no profile (edge case)
    let profileId = ws?.profileId
    if (!profileId) {
        const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        profileId = currentUser?.profileId
    }

    if (!profileId) return { users: [] }

    // Get existing member IDs
    const existingMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true }
    })
    const memberIds = new Set(existingMembers.map(m => m.userId))

    // [Z+1.fix5] Include users with ProfileAccess to workspace's profile
    // (consistent with admin page user list behavior via workspacePrisma middleware).
    // This ensures users who were granted ProfileAccess (e.g. via accept invitation)
    // show up in the invite "select" mode list.
    const availableUsers = await prisma.user.findMany({
        where: {
            OR: [
                { profileId },
                { profileAccesses: { some: { profileId } } },
            ],
            role: { not: 'LOCKED' },
        },
        select: {
            id: true,
            username: true,
            displayName: true,
            nickname: true,
            email: true,
            avatarUrl: true,
            role: true,
        },
        orderBy: { username: 'asc' }
    })

    return {
        users: availableUsers.filter(u => !memberIds.has(u.id) && u.id !== userId)
    }
}
