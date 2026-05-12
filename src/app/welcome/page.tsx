import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isProfileOwner } from '@/lib/profile-permissions'
import WelcomeClient from './WelcomeClient'

/**
 * Welcome page — landing screen sau khi user tạo profile mới (chưa có workspace).
 *
 * Replaces the "kicked to /login" bug where `handleProfileSwitch` returned
 * null workspaceId for empty profiles, causing redirect to login.
 *
 * Guards:
 *   - Phải đăng nhập → else /login
 *   - Phải có sessionProfileId set → else /login (ko vô profile-less state)
 *   - Profile phải tồn tại trong DB → else /login (deleted profile)
 *   - Nếu profile ĐÃ CÓ workspaces → redirect tới workspace đầu (avoid stuck on welcome)
 *   - Else (0 workspaces): render welcome UI với "+" button
 */
export default async function WelcomePage() {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }
    const userId = session.user.id

    const profileId = (session.user as any).sessionProfileId as string | null | undefined
    if (!profileId) {
        redirect('/login')
    }

    // Verify profile still exists (deleted profile edge case)
    const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: { id: true, name: true },
    })
    if (!profile) {
        redirect('/login')
    }

    // If profile already has workspaces, user shouldn't be on welcome → redirect to first
    const firstWorkspace = await prisma.workspace.findFirst({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    })
    if (firstWorkspace) {
        // Determine view based on user's role in that workspace
        const member = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId: firstWorkspace.id } },
            select: { role: true },
        })
        const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN' || session.user.role === 'ADMIN'
        redirect(`/${firstWorkspace.id}/${isAdmin ? 'admin' : 'dashboard'}`)
    }

    // [Sprint Y] Gate "+" button visibility — only home-profile owner can create.
    // Cross-team invitees see read-only message asking to contact profile owner.
    const canCreateWorkspace = await isProfileOwner(userId, profileId)

    return <WelcomeClient profileName={profile.name} canCreateWorkspace={canCreateWorkspace} />
}
