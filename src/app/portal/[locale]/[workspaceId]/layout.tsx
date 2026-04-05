import { ReactNode } from 'react'
import { FileText, CheckSquare, LogOut, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { logoutAction } from '@/actions/auth-actions'
import { redirect } from 'next/navigation'
import { getSession as getAuthSession } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'
import LanguageSwitcher from '@/components/portal/LanguageSwitcher'
import { isMobileDevice } from '@/lib/device'

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
    const isMobile = await isMobileDevice()
    const t = await getTranslations('Sidebar')

    return (
        <div className="flex h-screen w-full bg-zinc-950 text-slate-200 overflow-hidden font-sans antialiased flex-col md:flex-row" style={{ colorScheme: 'dark' }}>
            {/* Desktop Sidebar — Premium Glassmorphism */}
            <aside className="hidden md:flex w-64 flex-shrink-0 border-r border-white/[0.06] bg-zinc-950/70 backdrop-blur-2xl flex-col justify-between relative overflow-hidden">
                {/* Ambient glow */}
                <div className="absolute -top-20 -left-20 w-48 h-48 bg-indigo-500/[0.04] rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-violet-500/[0.03] rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-indigo-500/20 via-transparent to-violet-500/10 pointer-events-none" />

                <div className="relative p-6 z-10">
                    {/* Logo */}
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_20px_rgba(99,102,241,0.35)] flex items-center justify-center border border-indigo-400/20">
                            <span className="text-white font-bold text-sm tracking-tight">CP</span>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">Client Portal</h1>
                            <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.2em] mt-0.5">{workspaceId}</p>
                        </div>
                    </div>

                    {/* Section label */}
                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-3 px-3">Navigation</p>

                    {/* Navigation */}
                    <nav className="space-y-1">
                        <SidebarLink locale={locale} workspaceId={workspaceId} href="/tasks" icon={<CheckSquare size={17} />} label={t('tasks')} />
                        <SidebarLink locale={locale} workspaceId={workspaceId} href="/invoices" icon={<FileText size={17} />} label={t('invoices')} />

                        <div className="pt-4 mt-4 border-t border-white/[0.04]">
                            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-3 px-3">Workspace</p>
                            <SidebarLink locale={locale} workspaceId={null as any} href="" icon={<LayoutGrid size={17} />} label={t('switch_workspace')} />
                        </div>
                    </nav>
                </div>

                {/* Bottom: Language + User card */}
                <div className="relative z-10 p-4 border-t border-white/[0.04] space-y-2">
                    <LanguageSwitcher currentLocale={locale} />

                    {/* User card + Logout */}
                    <form action={logoutAction}>
                        <button
                            type="submit"
                            className="w-full flex items-center gap-3 bg-zinc-900/40 hover:bg-zinc-800/60 border border-white/[0.04] hover:border-white/[0.08] px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group text-left"
                        >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-300 transition-colors shrink-0 border border-white/[0.06] shadow-sm">
                                <LogOut size={14} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-300 group-hover:text-white truncate">{t('logout')}</p>
                                <p className="text-[10px] text-zinc-600 truncate">{session.user.username}</p>
                            </div>
                        </button>
                    </form>
                </div>
            </aside>

            {/* Mobile Header (Only on mobile) */}
            <header className="md:hidden flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20"></div>
                    <span className="font-bold text-white tracking-tight">Portal</span>
                </div>

                <div className="flex items-center gap-3">
                    <LanguageSwitcher currentLocale={locale} />
                    <form action={logoutAction}>
                        <button type="submit" className="text-zinc-500 hover:text-white transition-colors">
                            <LogOut size={18} />
                        </button>
                    </form>
                </div>
            </header>

            {/* Content Area */}
            <main className="flex-1 relative overflow-y-auto bg-zinc-950 custom-scrollbar">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 -z-10 pointer-events-none"></div>

                {/* Mobile Bottom Nav in Portal? 
                    Let's add a simple one for portal links.
                */}
                <div className="pb-20 md:pb-0">
                    {children}
                </div>

                {/* Mobile Bottom Nav — Frosted Glass */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/80 backdrop-blur-2xl border-t border-white/[0.06] flex items-center justify-around z-50 pb-[env(safe-area-inset-bottom)]">
                    <Link href={`/portal/${locale}/${workspaceId}/tasks`} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-white active:text-indigo-400 transition-colors group">
                        <CheckSquare size={19} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] uppercase font-bold tracking-wider">{t('tasks')}</span>
                    </Link>
                    <Link href={`/portal/${locale}/${workspaceId}/invoices`} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-white active:text-indigo-400 transition-colors group">
                        <FileText size={19} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] uppercase font-bold tracking-wider">{t('invoices')}</span>
                    </Link>
                    <Link href={`/portal/${locale}`} className="flex flex-col items-center gap-1 text-zinc-500 hover:text-white active:text-indigo-400 transition-colors group">
                        <LayoutGrid size={19} className="group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] uppercase font-bold tracking-wider">WS</span>
                    </Link>
                </div>
            </main>
        </div>
    );
}

function SidebarLink({ locale, workspaceId, href, icon, label }: { locale: string; workspaceId: string; href: string; icon: ReactNode; label: string }) {
    const fullHref = workspaceId ? `/portal/${locale}/${workspaceId}${href}` : `/portal/${locale}`;
    return (
        <Link
            href={fullHref}
            className="group/link flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-zinc-400 rounded-xl hover:bg-white/[0.04] hover:text-white transition-all duration-200 relative"
        >
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 group-hover/link:h-5 bg-indigo-500 rounded-full transition-all duration-200 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            <div className="w-8 h-8 rounded-lg bg-white/[0.03] group-hover/link:bg-indigo-500/10 border border-white/[0.04] group-hover/link:border-indigo-500/20 flex items-center justify-center transition-all duration-200 shrink-0">
                {icon}
            </div>
            <span className="group-hover/link:translate-x-0.5 transition-transform duration-200">{label}</span>
        </Link>
    );
}
