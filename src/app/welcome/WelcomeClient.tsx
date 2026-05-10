'use client'

import { useState } from 'react'
import { Plus, Sparkles, LogOut } from 'lucide-react'
import CreateWorkspaceModal from '@/components/workspace/CreateWorkspaceModal'

interface Props {
    profileName: string
}

/**
 * Welcome screen — first-time profile experience.
 *
 * After user creates a new profile (which initially has 0 workspaces), they
 * land here instead of being kicked to /login. Click "+" → create their first
 * workspace → CreateWorkspaceModal already redirects to /{wsId}/admin since
 * creator becomes OWNER.
 */
export default function WelcomeClient({ profileName }: Props) {
    const [createOpen, setCreateOpen] = useState(false)

    return (
        <div className="min-h-dvh bg-zinc-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Ambient glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(800px 500px at 30% 20%, rgba(139,92,246,0.08), transparent 55%), ' +
                        'radial-gradient(600px 400px at 70% 80%, rgba(168,85,247,0.05), transparent 50%)',
                }}
            />

            <div className="relative z-10 max-w-md w-full">
                {/* Hero card */}
                <div className="rounded-3xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] p-8 shadow-2xl shadow-black/40 text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/20">
                        <Sparkles className="w-7 h-7 text-violet-300" strokeWidth={1.5} />
                    </div>

                    {/* Welcome text */}
                    <h1
                        className="text-2xl font-extrabold text-white mb-2 tracking-tight"
                        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                        Chào mừng đến với <span className="text-violet-400">{profileName}</span>!
                    </h1>
                    <p className="text-sm text-zinc-400 mb-8 leading-relaxed">
                        Profile mới của bạn chưa có workspace nào. Hãy tạo workspace đầu tiên
                        để bắt đầu quản lý task và mời thành viên nhé.
                    </p>

                    {/* Plus button with tooltip */}
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        title="Bấm vào đây để tạo workspace đầu tiên của bạn nhé!"
                        className="group relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 hover:from-violet-400 hover:to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-[0_8px_32px_rgba(139,92,246,0.45)] hover:shadow-[0_12px_40px_rgba(139,92,246,0.6)] transition-all duration-200 cursor-pointer"
                        aria-label="Create your first workspace"
                    >
                        <Plus className="w-9 h-9 text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
                        {/* Pulse ring */}
                        <span className="absolute inset-0 rounded-full border-2 border-violet-400/40 animate-ping" />
                    </button>

                    <p className="text-xs text-violet-300 font-medium">
                        Bấm vào đây để tạo workspace đầu tiên của bạn nhé!
                    </p>
                </div>

                {/* Sign-out option (escape hatch) */}
                <div className="mt-6 text-center">
                    <a
                        href="/api/auth/logout"
                        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <LogOut size={12} />
                        Đăng xuất
                    </a>
                </div>
            </div>

            {/* Create workspace modal — auto navigates to /{wsId}/admin on success */}
            <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    )
}
