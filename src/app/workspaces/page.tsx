import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { WorkspaceCard } from './_components/WorkspaceCard'
import { CreateWorkspaceModal } from './_components/CreateWorkspaceModal'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search } from 'lucide-react'

export default async function WorkspacesPage() {
    const session = await getSession()
    if (!session?.user) {
        redirect('/login')
    }

    const { id: userId, username } = session.user

    // Fetch workspaces the user is a member of
    const memberships = await prisma.workspaceMember.findMany({
        where: { userId },
        include: {
            workspace: true
        },
        orderBy: {
            workspace: {
                createdAt: 'desc'
            }
        }
    })

    return (
        <div className="min-h-screen bg-[#020617] text-slate-50 font-sans selection:bg-indigo-500/30">
            {/* Global Header (Frame.io Style) */}
            <header className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-md">
                <div className="flex items-center gap-6">
                    <Avatar className="h-10 w-10 border border-slate-700 shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold">
                            {username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <h1 className="text-xl font-semibold tracking-tight">Tài khoản của <span className="text-indigo-400">{username}</span></h1>
                </div>

                <div className="hidden md:flex flex-1 max-w-md mx-8">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm workspace..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-full py-2 pl-10 pr-4 text-sm outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-slate-200 placeholder:text-slate-500 shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-sm text-slate-400 px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 font-medium">
                        Agency Manager
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-6 py-10">

                {/* Visual Toolbar */}
                <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-4">
                    <h2 className="text-2xl font-medium tracking-tight">Không gian làm việc</h2>
                    <div className="flex gap-2 text-sm font-medium text-slate-400">
                        <span className="cursor-pointer hover:text-white transition-colors bg-slate-800/50 px-3 py-1.5 rounded-md">Lưới</span>
                        <span className="cursor-pointer hover:text-white transition-colors px-3 py-1.5 rounded-md">Danh sách</span>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {memberships.map((membership) => (
                        <WorkspaceCard
                            key={membership.workspaceId}
                            workspace={membership.workspace}
                            role={membership.role}
                        />
                    ))}

                    <CreateWorkspaceModal />
                </div>
            </main>
        </div>
    )
}
