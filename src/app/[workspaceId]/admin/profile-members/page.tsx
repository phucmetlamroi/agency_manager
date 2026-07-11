import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getProfileMembers } from '@/actions/profile-member-actions'
import { getProfileRole } from '@/lib/profile-permissions'
import { resolveActiveProfileId } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { isMobileDevice } from '@/lib/device'
import ProfileMembersPanel from '@/components/profile/ProfileMembersPanel'
import MobileProfileMembersList from '@/components/admin/MobileProfileMembersList'

/**
 * [Sprint Z] Profile Members management page.
 *
 * Permission gate:
 *   - USER: redirect (chỉ xem qua API, không có UI)
 *   - ADMIN: read-only view + có thể invite member
 *   - OWNER: full management (invite, remove, change role, transfer ownership, grant workspace access)
 */
export default async function ProfileMembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const userId = session.user.id

    // Get profile from current workspace context.
    // [Task-loss A1] Reconcile with the workspace's OWN profile — see resolveActiveProfileId.
    const profileId = await resolveActiveProfileId(userId, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')

    const role = await getProfileRole(userId, profileId)
    if (!role || role === 'USER') {
        // USER không có UI quản lý
        redirect(`/${workspaceId}/dashboard`)
    }

    const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
            id: true,
            name: true,
            bannerUrl: true,
            logoUrl: true,
            settings: true,
            status: true as any,
        } as any,
    }) as any
    if (!profile) redirect('/login')

    // [Sprint Z+1] Block if profile is soft-deleted (shouldn't be reachable but defensive)
    if (profile.status === 'SOFT_DELETED') {
        redirect(`/${workspaceId}/admin/profile-trash`)
    }

    const { error, members } = await getProfileMembers(profileId)
    if (error) {
        return (
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <h2 className="title-gradient">Thành viên tổ chức</h2>
                <p style={{ color: '#ef4444', marginTop: 16 }}>{error}</p>
            </div>
        )
    }

    // [Mobile P4.2 / M8] Dispatcher UA: mobile → card/row roster; desktop giữ
    // ProfileMembersPanel NGUYÊN VẸN (nhánh return desktop bên dưới không đổi 1 byte).
    // Tái dùng cùng dữ liệu members + role đã tính; server action giữ nguyên chữ ký.
    if (await isMobileDevice()) {
        return (
            <MobileProfileMembersList
                profileId={profileId}
                profileName={profile.name}
                workspaceId={workspaceId}
                members={members}
                currentUserId={userId}
                currentUserRole={role}
            />
        )
    }

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="title-gradient" style={{ marginBottom: 4 }}>
                    Thành viên tổ chức
                </h2>
                <p style={{ color: '#71717A', fontSize: 13 }}>
                    Quản lý thành viên trong <strong style={{ color: '#A1A1AA' }}>{profile.name}</strong>
                </p>
            </div>
            <ProfileMembersPanel
                profileId={profileId}
                profileName={profile.name}
                workspaceId={workspaceId}
                members={members}
                currentUserId={userId}
                currentUserRole={role}
                profileSettings={{
                    name: profile.name,
                    bannerUrl: profile.bannerUrl ?? null,
                    logoUrl: profile.logoUrl ?? null,
                    portalAccent: (profile.settings && typeof profile.settings === 'object' && !Array.isArray(profile.settings)
                        ? ((profile.settings as any).portalAccent ?? null)
                        : null),
                }}
            />
        </div>
    )
}
