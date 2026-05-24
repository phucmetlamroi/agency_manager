import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import PresenceTracker from '@/components/tracking/PresenceTracker'
import ImpersonationBanner from '@/components/layout/ImpersonationBanner'
import { ChatProvider } from '@/components/chat/ChatProvider'
import { ChatFloatingPanel } from '@/components/chat/ChatFloatingPanel'
import { MarketplaceProvider } from '@/components/marketplace/MarketplaceProvider'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { needsUsernameMigration } from '@/lib/username-validation'
import { UsernameMigrationModal } from '@/components/auth/UsernameMigrationModal'

export default async function WorkspaceLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }

    const { workspaceId } = await params

    // [Z+1.fix3] Session profileId backfill — handle legacy session hoặc cross-profile navigation.
    // Trước đây: nếu session.sessionProfileId null → redirect /login (sập UX cho legacy users).
    // Giờ: tìm ProfileAccess đầu tiên của user → dùng làm fallback profileId cho rendering.
    let profileId = (session.user as any).sessionProfileId as string | null | undefined
    if (!profileId) {
        try {
            const firstAccess = await prisma.profileAccess.findFirst({
                where: { userId: session.user.id },
                select: { profileId: true },
                orderBy: { grantedAt: 'asc' },
            })
            profileId = firstAccess?.profileId ?? null
        } catch (e) {
            console.warn('[WorkspaceLayout] ProfileAccess fallback lookup failed:', e)
        }
        if (!profileId) {
            // User thực sự không có access → redirect login để re-select profile
            console.warn(`[WorkspaceLayout] User ${session.user.id} has no ProfileAccess — redirect login`)
            redirect('/login')
        }
    }

    // [Z+1.fix3] Verify workspace exists + belongs to a profile user can access.
    // Trước đây không check → workspaceId không hợp lệ throw downstream với error khó debug.
    let workspaceCheck: { id: string; profileId: string | null } | null = null
    try {
        workspaceCheck = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, profileId: true },
        })
    } catch (e) {
        console.error('[WorkspaceLayout] workspace lookup failed:', e)
    }

    if (!workspaceCheck) {
        // Workspace không tồn tại / đã bị xóa → 404 thay vì sập với "unexpected response"
        notFound()
    }

    // [Z+1.fix3] If workspace's profile khác sessionProfileId, verify user có ProfileAccess.
    // Use workspace's profile cho data context (correct cho cross-profile navigation).
    if (workspaceCheck.profileId && workspaceCheck.profileId !== profileId) {
        try {
            const xAccess = await prisma.profileAccess.findUnique({
                where: {
                    userId_profileId: {
                        userId: session.user.id,
                        profileId: workspaceCheck.profileId,
                    },
                },
                select: { profileId: true },
            })
            if (xAccess) {
                // User có access tới workspace's profile → switch context
                profileId = xAccess.profileId
            }
            // Nếu không có access → để verifyWorkspaceAccess trong downstream catch + report properly
        } catch (e) {
            console.warn('[WorkspaceLayout] cross-profile access check failed:', e)
        }
    }

    // Prefetch marketplace task count for badge UX (non-blocking if fails)
    let marketplaceCount = 0
    try {
        const wsPrisma = getWorkspacePrisma(workspaceId, profileId)
        marketplaceCount = await (wsPrisma as any).task.count({
            where: { assigneeId: null, isArchived: false },
        })
    } catch { /* ignore — badge starts at 0 */ }

    // [Username Handle] Check if user needs forced migration to new ASCII handle.
    // Triggered when: usernameSetByUser=false OR username has diacritic / email-like / pattern mismatch.
    let usernameMigrationNeeded = false
    let migrationUserData: { username: string; displayName: string | null } | null = null
    try {
        const userForMigrationCheck = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { username: true, usernameSetByUser: true, displayName: true },
        })
        if (userForMigrationCheck) {
            usernameMigrationNeeded = needsUsernameMigration(
                userForMigrationCheck.username,
                userForMigrationCheck.usernameSetByUser,
            )
            migrationUserData = {
                username: userForMigrationCheck.username,
                displayName: userForMigrationCheck.displayName,
            }
        }
    } catch (e) {
        console.warn('[WorkspaceLayout] username migration check failed:', e)
    }

    // We can inject the workspaceId context down if needed,
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <ChatProvider userId={session.user.id}>
            <div className="workspace-container h-full w-full relative flex flex-col">
                {session.user.isImpersonating && (
                    <ImpersonationBanner
                        username={(session.user as any).displayName || session.user.nickname || session.user.username}
                        workspaceId={workspaceId}
                    />
                )}
                <PresenceTracker currentUserId={session.user.id} />
                <div className="flex-1 min-h-0 overflow-hidden relative">
                    {children}
                </div>
                <ChatFloatingPanel workspaceId={workspaceId} profileId={profileId} />
                {/* Marketplace modal portal — opened by Store icon in top-bars (event mode) */}
                <MarketplaceProvider
                    workspaceId={workspaceId}
                    initialTaskCount={marketplaceCount}
                    triggerMode="event"
                />
                {/* [Username Handle] Forced migration modal — blocks UI until user picks new handle */}
                {usernameMigrationNeeded && migrationUserData && (
                    <UsernameMigrationModal
                        currentUsername={migrationUserData.username}
                        displayName={migrationUserData.displayName}
                    />
                )}
            </div>
        </ChatProvider>
    )
}
