import { ReactNode } from 'react'
import { FileText, CheckSquare, LogOut, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { logoutAction } from '@/actions/auth-actions'
import { redirect } from 'next/navigation'
import { getSession as getAuthSession } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import LanguageSwitcher from '@/components/portal/LanguageSwitcher'

export default async function WorkspaceLayout({
    children,
    params
}: {
    children: ReactNode;
    params: Promise<{ locale: string, workspaceId: string }>;
}) {
    const { locale, workspaceId } = await params;
    const session = await getAuthSession()
    if (!session || session.user.role !== 'CLIENT') {
        redirect('/login')
    }
    const t = await getTranslations('Sidebar')

    return (
        <div className="flex h-screen w-full bg-zinc-950 text-slate-200 overflow-hidden font-sans antialiased" style={{ colorScheme: 'dark' }}>
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-950/50 backdrop-blur-xl flex flex-col justify-between">
                <div className="p-6">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-8 h-8 rounded bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md leading-tight">Client Portal</h1>
                            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">{workspaceId}</p>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="space-y-1">
                        <SidebarLink locale={locale} workspaceId={workspaceId} href="/tasks" icon={<CheckSquare size={18} />} label={t('tasks')} />
                        <SidebarLink locale={locale} workspaceId={workspaceId} href="/invoices" icon={<FileText size={18} />} label={t('invoices')} />

                        <div className="pt-4 mt-4 border-t border-zinc-800/60">
                            <SidebarLink locale={locale} workspaceId={null as any} href="" icon={<LayoutGrid size={18} />} label={t('switch_workspace')} />
                        </div>
                    </nav>
                </div>

                {/* Bottom: Language + Logout */}
                <div className="p-4 border-t border-zinc-800/60 space-y-2">
                    {/* Language Switcher */}
                    <LanguageSwitcher currentLocale={locale} />

                    {/* Logout */}
                    <form action={logoutAction}>
                        <button
                            type="submit"
                            className="w-full flex items-center gap-3 hover:bg-zinc-900/50 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group text-left"
                        >
                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0">
                                <LogOut size={15} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-300 group-hover:text-white truncate">{t('logout')}</p>
                                <p className="text-xs text-zinc-600 truncate">{session.user.username}</p>
                            </div>
                        </button>
                    </form>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 relative overflow-y-auto bg-zinc-950">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 -z-10 pointer-events-none"></div>
                {children}
            </main>
        </div>
    );
}

function SidebarLink({ locale, workspaceId, href, icon, label }: { locale: string; workspaceId: string; href: string; icon: ReactNode; label: string }) {
    const fullHref = workspaceId ? `/portal/${locale}/${workspaceId}${href}` : `/portal/${locale}`;
    return (
        <Link
            href={fullHref}
            className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-zinc-400 rounded-lg hover:bg-zinc-800/50 hover:text-indigo-300 transition-all duration-300 hover:shadow-[inset_2px_0_0_rgba(99,102,241,1)]"
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
