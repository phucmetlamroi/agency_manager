import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Home, FileText, CheckSquare, Settings, LogOut } from 'lucide-react';
import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function PortalLayout({ children }: { children: ReactNode }) {
    // Normally components shouldn't be async if they use hooks, but in App Router server components can be async and use useTranslations.
    // Wait, in App Router, async Server Components CANNOT use hooks like `useTranslations` if it's a client hook? No, next-intl `useTranslations` works in Server Components if awaited or configured.
    // Wait, if it's a Server Layout, we should use `getTranslations` instead.

    const session = await getSession()
    if (!session || session.user.role !== 'CLIENT') {
        redirect('/login')
    }

    return (
        <div className="flex h-screen w-full bg-zinc-950 text-slate-200 overflow-hidden font-sans">
            {/* Sidebar - Frame.io aesthetic */}
            <aside className="w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl flex flex-col justify-between">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-8 h-8 rounded bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                        <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md">Client Portal</h1>
                    </div>

                    <nav className="space-y-2">
                        <SidebarLink href="/portal/invoices" icon={<FileText size={18} />} label="Hóa đơn" />
                        <SidebarLink href="/portal/tasks" icon={<CheckSquare size={18} />} label="Tác vụ" />
                    </nav>
                </div>

                <div className="p-6 border-t border-zinc-800/60">
                    <div className="flex items-center gap-3 hover:bg-zinc-900/50 p-2 rounded-lg cursor-pointer transition-colors group">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                            <LogOut size={16} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-300 group-hover:text-white">Đăng xuất</p>
                            <p className="text-xs text-zinc-500">{session.user.nickname}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative overflow-y-auto bg-zinc-950">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 -z-10 pointer-events-none"></div>
                {children}
            </main>
        </div>
    );
}

function SidebarLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-zinc-400 rounded-lg hover:bg-zinc-800/50 hover:text-indigo-300 transition-all duration-300 hover:shadow-[inset_2px_0_0_rgba(99,102,241,1)]"
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
