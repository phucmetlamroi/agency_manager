import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getProfileMembers } from '@/actions/profile-member-actions'
import { getProfileRole } from '@/lib/profile-permissions'
import { prisma } from '@/lib/db'
import ProfileMembersPanel from '@/components/profile/ProfileMembersPanel'

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

    // Get profile from current workspace context
    const profileId = (session.user as any).sessionProfileId as string | null | undefined
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
                <h2 className="title-gradient">Profile Members</h2>
                <p style={{ color: '#ef4444', marginTop: 16 }}>{error}</p>
            </div>
        )
    }

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="title-gradient" style={{ marginBottom: 4 }}>
                    Profile Members
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
                }}
            />
        </div>
    )
}
