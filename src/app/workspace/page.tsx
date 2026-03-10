import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { WorkspaceCard } from './_components/WorkspaceCard'
import { CreateWorkspaceModal } from './_components/CreateWorkspaceModal'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search } from 'lucide-react'
import { cookies } from 'next/headers'

export default async function WorkspacePage() {
    const session = await getSession()
    if (!session?.user) {
        redirect('/login')
    }

    const { id: userId, username } = session.user

    // --- PAGE-LEVEL PROFILE GUARD ---
    const cookieStore = await cookies()
    const profileId = cookieStore.get('current_profile_id')?.value

    if (!profileId) {
        console.log(`[WorkspacePage] No profileId found for ${username}, redirecting to /profile`)
        redirect('/profile')
    }

    // Fetch workspaces filtered by profileId
    const allWorkspaces = await prisma.workspace.findMany({
        where: { profileId },
        orderBy: {
            createdAt: 'desc'
        }
    })

    // Fetch user's specific memberships
    const userMemberships = await prisma.workspaceMember.findMany({
        where: { userId }
    })

    const membershipMap = new Map(userMemberships.map(m => [m.workspaceId, m.role]))

    const serializedWorkspaces = allWorkspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        description: ws.description,
        updatedAt: ws.updatedAt.toISOString(),
        createdAt: ws.createdAt.toISOString()
    }))

    return (
        <div className="min-h-screen bg-[#020617] text-slate-50 font-sans selection:bg-indigo-500/30">
            <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <Avatar className="h-10 w-10 border border-slate-700 shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">
                            {(username || 'U').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <h1 className="text-xl font-semibold tracking-tight"><span className="text-indigo-400">{username}</span>'s Account</h1>
                </div>

                <div className="hidden md:flex flex-1 max-w-md mx-8">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search workspaces..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-full py-2 pl-10 pr-4 text-sm outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-200 placeholder:text-slate-500 shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-sm text-neutral-400 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 font-medium">
                        Agency Manager
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10">
                <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
                    <h2 className="text-2xl font-medium tracking-tight">Your Workspaces</h2>
                    <div className="flex gap-2 text-sm font-medium text-slate-400">
                        <span className="cursor-pointer hover:text-white transition-colors bg-slate-800/50 px-3 py-1.5 rounded-md">Grid</span>
                        <span className="cursor-pointer hover:text-white transition-colors px-3 py-1.5 rounded-md">List</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {serializedWorkspaces.map((ws) => (
                        <WorkspaceCard
                            key={ws.id}
                            workspace={ws as any}
                            role={membershipMap.get(ws.id) || 'MEMBER'}
                            userGlobalRole={session.user.role}
                        />
                    ))}

                    {session.user.role === 'ADMIN' && <CreateWorkspaceModal />}
                </div>
            </main>
        </div>
    )
}
